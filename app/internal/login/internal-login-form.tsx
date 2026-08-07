"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Step = "email" | "code";

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
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (step === "email") {
        await postJSON("/api/internal/auth/request-code/", { email });
        setStep("code");
        setMessage("If this account can sign in, a code is on its way.");
      } else {
        await postJSON("/api/internal/auth/verify-code/", { email, token });
        router.replace("/internal/");
        router.refresh();
      }
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
        readOnly={step === "code"}
        required
      />
      {step === "code" ? (
        <>
          <label htmlFor="internal-code">One-time code</label>
          <input
            id="internal-code"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            value={token}
            onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))}
            required
            autoFocus
          />
        </>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Checking…" : step === "email" ? "Send code" : "Open Console"}
      </button>
      {step === "code" ? (
        <button
          className="internal-text-button"
          type="button"
          onClick={() => {
            setStep("email");
            setToken("");
            setMessage("");
          }}
          disabled={busy}
        >
          Use a different account
        </button>
      ) : null}
      <p className="internal-form-message" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
