/** Values inlined at bundle time (see src/config/env.ts); there is no Node `process` at runtime. */
declare const process: {
  env: {
    API_BASE_URL?: string
    GOOGLE_WEB_CLIENT_ID?: string
    [key: string]: string | undefined
  }
}
