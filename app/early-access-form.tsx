"use client";

import { useId, useState, type FormEvent } from "react";

type FormStatus = "idle" | "sending" | "done" | "error";

export default function EarlyAccessForm({
  source = "landing",
  note = "Email only — one of the three things our servers ever hold.",
}: {
  source?: string;
  note?: string;
}) {
  const fieldId = useId();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") {
      return;
    }

    setStatus("sending");
    setMessage("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "Something went wrong. Please try again.",
        );
      }
      setStatus("done");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error && error.message !== "Failed to fetch"
          ? error.message
          : "The signup service is unreachable right now. Please try again soon.",
      );
    }
  }

  if (status === "done") {
    return (
      <div className="waitlist-done" role="status">
        <b>Recorded.</b> Your email is on the list and nothing else was stored
        with it. You&rsquo;ll hear the price and the download link before anyone
        is charged.
      </div>
    );
  }

  return (
    <form className="waitlist" onSubmit={submit} noValidate>
      <div className="waitlist-row">
        <input
          id={fieldId}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          aria-label="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Join the list"}
        </button>
      </div>
      {status === "error" ? (
        <p className="waitlist-error" role="alert">
          {message}
        </p>
      ) : (
        <p className="waitlist-note">{note}</p>
      )}
    </form>
  );
}
