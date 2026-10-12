import { SignIn } from "@clerk/nextjs";
import { NotConfigured } from "@/components/not-configured";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <NotConfigured />;
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">DifFox</h1>
          <p className="mt-1 text-sm text-neutral-400">Automatic PR reviews with actionable inline comments.</p>
        </div>
        <SignIn routing="hash" />
      </div>
    </div>
  );
}
