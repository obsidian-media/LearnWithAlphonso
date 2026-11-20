/**
 * How long one tap-to-record turn with Hector may run before it is stopped and sent. A held button was bounded by the
 * finger; a tapped one is not, so a forgotten tap must not leave the microphone open. Mirrored on iOS
 * (HectorRecordingCap.swift) and Android (core/logic/HectorRecordingCap.kt); hector-recording-cap.test.ts keeps the
 * three equal.
 */
export const HECTOR_RECORDING_CAP_SECONDS = 60;
export const HECTOR_RECORDING_CAP_MS = HECTOR_RECORDING_CAP_SECONDS * 1000;
