import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DesignRequestStatus,
  DesignStatus,
  ProfilePublishStatus,
  QuoteStatus,
  SubscriptionStatus,
} from '@prisma/client';

export type TransitionGraph<TState extends string> = Record<TState, TState[]>;

@Injectable()
export class StateMachineService {
  // DRAFT->PUBLISHED|ARCHIVED; PUBLISHED<->ARCHIVED; ARCHIVED->DRAFT;
  // PUBLISHED->COMPLETED (normally only via quote accept, but callable directly too);
  // COMPLETED is terminal except for Admin-forced archive.
  readonly designGraph: TransitionGraph<DesignStatus> = {
    [DesignStatus.DRAFT]: [DesignStatus.PUBLISHED, DesignStatus.ARCHIVED],
    [DesignStatus.PUBLISHED]: [DesignStatus.ARCHIVED, DesignStatus.COMPLETED],
    [DesignStatus.ARCHIVED]: [DesignStatus.DRAFT, DesignStatus.PUBLISHED],
    [DesignStatus.COMPLETED]: [DesignStatus.ARCHIVED],
  };

  readonly quoteGraph: TransitionGraph<QuoteStatus> = {
    [QuoteStatus.PENDING]: [
      QuoteStatus.ACCEPTED,
      QuoteStatus.DECLINED,
      QuoteStatus.EXPIRED,
      QuoteStatus.WITHDRAWN,
    ],
    [QuoteStatus.ACCEPTED]: [],
    [QuoteStatus.DECLINED]: [],
    [QuoteStatus.EXPIRED]: [],
    [QuoteStatus.WITHDRAWN]: [],
  };

  readonly designRequestGraph: TransitionGraph<DesignRequestStatus> = {
    [DesignRequestStatus.OPEN]: [
      DesignRequestStatus.QUOTE_SUBMITTED,
      DesignRequestStatus.CANCELLED,
      DesignRequestStatus.EXPIRED,
    ],
    [DesignRequestStatus.QUOTE_SUBMITTED]: [
      DesignRequestStatus.NEGOTIATING,
      DesignRequestStatus.COMPLETED,
      DesignRequestStatus.CANCELLED,
    ],
    [DesignRequestStatus.NEGOTIATING]: [
      DesignRequestStatus.QUOTE_SUBMITTED,
      DesignRequestStatus.COMPLETED,
      DesignRequestStatus.CANCELLED,
    ],
    [DesignRequestStatus.COMPLETED]: [],
    [DesignRequestStatus.CANCELLED]: [],
    [DesignRequestStatus.EXPIRED]: [],
  };

  readonly profilePublishGraph: TransitionGraph<ProfilePublishStatus> = {
    [ProfilePublishStatus.DRAFT]: [ProfilePublishStatus.PREVIEW_READY],
    [ProfilePublishStatus.PREVIEW_READY]: [
      ProfilePublishStatus.PENDING_REVIEW,
      ProfilePublishStatus.DRAFT,
    ],
    [ProfilePublishStatus.PENDING_REVIEW]: [
      ProfilePublishStatus.PUBLISHED,
      ProfilePublishStatus.DRAFT,
    ],
    [ProfilePublishStatus.PUBLISHED]: [ProfilePublishStatus.UNPUBLISHED],
    [ProfilePublishStatus.UNPUBLISHED]: [ProfilePublishStatus.PENDING_REVIEW],
  };

  readonly subscriptionGraph: TransitionGraph<SubscriptionStatus> = {
    [SubscriptionStatus.TRIALING]: [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PAST_DUE,
      SubscriptionStatus.CANCELLED,
      SubscriptionStatus.EXPIRED,
    ],
    [SubscriptionStatus.ACTIVE]: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELLED],
    [SubscriptionStatus.PAST_DUE]: [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.EXPIRED,
      SubscriptionStatus.CANCELLED,
    ],
    [SubscriptionStatus.CANCELLED]: [],
    // A verified payment that arrives after the sweep expired the subscription reactivates it.
    [SubscriptionStatus.EXPIRED]: [SubscriptionStatus.ACTIVE],
  };

  assertTransition<TState extends string>(
    graph: TransitionGraph<TState>,
    from: TState,
    to: TState,
  ): void {
    if (from === to) {
      return;
    }
    const allowed = graph[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException({
        success: false,
        message: `Invalid transition from ${from} to ${to}`,
        code: 'INVALID_STATE_TRANSITION',
      });
    }
  }

  canTransition<TState extends string>(
    graph: TransitionGraph<TState>,
    from: TState,
    to: TState,
  ): boolean {
    if (from === to) {
      return true;
    }
    return (graph[from] ?? []).includes(to);
  }

  /** BFS over the graph; returns the hop sequence (excluding `from`) or null if unreachable. */
  findPath<TState extends string>(
    graph: TransitionGraph<TState>,
    from: TState,
    to: TState,
  ): TState[] | null {
    if (from === to) {
      return [];
    }
    const queue: TState[][] = [[from]];
    const visited = new Set<TState>([from]);
    while (queue.length > 0) {
      const path = queue.shift()!;
      const current = path[path.length - 1];
      for (const next of graph[current] ?? []) {
        if (next === to) {
          return [...path.slice(1), next];
        }
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      }
    }
    return null;
  }

  /** Like `assertTransition`, but allows a multi-hop path through intermediate states. */
  assertReachable<TState extends string>(
    graph: TransitionGraph<TState>,
    from: TState,
    to: TState,
  ): void {
    if (from === to) {
      return;
    }
    if (!this.findPath(graph, from, to)) {
      throw new BadRequestException({
        success: false,
        message: `No valid transition path from ${from} to ${to}`,
        code: 'INVALID_STATE_TRANSITION',
      });
    }
  }
}
