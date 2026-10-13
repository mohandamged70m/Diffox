interface GitHubAccount { id: number | bigint; login: string; type: string }
interface IdentityReader {
  currentUser(): Promise<{ id: number | bigint }>;
  organizationMembership(org: string): Promise<{ state: string; role: string }>;
}

/** Only the personal owner or an active organization owner can bind all App repos. */
export async function verifyInstallationOwner(account: GitHubAccount, identity: IdentityReader): Promise<void> {
  const user = await identity.currentUser();
  if (account.type === "User" && String(user.id) === String(account.id)) return;
  if (account.type === "Organization") {
    const membership = await identity.organizationMembership(account.login);
    if (membership.state === "active" && membership.role === "admin") return;
  }
  throw new Error("Installation ownership could not be verified.");
}
