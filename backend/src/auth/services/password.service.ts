import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AppConfigService } from '../../cms/app-config.service';

/** A letter of any alphabet (Hebrew included). */
const ANY_LETTER = /\p{L}/u;

type PasswordPolicy = {
  minLength: number;
  requireLetter: boolean;
  requireNumber: boolean;
};

/** bcrypt only reads the first 72 bytes; longer inputs would silently collide. */
const MAX_PASSWORD_BYTES = 72;

@Injectable()
export class PasswordService {
  private readonly rounds: number;
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
  ) {
    this.rounds = this.config.get<number>('auth.bcryptRounds', 12);
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Runs a full-cost comparison against a throwaway hash so that "no such account" takes as long
   * as "wrong password" (no timing oracle for account enumeration). Always resolves false.
   */
  async compareAgainstDummy(plain: string): Promise<false> {
    this.dummyHash ??= bcrypt.hash('timing-equalizer-not-a-real-password', this.rounds);
    await bcrypt.compare(plain, await this.dummyHash);
    return false;
  }

  private async getPolicy(): Promise<PasswordPolicy> {
    const fallback: PasswordPolicy = {
      minLength: this.config.get<number>('auth.passwordMinLength', 8),
      requireLetter: this.config.get<boolean>('auth.passwordRequireLetter', true),
      requireNumber: this.config.get<boolean>('auth.passwordRequireNumber', true),
    };

    try {
      const configured = await this.appConfig.get('password_policy');
      if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
        const c = configured as Record<string, unknown>;
        return {
          minLength: typeof c.minLength === 'number' ? c.minLength : fallback.minLength,
          requireLetter:
            typeof c.requireLetter === 'boolean' ? c.requireLetter : fallback.requireLetter,
          requireNumber:
            typeof c.requireNumber === 'boolean' ? c.requireNumber : fallback.requireNumber,
        };
      }
    } catch {
      // AppConfig unavailable (e.g. DB/Redis hiccup) — fall back to env-based policy.
    }
    return fallback;
  }

  /**
   * Returns an error message if the password is weak, otherwise null.
   * Reads the policy from AppConfig("password_policy") with env-based fallback.
   */
  async validateStrength(password: string): Promise<string | null> {
    const policy = await this.getPolicy();
    if (password.length < policy.minLength) {
      return `Password must be at least ${policy.minLength} characters`;
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      return `Password must be at most ${MAX_PASSWORD_BYTES} bytes`;
    }
    // Any alphabet counts (a Hebrew-only password has letters too), as the app checks it.
    if (policy.requireLetter && !ANY_LETTER.test(password)) {
      return 'Password must include at least one letter';
    }
    if (policy.requireNumber && !/\d/.test(password)) {
      return 'Password must include at least one number';
    }
    return null;
  }
}
