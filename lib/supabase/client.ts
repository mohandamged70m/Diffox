"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (anon key only). Used sparingly; privileged access stays server-side. */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
