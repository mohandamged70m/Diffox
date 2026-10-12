import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReviewKit — AI PR Reviews",
  description: "CodeRabbit-style GitHub PR reviewer. Automatic summary plus actionable inline comments.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>;
  // Without keys the app still boots and pages show honest "not configured" states.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <html lang="en" className="dark">{body}</html>;
  }
  return (
    <html lang="en" className="dark">
      <ClerkProvider>{body}</ClerkProvider>
    </html>
  );
}
