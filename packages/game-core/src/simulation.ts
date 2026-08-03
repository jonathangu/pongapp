import {
  AI_PROFILE,
  BALL_RADIUS,
  BALL_SPEED_CAP,
  BALL_SPEED_RAMP,
  BALL_START_SPEED,
  BASE_PADDLE_LENGTH,
  MATCH_COUNTDOWN_TICKS,
  PADDLE_OFFSET,
  PADDLE_SPEED,
  PAL_ACTIVE_LIMIT,
  PAL_ARM_TICKS,
  PAL_COST,
  PAL_ENERGY_MAX,
  PAL_ENERGY_REGEN_TICKS,
  PAL_PROFILE,
  PAL_START_ENERGY,
  PERFECT_RETURN_SPEED_BOOST,
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
  Side,
} from './types'

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

function randomFrom(state: GameState): number {
  const result = nextRandom(state.rngState)
  state.rngState = result.state
  return result.value
}

function freshBall(state: GameState, id: string): BallState {
  let angle = randomFrom(state) * Math.PI * 2
  if (Math.abs(Math.sin(angle)) < 0.42) angle += 0.52
  return {
    id,
    x: 0.5,
    y: 0.5,
    vx: Math.cos(angle) * BALL_START_SPEED,
    vy: Math.sin(angle) * BALL_START_SPEED,
    radius: BALL_RADIUS,
    spin: 0,
    lastToucherId: null,
  }
}

function stagedBall(id: string): BallState {
  return { id, x: 0.5, y: 0.5, vx: 0, vy: 0, radius: BALL_RADIUS, spin: 0, lastToucherId: null }
}

export function serveVelocityForPlayer(player: PlayerState): { vx: number; vy: number } {
  const tangent = clamp((player.position - 0.5) * 0.72, -BALL_START_SPEED * 0.62, BALL_START_SPEED * 0.62)
  const normal = Math.sqrt(Math.max(0, BALL_START_SPEED ** 2 - tangent ** 2))
  return player.side === 'top' ? { vx: tangent, vy: normal } : { vx: tangent, vy: -normal }
}

export function createGame(config: MatchConfig): GameState {
  const players = Object.fromEntries(config.players.map((definition) => [
    definition.id,
    {
      ...definition,
      position: 0.5,
      velocity: 0,
      returns: 0,
      perfectReturns: 0,
      palEnergy: PAL_START_ENERGY,
      palEnergyProgressTicks: 0,
      palsSummoned: 0,
      palHits: 0,
    } satisfies PlayerState,
  ]))
  const scores = Object.fromEntries(config.players.map((player) => [player.team, 0]))
  const state: GameState = {
    rulesetVersion: 2,
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
    scores,
    winnerTeam: null,
    rngState: config.seed || 1,
    events: [],
  }
  state.balls = [freshBall(state, 'ball-1')]
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

function activePalsFor(state: GameState, playerId: string): PalState[] {
  return state.pals.filter((pal) => pal.ownerId === playerId)
}

export function canSummonPal(state: GameState, player: PlayerState, type: PalType): boolean {
  if (state.phase !== 'playing' || player.palEnergy < PAL_COST[type]) return false
  const active = activePalsFor(state, player.id)
  if (type === 'captain') return active.length <= 2 && !active.some((pal) => pal.type === 'captain')
  const reservedForHatchling = active.some((pal) => pal.type === 'captain') ? 1 : 0
  return active.length < PAL_ACTIVE_LIMIT - reservedForHatchling
}

function makePal(
  state: GameState,
  player: PlayerState,
  type: ActivePalType,
  anchor: number,
  depth = PAL_PROFILE[type].depth,
  parentId: string | null = null,
): PalState {
  const serial = player.palsSummoned + state.pals.length
  const profile = PAL_PROFILE[type]
  return {
    id: `pal-${player.id}-${state.tick}-${serial}-${type}`,
    ownerId: player.id,
    side: player.side,
    type,
    anchor: clamp(anchor, 0.1, 0.9),
    position: clamp(anchor, 0.1, 0.9),
    depth,
    phase: ((state.tick + serial * 37) % 360) * Math.PI / 180,
    spawnedAtTick: state.tick,
    armedAtTick: state.tick + PAL_ARM_TICKS,
    expiresAtTick: state.tick + profile.lifetimeTicks,
    parentId,
  }
}

function summonPal(state: GameState, player: PlayerState, type: PalType): void {
  if (!canSummonPal(state, player, type)) return
  player.palEnergy -= PAL_COST[type]
  player.palEnergyProgressTicks = 0
  player.palsSummoned += 1
  const pal = makePal(state, player, type, player.position)
  state.pals.push(pal)
  state.events.push({ type: 'energyChanged', playerId: player.id, energy: player.palEnergy, reason: 'spent' })
  state.events.push({ type: 'palSummoned', playerId: player.id, pal: { ...pal } })
}

function updatePlayers(state: GameState, inputs: InputMap): void {
  for (const player of Object.values(state.players)) {
    const input = inputs[player.id] ?? { target: player.position, summon: null }
    const previous = player.position
    const profile = player.isAi ? AI_PROFILE[player.aiDifficulty ?? 'rally'] : null
    const maximumMove = PADDLE_SPEED * (profile?.speed ?? 1) * TICK_SECONDS
    const delta = clamp(input.target - player.position, -maximumMove, maximumMove)
    player.position = clamp(player.position + delta, 0.08, 0.92)
    player.velocity = (player.position - previous) / TICK_SECONDS
    if (input.summon) summonPal(state, player, input.summon)
  }
}

export function palCoordinates(pal: PalState): { x: number; y: number } {
  return { x: pal.position, y: pal.side === 'top' ? pal.depth : 1 - pal.depth }
}

function moveToward(current: number, target: number, maximum: number): number {
  return current + clamp(target - current, -maximum, maximum)
}

function updatePals(state: GameState): void {
  const retained: PalState[] = []
  for (const pal of state.pals) {
    const owner = state.players[pal.ownerId]
    if (!owner) continue
    if (pal.expiresAtTick <= state.tick) {
      state.events.push({ type: 'palExpired', playerId: owner.id, palId: pal.id, palType: pal.type, reason: 'timeout' })
      continue
    }
    if (pal.armedAtTick === state.tick) {
      const point = palCoordinates(pal)
      state.events.push({ type: 'palArmed', playerId: owner.id, palId: pal.id, palType: pal.type, ...point })
    }
    const age = state.tick - pal.spawnedAtTick
    let target = pal.anchor
    if (pal.type === 'guard') target += Math.sin(age * 0.04 + pal.phase) * 0.035
    else if (pal.type === 'striker') target += Math.sin(age * 0.09 + pal.phase) * 0.16
    else if (pal.type === 'hatchling') target += Math.sin(age * 0.055 + pal.phase) * 0.055
    else {
      const threat = state.balls.find((ball) => pal.side === 'top' ? ball.vy < 0 : ball.vy > 0)
      target = threat?.x ?? pal.anchor
    }
    pal.position = clamp(moveToward(pal.position, target, PAL_PROFILE[pal.type].moveSpeed * TICK_SECONDS), 0.07, 0.93)
    retained.push(pal)
  }
  state.pals = retained
}

function bounceFromSide(ball: BallState, side: Side, depth = PADDLE_OFFSET): void {
  if (side === 'top') {
    ball.y = depth + ball.radius
    ball.vy = Math.abs(ball.vy)
  } else {
    ball.y = 1 - depth - ball.radius
    ball.vy = -Math.abs(ball.vy)
  }
}

function rampBall(ball: BallState, multiplier = BALL_SPEED_RAMP): void {
  const speed = Math.hypot(ball.vx, ball.vy)
  if (speed <= 0) return
  const nextSpeed = Math.min(BALL_SPEED_CAP, speed * multiplier)
  ball.vx = ball.vx / speed * nextSpeed
  ball.vy = ball.vy / speed * nextSpeed
}

function registerRallyHit(state: GameState): void {
  state.rallyHits += 1
  state.longestRallyHits = Math.max(state.longestRallyHits, state.rallyHits)
  if (state.rallyHits === 8) state.events.push({ type: 'rallyHot', hits: state.rallyHits, level: 'hot' })
  if (state.rallyHits === 16) state.events.push({ type: 'rallyHot', hits: state.rallyHits, level: 'blazing' })
}

function applyPaddleContact(state: GameState, ball: BallState, player: PlayerState): void {
  bounceFromSide(ball, player.side)
  const relative = clamp((ball.x - player.position) / (BASE_PADDLE_LENGTH / 2), -1, 1)
  const perfect = Math.abs(relative) < 0.22
  const motion = player.velocity
  const shot = perfect
    ? 'perfect'
    : Math.abs(motion) >= 0.72
      ? relative * motion > 0.18 ? 'drive' : 'cut'
      : Math.abs(motion) < 0.18 && Math.abs(relative) > 0.58 ? 'drop' : 'return'
  ball.vx += relative * 0.34 + player.velocity * 0.045
  if (shot === 'cut') ball.spin += clamp(motion * 0.08, -0.14, 0.14)
  let multiplier = BALL_SPEED_RAMP
  if (shot === 'drive') multiplier *= 1.08
  else if (shot === 'drop') multiplier *= 0.88
  if (perfect) multiplier *= PERFECT_RETURN_SPEED_BOOST
  rampBall(ball, multiplier)
  ball.lastToucherId = player.id
  player.returns += 1
  if (perfect) {
    player.perfectReturns += 1
    addEnergy(state, player, 1, 'perfect')
  }
  state.events.push({ type: 'hit', playerId: player.id, ballId: ball.id, perfect, speed: Math.hypot(ball.vx, ball.vy), shot })
  registerRallyHit(state)
}

function previousY(state: GameState, ball: BallState): number {
  return ball.y - ball.vy * TICK_SECONDS / state.config.courtLengthScale
}

function crossedPal(state: GameState, ball: BallState, pal: PalState): boolean {
  const line = pal.side === 'top' ? pal.depth : 1 - pal.depth
  const previous = previousY(state, ball)
  if (pal.side === 'top') return ball.vy < 0 && ball.y - ball.radius <= line && previous - ball.radius > line
  return ball.vy > 0 && ball.y + ball.radius >= line && previous + ball.radius < line
}

function spawnCaptainHatchlings(state: GameState, captain: PalState, owner: PlayerState): void {
  const available = Math.max(0, PAL_ACTIVE_LIMIT - activePalsFor(state, owner.id).length)
  const depths = [0.22, 0.34]
  const offsets = [-0.07, 0.07]
  for (let index = 0; index < Math.min(2, available); index += 1) {
    const hatchling = makePal(
      state,
      owner,
      'hatchling',
      captain.position + (offsets[index] ?? 0),
      depths[index] ?? PAL_PROFILE.hatchling.depth,
      captain.id,
    )
    state.pals.push(hatchling)
    state.events.push({ type: 'palSummoned', playerId: owner.id, pal: { ...hatchling } })
  }
}

function applyPalContact(state: GameState, ball: BallState): boolean {
  for (const pal of state.pals) {
    if (pal.armedAtTick > state.tick || !crossedPal(state, ball, pal)) continue
    if (Math.abs(ball.x - pal.position) > PAL_PROFILE[pal.type].length / 2 + ball.radius) continue
    const owner = state.players[pal.ownerId]
    if (!owner) continue
    bounceFromSide(ball, pal.side, pal.depth)
    const relative = clamp((ball.x - pal.position) / (PAL_PROFILE[pal.type].length / 2), -1, 1)
    if (pal.type === 'striker') {
      const direction = relative === 0 ? (ball.x < 0.5 ? 1 : -1) : Math.sign(relative)
      ball.vx += relative * 0.34 + direction * 0.22
      ball.spin += direction * 0.16
      rampBall(ball, 1.12)
    } else if (pal.type === 'captain') {
      ball.vx += relative * 0.2
      rampBall(ball, 1.05)
    } else {
      ball.vx += relative * 0.18
      rampBall(ball)
    }
    ball.lastToucherId = owner.id
    owner.palHits += 1
    const point = palCoordinates(pal)
    state.events.push({ type: 'palHit', playerId: owner.id, palId: pal.id, palType: pal.type, ballId: ball.id, ...point })
    registerRallyHit(state)
    state.pals = state.pals.filter((candidate) => candidate.id !== pal.id)
    if (pal.type === 'captain') spawnCaptainHatchlings(state, pal, owner)
    return true
  }
  return false
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
  if (!tiedForLead(state)) {
    finishMatch(state, leader[0])
    return
  }
  if (state.overtime) return
  state.overtime = true
  for (const player of Object.values(state.players)) {
    player.palEnergy = PAL_ENERGY_MAX
    player.palEnergyProgressTicks = 0
    state.events.push({ type: 'energyChanged', playerId: player.id, energy: PAL_ENERGY_MAX, reason: 'overtime' })
  }
}

function clearPalsForGoal(state: GameState): void {
  for (const pal of state.pals) {
    state.events.push({ type: 'palExpired', playerId: pal.ownerId, palId: pal.id, palType: pal.type, reason: 'goal' })
  }
  state.pals = []
}

function scoreGoal(state: GameState, ball: BallState, defender: PlayerState): void {
  const lastToucher = ball.lastToucherId ? state.players[ball.lastToucherId] : undefined
  const scorer = lastToucher && lastToucher.team !== defender.team ? lastToucher : fallbackScorer(state, defender)
  if (!scorer) return
  const rallyHits = state.rallyHits
  state.scores[scorer.team] = (state.scores[scorer.team] ?? 0) + 1
  state.events.push({ type: 'score', scorerId: scorer.id, team: scorer.team, againstPlayerId: defender.id, ballId: ball.id, points: 1, rallyHits })
  addEnergy(state, defender, 1, 'comeback')
  clearPalsForGoal(state)
  state.balls = [stagedBall(ball.id)]
  state.serveTicks = SERVE_DELAY_TICKS
  state.servingPlayerId = defender.id
  state.rallyHits = 0
  checkWinner(state)
}

function processGoalSide(state: GameState, ball: BallState, player: PlayerState): void {
  const atPaddle = player.side === 'top'
    ? ball.y - ball.radius <= PADDLE_OFFSET
    : ball.y + ball.radius >= 1 - PADDLE_OFFSET
  if (atPaddle && Math.abs(ball.x - player.position) <= BASE_PADDLE_LENGTH / 2 + ball.radius) {
    applyPaddleContact(state, ball, player)
    return
  }
  const crossedGoal = player.side === 'top'
    ? ball.y + ball.radius < 0
    : ball.y - ball.radius > 1
  if (crossedGoal) scoreGoal(state, ball, player)
}

function updateBall(state: GameState, ball: BallState): void {
  if (Math.abs(ball.spin) > 0.0001) {
    const vx = ball.vx
    ball.vx += -ball.vy * ball.spin * TICK_SECONDS * 0.2
    ball.vy += vx * ball.spin * TICK_SECONDS * 0.2
    ball.spin *= 0.992
  }
  ball.x += ball.vx * TICK_SECONDS
  ball.y += ball.vy * TICK_SECONDS / state.config.courtLengthScale

  if (ball.x - ball.radius <= 0 && ball.vx < 0) {
    ball.x = ball.radius
    ball.vx = Math.abs(ball.vx)
  } else if (ball.x + ball.radius >= 1 && ball.vx > 0) {
    ball.x = 1 - ball.radius
    ball.vx = -Math.abs(ball.vx)
  }

  if (applyPalContact(state, ball)) return
  const top = Object.values(state.players).find((player) => player.side === 'top')
  const bottom = Object.values(state.players).find((player) => player.side === 'bottom')
  if (ball.vy < 0 && top) processGoalSide(state, ball, top)
  else if (ball.vy > 0 && bottom) processGoalSide(state, ball, bottom)
}

function launchServe(state: GameState): void {
  const player = state.servingPlayerId ? state.players[state.servingPlayerId] : undefined
  if (!player) {
    state.balls = [freshBall(state, state.balls[0]?.id ?? 'ball-1')]
    return
  }
  const velocity = serveVelocityForPlayer(player)
  state.balls = [{ ...stagedBall(state.balls[0]?.id ?? 'ball-1'), ...velocity }]
}

function applyHitstop(state: GameState): void {
  let freeze = 0
  for (const event of state.events) {
    if (event.type === 'score') freeze = Math.max(freeze, 8)
    else if (event.type === 'hit' && event.perfect) freeze = Math.max(freeze, 4)
    else if (event.type === 'palHit') freeze = Math.max(freeze, event.palType === 'captain' ? 5 : 3)
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
    if (state.countdownTicks === 0) {
      state.phase = 'playing'
      state.events.push({ type: 'matchStart' })
    }
    return state
  }

  if (state.freezeTicks > 0) {
    state.freezeTicks -= 1
    return state
  }

  updatePlayers(state, inputs)
  updatePals(state)
  updateEnergy(state)
  if (!state.overtime) state.remainingTicks = Math.max(0, state.remainingTicks - 1)
  checkWinner(state)
  if (state.winnerTeam !== null) {
    applyHitstop(state)
    return state
  }

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

export function secondsRemaining(state: GameState): number {
  return Math.ceil(state.remainingTicks / TICK_RATE)
}
