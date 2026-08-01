/**
 * The AI opponent.
 *
 * The version this replaces could not lose. Three compounding reasons:
 *
 * 1. **It predicted perfectly.** `timeToSide` solves the interception
 *    analytically and `reflectUnit` folds *arbitrarily many wall bounces
 *    exactly, in closed form* — no simulation, no error accumulation, no bounce
 *    limit. It always knew precisely where the ball was going.
 * 2. **Its error was smaller than its own paddle.** The catch half-width is
 *    `CATCH_HALF_WIDTH` = 0.125, and the old per-tier error was 0.08 (`rally`),
 *    0.035 (`pro`), 0.012 (`ace`). All inside 0.125, so those tiers could not
 *    miss even in principle; only `rookie`'s 0.14 ever poked outside.
 * 3. **It had no speed handicap.** `PADDLE_SPEED (1.35)` exceeds
 *    `BALL_SPEED_CAP (1.12)`; the paddle crosses the full span in 0.62s against
 *    the ball's 0.81s at full speed. So `reactionTicks` — the one knob that
 *    looked like difficulty — was almost inert, because even half a second of
 *    lag was absorbed before the ball arrived.
 *
 * Difficulty now comes from what the opponent *knows* and how fast it can
 * *move*: `bounces` limits how far ahead it can read, `aimError` is a multiple
 * of its own catch window so the numbers say plainly whether a tier can miss,
 * and `speed` is enforced in `updatePlayers`.
 *
 * Everything here stays **deterministic from `state.tick`**. It must not call
 * `Math.random` (replays and the authoritative server would diverge) and must
 * not draw from `randomFrom(state)` either — that consumes the shared RNG
 * stream and would shift power-up spawns as a side effect of an AI thinking.
 */

import { AI_PROFILE, BALL_SPEED_CAP, BALL_START_SPEED, CATCH_HALF_WIDTH, PADDLE_OFFSET } from './constants'
import type { AiControllerMemory, BallState, GameInput, GameState, PlayerState } from './types'

function timeToSide(ball: BallState, player: PlayerState): number {
  if (player.side === 'left' && ball.vx < 0) return (PADDLE_OFFSET - ball.x) / ball.vx
  if (player.side === 'right' && ball.vx > 0) return (1 - PADDLE_OFFSET - ball.x) / ball.vx
  if (player.side === 'top' && ball.vy < 0) return (PADDLE_OFFSET - ball.y) / ball.vy
  if (player.side === 'bottom' && ball.vy > 0) return (1 - PADDLE_OFFSET - ball.y) / ball.vy
  return Number.POSITIVE_INFINITY
}

/**
 * Where this tier *believes* the ball will arrive.
 *
 * `reflectUnit` folds unlimited reflections; this folds at most `bounces` of
 * them and then clamps. A tier that runs out of foresight keeps believing the
 * ball carries on to the wall it was last heading for, walks there, and is
 * caught out when it comes back — which is how a person loses a point, and
 * reads as one. `rookie` sees zero bounces and so plays every ball as though it
 * were travelling straight at the wall.
 */
function predictCoordinate(ball: BallState, player: PlayerState, time: number, bounces: number): number {
  if (!Number.isFinite(time) || time < 0) return 0.5
  const raw = player.side === 'left' || player.side === 'right'
    ? ball.y + ball.vy * time
    : ball.x + ball.vx * time

  let value = raw
  let folded = 0
  while (folded < bounces && (value > 1 || value < 0)) {
    value = value > 1 ? 2 - value : -value
    folded += 1
  }
  return Math.min(1, Math.max(0, value))
}

function targetFor(state: GameState, player: PlayerState): number {
  let threat: BallState | undefined
  let soonest = Number.POSITIVE_INFINITY
  for (const ball of state.balls) {
    const time = timeToSide(ball, player)
    if (time >= 0 && time < soonest) {
      soonest = time
      threat = ball
    }
  }
  if (!threat) return 0.5

  const profile = AI_PROFILE[player.aiDifficulty ?? 'rally']
  // A fast ball is harder to meet cleanly than a slow one, so the same tier is
  // sharper early in a rally and looser once the ramp has done its work. This is
  // normalised over exactly the range the renderer's `heat` uses, so the court
  // visibly heating up and the opponent starting to slip are the same event.
  const speed = Math.hypot(threat.vx, threat.vy)
  const ramp = Math.min(1, Math.max(0, (speed - BALL_START_SPEED) / (BALL_SPEED_CAP - BALL_START_SPEED)))
  const pressure = 0.6 + 1.1 * ramp
  const wobble = Math.sin(state.tick * 0.173 + player.id.length * 2.1)
  // Measured in catch-windows, not court units. Above 1.0 the tier misses; well
  // below 1.0 but above the perfect window (0.22 of a half-paddle) it still
  // returns off the edge, which is what stops the AI collecting a free perfect
  // return — and the cooldown refund that came with it — on every single touch.
  const offset = wobble * profile.aimError * CATCH_HALF_WIDTH * pressure

  const predicted = predictCoordinate(threat, player, soonest, profile.bounces)
  return Math.min(0.92, Math.max(0.08, predicted + offset))
}

function shouldUseAbility(state: GameState, player: PlayerState): boolean {
  if (player.cooldownTicks > 0 || state.phase !== 'playing') return false
  const profile = AI_PROFILE[player.aiDifficulty ?? 'rally']
  const danger = state.balls.some((ball) => {
    const time = timeToSide(ball, player)
    return time >= 0 && time < 0.42 + profile.reactionTicks / 120
  })
  return danger && (state.tick + player.id.length * 13) % Math.max(17, profile.reactionTicks * 2) === 0
}

export function createAiMemory(): AiControllerMemory {
  return { targetByPlayer: {}, nextThinkByPlayer: {} }
}

export function aiInputs(state: GameState, memory: AiControllerMemory): Record<string, GameInput> {
  const inputs: Record<string, GameInput> = {}
  for (const player of Object.values(state.players)) {
    if (!player.isAi) continue
    const profile = AI_PROFILE[player.aiDifficulty ?? 'rally']
    if ((memory.nextThinkByPlayer[player.id] ?? 0) <= state.tick) {
      memory.targetByPlayer[player.id] = targetFor(state, player)
      memory.nextThinkByPlayer[player.id] = state.tick + profile.reactionTicks
    }
    inputs[player.id] = {
      target: memory.targetByPlayer[player.id] ?? 0.5,
      abilityPressed: shouldUseAbility(state, player),
    }
  }
  return inputs
}
