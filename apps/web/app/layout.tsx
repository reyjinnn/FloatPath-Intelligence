import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "../src/components/Toast";

export const metadata: Metadata = {
  title: "FloatPath — Free float simulation workspace",
  description: "Deterministic free float simulation with synthetic data and traceable evidence. Not a legal compliance assessment.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
