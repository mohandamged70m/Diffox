import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";

/**
 * Server-only GitHub App helpers (Octokit).
 * Required env: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM), GITHUB_WEBHOOK_SECRET.
 */

export function githubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_PRIVATE_KEY &&
      process.env.GITHUB_WEBHOOK_SECRET
  );
}

function appOctokit(): InstanceType<typeof Octokit> {
  const appId = process.env.GITHUB_APP_ID;
  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY || "";
  if (!appId || !privateKey) throw new Error("GitHub App is not configured.");
  // Allow base64-encoded PEM (avoids multiline env issues on some hosts).
  if (!privateKey.includes("BEGIN")) {
    try {
      privateKey = Buffer.from(privateKey, "base64").toString("utf8");
    } catch {
      /* keep as-is; Octokit will raise a clear error */
    }
  }
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });
}

/** Short-lived installation access token for a given installation. */
export async function createInstallationToken(installationId: number): Promise<string> {
  const app = appOctokit();
  const { token } = (await app.auth({ type: "installation", installationId })) as { token: string };
  return token;
}

/** Authenticated Octokit scoped to one installation. */
export async function installationOctokit(installationId: number): Promise<InstanceType<typeof Octokit>> {
  const token = await createInstallationToken(installationId);
  return new Octokit({ auth: token });
}

export function appInstallUrl(appSlug?: string): string {
  const slug = appSlug || process.env.GITHUB_APP_SLUG;
  return slug ? `https://github.com/apps/${slug}/installations/new` : "/settings";
}
