/**
 * AI generations the studio stopped waiting for. The server does not attach a generated model to
 * the design (the studio does, by saving it into the design parameters), so a generation that
 * outlives the studio's wait, or whose polling failed, is remembered per design and attached on
 * the next visit instead of being lost (and paid for again from the daily quota).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getAiJob, type AiGenerationJob } from '@/src/api/ai'
import { ApiError } from '@/src/lib/api'

const keyFor = (designId: string) => `@malinvosky/pending-ai-job/${designId}`

export async function rememberPendingAiJob(designId: string, jobId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(designId), jobId)
  } catch {
    // Best effort: without it the result is only lost if the studio stops waiting.
  }
}

/**
 * That generation's result was saved into the design (or can no longer be). Only that one is
 * forgotten: a newer generation started meanwhile stays pending.
 */
export async function attachedAiJob(designId: string, jobId: string): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(keyFor(designId))) === jobId) {
      await AsyncStorage.removeItem(keyFor(designId))
    }
  } catch {
    // ignore
  }
}

/**
 * The pending generation of this design, once it succeeded; null while it runs, when there is
 * none, or when it cannot be used. It stays pending until `attachedAiJob` (a failed save retries
 * on the next visit); a failed, missing or foreign job is forgotten; a network error keeps it.
 */
export async function takeFinishedAiJob(
  designId: string,
  fetchJob: (id: string) => Promise<AiGenerationJob> = getAiJob,
): Promise<AiGenerationJob | null> {
  let jobId: string | null
  try {
    jobId = await AsyncStorage.getItem(keyFor(designId))
  } catch {
    return null
  }
  if (!jobId) return null
  let job: AiGenerationJob
  try {
    job = await fetchJob(jobId)
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      await attachedAiJob(designId, jobId)
    }
    return null
  }
  if (job.status === 'QUEUED' || job.status === 'RUNNING') return null
  if (job.status === 'SUCCEEDED' && job.outputUploadId) return job
  await attachedAiJob(designId, jobId)
  return null
}
