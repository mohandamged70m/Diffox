import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskedKey(key: string): string {
  if (!key || key.length <= 4) return "••••";
  return `••••••••${key.slice(-4)}`;
}
