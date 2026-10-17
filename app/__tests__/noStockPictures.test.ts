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
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

/**
 * QA: every user without a photo was shown with a stranger's face (`jeweler-avatar-1.png`), and
 * every design without a picture with a photo of a different ring (`home/hero-ring.png`).
 * A person is shown by their photo, logo or initials; a design by its own pictures or its
 * category illustration. The home hero card is marketing art and may keep its photo.
 */
describe('no stock photo stands in for a person or a design', () => {
  const MARKETING_ART = new Set(['components/home/HeroDesignCard.tsx'])

  it.each([
    ['a stranger as avatar', /images\/designs\/jeweler-avatar/],
    ['another ring as the picture of a design', /images\/home\/hero-ring/],
  ])('no screen uses %s', (_what, asset) => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path).replace(/\\/g, '/'))
      .filter((path) => !MARKETING_ART.has(path))
      .filter((path) => asset.test(readFileSync(join(SRC, path), 'utf8')))
    expect(offenders).toEqual([])
  })
})
