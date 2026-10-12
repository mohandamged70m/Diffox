const COLORS: Record<string, string> = {
  queued: "bg-neutral-800 text-neutral-300",
  running: "bg-blue-500/15 text-blue-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  skipped: "bg-neutral-800 text-neutral-500",
  superseded: "bg-amber-500/15 text-amber-300",
  failed: "bg-red-500/15 text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs ${COLORS[status] || COLORS.queued}`}>{status}</span>;
}
