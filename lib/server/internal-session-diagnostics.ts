import type { CueAsideUser } from "./auth";
import { configuredInternalAdminUserIDs } from "./internal-auth";
import { enforceAccountRateLimit } from "./rate-limit";
import {
  deploymentEnvironment,
  pseudonymousIdentifier,
  readJSON,
  ServiceError,
} from "./runtime";
import {
  insertInternalSessionDiagnosticSnapshot,
  type InternalSessionDiagnosticFact,
  type InternalSessionDiagnosticRejections,
  type InternalSessionDiagnosticScenario,
  type InternalSessionDiagnosticSnapshot,
  type InternalSessionDiagnosticTurn,
} from "./supabase";

const FACT_STATUSES = new Set([
  "confirmed",
  "speakingCommitment",
  "reported",
  "tentative",
] as const);
const FACT_SOURCES = new Set([
  "rawContext",
  "generatedAnswer",
  "transcript",
  "userCorrection",
] as const);
const ROOT_FIELDS = new Set([
  "schemaVersion",
  "sessionId",
  "activeProjectId",
  "stateUpdatedAt",
  "estimatedInputTokens",
  "seedFacts",
  "canonicalFacts",
  "scenarioState",
  "temporaryClaims",
  "foreignProjectMentions",
  "recentTurns",
  "rejectedClaims",
]);
const FACT_FIELDS = new Set([
  "key",
  "value",
  "category",
  "status",
  "source",
  "topics",
  "sourceTurnId",
  "updatedAt",
]);
const SCENARIO_FIELDS = new Set([
  "id",
  "triggerQuestion",
  "facts",
  "updatedAt",
]);
const TURN_FIELDS = new Set([
  "turnId",
  "question",
  "suggestedAnswer",
  "spokenReply",
]);
const REJECTION_FIELDS = new Set([
  "conflicts",
  "projectMismatches",
  "invalid",
]);
const SAFE_KEY = /^[a-z0-9._-]+$/;
const SAFE_TURN_ID = /^[A-Za-z0-9._-]+$/;

type ObjectValue = Record<string, unknown>;

function objectWithFields(
  value: unknown,
  fields: ReadonlySet<string>,
): ObjectValue | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const object = value as ObjectValue;
  return Object.keys(object).every((field) => fields.has(field)) ? object : null;
}

function text(
  value: unknown,
  maximum: number,
  options: { empty?: boolean; pattern?: RegExp } = {},
): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if ((!options.empty && !cleaned) || cleaned.length > maximum) return null;
  if (options.pattern && !options.pattern.test(cleaned)) return null;
  return cleaned;
}

function isoDate(value: unknown): string | null {
  const candidate = text(value, 40);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

function closed<T extends ReadonlySet<string>>(
  value: unknown,
  allowed: T,
): T extends ReadonlySet<infer Result> ? Result : never | null {
  return (typeof value === "string" && allowed.has(value))
    ? value as T extends ReadonlySet<infer Result> ? Result : never
    : null as T extends ReadonlySet<infer Result> ? Result : never | null;
}

function stringArray(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
  pattern?: RegExp,
): string[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const result: string[] = [];
  for (const item of value) {
    const candidate = text(item, maximumLength, { pattern });
    if (!candidate) return null;
    result.push(candidate);
  }
  return result;
}

function fact(value: unknown): InternalSessionDiagnosticFact | null {
  const object = objectWithFields(value, FACT_FIELDS);
  if (!object) return null;
  const key = text(object.key, 160, { pattern: SAFE_KEY });
  const factValue = text(object.value, 2_000);
  const category = text(object.category, 64, { pattern: SAFE_KEY });
  const status = closed(object.status, FACT_STATUSES);
  const source = closed(object.source, FACT_SOURCES);
  const topics = stringArray(object.topics, 12, 64, SAFE_KEY);
  const updatedAt = isoDate(object.updatedAt);
  const sourceTurnId = object.sourceTurnId === null
    ? null
    : text(object.sourceTurnId, 120, { pattern: SAFE_TURN_ID });
  if (
    !key || !factValue || !category || !status || !source || !topics ||
    !updatedAt || (object.sourceTurnId !== null && !sourceTurnId)
  ) {
    return null;
  }
  return {
    key,
    value: factValue,
    category,
    status,
    source,
    topics,
    sourceTurnId,
    updatedAt,
  };
}

function facts(value: unknown, maximumItems = 96): InternalSessionDiagnosticFact[] | null {
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const parsed = value.map(fact);
  return parsed.every((item): item is InternalSessionDiagnosticFact => item !== null)
    ? parsed
    : null;
}

function scenario(value: unknown): InternalSessionDiagnosticScenario | null | false {
  if (value === null) return null;
  const object = objectWithFields(value, SCENARIO_FIELDS);
  if (!object) return false;
  const id = text(object.id, 120, { pattern: SAFE_TURN_ID });
  const triggerQuestion = text(object.triggerQuestion, 1_500, { empty: true });
  const parsedFacts = facts(object.facts, 48);
  const updatedAt = isoDate(object.updatedAt);
  if (!id || triggerQuestion === null || !parsedFacts || !updatedAt) return false;
  return { id, triggerQuestion, facts: parsedFacts, updatedAt };
}

function turns(value: unknown): InternalSessionDiagnosticTurn[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const result: InternalSessionDiagnosticTurn[] = [];
  for (const item of value) {
    const object = objectWithFields(item, TURN_FIELDS);
    if (!object) return null;
    const turnId = text(object.turnId, 120, { pattern: SAFE_TURN_ID });
    const question = text(object.question, 500);
    const suggestedAnswer = text(object.suggestedAnswer, 1_200);
    const spokenReply = text(object.spokenReply, 1_600, { empty: true });
    if (!turnId || !question || !suggestedAnswer || spokenReply === null) {
      return null;
    }
    result.push({ turnId, question, suggestedAnswer, spokenReply });
  }
  return result;
}

function rejections(value: unknown): InternalSessionDiagnosticRejections | null {
  const object = objectWithFields(value, REJECTION_FIELDS);
  if (!object) return null;
  const conflicts = stringArray(object.conflicts, 96, 160, SAFE_KEY);
  const projectMismatches = stringArray(
    object.projectMismatches,
    96,
    160,
    SAFE_KEY,
  );
  const invalid = stringArray(object.invalid, 96, 160, SAFE_KEY);
  return conflicts && projectMismatches && invalid
    ? { conflicts, projectMismatches, invalid }
    : null;
}

function invalidDiagnostic(): never {
  throw new ServiceError(
    "Invalid development session diagnostic.",
    400,
    "invalid_session_diagnostic",
  );
}

export async function recordInternalSessionDiagnostic(
  request: Request,
  user: CueAsideUser,
): Promise<Response> {
  if (deploymentEnvironment() === "production") {
    throw new ServiceError("Not found.", 404, "not_found");
  }
  if (!configuredInternalAdminUserIDs().has(user.id.toLowerCase())) {
    // Return the same shape as the Production guard. Besides avoiding route
    // discovery, this prevents a non-admin Debug account from interpreting a
    // policy denial as an expired commercial session.
    throw new ServiceError("Not found.", 404, "not_found");
  }
  await enforceAccountRateLimit({
    scope: "internal-session-diagnostic",
    subject: user.id,
    maximum: 180,
    windowSeconds: 15 * 60,
  });

  const value = await readJSON<unknown>(request, 96_000);
  const body = objectWithFields(value, ROOT_FIELDS);
  if (!body || body.schemaVersion !== 1) invalidDiagnostic();

  const sessionId = text(body.sessionId, 120, { pattern: SAFE_TURN_ID });
  const activeProjectId = text(body.activeProjectId, 96, { pattern: SAFE_KEY });
  const stateUpdatedAt = body.stateUpdatedAt === null
    ? null
    : isoDate(body.stateUpdatedAt);
  const estimatedInputTokens = body.estimatedInputTokens === null
    ? null
    : body.estimatedInputTokens;
  const seedFacts = facts(body.seedFacts);
  const canonicalFacts = facts(body.canonicalFacts);
  const scenarioState = scenario(body.scenarioState);
  const temporaryClaims = facts(body.temporaryClaims);
  const foreignProjectMentions = facts(body.foreignProjectMentions);
  const recentTurns = turns(body.recentTurns);
  const rejectedClaims = rejections(body.rejectedClaims);
  if (
    !sessionId || !activeProjectId ||
    (body.stateUpdatedAt !== null && !stateUpdatedAt) ||
    (estimatedInputTokens !== null &&
      (typeof estimatedInputTokens !== "number" ||
        !Number.isInteger(estimatedInputTokens) ||
        estimatedInputTokens < 0 || estimatedInputTokens > 1_000_000)) ||
    !seedFacts || !canonicalFacts || scenarioState === false ||
    !temporaryClaims || !foreignProjectMentions || !recentTurns ||
    !rejectedClaims
  ) {
    invalidDiagnostic();
  }

  const snapshot: InternalSessionDiagnosticSnapshot = {
    activeProjectId,
    stateUpdatedAt,
    estimatedInputTokens: estimatedInputTokens as number | null,
    seedFacts,
    canonicalFacts,
    scenarioState,
    temporaryClaims,
    foreignProjectMentions,
    recentTurns,
    rejectedClaims,
  };
  await insertInternalSessionDiagnosticSnapshot({
    adminUserId: user.id,
    sessionKey: await pseudonymousIdentifier(`internal-session:${sessionId}`),
    snapshot,
  });
  return Response.json(
    { ok: true },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
