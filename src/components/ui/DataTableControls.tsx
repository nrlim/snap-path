"use client";

import { Search } from "lucide-react";

export type SortDirection = "asc" | "desc";

export function TableSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-md border border-border bg-surface py-2.5 pl-9 pr-3 text-base text-text focus:border-primary focus:outline-none sm:text-sm"
      />
    </label>
  );
}

export function SortButton<T extends string>({ field, label, sortField, sortDirection, onSort }: { field: T; label: string; sortField: T; sortDirection: SortDirection; onSort: (field: T) => void }) {
  const isActive = sortField === field;
  return (
    <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 font-semibold hover:text-text">
      {label}
      <span className={`text-[10px] ${isActive ? "text-primary" : "text-text-faint"}`}>{isActive ? (sortDirection === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

export function TablePagination({ total, visible, currentPage, totalPages, onPrev, onNext }: { total: number; visible: number; currentPage: number; totalPages: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-text-subtle">Menampilkan {visible} dari {total} data</p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} disabled={currentPage === 1} className="rounded-md border border-border px-3 py-2 text-sm text-text-subtle disabled:opacity-40">Prev</button>
        <span className="text-sm font-semibold text-text">{currentPage} / {totalPages}</span>
        <button type="button" onClick={onNext} disabled={currentPage === totalPages} className="rounded-md border border-border px-3 py-2 text-sm text-text-subtle disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export const defaultPageSizes = [5, 10, 20];
