"use client";

import { useState, type FormEvent } from "react";

type FormStatus = "idle" | "sending" | "done" | "error";

export default function EarlyAccessForm() {
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
        body: JSON.stringify({ email, source: "landing-early-access" }),
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
        <span aria-hidden="true">✓</span>
        You’re on the list. We’ll email you when your invite is ready.
      </div>
    );
  }

  return (
    <form className="waitlist-form" onSubmit={submit} noValidate>
      <div className="waitlist-row">
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          aria-label="Email address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button
          className="waitlist-submit"
          type="submit"
          disabled={status === "sending"}
        >
          {status === "sending" ? "Joining…" : "Join early access"}
        </button>
      </div>
      {status === "error" ? (
        <p className="waitlist-error" role="alert">
          {message}
        </p>
      ) : (
        <p className="waitlist-note">
          Early access invites go out in small batches. No spam—just your
          download link.
        </p>
      )}
    </form>
  );
}
