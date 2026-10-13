import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AddressInfo, createServer, Server, Socket } from 'net';
import { MailService } from './mail.service';

type Received = { from?: string; to: string[]; data: string };

/** A minimal SMTP server: enough of the protocol for a client to deliver one message. */
function smtpSink(): Promise<{ server: Server; port: number; received: Received[] }> {
  const received: Received[] = [];
  const server = createServer((socket: Socket) => {
    let current: Received = { to: [], data: '' };
    let inData = false;
    let buffer = '';
    socket.write('220 sink ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index: number;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            received.push(current);
            current = { to: [], data: '' };
            socket.write('250 queued\r\n');
          } else {
            current.data += `${line}\n`;
          }
          continue;
        }
        const command = line.toUpperCase();
        if (command.startsWith('EHLO') || command.startsWith('HELO')) {
          socket.write('250 sink\r\n');
        } else if (command.startsWith('MAIL FROM:')) {
          current.from = line.slice(10).trim();
          socket.write('250 ok\r\n');
        } else if (command.startsWith('RCPT TO:')) {
          current.to.push(line.slice(8).trim());
          socket.write('250 ok\r\n');
        } else if (command === 'DATA') {
          inData = true;
          socket.write('354 go ahead\r\n');
        } else if (command === 'QUIT') {
          socket.end('221 bye\r\n');
        } else {
          socket.write('250 ok\r\n');
        }
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port, received }));
  });
}

function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string, fallback?: unknown) => values[key] ?? fallback } as unknown as ConfigService;
}

describe('MailService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delivers through the configured SMTP server', async () => {
    const sink = await smtpSink();
    try {
      const mail = new MailService(configWith({ 'mail.smtpUrl': `smtp://127.0.0.1:${sink.port}`, 'mail.from': 'no-reply@malinvosky.test' }));
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await mail.send('dana@example.com', 'Verify your account', 'Open this link');

      expect(sink.received).toHaveLength(1);
      const [message] = sink.received;
      expect(message.from).toBe('<no-reply@malinvosky.test>');
      expect(message.to).toEqual(['<dana@example.com>']);
      expect(message.data).toContain('Subject: Verify your account');
      expect(message.data).toContain('Open this link');
    } finally {
      await new Promise((resolve) => sink.server.close(resolve));
    }
  });

  it('does not write recipient addresses into the logs', async () => {
    const sink = await smtpSink();
    try {
      const mail = new MailService(configWith({ 'mail.smtpUrl': `smtp://127.0.0.1:${sink.port}` }));
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await mail.send('dana.cohen@example.com', 'Subject', 'Body');
      const written = log.mock.calls.map((call) => String(call[0])).join('\n');
      expect(written).not.toContain('dana.cohen@example.com');
      expect(written).toContain('example.com');
    } finally {
      await new Promise((resolve) => sink.server.close(resolve));
    }
  });
});
