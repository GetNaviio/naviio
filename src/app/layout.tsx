import type { Metadata } from "next";
import { Sora, Inter } from "next/font/google";
import "./globals.css";
import NgrokPatch from "@/components/NgrokPatch";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Naviio",
  description: "Your financial co-pilot. CFO-level intelligence for SMBs — connect Plaid, QuickBooks, Stripe and more.",
  other: {
    // Meta Business Manager domain verification (Brand safety → Domains)
    "facebook-domain-verification": "6c7pznb62xedhfbhl2l50cix06fckp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NgrokPatch />
        {children}
      </body>
    </html>
  );
}
