import AVFoundation
import Foundation
import MediaPlayer
import LearnWithAlphonsoKit

/// Lets the SessionLifecycle handler (registered in LearnWithAlphonsoApp) stop the player
/// without owning it. RootView sets this with the one player it keeps, next to the voice
/// engine's pause hook, and not from the player's init: RootView's state initializer can
/// build throwaway players that must not claim a hook and then disappear.
@MainActor
enum PodcastLifecycleHooks {
    static var stopPlayback: (@MainActor () -> Void)?
}

/// Owns the one `AVPlayer` the podcast library uses.
///
/// Held once by RootView, above the view tree, so playback is unaffected by any view
/// appearing or disappearing. Do not move it into one.
///
/// Every rule about what the learner sees (playing, buffering, failed, finished) lives in
/// the Kit's `PodcastPlayerMachine`, which is unit-tested. This file only turns AVPlayer's
/// signals into machine events and performs the effects the machine returns. "Playing" is
/// shown only after AVPlayer confirms `timeControlStatus == .playing`, so a 404 or an
/// offline stream can never look like it is playing.
///
/// The app target itself has no unit tests; CI's `ios-app-build` proves this compiles and
/// the device checklist covers the rest (a real call, real headphones, the lock screen).
@Observable
@MainActor
final class PodcastAudioPlayer {
    private(set) var episode: PodcastEpisode?
    private(set) var elapsedSeconds: Double = 0
    private(set) var machine = PodcastPlayerMachine()

    /// The ordered list `play(_:localURL:queue:isOnline:)` was most recently called with.
    /// Deliberately just data: PodcastMiniBar resolves the next episode's local URL.
    private(set) var queue: [PodcastEpisode] = []

    var isPlaying: Bool { machine.isAudible }
    var control: PodcastPlayerControl { machine.control }
    var failureMessage: String? { machine.failure.map(PodcastPlaybackCopy.message(for:)) }

    var nextEpisode: PodcastEpisode? {
        guard let episode, let idx = queue.firstIndex(where: { $0.id == episode.id }),
              queue.indices.contains(idx + 1) else { return nil }
        return queue[idx + 1]
    }

    /// Builds a client on demand. Set by RootView once a session exists. Rebuilt per call
    /// because PodcastClient cannot refresh the token it was given.
    var makeClient: (@MainActor () -> PodcastClient?)?

    private var saveGate = PodcastSaveGate()
    /// The last position this device stored per episode, so a stale list row never wins (PodcastSavedPositions).
    private var savedPositions = PodcastSavedPositions()

    /// The episode as the learner should see it: with the position this device last stored, if newer.
    func resumed(_ episode: PodcastEpisode) -> PodcastEpisode { savedPositions.applying(to: episode) }
    /// Saves run one after another, so each one guards on what the previous one stored.
    private var saveTask: Task<Void, Never>?

    private var player: AVPlayer?
    private var currentItem: AVPlayerItem?
    private var currentSourceURL: URL?
    private var currentSourceIsLocal = false
    private var keyValueObservations: [NSKeyValueObservation] = []
    private var itemNotificationTokens: [NSObjectProtocol] = []
    private var timeObserver: Any?
    private var lastSavedSeconds: Double = 0
    private var listenedSeconds: Double = 0
    private var lastTick: Double?
    /// Decided at interruption-began: our own mic screens caused it, so never resume.
    private var pausedByRecording = false

    init() {
        observeSessionNotifications()
        configureRemoteCommands()
    }

    // MARK: - Commands

    /// Plays an episode, preferring a downloaded copy. `isOnline` is a fast path: a stream
    /// that cannot load fails at once with "Download this episode to listen offline"
    /// instead of waiting for AVPlayer's own error (which says the same, later).
    func play(_ episode: PodcastEpisode, localURL: URL? = nil, queue: [PodcastEpisode] = [], isOnline: Bool = true) {
        // The list's copy can predate a listen made since it loaded: start from what this device last stored.
        let listed = episode
        let episode = savedPositions.applying(to: listed)
        // Playback starts from this snapshot, so its stamp is part of this device's own history.
        savedPositions.noteSeen(listed)
        if !queue.isEmpty { self.queue = queue }
        saveGate.userStartedPlayback()

        if self.episode?.id == episode.id, player != nil {
            switch machine.phase {
            case .paused, .finished:
                handle(.togglePressed)
                return
            case .loading, .playing, .buffering:
                return
            case .idle, .failed:
                break
            }
        } else if self.episode?.id != episode.id {
            flushPlayEvent()
            self.episode = episode
            saveGate.beginEpisode(lastSeenUpdatedAt: episode.playbackUpdatedAt)
            lastSavedSeconds = 0
            listenedSeconds = 0
            lastTick = nil
            elapsedSeconds = Double(episode.positionSeconds)
        }

        teardownItem()
        currentSourceURL = localURL ?? episode.audioURL
        currentSourceIsLocal = localURL != nil
        handle(.start(isRemote: localURL == nil, isOnline: isOnline))
    }

    /// The error banner's Retry. The caller resolves the download again: the learner may
    /// have downloaded the episode since it failed.
    func retry(localURL: URL?, isOnline: Bool = true) {
        guard let episode else { return }
        play(episode, localURL: localURL, isOnline: isOnline)
    }

    func toggle() {
        guard episode != nil else { return }
        if !machine.isActive { saveGate.userStartedPlayback() }
        handle(.togglePressed)
    }

    func close() {
        if let player { save(position: player.currentTime().seconds, completed: false) }
        flushPlayEvent()
        teardownItem()
        episode = nil
        elapsedSeconds = 0
        currentSourceURL = nil
        _ = machine.send(.closed)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    /// The learner started speaking. RootView registers this as the voice engine's pause
    /// hook for the one player it keeps (not here: see PodcastLifecycleHooks). Never
    /// auto-resumes: resuming a podcast over a speaking exercise is exactly what
    /// RecordingState exists to prevent. The learner resumes from the mini bar.
    func pauseForVoice() {
        guard machine.isActive else { return }
        pausedByRecording = false
        handle(.pausedExternally(resumable: false))
    }

    /// Sign-out or account deletion (SessionLifecycle, via PodcastLifecycleHooks). The next
    /// account on this device must not hear, see on the lock screen, or resume the previous
    /// account's episode. No final save: the session's token is already gone, and the
    /// position is at most 10 seconds behind.
    func stopForAccountChange() {
        teardownItem()
        saveTask?.cancel()
        saveTask = nil
        // Not a fresh PodcastSaveGate(): the epoch must keep counting so a save already
        // chained from the previous account is refused by `accepts`.
        saveGate.resetForAccountChange()
        savedPositions.reset()
        episode = nil
        queue = []
        elapsedSeconds = 0
        listenedSeconds = 0
        lastSavedSeconds = 0
        lastTick = nil
        currentSourceURL = nil
        pausedByRecording = false
        _ = machine.send(.closed)
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Called when the app backgrounds, so a position is not lost to a process the system
    /// may never bring back.
    func applicationDidBackground() {
        guard let player else { return }
        save(position: player.currentTime().seconds, completed: false)
    }

    // MARK: - Machine

    private func handle(_ event: PodcastPlayerEvent) {
        apply(machine.send(event))
    }

    private func apply(_ effects: [PodcastPlayerEffect]) {
        for effect in effects {
            switch effect {
            case .loadItem:
                createItem()
            case .play:
                guard activateSession() else {
                    apply(machine.send(.itemFailed(.unplayable)))
                    return
                }
                player?.play()
            case .pause:
                player?.pause()
            case .seekToStart:
                player?.seek(to: .zero) { _ in }
                elapsedSeconds = 0
                lastSavedSeconds = 0
                lastTick = nil
            case .savePosition:
                if let player { save(position: player.currentTime().seconds, completed: false) }
            case .saveCompletion:
                save(position: 0, completed: true)
            case .flushPlayEvent:
                flushPlayEvent()
            case let .scheduleStallTimeout(generation):
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: PodcastPlayerMachine.stallTimeoutSeconds * 1_000_000_000)
                    self?.handle(.stallTimedOut(generation: generation))
                }
            case let .scheduleLoadTimeout(generation):
                Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: PodcastPlayerMachine.loadTimeoutSeconds * 1_000_000_000)
                    self?.handle(.loadTimedOut(generation: generation))
                }
            }
        }
        updateNowPlaying()
    }

    // MARK: - Item and observation

    private func createItem() {
        guard let url = currentSourceURL else { return }
        teardownItem()
        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        self.player = player
        currentItem = item
        observe(item: item, player: player)
        observeTime(on: player)
        seekToStoredPosition(on: player, item: item, stored: elapsedSeconds)
    }

    private func observe(item: AVPlayerItem, player: AVPlayer) {
        let itemID = ObjectIdentifier(item)
        // KVO fires on whichever thread changed the value, so hop to the main actor.
        // The value is read here and passed on; the item itself never crosses.
        keyValueObservations = [
            item.observe(\.status, options: [.new]) { [weak self] observed, _ in
                guard let self else { return }
                let status = observed.status
                Task { @MainActor [weak self] in self?.itemStatusChanged(status, itemID: itemID) }
            },
            player.observe(\.timeControlStatus, options: [.new]) { [weak self] observed, _ in
                guard let self else { return }
                let status = observed.timeControlStatus
                Task { @MainActor [weak self] in self?.timeControlChanged(status, itemID: itemID) }
            },
        ]

        let center = NotificationCenter.default
        itemNotificationTokens = [
            center.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.handle(.didPlayToEnd) }
            },
            center.addObserver(forName: AVPlayerItem.failedToPlayToEndTimeNotification, object: item, queue: .main) { [weak self] notification in
                let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
                MainActor.assumeIsolated { self?.itemFailed(error) }
            },
            center.addObserver(forName: AVPlayerItem.playbackStalledNotification, object: item, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.handle(.stalled) }
            },
        ]
    }

    private func isCurrent(_ itemID: ObjectIdentifier) -> Bool {
        currentItem.map(ObjectIdentifier.init) == itemID
    }

    private func itemStatusChanged(_ status: AVPlayerItem.Status, itemID: ObjectIdentifier) {
        guard isCurrent(itemID) else { return }
        switch status {
        case .readyToPlay:
            handle(.itemReady)
        case .failed:
            itemFailed(currentItem?.error)
        default:
            break
        }
    }

    private func timeControlChanged(_ status: AVPlayer.TimeControlStatus, itemID: ObjectIdentifier) {
        guard isCurrent(itemID) else { return }
        switch status {
        case .playing:
            handle(.timeControlPlaying)
        case .waitingToPlayAtSpecifiedRate:
            // The machine only treats this as a stall when it was playing.
            handle(.stalled)
        default:
            break
        }
    }

    /// Shows a first classification at once, then refines it with a HEAD request against
    /// the URL (a stream's own error rarely says 404 plainly; Supabase says 400).
    private func itemFailed(_ error: Error?) {
        let chain = PodcastErrorCode.chain(from: error)
        let isLocal = currentSourceIsLocal
        handle(.itemFailed(PodcastPlaybackFailure.classify(chain: chain, probe: .notRun, isLocalFile: isLocal)))
        guard !isLocal, let url = currentSourceURL, let item = currentItem else { return }
        let itemID = ObjectIdentifier(item)
        Task { @MainActor [weak self] in
            let probe = await Self.probe(url)
            guard let self, self.isCurrent(itemID), self.machine.failure != nil else { return }
            self.handle(.itemFailed(PodcastPlaybackFailure.classify(chain: chain, probe: probe, isLocalFile: false)))
        }
    }

    private nonisolated static func probe(_ url: URL) async -> PodcastProbeResult {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 10)
        request.httpMethod = "HEAD"
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .noResponse }
            return .status(http.statusCode)
        } catch {
            return .noResponse
        }
    }

    private func teardownItem() {
        if let timeObserver, let player { player.removeTimeObserver(timeObserver) }
        timeObserver = nil
        keyValueObservations.forEach { $0.invalidate() }
        keyValueObservations = []
        itemNotificationTokens.forEach { NotificationCenter.default.removeObserver($0) }
        itemNotificationTokens = []
        player?.pause()
        player = nil
        currentItem = nil
    }

    // MARK: - Session

    @discardableResult
    private func activateSession() -> Bool {
        let session = AVAudioSession.sharedInstance()
        do {
            // .playback keeps audio going with the screen locked.
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
            return true
        } catch {
            return false
        }
    }

    private func observeSessionNotifications() {
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance(), queue: .main) { [weak self] notification in
            MainActor.assumeIsolated { self?.handleInterruption(notification) }
        }
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: AVAudioSession.sharedInstance(), queue: .main) { [weak self] notification in
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
            handle(.pausedExternally(resumable: !pausedByRecording))
        case .ended:
            let options = (notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
                .map(AVAudioSession.InterruptionOptions.init(rawValue:)) ?? []
            // Honour .shouldResume for a call, an alarm or Siri, but only if the
            // interruption is what paused us and our own mic did not cause it.
            handle(.interruptionEnded(shouldResume: options.contains(.shouldResume) && !pausedByRecording))
            pausedByRecording = false
        @unknown default:
            break
        }
    }

    private func handleRouteChange(_ notification: Notification) {
        guard let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
        // Headphones pulled: pause rather than continuing out loud from the speaker.
        if reason == .oldDeviceUnavailable {
            handle(.pausedExternally(resumable: false))
        }
    }

    // MARK: - Now Playing

    private func configureRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.episode != nil, self.machine.control == .play else { return .commandFailed }
                self.toggle()
                return .success
            }
        }
        center.pauseCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.machine.isActive else { return .commandFailed }
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
        guard let episode, machine.phase != .idle else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: episode.title,
            MPMediaItemPropertyPlaybackDuration: Double(episode.durationSeconds),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsedSeconds,
            MPNowPlayingInfoPropertyPlaybackRate: machine.isAudible ? 1.0 : 0.0,
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
            // Clamp against the MEDIA's duration, not the stored duration_seconds: the row
            // and the file can disagree, and the media is the only length seekable here.
            let duration = (try? await item.asset.load(.duration))?.seconds
            let limit = (duration?.isFinite == true && duration! > 0)
                ? duration!
                : Double(self.episode?.durationSeconds ?? 0)
            let target = PodcastPlayback.clampPosition(stored, durationSeconds: limit)
            guard target > 0 else { return }
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
    }

    private func tick(at seconds: Double) {
        guard seconds.isFinite, machine.phase != .finished else { return }
        elapsedSeconds = seconds
        if let previous = lastTick {
            let delta = seconds - previous
            if delta > 0 && delta < 2 { listenedSeconds += delta }
        }
        lastTick = seconds
        // abs(): after a backward skip a bare subtraction stays negative for minutes.
        if abs(seconds - lastSavedSeconds) >= 10 {
            lastSavedSeconds = seconds
            save(position: seconds, completed: false)
        }
    }

    /// Chained: each save starts after the previous one finished and reads the gate then,
    /// so it guards on what the previous save stored.
    private func save(position: Double, completed: Bool) {
        guard saveGate.canSave, position.isFinite, let episode, let client = makeClient?() else { return }
        let episodeID = episode.id
        let seconds = Int(position.rounded())
        let epoch = saveGate.epoch
        let previous = saveTask
        saveTask = Task { @MainActor [weak self] in
            await previous?.value
            guard let self, !Task.isCancelled, self.saveGate.accepts(epoch), self.saveGate.canSave else { return }
            let isCurrentEpisode = self.episode?.id == episodeID
            // A save for an episode we have since left has no known observation: upsert it.
            let seen = isCurrentEpisode ? self.saveGate.lastSeenUpdatedAt : nil
            do {
                let stored = try await client.savePlaybackPosition(
                    episodeID: episodeID,
                    positionSeconds: seconds,
                    completed: completed,
                    lastSeenUpdatedAt: seen
                )
                if self.saveGate.accepts(epoch) {
                    self.savedPositions.record(episodeID: episodeID, position: completed ? 0 : seconds, updatedAt: stored)
                }
                guard !Task.isCancelled, self.saveGate.accepts(epoch), self.episode?.id == episodeID else { return }
                self.saveGate.recordSaved(updatedAt: stored)
            } catch PodcastClientError.staleWrite {
                if !Task.isCancelled, self.saveGate.accepts(epoch), self.episode?.id == episodeID { self.saveGate.recordStale() }
            } catch PodcastClientError.unauthorized {
                if !Task.isCancelled, self.saveGate.accepts(epoch) { self.saveGate.recordUnauthorized() }
            } catch {
                // Best effort: a failed save leaves the last known position alone.
            }
        }
    }

    private func flushPlayEvent() {
        let listened = Int(listenedSeconds.rounded())
        listenedSeconds = 0
        guard listened > 0, let episode, let client = makeClient?() else { return }
        Task {
            // Through the RPC inside PodcastClient: the table grants no direct INSERT.
            try? await client.recordPlayEvent(episodeID: episode.id, secondsListened: listened)
        }
    }
}
