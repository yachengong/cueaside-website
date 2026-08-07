type ExternalService = "openai" | "deepgram" | "supabase";

type ExternalOperation =
  | "answer"
  | "reply_check"
  | "transcription"
  | "realtime_token"
  | "deepgram_grant"
  | "storage_request"
  | "auth_delete";

/**
 * Provider telemetry has a deliberately closed schema. Never add request or
 * response bodies, prompts, transcripts, answers, email addresses, user IDs,
 * URLs containing query data, or arbitrary error messages here.
 */
function logExternalCall(input: {
  service: ExternalService;
  operation: ExternalOperation;
  status: number;
  startedAt: number;
}): void {
  const status = Number.isInteger(input.status) && input.status >= 0
    ? Math.min(input.status, 999)
    : 0;
  const durationMs = Math.max(
    0,
    Math.min(300_000, Math.round(Date.now() - input.startedAt)),
  );
  const succeeded = status >= 200 && status < 400;
  const record = JSON.stringify({
    level: succeeded ? "info" : "error",
    event: "external_call",
    service: input.service,
    operation: input.operation,
    status,
    durationMs,
  });

  if (succeeded) {
    console.log(record);
  } else {
    console.error(record);
  }
}

export async function observeExternalCall(
  input: {
    service: ExternalService;
    operation: ExternalOperation;
  },
  call: () => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now();
  try {
    const response = await call();
    logExternalCall({
      ...input,
      status: response.status,
      startedAt,
    });
    return response;
  } catch (error) {
    logExternalCall({
      ...input,
      status: 0,
      startedAt,
    });
    throw error;
  }
}
