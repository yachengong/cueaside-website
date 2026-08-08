"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ErrorPayload {
  error?: { message?: string };
}

export default function InternalLinkCompletion() {
  const router = useRouter();
  const [message, setMessage] = useState("Opening your Console…");

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = fragment.get("access_token") ?? "";
      const providerError = fragment.get("error_description");
      window.history.replaceState(null, "", window.location.pathname);

      if (providerError || !accessToken) {
        setMessage(providerError || "This sign-in link is invalid or expired.");
        return;
      }

      try {
        const response = await fetch("/api/internal/auth/complete-link/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        const payload = (await response.json().catch(() => ({}))) as ErrorPayload;
        if (!response.ok) {
          throw new Error(
            payload.error?.message ?? "This sign-in link could not be verified.",
          );
        }
        if (!cancelled) {
          router.replace("/internal/");
          router.refresh();
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Try again.");
        }
      }
    }

    void complete();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <>
      <p className="internal-login-copy">{message}</p>
      <a className="internal-text-button" href="/internal/login/">
        Return to sign in
      </a>
    </>
  );
}
