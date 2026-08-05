export type PublicBetaDownload = {
  url: string;
  sha256?: string;
};

export function publicBetaDownload(): PublicBetaDownload | null {
  const rawURL = process.env.CUEASIDE_BETA_DOWNLOAD_URL?.trim();
  if (!rawURL) return null;

  try {
    const url = new URL(rawURL);
    if (url.protocol !== "https:") return null;

    const rawSHA = process.env.CUEASIDE_BETA_SHA256?.trim().toLowerCase();
    return {
      url: url.toString(),
      sha256: rawSHA && /^[a-f0-9]{64}$/.test(rawSHA) ? rawSHA : undefined,
    };
  } catch {
    return null;
  }
}
