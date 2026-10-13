import { portfolioItemsToAdd } from '../src/lib/portfolio'

describe('publishing the business profile', () => {
  it('saves only the pictures that are not in the portfolio yet, keeping their place in the gallery', () => {
    const gallery = [
      { uploadId: 'saved-1', title: 'Ring', persisted: true },
      { uploadId: 'new-1', title: 'Necklace' },
      { title: 'placeholder without a file' },
      { uploadId: 'new-2', title: 'Bracelet', persisted: false },
    ]
    expect(portfolioItemsToAdd(gallery)).toEqual([
      { uploadId: 'new-1', title: 'Necklace', sortOrder: 1 },
      { uploadId: 'new-2', title: 'Bracelet', sortOrder: 3 },
    ])
  })

  it('publishing again after everything was saved adds nothing', () => {
    expect(portfolioItemsToAdd([{ uploadId: 'a', persisted: true }, { uploadId: 'b', persisted: true }])).toEqual([])
  })
})
