import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { SmoothScroll } from "@/components/smooth-scroll";
import { Toaster } from "@/components/ui/sonner";
import { NAVY, SITE } from "@/lib/site";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "opsz"],
  display: "swap",
});

const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const title = `${SITE.name}: a paid API that pays its holders`;

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: { default: title, template: `%s · ${SITE.name}` },
  description: SITE.oneSentence,
  applicationName: SITE.name,
  keywords: [
    "x402",
    "Monad",
    "USDC",
    "revenue share",
    "ERC-20",
    "agentic payments",
  ],
  openGraph: {
    title,
    description: SITE.oneSentence,
    siteName: SITE.name,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: SITE.oneSentence,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: NAVY,
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${fraunces.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Providers>
          <SmoothScroll>{children}</SmoothScroll>
          <Toaster position="bottom-center" />
        </Providers>
      </body>
    </html>
  );
}
