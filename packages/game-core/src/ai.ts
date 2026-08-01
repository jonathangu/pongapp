import { AI_PROFILE, PADDLE_OFFSET } from './constants'
import { reflectUnit } from './rng'
import type { AiControllerMemory, BallState, GameInput, GameState, PlayerState } from './types'

function timeToSide(ball: BallState, player: PlayerState): number {
  if (player.side === 'left' && ball.vx < 0) return (PADDLE_OFFSET - ball.x) / ball.vx
  if (player.side === 'right' && ball.vx > 0) return (1 - PADDLE_OFFSET - ball.x) / ball.vx
  if (player.side === 'top' && ball.vy < 0) return (PADDLE_OFFSET - ball.y) / ball.vy
  if (player.side === 'bottom' && ball.vy > 0) return (1 - PADDLE_OFFSET - ball.y) / ball.vy
  return Number.POSITIVE_INFINITY
}

function predictCoordinate(ball: BallState, player: PlayerState, time: number): number {
  if (!Number.isFinite(time) || time < 0) return 0.5
  return player.side === 'left' || player.side === 'right'
    ? reflectUnit(ball.y + ball.vy * time)
    : reflectUnit(ball.x + ball.vx * time)
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
  const deterministicNoise = Math.sin(state.tick * 0.173 + player.id.length * 2.1) * profile.error
  return Math.min(0.92, Math.max(0.08, predictCoordinate(threat, player, soonest) + deterministicNoise))
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
