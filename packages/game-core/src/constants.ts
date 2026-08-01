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

export function sidesForMode(mode: GameMode, count = defaultPlayerCount(mode)): Side[] {
  if (mode === 'duel') return ['left', 'right']
  return ['left', 'right', 'top', 'bottom'].slice(0, Math.max(3, Math.min(4, count))) as Side[]
}

export function nextPowerUpDelay(intensity: ItemIntensity, random: number): number {
  if (intensity === 'off') return Number.MAX_SAFE_INTEGER
  const [minimum, spread] = intensity === 'wild' ? [6, 4] : [12, 6]
  return Math.round((minimum + random * spread) * TICK_RATE)
}
