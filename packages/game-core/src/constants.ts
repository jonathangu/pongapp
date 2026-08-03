import type { ActivePalType, AiDifficulty, PalType } from './types'

export const TICK_RATE = 60
export const TICK_SECONDS = 1 / TICK_RATE
export const PADDLE_OFFSET = 0.045
export const BASE_PADDLE_LENGTH = 0.22
export const PADDLE_SPEED = 1.35
export const BALL_START_SPEED = 0.62
export const BALL_SPEED_CAP = 1.12
export const BALL_SPEED_RAMP = 1.055
export const BALL_RADIUS = 0.015
export const PERFECT_RETURN_SPEED_BOOST = 1.06
export const DUEL_COURT_LENGTH_SCALE = 4 / 3

export const PAL_ENERGY_MAX = 6
export const PAL_START_ENERGY = 2
export const PAL_ENERGY_REGEN_TICKS = Math.round(3.5 * TICK_RATE)
export const PAL_ARM_TICKS = Math.round(0.2 * TICK_RATE)
export const PAL_ACTIVE_LIMIT = 4

export interface PalProfile {
  cost: number
  length: number
  depth: number
  lifetimeTicks: number
  moveSpeed: number
}

export const PAL_PROFILE: Record<ActivePalType, PalProfile> = {
  guard: { cost: 2, length: 0.2, depth: 0.18, lifetimeTicks: 7 * TICK_RATE, moveSpeed: 0.35 },
  striker: { cost: 3, length: 0.13, depth: 0.4, lifetimeTicks: 5 * TICK_RATE, moveSpeed: 0.75 },
  captain: { cost: 6, length: 0.28, depth: 0.3, lifetimeTicks: 7 * TICK_RATE, moveSpeed: 0.6 },
  hatchling: { cost: 0, length: 0.11, depth: 0.24, lifetimeTicks: 4 * TICK_RATE, moveSpeed: 0.42 },
}

export const PAL_COST: Record<PalType, number> = {
  guard: PAL_PROFILE.guard.cost,
  striker: PAL_PROFILE.striker.cost,
  captain: PAL_PROFILE.captain.cost,
}

export const MATCH_COUNTDOWN_TICKS = 3 * TICK_RATE
export const SERVE_DELAY_TICKS = Math.round(0.75 * TICK_RATE)
export const DEFAULT_SCORE_TO_WIN = 5
export const DEFAULT_TIME_LIMIT_TICKS = Math.round(2.5 * 60 * TICK_RATE)

export const AI_DIFFICULTY_LABEL: Record<AiDifficulty, string> = {
  rookie: 'Rookie',
  rally: 'Steady',
  pro: 'Pro',
  ace: 'Ace',
}

export interface AiProfile {
  reactionTicks: number
  bounces: number
  aimError: number
  speed: number
  summonDelayTicks: number
}

export const AI_PROFILE: Record<AiDifficulty, AiProfile> = {
  rookie: { reactionTicks: 26, bounces: 0, aimError: 1.8, speed: 0.68, summonDelayTicks: 54 },
  rally: { reactionTicks: 16, bounces: 1, aimError: 1, speed: 0.82, summonDelayTicks: 36 },
  pro: { reactionTicks: 9, bounces: 3, aimError: 0.72, speed: 0.93, summonDelayTicks: 22 },
  ace: { reactionTicks: 5, bounces: 99, aimError: 0.6, speed: 0.97, summonDelayTicks: 14 },
}
