import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
});

export const metadata: Metadata = {
  /**
   * Without this, Next resolves every relative og:image against
   * localhost:3000 and warns at build time. Most covers are absolute
   * URLs on the API origin and would survive its absence — the seeded
   * articles are not, and those are exactly the ones nobody notices
   * are broken until a share card comes back blank.
   */
  metadataBase: new URL(siteUrl()),
  title: "O Patriota",
  description: "Notícias e informação.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-PT"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
