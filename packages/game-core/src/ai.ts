import {
  AI_PROFILE,
  BALL_RADIUS,
  BALL_SPEED_CAP,
  BALL_START_SPEED,
  BASE_PADDLE_LENGTH,
  PADDLE_OFFSET,
  PAL_COST,
} from './constants'
import { canSummonPal } from './simulation'
import type { AiControllerMemory, BallState, GameInput, GameState, PalType, PlayerState } from './types'

function timeToSide(state: GameState, ball: BallState, player: PlayerState): number {
  if (player.side === 'top' && ball.vy < 0) return (PADDLE_OFFSET - ball.y) * state.config.courtLengthScale / ball.vy
  if (player.side === 'bottom' && ball.vy > 0) return (1 - PADDLE_OFFSET - ball.y) * state.config.courtLengthScale / ball.vy
  return Number.POSITIVE_INFINITY
}

export function predictCoordinateWithBounces(position: number, velocity: number, time: number, bounces: number): number {
  if (!Number.isFinite(time) || time < 0) return 0.5
  let coordinate = position
  let direction = velocity
  let remaining = time
  for (let seen = 0; seen <= bounces; seen += 1) {
    if (Math.abs(direction) < 1e-9) return Math.min(1, Math.max(0, coordinate))
    const boundary = direction > 0 ? 1 : 0
    const untilBoundary = (boundary - coordinate) / direction
    if (untilBoundary < 0 || remaining <= untilBoundary) return Math.min(1, Math.max(0, coordinate + direction * remaining))
    coordinate = boundary
    remaining -= untilBoundary
    if (seen === bounces) return coordinate
    direction *= -1
  }
  return coordinate
}

function playerPhase(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 0x45d9f3b)
  return (hash >>> 0) / 0xffff_ffff * Math.PI * 2
}

function targetFor(state: GameState, player: PlayerState): number {
  const ball = state.balls[0]
  if (!ball) return 0.5
  const time = timeToSide(state, ball, player)
  if (!Number.isFinite(time) || time < 0) return 0.5
  const profile = AI_PROFILE[player.aiDifficulty ?? 'rally']
  const speed = Math.hypot(ball.vx, ball.vy)
  const ramp = Math.min(1, Math.max(0, (speed - BALL_START_SPEED) / (BALL_SPEED_CAP - BALL_START_SPEED)))
  const pressure = 0.6 + 1.1 * ramp
  const catchHalfWidth = BASE_PADDLE_LENGTH / 2 + BALL_RADIUS
  const noise = Math.sin(state.tick * 0.173 + playerPhase(player.id)) * profile.aimError * catchHalfWidth * pressure
  return Math.min(0.92, Math.max(0.08, predictCoordinateWithBounces(ball.x, ball.vx, time, profile.bounces) + noise))
}

function summonFor(state: GameState, player: PlayerState): PalType | null {
  if (state.phase !== 'playing') return null
  const profile = AI_PROFILE[player.aiDifficulty ?? 'rally']
  if ((state.tick + player.id.length * 13) % profile.summonDelayTicks !== 0) return null
  const ball = state.balls[0]
  const dangerTime = ball ? timeToSide(state, ball, player) : Number.POSITIVE_INFINITY
  if (player.palEnergy >= PAL_COST.captain && canSummonPal(state, player, 'captain')) return 'captain'
  if (dangerTime >= 0 && dangerTime < 0.72 + profile.reactionTicks / 100 && canSummonPal(state, player, 'guard')) return 'guard'
  const ballMovingAway = ball && (player.side === 'top' ? ball.vy > 0 : ball.vy < 0)
  if (ballMovingAway && canSummonPal(state, player, 'striker')) return 'striker'
  return null
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
      summon: summonFor(state, player),
    }
  }
  return inputs
}
