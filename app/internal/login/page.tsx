import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  internalAdminPrincipalForToken,
  internalSessionCookieName,
} from "@/lib/server/internal-auth";
import InternalLoginForm from "./internal-login-form";

export const dynamic = "force-dynamic";

export default async function InternalLoginPage() {
  const cookieStore = await cookies();
  const principal = await internalAdminPrincipalForToken(
    cookieStore.get(internalSessionCookieName())?.value ?? null,
  );
  if (principal) redirect("/internal/");

  return (
    <main className="internal-login-shell">
      <section className="internal-login-card" aria-labelledby="console-title">
        <div className="internal-brand-mark" aria-hidden="true">C</div>
        <p className="internal-kicker">Private operations</p>
        <h1 id="console-title">CueAside Console</h1>
        <p className="internal-login-copy">
          Sign in with an approved administrator account. This Console never
          exposes conversation content.
        </p>
        <InternalLoginForm />
      </section>
    </main>
  );
}
