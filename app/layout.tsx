import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://cueaside.com"),
  title: "CueAside — The copilot you could use with the door open",
  description:
    "A macOS speaking copilot for interviews and meetings. It catches the question and hands you one answer you can say. Our servers never keep a word you say — the complete list of what they do keep is printed on the homepage.",
  applicationName: "CueAside",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/cueaside-icon.png",
    shortcut: "/cueaside-icon.png",
    apple: "/cueaside-icon.png",
  },
  openGraph: {
    title: "CueAside — The copilot you could use with the door open",
    description:
      "Presenter notes for live conversation, on macOS. Three kinds of record on our servers, none of them your words — printed on the homepage.",
    url: "https://cueaside.com",
    siteName: "CueAside",
    images: [
      {
        url: "https://cueaside.com/og.png",
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
    title: "CueAside — The copilot you could use with the door open",
    description:
      "Presenter notes for live conversation, on macOS. Three kinds of record on our servers, none of them your words — printed on the homepage.",
    images: ["https://cueaside.com/og.png"],
  },
};

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CueAside",
  url: "https://cueaside.com/",
  description:
    "A macOS speaking copilot for interviews and meetings that surfaces your own preparation as one structured, speakable answer in real time. It never joins the meeting, and its servers do not retain audio, transcripts, or answers.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "macOS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationJsonLd).replace(
              /</g,
              "\\u003c",
            ),
          }}
        />
        {children}
      </body>
    </html>
  );
}
