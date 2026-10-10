"use client";

/** Small search box for filtering a list in the sidebar. */
import { Search, X } from "lucide-react";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}

export function SearchField({ value, onChange, placeholder, label }: SearchFieldProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-slate" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && onChange("")}
        placeholder={placeholder}
        aria-label={label}
        className="w-full rounded-md border border-rule bg-paper py-1.5 pr-8 pl-8 text-sm text-ink placeholder:text-slate/70 focus:border-ledger focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-slate hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
