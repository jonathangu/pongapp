import type { AbilityId, AiDifficulty, GameMode, ItemIntensity, Side } from './types'

export const TICK_RATE = 60
export const TICK_SECONDS = 1 / TICK_RATE
export const PADDLE_OFFSET = 0.045
export const BASE_PADDLE_LENGTH = 0.22
export const GROWN_PADDLE_LENGTH = BASE_PADDLE_LENGTH * 1.35
export const PADDLE_SPEED = 1.35
export const BALL_START_SPEED = 0.62
export const BALL_SPEED_CAP = 1.12
export const BALL_SPEED_RAMP = 1.055
export const BALL_RADIUS = 0.015
export const BIG_BALL_RADIUS = BALL_RADIUS * 1.7
export const PERFECT_RETURN_SPEED_BOOST = 1.06
export const POWER_UP_LIFETIME_TICKS = 10 * TICK_RATE
export const MATCH_COUNTDOWN_TICKS = 3 * TICK_RATE
export const SERVE_DELAY_TICKS = Math.round(0.75 * TICK_RATE)

export const ABILITY_COOLDOWNS: Record<AbilityId, number> = {
  dash: 10 * TICK_RATE,
  bend: 12 * TICK_RATE,
  guard: 14 * TICK_RATE,
  pulse: 12 * TICK_RATE,
}

export interface AiProfile {
  reactionTicks: number
  bounces: number
  aimError: number
  speed: number
}

export const AI_PROFILE: Record<AiDifficulty, AiProfile> = {
  rookie: { reactionTicks: 26, bounces: 0, aimError: 1.5, speed: 0.68 },
  rally: { reactionTicks: 16, bounces: 1, aimError: 0.95, speed: 0.82 },
  pro: { reactionTicks: 9, bounces: 3, aimError: 0.62, speed: 0.93 },
  // 0.38 is intentionally wider than the 0.1936 catch-window multiple needed
  // to leave the perfect zone. Ace remains accurate without farming perfect
  // returns on every touch.
  ace: { reactionTicks: 5, bounces: 99, aimError: 0.38, speed: 1 },
}

export function defaultScoreToWin(mode: GameMode): number {
  return mode === 'crosscourt' ? 7 : 5
}

export function defaultPlayerCount(mode: GameMode): number {
  if (mode === 'duel') return 2
  return 4
}

export function sidesForMode(mode: GameMode, count = defaultPlayerCount(mode)): Side[] {
  if (mode === 'duel') return ['left', 'right']
  return ['left', 'right', 'top', 'bottom'].slice(0, Math.max(3, Math.min(4, count))) as Side[]
}

export function nextPowerUpDelay(intensity: ItemIntensity, random: number): number {
  if (intensity === 'off') return Number.MAX_SAFE_INTEGER
  const [minimum, spread] = intensity === 'wild' ? [4, 3] : [8, 5]
  return Math.round((minimum + random * spread) * TICK_RATE)
}
