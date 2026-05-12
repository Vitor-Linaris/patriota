import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./admin.css";

const inter = Inter({
  variable: "--font-admin-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "Backoffice — O Patriota",
  description: "Acesso reservado a administradores.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${inter.variable}`} style={{ fontFamily: "var(--font-admin-inter)" }}>
      {children}
    </div>
  );
}
