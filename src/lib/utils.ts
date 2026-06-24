import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0 detik";
  if (seconds < 60) {
    return `${seconds % 1 !== 0 ? seconds.toFixed(1) : seconds} detik`;
  }
  
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m} menit ${s > 0 ? s.toString().padStart(2, '0') + ' detik' : ''}`.trim();
}

export function formatShortDuration(seconds: number | string): string {
  const sec = typeof seconds === "string" ? parseFloat(seconds) : seconds;
  if (!sec || sec <= 0 || isNaN(sec)) return "0s";
  if (sec < 60) {
    return `${sec % 1 !== 0 ? sec.toFixed(1) : sec}s`;
  }
  
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
}
