/**
 * Mails a fresh verification link to every account still waiting for e-mail verification (accounts
 * created before verification was enforced cannot sign in until they verify).
 *
 *   node dist/cli/resend-verification.js --dry-run       # count only
 *   node dist/cli/resend-verification.js --limit=500
 *
 * Run once after deploying, with the production environment (SMTP_URL set) and JOBS_ENABLED=false.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error('--limit must be a positive integer');
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(AuthService).resendVerificationToPendingAccounts({ dryRun, limit });
    console.log(JSON.stringify({ dryRun, ...result }));
  } finally {
    await app.close();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
