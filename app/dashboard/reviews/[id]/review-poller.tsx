"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

export function ReviewPoller({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const active = status === "queued" || status === "working";

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);

  if (status !== "failed") return null;
  return (
    <Button variant="outline" disabled={retrying} onClick={async () => {
      setRetrying(true);
      await fetch(`/api/reviews/${id}/retry`, { method: "POST" });
      setRetrying(false);
      router.refresh();
    }}>
      {retrying ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}Retry review
    </Button>
  );
}
