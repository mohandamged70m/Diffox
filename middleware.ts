import { NextResponse, type NextRequest } from "next/server";

const CONFIGURED = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

type MiddlewareFn = (req: NextRequest) => Promise<Response | undefined>;
let cached: MiddlewareFn | null = null;

/**
 * Clerk protection when credentials exist; plain pass-through otherwise so the
 * app boots without credentials and pages show honest "not configured" states.
 */
export default async function middleware(req: NextRequest) {
  if (!CONFIGURED) return NextResponse.next();
  if (!cached) {
    const { clerkMiddleware, createRouteMatcher } = await import("@clerk/nextjs/server");
    const isPublic = createRouteMatcher([
      "/",
      "/sign-in(.*)",
      "/sign-up(.*)",
      "/api/health",
      "/api/webhooks/github",
    ]);
    cached = clerkMiddleware(async (auth, request) => {
      if (!isPublic(request)) await auth.protect();
    }) as unknown as MiddlewareFn;
  }
  return cached(req);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
