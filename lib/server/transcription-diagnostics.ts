import type { CueAsideUser } from "./auth";
import { enforceAccountRateLimit } from "./rate-limit";
import { readJSON, ServiceError } from "./runtime";
import { insertTranscriptionDiagnosticMetric } from "./supabase";

const KINDS = new Set(["capture", "result"] as const);
const ROLES = new Set(["question", "spoken_reply"] as const);
const SOURCES = new Set(["system", "input", "unknown"] as const);
const DELIVERIES = new Set(["realtime", "file"] as const);
const MODELS = new Set([
  "deepgram-nova-3",
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
  "gpt-realtime-whisper",
] as const);
const LANGUAGES = new Set([
  "auto", "en", "zh", "es", "fr", "de",
  "ja", "ko", "pt", "it", "hi", "ar",
] as const);
const CAPTURE_DISPOSITIONS = new Set([
  "submitted",
  "submitted_on_stop",
  "discarded_write_failure",
  "discarded_silence",
  "discarded_manual_too_short",
  "discarded_below_minimum_voice",
] as const);
const RESULT_DISPOSITIONS = new Set([
  "completed",
  "empty",
  "failed",
  "language_review",
  "cancelled",
] as const);
const DISPOSITIONS = new Set([
  ...CAPTURE_DISPOSITIONS,
  ...RESULT_DISPOSITIONS,
]);
const FIELDS = new Set([
  "schemaVersion",
  "kind",
  "streamRole",
  "captureSource",
  "delivery",
  "model",
  "language",
  "disposition",
  "durationMilliseconds",
  "voicedMilliseconds",
  "peakRMSPartsPerMillion",
  "silenceThresholdPartsPerMillion",
]);
const REALTIME_MODELS = new Set([
  "deepgram-nova-3",
  "gpt-realtime-whisper",
]);

type ClosedValue<T extends ReadonlySet<string>> =
  T extends ReadonlySet<infer Value> ? Value : never;

interface IncomingDiagnostic {
  schemaVersion?: unknown;
  kind?: unknown;
  streamRole?: unknown;
  captureSource?: unknown;
  delivery?: unknown;
  model?: unknown;
  language?: unknown;
  disposition?: unknown;
  durationMilliseconds?: unknown;
  voicedMilliseconds?: unknown;
  peakRMSPartsPerMillion?: unknown;
  silenceThresholdPartsPerMillion?: unknown;
}

function closed<T extends ReadonlySet<string>>(
  value: unknown,
  allowed: T,
): ClosedValue<T> | null {
  return typeof value === "string" && allowed.has(value)
    ? value as ClosedValue<T>
    : null;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return typeof value === "number" &&
      Number.isInteger(value) &&
      value >= minimum &&
      value <= maximum
    ? value
    : null;
}

function includes(allowed: ReadonlySet<string>, value: string): boolean {
  return allowed.has(value);
}

export async function recordTranscriptionDiagnostic(
  request: Request,
  user: CueAsideUser,
): Promise<Response> {
  await enforceAccountRateLimit({
    scope: "transcription-diagnostic",
    subject: user.id,
    maximum: 600,
    windowSeconds: 15 * 60,
  });
  const value = await readJSON<unknown>(request, 4_000);
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some((field) => !FIELDS.has(field))
  ) {
    throw new ServiceError(
      "Invalid transcription diagnostic.",
      400,
      "invalid_transcription_diagnostic",
    );
  }
  const body = value as IncomingDiagnostic;
  const kind = closed(body.kind, KINDS);
  const streamRole = closed(body.streamRole, ROLES);
  const captureSource = closed(body.captureSource, SOURCES);
  const delivery = closed(body.delivery, DELIVERIES);
  const model = closed(body.model, MODELS);
  const language = closed(body.language, LANGUAGES);
  const disposition = closed(body.disposition, DISPOSITIONS);
  if (
    body.schemaVersion !== 1 || !kind || !streamRole || !captureSource ||
    !delivery || !model || !language || !disposition
  ) {
    throw new ServiceError(
      "Invalid transcription diagnostic.",
      400,
      "invalid_transcription_diagnostic",
    );
  }

  const isCapture = kind === "capture";
  const durationMilliseconds = isCapture
    ? boundedInteger(body.durationMilliseconds, 0, 300_000)
    : null;
  const voicedMilliseconds = isCapture
    ? boundedInteger(body.voicedMilliseconds, 0, 300_000)
    : null;
  const peakRMSPartsPerMillion = isCapture
    ? boundedInteger(body.peakRMSPartsPerMillion, 0, 2_000_000)
    : null;
  const silenceThresholdPartsPerMillion = isCapture
    ? boundedInteger(body.silenceThresholdPartsPerMillion, 0, 200_000)
    : null;
  if (
    isCapture &&
    (
      captureSource === "unknown" ||
      durationMilliseconds === null || voicedMilliseconds === null ||
      peakRMSPartsPerMillion === null ||
      silenceThresholdPartsPerMillion === null ||
      voicedMilliseconds > durationMilliseconds ||
      !includes(CAPTURE_DISPOSITIONS, disposition)
    )
  ) {
    throw new ServiceError(
      "Invalid transcription diagnostic.",
      400,
      "invalid_transcription_diagnostic",
    );
  }
  if (
    !isCapture &&
    (
      captureSource !== "unknown" ||
      !includes(RESULT_DISPOSITIONS, disposition) ||
      (body.durationMilliseconds !== undefined && body.durationMilliseconds !== null) ||
      (body.voicedMilliseconds !== undefined && body.voicedMilliseconds !== null) ||
      (body.peakRMSPartsPerMillion !== undefined &&
        body.peakRMSPartsPerMillion !== null) ||
      (body.silenceThresholdPartsPerMillion !== undefined &&
        body.silenceThresholdPartsPerMillion !== null)
    )
  ) {
    throw new ServiceError(
      "Invalid transcription diagnostic.",
      400,
      "invalid_transcription_diagnostic",
    );
  }
  const expectedDelivery = includes(REALTIME_MODELS, model)
    ? "realtime"
    : "file";
  if (delivery !== expectedDelivery) {
    throw new ServiceError(
      "Invalid transcription diagnostic.",
      400,
      "invalid_transcription_diagnostic",
    );
  }

  await insertTranscriptionDiagnosticMetric({
    kind,
    streamRole,
    captureSource,
    delivery,
    model,
    language,
    disposition,
    durationMilliseconds,
    voicedMilliseconds,
    peakRMSPartsPerMillion,
    silenceThresholdPartsPerMillion,
  });
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
