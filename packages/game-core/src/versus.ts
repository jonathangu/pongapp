import { COOP_TICK_RATE } from './coop'

export const VERSUS_SECONDS = 60
export const VERSUS_FINISH_DISTANCE = 620
export type RaceItemType = 'rock' | 'orb' | 'ramp'

export interface RaceItem {
  id: number
  distance: number
  lane: 0 | 1
  type: RaceItemType
  resolvedBy: string[]
}
export interface RacerState {
  id: string
  name: string
  slot: 0 | 1
  lane: 0 | 1
  distance: number
  speed: number
  hearts: number
  score: number
  boostTicks: number
  jumpTicks: number
  lastPaddle: number
  finishedAtTick: number | null
}
export type VersusEvent =
  | { type: 'raceStart' }
  | { type: 'laneSwitch'; playerId: string }
  | { type: 'raceCrash'; playerId: string }
  | { type: 'orb'; playerId: string; value: number }
  | { type: 'ramp'; playerId: string }
  | { type: 'raceFinished'; winnerId: string | null }

export interface VersusGameState {
  rulesetVersion: 6
  phase: 'countdown' | 'playing' | 'finished'
  tick: number
  countdownTicks: number
  durationTicks: number
  finishDistance: number
  seed: number
  racers: Record<string, RacerState>
  items: RaceItem[]
  winnerId: string | null
  events: VersusEvent[]
}

function next(seed: number): number { return (Math.imul(seed, 1664525) + 1013904223) >>> 0 }

export function createVersusGame(players: Array<{ id: string; name: string }>, seed = Date.now() >>> 0): VersusGameState {
  const racers: Record<string, RacerState> = {}
  players.slice(0, 2).forEach((player, index) => {
    racers[player.id] = { ...player, slot: index as 0 | 1, lane: index as 0 | 1, distance: 0, speed: 7, hearts: 3, score: 0, boostTicks: 0, jumpTicks: 0, lastPaddle: 0, finishedAtTick: null }
  })
  let randomSeed = seed || 1
  const items: RaceItem[] = []
  for (let distance = 38, id = 1; distance < VERSUS_FINISH_DISTANCE; distance += 23 + (randomSeed % 8), id += 1) {
    randomSeed = next(randomSeed); const roll = randomSeed / 0x1_0000_0000
    randomSeed = next(randomSeed)
    items.push({ id, distance, lane: (randomSeed % 2) as 0 | 1, type: roll < 0.58 ? 'rock' : roll < 0.9 ? 'orb' : 'ramp', resolvedBy: [] })
  }
  return { rulesetVersion: 6, phase: 'countdown', tick: 0, countdownTicks: COOP_TICK_RATE * 3, durationTicks: COOP_TICK_RATE * VERSUS_SECONDS, finishDistance: VERSUS_FINISH_DISTANCE, seed: randomSeed, racers, items, winnerId: null, events: [] }
}

export function restartVersusGame(state: VersusGameState, seed = Date.now() >>> 0): VersusGameState {
  return createVersusGame(Object.values(state.racers).sort((a, b) => a.slot - b.slot), seed)
}

export function advanceVersusGame(state: VersusGameState, inputs: Record<string, { paddle: number }>): void {
  state.events = []; state.tick += 1
  if (state.phase === 'countdown') { state.countdownTicks -= 1; if (state.countdownTicks <= 0) { state.phase = 'playing'; state.events.push({ type: 'raceStart' }) }; return }
  if (state.phase !== 'playing') return

  for (const racer of Object.values(state.racers)) {
    const paddle = Math.max(0, Math.min(1, inputs[racer.id]?.paddle ?? 0))
    if (paddle > 0.5 && racer.lastPaddle <= 0.5) {
      racer.lane = racer.lane === 0 ? 1 : 0
      racer.boostTicks = Math.max(racer.boostTicks, 34)
      racer.speed = Math.min(15, racer.speed + 1.5)
      state.events.push({ type: 'laneSwitch', playerId: racer.id })
    }
    racer.lastPaddle = paddle
    if (racer.boostTicks > 0) racer.boostTicks -= 1
    if (racer.jumpTicks > 0) racer.jumpTicks -= 1
    const targetSpeed = 7.5 + (racer.boostTicks > 0 ? 2.8 : 0)
    racer.speed += (targetSpeed - racer.speed) * 0.045
    const before = racer.distance
    racer.distance += racer.speed / COOP_TICK_RATE
    for (const item of state.items) {
      if (item.resolvedBy.includes(racer.id) || item.distance <= before || item.distance > racer.distance) continue
      item.resolvedBy.push(racer.id)
      if (item.lane !== racer.lane) continue
      if (item.type === 'rock' && racer.jumpTicks <= 0) { racer.hearts -= 1; racer.speed *= 0.45; state.events.push({ type: 'raceCrash', playerId: racer.id }) }
      else if (item.type === 'orb') { racer.score += 50; racer.boostTicks = Math.max(racer.boostTicks, 120); state.events.push({ type: 'orb', playerId: racer.id, value: 50 }) }
      else if (item.type === 'ramp') { racer.score += 25; racer.jumpTicks = 95; racer.boostTicks = Math.max(racer.boostTicks, 80); state.events.push({ type: 'ramp', playerId: racer.id }) }
    }
    if (racer.hearts <= 0) { racer.hearts = 1; racer.speed = 3.8; racer.distance = Math.max(0, racer.distance - 12) }
    if (racer.distance >= state.finishDistance && racer.finishedAtTick === null) racer.finishedAtTick = state.tick
  }

  const racers = Object.values(state.racers)
  const elapsed = state.tick - COOP_TICK_RATE * 3
  if (racers.some((racer) => racer.finishedAtTick !== null) || elapsed >= state.durationTicks) {
    state.phase = 'finished'
    const ranked = [...racers].sort((a, b) => {
      if (a.finishedAtTick !== null || b.finishedAtTick !== null) return (a.finishedAtTick ?? Infinity) - (b.finishedAtTick ?? Infinity)
      return b.distance - a.distance || b.score - a.score
    })
    state.winnerId = ranked[0]?.id ?? null
    state.events.push({ type: 'raceFinished', winnerId: state.winnerId })
  }
}

export function versusSecondsRemaining(state: VersusGameState): number {
  if (state.phase === 'countdown') return VERSUS_SECONDS
  return Math.max(0, Math.ceil((state.durationTicks - (state.tick - COOP_TICK_RATE * 3)) / COOP_TICK_RATE))
}
