import { withGeneratedInspiration } from '../src/lib/studioParams'

/**
 * PRD 5.4 step 7: "upload an inspiration image or generate using AI". A generated picture is the
 * design's inspiration picture (the one jewelers see), not a separate 3D model.
 */
describe('a picture made by the AI becomes the inspiration picture', () => {
  const saved = { size: { sizeCode: 'IL_56' }, metal: { metalCode: 'GOLD' }, personalNote: 'twisted band' }

  it('is saved as the inspiration picture, keeping everything else', () => {
    expect(withGeneratedInspiration(saved, 'pic-1')).toEqual({ ...saved, inspirationUploadId: 'pic-1' })
  })

  it('replaces the picture the designer uploaded before (that one was its starting point)', () => {
    expect(withGeneratedInspiration({ ...saved, inspirationUploadId: 'uploaded' }, 'pic-2')?.inspirationUploadId).toBe('pic-2')
  })

  it('nothing to save when it already is the inspiration picture', () => {
    expect(withGeneratedInspiration({ ...saved, inspirationUploadId: 'pic-1' }, 'pic-1')).toBeNull()
  })

  it('never keeps a link to a generated 3D model', () => {
    const next = withGeneratedInspiration({ ...saved, aiOutputUploadId: 'old-model' }, 'pic-3')
    expect(next).not.toHaveProperty('aiOutputUploadId')
  })
})
