import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mavera",
  description:
    "A paid API sells its future revenue as on-chain shares; every x402 call's payment is distributed to share holders within one Monad block.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
