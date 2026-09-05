export const COOP_TICK_RATE = 60
export const COOP_MATCH_SECONDS = 90

export type OarSide = 'left' | 'right'
export type RiverObjectType = 'firefly' | 'rock' | 'log' | 'heart' | 'lantern'

export interface CoopPlayer { id: string; name: string; side: OarSide }
export interface RiverObject {
  id: number
  type: RiverObjectType
  x: number
  y: number
  radius: number
  phase: number
  drift: number
}
export type CoopEvent =
  | { type: 'tripStart' }
  | { type: 'collected'; value: number; x: number; y: number }
  | { type: 'crash'; x: number; y: number }
  | { type: 'healed'; x: number; y: number }
  | { type: 'lantern'; x: number; y: number }
  | { type: 'rush' }
  | { type: 'smashed'; value: number; x: number; y: number }
  | { type: 'nearMiss'; value: number; x: number; y: number }
  | { type: 'tripFinished'; score: number; distance: number }

export interface CoopGameState {
  rulesetVersion: 5
  phase: 'countdown' | 'playing' | 'finished'
  tick: number
  countdownTicks: number
  durationTicks: number
  seed: number
  nextObjectId: number
  players: Record<string, CoopPlayer>
  boat: { x: number; heading: number; speed: number; wake: number }
  paddles: { left: number; right: number }
  objects: RiverObject[]
  score: number
  hearts: number
  streak: number
  bestStreak: number
  distance: number
  harmony: number
  rushTicks: number
  lanternTicks: number
  nearMisses: number
  events: CoopEvent[]
}

export interface CoopInput { paddle: number }
export type CoopInputs = Record<string, CoopInput>

function random(state: CoopGameState): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0
  return state.seed / 0x1_0000_0000
}

function spawnObject(state: CoopGameState, y = -0.12, forcedType?: RiverObjectType, forcedX?: number): void {
  const roll = random(state)
  const type: RiverObjectType = forcedType ?? (roll < 0.62 ? 'firefly' : roll < 0.82 ? 'rock' : roll < 0.91 ? 'log' : roll < 0.97 ? 'heart' : 'lantern')
  state.objects.push({
    id: state.nextObjectId++,
    type,
    x: forcedX ?? 0.15 + random(state) * 0.7,
    y,
    radius: type === 'rock' ? 0.052 : type === 'log' ? 0.065 : type === 'lantern' ? 0.043 : type === 'heart' ? 0.036 : 0.027,
    phase: random(state) * Math.PI * 2,
    drift: type === 'log' ? (random(state) - 0.5) * 0.0018 : 0,
  })
}

function spawnSwarm(state: CoopGameState): void {
  const center = 0.25 + random(state) * 0.5
  for (let index = 0; index < 5; index += 1) {
    spawnObject(state, -0.09 - index * 0.055, 'firefly', Math.max(0.14, Math.min(0.86, center + Math.sin(index * 1.7) * 0.09)))
  }
}

export function createCoopGame(humans: Array<{ id: string; name: string }>, seed = Date.now() >>> 0): CoopGameState {
  const players: Record<string, CoopPlayer> = {}
  humans.slice(0, 2).forEach((human, index) => { players[human.id] = { ...human, side: index === 0 ? 'left' : 'right' } })
  const state: CoopGameState = {
    rulesetVersion: 5, phase: 'countdown', tick: 0, countdownTicks: COOP_TICK_RATE * 3,
    durationTicks: COOP_TICK_RATE * COOP_MATCH_SECONDS, seed: seed || 1, nextObjectId: 1, players,
    boat: { x: 0.5, heading: 0, speed: 0, wake: 0 }, paddles: { left: 0, right: 0 }, objects: [],
    score: 0, hearts: 3, streak: 0, bestStreak: 0, distance: 0, harmony: 0, rushTicks: 0,
    lanternTicks: 0, nearMisses: 0, events: [],
  }
  ;[0.38, 0.5, 0.62].forEach((x, index) => spawnObject(state, 0.08 + index * 0.13, 'firefly', x))
  spawnObject(state, 0.53, 'rock', 0.32)
  spawnObject(state, 0.67, 'firefly', 0.62)
  return state
}

export function restartCoopGame(previous: CoopGameState, seed = Date.now() >>> 0): CoopGameState {
  return createCoopGame(Object.values(previous.players).sort((a, b) => a.side.localeCompare(b.side)), seed)
}

export function advanceCoopGame(state: CoopGameState, inputs: CoopInputs): void {
  state.events = []
  state.tick += 1
  const players = Object.values(state.players)
  const left = players.find((player) => player.side === 'left')
  const right = players.find((player) => player.side === 'right')
  state.paddles.left = Math.max(0, Math.min(1, left ? inputs[left.id]?.paddle ?? 0 : 0))
  state.paddles.right = Math.max(0, Math.min(1, right ? inputs[right.id]?.paddle ?? 0 : 0))
  if (state.phase === 'countdown') {
    state.countdownTicks -= 1
    if (state.countdownTicks <= 0) { state.phase = 'playing'; state.events.push({ type: 'tripStart' }) }
    return
  }
  if (state.phase !== 'playing') return

  const synchronized = state.paddles.left > 0.72 && state.paddles.right > 0.72
  if (synchronized && state.rushTicks <= 0) state.harmony = Math.min(100, state.harmony + 1.15)
  else state.harmony = Math.max(0, state.harmony - 0.12)
  if (state.harmony >= 100) { state.harmony = 0; state.rushTicks = COOP_TICK_RATE * 3; state.events.push({ type: 'rush' }) }
  if (state.rushTicks > 0) state.rushTicks -= 1
  if (state.lanternTicks > 0) state.lanternTicks -= 1

  const together = (state.paddles.left + state.paddles.right) / 2
  const difference = state.paddles.left - state.paddles.right
  state.boat.heading += difference * 0.0028 - state.boat.heading * 0.075
  state.boat.heading = Math.max(-0.022, Math.min(0.022, state.boat.heading))
  state.boat.x += state.boat.heading
  if (state.boat.x < 0.11 || state.boat.x > 0.89) { state.boat.x = Math.max(0.11, Math.min(0.89, state.boat.x)); state.boat.heading *= -0.35 }
  const powerSpeed = state.rushTicks > 0 ? 0.0045 : state.lanternTicks > 0 ? 0.0018 : 0
  state.boat.speed += (0.0034 + together * 0.0052 + powerSpeed - state.boat.speed) * 0.12
  state.boat.wake = Math.min(1, together + (state.rushTicks > 0 ? 0.5 : 0))
  state.distance += state.boat.speed * 8

  for (const object of state.objects) {
    object.y += state.boat.speed
    object.phase += 0.045
    if (object.type === 'log') {
      object.x += object.drift + Math.sin(object.phase) * 0.00045
      if (object.x < 0.15 || object.x > 0.85) object.drift *= -1
    }
    if ((state.rushTicks > 0 || state.lanternTicks > 0) && object.type === 'firefly' && object.y > 0.34) object.x += (state.boat.x - object.x) * 0.018
  }
  const elapsed = state.tick - COOP_TICK_RATE * 3
  const spawnEvery = elapsed > COOP_TICK_RATE * 58 ? 36 : elapsed > COOP_TICK_RATE * 28 ? 40 : 45
  if (state.tick % spawnEvery === 0) spawnObject(state)
  if (elapsed > 0 && elapsed % (COOP_TICK_RATE * 16) === 0) spawnSwarm(state)

  const boatY = 0.76
  const survivors: RiverObject[] = []
  for (const object of state.objects) {
    const dx = object.x - state.boat.x
    const dy = object.y - boatY
    const collided = dx * dx + dy * dy < (object.radius + 0.052) ** 2
    const hazard = object.type === 'rock' || object.type === 'log'
    if (collided) {
      if (object.type === 'firefly') {
        state.streak += 1; state.bestStreak = Math.max(state.bestStreak, state.streak)
        const multiplier = state.rushTicks > 0 ? 2 : state.lanternTicks > 0 ? 1.5 : 1
        const value = Math.round((10 + Math.min(50, Math.floor(state.streak / 3) * 5)) * multiplier)
        state.score += value; state.events.push({ type: 'collected', value, x: object.x, y: object.y })
      } else if (object.type === 'heart') {
        state.hearts = Math.min(3, state.hearts + 1); state.score += 35; state.events.push({ type: 'healed', x: object.x, y: object.y })
      } else if (object.type === 'lantern') {
        state.lanternTicks = COOP_TICK_RATE * 8; state.score += 100; state.events.push({ type: 'lantern', x: object.x, y: object.y })
      } else if (hazard && state.rushTicks > 0) {
        const value = 30; state.score += value; state.events.push({ type: 'smashed', value, x: object.x, y: object.y })
      } else if (hazard) {
        state.hearts -= 1; state.streak = 0; state.boat.speed *= 0.32; state.boat.heading += dx > 0 ? -0.014 : 0.014
        state.events.push({ type: 'crash', x: object.x, y: object.y })
      }
    } else {
      const crossedBoat = hazard && object.y >= boatY + object.radius && object.y - state.boat.speed < boatY + object.radius
      if (crossedBoat && Math.abs(dx) < 0.14) { const value = 15; state.nearMisses += 1; state.score += value; state.events.push({ type: 'nearMiss', value, x: object.x, y: object.y }) }
      if (object.y < 1.12) survivors.push(object)
    }
  }
  state.objects = survivors
  if (elapsed >= state.durationTicks || state.hearts <= 0) {
    state.phase = 'finished'; state.hearts = Math.max(0, state.hearts)
    state.events.push({ type: 'tripFinished', score: state.score, distance: state.distance })
  }
}

export function coopSecondsRemaining(state: CoopGameState): number {
  if (state.phase === 'countdown') return COOP_MATCH_SECONDS
  return Math.max(0, Math.ceil((state.durationTicks - (state.tick - COOP_TICK_RATE * 3)) / COOP_TICK_RATE))
}

export function coopProgress(state: CoopGameState): number {
  if (state.phase === 'countdown') return 0
  return Math.max(0, Math.min(1, (state.tick - COOP_TICK_RATE * 3) / state.durationTicks))
}
