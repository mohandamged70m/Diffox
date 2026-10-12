import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-400">Keys never leave the server. The browser only sees a masked indicator.</p>
      <SettingsClient />
    </div>
  );
}
