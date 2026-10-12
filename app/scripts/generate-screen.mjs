#!/usr/bin/env node
/**
 * Generate a React Native screen stub and wire it into navigation types + stack.
 *
 * Usage (from app/):
 *   npm run generate:screen -- --name DesignDetail --domain designs --stack Auth
 *
 * Options:
 *   --name     PascalCase screen name without "Screen" suffix (required)
 *   --domain   Folder under src/screens (default: shared)
 *   --stack    Auth | DesignerTabs | JewelerTabs | none (default: none)
 *   --route    Route key in ParamList (default: same as --name)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')

function parseArgs(argv) {
  const out = { name: '', domain: 'shared', stack: 'none', route: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--name') out.name = argv[++i]
    else if (a === '--domain') out.domain = argv[++i]
    else if (a === '--stack') out.stack = argv[++i]
    else if (a === '--route') out.route = argv[++i]
  }
  return out
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function pascal(name) {
  return name.replace(/(^\w|-\w)/g, (m) => m.replace('-', '').toUpperCase())
}

const args = parseArgs(process.argv.slice(2))
if (!args.name) {
  console.error('Missing --name. Example: npm run generate:screen -- --name DesignDetail --domain designs --stack Auth')
  process.exit(1)
}

const screenBase = pascal(args.name.replace(/Screen$/i, ''))
const routeName = args.route || screenBase
const componentName = `${screenBase}Screen`
const domainDir = path.join(appRoot, 'src/screens', args.domain)
const screenPath = path.join(domainDir, `${componentName}.tsx`)

if (fs.existsSync(screenPath)) {
  console.error(`Screen already exists: ${screenPath}`)
  process.exit(1)
}

ensureDir(domainDir)

const screenSource = `import { PlaceholderScreen } from '@/src/screens/shared/PlaceholderScreen'

/** GENERATED — review and replace with real UI */
export function ${componentName}() {
  return <PlaceholderScreen title="${routeName}" />
}
`

fs.writeFileSync(screenPath, screenSource, 'utf8')
console.log(`Created ${path.relative(appRoot, screenPath)}`)

// Update types.ts for Auth stack only when --stack Auth
const typesPath = path.join(appRoot, 'src/navigation/types.ts')
let types = fs.readFileSync(typesPath, 'utf8')

if (args.stack === 'Auth') {
  if (!types.includes(`${routeName}:`)) {
    types = types.replace(
      /export type AuthStackParamList = \{([\s\S]*?)\}/,
      (match, body) =>
        `export type AuthStackParamList = {${body}  ${routeName}: undefined // GENERATED\n}`,
    )
    fs.writeFileSync(typesPath, types, 'utf8')
    console.log('Updated AuthStackParamList in types.ts')
  }

  const authStackPath = path.join(appRoot, 'src/navigation/AuthStack.tsx')
  let auth = fs.readFileSync(authStackPath, 'utf8')
  const importLine = `import { ${componentName} } from '@/src/screens/${args.domain}/${componentName}'`
  if (!auth.includes(importLine)) {
    auth = auth.replace(
      /(import type \{ AuthStackParamList \} from '\.\/types'\n)/,
      `${importLine}\n$1`,
    )
  }
  const screenLine = `      {/* GENERATED */}
      <Stack.Screen name="${routeName}" component={${componentName}} />`
  if (!auth.includes(`name="${routeName}"`)) {
    auth = auth.replace(
      /(<\/Stack\.Navigator>)/,
      `${screenLine}\n    $1`,
    )
    fs.writeFileSync(authStackPath, auth, 'utf8')
    console.log('Registered screen in AuthStack.tsx')
  }
} else if (args.stack === 'DesignerTabs' || args.stack === 'JewelerTabs') {
  const paramList =
    args.stack === 'DesignerTabs' ? 'DesignerTabParamList' : 'JewelerTabParamList'
  if (!types.includes(`${routeName}:`)) {
    const re = new RegExp(`export type ${paramList} = \\{([\\s\\S]*?)\\}`)
    types = types.replace(
      re,
      (match, body) =>
        `export type ${paramList} = {${body}  ${routeName}: undefined // GENERATED\n}`,
    )
    fs.writeFileSync(typesPath, types, 'utf8')
    console.log(`Updated ${paramList} in types.ts`)
  }
  console.log(
    `NOTE: Add a <Tab.Screen name="${routeName}" …> manually in ${args.stack}.tsx (icons/labels).`,
  )
} else {
  console.log('Stack=none — screen file only. Register it in a navigator when ready.')
}

console.log('Done.')
