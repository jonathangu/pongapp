import { AI_PROFILE, BALL_SPEED_CAP, BALL_RADIUS, BASE_PADDLE_LENGTH, PADDLE_OFFSET } from './constants'
import type { AiControllerMemory, BallState, GameInput, GameState, PlayerState } from './types'

function timeToSide(ball: BallState, player: PlayerState): number {
  if (player.side === 'left' && ball.vx < 0) return (PADDLE_OFFSET - ball.x) / ball.vx
  if (player.side === 'right' && ball.vx > 0) return (1 - PADDLE_OFFSET - ball.x) / ball.vx
  if (player.side === 'top' && ball.vy < 0) return (PADDLE_OFFSET - ball.y) / ball.vy
  if (player.side === 'bottom' && ball.vy > 0) return (1 - PADDLE_OFFSET - ball.y) / ball.vy
  return Number.POSITIVE_INFINITY
}

/**
 * Follow only the wall reflections this tier can understand. Once the next
 * bounce exceeds that budget, hold at the wall instead of magically folding
 * the remaining path. A loop is deliberately used here: floor(abs(raw)) gets
 * negative crossings wrong (for example -0.2 has crossed one wall, not zero).
 */
export function predictCoordinateWithBounces(position: number, velocity: number, time: number, bounces: number): number {
  if (!Number.isFinite(time) || time < 0) return 0.5
  let coordinate = position
  let direction = velocity
  let remaining = time
  for (let seen = 0; seen <= bounces; seen += 1) {
    if (Math.abs(direction) < 1e-9) return Math.min(1, Math.max(0, coordinate))
    const boundary = direction > 0 ? 1 : 0
    const untilBoundary = (boundary - coordinate) / direction
    if (untilBoundary < 0 || remaining <= untilBoundary) {
      return Math.min(1, Math.max(0, coordinate + direction * remaining))
    }
    coordinate = boundary
    remaining -= untilBoundary
    if (seen === bounces) return coordinate
    direction *= -1
  }
  return coordinate
}

function predictCoordinate(ball: BallState, player: PlayerState, time: number, bounces: number): number {
  if (!Number.isFinite(time) || time < 0) return 0.5
  return player.side === 'left' || player.side === 'right'
    ? predictCoordinateWithBounces(ball.y, ball.vy, time, bounces)
    : predictCoordinateWithBounces(ball.x, ball.vx, time, bounces)
}

function playerPhase(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 0x45d9f3b)
  return (hash >>> 0) / 0xffff_ffff * Math.PI * 2
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
  const speed = Math.hypot(threat.vx, threat.vy)
  const pressure = 0.6 + 0.4 * Math.min(1, speed / BALL_SPEED_CAP)
  const catchHalfWidth = BASE_PADDLE_LENGTH / 2 + BALL_RADIUS
  const deterministicNoise = Math.sin(state.tick * 0.173 + playerPhase(player.id)) * profile.aimError * catchHalfWidth * pressure
  return Math.min(0.92, Math.max(0.08, predictCoordinate(threat, player, soonest, profile.bounces) + deterministicNoise))
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
