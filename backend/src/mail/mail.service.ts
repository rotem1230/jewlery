import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const smtpUrl = this.config.get<string>('mail.smtpUrl');
    if (smtpUrl) {
      this.transporter = createTransport(smtpUrl);
    }
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    const from = this.config.get<string>('mail.from', 'no-reply@mailnvosky.local');

    if (this.transporter) {
      await this.transporter.sendMail({ from, to, subject, text: body });
      this.logger.log(`Mail sent to=${to} subject="${subject}"`);
      return;
    }

    this.logger.log(`[dev mail] from=${from} to=${to} subject="${subject}"\n${body}`);
  }
}
