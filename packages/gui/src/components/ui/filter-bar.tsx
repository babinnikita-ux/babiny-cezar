'use client';

import { useState, type ReactNode } from 'react';
import { cn } from './cn';
import { Sheet } from './sheet';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterControl {
  /** Stable id (used for keys). */
  id: string;
  /** e.g. "State". */
  label: string;
  /** Currently-selected value. */
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** The "no filter" value — defaults to options[0].value. Used to detect an
   *  active filter and to reset it from a chip / "Clear". */
  defaultValue?: string;
}

export interface FilterBarProps {
  /** The search control (caller passes its existing search input). Rendered
   *  full-width on its own row on phone, inline (flex-1) on `sm+`. */
  search?: ReactNode;
  /** Structured filter controls. Native `<select>`s inline on `sm+`; tappable
   *  option rows inside a bottom Sheet on phone (no native-select popup). */
  filters?: FilterControl[];
  /** Clears every filter (and usually the search). Shown as "Clear filters"
   *  inline on `sm+` (when any filter is active) and inside the phone sheet. */
  onClearAll?: () => void;
  className?: string;
}

const defaultOf = (f: FilterControl) => f.defaultValue ?? f.options[0]?.value;
const isActive = (f: FilterControl) => f.value !== defaultOf(f);
const labelOf = (f: FilterControl) => f.options.find((o) => o.value === f.value)?.label ?? f.value;

/**
 * Responsive filter layout (spec §3.5 / P3).
 *
 *  - `< sm` (phone): search full-width on its own row; the filters collapse
 *    into a "Filters · N" button that opens a bottom `Sheet` of tappable
 *    option rows; active-filter chips render below.
 *  - `sm+`: inline native `<select>`s + "Clear filters", like today.
 *
 * The phone sheet deliberately avoids native `<select>` (whose dropdown
 * mis-anchors inside an overlay) and never duplicates the controls into the
 * DOM — the desktop selects and the phone rows are separate, breakpoint-gated
 * renderings of the same structured model.
 */
export function FilterBar({ search, filters, onClearAll, className }: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const active = (filters ?? []).filter(isActive);
  const activeCount = active.length;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Search: own row on phone, flex-1 inline on sm+. */}
        {search && <div className="w-full sm:flex-1 sm:min-w-[220px]">{search}</div>}

        {/* Phone: a single "Filters" disclosure button. */}
        {filters && filters.length > 0 && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-surface px-3 text-sm text-on-surface transition-colors hover:border-primary sm:hidden"
          >
            <FilterIcon className="h-4 w-4 text-on-surface-variant" />
            Filters
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-on">
                {activeCount}
              </span>
            )}
          </button>
        )}

        {/* Desktop: inline native selects. */}
        {filters && filters.length > 0 && (
          <div className="hidden items-center gap-2 sm:flex sm:flex-wrap">
            {filters.map((f) => (
              <label key={f.id} className="flex items-center gap-2">
                <span className="font-display text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
                  {f.label}
                </span>
                <select
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  className="h-9 rounded-md border border-outline-variant bg-surface px-2 text-sm text-on-surface focus:border-primary focus:outline-none sm:min-w-[7.5rem]"
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {onClearAll && activeCount > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="h-9 rounded-md border border-outline-variant bg-surface px-3 text-sm text-on-surface-variant transition-colors hover:border-primary hover:text-on-surface"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Phone: active-filter chips below the bar (tap to clear that filter). */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
          {active.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => f.onChange(defaultOf(f))}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary-container/15 px-2.5 py-1 text-xs text-on-surface transition-colors"
            >
              <span className="text-on-surface-variant">{f.label}:</span>
              <span className="font-medium">{labelOf(f)}</span>
              <span aria-hidden className="text-on-surface-variant">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Phone filter sheet — tappable option rows, no native <select>. */}
      {filters && filters.length > 0 && (
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} side="bottom" title="Filters">
          <div className="flex flex-col gap-6 px-4 py-4">
            {filters.map((f) => (
              <fieldset key={f.id}>
                <legend className="mb-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
                  {f.label}
                </legend>
                <div className="overflow-hidden rounded-lg border border-outline-variant">
                  {f.options.map((o, i) => {
                    const selected = o.value === f.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => f.onChange(o.value)}
                        className={cn(
                          'flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm transition-colors',
                          i > 0 && 'border-t border-outline-variant',
                          selected
                            ? 'bg-primary-container/20 font-medium text-on-surface'
                            : 'bg-surface text-on-surface-variant hover:bg-surface-container',
                        )}
                        aria-pressed={selected}
                      >
                        <span>{o.label}</span>
                        {selected && <CheckIcon className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            <div className="flex items-center gap-2 pt-1">
              {onClearAll && (
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                  }}
                  disabled={activeCount === 0}
                  className="h-11 flex-1 rounded-md border border-outline-variant bg-surface text-sm text-on-surface-variant transition-colors hover:border-primary hover:text-on-surface disabled:opacity-40"
                >
                  Clear all
                </button>
              )}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="h-11 flex-1 rounded-md bg-primary text-sm font-semibold text-primary-on"
              >
                Done
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
