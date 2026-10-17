jest.mock('../src/lib/api', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}))

import { apiGet } from '../src/lib/api'
import { waitForRenderJob, type RenderJob } from '../src/api/renderJobs'

const job = (status: RenderJob['status'], outputUrl: string | null = null): RenderJob => ({
  id: 'job-1',
  designId: 'd-1',
  exportFormat: 'PNG_HD',
  status,
  outputUploadId: outputUrl ? 'u-1' : null,
  outputUrl,
  errorMessage: null,
})

describe('waitForRenderJob', () => {
  const sleep = jest.fn(async () => undefined)

  afterEach(() => jest.clearAllMocks())

  it('returns a finished job at once', async () => {
    expect(await waitForRenderJob(job('SUCCEEDED', '/uploads/u-1/content'), { sleep })).toMatchObject({ status: 'SUCCEEDED' })
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('polls a running HD export until it is done', async () => {
    ;(apiGet as jest.Mock)
      .mockResolvedValueOnce(job('RUNNING'))
      .mockResolvedValueOnce(job('SUCCEEDED', '/uploads/u-1/content'))
    const done = await waitForRenderJob(job('RUNNING'), { sleep, pollMs: 10 })
    expect(done.outputUrl).toBe('/uploads/u-1/content')
    expect(apiGet).toHaveBeenCalledTimes(2)
    expect((apiGet as jest.Mock).mock.calls[0][0]).toBe('/render-jobs/job-1')
  })

  it('gives up after the limit and returns the last state', async () => {
    ;(apiGet as jest.Mock).mockResolvedValue(job('RUNNING'))
    const last = await waitForRenderJob(job('QUEUED'), { sleep, pollMs: 10, limitMs: 30 })
    expect(last.status).toBe('RUNNING')
    expect(apiGet).toHaveBeenCalledTimes(3)
  })
})
