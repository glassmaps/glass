import type { Metadata, Viewport } from "next";
import "@fontsource-variable/unbounded";
import "@fontsource-variable/instrument-sans/wdth.css";
import "@fontsource-variable/martian-mono/wdth.css";
import "./globals.css";
import { site } from "@/config/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "Glass · See through every bag", template: "%s · Glass" },
  description: site.description,
  applicationName: "Glass",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "48x48" }],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    siteName: "Glass",
    title: "Glass · See through every bag",
    description: site.description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Glass. See through every bag." }],
  },
  twitter: { card: "summary_large_image", title: "Glass · See through every bag", description: site.description, images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
