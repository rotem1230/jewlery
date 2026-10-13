import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AiGenerationJob } from '../src/api/ai'
import { ApiError } from '../src/lib/api'
import { attachedAiJob, rememberPendingAiJob, takeFinishedAiJob } from '../src/lib/pendingAiJobs'

function job(status: AiGenerationJob['status'], outputUploadId: string | null = null): AiGenerationJob {
  return { id: 'job-1', designId: 'design-1', prompt: 'p', status, outputUploadId, errorMessage: null }
}

describe('AI generations the studio stopped waiting for', () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  it('nothing pending: nothing to fetch', async () => {
    const fetchJob = jest.fn()
    expect(await takeFinishedAiJob('design-1', fetchJob)).toBeNull()
    expect(fetchJob).not.toHaveBeenCalled()
  })

  it('a generation that finished meanwhile is handed back on the next visit, until it is attached', async () => {
    await rememberPendingAiJob('design-1', 'job-1')
    const fetchJob = jest.fn(async () => job('SUCCEEDED', 'model-1'))
    expect((await takeFinishedAiJob('design-1', fetchJob))?.outputUploadId).toBe('model-1')
    expect(fetchJob).toHaveBeenCalledWith('job-1')
    // Not attached yet (e.g. the save failed): offered again next time.
    expect((await takeFinishedAiJob('design-1', fetchJob))?.outputUploadId).toBe('model-1')

    await attachedAiJob('design-1', 'job-1')
    expect(await takeFinishedAiJob('design-1', fetchJob)).toBeNull()
  })

  it('attaching an older generation does not forget a newer one started meanwhile', async () => {
    await rememberPendingAiJob('design-1', 'job-1')
    await rememberPendingAiJob('design-1', 'job-2')
    await attachedAiJob('design-1', 'job-1')
    const fetchJob = jest.fn(async (id: string) => ({ ...job('SUCCEEDED', `model-of-${id}`), id }))
    expect((await takeFinishedAiJob('design-1', fetchJob))?.id).toBe('job-2')
  })

  it('a generation still running stays pending; a failed one is forgotten', async () => {
    await rememberPendingAiJob('design-1', 'job-1')
    expect(await takeFinishedAiJob('design-1', async () => job('RUNNING'))).toBeNull()
    const failed = jest.fn(async () => job('FAILED'))
    expect(await takeFinishedAiJob('design-1', failed)).toBeNull()
    expect(await takeFinishedAiJob('design-1', failed)).toBeNull()
    expect(failed).toHaveBeenCalledTimes(1)
  })

  it('a network failure keeps it for later; a job that is gone or not ours is forgotten', async () => {
    await rememberPendingAiJob('design-1', 'job-1')
    expect(await takeFinishedAiJob('design-1', async () => Promise.reject(new ApiError(0, '/ai/jobs/job-1', 'offline')))).toBeNull()
    const gone = jest.fn(async () => Promise.reject(new ApiError(404, '/ai/jobs/job-1', '')))
    expect(await takeFinishedAiJob('design-1', gone)).toBeNull()
    expect(gone).toHaveBeenCalledTimes(1)
    expect(await takeFinishedAiJob('design-1', gone)).toBeNull()
    expect(gone).toHaveBeenCalledTimes(1)
  })

  it('keeps one pending generation per design', async () => {
    await rememberPendingAiJob('design-1', 'job-1')
    await rememberPendingAiJob('design-2', 'job-2')
    const fetchJob = jest.fn(async (id: string) => ({ ...job('SUCCEEDED', `model-of-${id}`), id }))
    expect((await takeFinishedAiJob('design-2', fetchJob))?.outputUploadId).toBe('model-of-job-2')
    expect((await takeFinishedAiJob('design-1', fetchJob))?.outputUploadId).toBe('model-of-job-1')
  })
})
