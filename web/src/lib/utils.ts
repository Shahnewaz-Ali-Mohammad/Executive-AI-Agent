/** Small, framework-free helpers used across components. */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combine Tailwind class names, letting later classes override earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** "2.4 MB", "830 KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
