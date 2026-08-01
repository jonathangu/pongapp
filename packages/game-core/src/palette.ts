/**
 * Seat identity — the single source of truth for who a player *is* on screen.
 *
 * Before this file the four seat colours existed in five places: `factory.ts`
 * (`COLORS`), `PixiCourt.ts` (`POWER_COLORS` plus inline literals), the lobby
 * list in `OnlineRoom.tsx`, the inline `<svg>` logo in `App.tsx`, and
 * `tokens.css`. They had already drifted apart in one place — the lobby dot
 * order is positional while the court colour comes from the seat index — so a
 * three-player Arena lobby could show a player as violet and then hand them a
 * cyan paddle. One list, consumed everywhere, makes that class of bug
 * impossible.
 *
 * `pattern` exists because PLAN.md promises "accessible player patterns" and
 * colour alone did not deliver them. Seat 2 (#67d4ff) and seat 3 (#b59cff) are
 * a cyan/violet pair: under deuteranopia and in the greyscale of a screenshot
 * they collapse toward each other. Each seat therefore also carries a mark that
 * the renderer cuts into the paddle face, so a paddle is identifiable with the
 * colour channel removed entirely. The marks are chosen to survive at the
 * ~8px paddle thickness a phone actually draws: presence/absence and count,
 * never fine shape.
 *
 * Keep `hex` and `color` in step — `tokens.test.ts` asserts that this table and
 * `tokens.css` agree, and prints both values when they do not.
 */

import type { PowerUpId } from './types'

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

/** Seat identity by index, wrapping rather than throwing so a five-seat future degrades. */
export function seatIdentity(index: number): SeatIdentity {
  return SEAT_PALETTE[((index % SEAT_PALETTE.length) + SEAT_PALETTE.length) % SEAT_PALETTE.length]!
}

/** Reverse lookup used by the renderer, which only ever receives `player.color`. */
export function seatIdentityForColor(color: number): SeatIdentity {
  return SEAT_PALETTE.find((seat) => seat.color === color) ?? SEAT_PALETTE[0]!
}

/**
 * Power-up identity.
 *
 * The old HUD labelled an orb with `id.slice(0, 1).toUpperCase()`, which gives
 * **G** for both `grow` and `gravity` — the two power-ups least alike in effect.
 * `glyph` is a shape the renderer draws with vectors rather than a letter in a
 * webfont, so the orb is readable before Manrope has loaded and in any locale.
 */
export type PowerUpGlyph = 'extend' | 'chevron' | 'orbs' | 'gate' | 'well'

export interface PowerUpIdentity {
  id: PowerUpId
  label: string
  /** One line of plain language, used by the HUD ticker and screen readers. */
  effect: string
  glyph: PowerUpGlyph
  color: number
  hex: string
}

export const POWER_UP_IDENTITIES: Record<PowerUpId, PowerUpIdentity> = {
  grow: { id: 'grow', label: 'Grow', effect: 'Your paddle gets longer for six seconds', glyph: 'extend', color: 0xdfff68, hex: '#dfff68' },
  overdrive: { id: 'overdrive', label: 'Overdrive', effect: 'Your next return is launched', glyph: 'chevron', color: 0xf36f44, hex: '#f36f44' },
  multiball: { id: 'multiball', label: 'Multiball', effect: 'A second ball joins the rally', glyph: 'orbs', color: 0xfffdf7, hex: '#fffdf7' },
  warp: { id: 'warp', label: 'Warp gates', effect: 'Two gates teleport the ball across the court', glyph: 'gate', color: 0xb59cff, hex: '#b59cff' },
  gravity: { id: 'gravity', label: 'Gravity well', effect: 'The centre of the court pulls the ball in', glyph: 'well', color: 0x67d4ff, hex: '#67d4ff' },
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
