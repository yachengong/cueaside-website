import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://cueaside.com"),
  title: "CueAside — The right words, right when you need them",
  description:
    "An AI speaking copilot for interviews and meetings. Start with a clear opening, then follow a natural, structured answer grounded in your own context.",
  applicationName: "CueAside",
  icons: {
    icon: "/cueaside-icon.png",
    shortcut: "/cueaside-icon.png",
    apple: "/cueaside-icon.png",
  },
  openGraph: {
    title: "CueAside — Speak clearly when it matters",
    description:
      "AI-powered, context-aware speaking guidance for interviews and meetings.",
    url: "https://cueaside.com",
    siteName: "CueAside",
    images: [
      {
        url: "/cueaside-social.png",
        width: 1200,
        height: 630,
        alt: "CueAside AI speaking copilot",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CueAside — Speak clearly when it matters",
    description:
      "AI-powered, context-aware speaking guidance for interviews and meetings.",
    images: ["/cueaside-social.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
