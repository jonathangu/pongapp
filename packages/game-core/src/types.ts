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
  | { type: 'ability'; playerId: string; ability: AbilityId; fromPosition: number; toPosition: number }
  | { type: 'powerUpSpawn'; powerUp: PowerUpState }
  | { type: 'powerUp'; playerId: string | null; powerUp: PowerUpId }
  | { type: 'shield'; playerId: string; ballId: string }
  | { type: 'warp'; ballId: string }
  | { type: 'rallyHot'; hits: number; multiplier: number }
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
  /**
   * Paddle contacts since the last serve.
   *
   * There was no rally-length state anywhere before this: `PlayerState.returns`
   * is a whole-match total, which is also why `store.ts` recorded the wrong
   * `bestRally`. Nothing in the simulation could react to a long rally, so a
   * twenty-hit point scored exactly what a one-hit point did.
   */
  rallyHits: number
  /** The longest rally of the match so far, for the end card and the profile. */
  longestRally: number
  /**
   * Ticks the world is frozen for — hitstop.
   *
   * `docs/DESIGN.md` §7 requires this to live in the tick loop rather than the
   * renderer, because the renderer does not own the clock: `LocalMatch` does
   * locally and the room worker does online, and a renderer-side freeze would
   * drift from a simulation that did not freeze. Durations are fixed tick
   * counts derived from events, never wall-clock, so every client and the
   * authoritative server freeze identically.
   */
  freezeTicks: number
  /**
   * Who serves next — the player who just conceded.
   *
   * Every serve used to be identical: dead centre, start speed, uniform random
   * angle, no advantage to anyone. Handing the serve to the conceding player and
   * letting them aim it during the serve delay gives the losing side a beat of
   * control and makes the restart a decision rather than a coin toss.
   */
  servingPlayerId: string | null
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

/**
 * How many points a rally is worth once it has run this long, and the label the
 * HUD announces when it crosses each step.
 *
 * Escalation the player can see but not bank is just decoration — the renderer
 * has been brightening the court with `heat` for a while with nothing behind it.
 */
export const RALLY_STEPS: ReadonlyArray<{ hits: number; multiplier: number; label: string }> = [
  { hits: 8, multiplier: 2, label: 'Hot rally · worth 2' },
  { hits: 16, multiplier: 3, label: 'Blazing · worth 3' },
]

export function rallyMultiplier(rallyHits: number): number {
  let multiplier = 1
  for (const step of RALLY_STEPS) if (rallyHits >= step.hits) multiplier = step.multiplier
  return multiplier
}
