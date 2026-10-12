import { Injectable, Logger } from '@nestjs/common';

type Listener = (userId: string) => void;

/**
 * In-process notice that a user's sessions were revoked (sign out everywhere, password reset,
 * account deletion). Long-lived transports such as the chat socket listen and drop the user's
 * connections, instead of keeping them until the access token expires.
 */
@Injectable()
export class SessionEvents {
  private readonly logger = new Logger(SessionEvents.name);
  private readonly listeners = new Set<Listener>();

  onSessionsRevoked(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sessionsRevoked(userId: string): void {
    for (const listener of this.listeners) {
      try {
        listener(userId);
      } catch (err) {
        this.logger.warn(`Session revocation listener failed for user ${userId}: ${(err as Error).message}`);
      }
    }
  }
}
