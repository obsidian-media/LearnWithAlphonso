import AVFoundation
import Foundation
import MediaPlayer
import LearnWithAlphonsoKit

/// Owns the one `AVPlayer` the podcast library uses.
///
/// Held once by RootView, above the view tree, so playback is unaffected by
/// any view appearing or disappearing. The web app had to work for this --
/// an `<audio>` element inside a route component unmounts on navigation --
/// and it is free here only because this is a reference type living above
/// the views. Do not move it into one.
///
/// **This file has no unit tests and cannot have any.** The app target has
/// no test coverage anywhere in this repo, there is no macOS or Xcode in
/// the development environment, and a simulator would not exercise the
/// interesting cases (a real phone call, real headphones, the lock screen).
/// CI's `xcodebuild` proves it compiles. Everything else here is verified
/// on a device or not at all -- see the spec's device checklist.
@Observable
@MainActor
final class PodcastAudioPlayer {
    private(set) var episode: PodcastEpisode?
    private(set) var isPlaying = false
    private(set) var elapsedSeconds: Double = 0
    private(set) var failed = false

    /// Set once a save has been rejected for auth. Further saves are
    /// pointless until the app gets a fresh token, and pretending they
    /// landed is how resume silently stops working.
    private(set) var savesDisabled = false

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var lastSavedSeconds: Double = 0
    private var listenedSeconds: Double = 0
    private var lastTick: Double?
    /// The playback row's `updated_at` as last read or written. Sent back
    /// with each save for optimistic concurrency.
    private var lastSeenUpdatedAt: String?
    /// Decided at interruption-began, not at -ended: a recorder's stop()
    /// deactivates the session and is what makes iOS send .shouldResume,
    /// so reading the flag at -ended would race with it.
    private var pausedByRecording = false

    /// Builds a client on demand. Set by RootView once a session exists.
    ///
    /// Rebuilt per call rather than held, because `PodcastClient` keeps the
    /// access token it was given and cannot refresh one -- a player that
    /// cached a client would keep using a token long after it expired.
    var makeClient: (@MainActor () -> PodcastClient?)?

    init() {
        observeSessionNotifications()
        configureRemoteCommands()
    }

    // MARK: - Playback

    func play(_ episode: PodcastEpisode) {
        if self.episode?.id != episode.id {
            teardownObserver()
            self.episode = episode
            lastSeenUpdatedAt = episode.playbackUpdatedAt
            lastSavedSeconds = 0
            listenedSeconds = 0
            lastTick = nil
            elapsedSeconds = Double(episode.positionSeconds)
            failed = false

            let item = AVPlayerItem(url: episode.audioURL)
            let player = AVPlayer(playerItem: item)
            self.player = player
            observeTime(on: player)
            seekToStoredPosition(on: player, item: item, stored: Double(episode.positionSeconds))
        }
        activateSession()
        player?.play()
        isPlaying = true
        updateNowPlaying()
    }

    func toggle() {
        guard let player else { return }
        if isPlaying {
            player.pause()
            isPlaying = false
            save(position: player.currentTime().seconds, completed: false)
        } else {
            activateSession()
            player.play()
            isPlaying = true
        }
        updateNowPlaying()
    }

    func close() {
        if let player { save(position: player.currentTime().seconds, completed: false) }
        flushPlayEvent()
        teardownObserver()
        player?.pause()
        player = nil
        episode = nil
        isPlaying = false
        elapsedSeconds = 0
        failed = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    /// Called when the app backgrounds, so a position is not lost to a
    /// process the system may never bring back.
    func applicationDidBackground() {
        guard let player else { return }
        save(position: player.currentTime().seconds, completed: false)
    }

    // MARK: - Session

    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            // .playback is what keeps audio going with the screen locked.
            // The mic screens set .playAndRecord for their own work; this
            // player does not try to share a session with them.
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
        } catch {
            failed = true
        }
    }

    private func observeSessionNotifications() {
        let center = NotificationCenter.default

        center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            MainActor.assumeIsolated { self?.handleInterruption(notification) }
        }

        center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] notification in
            MainActor.assumeIsolated { self?.handleRouteChange(notification) }
        }
    }

    private func handleInterruption(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }

        switch type {
        case .began:
            // Record *why* now, while RecordingState is reliable.
            pausedByRecording = RecordingState.shared.isRecording
            player?.pause()
            isPlaying = false
        case .ended:
            let options = (notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
                .map(AVAudioSession.InterruptionOptions.init(rawValue:)) ?? []
            // Honour .shouldResume for a call, an alarm or Siri -- never
            // resuming makes a podcast silently die after a phone call.
            // Suppress it when our own mic screens caused this: resuming
            // over someone mid-speaking-exercise is the failure to avoid.
            if options.contains(.shouldResume) && !pausedByRecording {
                activateSession()
                player?.play()
                isPlaying = true
            }
            pausedByRecording = false
        @unknown default:
            break
        }
        updateNowPlaying()
    }

    private func handleRouteChange(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
        // Headphones pulled: pause rather than continuing out loud from the
        // speaker, which is the behaviour every other audio app has trained
        // people to expect.
        if reason == .oldDeviceUnavailable {
            player?.pause()
            isPlaying = false
            updateNowPlaying()
        }
    }

    // MARK: - Now Playing

    private func configureRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.episode != nil, !self.isPlaying else { return .commandFailed }
                self.toggle()
                return .success
            }
        }
        center.pauseCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.isPlaying else { return .commandFailed }
                self.toggle()
                return .success
            }
        }
        center.skipForwardCommand.preferredIntervals = [15]
        center.skipForwardCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated { self?.skip(by: 15) ?? .commandFailed }
        }
        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated { self?.skip(by: -15) ?? .commandFailed }
        }
    }

    private func skip(by seconds: Double) -> MPRemoteCommandHandlerStatus {
        guard let player, let episode else { return .commandFailed }
        let target = max(0, min(player.currentTime().seconds + seconds, Double(episode.durationSeconds)))
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600))
        elapsedSeconds = target
        updateNowPlaying()
        return .success
    }

    private func updateNowPlaying() {
        guard let episode else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: episode.title,
            MPMediaItemPropertyPlaybackDuration: Double(episode.durationSeconds),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsedSeconds,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
        if let description = episode.description {
            info[MPMediaItemPropertyArtist] = description
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    // MARK: - Time, resume and saves

    private func seekToStoredPosition(on player: AVPlayer, item: AVPlayerItem, stored: Double) {
        guard stored > 0 else { return }
        Task { @MainActor in
            // Clamp against the MEDIA's duration, not the stored
            // duration_seconds. The row and the file can disagree -- a
            // replaced object, or a multi-chunk TTS episode whose measured
            // duration was wrong, which the chunk-join probe has not yet
            // ruled out -- and the media is the only length seekable here.
            let duration = (try? await item.asset.load(.duration))?.seconds
            let limit = (duration?.isFinite == true && duration! > 0)
                ? duration!
                : Double(self.episode?.durationSeconds ?? 0)
            let target = PodcastPlayback.clampPosition(stored, durationSeconds: limit)
            guard target > 0 else { return }
            // Completion-handler overload on purpose: inside an async
            // context the bare `seek(to:)` resolves to the async variant and
            // has to be awaited, which reads as if the seek needs to finish
            // before anything else can happen. It does not.
            player.seek(to: CMTime(seconds: target, preferredTimescale: 600)) { _ in }
            self.elapsedSeconds = target
        }
    }

    private func observeTime(on player: AVPlayer) {
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 1, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            MainActor.assumeIsolated { self?.tick(at: time.seconds) }
        }

        NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: player.currentItem,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.finish() }
        }
    }

    private func tick(at seconds: Double) {
        guard seconds.isFinite else { return }
        elapsedSeconds = seconds

        // Real listening time, ignoring jumps from seeking.
        if let previous = lastTick {
            let delta = seconds - previous
            if delta > 0 && delta < 2 { listenedSeconds += delta }
        }
        lastTick = seconds

        // abs(), not a bare subtraction: after a backward skip the
        // difference stays negative until playback climbs past the old
        // mark, which would silently stop saving for minutes.
        if abs(seconds - lastSavedSeconds) >= 10 {
            lastSavedSeconds = seconds
            save(position: seconds, completed: false)
        }
    }

    private func finish() {
        isPlaying = false
        elapsedSeconds = 0
        save(position: 0, completed: true)
        flushPlayEvent()
        updateNowPlaying()
    }

    private func save(position: Double, completed: Bool) {
        guard !savesDisabled, position.isFinite, let episode, let client = makeClient?() else { return }
        let seen = lastSeenUpdatedAt
        Task { @MainActor in
            do {
                try await client.savePlaybackPosition(
                    episodeID: episode.id,
                    positionSeconds: Int(position.rounded()),
                    completed: completed,
                    lastSeenUpdatedAt: seen
                )
                // Our write is now the latest observation.
                self.lastSeenUpdatedAt = ISO8601DateFormatter().string(from: Date())
            } catch PodcastClientError.staleWrite {
                // Another device wrote since we read. Ours is based on a
                // stale observation, so drop it rather than retrying -- the
                // next listing re-reads the fresher value.
                self.lastSeenUpdatedAt = nil
            } catch PodcastClientError.unauthorized {
                // Stop firing calls that cannot succeed. A swallowed 401 is
                // how resume silently stops working for a whole session.
                self.savesDisabled = true
            } catch {
                // Best-effort, same posture as the app's theme hydration: a
                // failed save leaves the last known position alone.
            }
        }
    }

    private func flushPlayEvent() {
        let listened = Int(listenedSeconds.rounded())
        listenedSeconds = 0
        guard listened > 0, let episode, let client = makeClient?() else { return }
        Task {
            // Through the RPC inside PodcastClient -- the table grants no
            // direct INSERT to authenticated.
            try? await client.recordPlayEvent(episodeID: episode.id, secondsListened: listened)
        }
    }

    private func teardownObserver() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
    }
}
