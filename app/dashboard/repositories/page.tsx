import { Alert, Card } from "@/components/ui/primitives";

export default function RepositoriesPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-400">Prepared for GitHub App integration. No code is pulled automatically yet.</p>
      <Alert kind="warn">GitHub integration not configured. Connect a GitHub App in Settings to enable automatic pull-request reviews. Manual diff reviews work today via New Review.</Alert>
      <Card className="mt-4 p-5 text-sm text-neutral-400">
        Planned data model: <span className="font-mono">repositories(id, fullName, installationId, defaultBranch, connectedAt)</span> with
        webhook deliveries stored per pull request. Until then this page intentionally shows no repositories.
      </Card>
    </div>
  );
}
