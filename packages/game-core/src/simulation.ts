import {
  ABILITY_COOLDOWNS,
  AI_PROFILE,
  BALL_RADIUS,
  BALL_SPEED_CAP,
  BALL_SPEED_RAMP,
  BALL_START_SPEED,
  BASE_PADDLE_LENGTH,
  FREEZE_TICKS,
  GROWN_PADDLE_LENGTH,
  MATCH_COUNTDOWN_TICKS,
  PADDLE_OFFSET,
  PADDLE_SPEED,
  PERFECT_RAMP_BONUS,
  POWER_UP_LIFETIME_TICKS,
  POWER_UP_WEIGHTS,
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
import { POWER_UPS, RALLY_STEPS, rallyMultiplier } from './types'

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
    radius: BALL_RADIUS,
    spin: 0,
    lastToucherId: null,
    warpCooldownTicks: 0,
    transientTicks,
  }
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
    rallyHits: 0,
    longestRally: 0,
    freezeTicks: 0,
    servingPlayerId: null,
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
  state.powerUpSpawnTicks = nextPowerUpDelay(config.itemIntensity, randomFrom(state))
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
    const input = inputs[player.id] ?? { target: player.position, abilityPressed: false }
    activateAbility(state, player, input)
    const previous = player.position
    // The AI's handicap. It used to move at exactly the player's speed, and
    // since PADDLE_SPEED (1.35) exceeds BALL_SPEED_CAP (1.12), a perfect
    // predictor could always be where the ball was going — which is why
    // reactionTicks never functioned as a difficulty knob. A *lower* cap keeps
    // the existing "does not exceed the shared movement limit" test true.
    const reach = player.isAi ? AI_PROFILE[player.aiDifficulty ?? 'rally'].speed : 1
    const maximumMove = PADDLE_SPEED * reach * TICK_SECONDS
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

function applyPaddleContact(state: GameState, ball: BallState, player: PlayerState): void {
  bounceFromSide(ball, player.side)
  const relative = clamp((coordinateForSide(ball, player.side) - player.position) / (lengthFor(player) / 2), -1, 1)
  const perfect = Math.abs(relative) < 0.22
  const tangent = relative * 0.34 + player.velocity * 0.045
  if (player.side === 'left' || player.side === 'right') ball.vy += tangent
  else ball.vx += tangent
  if (player.bendTicks > 0) {
    // Bend used to add at most 0.08 rad/s decaying on an ~83-tick half-life:
    // about six degrees of curvature across the ball's whole flight, which is
    // invisible. The AI's predictor ignores spin entirely, so a curve it cannot
    // read is one of the few genuine counters to a strong opponent — but only if
    // the player can see it happen. This is roughly thirty degrees.
    ball.spin += clamp(player.velocity * 0.045 + relative * 0.14, -0.25, 0.25)
    player.bendTicks = 0
  }
  if (player.overdriveHits > 0) {
    rampBall(ball, 1.25)
    player.overdriveHits -= 1
  } else {
    rampBall(ball)
  }
  ball.lastToucherId = player.id
  player.returns += 1
  state.rallyHits += 1
  if (perfect) {
    player.perfectReturns += 1
    // The UI has always claimed a perfect return "fires back faster". Until now
    // that was false — the ramp was identical for a centred hit and an edge
    // one, and the only reward was the cooldown refund below.
    rampBall(ball, PERFECT_RAMP_BONUS)
    player.cooldownTicks = Math.max(0, player.cooldownTicks - Math.round(0.5 * TICK_RATE))
  }
  state.events.push({ type: 'hit', playerId: player.id, ballId: ball.id, perfect, speed: Math.hypot(ball.vx, ball.vy) })
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
      // A parry keeps the rally alive, so it has to count toward it — this path
      // returns early and never reaches `applyPaddleContact`.
      state.rallyHits += 1
      state.events.push({ type: 'hit', playerId: player.id, ballId: ball.id, perfect: true, speed: Math.hypot(ball.vx, ball.vy) })
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
  // A long rally is worth more than a short one. Without this the escalation the
  // renderer already draws — brighter rim, more bloom, longer trail — buys the
  // player nothing, and a twenty-hit point scores exactly what an ace does.
  const rallyHits = state.rallyHits ?? 0
  const points = rallyMultiplier(rallyHits)
  state.scores[scorer.team] = (state.scores[scorer.team] ?? 0) + points
  state.events.push({
    type: 'score',
    scorerId: scorer.id,
    team: scorer.team,
    againstPlayerId: defender.id,
    ballId: ball.id,
    points,
    rallyHits,
  })
  state.longestRally = Math.max(state.longestRally ?? 0, rallyHits)
  state.rallyHits = 0
  Object.assign(ball, freshBall(state, ball.id, ball.transientTicks))
  // The conceding player serves, and aims it while the ball is held at centre.
  state.servingPlayerId = defender.id
  state.serveTicks = SERVE_DELAY_TICKS
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

/** Weighted pick, so `wild` is qualitatively wilder and not merely more frequent. */
function drawPowerUp(state: GameState): PowerUpId {
  const intensity = state.config.itemIntensity === 'wild' ? 'wild' : 'standard'
  const weights = POWER_UP_WEIGHTS[intensity]
  const total = POWER_UPS.reduce((sum, id) => sum + (weights[id] ?? 0), 0)
  let roll = randomFrom(state) * total
  for (const id of POWER_UPS) {
    roll -= weights[id] ?? 0
    if (roll <= 0) return id
  }
  return 'grow'
}

/**
 * Who collects an orb a ball reached without anyone having touched it.
 *
 * `grow` and `overdrive` were gated on a toucher existing, so an orb claimed by
 * a fresh serve or a `multiball` spawn — both of which start with
 * `lastToucherId === null` — was silently voided: the event fired and nothing
 * happened. Awarding it to whoever is closest keeps the pickup real.
 */
function nearestPlayer(state: GameState, x: number, y: number): PlayerState | undefined {
  let closest: PlayerState | undefined
  let best = Number.POSITIVE_INFINITY
  for (const player of Object.values(state.players)) {
    const px = player.side === 'left' ? PADDLE_OFFSET : player.side === 'right' ? 1 - PADDLE_OFFSET : player.position
    const py = player.side === 'top' ? PADDLE_OFFSET : player.side === 'bottom' ? 1 - PADDLE_OFFSET : player.position
    const distance = Math.hypot(px - x, py - y)
    if (distance < best) {
      best = distance
      closest = player
    }
  }
  return closest
}

function updatePowerUp(state: GameState): void {
  if (!state.powerUp) {
    state.powerUpSpawnTicks -= 1
    if (state.powerUpSpawnTicks > 0 || state.config.itemIntensity === 'off') return
    const id = drawPowerUp(state)
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
  // `ageTicks` was incremented and never read, so an orb nobody hit loitered for
  // the rest of the match.
  if (state.powerUp.ageTicks > POWER_UP_LIFETIME_TICKS) {
    state.powerUp = null
    state.powerUpSpawnTicks = nextPowerUpDelay(state.config.itemIntensity, randomFrom(state))
    return
  }
  for (const ball of state.balls) {
    if (Math.hypot(ball.x - state.powerUp.x, ball.y - state.powerUp.y) > ball.radius + 0.028) continue
    const player = ball.lastToucherId
      ? state.players[ball.lastToucherId]
      : nearestPlayer(state, state.powerUp.x, state.powerUp.y)
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
    ball.spin *= 0.992
  }
  ball.x += ball.vx * TICK_SECONDS
  ball.y += ball.vy * TICK_SECONDS
  if (applyPulse(state, ball)) return
  processSide(state, ball, 'left')
  processSide(state, ball, 'right')
  processSide(state, ball, 'top')
  processSide(state, ball, 'bottom')
}

/**
 * Point the held ball away from the server's wall, angled by where they are
 * standing, at the instant the serve is released.
 *
 * Re-aiming at release rather than at goal time is what makes it a decision:
 * the server has the whole `SERVE_DELAY_TICKS` window to slide their paddle and
 * pick a line, using the movement controls they already have.
 */
function aimServe(state: GameState): void {
  const server = state.servingPlayerId ? state.players[state.servingPlayerId] : undefined
  const ball = state.balls[0]
  if (!server || !ball) return
  const speed = Math.hypot(ball.vx, ball.vy) || BALL_START_SPEED
  // -1 at one end of their wall, +1 at the other, softened so a full-lock aim
  // still crosses the court rather than skimming the side walls.
  const lateral = clamp((server.position - 0.5) * 2, -1, 1) * 0.75
  let dx = 0
  let dy = 0
  if (server.side === 'bottom') { dx = lateral; dy = -1 }
  else if (server.side === 'top') { dx = lateral; dy = 1 }
  else if (server.side === 'left') { dx = 1; dy = lateral }
  else { dx = -1; dy = lateral }
  const length = Math.hypot(dx, dy) || 1
  ball.vx = (dx / length) * speed
  ball.vy = (dy / length) * speed
  ball.spin = 0
}

function emitCountdown(state: GameState): void {
  const before = Math.ceil((state.countdownTicks + 1) / TICK_RATE)
  const after = Math.ceil(state.countdownTicks / TICK_RATE)
  if (after !== before && after > 0) state.events.push({ type: 'countdown', value: after })
}

/** Announce each rally step exactly once, on the tick it is crossed. */
function emitRallyMilestones(state: GameState, before: number): void {
  for (const step of RALLY_STEPS) {
    if (before < step.hits && state.rallyHits >= step.hits) {
      state.events.push({ type: 'rallyHot', hits: step.hits, multiplier: step.multiplier })
    }
  }
}

/**
 * Hitstop, set from the events this tick produced.
 *
 * Freezing on contact is the largest single upgrade to how a hit feels, and
 * `docs/DESIGN.md` §7 requires it here rather than in the renderer: `LocalMatch`
 * owns the clock locally and the room worker owns it online, so a renderer-side
 * freeze would drift from a simulation that did not freeze. Because it is a
 * fixed tick count keyed off an event, every client and the server freeze
 * identically — and because it is in the simulation, it cannot be a per-player
 * comfort setting.
 */
function applyHitstop(state: GameState): void {
  let freeze = 0
  for (const event of state.events) {
    if (event.type === 'score') freeze = Math.max(freeze, FREEZE_TICKS.score)
    else if (event.type === 'shield') freeze = Math.max(freeze, FREEZE_TICKS.shield)
    else if (event.type === 'hit' && event.perfect) freeze = Math.max(freeze, FREEZE_TICKS.perfect)
  }
  if (freeze > 0) state.freezeTicks = freeze
}

export function stepGame(state: GameState, inputs: InputMap = {}): GameState {
  state.events = []
  if (state.phase === 'finished') return state
  state.tick += 1

  // The world is held, but the tick still advances so snapshot cadence and the
  // renderer's frame pacing are unaffected. `?? 0` because a room persisted
  // before this field existed can rehydrate without it.
  if ((state.freezeTicks ?? 0) > 0) {
    state.freezeTicks -= 1
    return state
  }

  const rallyBefore = state.rallyHits ?? 0
  updatePlayers(state, inputs)
  if (state.phase === 'countdown') {
    state.countdownTicks -= 1
    emitCountdown(state)
    if (state.countdownTicks <= 0) {
      state.phase = 'playing'
      state.events.push({ type: 'matchStart' })
    }
    return state
  }
  if (!state.overtime) state.remainingTicks = Math.max(0, state.remainingTicks - 1)
  if (state.serveTicks > 0) {
    state.serveTicks -= 1
    if (state.serveTicks === 0) aimServe(state)
  } else {
    for (const ball of state.balls) updateBall(state, ball)
  }
  state.balls = state.balls.filter((ball, index) => index === 0 || ball.transientTicks === null || ball.transientTicks > 0)
  state.worldEffects.warpTicks = Math.max(0, state.worldEffects.warpTicks - 1)
  state.worldEffects.gravityTicks = Math.max(0, state.worldEffects.gravityTicks - 1)
  updatePowerUp(state)
  checkWinner(state)
  emitRallyMilestones(state, rallyBefore)
  applyHitstop(state)
  return state
}

export function restartGame(state: GameState, seed = state.config.seed + 1): GameState {
  return createGame({ ...state.config, seed })
}

export function secondsRemaining(state: GameState): number {
  return Math.ceil(state.remainingTicks / TICK_RATE)
}
