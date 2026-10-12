/** Thin wrapper around the native audio module for voice notes. */
import AudioRecorderPlayer from 'react-native-audio-recorder-player'

const player = new AudioRecorderPlayer()

export function formatVoiceDuration(totalMs: number): string {
  const totalSec = Math.max(0, Math.floor(totalMs / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${seconds < 10 ? `0${seconds}` : seconds}`
}

export async function startVoiceRecording(): Promise<void> {
  await player.startRecorder()
}

export type VoiceRecording = {
  uri: string
}

/** Stops recording; resolves with the recorded file uri. */
export async function stopVoiceRecording(): Promise<VoiceRecording> {
  const uri: string = await player.stopRecorder()
  player.removeRecordBackListener()
  return { uri }
}

export async function cancelVoiceRecording(): Promise<void> {
  try {
    await player.stopRecorder()
  } catch {
    // Nothing was recording — safe to ignore.
  }
  player.removeRecordBackListener()
}

export function onRecordingProgress(listener: (elapsedMs: number) => void): void {
  player.addRecordBackListener((e) => {
    listener(e.currentPosition)
  })
}

export async function playVoiceNote(uri: string): Promise<void> {
  await player.stopPlayer()
  player.removePlayBackListener()
  await player.startPlayer(uri)
}

export async function stopVoicePlayback(): Promise<void> {
  try {
    await player.stopPlayer()
  } catch {
    // Nothing playing — safe to ignore.
  }
  player.removePlayBackListener()
}

export function onPlaybackProgress(
  listener: (positionMs: number, durationMs: number) => void,
  onEnd?: () => void,
): void {
  player.addPlayBackListener((e) => {
    listener(e.currentPosition, e.duration)
    if (e.currentPosition >= e.duration && e.duration > 0) {
      onEnd?.()
    }
  })
}
