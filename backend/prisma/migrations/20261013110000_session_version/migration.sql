-- Ending all sessions of an account must also end the access tokens already handed out, not only
-- the refresh tokens: every access token carries the account's session version from when it was
-- issued, and is refused once the version has moved on. Existing tokens carry none (= 0).

SET LOCAL lock_timeout = '10s';

-- AlterTable (a constant default: no table rewrite)
ALTER TABLE "users" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;
