// The app has no Node typings; only these few file-system calls are needed.
type Fs = {
  readdirSync: (dir: string) => string[]
  readFileSync: (path: string, encoding: 'utf8') => string
  statSync: (path: string) => { isDirectory: () => boolean }
}
type PathModule = { join: (...parts: string[]) => string; relative: (from: string, to: string) => string }
declare const __dirname: string
const { readdirSync, readFileSync, statSync } = require('fs') as Fs
const { join, relative } = require('path') as PathModule

const SRC = join(__dirname, '..', 'src')

// A module, not a global script (these helpers are private to this file).
export {}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** The object literal around `index`: from its opening brace to the matching closing one. */
function enclosingObject(text: string, index: number): string {
  let start = index
  for (let depth = 0; start > 0; start -= 1) {
    if (text[start] === '}') depth += 1
    if (text[start] === '{') {
      if (depth === 0) break
      depth -= 1
    }
  }
  let end = index
  for (let depth = 0; end < text.length; end += 1) {
    if (text[end] === '{') depth += 1
    if (text[end] === '}') {
      if (depth === 0) break
      depth -= 1
    }
  }
  return text.slice(start, end + 1)
}

/**
 * QA: `navigate('Profile', { screen: 'Pricing' })` from another tab made Pricing the root of the
 * Profile tab (no way back to the profile). Opening a screen inside another tab keeps that tab's
 * own first screen underneath it (`initial: false`).
 */
describe("opening a screen inside another tab keeps that tab's root", () => {
  const NOT_COVERED = new Set<string>()

  it('every navigate(<tab>, { screen }) passes initial: false', () => {
    const missing: string[] = []
    for (const path of sourceFiles(SRC)) {
      const file = relative(SRC, path).replace(/\\/g, '/')
      if (NOT_COVERED.has(file)) continue
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(/\bscreen:\s*'(\w+)'/g)) {
        const target = enclosingObject(text, match.index ?? 0)
        if (!/\binitial:\s*false\b/.test(target)) missing.push(`${file}: ${match[1]}`)
      }
    }
    expect(missing).toEqual([])
  })
})
