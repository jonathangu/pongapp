import { defaultScoreToWin, DEFAULT_TIME_LIMIT_TICKS, sidesForMode, type SeatAxis } from './constants'
import { seatIdentity } from './palette'
import type { AbilityId, AiDifficulty, GameMode, ItemIntensity, MatchConfig, MatchMutator, PlayerDefinition } from './types'

const ABILITY_ORDER: AbilityId[] = ['dash', 'bend', 'pulse', 'dash']

export interface MatchFactoryOptions {
  mode: GameMode
  humanPlayers: Array<{ id: string; name: string; ability?: AbilityId }>
  totalPlayers?: number
  aiDifficulty?: AiDifficulty
  itemIntensity?: ItemIntensity
  mutator?: MatchMutator
  seed?: number
  /** Duel seating. `vertical` puts the two players at opposite ends of a phone. */
  axis?: SeatAxis
}

export function buildMatchConfig(options: MatchFactoryOptions): MatchConfig {
  const requested = options.mode === 'duel' ? 2 : Math.max(3, Math.min(4, options.totalPlayers ?? 4))
  const sides = sidesForMode(options.mode, requested, options.axis)
  const difficulty = options.aiDifficulty ?? 'rally'
  const difficultyName: Record<AiDifficulty, string> = { rookie: 'Rookie', rally: 'Rally', pro: 'Pro', ace: 'Ace' }
  const players: PlayerDefinition[] = sides.map((side, index) => {
    const human = options.humanPlayers[index]
    const team = options.mode === 'crosscourt' ? `team-${index < 2 ? 0 : 1}` : `team-${index}`
    return {
      id: human?.id ?? `ai-${index + 1}`,
      name: human?.name ?? (requested === 2 ? difficultyName[difficulty] : `${difficultyName[difficulty]} ${index + 1}`),
      side,
      team,
      ability: human?.ability ?? ABILITY_ORDER[index] ?? 'dash',
      isAi: !human,
      aiDifficulty: human ? undefined : difficulty,
      color: seatIdentity(index).color,
    }
  })
  return {
    mode: options.mode,
    players,
    // Clean Pong is the default. Power-ups are an explicit party choice.
    itemIntensity: options.itemIntensity ?? 'off',
    mutator: options.mutator ?? 'none',
    scoreToWin: defaultScoreToWin(options.mode),
    timeLimitTicks: DEFAULT_TIME_LIMIT_TICKS,
    seed: options.seed ?? Date.now() >>> 0,
  }
}
