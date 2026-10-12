export function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-md space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-sm text-amber-200">
        <h1 className="text-lg font-semibold text-amber-100">Authentication not configured</h1>
        <p>Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> (see README and <code>.env.example</code>), then restart the app to sign in.</p>
      </div>
    </div>
  );
}
