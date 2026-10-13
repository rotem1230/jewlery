import { ApiError } from '../src/lib/api'
import { jobRefusal, tryOnGate, withPhotoRemovedOnRefusal } from '../src/lib/tryOn'

const refused = (status: number, code?: string) =>
  new ApiError(status, '/visualization/jobs', JSON.stringify(code ? { success: false, code, message: 'x' } : { message: 'x' }))

describe('try-on is checked before any photo is picked or uploaded (PRD 5.10, privacy)', () => {
  it('is available only with the feature on and the personal_visualization entitlement', () => {
    expect(tryOnGate({ phase2_visualization: true }, ['personal_visualization'])).toBe('available')
  })

  it('is "coming soon" while the feature flag is off or missing, whatever the plan', () => {
    expect(tryOnGate({ phase2_visualization: false }, ['personal_visualization'])).toBe('coming_soon')
    expect(tryOnGate({}, ['personal_visualization'])).toBe('coming_soon')
  })

  it('needs an upgrade without the entitlement', () => {
    expect(tryOnGate({ phase2_visualization: true }, [])).toBe('paywall')
  })

  it('without a flags answer, it is gated on the entitlement alone (the server still checks the flag)', () => {
    expect(tryOnGate(null, ['personal_visualization'])).toBe('available')
    expect(tryOnGate(null, ['hd_export'])).toBe('paywall')
  })
})

describe('why a job was refused', () => {
  it('maps the server codes to what the designer is told', () => {
    expect(jobRefusal(refused(403, 'FEATURE_DISABLED'))).toBe('coming_soon')
    expect(jobRefusal(refused(403, 'PAYWALL'))).toBe('paywall')
    expect(jobRefusal(refused(429, 'VISUALIZATION_QUOTA_EXCEEDED'))).toBe('quota')
    expect(jobRefusal(refused(429, 'RENDER_QUOTA_EXCEEDED'))).toBe('quota')
    expect(jobRefusal(refused(500))).toBe('failed')
    expect(jobRefusal(new Error('network'))).toBe('failed')
  })
})


describe('the personal photo of a refused try-on', () => {
  it('is deleted when the job is refused, and the refusal still reaches the designer', async () => {
    const removed: string[] = []
    const remove = async (id: string) => {
      removed.push(id)
    }
    await expect(
      withPhotoRemovedOnRefusal('upload-1', () => Promise.reject(refused(429, 'VISUALIZATION_QUOTA_EXCEEDED')), remove),
    ).rejects.toBeInstanceOf(ApiError)
    expect(removed).toEqual(['upload-1'])
  })

  it('is kept when the job was accepted (the job uses it)', async () => {
    const removed: string[] = []
    const job = await withPhotoRemovedOnRefusal('upload-2', async () => ({ id: 'job' }), async (id) => {
      removed.push(id)
    })
    expect(job).toEqual({ id: 'job' })
    expect(removed).toEqual([])
  })

  it('a failed delete does not hide the refusal', async () => {
    await expect(
      withPhotoRemovedOnRefusal('upload-3', () => Promise.reject(refused(403, 'PAYWALL')), () => Promise.reject(new Error('offline'))),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
