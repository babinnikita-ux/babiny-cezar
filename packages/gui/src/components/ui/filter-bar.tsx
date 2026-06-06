'use client';

import { useState, type ReactNode } from 'react';
import { cn } from './cn';
import { Sheet } from './sheet';

export interface FilterChip {
  /** Stable key. */
  key: string;
  /** e.g. "State: Open". */
  label: string;
  /** Clears just this filter. */
  onClear: () => void;
}

export interface FilterBarProps {
  /** The search control (caller passes its existing search input). Rendered
   *  full-width on its own row on phone, inline (flex-1) on `sm+`. */
  search?: ReactNode;
  /** Filter controls (the caller's existing `<FilterSelect>`s etc.). Inline +
   *  `flex-wrap` on `sm+`; collapsed into a "Filters" Sheet on phone. */
  filters?: ReactNode;
  /** Count of active secondary filters → badge on the phone "Filters" button. */
  activeCount?: number;
  /** Active-filter chips rendered below the bar (both phone and desktop). */
  chips?: FilterChip[];
  /** Optional trailing node (e.g. a "Clear filters" button) shown inline on `sm+`. */
  trailing?: ReactNode;
  className?: string;
}

/**
 * Responsive filter layout (spec §3.5 / P3). Goal: callers stop hardcoding
 * `min-w-[220px]` / `min-w-[7.5rem]` and the filter row stops overflowing on
 * phones.
 *
 *  - `< sm` (phone): search full-width on its own row; the `filters` collapse
 *    into a "Filters · N" button that opens a bottom `Sheet`; active chips
 *    render below.
 *  - `sm+`: inline `flex-wrap` — search (flex-1) + filters + trailing, like today.
 *
 * Generic enough for issues / prs / actions / skills / cockpit. The caller
 * still owns the actual controls and their state; this only handles layout +
 * the phone disclosure.
 */
export function FilterBar({
  search,
  filters,
  activeCount = 0,
  chips,
  trailing,
  className,
}: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Search: own row on phone, flex-1 inline on sm+. */}
        {search && <div className="w-full sm:flex-1 sm:min-w-[220px]">{search}</div>}

        {/* Phone: a single "Filters" disclosure button. */}
        {filters && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-surface px-3 text-sm text-on-surface transition-colors hover:border-primary sm:hidden"
          >
            Filters
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-on">
                {activeCount}
              </span>
            )}
          </button>
        )}

        {/* Desktop: inline filters. */}
        {filters && <div className="hidden items-center gap-2 sm:flex sm:flex-wrap">{filters}</div>}

        {trailing && <div className="hidden sm:flex sm:items-center">{trailing}</div>}
      </div>

      {/* Active-filter chips. */}
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onClear}
              className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-2.5 py-1 text-xs text-on-surface-variant transition-colors hover:border-primary hover:text-on-surface"
            >
              <span>{c.label}</span>
              <span aria-hidden className="text-on-surface-variant">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Phone filter sheet. */}
      {filters && (
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} side="bottom" title="Filters">
          <div className="flex flex-col gap-4 px-4 py-4 [&_label]:flex [&_label]:flex-col [&_label]:items-stretch [&_label]:gap-1.5 [&_select]:w-full [&_input]:w-full">
            {filters}
            {trailing && <div className="pt-2">{trailing}</div>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
