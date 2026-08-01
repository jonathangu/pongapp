export const SIDES = ['left', 'right', 'top', 'bottom'] as const
export type Side = (typeof SIDES)[number]

export const GAME_MODES = ['duel', 'arena', 'crosscourt'] as const
export type GameMode = (typeof GAME_MODES)[number]

export const ABILITIES = ['dash', 'bend', 'guard', 'pulse'] as const
export type AbilityId = (typeof ABILITIES)[number]

export const POWER_UPS = ['grow', 'overdrive', 'multiball', 'warp', 'gravity'] as const
export type PowerUpId = (typeof POWER_UPS)[number]

export const AI_DIFFICULTIES = ['rookie', 'rally', 'pro', 'ace'] as const
export type AiDifficulty = (typeof AI_DIFFICULTIES)[number]

export const MATCH_MUTATORS = ['none', 'bigBall', 'noWalls', 'doublePoints', 'mirroredControls'] as const
export type MatchMutator = (typeof MATCH_MUTATORS)[number]

export type ItemIntensity = 'off' | 'standard' | 'wild'
export type GamePhase = 'countdown' | 'playing' | 'finished'

export interface PlayerDefinition {
  id: string
  name: string
  side: Side
  team: string
  ability: AbilityId
  isAi: boolean
  aiDifficulty?: AiDifficulty
  color: number
}

export interface MatchConfig {
  mode: GameMode
  players: PlayerDefinition[]
  itemIntensity: ItemIntensity
  mutator: MatchMutator
  scoreToWin: number
  timeLimitTicks: number
  seed: number
}

export interface PlayerState extends PlayerDefinition {
  position: number
  velocity: number
  cooldownTicks: number
  growTicks: number
  bendTicks: number
  guardTicks: number
  pulseTicks: number
  overdriveHits: number
  returns: number
  perfectReturns: number
  abilityUses: number
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
  warpCooldownTicks: number
  transientTicks: number | null
}

export interface PowerUpState {
  id: PowerUpId
  x: number
  y: number
  ageTicks: number
}

export interface WorldEffects {
  warpTicks: number
  gravityTicks: number
}

export type GameEvent =
  | { type: 'matchStart' }
  | { type: 'countdown'; value: number }
  | { type: 'hit'; playerId: string; ballId: string; perfect: boolean; speed: number }
  | { type: 'score'; scorerId: string | null; team: string; againstPlayerId: string; ballId: string; points: number; rallyHits: number }
  | { type: 'rallyHot'; hits: number; multiplier: number }
  | { type: 'ability'; playerId: string; ability: AbilityId; fromPosition: number; toPosition: number }
  | { type: 'powerUpSpawn'; powerUp: PowerUpState }
  | { type: 'powerUp'; playerId: string | null; powerUp: PowerUpId }
  | { type: 'shield'; playerId: string; ballId: string }
  | { type: 'warp'; ballId: string }
  | { type: 'matchEnd'; winnerTeam: string }

export interface GameState {
  rulesetVersion: 1
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
  scores: Record<string, number>
  powerUp: PowerUpState | null
  powerUpSpawnTicks: number
  worldEffects: WorldEffects
  winnerTeam: string | null
  rngState: number
  events: GameEvent[]
}

export interface GameInput {
  target: number
  abilityPressed: boolean
}

export type InputMap = Record<string, GameInput | undefined>

export interface AiControllerMemory {
  targetByPlayer: Record<string, number>
  nextThinkByPlayer: Record<string, number>
}
