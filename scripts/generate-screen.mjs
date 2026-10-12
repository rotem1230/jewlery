#!/usr/bin/env node
/** Thin wrapper — prefer running from app/: npm run generate:screen */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appScript = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../app/scripts/generate-screen.mjs',
)

const result = spawnSync(process.execPath, [appScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
