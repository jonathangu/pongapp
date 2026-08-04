export const SIDES = ['top', 'bottom'] as const
export type Side = (typeof SIDES)[number]

export const PAL_TYPES = ['guard', 'striker', 'captain'] as const
export type PalType = (typeof PAL_TYPES)[number]
export type ActivePalType = PalType | 'hatchling'
export type PalMode = 'spawning' | 'patrol' | 'chase' | 'carry' | 'tether' | 'stunned'

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
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  returns: number
  cleanStrikes: number
  palEnergy: number
  palEnergyProgressTicks: number
  palsSummoned: number
  palHits: number
  palSteals: number
}

export interface BallState {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  spin: number
  lastToucherId: string | null
  carrierPalId: string | null
  tetherPalId: string | null
}

export interface PalState {
  id: string
  ownerId: string
  side: Side
  type: ActivePalType
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  health: number
  maxHealth: number
  mode: PalMode
  stateTicks: number
  abilityCooldownTicks: number
  contactCooldownTicks: number
  carryTicks: number
  commanded: boolean
  hasStar: boolean
  spawnedAtTick: number
  parentId: string | null
}

export interface PowerStarState {
  id: string
  x: number
  y: number
  spawnedAtTick: number
  expiresAtTick: number
}

export type ShotType = 'tap' | 'strike' | 'smash' | 'bank'
export type EnergyReason = 'regen' | 'cleanHit' | 'comeback' | 'spent' | 'overtime'

export type GameEvent =
  | { type: 'matchStart' }
  | { type: 'countdown'; value: number }
  | { type: 'hit'; playerId: string; ballId: string; clean: boolean; speed: number; shot: ShotType; x: number; y: number }
  | { type: 'score'; scorerId: string; team: string; againstPlayerId: string; ballId: string; points: 1; rallyHits: number }
  | { type: 'rallyHot'; hits: number; level: 'hot' | 'blazing' }
  | { type: 'palSummoned'; playerId: string; pal: PalState }
  | { type: 'palCommanded'; playerId: string; palId: string; palType: ActivePalType }
  | { type: 'palGrabbed'; playerId: string; palId: string; palType: ActivePalType; ballId: string; x: number; y: number }
  | { type: 'palShot'; playerId: string; palId: string; palType: ActivePalType; ballId: string; powered: boolean; x: number; y: number }
  | { type: 'palStole'; playerId: string; palId: string; fromPalId: string; ballId: string; x: number; y: number }
  | { type: 'palTethered'; playerId: string; palId: string; ballId: string; x: number; y: number }
  | { type: 'tetherBroken'; playerId: string; palId: string; ballId: string; x: number; y: number }
  | { type: 'palDamaged'; playerId: string; palId: string; palType: ActivePalType; health: number; x: number; y: number }
  | { type: 'palStunned'; playerId: string; palId: string; palType: ActivePalType; x: number; y: number }
  | { type: 'palPowered'; playerId: string; palId: string; palType: ActivePalType; x: number; y: number }
  | { type: 'palPowerUsed'; playerId: string; palId: string; palType: ActivePalType; x: number; y: number }
  | { type: 'palRetreated'; playerId: string; palId: string; palType: ActivePalType; reason: 'knockout' | 'goal' }
  | { type: 'starSpawned'; star: PowerStarState }
  | { type: 'starExpired'; starId: string }
  | { type: 'energyChanged'; playerId: string; energy: number; reason: EnergyReason }
  | { type: 'matchEnd'; winnerTeam: string }

export interface GameState {
  rulesetVersion: 3
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
  powerStar: PowerStarState | null
  nextPowerStarTick: number
  scores: Record<string, number>
  winnerTeam: string | null
  rngState: number
  events: GameEvent[]
}

export interface GameInput {
  targetX: number
  targetY: number
  palAction: PalType | null
}

export type InputMap = Record<string, GameInput | undefined>

export interface AiControllerMemory {
  targetByPlayer: Record<string, { x: number; y: number }>
  nextThinkByPlayer: Record<string, number>
}
