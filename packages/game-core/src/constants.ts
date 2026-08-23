import type { ActivePalType, AiDifficulty, PalType } from './types'

export const TICK_RATE = 60
export const TICK_SECONDS = 1 / TICK_RATE
export const DUEL_COURT_LENGTH_SCALE = 4 / 3

export const RAIL_INSET = 0.022
/** Keeps both posts attackable after the 50%-larger mallet balance pass. */
export const GOAL_WIDTH = 0.45
export const GOAL_DEPTH = 0.045
export const GOAL_CREASE_DEPTH = 0.095
/** 50% larger than the original 0.052 mallet for easier thumb control and clearer contact. */
export const MALLET_RADIUS = 0.078
export const MALLET_SPEED = 1.2
export const PUCK_RADIUS = 0.018
export const PUCK_START_SPEED = 0.58
export const PUCK_SPEED_CAP = 1.42
export const PUCK_SPEED_RAMP = 1.035

// Renderer aliases retained to keep rally heat vocabulary concise.
export const BALL_RADIUS = PUCK_RADIUS
export const BALL_START_SPEED = PUCK_START_SPEED
export const BALL_SPEED_CAP = PUCK_SPEED_CAP

export const PAL_ENERGY_MAX = 6
export const PAL_START_ENERGY = 2
export const PAL_ENERGY_REGEN_TICKS = 5 * TICK_RATE
export const PAL_ARM_TICKS = Math.round(0.35 * TICK_RATE)
export const PAL_ACTIVE_LIMIT = 4
export const POWER_STAR_FIRST_TICKS = 12 * TICK_RATE
export const POWER_STAR_INTERVAL_TICKS = 15 * TICK_RATE
export const POWER_STAR_LIFETIME_TICKS = 10 * TICK_RATE

export interface PalProfile {
  cost: number
  radius: number
  health: number
  moveSpeed: number
  abilityCooldownTicks: number
  carryTicks: number
  shotSpeed: number
  hookRange: number
}

export const PAL_PROFILE: Record<ActivePalType, PalProfile> = {
  guard: { cost: 2, radius: 0.042, health: 4, moveSpeed: 0.62, abilityCooldownTicks: 105, carryTicks: 30, shotSpeed: 0.88, hookRange: 0 },
  striker: { cost: 3, radius: 0.034, health: 3, moveSpeed: 0.69, abilityCooldownTicks: 180, carryTicks: 40, shotSpeed: 1.16, hookRange: 0.3 },
  captain: { cost: 6, radius: 0.05, health: 5, moveSpeed: 0.66, abilityCooldownTicks: 210, carryTicks: 50, shotSpeed: 1.22, hookRange: 0 },
  hatchling: { cost: 0, radius: 0.026, health: 2, moveSpeed: 0.64, abilityCooldownTicks: 110, carryTicks: 24, shotSpeed: 0.8, hookRange: 0 },
}

export const PAL_COST: Record<PalType, number> = {
  guard: PAL_PROFILE.guard.cost,
  striker: PAL_PROFILE.striker.cost,
  captain: PAL_PROFILE.captain.cost,
}

export const MATCH_COUNTDOWN_TICKS = 3 * TICK_RATE
export const SERVE_DELAY_TICKS = Math.round(0.7 * TICK_RATE)
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
  aimError: number
  speed: number
  aggression: number
  summonDelayTicks: number
}

export const AI_PROFILE: Record<AiDifficulty, AiProfile> = {
  rookie: { reactionTicks: 24, aimError: 0.12, speed: 0.66, aggression: 0.25, summonDelayTicks: 70 },
  rally: { reactionTicks: 15, aimError: 0.075, speed: 0.8, aggression: 0.42, summonDelayTicks: 48 },
  pro: { reactionTicks: 9, aimError: 0.04, speed: 0.91, aggression: 0.62, summonDelayTicks: 32 },
  ace: { reactionTicks: 5, aimError: 0.018, speed: 0.98, aggression: 0.78, summonDelayTicks: 22 },
}
