import type { AbilityId, AiDifficulty, GameMode, ItemIntensity, PowerUpId, Side } from './types'

export const TICK_RATE = 60
export const TICK_SECONDS = 1 / TICK_RATE
export const PADDLE_OFFSET = 0.045
export const BASE_PADDLE_LENGTH = 0.22
export const GROWN_PADDLE_LENGTH = BASE_PADDLE_LENGTH * 1.35
export const PADDLE_SPEED = 1.35
/**
 * Ball tuning.
 *
 * `0.48` with a `1.035` ramp needed **25 hits** to reach the cap — twelve or
 * thirteen each in a duel — so almost every point ended while the ball was
 * still slow, and the `heat` escalation the renderer draws (rim, bloom, trail,
 * stretch) essentially never fired. `0.62` with a `1.055` ramp reaches the cap
 * in **11 hits**, so a normal rally spends real time in the fast band.
 */
export const BALL_START_SPEED = 0.62
export const BALL_SPEED_CAP = 1.12
export const BALL_SPEED_RAMP = 1.055
/** Centring a return is worth something now, matching what the UI has always claimed. */
export const PERFECT_RAMP_BONUS = 1.06
export const BALL_RADIUS = 0.015

/**
 * Half the span a paddle can intercept: half its length plus the ball's radius.
 *
 * This is the number every difficulty knob has to be measured against. The old
 * `AI_PROFILE.error` was expressed in absolute court units — 0.08 for `rally`,
 * 0.035 for `pro`, 0.012 for `ace` — all of them *smaller than this*, which is
 * why those tiers could not miss even in principle.
 */
export const CATCH_HALF_WIDTH = BASE_PADDLE_LENGTH / 2 + BALL_RADIUS

/**
 * Hitstop, in ticks. Small numbers: at 60Hz, 4 ticks is 67ms.
 *
 * Fixed counts keyed off events, never wall-clock, so the authoritative server
 * and every client freeze for exactly the same number of ticks.
 */
export const FREEZE_TICKS = {
  perfect: 4,
  shield: 6,
  score: 8,
} as const
export const MATCH_COUNTDOWN_TICKS = 3 * TICK_RATE
export const SERVE_DELAY_TICKS = Math.round(0.75 * TICK_RATE)

export const ABILITY_COOLDOWNS: Record<AbilityId, number> = {
  dash: 10 * TICK_RATE,
  bend: 12 * TICK_RATE,
  guard: 14 * TICK_RATE,
  pulse: 12 * TICK_RATE,
}

export interface AiProfile {
  /** How often it re-reads the ball. */
  reactionTicks: number
  /** How many wall reflections it can see coming. */
  bounces: number
  /** Aim offset as a multiple of `CATCH_HALF_WIDTH`, so above 1.0 it can miss. */
  aimError: number
  /** Fraction of `PADDLE_SPEED` it is allowed to use. */
  speed: number
}

/**
 * Difficulty is what the opponent *knows* and how fast it can *move* — never a
 * small nudge added to a perfect answer.
 *
 * The old profile had two fields and neither one could make the AI lose.
 * `targetFor` solved the interception analytically and `reflectUnit` folded in
 * unlimited wall bounces exactly, so the prediction was always right; the error
 * was smaller than the paddle's own catch window, so it could not miss; and
 * there was no speed handicap at all, with `PADDLE_SPEED (1.35)` exceeding
 * `BALL_SPEED_CAP (1.12)` — the paddle crosses the court in 0.62s against the
 * ball's 0.81s at full speed, so even half a second of reaction lag was
 * absorbed. Every tier above `rookie` was unbeatable except by a bad bounce,
 * which is also why the game felt flat: you were not in a contest.
 *
 * `aimError` is now a multiple of `CATCH_HALF_WIDTH`, scaled at runtime by how
 * far the rally has ramped, so the numbers below say plainly whether a tier can
 * miss: the effective offset spans `aimError × 0.60` at serve speed to
 * `aimError × 1.70` at the cap, and anything reaching 1.0 is a miss. So `rookie`
 * (1.8) can miss from the first touch, `rally` (1.0) is safe early and
 * unreliable once the rally has ramped, `pro` (0.72) slips only when the ball is
 * hot, and `ace` (0.6) only at the very cap. Nothing is unbeatable — an
 * opponent that literally cannot lose is the bug this table exists to fix.
 */
export const AI_PROFILE: Record<AiDifficulty, AiProfile> = {
  // Misses reachable balls at any speed and never reads a bounce.
  rookie: { reactionTicks: 26, bounces: 0, aimError: 1.8, speed: 0.68 },
  // Safe early, starts missing once the rally has ramped. Loses long points.
  rally: { reactionTicks: 16, bounces: 1, aimError: 1, speed: 0.82 },
  // Only slips when the ball is hot. Punishes a loose shot.
  pro: { reactionTicks: 9, bounces: 3, aimError: 0.72, speed: 0.93 },
  // Misses only at the very top of the speed range, and rarely even then.
  ace: { reactionTicks: 5, bounces: 99, aimError: 0.6, speed: 0.97 },
}

/**
 * Shorter matches. First to 7 over a four-minute clock is a long sit for a game
 * whose whole promise is "play within seconds", and rally scoring (a long point
 * is worth up to 3) reaches these totals faster anyway.
 */
export function defaultScoreToWin(mode: GameMode): number {
  return mode === 'crosscourt' ? 7 : 5
}

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

export function nextPowerUpDelay(intensity: ItemIntensity, random: number): number {
  if (intensity === 'off') return Number.MAX_SAFE_INTEGER
  const [minimum, spread] = intensity === 'wild' ? [4, 3] : [8, 5]
  return Math.round((minimum + random * spread) * TICK_RATE)
}

/** An orb that nobody hits eventually leaves. `PowerUpState.ageTicks` was previously dead. */
export const POWER_UP_LIFETIME_TICKS = 10 * TICK_RATE

/**
 * Weighted draw per intensity.
 *
 * `wild` and `standard` used to differ *only* in how often an orb appeared —
 * both drew uniformly from the same five — so "wild" was not qualitatively
 * wilder, just more frequent. `wild` now leans on the three that change the
 * shape of the rally; `standard` leans on the two that reward the player who
 * earned the pickup.
 */
export const POWER_UP_WEIGHTS: Record<Exclude<ItemIntensity, 'off'>, Record<PowerUpId, number>> = {
  standard: { grow: 3, overdrive: 3, multiball: 1, warp: 1, gravity: 1 },
  wild: { grow: 1, overdrive: 2, multiball: 4, warp: 3, gravity: 3 },
}
