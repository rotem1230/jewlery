jest.mock('../src/lib/api', () => ({
  API_BASE_URL: 'https://api.example/api/v1',
  apiGet: jest.fn(),
  apiPost: jest.fn(async () => ({ id: 'job-1', status: 'SUCCEEDED' })),
}))
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(async () => ({ assets: [{ uri: 'content://photo/1', type: 'image/jpeg', fileName: 'p.jpg' }] })),
  launchCamera: jest.fn(),
}))

import { launchImageLibrary } from 'react-native-image-picker'
import { apiPost } from '../src/lib/api'
import { createRenderJob } from '../src/api/renderJobs'
import { createVisualizationJob } from '../src/api/visualization'
import { TRY_ON_PHOTO_SIDE, pickTryOnPhoto } from '../src/lib/chatAttachments'

describe('export and try-on requests (review fixes)', () => {
  afterEach(() => jest.clearAllMocks())

  it('an export request outlives the server wait, so a running HD export can be polled', async () => {
    await createRenderJob({ designId: 'd-1', exportFormat: 'PNG_HD' })
    const options = (apiPost as jest.Mock).mock.calls[0][2]
    // The server answers within 8 s; the app's default timeout (15 s) is no longer the limit.
    expect(options.timeoutMs).toBeGreaterThanOrEqual(30_000)
  })

  it('a try-on request waits for the composition', async () => {
    await createVisualizationJob({ designId: 'd-1', inputUploadId: 'u-1', placement: { x: 0.5, y: 0.5, scale: 0.3, rotation: 0 } })
    expect((apiPost as jest.Mock).mock.calls[0][2].timeoutMs).toBeGreaterThanOrEqual(60_000)
  })

  it('try-on photos are scaled down on the phone', async () => {
    const file = await pickTryOnPhoto()
    expect(file?.uri).toBe('content://photo/1')
    expect(launchImageLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ maxWidth: TRY_ON_PHOTO_SIDE, maxHeight: TRY_ON_PHOTO_SIDE }),
    )
  })
})
