export const COOP_TICK_RATE = 60
export const COOP_MATCH_SECONDS = 75

export type OarSide = 'left' | 'right'
export type RiverObjectType = 'firefly' | 'rock' | 'heart'

export interface CoopPlayer {
  id: string
  name: string
  side: OarSide
}

export interface RiverObject {
  id: number
  type: RiverObjectType
  x: number
  y: number
  radius: number
  phase: number
}

export type CoopEvent =
  | { type: 'tripStart' }
  | { type: 'collected'; value: number; x: number; y: number }
  | { type: 'crash'; x: number; y: number }
  | { type: 'healed'; x: number; y: number }
  | { type: 'tripFinished'; score: number; distance: number }

export interface CoopGameState {
  rulesetVersion: 4
  phase: 'countdown' | 'playing' | 'finished'
  tick: number
  countdownTicks: number
  durationTicks: number
  seed: number
  nextObjectId: number
  players: Record<string, CoopPlayer>
  boat: {
    x: number
    heading: number
    speed: number
    wake: number
  }
  paddles: { left: number; right: number }
  objects: RiverObject[]
  score: number
  hearts: number
  streak: number
  bestStreak: number
  distance: number
  events: CoopEvent[]
}

export interface CoopInput { paddle: number }
export type CoopInputs = Record<string, CoopInput>

function random(state: CoopGameState): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0
  return state.seed / 0x1_0000_0000
}

function spawnObject(state: CoopGameState, y = -0.12): void {
  const roll = random(state)
  const type: RiverObjectType = roll < 0.61 ? 'firefly' : roll < 0.94 ? 'rock' : 'heart'
  state.objects.push({
    id: state.nextObjectId++,
    type,
    x: 0.16 + random(state) * 0.68,
    y,
    radius: type === 'rock' ? 0.055 : type === 'heart' ? 0.038 : 0.03,
    phase: random(state) * Math.PI * 2,
  })
}

export function createCoopGame(
  humans: Array<{ id: string; name: string }>,
  seed = Date.now() >>> 0,
): CoopGameState {
  const players: Record<string, CoopPlayer> = {}
  humans.slice(0, 2).forEach((human, index) => {
    players[human.id] = { ...human, side: index === 0 ? 'left' : 'right' }
  })
  const state: CoopGameState = {
    rulesetVersion: 4,
    phase: 'countdown',
    tick: 0,
    countdownTicks: COOP_TICK_RATE * 3,
    durationTicks: COOP_TICK_RATE * COOP_MATCH_SECONDS,
    seed: seed || 1,
    nextObjectId: 1,
    players,
    boat: { x: 0.5, heading: 0, speed: 0, wake: 0 },
    paddles: { left: 0, right: 0 },
    objects: [],
    score: 0,
    hearts: 3,
    streak: 0,
    bestStreak: 0,
    distance: 0,
    events: [],
  }
  for (let index = 0; index < 8; index += 1) spawnObject(state, 0.04 + index * 0.12)
  return state
}

export function restartCoopGame(previous: CoopGameState, seed = Date.now() >>> 0): CoopGameState {
  return createCoopGame(Object.values(previous.players).sort((a, b) => a.side.localeCompare(b.side)), seed)
}

export function advanceCoopGame(state: CoopGameState, inputs: CoopInputs): void {
  state.events = []
  state.tick += 1
  const ordered = Object.values(state.players)
  const leftPlayer = ordered.find((player) => player.side === 'left')
  const rightPlayer = ordered.find((player) => player.side === 'right')
  state.paddles.left = Math.max(0, Math.min(1, leftPlayer ? inputs[leftPlayer.id]?.paddle ?? 0 : 0))
  state.paddles.right = Math.max(0, Math.min(1, rightPlayer ? inputs[rightPlayer.id]?.paddle ?? 0 : 0))

  if (state.phase === 'countdown') {
    state.countdownTicks -= 1
    if (state.countdownTicks <= 0) {
      state.phase = 'playing'
      state.events.push({ type: 'tripStart' })
    }
    return
  }
  if (state.phase !== 'playing') return

  const together = (state.paddles.left + state.paddles.right) / 2
  const difference = state.paddles.left - state.paddles.right
  state.boat.heading += (difference * 0.0028 - state.boat.heading * 0.075)
  state.boat.heading = Math.max(-0.022, Math.min(0.022, state.boat.heading))
  state.boat.x += state.boat.heading
  if (state.boat.x < 0.11 || state.boat.x > 0.89) {
    state.boat.x = Math.max(0.11, Math.min(0.89, state.boat.x))
    state.boat.heading *= -0.35
  }
  state.boat.speed += ((0.0036 + together * 0.0054) - state.boat.speed) * 0.12
  state.boat.wake = together
  state.distance += state.boat.speed * 8

  for (const object of state.objects) {
    object.y += state.boat.speed
    object.phase += 0.045
  }
  if (state.tick % 44 === 0) spawnObject(state)

  const boatY = 0.76
  const survivors: RiverObject[] = []
  for (const object of state.objects) {
    const dx = object.x - state.boat.x
    const dy = object.y - boatY
    const collided = dx * dx + dy * dy < (object.radius + 0.052) ** 2
    if (collided) {
      if (object.type === 'firefly') {
        state.streak += 1
        state.bestStreak = Math.max(state.bestStreak, state.streak)
        const value = 10 + Math.min(40, Math.floor(state.streak / 3) * 5)
        state.score += value
        state.events.push({ type: 'collected', value, x: object.x, y: object.y })
      } else if (object.type === 'heart') {
        state.hearts = Math.min(3, state.hearts + 1)
        state.score += 25
        state.events.push({ type: 'healed', x: object.x, y: object.y })
      } else {
        state.hearts -= 1
        state.streak = 0
        state.boat.speed *= 0.35
        state.boat.heading += dx > 0 ? -0.014 : 0.014
        state.events.push({ type: 'crash', x: object.x, y: object.y })
      }
    } else if (object.y < 1.12) survivors.push(object)
  }
  state.objects = survivors

  const elapsed = state.tick - COOP_TICK_RATE * 3
  if (elapsed >= state.durationTicks || state.hearts <= 0) {
    state.phase = 'finished'
    state.hearts = Math.max(0, state.hearts)
    state.events.push({ type: 'tripFinished', score: state.score, distance: state.distance })
  }
}

export function coopSecondsRemaining(state: CoopGameState): number {
  if (state.phase === 'countdown') return COOP_MATCH_SECONDS
  return Math.max(0, Math.ceil((state.durationTicks - (state.tick - COOP_TICK_RATE * 3)) / COOP_TICK_RATE))
}
