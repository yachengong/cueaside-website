export type UsageKind =
  | "answerRequests"
  | "transcriptionRequests"
  | "realtimeTokens";

export type PlanId = "free" | "pro";

export const PLAN_USAGE_LIMITS: Readonly<
  Record<PlanId, Readonly<Record<UsageKind, number>>>
> = Object.freeze({
  free: Object.freeze({
    answerRequests: 15,
    transcriptionRequests: 60,
    realtimeTokens: 15,
  }),
  pro: Object.freeze({
    answerRequests: 200,
    transcriptionRequests: 1_000,
    realtimeTokens: 300,
  }),
});

export interface UsageDecision {
  unlimited: boolean;
  limit: number | null;
}

/**
 * One policy function owns the Free, Pro, and owner/admin boundary. Keeping
 * the bypass here means a future provider route cannot accidentally meter an
 * unlimited account merely because it remembered the plan but forgot the
 * entitlement's bypass bit.
 */
export function usageDecision(
  plan: PlanId,
  kind: UsageKind,
  unlimited = false,
): UsageDecision {
  return unlimited
    ? { unlimited: true, limit: null }
    : { unlimited: false, limit: PLAN_USAGE_LIMITS[plan][kind] };
}

