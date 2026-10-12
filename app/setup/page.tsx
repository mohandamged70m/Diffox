import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SetupForm } from "./setup-form";

export default function SetupPage() {
  const id = cookies().get("diffox_session")?.value;
  if (getSession(id)) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
      <p className="text-xs uppercase tracking-widest text-neutral-500">DiffFox · First run</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Connect your AI provider</h1>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">
        Reviews run through your own key on the server. Nothing is stored in the browser —
        the key lives in a server-side session tied to an HttpOnly cookie.
      </p>
      <SetupForm />
      <p className="mt-6 text-xs leading-relaxed text-neutral-600">
        Default: OpenCode Zen at <span className="font-mono">https://opencode.ai/zen/v1</span> (OpenAI-compatible
        <span className="font-mono"> /models</span> + <span className="font-mono">/chat/completions</span>).
        No free model is assumed — enter any model ID your key can access.
      </p>
    </main>
  );
}
