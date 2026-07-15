import type { CSSProperties } from 'react'

import type { GithubItem } from '@/api/types'

/**
 * Pure filtering + label-color helpers for the GitHub tab (#gh-filter). Kept apart from the
 * component so the "search by #id or text, narrow by labels" rules are table-testable and match
 * GitHub's own semantics: multiple selected labels AND together (an item must carry them all).
 */

/** Every distinct label across the items, case-insensitively sorted — the filter dropdown's list. */
export function allLabels(items: readonly GithubItem[]): string[] {
  const set = new Set<string>()
  for (const item of items) for (const label of item.labels) set.add(label)
  return [...set].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
}

/**
 * Filter by a free-text query and a set of required labels.
 *  - `query`: `#123`/`123` matches the number; anything else is a case-insensitive substring
 *    over the number, title, author and body.
 *  - `labels`: the item must carry EVERY selected label (AND, like GitHub's label filter).
 */
export function filterGithubItems(
  items: readonly GithubItem[],
  opts: { query?: string; labels?: readonly string[] } = {},
): GithubItem[] {
  const query = (opts.query ?? '').trim().toLowerCase()
  const required = opts.labels ?? []
  const numeric = query.replace(/^#/, '')
  const idOnly = numeric !== '' && /^\d+$/.test(numeric)
  return items.filter((item) => {
    if (required.length > 0 && !required.every((label) => item.labels.includes(label))) return false
    if (query === '') return true
    if (idOnly) return String(item.number).includes(numeric)
    const haystack = `#${item.number} ${item.title} ${item.author} ${item.body}`.toLowerCase()
    return haystack.includes(query)
  })
}

/** Perceived luminance of a 6-hex color (sRGB, 0–1) — decides light vs dark chip text. */
function luminance(hex: string): number {
  const h = hex.replace(/^#/, '')
  if (h.length !== 6) return 1 // unknown → treat as light so we default to dark text
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Inline style for a label chip tinted like GitHub: the label color as a translucent fill with a
 *  matching border, and readable text. Falls back to neutral tokens when no color is known. */
export function labelChipStyle(color: string | undefined): CSSProperties {
  if (!color || !/^[0-9a-fA-F]{6}$/.test(color)) {
    return { borderColor: 'var(--border)', color: 'var(--soft-foreground)' }
  }
  const solid = `#${color}`
  return {
    backgroundColor: `${solid}22`, // ~13% opacity fill, like GitHub's label pills
    borderColor: `${solid}66`,
    color: luminance(color) < 0.5 ? `#${lighten(color)}` : solid,
  }
}

/** Lift a dark label color toward legibility on dark chips (mix halfway to white). */
function lighten(hex: string): string {
  const h = hex.replace(/^#/, '')
  const parts = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16)
    return Math.round(v + (255 - v) * 0.55)
  })
  return parts.map((v) => v.toString(16).padStart(2, '0')).join('')
}
