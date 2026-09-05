import { advanceCrew } from './crew'

export const COOP_TICK_RATE = 60
export const COOP_MATCH_SECONDS = 120

export type OarSide = 'left' | 'right'
export type RiverObjectType = 'firefly' | 'rock' | 'log' | 'heart' | 'lantern' | 'predator' | 'relic' | 'rescue' | 'gate'
export const EXPEDITION_WORLDS = [
  { name: 'Emerald Wilds', subtitle: 'Crocodile waters & lost temples', vehicle: 'boat', sky: '#102d40', water: '#197f83', bank: '#25634c', glow: '#f6da80' },
  { name: 'Sunset Mesa', subtitle: 'Monster trucks above the canyon', vehicle: 'truck', sky: '#7a4664', water: '#ac745e', bank: '#a95549', glow: '#ffdc9d' },
  { name: 'Alpine Kingdom', subtitle: 'Snow peaks & crystal passes', vehicle: 'truck', sky: '#496990', water: '#85b7bf', bank: '#7892a8', glow: '#defbfa' },
  { name: 'Rainbow Skies', subtitle: 'Airships through floating islands', vehicle: 'airship', sky: '#586ab4', water: '#aab5db', bank: '#7d91b3', glow: '#ffe6b0' },
  { name: 'Starlight Frontier', subtitle: 'Cosmic whales & constellations', vehicle: 'ship', sky: '#100e35', water: '#342b6b', bank: '#54477d', glow: '#98f4e4' },
] as const
export function expeditionWorld(state: CoopGameState): number { return Math.min(4, Math.floor(coopProgress(state) * 5)) }

export type CrewStation = 'pilot' | 'gunner' | 'engineer'
export type CrewUpgrade = 'chain' | 'frost' | 'twin' | 'bubble' | 'magnet'
export const CREW_UPGRADES = [
  { id: 'chain', name: 'Storm coil', description: 'Lightning jumps to nearby enemies', icon: 'ϟ' },
  { id: 'frost', name: 'Frostbite', description: 'Shots slow dangerous pursuers', icon: '❄' },
  { id: 'twin', name: 'Twin fangs', description: 'A second gun covers another target', icon: '⋈' },
  { id: 'bubble', name: 'Bubble battery', description: 'Absorb one hit per chapter', icon: '◉' },
  { id: 'magnet', name: 'Salvage magnet', description: 'Pull in scrap and rescue friends', icon: '⊕' },
] as const
export interface CoopPlayer { id: string; name: string; side: OarSide; station: CrewStation }
export interface RiverObject {
  id: number
  type: RiverObjectType
  x: number
  y: number
  radius: number
  phase: number
  drift: number
  enemy?: 'chaser' | 'ambusher' | 'boss'
  hp?: number
  maxHp?: number
  age?: number
  targetX?: number
  targetY?: number
  slowTicks?: number
}
export interface CrewState {
  heat: number; overheated: boolean; shotCooldown: number
  shieldTicks: number; shieldCooldown: number; boostCooldown: number
  scrap: number; repair: number; kills: number
  swap: { from: string; to: string; expires: number } | null
  upgrades: CrewUpgrade[]; choice: number; choiceTicks: number; bubble: number
  bossSpawned: boolean; bossDefeated: boolean; victory: boolean
  finishedTick: number | null
  targetId: number | null
  shots: Array<{ id: number; x: number; y: number; toX: number; toY: number; ticks: number; kind: 'auto' | 'manual' | 'chain' }>
}
export type CoopEvent =
  | { type: 'tripStart' }
  | { type: 'collected'; value: number; x: number; y: number }
  | { type: 'crash'; x: number; y: number }
  | { type: 'healed'; x: number; y: number }
  | { type: 'lantern'; x: number; y: number }
  | { type: 'rush' }
  | { type: 'flare' }
  | { type: 'rescued'; x: number; y: number }
  | { type: 'relic'; x: number; y: number }
  | { type: 'gate'; x: number; y: number }
  | { type: 'smashed'; value: number; x: number; y: number }
  | { type: 'nearMiss'; value: number; x: number; y: number }
  | { type: 'crew'; message: string }
  | { type: 'tripFinished'; score: number; distance: number }

export interface CoopGameState {
  rulesetVersion: 7
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
  rescued: number
  relics: number
  gates: number
  flareCooldown: number
  flareTicks: number
  invulnerableTicks: number
  events: CoopEvent[]
  crew: CrewState
}

export interface CoopInput { paddle: number; flare?: boolean; steer?: number; action?: boolean; station?: CrewStation; upgrade?: CrewUpgrade; targetId?: number | null }
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

export function createCoopGame(humans: Array<{ id: string; name: string }>, seed = Date.now() >>> 0): CoopGameState {
  const players: Record<string, CoopPlayer> = {}
  humans.slice(0, 2).forEach((human, index) => { players[human.id] = { ...human, side: index === 0 ? 'left' : 'right', station: index === 0 ? 'pilot' : 'gunner' } })
  const state: CoopGameState = {
    rulesetVersion: 7, phase: 'countdown', tick: 0, countdownTicks: COOP_TICK_RATE * 3,
    durationTicks: COOP_TICK_RATE * COOP_MATCH_SECONDS, seed: seed || 1, nextObjectId: 1, players,
    boat: { x: 0.5, heading: 0, speed: 0, wake: 0 }, paddles: { left: 0, right: 0 }, objects: [],
    score: 0, hearts: 3, streak: 0, bestStreak: 0, distance: 0, harmony: 0, rushTicks: 0,
    lanternTicks: 0, nearMisses: 0, rescued: 0, relics: 0, gates: 0, flareCooldown: 0, flareTicks: 0, invulnerableTicks: 0, events: [],
    crew: { heat: 0, overheated: false, shotCooldown: 0, shieldTicks: 0, shieldCooldown: 0, boostCooldown: 0, scrap: 2, repair: 0, kills: 0, swap: null, upgrades: [], choice: 0, choiceTicks: 0, bubble: 0, bossSpawned: false, bossDefeated: false, victory: false, finishedTick: null, targetId: null, shots: [] },
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
  advanceCrew(state, inputs)
}

export function coopSecondsRemaining(state: CoopGameState): number {
  if (state.phase === 'countdown') return COOP_MATCH_SECONDS
  return Math.max(0, Math.ceil((state.durationTicks - ((state.crew.finishedTick ?? state.tick) - COOP_TICK_RATE * 3)) / COOP_TICK_RATE))
}

export function coopProgress(state: CoopGameState): number {
  if (state.phase === 'countdown') return 0
  return Math.max(0, Math.min(1, ((state.crew.finishedTick ?? state.tick) - COOP_TICK_RATE * 3) / state.durationTicks))
}
