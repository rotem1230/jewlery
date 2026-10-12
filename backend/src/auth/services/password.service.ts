import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AppConfigService } from '../../cms/app-config.service';

type PasswordPolicy = {
  minLength: number;
  requireLetter: boolean;
  requireNumber: boolean;
};

@Injectable()
export class PasswordService {
  private readonly rounds = 12;

  constructor(
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
  ) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
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
    if (policy.requireLetter && !/[A-Za-z]/.test(password)) {
      return 'Password must include at least one letter';
    }
    if (policy.requireNumber && !/\d/.test(password)) {
      return 'Password must include at least one number';
    }
    return null;
  }
}
