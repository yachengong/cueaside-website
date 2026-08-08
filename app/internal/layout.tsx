import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CueAside Console",
  description: "Private CueAside operations Console.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function InternalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="internal-root">{children}</div>;
}
