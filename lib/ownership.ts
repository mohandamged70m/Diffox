/**
 * Account-ownership guard for dashboard API routes.
 * Mismatch returns 404 (not 403) so cross-account existence never leaks.
 */
export function assertOwns(accountId: string, rowAccountId: string): void {
  if (accountId !== rowAccountId) {
    const err = new Error("Not found.") as Error & { status?: number };
    err.status = 404;
    throw err;
  }
}
