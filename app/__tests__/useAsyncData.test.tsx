import renderer, { act } from 'react-test-renderer'
import { useAsyncData } from '../src/hooks/useAsyncData'

type Deferred = { resolve: (value: string) => void; signal: AbortSignal }

/** Renders the hook with a filter; every load waits until the test resolves it. */
function setup() {
  const calls: Deferred[] = []
  const loader = (filter: string) => (signal: AbortSignal) =>
    new Promise<string>((resolve) => {
      calls.push({ resolve: (value) => resolve(`${filter}:${value}`), signal })
    })
  let current: ReturnType<typeof useAsyncData<string>> | null = null
  function Probe({ filter }: { filter: string }) {
    current = useAsyncData(loader(filter), { deps: [filter] })
    return null
  }
  return { calls, Probe, latest: () => current }
}

describe('screen data that reloads when a filter changes', () => {
  it('shows the answer for the current filter, even when the older request answers last', async () => {
    const { calls, Probe, latest } = setup()
    let tree!: renderer.ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<Probe filter="nearby" />)
    })
    await act(async () => {
      tree.update(<Probe filter="all" />)
    })
    expect(calls).toHaveLength(2)

    // The newer request ("all") answers first, then the slower older one ("nearby").
    await act(async () => {
      calls[1].resolve('fresh')
    })
    await act(async () => {
      calls[0].resolve('stale')
    })
    expect(latest()?.data).toBe('all:fresh')
    // The superseded request was told to stop.
    expect(calls[0].signal.aborted).toBe(true)
    tree.unmount()
  })

  it('a refresh that finishes after a newer load does not overwrite it', async () => {
    const { calls, Probe, latest } = setup()
    let tree!: renderer.ReactTestRenderer
    await act(async () => {
      tree = renderer.create(<Probe filter="a" />)
    })
    await act(async () => {
      calls[0].resolve('first')
    })
    let pendingRefresh: Promise<void> | undefined
    await act(async () => {
      pendingRefresh = latest()?.refresh()
    })
    await act(async () => {
      tree.update(<Probe filter="b" />)
    })
    await act(async () => {
      calls[2].resolve('newest')
    })
    await act(async () => {
      calls[1].resolve('old refresh')
      await pendingRefresh
    })
    expect(latest()?.data).toBe('b:newest')
    tree.unmount()
  })
})
