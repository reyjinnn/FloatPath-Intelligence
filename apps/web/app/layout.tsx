import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FloatPath — Workspace simulasi free float",
  description: "Simulasi free float deterministik dengan data sintetis dan bukti yang dapat ditelusuri. Bukan penilaian kepatuhan hukum.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="id"><body>{children}</body></html>;
}
