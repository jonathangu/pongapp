import { AI_PROFILE, GOAL_WIDTH, PAL_COST, RAIL_INSET } from './constants'
import { canSummonPal } from './simulation'
import type { AiControllerMemory, GameInput, GameState, PalState, PalType, PlayerState } from './types'

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

function playerPhase(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 0x45d9f3b)
  return (hash >>> 0) / 0xffff_ffff * Math.PI * 2
}

function reflectCoordinate(value: number): number {
  let coordinate = value
  while (coordinate < 0 || coordinate > 1) coordinate = coordinate < 0 ? -coordinate : 2 - coordinate
  return coordinate
}

function ownGoalY(player: PlayerState): number { return player.side === 'top' ? RAIL_INSET : 1 - RAIL_INSET }
function movingToward(player: PlayerState, vy: number): boolean { return player.side === 'top' ? vy < 0 : vy > 0 }
function onOwnHalf(player: PlayerState, y: number): boolean { return player.side === 'top' ? y < 0.5 : y > 0.5 }

function enemyCarrier(state: GameState, player: PlayerState): PalState | undefined {
  const ball = state.balls[0]
  if (!ball?.carrierPalId) return undefined
  return state.pals.find((pal) => pal.id === ball.carrierPalId && pal.ownerId !== player.id)
}

function targetFor(state: GameState, player: PlayerState): { x: number; y: number } {
  const ball = state.balls[0]
  if (!ball) return { x: 0.5, y: player.side === 'top' ? 0.22 : 0.78 }
  const profile = AI_PROFILE[player.aiDifficulty ?? 'rally']
  const carrier = enemyCarrier(state, player)
  let targetX = 0.5
  let targetY = player.side === 'top' ? 0.25 : 0.75
  if (carrier) {
    targetX = carrier.x
    targetY = carrier.y
  } else if (movingToward(player, ball.vy)) {
    const distance = Math.abs((ownGoalY(player) - ball.y) * state.config.courtLengthScale)
    const time = distance / Math.max(0.08, Math.abs(ball.vy))
    targetX = reflectCoordinate(ball.x + ball.vx * time)
    const pressure = clamp(1 - time / 1.2, 0, 1)
    targetY = player.side === 'top' ? 0.2 + pressure * 0.12 : 0.8 - pressure * 0.12
  } else if (onOwnHalf(player, ball.y) || profile.aggression > 0.55) {
    const goalDirection = player.side === 'top' ? 1 : -1
    targetX = clamp(ball.x - ball.vx * 0.07, 0.08, 0.92)
    targetY = clamp(ball.y - goalDirection * 0.08 / state.config.courtLengthScale, 0.1, 0.9)
  } else {
    targetX = 0.5 + (ball.x - 0.5) * 0.38
    targetY = player.side === 'top' ? 0.36 : 0.64
  }
  const phase = playerPhase(player.id)
  const noise = Math.sin(state.tick * 0.137 + phase) * profile.aimError
  targetX += noise
  targetY += Math.cos(state.tick * 0.103 + phase) * profile.aimError / state.config.courtLengthScale
  const goalLane = Math.abs(targetX - 0.5) < GOAL_WIDTH / 2 + player.radius
  if (goalLane && player.side === 'top') targetY = Math.min(targetY, 0.82)
  if (goalLane && player.side === 'bottom') targetY = Math.max(targetY, 0.18)
  return { x: clamp(targetX, 0.07, 0.93), y: clamp(targetY, 0.07, 0.93) }
}

function active(state: GameState, player: PlayerState, type: PalType): PalState | undefined {
  return state.pals.find((pal) => pal.ownerId === player.id && pal.type === type)
}

function palActionFor(state: GameState, player: PlayerState): PalType | null {
  if (state.phase !== 'playing') return null
  const profile = AI_PROFILE[player.aiDifficulty ?? 'rally']
  if ((state.tick + player.id.length * 13) % profile.summonDelayTicks !== 0) return null
  const ball = state.balls[0]
  if (!ball) return null
  const carrier = enemyCarrier(state, player)
  const guard = active(state, player, 'guard')
  const hook = active(state, player, 'striker')
  const captain = active(state, player, 'captain')
  if (guard && guard.abilityCooldownTicks <= 0 && carrier && onOwnHalf(player, carrier.y)) return 'guard'
  if (captain && captain.abilityCooldownTicks <= 0 && (carrier || !onOwnHalf(player, ball.y))) return 'captain'
  if (hook && hook.abilityCooldownTicks <= 0 && !ball.carrierPalId && Math.abs(ball.y - 0.5) < 0.32) return 'striker'
  if (player.palEnergy >= PAL_COST.captain && canSummonPal(state, player, 'captain')) return 'captain'
  if ((movingToward(player, ball.vy) || carrier) && canSummonPal(state, player, 'guard')) return 'guard'
  if (!movingToward(player, ball.vy) && canSummonPal(state, player, 'striker')) return 'striker'
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
    const target = memory.targetByPlayer[player.id] ?? { x: 0.5, y: player.side === 'top' ? 0.22 : 0.78 }
    inputs[player.id] = { targetX: target.x, targetY: target.y, palAction: palActionFor(state, player) }
  }
  return inputs
}
