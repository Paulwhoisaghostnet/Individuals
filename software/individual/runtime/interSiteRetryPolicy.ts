import type {
  DeadLetterDelivery,
  InterSiteStateLimits,
  PendingDelivery,
} from "./interSiteState";
import { isInterSiteDeadlineExceededError } from "./interSiteDeadline";

export type DeliveryFailurePlan =
  | {
      readonly status: "dead-lettered";
      readonly deadLetter: DeadLetterDelivery;
    }
  | {
      readonly status: "queued";
      readonly pending: PendingDelivery;
      readonly retryAt: string;
    };

/** Pure retry/dead-letter policy; queue persistence remains the bridge's job. */
export const planDeliveryFailure = (
  pending: PendingDelivery,
  error: unknown,
  now: Date,
  limits: InterSiteStateLimits,
): DeliveryFailurePlan => {
  const attempts = pending.attempts + 1;
  // A transport can throw arbitrary provider bodies, endpoint paths, secret
  // material, or hostile objects. Persist only a fixed operational category.
  const category =
    isInterSiteDeadlineExceededError(error) && error.operation === "transport_delivery"
      ? "transport_timeout"
      : "transport_failure";
  if (attempts >= limits.maxDeliveryAttempts) {
    return {
      status: "dead-lettered",
      deadLetter: {
        ...pending,
        attempts,
        lastFailureCategory: category,
        failedAt: now.toISOString(),
      },
    };
  }

  const delayMs = Math.min(300_000, 1_000 * 2 ** Math.min(8, attempts - 1));
  const retryAt = new Date(now.getTime() + delayMs).toISOString();
  return {
    status: "queued",
    retryAt,
    pending: {
      ...pending,
      attempts,
      nextAttemptAt: retryAt,
      lastFailureCategory: category,
    },
  };
};
