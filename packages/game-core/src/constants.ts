import type { AbilityId, AiDifficulty, GameMode, ItemIntensity, Side } from './types'

export const TICK_RATE = 60
export const TICK_SECONDS = 1 / TICK_RATE
export const PADDLE_OFFSET = 0.045
export const BASE_PADDLE_LENGTH = 0.22
export const GROWN_PADDLE_LENGTH = BASE_PADDLE_LENGTH * 1.5
export const PADDLE_SPEED = 1.35
export const BALL_START_SPEED = 0.62
export const BALL_SPEED_CAP = 1.12
export const BALL_SPEED_RAMP = 1.055
export const BALL_RADIUS = 0.015
export const BIG_BALL_RADIUS = BALL_RADIUS * 1.7
export const PERFECT_RETURN_SPEED_BOOST = 1.06
export const SUMMON_PADDLE_COUNT = 3
export const SUMMON_PADDLE_LENGTH = 0.1
export const SUMMON_PADDLE_LIFETIME_TICKS = 8 * TICK_RATE
export const POWER_UP_RADIUS = 0.052
export const POWER_UP_DRIFT_SPEED = 0.055
export const POWER_UP_LIFETIME_TICKS = 16 * TICK_RATE
export const MATCH_COUNTDOWN_TICKS = 3 * TICK_RATE
export const SERVE_DELAY_TICKS = Math.round(0.75 * TICK_RATE)

export const ABILITY_COOLDOWNS: Record<AbilityId, number> = {
  dash: 10 * TICK_RATE,
  bend: 12 * TICK_RATE,
  guard: 14 * TICK_RATE,
  pulse: 12 * TICK_RATE,
}

/**
 * What an AI opponent is called on screen.
 *
 * Two things were wrong with the old names. They were picked by *seat index*
 * (`['Rookie', 'Rally', 'Pro', 'Ace'][index]`), so in a duel the opponent always
 * sat in seat 1 and was always called "Rally" no matter which difficulty you
 * chose — pick Ace, play someone labelled Rally. And "Rally" now collides with
 * the rally counter, so the HUD showed `RALLY 2` (a player's score) beside
 * `RALLY 0` (a rally length) and expected you to tell them apart.
 *
 * The `rally` tier keeps its id — it is in the protocol — but is displayed as
 * "Steady", which leaves "rally" meaning exactly one thing to a player.
 */
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
}

/**
 * `aimError` is a multiple of the catch half-width (0.125), scaled at runtime by
 * how far the rally has ramped: the effective offset spans `aimError × 0.60` at
 * serve speed to `aimError × 1.70` at the cap, and anything reaching 1.0 is a
 * miss. So `rookie` can miss from the first touch, `rally` is safe early and
 * unreliable once the point has run on, `pro` slips only when the ball is hot,
 * and `ace` only at the very cap.
 *
 * Every tier has to reach 1.0 *somewhere*. An opponent that cannot miss at any
 * speed is the defect this table exists to remove, and it is easy to reintroduce
 * by nudging these down — `tests/ai.test.ts` plays each tier against a flawless
 * opponent and fails if one stops conceding.
 */
export const AI_PROFILE: Record<AiDifficulty, AiProfile> = {
  // Misses reachable balls at any speed and never reads a bounce.
  rookie: { reactionTicks: 26, bounces: 0, aimError: 1.8, speed: 0.68 },
  // Safe early, starts missing once the rally has ramped. Loses long points.
  rally: { reactionTicks: 16, bounces: 1, aimError: 1, speed: 0.82 },
  // Only slips when the ball is hot. Punishes a loose shot.
  pro: { reactionTicks: 9, bounces: 3, aimError: 0.72, speed: 0.93 },
  // Misses only near the cap, and rarely even then. Beat it with angles,
  // spin and power-ups rather than by waiting for a fumble.
  ace: { reactionTicks: 5, bounces: 99, aimError: 0.6, speed: 0.97 },
}

export function defaultScoreToWin(mode: GameMode): number {
  return mode === 'crosscourt' ? 7 : 5
}

/** Two minutes, not four. Rally scoring reaches the shorter targets faster anyway. */
export const DEFAULT_TIME_LIMIT_TICKS = 2 * 60 * TICK_RATE

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

export function nextPowerUpDelay(intensity: ItemIntensity, random: number, firstSpawn = false): number {
  if (intensity === 'off') return Number.MAX_SAFE_INTEGER
  // The first orb establishes the rule immediately. Later gaps stay short
  // enough that a normal point sees power-ups instead of only unusually long
  // rallies. Wild is intentionally close to constant once an orb is collected.
  const [minimum, spread] = firstSpawn
    ? intensity === 'wild' ? [0.75, 0.75] : [1.25, 1]
    : intensity === 'wild' ? [1.5, 1.25] : [3, 2]
  return Math.round((minimum + random * spread) * TICK_RATE)
}
