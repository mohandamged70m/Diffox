import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiffFox — AI Code Review",
  description: "Personal AI code-review dashboard. Manual reviews first, GitHub automation later.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-neutral-950 text-neutral-100">{children}</body>
    </html>
  );
}
