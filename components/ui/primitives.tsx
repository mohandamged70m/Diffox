import * as React from "react";
import { cn } from "@/lib/utils";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("h-9 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus-ring", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-xs leading-relaxed text-neutral-100 placeholder:font-sans placeholder:text-sm placeholder:text-neutral-500 focus-ring", props.className)} />;
}

export function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={cn("mb-1.5 block text-xs font-medium uppercase tracking-wide text-neutral-400", props.className)} />;
}

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("rounded-lg border border-neutral-800 bg-neutral-900/60", props.className)} />;
}

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "critical" | "high" | "medium" | "low" | "info" | "ok" | "warn" }) {
  const tones: Record<string, string> = {
    neutral: "border-neutral-700 text-neutral-300",
    critical: "border-red-800 bg-red-950/60 text-red-300",
    high: "border-orange-800 bg-orange-950/60 text-orange-300",
    medium: "border-yellow-800 bg-yellow-950/60 text-yellow-200",
    low: "border-neutral-700 text-neutral-400",
    info: "border-neutral-700 text-neutral-300",
    ok: "border-emerald-800 bg-emerald-950/50 text-emerald-300",
    warn: "border-yellow-800 bg-yellow-950/40 text-yellow-200",
  };
  return <span {...props} className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)} />;
}

export function Alert({ kind = "info", className, ...props }: React.HTMLAttributes<HTMLDivElement> & { kind?: "info" | "error" | "warn" | "ok" }) {
  const kinds = {
    info: "border-neutral-700 bg-neutral-900 text-neutral-200",
    error: "border-red-900 bg-red-950/40 text-red-200",
    warn: "border-yellow-900 bg-yellow-950/30 text-yellow-100",
    ok: "border-emerald-900 bg-emerald-950/40 text-emerald-200",
  };
  return <div role="alert" {...props} className={cn("rounded-md border px-3 py-2.5 text-sm", kinds[kind], className)} />;
}
