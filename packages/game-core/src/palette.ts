/**
 * Seat identity — the single source of truth for who a player *is* on screen.
 *
 * The colours used to be repeated across the factory, renderer, lobby, logo,
 * and CSS. One list, consumed everywhere, makes drift impossible.
 *
 * `pattern` exists because PLAN.md promises "accessible player patterns" and
 * colour alone did not deliver it. Each seat therefore also carries a mark that
 * the renderer cuts into the paddle face, so a paddle is identifiable with the
 * colour channel removed entirely. The marks are chosen to survive at the
 * ~8px paddle thickness a phone actually draws: presence/absence and count,
 * never fine shape.
 *
 * Keep `hex` and `color` in step — `tokens.test.ts` asserts that this table and
 * `tokens.css` agree, and prints both values when they do not.
 */

import type { ActivePalType } from './types'

/** How a paddle face is marked when colour is unavailable or unreliable. */
export type SeatPattern = 'solid' | 'notch' | 'bar' | 'dots'

export interface SeatIdentity {
  /** Position in the seat order; matches the index used by `buildMatchConfig`. */
  index: number
  /** Stable machine name, safe for CSS class names and analytics-free logging. */
  key: string
  /** Short human label used when a player has no name of their own. */
  label: string
  /** Pixi/​WebGL colour. */
  color: number
  /** The same colour for CSS and DOM. */
  hex: string
  /** Colour-independent mark cut into the paddle face. */
  pattern: SeatPattern
  /** Plain-language description of the mark, for screen readers and legends. */
  patternLabel: string
  /** Custom property that carries this colour in `tokens.css`. */
  cssVar: string
}

export const SEAT_PALETTE: readonly SeatIdentity[] = [
  { index: 0, key: 'lime', label: 'Lime', color: 0xdfff68, hex: '#dfff68', pattern: 'solid', patternLabel: 'unmarked', cssVar: '--pg-seat-0' },
  { index: 1, key: 'ember', label: 'Ember', color: 0xf36f44, hex: '#f36f44', pattern: 'notch', patternLabel: 'notched ends', cssVar: '--pg-seat-1' },
  { index: 2, key: 'cyan', label: 'Cyan', color: 0x67d4ff, hex: '#67d4ff', pattern: 'bar', patternLabel: 'centre bar', cssVar: '--pg-seat-2' },
  { index: 3, key: 'violet', label: 'Violet', color: 0xb59cff, hex: '#b59cff', pattern: 'dots', patternLabel: 'three dots', cssVar: '--pg-seat-3' },
] as const

/** Seat identity by index, wrapping rather than throwing on corrupt state. */
export function seatIdentity(index: number): SeatIdentity {
  return SEAT_PALETTE[((index % SEAT_PALETTE.length) + SEAT_PALETTE.length) % SEAT_PALETTE.length]!
}

/** Reverse lookup used by the renderer, which only ever receives `player.color`. */
export function seatIdentityForColor(color: number): SeatIdentity {
  return SEAT_PALETTE.find((seat) => seat.color === color) ?? SEAT_PALETTE[0]!
}

export interface PalIdentity {
  id: ActivePalType
  label: string
  effect: string
  glyph: 'shield' | 'bolt' | 'crown' | 'spark'
  color: number
  hex: string
}

export const PAL_IDENTITIES: Record<ActivePalType, PalIdentity> = {
  guard: { id: 'guard', label: 'Guard Pal', effect: 'Blocks one ball near your goal', glyph: 'shield', color: 0x67d4ff, hex: '#67d4ff' },
  striker: { id: 'striker', label: 'Striker Pal', effect: 'Fires one fast curved return', glyph: 'bolt', color: 0xf36f44, hex: '#f36f44' },
  captain: { id: 'captain', label: 'Pal Captain', effect: 'Splits into two helpers when hit', glyph: 'crown', color: 0xdfff68, hex: '#dfff68' },
  hatchling: { id: 'hatchling', label: 'Hatchling', effect: 'A tiny one-hit helper', glyph: 'spark', color: 0xfffdf7, hex: '#fffdf7' },
}

/** Neutral surfaces the renderer shares with `tokens.css`. */
export const COURT_PALETTE = {
  ink: { color: 0x0b1611, hex: '#0b1611', cssVar: '--pg-ink-900' },
  floor: { color: 0x123f2e, hex: '#123f2e', cssVar: '--pg-forest-700' },
  floorDeep: { color: 0x0e3325, hex: '#0e3325', cssVar: '--pg-forest-800' },
  line: { color: 0x334d3d, hex: '#334d3d', cssVar: '--pg-line-strong' },
  paper: { color: 0xfffdf7, hex: '#fffdf7', cssVar: '--pg-paper' },
  accent: { color: 0xdfff68, hex: '#dfff68', cssVar: '--pg-lime-400' },
} as const
