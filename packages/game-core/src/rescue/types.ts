import type { VoyagePack } from '../bestiary'
/** Starling Rescue: simulation data only. No browser, renderer, clock or network imports. */
export const RESCUE_RULESET = 13 as const
export const RESCUE_STEP = 1 / 60
export const HULL_RADIUS = 4.7
export const CREW_HEIGHT = .82
export const CREW_HALF_WIDTH = .22
export const MAX_RESCUE_HUMANS = 8
export const MAX_RESCUE_CREW = 16
export const RESCUE_CREW_COLORS = ['mint', 'coral', 'gold', 'violet', 'sky', 'rose', 'lime', 'pearl'] as const
export type CrewAbility = 'none' | 'pilot' | 'medic' | 'prism' | 'spark' | 'scout'
export type ShipUpgrade = 'hull' | 'drive' | 'reactor' | 'tractor'
export const RESCUE_BUTTON = { jump: 1, interact: 2, fire: 4, drop: 8, command: 16 } as const
export type StationId = 'engine' | 'shield' | 'north' | 'east' | 'south' | 'west' | 'starburst' | 'map' | 'galley'
export type RescueRegion = 'sea' | 'space' | 'jungle'
export type GemKind = 'power' | 'beam' | 'metal'
export type BiomeId = 0 | 1 | 2
export type EnemyKind = 'moth' | 'beetle' | 'jelly' | 'needle' | 'sentinel' | 'guardian'
export interface Vec { x: number; y: number }
export interface RescueInput {
  seq: number
  x: number
  y: number
  aimX: number
  aimY: number
  buttons: number
  command: StationId | null
  commandCrew: string | null
  active: boolean
  /** Tap-to-route, automatic station operation and direct helm steering. */
  assist?: boolean
}
export interface RescueCrew extends Vec {
  id: string; name: string; color: typeof RESCUE_CREW_COLORS[number]; pet: boolean
  origin: 'human' | 'companion' | 'recruit'; ability: CrewAbility; abilityCooldown: number
  tourEnds: number
  vx: number; vy: number; grounded: boolean; ladder: string | null; facing: number
  seat: StationId | null; gem: number | null; coyote: number; jumpBuffer: number; dropTime: number
  lastButtons: number; lastSeq: number; commandSeq: number; step: number
  order: StationId; route: number[]; routeAt: number; routeAge: number; routeLastX: number; routeLastY: number
}
export interface RescueStation {
  id: StationId; angle: number; cooldown: number; charge: number; heat: number; upgrade: GemKind | null
  operated: boolean; firing: boolean; lingering: number
  flailAngle: number; flailSpeed: number
}
export interface RescueShip extends Vec {
  vx: number; vy: number; angle: 0; angularVelocity: 0; hp: number; maxHp: number
  invulnerable: number; thrust: number; hitAngle: number; shieldHits: number
}
export interface RescueObstacle extends Vec { id: number; radius: number; style: number }
export interface RescueCage extends Vec { id: number; hp: number; open: boolean; rescued: boolean; pet: number }
export interface RescueGift extends Vec { id: number; kind: GemKind; opened: boolean }
export interface RescueGem extends Vec { id: number; kind: GemKind; vx: number; vy: number; heldBy: string | null; socket: StationId | null; thrown: boolean }
export interface RescueEnemy extends Vec {
  id: number; kind: EnemyKind; hp: number; maxHp: number; radius: number; angle: number
  vx: number; vy: number; age: number; phase: 'stalk' | 'tell' | 'attack' | 'recover'; phaseTime: number
  targetX: number; targetY: number; cooldown: number; variant: number
}
export interface RescueBullet extends Vec {
  id: number; vx: number; vy: number; radius: number; damage: number; life: number
  owner: string | null; enemy: boolean; kind: 'bolt' | 'needle' | 'orb'; pierce: number; hit: number[]
}
export type RescueEventKind = 'shot' | 'beam' | 'flail' | 'shield' | 'hit' | 'boom' | 'cage' | 'rescue' | 'gem' | 'socket' | 'thrust' | 'charge' | 'starburst' | 'guardian' | 'win' | 'lose' | 'seat' | 'order' | 'meal' | 'lightning' | 'thunder' | 'ability' | 'recruit' | 'depart' | 'reunion' | 'dock' | 'upgrade'
export interface RescueEvent extends Vec { id: number; kind: RescueEventKind; angle: number; size: number; value: number; color?: GemKind; actor?: string }
export interface RescueWorld {
  width: number; height: number; obstacles: RescueObstacle[]; cages: RescueCage[]; gifts: RescueGift[]
  portal: Vec; fog: number[]; title: string
}
export interface RescueStats { shots: number; blocks: number; damage: number; rescues: number; sockets: number; travel: number; kills: number }
export interface CrewMemory { id: string; name: string; color: RescueCrew['color']; ability: CrewAbility; availableAt: number; reunions: number }
export interface RescueCampaign { salvage: number; upgrades: Record<ShipUpgrade, number>; completed: number[]; voyages: number; portVisits: number; alumni: CrewMemory[] }
export interface RescueDock extends Vec { id: string; name: string; kind: 'town' | 'city' | 'island' | 'launch'; destination: RescueRegion | null }
export interface RescueWeather { phase: 'clear' | 'building' | 'storm' | 'eye'; intensity: number; nextStrike: number; strike: (Vec & { at: number }) | null; wave: number; flash: number }
export interface RescueVessel {
  id: number; name: string; role: 'ally' | 'merchant' | 'raider'; ship: RescueShip; crew: RescueCrew[]; stations: RescueStation[]
  targetX: number; targetY: number; visited: boolean; cooldown: number; disabled: boolean
}
export interface RescueState {
  rulesetVersion: typeof RESCUE_RULESET; tick: number; time: number; seed: number; initialSeed: number; epoch: number
  biome: BiomeId; phase: 'playing' | 'won' | 'lost'; solo: boolean; paused: boolean
  ship: RescueShip; crew: RescueCrew[]; stations: RescueStation[]; world: RescueWorld
  enemies: RescueEnemy[]; bullets: RescueBullet[]; gems: RescueGem[]; events: RescueEvent[]
  nextId: number; nextWave: number; guardianSpawned: boolean; guardianDefeated: boolean; extraction: number
  stats: RescueStats; inspiration: string
  campaign: RescueCampaign; vessels: RescueVessel[]
  voyage: VoyagePack | null
  region: RescueRegion; docks: RescueDock[]; docked: string | null
  meal: { remaining: number; progress: number; cooldown: number }
  weather: RescueWeather
}
export const neutralRescueInput = (seq = 0): RescueInput => ({ seq, x: 0, y: 0, aimX: 0, aimY: 0, buttons: 0, command: null, commandCrew: null, active: true })
export const clampRescue = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const rescueAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
export const angleDistance = (a: number, b: number) => Math.abs(rescueAngle(a - b))
export function rescueRandom(s: { seed: number }): number { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296 }
export function rescueEvent(s: RescueState, kind: RescueEventKind, x = s.ship.x, y = s.ship.y, angle = 0, size = 1, value = 0, actor?: string, color?: GemKind) {
  if (s.events.length >= 80) return
  s.events.push({ id: s.nextId++, kind, x, y, angle, size, value, ...(actor ? { actor } : {}), ...(color ? { color } : {}) })
}
