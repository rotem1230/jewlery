const DEVELOPMENT_ORIGINS = 'http://localhost:3000,http://localhost:8081';

/**
 * Browser origins allowed to open the chat socket. Read per handshake (the decorator is evaluated
 * before configuration loads). Production has no default; requests without an Origin header come
 * from native apps, where CORS does not apply.
 */
export function isAllowedSocketOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) {
    return true;
  }
  const configured = env.CORS_ORIGINS ?? (env.NODE_ENV === 'production' ? '' : DEVELOPMENT_ORIGINS);
  return configured
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(origin);
}
