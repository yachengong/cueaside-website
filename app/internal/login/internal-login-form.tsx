"use client";

import { FormEvent, useState } from "react";

interface ErrorPayload {
  error?: { message?: string };
}

async function postJSON(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Try again in a moment.");
  }
}

export default function InternalLoginForm() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await postJSON("/api/internal/auth/request-code/", { email });
      setSent(true);
      setMessage("Open the secure sign-in link sent to this email.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="internal-login-form" onSubmit={submit} noValidate>
      <label htmlFor="internal-email">Work email</label>
      <input
        id="internal-email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        readOnly={sent}
        required
      />
      <button type="submit" disabled={busy}>
        {busy ? "Sending…" : sent ? "Send another link" : "Send sign-in link"}
      </button>
      {sent ? (
        <button
          className="internal-text-button"
          type="button"
          onClick={() => {
            setSent(false);
            setMessage("");
          }}
          disabled={busy}
        >
          Use a different email
        </button>
      ) : null}
      <p className="internal-form-message" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
