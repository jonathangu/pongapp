import {
  AI_PROFILE,
  BALL_RADIUS,
  GOAL_CREASE_DEPTH,
  GOAL_DEPTH,
  GOAL_WIDTH,
  MALLET_RADIUS,
  MALLET_SPEED,
  MATCH_COUNTDOWN_TICKS,
  PAL_ACTIVE_LIMIT,
  PAL_ARM_TICKS,
  PAL_COST,
  PAL_ENERGY_MAX,
  PAL_ENERGY_REGEN_TICKS,
  PAL_PROFILE,
  PAL_START_ENERGY,
  POWER_STAR_FIRST_TICKS,
  POWER_STAR_INTERVAL_TICKS,
  POWER_STAR_LIFETIME_TICKS,
  PUCK_SPEED_CAP,
  PUCK_SPEED_RAMP,
  PUCK_START_SPEED,
  RAIL_INSET,
  SERVE_DELAY_TICKS,
  TICK_RATE,
  TICK_SECONDS,
} from './constants'
import { nextRandom } from './rng'
import type {
  ActivePalType,
  BallState,
  EnergyReason,
  GameState,
  InputMap,
  MatchConfig,
  PalState,
  PalType,
  PlayerState,
  PowerStarState,
  Side,
} from './types'

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
const goalHalfWidth = GOAL_WIDTH / 2

function randomFrom(state: GameState): number {
  const result = nextRandom(state.rngState)
  state.rngState = result.state
  return result.value
}

function physicalDelta(state: GameState, ax: number, ay: number, bx: number, by: number): { x: number; y: number; distance: number } {
  const x = bx - ax
  const y = (by - ay) * state.config.courtLengthScale
  return { x, y, distance: Math.hypot(x, y) }
}

function movePoint(
  state: GameState,
  current: { x: number; y: number },
  target: { x: number; y: number },
  maximum: number,
): { x: number; y: number; vx: number; vy: number } {
  const delta = physicalDelta(state, current.x, current.y, target.x, target.y)
  const scale = delta.distance > maximum && delta.distance > 0 ? maximum / delta.distance : 1
  const x = current.x + delta.x * scale
  const y = current.y + delta.y * scale / state.config.courtLengthScale
  return { x, y, vx: (x - current.x) / TICK_SECONDS, vy: (y - current.y) * state.config.courtLengthScale / TICK_SECONDS }
}

function stagedBall(id: string): BallState {
  return { id, x: 0.5, y: 0.5, vx: 0, vy: 0, radius: BALL_RADIUS, spin: 0, lastToucherId: null, carrierPalId: null, tetherPalId: null }
}

function freshBall(state: GameState, id: string): BallState {
  const horizontal = (randomFrom(state) - 0.5) * PUCK_START_SPEED * 0.8
  const vertical = Math.sqrt(Math.max(0, PUCK_START_SPEED ** 2 - horizontal ** 2)) * (randomFrom(state) < 0.5 ? -1 : 1)
  return { ...stagedBall(id), vx: horizontal, vy: vertical }
}

export function serveVelocityForPlayer(player: PlayerState): { vx: number; vy: number } {
  const horizontal = clamp((player.x - 0.5) * 0.85, -PUCK_START_SPEED * 0.64, PUCK_START_SPEED * 0.64)
  const vertical = Math.sqrt(Math.max(0, PUCK_START_SPEED ** 2 - horizontal ** 2))
  return player.side === 'top' ? { vx: horizontal, vy: vertical } : { vx: horizontal, vy: -vertical }
}

function startingY(side: Side): number { return side === 'top' ? 0.18 : 0.82 }

export function createGame(config: MatchConfig): GameState {
  const players = Object.fromEntries(config.players.map((definition) => [definition.id, {
    ...definition,
    x: 0.5,
    y: startingY(definition.side),
    vx: 0,
    vy: 0,
    radius: MALLET_RADIUS,
    returns: 0,
    cleanStrikes: 0,
    palEnergy: PAL_START_ENERGY,
    palEnergyProgressTicks: 0,
    palsSummoned: 0,
    palHits: 0,
    palSteals: 0,
    goalCampTicks: 0,
    goalsConceded: 0,
    campedGoalsConceded: 0,
    openPostShots: 0,
    bankShots: 0,
  } satisfies PlayerState]))
  const scores = Object.fromEntries(config.players.map((player) => [player.team, 0]))
  const state: GameState = {
    rulesetVersion: 3,
    config,
    phase: 'countdown',
    tick: 0,
    countdownTicks: MATCH_COUNTDOWN_TICKS,
    remainingTicks: config.timeLimitTicks,
    overtime: false,
    serveTicks: 0,
    servingPlayerId: null,
    rallyHits: 0,
    longestRallyHits: 0,
    freezeTicks: 0,
    players,
    balls: [],
    pals: [],
    powerStar: null,
    nextPowerStarTick: POWER_STAR_FIRST_TICKS,
    scores,
    winnerTeam: null,
    rngState: config.seed || 1,
    events: [],
  }
  state.balls = [freshBall(state, 'puck-1')]
  return state
}

function addEnergy(state: GameState, player: PlayerState, amount: number, reason: EnergyReason): void {
  const next = Math.min(PAL_ENERGY_MAX, player.palEnergy + amount)
  if (next === player.palEnergy) return
  player.palEnergy = next
  state.events.push({ type: 'energyChanged', playerId: player.id, energy: next, reason })
}

function updateEnergy(state: GameState): void {
  if (state.serveTicks > 0) return
  for (const player of Object.values(state.players)) {
    if (player.palEnergy >= PAL_ENERGY_MAX) {
      player.palEnergyProgressTicks = 0
      continue
    }
    player.palEnergyProgressTicks += 1
    if (player.palEnergyProgressTicks < PAL_ENERGY_REGEN_TICKS) continue
    player.palEnergyProgressTicks -= PAL_ENERGY_REGEN_TICKS
    addEnergy(state, player, 1, 'regen')
  }
}

function activePal(state: GameState, playerId: string, type: PalType): PalState | undefined {
  return state.pals.find((pal) => pal.ownerId === playerId && pal.type === type)
}

function activePalsFor(state: GameState, playerId: string): PalState[] {
  return state.pals.filter((pal) => pal.ownerId === playerId)
}

export function canSummonPal(state: GameState, player: PlayerState, type: PalType): boolean {
  return state.phase === 'playing'
    && player.palEnergy >= PAL_COST[type]
    && !activePal(state, player.id, type)
    && activePalsFor(state, player.id).length < PAL_ACTIVE_LIMIT
}

export function canUsePalCard(state: GameState, player: PlayerState, type: PalType): boolean {
  const active = activePal(state, player.id, type)
  return active
    ? active.mode !== 'spawning' && active.mode !== 'stunned' && active.abilityCooldownTicks <= 0
    : canSummonPal(state, player, type)
}

function makePal(
  state: GameState,
  player: PlayerState,
  type: ActivePalType,
  x = player.x,
  y = player.y,
  parentId: string | null = null,
): PalState {
  const profile = PAL_PROFILE[type]
  const serial = player.palsSummoned + state.pals.length
  const homeNudge = player.side === 'top' ? 0.07 : -0.07
  return {
    id: `pal-${player.id}-${state.tick}-${serial}-${type}`,
    ownerId: player.id,
    side: player.side,
    type,
    x: clamp(x, RAIL_INSET + profile.radius, 1 - RAIL_INSET - profile.radius),
    y: clamp(y + homeNudge, RAIL_INSET + profile.radius, 1 - RAIL_INSET - profile.radius),
    vx: 0,
    vy: 0,
    radius: profile.radius,
    health: profile.health,
    maxHealth: profile.health,
    mode: 'spawning',
    stateTicks: PAL_ARM_TICKS,
    abilityCooldownTicks: Math.round(profile.abilityCooldownTicks * 0.45),
    contactCooldownTicks: 0,
    carryTicks: 0,
    commanded: false,
    hasStar: false,
    spawnedAtTick: state.tick,
    parentId,
  }
}

function usePalCard(state: GameState, player: PlayerState, type: PalType): void {
  const existing = activePal(state, player.id, type)
  if (existing) {
    if (!canUsePalCard(state, player, type)) return
    existing.commanded = true
    existing.abilityCooldownTicks = PAL_PROFILE[type].abilityCooldownTicks
    if (existing.mode !== 'carry') {
      existing.mode = 'chase'
      if (type === 'striker') existing.stateTicks = 19
    }
    state.events.push({ type: 'palCommanded', playerId: player.id, palId: existing.id, palType: existing.type })
    return
  }
  if (!canSummonPal(state, player, type)) return
  player.palEnergy -= PAL_COST[type]
  player.palEnergyProgressTicks = 0
  player.palsSummoned += 1
  const pal = makePal(state, player, type)
  state.pals.push(pal)
  state.events.push({ type: 'energyChanged', playerId: player.id, energy: player.palEnergy, reason: 'spent' })
  state.events.push({ type: 'palSummoned', playerId: player.id, pal: { ...pal } })
}

function clampPlayerTarget(player: PlayerState, x: number, y: number): { x: number; y: number } {
  const minimum = RAIL_INSET + player.radius
  const maximum = 1 - RAIL_INSET - player.radius
  let nextX = clamp(x, minimum, maximum)
  let nextY = clamp(y, minimum, maximum)
  const insideGoalLane = Math.abs(nextX - 0.5) < goalHalfWidth + player.radius * 0.35
  if (insideGoalLane && player.side === 'bottom') nextY = Math.max(nextY, RAIL_INSET + GOAL_CREASE_DEPTH + player.radius)
  if (insideGoalLane && player.side === 'top') nextY = Math.min(nextY, 1 - RAIL_INSET - GOAL_CREASE_DEPTH - player.radius)
  nextX = clamp(nextX, minimum, maximum)
  return { x: nextX, y: nextY }
}

function updatePlayers(state: GameState, inputs: InputMap): void {
  for (const player of Object.values(state.players)) {
    // Persisted v3 rooms created before the balance pass do not have telemetry
    // counters. Keep the wire protocol compatible while upgrading them in place.
    player.goalCampTicks ??= 0
    player.goalsConceded ??= 0
    player.campedGoalsConceded ??= 0
    player.openPostShots ??= 0
    player.bankShots ??= 0
    const input = inputs[player.id] ?? { targetX: player.x, targetY: player.y, palAction: null }
    const target = clampPlayerTarget(player, input.targetX, input.targetY)
    const profile = player.isAi ? AI_PROFILE[player.aiDifficulty ?? 'rally'] : null
    const moved = movePoint(state, player, target, MALLET_SPEED * (profile?.speed ?? 1) * TICK_SECONDS)
    player.x = moved.x
    player.y = moved.y
    player.vx = moved.vx
    player.vy = moved.vy
    if (isGoalCamping(state, player)) player.goalCampTicks += 1
    if (input.palAction) usePalCard(state, player, input.palAction)
  }
  resolvePlayerOverlap(state)
}

function resolvePlayerOverlap(state: GameState): void {
  const players = Object.values(state.players)
  if (players.length < 2) return
  const one = players[0]!
  const two = players[1]!
  const delta = physicalDelta(state, one.x, one.y, two.x, two.y)
  const minimum = one.radius + two.radius
  if (delta.distance <= 0 || delta.distance >= minimum) return
  const overlap = (minimum - delta.distance) / 2
  const nx = delta.x / delta.distance
  const ny = delta.y / delta.distance
  one.x -= nx * overlap
  one.y -= ny * overlap / state.config.courtLengthScale
  two.x += nx * overlap
  two.y += ny * overlap / state.config.courtLengthScale
}

function ownerOf(state: GameState, pal: PalState): PlayerState | undefined { return state.players[pal.ownerId] }
function opponentOf(state: GameState, owner: PlayerState): PlayerState | undefined {
  return Object.values(state.players).find((player) => player.team !== owner.team)
}
function opponentGoalY(side: Side): number { return side === 'top' ? 1 + GOAL_DEPTH : -GOAL_DEPTH }
function isOwnHalf(side: Side, y: number): boolean { return side === 'top' ? y <= 0.5 : y >= 0.5 }
function isOpponentHalf(side: Side, y: number): boolean { return !isOwnHalf(side, y) }

/** A goalie is camping when it sits in the mouth instead of contesting space. */
export function isGoalCamping(state: GameState, player: PlayerState): boolean {
  const nearGoal = player.side === 'top' ? player.y <= 0.22 : player.y >= 0.78
  return state.phase === 'playing'
    && state.serveTicks <= 0
    && nearGoal
    && Math.abs(player.x - 0.5) <= goalHalfWidth + player.radius * 0.7
}

export interface GoalAttackAim {
  /** Virtual aim coordinate; may sit beyond a side rail to produce a bank. */
  x: number
  y: number
  /** Real destination inside the goal mouth after any rebound. */
  targetX: number
  bankX: number | null
  bankY: number | null
  shot: 'openPost' | 'bank'
}

/**
 * Pick the post furthest from the predicted goalie. When asked to bank against
 * a camper, reflect that post across its nearest side rail; ordinary puck
 * collision then produces a real one-rail shot without special-case physics.
 */
export function goalAttackAim(
  state: GameState,
  attackerSide: Side,
  shooterX: number,
  shooterY: number,
  preferBank = false,
): GoalAttackAim {
  const defender = Object.values(state.players).find((player) => player.side !== attackerSide)
  const targetY = opponentGoalY(attackerSide)
  const speed = Math.max(PUCK_START_SPEED, PAL_PROFILE.captain.shotSpeed)
  const travelTime = Math.abs((targetY - shooterY) * state.config.courtLengthScale) / speed
  const predictedDefenderX = clamp((defender?.x ?? 0.5) + (defender?.vx ?? 0) * Math.min(0.35, travelTime), RAIL_INSET, 1 - RAIL_INSET)
  const postInset = BALL_RADIUS + 0.018
  const leftPost = 0.5 - goalHalfWidth + postInset
  const rightPost = 0.5 + goalHalfWidth - postInset
  const leftSpace = Math.abs(leftPost - predictedDefenderX)
  const rightSpace = Math.abs(rightPost - predictedDefenderX)
  const targetX = Math.abs(leftSpace - rightSpace) < 0.012
    ? (shooterX <= 0.5 ? rightPost : leftPost)
    : (leftSpace > rightSpace ? leftPost : rightPost)
  const bank = Boolean(defender && preferBank && isGoalCamping(state, defender))
  if (!bank) return { x: targetX, y: targetY, targetX, bankX: null, bankY: null, shot: 'openPost' }
  // A bank must enter the opening at the front rail. Aiming at the back of the
  // net reaches the post too late and clips the end rail before it can score.
  const mouthY = attackerSide === 'top' ? 1 - RAIL_INSET : RAIL_INSET
  const wallX = targetX < 0.5 ? RAIL_INSET + BALL_RADIUS : 1 - RAIL_INSET - BALL_RADIUS
  const virtualX = wallX * 2 - targetX
  const bankDenominator = virtualX - shooterX
  const bankFraction = Math.abs(bankDenominator) > 0.0001 ? clamp((wallX - shooterX) / bankDenominator, 0, 1) : 0
  const bankY = shooterY + (mouthY - shooterY) * bankFraction
  return { x: virtualX, y: mouthY, targetX, bankX: wallX, bankY, shot: 'bank' }
}

function palTarget(state: GameState, pal: PalState): { x: number; y: number } {
  const owner = ownerOf(state, pal)
  const ball = state.balls[0]
  if (!owner || !ball) return { x: pal.x, y: pal.y }
  const enemyCarrier = ball.carrierPalId ? state.pals.find((candidate) => candidate.id === ball.carrierPalId && candidate.ownerId !== pal.ownerId) : undefined
  if (pal.mode === 'carry') {
    if (pal.type === 'guard') return { x: clamp(0.5 + (pal.x - 0.5) * 0.45, 0.25, 0.75), y: pal.side === 'top' ? 0.27 : 0.73 }
    return { x: 0.5, y: pal.side === 'top' ? 0.72 : 0.28 }
  }
  if (pal.type === 'guard') {
    if (enemyCarrier && (isOwnHalf(pal.side, enemyCarrier.y) || pal.commanded)) return { x: enemyCarrier.x, y: enemyCarrier.y }
    const laneY = pal.side === 'top' ? 0.2 : 0.8
    return { x: clamp(ball.x, 0.1, 0.9), y: laneY + (ball.y - laneY) * 0.16 }
  }
  if (pal.type === 'striker') {
    if (pal.commanded || ball.tetherPalId === pal.id) return { x: ball.x, y: ball.y }
    if (state.powerStar && !pal.hasStar) return { x: state.powerStar.x, y: state.powerStar.y }
    return { x: clamp(ball.x, 0.12, 0.88), y: pal.side === 'top' ? 0.43 : 0.57 }
  }
  if (pal.type === 'captain') {
    if (enemyCarrier) return { x: enemyCarrier.x, y: enemyCarrier.y }
    if (pal.commanded || isOpponentHalf(pal.side, ball.y)) return { x: ball.x, y: ball.y }
    return { x: 0.5 + (ball.x - 0.5) * 0.4, y: pal.side === 'top' ? 0.34 : 0.66 }
  }
  return { x: ball.x, y: ball.y }
}

function grabBall(state: GameState, pal: PalState, ball: BallState, fromPal?: PalState): void {
  if (fromPal) {
    fromPal.mode = 'stunned'
    fromPal.stateTicks = 18
    const owner = ownerOf(state, pal)
    if (owner) owner.palSteals += 1
    state.events.push({ type: 'palStole', playerId: pal.ownerId, palId: pal.id, fromPalId: fromPal.id, ballId: ball.id, x: pal.x, y: pal.y })
  } else {
    state.events.push({ type: 'palGrabbed', playerId: pal.ownerId, palId: pal.id, palType: pal.type, ballId: ball.id, x: pal.x, y: pal.y })
  }
  ball.carrierPalId = pal.id
  ball.tetherPalId = null
  ball.vx = 0
  ball.vy = 0
  pal.mode = 'carry'
  pal.carryTicks = 0
  pal.commanded = false
}

function shootBall(state: GameState, pal: PalState, ball: BallState): void {
  const owner = ownerOf(state, pal)
  const enemy = owner ? opponentOf(state, owner) : undefined
  const powered = pal.hasStar
  const preferBank = Boolean(enemy && isGoalCamping(state, enemy) && (pal.type === 'striker' || pal.type === 'captain' || powered))
  const aim = goalAttackAim(state, pal.side, pal.x, pal.y, preferBank)
  const delta = physicalDelta(state, pal.x, pal.y, aim.x, aim.y)
  const speed = Math.min(PUCK_SPEED_CAP, PAL_PROFILE[pal.type].shotSpeed * (powered ? 1.16 : 1))
  const divisor = Math.max(0.0001, delta.distance)
  ball.x = pal.x + delta.x / divisor * (pal.radius + ball.radius + 0.006)
  ball.y = pal.y + delta.y / divisor * (pal.radius + ball.radius + 0.006) / state.config.courtLengthScale
  ball.vx = delta.x / divisor * speed
  ball.vy = delta.y / divisor * speed
  if (pal.type === 'striker') ball.spin = (pal.x < 0.5 ? 1 : -1) * (powered ? 0.34 : 0.22)
  ball.carrierPalId = null
  ball.tetherPalId = null
  ball.lastToucherId = pal.ownerId
  pal.mode = 'patrol'
  pal.carryTicks = 0
  pal.commanded = false
  if (owner) {
    owner.palHits += 1
    if (aim.shot === 'bank') owner.bankShots = (owner.bankShots ?? 0) + 1
    else owner.openPostShots = (owner.openPostShots ?? 0) + 1
  }
  state.events.push({
    type: 'palShot',
    playerId: pal.ownerId,
    palId: pal.id,
    palType: pal.type,
    ballId: ball.id,
    powered,
    shot: aim.shot,
    targetX: aim.targetX,
    bankX: aim.bankX,
    bankY: aim.bankY,
    x: pal.x,
    y: pal.y,
  })
  if (powered) {
    pal.hasStar = false
    state.events.push({ type: 'palPowerUsed', playerId: pal.ownerId, palId: pal.id, palType: pal.type, x: pal.x, y: pal.y })
  }
  registerRallyHit(state)
}

function dropBall(state: GameState, pal: PalState, forceX = 0, forceY = 0): void {
  const ball = state.balls.find((candidate) => candidate.carrierPalId === pal.id)
  if (!ball) return
  ball.carrierPalId = null
  ball.x = pal.x
  ball.y = pal.y
  ball.vx = forceX || pal.vx * 0.4
  ball.vy = forceY || pal.vy * 0.4
}

function spawnCaptainHatchlings(state: GameState, captain: PalState, owner: PlayerState, powered: boolean): void {
  const available = Math.max(0, PAL_ACTIVE_LIMIT - activePalsFor(state, owner.id).length)
  const count = Math.min(powered ? 3 : 2, available)
  for (let index = 0; index < count; index += 1) {
    const angle = (index / Math.max(1, count) - 0.5) * Math.PI * 0.8
    const hatchling = makePal(state, owner, 'hatchling', captain.x + Math.sin(angle) * 0.06, captain.y + (captain.side === 'top' ? 0.04 : -0.04), captain.id)
    hatchling.stateTicks = Math.round(PAL_ARM_TICKS * 0.55)
    state.pals.push(hatchling)
    state.events.push({ type: 'palSummoned', playerId: owner.id, pal: { ...hatchling } })
  }
}

function retirePal(state: GameState, pal: PalState, reason: 'knockout' | 'goal'): void {
  const owner = ownerOf(state, pal)
  const powered = pal.hasStar
  dropBall(state, pal)
  const ball = state.balls[0]
  if (ball?.tetherPalId === pal.id) ball.tetherPalId = null
  state.pals = state.pals.filter((candidate) => candidate.id !== pal.id)
  state.events.push({ type: 'palRetreated', playerId: pal.ownerId, palId: pal.id, palType: pal.type, reason })
  if (reason === 'knockout' && pal.type === 'captain' && owner) spawnCaptainHatchlings(state, pal, owner, powered)
}

function damagePal(state: GameState, pal: PalState, amount = 1): void {
  if (pal.contactCooldownTicks > 0) return
  if (pal.hasStar && pal.type === 'guard') {
    pal.hasStar = false
    pal.contactCooldownTicks = 30
    state.events.push({ type: 'palPowerUsed', playerId: pal.ownerId, palId: pal.id, palType: pal.type, x: pal.x, y: pal.y })
    return
  }
  pal.health = Math.max(0, pal.health - amount)
  pal.contactCooldownTicks = 24
  pal.mode = 'stunned'
  pal.stateTicks = 14
  dropBall(state, pal)
  state.events.push({ type: 'palDamaged', playerId: pal.ownerId, palId: pal.id, palType: pal.type, health: pal.health, x: pal.x, y: pal.y })
  if (pal.health <= 0) retirePal(state, pal, 'knockout')
  else state.events.push({ type: 'palStunned', playerId: pal.ownerId, palId: pal.id, palType: pal.type, x: pal.x, y: pal.y })
}

function updateTether(state: GameState, pal: PalState, ball: BallState): void {
  const delta = physicalDelta(state, ball.x, ball.y, pal.x, pal.y)
  if (delta.distance > PAL_PROFILE.striker.hookRange * 1.45 || pal.mode === 'stunned') {
    ball.tetherPalId = null
    pal.mode = 'patrol'
    return
  }
  const divisor = Math.max(0.001, delta.distance)
  ball.vx += delta.x / divisor * 0.035
  ball.vy += delta.y / divisor * 0.035
  if (delta.distance <= pal.radius + ball.radius + 0.028) grabBall(state, pal, ball)
}

function attemptHook(state: GameState, pal: PalState, ball: BallState): void {
  if (ball.carrierPalId || ball.tetherPalId || (!pal.commanded && pal.abilityCooldownTicks > 0)) {
    if (pal.mode === 'chase') { pal.mode = 'patrol'; pal.stateTicks = 0 }
    return
  }
  const distance = physicalDelta(state, pal.x, pal.y, ball.x, ball.y).distance
  if (distance > PAL_PROFILE.striker.hookRange) {
    if (pal.mode === 'chase') { pal.mode = 'patrol'; pal.stateTicks = 0 }
    return
  }
  if (pal.mode !== 'chase') {
    pal.mode = 'chase'
    pal.stateTicks = 18
    return
  }
  pal.stateTicks -= 1
  if (pal.stateTicks > 0) return
  ball.tetherPalId = pal.id
  pal.mode = 'tether'
  pal.commanded = false
  pal.abilityCooldownTicks = PAL_PROFILE.striker.abilityCooldownTicks
  state.events.push({ type: 'palTethered', playerId: pal.ownerId, palId: pal.id, ballId: ball.id, x: pal.x, y: pal.y })
}

function updatePals(state: GameState): void {
  const ball = state.balls[0]
  for (const pal of state.pals.slice()) {
    if (!state.pals.includes(pal)) continue
    pal.abilityCooldownTicks = Math.max(0, pal.abilityCooldownTicks - 1)
    pal.contactCooldownTicks = Math.max(0, pal.contactCooldownTicks - 1)
    if (pal.mode === 'spawning') {
      pal.stateTicks -= 1
      if (pal.stateTicks <= 0) pal.mode = 'patrol'
      continue
    }
    if (pal.mode === 'stunned') {
      pal.stateTicks -= 1
      pal.vx *= 0.84
      pal.vy *= 0.84
      if (pal.stateTicks <= 0) pal.mode = 'patrol'
      continue
    }
    if (ball?.carrierPalId === pal.id) {
      pal.mode = 'carry'
      pal.carryTicks += 1
    }
    const target = palTarget(state, pal)
    const speedBoost = pal.commanded ? 1.18 : pal.hasStar ? 1.1 : 1
    const telegraphingHook = pal.type === 'striker' && pal.mode === 'chase' && pal.stateTicks > 0
    const moved = movePoint(state, pal, target, PAL_PROFILE[pal.type].moveSpeed * speedBoost * (telegraphingHook ? 0 : 1) * TICK_SECONDS)
    pal.x = clamp(moved.x, RAIL_INSET + pal.radius, 1 - RAIL_INSET - pal.radius)
    pal.y = clamp(moved.y, RAIL_INSET + pal.radius, 1 - RAIL_INSET - pal.radius)
    pal.vx = moved.vx
    pal.vy = moved.vy
    if (ball?.tetherPalId === pal.id) updateTether(state, pal, ball)
    else if (ball && pal.type === 'striker' && (pal.commanded || pal.abilityCooldownTicks <= 0)) attemptHook(state, pal, ball)
    if (ball?.carrierPalId === pal.id && pal.carryTicks >= PAL_PROFILE[pal.type].carryTicks) shootBall(state, pal, ball)
  }
  resolvePalInteractions(state)
  collectPowerStar(state)
}

function pointSegmentDistance(state: GameState, point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const bx = b.x - a.x
  const by = (b.y - a.y) * state.config.courtLengthScale
  const px = point.x - a.x
  const py = (point.y - a.y) * state.config.courtLengthScale
  const lengthSquared = bx * bx + by * by
  const amount = lengthSquared > 0 ? clamp((px * bx + py * by) / lengthSquared, 0, 1) : 0
  return Math.hypot(px - bx * amount, py - by * amount)
}

function breakTethersWithPlayers(state: GameState): void {
  const ball = state.balls[0]
  if (!ball?.tetherPalId) return
  const hook = state.pals.find((pal) => pal.id === ball.tetherPalId)
  if (!hook) { ball.tetherPalId = null; return }
  for (const player of Object.values(state.players)) {
    if (player.id === hook.ownerId || pointSegmentDistance(state, player, hook, ball) > player.radius * 0.9) continue
    if (hook.hasStar) {
      hook.hasStar = false
      state.events.push({ type: 'palPowerUsed', playerId: hook.ownerId, palId: hook.id, palType: hook.type, x: hook.x, y: hook.y })
      return
    }
    ball.tetherPalId = null
    hook.mode = 'stunned'
    hook.stateTicks = 18
    state.events.push({ type: 'tetherBroken', playerId: player.id, palId: hook.id, ballId: ball.id, x: player.x, y: player.y })
    return
  }
}

function resolvePalInteractions(state: GameState): void {
  const ball = state.balls[0]
  for (const pal of state.pals.slice()) {
    if (pal.mode === 'spawning') continue
    for (const player of Object.values(state.players)) {
      if (player.id === pal.ownerId || !state.pals.includes(pal)) continue
      const delta = physicalDelta(state, pal.x, pal.y, player.x, player.y)
      if (delta.distance > pal.radius + player.radius) continue
      if (ball?.carrierPalId === pal.id) dropBall(state, pal, player.vx * 0.42, player.vy * 0.42)
      damagePal(state, pal)
    }
  }
  const pals = [...state.pals]
  for (let oneIndex = 0; oneIndex < pals.length; oneIndex += 1) {
    const one = pals[oneIndex]!
    for (let twoIndex = oneIndex + 1; twoIndex < pals.length; twoIndex += 1) {
      const two = pals[twoIndex]!
      if (one.ownerId === two.ownerId || !state.pals.includes(one) || !state.pals.includes(two)) continue
      const delta = physicalDelta(state, one.x, one.y, two.x, two.y)
      if (delta.distance > one.radius + two.radius) continue
      if (ball?.carrierPalId === two.id && one.type === 'guard') { grabBall(state, one, ball, two); continue }
      if (ball?.carrierPalId === one.id && two.type === 'guard') { grabBall(state, two, ball, one); continue }
      if (one.type === 'captain' && (one.commanded || one.mode === 'chase')) damagePal(state, two)
      if (two.type === 'captain' && (two.commanded || two.mode === 'chase')) damagePal(state, one)
    }
  }
  breakTethersWithPlayers(state)
}

function updatePowerStar(state: GameState): void {
  if (state.serveTicks > 0) return
  if (state.powerStar && state.powerStar.expiresAtTick <= state.tick) {
    state.events.push({ type: 'starExpired', starId: state.powerStar.id })
    state.powerStar = null
    state.nextPowerStarTick = state.tick + Math.round(POWER_STAR_INTERVAL_TICKS * 0.55)
  }
  if (state.powerStar || state.tick < state.nextPowerStarTick) return
  const star: PowerStarState = {
    id: `star-${state.tick}`,
    x: (Math.floor(state.tick / POWER_STAR_INTERVAL_TICKS) % 2 === 0) ? 0.34 : 0.66,
    y: 0.5,
    spawnedAtTick: state.tick,
    expiresAtTick: state.tick + POWER_STAR_LIFETIME_TICKS,
  }
  state.powerStar = star
  state.events.push({ type: 'starSpawned', star: { ...star } })
}

function collectPowerStar(state: GameState): void {
  const star = state.powerStar
  if (!star) return
  const candidates = state.pals
    .filter((pal) => pal.mode !== 'spawning' && !pal.hasStar)
    .map((pal) => ({ pal, distance: physicalDelta(state, pal.x, pal.y, star.x, star.y).distance }))
    .sort((a, b) => a.distance - b.distance)
  const nearest = candidates[0]
  if (!nearest || nearest.distance > nearest.pal.radius + 0.075) return
  nearest.pal.hasStar = true
  state.powerStar = null
  state.nextPowerStarTick = state.tick + POWER_STAR_INTERVAL_TICKS
  state.events.push({ type: 'palPowered', playerId: nearest.pal.ownerId, palId: nearest.pal.id, palType: nearest.pal.type, x: nearest.pal.x, y: nearest.pal.y })
}

function clampPuckSpeed(ball: BallState, minimum = 0): void {
  const speed = Math.hypot(ball.vx, ball.vy)
  if (speed <= 0) return
  const next = clamp(speed, minimum, PUCK_SPEED_CAP)
  ball.vx = ball.vx / speed * next
  ball.vy = ball.vy / speed * next
}

function registerRallyHit(state: GameState): void {
  state.rallyHits += 1
  state.longestRallyHits = Math.max(state.longestRallyHits, state.rallyHits)
  if (state.rallyHits === 8) state.events.push({ type: 'rallyHot', hits: state.rallyHits, level: 'hot' })
  if (state.rallyHits === 16) state.events.push({ type: 'rallyHot', hits: state.rallyHits, level: 'blazing' })
}

function collideBallWithPlayer(state: GameState, ball: BallState, player: PlayerState): boolean {
  const delta = physicalDelta(state, player.x, player.y, ball.x, ball.y)
  const minimum = player.radius + ball.radius
  if (delta.distance <= 0 || delta.distance > minimum) return false
  const nx = delta.x / delta.distance
  const ny = delta.y / delta.distance
  ball.x = player.x + nx * (minimum + 0.002)
  ball.y = player.y + ny * (minimum + 0.002) / state.config.courtLengthScale
  const relativeX = ball.vx - player.vx
  const relativeY = ball.vy - player.vy
  const closing = relativeX * nx + relativeY * ny
  if (closing < 0) {
    ball.vx -= closing * 1.9 * nx
    ball.vy -= closing * 1.9 * ny
  }
  ball.vx += player.vx * 0.36 + nx * 0.08
  ball.vy += player.vy * 0.36 + ny * 0.08
  const beforeRamp = Math.hypot(ball.vx, ball.vy)
  const playerSpeed = Math.hypot(player.vx, player.vy)
  const clean = playerSpeed >= 0.48 && beforeRamp >= 0.72
  clampPuckSpeed(ball, Math.min(PUCK_SPEED_CAP, Math.max(PUCK_START_SPEED * 0.72, beforeRamp * PUCK_SPEED_RAMP)))
  ball.lastToucherId = player.id
  player.returns += 1
  if (clean) {
    player.cleanStrikes += 1
    if (player.cleanStrikes % 3 === 0) addEnergy(state, player, 1, 'cleanHit')
  }
  const speed = Math.hypot(ball.vx, ball.vy)
  const shot = clean ? speed > 1.1 ? 'smash' : 'strike' : Math.abs(ball.x - 0.5) > 0.42 ? 'bank' : 'tap'
  state.events.push({ type: 'hit', playerId: player.id, ballId: ball.id, clean, speed, shot, x: ball.x, y: ball.y })
  registerRallyHit(state)
  return true
}

function collideBallWithPal(state: GameState, ball: BallState, pal: PalState): boolean {
  if (pal.mode === 'spawning' || pal.mode === 'stunned') return false
  const delta = physicalDelta(state, pal.x, pal.y, ball.x, ball.y)
  const minimum = pal.radius + ball.radius
  if (delta.distance <= 0 || delta.distance > minimum) return false
  if (Math.hypot(ball.vx, ball.vy) > 0.78) damagePal(state, pal)
  if (!state.pals.includes(pal)) return true
  if (pal.type !== 'hatchling') {
    grabBall(state, pal, ball)
    return true
  }
  const nx = delta.x / delta.distance
  const ny = delta.y / delta.distance
  ball.x = pal.x + nx * (minimum + 0.002)
  ball.y = pal.y + ny * (minimum + 0.002) / state.config.courtLengthScale
  const closing = (ball.vx - pal.vx) * nx + (ball.vy - pal.vy) * ny
  ball.vx -= Math.min(0, closing) * 1.9 * nx
  ball.vy -= Math.min(0, closing) * 1.9 * ny
  ball.vx += pal.vx * 0.3
  ball.vy += pal.vy * 0.3
  ball.lastToucherId = pal.ownerId
  clampPuckSpeed(ball, PUCK_START_SPEED * 0.75)
  const owner = ownerOf(state, pal)
  if (owner) owner.palHits += 1
  registerRallyHit(state)
  return true
}

function updateCarriedBall(state: GameState, ball: BallState): boolean {
  if (!ball.carrierPalId) return false
  const carrier = state.pals.find((pal) => pal.id === ball.carrierPalId)
  if (!carrier) { ball.carrierPalId = null; return false }
  const forward = carrier.side === 'top' ? 1 : -1
  ball.x = carrier.x
  ball.y = carrier.y + forward * (carrier.radius + ball.radius * 0.8) / state.config.courtLengthScale
  ball.vx = carrier.vx
  ball.vy = carrier.vy
  return true
}

function updateBall(state: GameState, ball: BallState): void {
  if (updateCarriedBall(state, ball)) return
  if (Math.abs(ball.spin) > 0.0001) {
    const previousX = ball.vx
    ball.vx += -ball.vy * ball.spin * TICK_SECONDS * 0.25
    ball.vy += previousX * ball.spin * TICK_SECONDS * 0.25
    ball.spin *= 0.99
  }
  ball.x += ball.vx * TICK_SECONDS
  ball.y += ball.vy * TICK_SECONDS / state.config.courtLengthScale

  if (ball.x - ball.radius <= RAIL_INSET && ball.vx < 0) {
    ball.x = RAIL_INSET + ball.radius
    ball.vx = Math.abs(ball.vx)
  } else if (ball.x + ball.radius >= 1 - RAIL_INSET && ball.vx > 0) {
    ball.x = 1 - RAIL_INSET - ball.radius
    ball.vx = -Math.abs(ball.vx)
  }

  const inGoalOpening = Math.abs(ball.x - 0.5) <= goalHalfWidth - ball.radius * 0.25
  if (!inGoalOpening) {
    if (ball.y - ball.radius <= RAIL_INSET && ball.vy < 0) {
      ball.y = RAIL_INSET + ball.radius
      ball.vy = Math.abs(ball.vy)
    } else if (ball.y + ball.radius >= 1 - RAIL_INSET && ball.vy > 0) {
      ball.y = 1 - RAIL_INSET - ball.radius
      ball.vy = -Math.abs(ball.vy)
    }
  }

  for (const player of Object.values(state.players)) if (collideBallWithPlayer(state, ball, player)) break
  if (!ball.carrierPalId) for (const pal of state.pals.slice()) if (collideBallWithPal(state, ball, pal)) break

  const top = Object.values(state.players).find((player) => player.side === 'top')
  const bottom = Object.values(state.players).find((player) => player.side === 'bottom')
  if (inGoalOpening && ball.y < -GOAL_DEPTH && top) scoreGoal(state, ball, top)
  else if (inGoalOpening && ball.y > 1 + GOAL_DEPTH && bottom) scoreGoal(state, ball, bottom)
}

function fallbackScorer(state: GameState, defender: PlayerState): PlayerState | undefined {
  return Object.values(state.players).find((candidate) => candidate.team !== defender.team)
}

function finishMatch(state: GameState, winnerTeam: string): void {
  state.phase = 'finished'
  state.winnerTeam = winnerTeam
  state.events.push({ type: 'matchEnd', winnerTeam })
}

function tiedForLead(state: GameState): boolean {
  const scores = Object.values(state.scores)
  return scores.length === 2 && scores[0] === scores[1]
}

function checkWinner(state: GameState): void {
  const ordered = Object.entries(state.scores).sort((a, b) => b[1] - a[1])
  const leader = ordered[0]
  if (!leader) return
  if (leader[1] >= state.config.scoreToWin || (state.overtime && !tiedForLead(state))) {
    finishMatch(state, leader[0])
    return
  }
  if (state.remainingTicks > 0) return
  if (!tiedForLead(state)) { finishMatch(state, leader[0]); return }
  if (state.overtime) return
  state.overtime = true
  for (const player of Object.values(state.players)) {
    player.palEnergy = PAL_ENERGY_MAX
    player.palEnergyProgressTicks = 0
    state.events.push({ type: 'energyChanged', playerId: player.id, energy: PAL_ENERGY_MAX, reason: 'overtime' })
  }
}

function clearFieldForGoal(state: GameState): void {
  for (const pal of state.pals.slice()) retirePal(state, pal, 'goal')
  if (state.powerStar) state.events.push({ type: 'starExpired', starId: state.powerStar.id })
  state.powerStar = null
  state.nextPowerStarTick = state.tick + POWER_STAR_FIRST_TICKS
}

function scoreGoal(state: GameState, ball: BallState, defender: PlayerState): void {
  const lastToucher = ball.lastToucherId ? state.players[ball.lastToucherId] : undefined
  const scorer = lastToucher && lastToucher.team !== defender.team ? lastToucher : fallbackScorer(state, defender)
  if (!scorer) return
  const rallyHits = state.rallyHits
  const defenderCamping = isGoalCamping(state, defender)
  state.scores[scorer.team] = (state.scores[scorer.team] ?? 0) + 1
  defender.goalsConceded = (defender.goalsConceded ?? 0) + 1
  if (defenderCamping) defender.campedGoalsConceded = (defender.campedGoalsConceded ?? 0) + 1
  state.events.push({ type: 'score', scorerId: scorer.id, team: scorer.team, againstPlayerId: defender.id, ballId: ball.id, points: 1, rallyHits, defenderCamping })
  addEnergy(state, defender, 1, 'comeback')
  clearFieldForGoal(state)
  state.balls = [stagedBall(ball.id)]
  state.serveTicks = SERVE_DELAY_TICKS
  state.servingPlayerId = defender.id
  state.rallyHits = 0
  checkWinner(state)
}

function launchServe(state: GameState): void {
  const player = state.servingPlayerId ? state.players[state.servingPlayerId] : undefined
  if (!player) { state.balls = [freshBall(state, state.balls[0]?.id ?? 'puck-1')]; return }
  state.balls = [{ ...stagedBall(state.balls[0]?.id ?? 'puck-1'), ...serveVelocityForPlayer(player) }]
}

function applyHitstop(state: GameState): void {
  let freeze = 0
  for (const event of state.events) {
    if (event.type === 'score') freeze = Math.max(freeze, 8)
    else if (event.type === 'hit' && event.clean) freeze = Math.max(freeze, event.shot === 'smash' ? 4 : 2)
    else if (event.type === 'palShot' || event.type === 'palStole') freeze = Math.max(freeze, 4)
    else if (event.type === 'palDamaged') freeze = Math.max(freeze, 2)
  }
  state.freezeTicks = Math.max(state.freezeTicks, freeze)
}

export function stepGame(state: GameState, inputs: InputMap = {}): GameState {
  state.events = []
  if (state.phase === 'finished') return state
  state.tick += 1
  if (state.phase === 'countdown') {
    const previous = Math.ceil(state.countdownTicks / TICK_RATE)
    state.countdownTicks = Math.max(0, state.countdownTicks - 1)
    const next = Math.ceil(state.countdownTicks / TICK_RATE)
    if (next > 0 && next !== previous) state.events.push({ type: 'countdown', value: next })
    if (state.countdownTicks === 0) { state.phase = 'playing'; state.events.push({ type: 'matchStart' }) }
    return state
  }
  if (state.freezeTicks > 0) { state.freezeTicks -= 1; return state }
  updatePlayers(state, inputs)
  updatePals(state)
  updateEnergy(state)
  updatePowerStar(state)
  if (!state.overtime) state.remainingTicks = Math.max(0, state.remainingTicks - 1)
  checkWinner(state)
  if (state.winnerTeam !== null) { applyHitstop(state); return state }
  if (state.serveTicks > 0) {
    state.serveTicks -= 1
    if (state.serveTicks === 0) launchServe(state)
    applyHitstop(state)
    return state
  }
  const ball = state.balls[0]
  if (ball) updateBall(state, ball)
  applyHitstop(state)
  return state
}

export function restartGame(state: GameState, seed = Date.now() >>> 0): GameState {
  return createGame({ ...state.config, seed })
}

export function secondsRemaining(state: GameState): number { return Math.ceil(state.remainingTicks / TICK_RATE) }
