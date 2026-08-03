import { CueAsideUser } from "./auth";
import { recordUsage, requireEntitlement, UsageKind } from "./billing";
import {
  ServiceError,
  pseudonymousIdentifier,
  readJSON,
  requireRuntimeValue,
} from "./runtime";

const DEPTHS = {
  instinct: { model: "gpt-5.6-terra", effort: "none" },
  balanced: { model: "gpt-5.6-terra", effort: "low" },
  precise: { model: "gpt-5.6-sol", effort: "medium" },
  thinking: { model: "gpt-5.6-sol", effort: "high" },
} as const;

async function openAIHeaders(userId: string): Promise<HeadersInit> {
  return {
    Authorization: `Bearer ${requireRuntimeValue(
      "OPENAI_API_KEY",
      "AI service is not configured yet.",
    )}`,
    "Content-Type": "application/json",
    "OpenAI-Safety-Identifier": await pseudonymousIdentifier(userId),
  };
}

async function authorizeAI(user: CueAsideUser, kind: UsageKind) {
  const entitlement = await requireEntitlement(user.id);
  if (entitlement.bypass) return;
  await recordUsage(user.id, kind, entitlement.plan);
}

type ResponseProxyBody = {
  input?: unknown;
  instructions?: unknown;
  max_output_tokens?: unknown;
  stream?: unknown;
  model?: unknown;
  reasoning?: { effort?: unknown };
};

function inferDepth(body: ResponseProxyBody): keyof typeof DEPTHS {
  const requestedModel = typeof body.model === "string" ? body.model : "";
  const effort =
    typeof body.reasoning?.effort === "string"
      ? body.reasoning.effort.toLowerCase()
      : "none";
  if (requestedModel === "gpt-5.6-sol" && effort === "high") return "thinking";
  if (requestedModel === "gpt-5.6-sol") return "precise";
  if (effort !== "none") return "balanced";
  return "instinct";
}

function validateText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ServiceError(`${field} is required.`, 400, "invalid_request");
  }
  if (value.length > maxLength) {
    throw new ServiceError(
      `${field} is too large.`,
      413,
      "request_too_large",
    );
  }
  return value;
}

function validateInput(value: unknown): unknown {
  if (typeof value === "string") {
    return validateText(value, "input", 600_000);
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new ServiceError("input is required.", 400, "invalid_request");
  }
  if (JSON.stringify(value).length > 700_000) {
    throw new ServiceError("input is too large.", 413, "request_too_large");
  }
  return value;
}

export async function proxyAnswer(
  request: Request,
  user: CueAsideUser,
): Promise<Response> {
  const body = await readJSON<ResponseProxyBody>(request, 800_000);
  const input = validateInput(body.input);
  const instructions = validateText(body.instructions, "instructions", 50_000);
  const depth = inferDepth(body);
  const profile = DEPTHS[depth];
  const maxOutputTokens = Math.min(
    Math.max(Number(body.max_output_tokens) || 1_000, 256),
    4_000,
  );

  await authorizeAI(user, "answerRequests");
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: await openAIHeaders(user.id),
    body: JSON.stringify({
      model: profile.model,
      instructions,
      input,
      store: false,
      stream: true,
      max_output_tokens: maxOutputTokens,
      reasoning: { effort: profile.effort },
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error("OpenAI answer error", upstream.status, detail.slice(0, 1_000));
    throw new ServiceError(
      "The answer service is temporarily unavailable.",
      upstream.status === 429 ? 429 : 502,
      "ai_upstream_error",
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function proxyTranscription(
  request: Request,
  user: CueAsideUser,
): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 26 * 1024 * 1024) {
    throw new ServiceError(
      "Audio is over the 25 MB limit.",
      413,
      "audio_too_large",
    );
  }
  await authorizeAI(user, "transcriptionRequests");

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ServiceError(
      "An audio file is required.",
      400,
      "audio_required",
    );
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new ServiceError(
      "Audio is over the 25 MB limit.",
      413,
      "audio_too_large",
    );
  }

  const requested = String(incoming.get("model") ?? "");
  const model =
    requested === "gpt-4o-transcribe"
      ? "gpt-4o-transcribe"
      : "gpt-4o-mini-transcribe";
  const outgoing = new FormData();
  outgoing.set("file", file, file.name || "segment.wav");
  outgoing.set("model", model);
  const language = String(incoming.get("language") ?? "").trim();
  if (/^[a-z]{2,3}(-[A-Z]{2})?$/.test(language)) {
    outgoing.set("language", language.split("-")[0]);
  }

  const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireRuntimeValue(
        "OPENAI_API_KEY",
        "AI service is not configured yet.",
      )}`,
      "OpenAI-Safety-Identifier": await pseudonymousIdentifier(user.id),
    },
    body: outgoing,
  });
  const responseBody = await upstream.arrayBuffer();
  if (!upstream.ok) {
    console.error(
      "OpenAI transcription error",
      upstream.status,
      new TextDecoder().decode(responseBody).slice(0, 1_000),
    );
    throw new ServiceError(
      "Transcription is temporarily unavailable.",
      upstream.status === 429 ? 429 : 502,
      "transcription_upstream_error",
    );
  }
  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function createRealtimeToken(
  request: Request,
  user: CueAsideUser,
): Promise<Response> {
  const body = await readJSON<{ language?: string; delay?: string }>(
    request,
    8_000,
  );
  await authorizeAI(user, "realtimeTokens");

  const transcription: Record<string, unknown> = {
    model: "gpt-realtime-whisper",
    delay: ["low", "medium", "high"].includes(body.delay ?? "")
      ? body.delay
      : "low",
  };
  if (/^[a-z]{2,3}$/.test(body.language ?? "")) {
    transcription.language = body.language;
  }

  const upstream = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: await openAIHeaders(user.id),
      body: JSON.stringify({
        session: {
          type: "transcription",
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24_000 },
              transcription,
              turn_detection: null,
            },
          },
        },
      }),
    },
  );
  const payload = await upstream.text();
  if (!upstream.ok) {
    console.error(
      "OpenAI Realtime token error",
      upstream.status,
      payload.slice(0, 1_000),
    );
    throw new ServiceError(
      "Realtime transcription is temporarily unavailable.",
      upstream.status === 429 ? 429 : 502,
      "realtime_upstream_error",
    );
  }
  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
