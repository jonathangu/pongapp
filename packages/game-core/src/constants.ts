import type { AbilityId, AiDifficulty, GameMode, ItemIntensity, Side } from './types'

export const TICK_RATE = 60
export const TICK_SECONDS = 1 / TICK_RATE
export const PADDLE_OFFSET = 0.045
export const BASE_PADDLE_LENGTH = 0.22
export const GROWN_PADDLE_LENGTH = BASE_PADDLE_LENGTH * 1.35
export const PADDLE_SPEED = 1.35
export const BALL_START_SPEED = 0.48
export const BALL_SPEED_CAP = 1.12
export const BALL_SPEED_RAMP = 1.035
export const BALL_RADIUS = 0.015
export const MATCH_COUNTDOWN_TICKS = 3 * TICK_RATE
export const SERVE_DELAY_TICKS = Math.round(0.75 * TICK_RATE)

export const ABILITY_COOLDOWNS: Record<AbilityId, number> = {
  dash: 10 * TICK_RATE,
  bend: 12 * TICK_RATE,
  guard: 14 * TICK_RATE,
  pulse: 12 * TICK_RATE,
}

export const AI_PROFILE: Record<AiDifficulty, { reactionTicks: number; error: number }> = {
  rookie: { reactionTicks: 30, error: 0.14 },
  rally: { reactionTicks: 18, error: 0.08 },
  pro: { reactionTicks: 10, error: 0.035 },
  ace: { reactionTicks: 5, error: 0.012 },
}

export function defaultScoreToWin(mode: GameMode): number {
  return mode === 'crosscourt' ? 9 : 7
}

export function defaultPlayerCount(mode: GameMode): number {
  if (mode === 'duel') return 2
  return 4
}

/**
 * Which walls a duel is played across.
 *
 * `vertical` is the default and puts you at the bottom of the screen looking up
 * the court, which is where a player expects to be. It is also the only seating
 * that works for two people sharing one phone: left and right makes both of them
 * reach across a portrait screen with each hand covering the other's half, while
 * top and bottom gives each player their own end of the device.
 *
 * `horizontal` is kept for the classic side-on arcade look. It is a seating
 * choice only — the simulation treats all four walls identically, and a duel on
 * top/bottom bounces off the unmanned left and right walls exactly as a
 * horizontal duel bounces off top and bottom.
 */
export type SeatAxis = 'horizontal' | 'vertical'

/**
 * Seat order. **Seat 0 is always the bottom wall.**
 *
 * Every sports game puts you at the near end of the pitch, and PongApp did the
 * opposite: seat 0 sat on the *left* wall, so the player watched their own
 * paddle side-on from an umpire's chair while their opponent had the mirror
 * image. Ordering the walls bottom-first means the local player — who is always
 * seat 0 in a local match, and slot 0 as an online host — is at the bottom of
 * the screen, facing up the court, without the renderer needing to rotate
 * anything.
 *
 * Crosscourt pairing is unaffected: teams are `0,1` and `2,3`, so partners are
 * still on opposite walls (bottom+top against left+right) exactly as they were
 * when the order was left-first.
 */
export function sidesForMode(
  mode: GameMode,
  count = defaultPlayerCount(mode),
  axis: SeatAxis = 'vertical',
): Side[] {
  if (mode === 'duel') return axis === 'vertical' ? ['bottom', 'top'] : ['left', 'right']
  return ['bottom', 'top', 'left', 'right'].slice(0, Math.max(3, Math.min(4, count))) as Side[]
}

export function nextPowerUpDelay(intensity: ItemIntensity, random: number): number {
  if (intensity === 'off') return Number.MAX_SAFE_INTEGER
  const [minimum, spread] = intensity === 'wild' ? [6, 4] : [12, 6]
  return Math.round((minimum + random * spread) * TICK_RATE)
}
