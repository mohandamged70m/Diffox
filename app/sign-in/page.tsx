import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-50">ReviewKit</h1>
          <p className="mt-1 text-sm text-neutral-400">Automatic PR reviews with actionable inline comments.</p>
        </div>
        <SignIn routing="hash" />
      </div>
    </div>
  );
}
