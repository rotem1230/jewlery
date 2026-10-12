/**
 * Build-time configuration, inlined by babel (transform-inline-environment-variables) from the
 * environment of the bundling command, e.g.
 *   API_BASE_URL=https://api.example.com/api/v1 GOOGLE_WEB_CLIENT_ID=… npx react-native run-android --mode release
 * Metro caches transformed files: add --reset-cache after changing these values.
 */

const DEVELOPMENT_API_BASE_URL = 'http://localhost:3000/api/v1'

/** Development may use the local backend; a release build must name an https API. */
export function resolveApiBaseUrl(options: { dev: boolean; configured?: string }): string {
  const configured = (options.configured ?? '').trim().replace(/\/+$/, '')
  if (!configured) {
    if (options.dev) return DEVELOPMENT_API_BASE_URL
    throw new Error('API_BASE_URL must be set for release builds')
  }
  if (!options.dev && !configured.startsWith('https://')) {
    throw new Error('API_BASE_URL must use https in release builds')
  }
  return configured
}

export const API_BASE_URL = resolveApiBaseUrl({ dev: __DEV__, configured: process.env.API_BASE_URL })

/** OAuth client id of the backend (web) app, used by Google Sign-In to issue ID tokens for it. */
export const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID
