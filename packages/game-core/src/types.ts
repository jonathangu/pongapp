export const SIDES = ['top', 'bottom'] as const
export type Side = (typeof SIDES)[number]

export const PAL_TYPES = ['guard', 'striker', 'captain'] as const
export type PalType = (typeof PAL_TYPES)[number]
export type ActivePalType = PalType | 'hatchling'

export const AI_DIFFICULTIES = ['rookie', 'rally', 'pro', 'ace'] as const
export type AiDifficulty = (typeof AI_DIFFICULTIES)[number]

export type GamePhase = 'countdown' | 'playing' | 'finished'

export interface PlayerDefinition {
  id: string
  name: string
  side: Side
  team: string
  isAi: boolean
  aiDifficulty?: AiDifficulty
  color: number
}

export interface MatchConfig {
  players: PlayerDefinition[]
  scoreToWin: number
  timeLimitTicks: number
  /** Physical longitudinal length measured in court widths. */
  courtLengthScale: number
  seed: number
}

export interface PlayerState extends PlayerDefinition {
  position: number
  velocity: number
  returns: number
  perfectReturns: number
  palEnergy: number
  palEnergyProgressTicks: number
  palsSummoned: number
  palHits: number
}

export interface BallState {
  id: string
  x: number
  y: number
  /** Velocity is expressed in physical court-width units per second. */
  vx: number
  vy: number
  radius: number
  spin: number
  lastToucherId: string | null
}

export interface PalState {
  id: string
  ownerId: string
  side: Side
  type: ActivePalType
  anchor: number
  position: number
  /** Distance from the owner's goal line in normalized screen coordinates. */
  depth: number
  phase: number
  spawnedAtTick: number
  armedAtTick: number
  expiresAtTick: number
  parentId: string | null
}

export type ShotType = 'return' | 'perfect' | 'drive' | 'cut' | 'drop'
export type EnergyReason = 'regen' | 'perfect' | 'comeback' | 'spent' | 'overtime'

export type GameEvent =
  | { type: 'matchStart' }
  | { type: 'countdown'; value: number }
  | { type: 'hit'; playerId: string; ballId: string; perfect: boolean; speed: number; shot: ShotType }
  | { type: 'score'; scorerId: string; team: string; againstPlayerId: string; ballId: string; points: 1; rallyHits: number }
  | { type: 'rallyHot'; hits: number; level: 'hot' | 'blazing' }
  | { type: 'palSummoned'; playerId: string; pal: PalState }
  | { type: 'palArmed'; playerId: string; palId: string; palType: ActivePalType; x: number; y: number }
  | { type: 'palHit'; playerId: string; palId: string; palType: ActivePalType; ballId: string; x: number; y: number }
  | { type: 'palExpired'; playerId: string; palId: string; palType: ActivePalType; reason: 'timeout' | 'goal' }
  | { type: 'energyChanged'; playerId: string; energy: number; reason: EnergyReason }
  | { type: 'matchEnd'; winnerTeam: string }

export interface GameState {
  rulesetVersion: 2
  config: MatchConfig
  phase: GamePhase
  tick: number
  countdownTicks: number
  remainingTicks: number
  overtime: boolean
  serveTicks: number
  servingPlayerId: string | null
  rallyHits: number
  longestRallyHits: number
  freezeTicks: number
  players: Record<string, PlayerState>
  balls: BallState[]
  pals: PalState[]
  scores: Record<string, number>
  winnerTeam: string | null
  rngState: number
  events: GameEvent[]
}

export interface GameInput {
  target: number
  summon: PalType | null
}

export type InputMap = Record<string, GameInput | undefined>

export interface AiControllerMemory {
  targetByPlayer: Record<string, number>
  nextThinkByPlayer: Record<string, number>
}
