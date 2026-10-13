import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

/** "d***@example.com": enough to tell deliveries apart in the logs without recording the address. */
function maskAddress(address: string): string {
  const at = address.lastIndexOf('@');
  return at > 0 ? `${address[0]}***${address.slice(at)}` : '***';
}

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
      this.logger.log(`Mail sent to=${maskAddress(to)} subject="${subject}"`);
      return;
    }

    this.logger.log(`[dev mail] from=${from} to=${to} subject="${subject}"\n${body}`);
  }
}
