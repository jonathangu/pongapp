import {
  ABILITY_COOLDOWNS,
  AI_PROFILE,
  BALL_RADIUS,
  BALL_SPEED_CAP,
  BALL_SPEED_RAMP,
  BALL_START_SPEED,
  BASE_PADDLE_LENGTH,
  BIG_BALL_RADIUS,
  GROWN_PADDLE_LENGTH,
  MATCH_COUNTDOWN_TICKS,
  PADDLE_OFFSET,
  PADDLE_SPEED,
  PERFECT_RETURN_SPEED_BOOST,
  POWER_UP_LIFETIME_TICKS,
  SERVE_DELAY_TICKS,
  TICK_RATE,
  TICK_SECONDS,
  nextPowerUpDelay,
} from './constants'
import { nextRandom } from './rng'
import type {
  BallState,
  GameInput,
  GameState,
  InputMap,
  MatchConfig,
  PlayerState,
  PowerUpId,
  Side,
} from './types'

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

function lengthFor(player: PlayerState): number {
  return player.growTicks > 0 ? GROWN_PADDLE_LENGTH : BASE_PADDLE_LENGTH
}

function randomFrom(state: GameState): number {
  const result = nextRandom(state.rngState)
  state.rngState = result.state
  return result.value
}

function mutatorFor(state: GameState) {
  return state.config.mutator ?? 'none'
}

function radiusFor(state: GameState): number {
  return mutatorFor(state) === 'bigBall' ? BIG_BALL_RADIUS : BALL_RADIUS
}

function freshBall(state: GameState, id: string, transientTicks: number | null = null): BallState {
  const angleSeed = randomFrom(state)
  let angle = angleSeed * Math.PI * 2
  if (Math.abs(Math.cos(angle)) < 0.28) angle += 0.38
  if (Math.abs(Math.sin(angle)) < 0.28) angle += 0.38
  return {
    id,
    x: 0.5,
    y: 0.5,
    vx: Math.cos(angle) * BALL_START_SPEED,
    vy: Math.sin(angle) * BALL_START_SPEED,
    radius: radiusFor(state),
    spin: 0,
    lastToucherId: null,
    warpCooldownTicks: 0,
    transientTicks,
  }
}

function stagedBall(state: GameState, id: string, transientTicks: number | null): BallState {
  return {
    id,
    x: 0.5,
    y: 0.5,
    vx: 0,
    vy: 0,
    radius: radiusFor(state),
    spin: 0,
    lastToucherId: null,
    warpCooldownTicks: 0,
    transientTicks,
  }
}

/**
 * The conceding player's paddle position is the serve control. Keeping this in
 * game-core lets the renderer draw the exact launch direction the authoritative
 * simulation will use instead of maintaining a lookalike formula.
 */
export function serveVelocityForPlayer(player: PlayerState): { vx: number; vy: number } {
  const tangent = clamp((player.position - 0.5) * 0.72, -BALL_START_SPEED * 0.62, BALL_START_SPEED * 0.62)
  const normal = Math.sqrt(Math.max(0, BALL_START_SPEED ** 2 - tangent ** 2))
  if (player.side === 'left') return { vx: normal, vy: tangent }
  if (player.side === 'right') return { vx: -normal, vy: tangent }
  if (player.side === 'top') return { vx: tangent, vy: normal }
  return { vx: tangent, vy: -normal }
}

/** Fill fields absent from rooms persisted by an older ruleset-v1 build. */
export function normalizeGameState(state: GameState): GameState {
  state.config.mutator ??= 'none'
  state.servingPlayerId ??= null
  state.rallyHits ??= 0
  state.longestRallyHits ??= 0
  state.freezeTicks ??= 0
  return state
}

export function createGame(config: MatchConfig): GameState {
  const players = Object.fromEntries(
    config.players.map((definition) => [
      definition.id,
      {
        ...definition,
        position: 0.5,
        velocity: 0,
        cooldownTicks: 0,
        growTicks: 0,
        bendTicks: 0,
        guardTicks: 0,
        pulseTicks: 0,
        overdriveHits: 0,
        returns: 0,
        perfectReturns: 0,
        abilityUses: 0,
      } satisfies PlayerState,
    ]),
  )
  const scores = Object.fromEntries([...new Set(config.players.map((player) => player.team))].map((team) => [team, 0]))
  const state: GameState = {
    rulesetVersion: 1,
    config,
    phase: 'countdown',
    tick: 0,
    countdownTicks: MATCH_COUNTDOWN_TICKS,
    remainingTicks: config.timeLimitTicks,
    overtime: false,
    serveTicks: SERVE_DELAY_TICKS,
    servingPlayerId: null,
    rallyHits: 0,
    longestRallyHits: 0,
    freezeTicks: 0,
    players,
    balls: [],
    scores,
    powerUp: null,
    powerUpSpawnTicks: 0,
    worldEffects: { warpTicks: 0, gravityTicks: 0 },
    winnerTeam: null,
    rngState: config.seed || 1,
    events: [],
  }
  state.balls = [freshBall(state, 'ball-1')]
  state.powerUpSpawnTicks = nextPowerUpDelay(config.itemIntensity, randomFrom(state), true)
  return state
}

function decrementPlayerTimers(player: PlayerState): void {
  player.cooldownTicks = Math.max(0, player.cooldownTicks - 1)
  player.growTicks = Math.max(0, player.growTicks - 1)
  player.bendTicks = Math.max(0, player.bendTicks - 1)
  player.guardTicks = Math.max(0, player.guardTicks - 1)
  player.pulseTicks = Math.max(0, player.pulseTicks - 1)
}

function activateAbility(state: GameState, player: PlayerState, input: GameInput): void {
  if (!input.abilityPressed || player.cooldownTicks > 0) return
  const fromPosition = player.position
  player.cooldownTicks = ABILITY_COOLDOWNS[player.ability]
  player.abilityUses += 1
  if (player.ability === 'dash') {
    const direction = input.target >= player.position ? 1 : -1
    player.position = clamp(player.position + direction * 0.35, 0.08, 0.92)
  } else if (player.ability === 'bend') {
    player.bendTicks = 3 * TICK_RATE
  } else if (player.ability === 'guard') {
    player.guardTicks = 2 * TICK_RATE
  } else {
    player.pulseTicks = Math.round(0.2 * TICK_RATE)
  }
  state.events.push({
    type: 'ability',
    playerId: player.id,
    ability: player.ability,
    fromPosition,
    toPosition: player.position,
  })
}

function updatePlayers(state: GameState, inputs: InputMap): void {
  for (const player of Object.values(state.players)) {
    decrementPlayerTimers(player)
    const received = inputs[player.id] ?? { target: player.position, abilityPressed: false }
    const input = mutatorFor(state) === 'mirroredControls' && !player.isAi
      ? { ...received, target: 1 - received.target }
      : received
    activateAbility(state, player, input)
    const previous = player.position
    const profile = player.isAi ? AI_PROFILE[player.aiDifficulty ?? 'rally'] : null
    const maximumMove = PADDLE_SPEED * (profile?.speed ?? 1) * TICK_SECONDS
    const delta = clamp(input.target - player.position, -maximumMove, maximumMove)
    player.position = clamp(player.position + delta, 0.08, 0.92)
    player.velocity = (player.position - previous) / TICK_SECONDS
  }
}

function coordinateForSide(ball: BallState, side: Side): number {
  return side === 'left' || side === 'right' ? ball.y : ball.x
}

function playerAtSide(state: GameState, side: Side): PlayerState | undefined {
  return Object.values(state.players).find((player) => player.side === side)
}

function approaching(ball: BallState, side: Side): boolean {
  if (side === 'left') return ball.vx < 0
  if (side === 'right') return ball.vx > 0
  if (side === 'top') return ball.vy < 0
  return ball.vy > 0
}

function touchesPaddle(ball: BallState, player: PlayerState): boolean {
  const coordinate = coordinateForSide(ball, player.side)
  return Math.abs(coordinate - player.position) <= lengthFor(player) / 2 + ball.radius
}

function atPaddleLine(ball: BallState, side: Side): boolean {
  if (side === 'left') return ball.x - ball.radius <= PADDLE_OFFSET
  if (side === 'right') return ball.x + ball.radius >= 1 - PADDLE_OFFSET
  if (side === 'top') return ball.y - ball.radius <= PADDLE_OFFSET
  return ball.y + ball.radius >= 1 - PADDLE_OFFSET
}

function crossedGoal(ball: BallState, side: Side): boolean {
  if (side === 'left') return ball.x + ball.radius < 0
  if (side === 'right') return ball.x - ball.radius > 1
  if (side === 'top') return ball.y + ball.radius < 0
  return ball.y - ball.radius > 1
}

function bounceFromSide(ball: BallState, side: Side): void {
  if (side === 'left') {
    ball.x = PADDLE_OFFSET + ball.radius
    ball.vx = Math.abs(ball.vx)
  } else if (side === 'right') {
    ball.x = 1 - PADDLE_OFFSET - ball.radius
    ball.vx = -Math.abs(ball.vx)
  } else if (side === 'top') {
    ball.y = PADDLE_OFFSET + ball.radius
    ball.vy = Math.abs(ball.vy)
  } else {
    ball.y = 1 - PADDLE_OFFSET - ball.radius
    ball.vy = -Math.abs(ball.vy)
  }
}

function bounceFromWall(ball: BallState, side: Side): void {
  if (side === 'left') {
    ball.x = ball.radius
    ball.vx = Math.abs(ball.vx)
  } else if (side === 'right') {
    ball.x = 1 - ball.radius
    ball.vx = -Math.abs(ball.vx)
  } else if (side === 'top') {
    ball.y = ball.radius
    ball.vy = Math.abs(ball.vy)
  } else {
    ball.y = 1 - ball.radius
    ball.vy = -Math.abs(ball.vy)
  }
}

function rampBall(ball: BallState, multiplier = BALL_SPEED_RAMP): void {
  const speed = Math.hypot(ball.vx, ball.vy)
  const nextSpeed = Math.min(BALL_SPEED_CAP, speed * multiplier)
  if (speed <= 0) return
  ball.vx = (ball.vx / speed) * nextSpeed
  ball.vy = (ball.vy / speed) * nextSpeed
}

export function rallyMultiplierForHits(hits: number): number {
  return 1 + Math.min(2, Math.floor(Math.max(0, hits) / 8))
}

function registerRallyHit(state: GameState): void {
  const previous = state.rallyHits
  state.rallyHits += 1
  state.longestRallyHits = Math.max(state.longestRallyHits, state.rallyHits)
  const multiplier = rallyMultiplierForHits(state.rallyHits)
  if (multiplier > rallyMultiplierForHits(previous)) {
    state.events.push({ type: 'rallyHot', hits: state.rallyHits, multiplier })
  }
}

function applyPaddleContact(state: GameState, ball: BallState, player: PlayerState): void {
  bounceFromSide(ball, player.side)
  const relative = clamp((coordinateForSide(ball, player.side) - player.position) / (lengthFor(player) / 2), -1, 1)
  const perfect = Math.abs(relative) < 0.22
  const motion = player.velocity
  const shot = perfect
    ? 'perfect'
    : Math.abs(motion) >= 0.72
      ? relative * motion > 0.18 ? 'drive' : 'cut'
      : Math.abs(motion) < 0.18 && Math.abs(relative) > 0.58 ? 'drop' : 'return'
  const tangent = relative * 0.34 + player.velocity * 0.045
  if (player.side === 'left' || player.side === 'right') ball.vy += tangent
  else ball.vx += tangent
  if (player.bendTicks > 0) {
    ball.spin += clamp(player.velocity * 0.028 + relative * 0.09, -0.22, 0.22)
    player.bendTicks = 0
  }
  // Paddle motion now creates readable shot choices. Chase the contact point
  // for a faster Drive, sweep away for extra Cut, or hold an edge for a Drop.
  if (shot === 'cut') ball.spin += clamp(motion * 0.08, -0.14, 0.14)
  let speedMultiplier = BALL_SPEED_RAMP
  if (player.overdriveHits > 0) {
    speedMultiplier = 1.25
    player.overdriveHits -= 1
  }
  if (shot === 'drive') speedMultiplier *= 1.08
  else if (shot === 'drop') speedMultiplier *= 0.88
  if (perfect) speedMultiplier *= PERFECT_RETURN_SPEED_BOOST
  rampBall(ball, speedMultiplier)
  ball.lastToucherId = player.id
  player.returns += 1
  if (perfect) {
    player.perfectReturns += 1
    player.cooldownTicks = Math.max(0, player.cooldownTicks - Math.round(0.5 * TICK_RATE))
  }
  state.events.push({ type: 'hit', playerId: player.id, ballId: ball.id, perfect, speed: Math.hypot(ball.vx, ball.vy), shot })
  registerRallyHit(state)
}

function applyPulse(state: GameState, ball: BallState): boolean {
  for (const player of Object.values(state.players)) {
    if (player.pulseTicks <= 0) continue
    const nearSide = atPaddleLine(ball, player.side)
    const distance = Math.abs(coordinateForSide(ball, player.side) - player.position)
    if (nearSide && distance < lengthFor(player) * 0.9) {
      bounceFromSide(ball, player.side)
      rampBall(ball, 1.08)
      ball.lastToucherId = player.id
      player.pulseTicks = 0
      player.returns += 1
      state.events.push({ type: 'hit', playerId: player.id, ballId: ball.id, perfect: false, speed: Math.hypot(ball.vx, ball.vy), shot: 'return' })
      registerRallyHit(state)
      return true
    }
  }
  return false
}

function fallbackScorer(state: GameState, defender: PlayerState): PlayerState | undefined {
  return Object.values(state.players).find((candidate) => candidate.team !== defender.team)
}

function scoreGoal(state: GameState, ball: BallState, defender: PlayerState): void {
  const lastToucher = ball.lastToucherId ? state.players[ball.lastToucherId] : undefined
  const scorer = lastToucher && lastToucher.team !== defender.team ? lastToucher : fallbackScorer(state, defender)
  if (!scorer) return
  const rallyHits = state.rallyHits
  const basePoints = rallyMultiplierForHits(rallyHits)
  const points = basePoints * (mutatorFor(state) === 'doublePoints' ? 2 : 1)
  state.scores[scorer.team] = (state.scores[scorer.team] ?? 0) + points
  state.events.push({ type: 'score', scorerId: scorer.id, team: scorer.team, againstPlayerId: defender.id, ballId: ball.id, points, rallyHits })
  // A goal ends the point, including Multiball. Previously only the scoring
  // ball reset; the other ball waited through the serve pause and then resumed
  // halfway across the court, turning the next point into an unexplained trap.
  const primaryBall = state.balls[0] ?? ball
  Object.assign(primaryBall, stagedBall(state, primaryBall.id, null))
  for (const extra of state.balls.slice(1)) extra.transientTicks = 0
  state.serveTicks = SERVE_DELAY_TICKS
  state.servingPlayerId = defender.id
  state.rallyHits = 0
  checkWinner(state)
}

function tiedForLead(scores: Record<string, number>): boolean {
  const ordered = Object.values(scores).sort((a, b) => b - a)
  return ordered.length > 1 && ordered[0] === ordered[1]
}

function checkWinner(state: GameState): void {
  const ordered = Object.entries(state.scores).sort((a, b) => b[1] - a[1])
  const leader = ordered[0]
  const runnerUp = ordered[1]
  if (!leader) return
  const reachedTarget = leader[1] >= state.config.scoreToWin && (!runnerUp || leader[1] > runnerUp[1])
  const timeExpired = state.remainingTicks <= 0 && !tiedForLead(state.scores)
  if (!reachedTarget && !timeExpired) {
    if (state.remainingTicks <= 0) state.overtime = true
    return
  }
  state.phase = 'finished'
  state.winnerTeam = leader[0]
  state.events.push({ type: 'matchEnd', winnerTeam: leader[0] })
}

function processSide(state: GameState, ball: BallState, side: Side): void {
  if (!approaching(ball, side)) return
  const player = playerAtSide(state, side)
  if (!player) {
    if (mutatorFor(state) === 'noWalls') {
      if (side === 'left' && ball.x + ball.radius < 0) ball.x = 1 + ball.radius
      else if (side === 'right' && ball.x - ball.radius > 1) ball.x = -ball.radius
      else if (side === 'top' && ball.y + ball.radius < 0) ball.y = 1 + ball.radius
      else if (side === 'bottom' && ball.y - ball.radius > 1) ball.y = -ball.radius
      return
    }
    if (side === 'left' && ball.x - ball.radius <= 0) bounceFromWall(ball, side)
    if (side === 'right' && ball.x + ball.radius >= 1) bounceFromWall(ball, side)
    if (side === 'top' && ball.y - ball.radius <= 0) bounceFromWall(ball, side)
    if (side === 'bottom' && ball.y + ball.radius >= 1) bounceFromWall(ball, side)
    return
  }
  if (atPaddleLine(ball, side) && touchesPaddle(ball, player)) {
    applyPaddleContact(state, ball, player)
    return
  }
  if (!crossedGoal(ball, side)) return
  if (player.guardTicks > 0) {
    player.guardTicks = 0
    bounceFromSide(ball, side)
    rampBall(ball, 1.02)
    state.events.push({ type: 'shield', playerId: player.id, ballId: ball.id })
    registerRallyHit(state)
    return
  }
  scoreGoal(state, ball, player)
}

function updateWorldEffects(state: GameState, ball: BallState): void {
  if (state.worldEffects.gravityTicks > 0) {
    const dx = 0.5 - ball.x
    const dy = 0.5 - ball.y
    const distance = Math.max(0.08, Math.hypot(dx, dy))
    ball.vx += (dx / distance) * 0.06 * TICK_SECONDS
    ball.vy += (dy / distance) * 0.06 * TICK_SECONDS
  }
  if (state.worldEffects.warpTicks > 0 && ball.warpCooldownTicks <= 0) {
    const leftGate = Math.hypot(ball.x - 0.32, ball.y - 0.5) < 0.035
    const rightGate = Math.hypot(ball.x - 0.68, ball.y - 0.5) < 0.035
    if (leftGate || rightGate) {
      ball.x = leftGate ? 0.68 : 0.32
      ball.y = 1 - ball.y
      ball.warpCooldownTicks = Math.round(0.5 * TICK_RATE)
      state.events.push({ type: 'warp', ballId: ball.id })
    }
  }
}

function applyPowerUp(state: GameState, id: PowerUpId, player: PlayerState | undefined): void {
  if (id === 'grow' && player) player.growTicks = 6 * TICK_RATE
  else if (id === 'overdrive' && player) player.overdriveHits += 1
  else if (id === 'multiball') state.balls.push(freshBall(state, `ball-${state.tick}`, 8 * TICK_RATE))
  else if (id === 'warp') state.worldEffects.warpTicks = 8 * TICK_RATE
  else if (id === 'gravity') state.worldEffects.gravityTicks = 8 * TICK_RATE
  state.events.push({ type: 'powerUp', playerId: player?.id ?? null, powerUp: id })
}

const POWER_UP_WEIGHTS: Record<'standard' | 'wild', Array<{ id: PowerUpId; weight: number }>> = {
  standard: [
    { id: 'grow', weight: 34 },
    { id: 'overdrive', weight: 30 },
    { id: 'multiball', weight: 15 },
    { id: 'warp', weight: 11 },
    { id: 'gravity', weight: 10 },
  ],
  wild: [
    { id: 'grow', weight: 10 },
    { id: 'overdrive', weight: 15 },
    { id: 'multiball', weight: 30 },
    { id: 'warp', weight: 25 },
    { id: 'gravity', weight: 20 },
  ],
}

export function powerUpForRoll(intensity: 'standard' | 'wild', roll: number): PowerUpId {
  const table = POWER_UP_WEIGHTS[intensity]
  let cursor = Math.min(0.999_999, Math.max(0, roll)) * table.reduce((total, item) => total + item.weight, 0)
  for (const item of table) {
    cursor -= item.weight
    if (cursor < 0) return item.id
  }
  return table.at(-1)?.id ?? 'grow'
}

function playerCourtPosition(player: PlayerState): { x: number; y: number } {
  if (player.side === 'left') return { x: PADDLE_OFFSET, y: player.position }
  if (player.side === 'right') return { x: 1 - PADDLE_OFFSET, y: player.position }
  if (player.side === 'top') return { x: player.position, y: PADDLE_OFFSET }
  return { x: player.position, y: 1 - PADDLE_OFFSET }
}

function nearestPlayer(state: GameState, x: number, y: number): PlayerState | undefined {
  return Object.values(state.players).sort((first, second) => {
    const a = playerCourtPosition(first)
    const b = playerCourtPosition(second)
    return Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)
  })[0]
}

function updatePowerUp(state: GameState): void {
  if (!state.powerUp) {
    state.powerUpSpawnTicks -= 1
    if (state.powerUpSpawnTicks > 0 || state.config.itemIntensity === 'off') return
    const intensity = state.config.itemIntensity === 'wild' ? 'wild' : 'standard'
    const id = powerUpForRoll(intensity, randomFrom(state))
    state.powerUp = {
      id,
      x: 0.32 + randomFrom(state) * 0.36,
      y: 0.32 + randomFrom(state) * 0.36,
      ageTicks: 0,
    }
    state.events.push({ type: 'powerUpSpawn', powerUp: { ...state.powerUp } })
    return
  }
  state.powerUp.ageTicks += 1
  if (state.powerUp.ageTicks >= POWER_UP_LIFETIME_TICKS) {
    state.powerUp = null
    state.powerUpSpawnTicks = nextPowerUpDelay(state.config.itemIntensity, randomFrom(state))
    return
  }
  // The staged serve ball is not a shot and cannot collect an orb while parked
  // at centre. The orb still ages, so the pause does not extend its lifetime.
  if (state.serveTicks > 0) return
  for (const ball of state.balls) {
    if (Math.hypot(ball.x - state.powerUp.x, ball.y - state.powerUp.y) > ball.radius + 0.028) continue
    const player = (ball.lastToucherId ? state.players[ball.lastToucherId] : undefined)
      ?? nearestPlayer(state, state.powerUp.x, state.powerUp.y)
    applyPowerUp(state, state.powerUp.id, player)
    state.powerUp = null
    state.powerUpSpawnTicks = nextPowerUpDelay(state.config.itemIntensity, randomFrom(state))
    break
  }
}

function updateBall(state: GameState, ball: BallState): void {
  ball.warpCooldownTicks = Math.max(0, ball.warpCooldownTicks - 1)
  if (ball.transientTicks !== null) ball.transientTicks -= 1
  updateWorldEffects(state, ball)
  if (ball.spin !== 0) {
    const speed = Math.hypot(ball.vx, ball.vy)
    const angle = Math.atan2(ball.vy, ball.vx) + ball.spin * TICK_SECONDS
    ball.vx = Math.cos(angle) * speed
    ball.vy = Math.sin(angle) * speed
    ball.spin *= 0.991
  }
  ball.x += ball.vx * TICK_SECONDS
  ball.y += ball.vy * TICK_SECONDS
  if (applyPulse(state, ball)) return
  processSide(state, ball, 'left')
  processSide(state, ball, 'right')
  processSide(state, ball, 'top')
  processSide(state, ball, 'bottom')
}

function emitCountdown(state: GameState): void {
  const before = Math.ceil((state.countdownTicks + 1) / TICK_RATE)
  const after = Math.ceil(state.countdownTicks / TICK_RATE)
  if (after !== before && after > 0) state.events.push({ type: 'countdown', value: after })
}

export function stepGame(state: GameState, inputs: InputMap = {}): GameState {
  normalizeGameState(state)
  state.events = []
  if (state.phase === 'finished') return state
  state.tick += 1
  if (state.phase === 'countdown') {
    updatePlayers(state, inputs)
    state.countdownTicks -= 1
    emitCountdown(state)
    if (state.countdownTicks <= 0) {
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
  if (!state.overtime) state.remainingTicks = Math.max(0, state.remainingTicks - 1)
  if (state.serveTicks > 0) {
    state.serveTicks -= 1
    if (state.serveTicks === 0 && state.servingPlayerId) {
      const server = state.players[state.servingPlayerId]
      if (server) {
        const velocity = serveVelocityForPlayer(server)
        for (const ball of state.balls) {
          if (Math.hypot(ball.vx, ball.vy) > 1e-9) continue
          ball.vx = velocity.vx
          ball.vy = velocity.vy
        }
      }
      state.servingPlayerId = null
    }
  } else {
    for (const ball of state.balls) {
      updateBall(state, ball)
      if (state.winnerTeam !== null || state.serveTicks > 0) break
    }
  }
  state.balls = state.balls.filter((ball, index) => index === 0 || ball.transientTicks === null || ball.transientTicks > 0)
  state.worldEffects.warpTicks = Math.max(0, state.worldEffects.warpTicks - 1)
  state.worldEffects.gravityTicks = Math.max(0, state.worldEffects.gravityTicks - 1)
  updatePowerUp(state)
  checkWinner(state)
  let freezeTicks = 0
  for (const event of state.events) {
    if (event.type === 'score') freezeTicks = Math.max(freezeTicks, 8)
    else if (event.type === 'shield') freezeTicks = Math.max(freezeTicks, 6)
    else if (event.type === 'hit' && event.perfect) freezeTicks = Math.max(freezeTicks, 4)
  }
  state.freezeTicks = Math.max(state.freezeTicks, freezeTicks)
  return state
}

export function restartGame(state: GameState, seed = state.config.seed + 1): GameState {
  return createGame({ ...state.config, seed })
}

export function secondsRemaining(state: GameState): number {
  return Math.ceil(state.remainingTicks / TICK_RATE)
}
