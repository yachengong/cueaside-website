import Link from "next/link";
import { publicBetaDownload } from "@/lib/public-beta";
import EarlyAccessForm from "./early-access-form";

export default function BetaAccess({
  source,
  note,
}: {
  source: string;
  note?: string;
}) {
  const beta = publicBetaDownload();

  if (!beta) {
    return <EarlyAccessForm source={source} note={note} />;
  }

  return (
    <div className="beta-download" id={`${source}-download`}>
      <div className="beta-download-actions">
        <a className="beta-download-primary" href={beta.url}>
          Download CueAside beta
        </a>
        <Link className="beta-download-guide" href="/install/">
          Installation guide
        </Link>
      </div>
      <p className="beta-download-note">
        macOS 15.3+ · Apple Silicon and Intel · Private beta
        {beta.sha256 ? ` · SHA-256 ${beta.sha256.slice(0, 12)}…` : ""}
      </p>
    </div>
  );
}
