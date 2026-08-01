import { defaultScoreToWin, sidesForMode, TICK_RATE, type SeatAxis } from './constants'
import { seatIdentity } from './palette'
import type { AbilityId, AiDifficulty, GameMode, ItemIntensity, MatchConfig, PlayerDefinition } from './types'

const ABILITY_ORDER: AbilityId[] = ['dash', 'bend', 'guard', 'pulse']

export interface MatchFactoryOptions {
  mode: GameMode
  humanPlayers: Array<{ id: string; name: string; ability?: AbilityId }>
  totalPlayers?: number
  aiDifficulty?: AiDifficulty
  itemIntensity?: ItemIntensity
  seed?: number
  /** Duel seating. `vertical` puts the two players at opposite ends of a phone. */
  axis?: SeatAxis
}

export function buildMatchConfig(options: MatchFactoryOptions): MatchConfig {
  const requested = options.mode === 'duel' ? 2 : Math.max(3, Math.min(4, options.totalPlayers ?? 4))
  const sides = sidesForMode(options.mode, requested, options.axis)
  const players: PlayerDefinition[] = sides.map((side, index) => {
    const human = options.humanPlayers[index]
    const team = options.mode === 'crosscourt' ? `team-${index < 2 ? 0 : 1}` : `team-${index}`
    return {
      id: human?.id ?? `ai-${index + 1}`,
      name: human?.name ?? ['Rookie', 'Rally', 'Pro', 'Ace'][index] ?? `AI ${index + 1}`,
      side,
      team,
      ability: human?.ability ?? ABILITY_ORDER[index] ?? 'dash',
      isAi: !human,
      aiDifficulty: human ? undefined : options.aiDifficulty ?? 'rally',
      color: seatIdentity(index).color,
    }
  })
  return {
    mode: options.mode,
    players,
    itemIntensity: options.itemIntensity ?? 'standard',
    scoreToWin: defaultScoreToWin(options.mode),
    timeLimitTicks: 4 * 60 * TICK_RATE,
    seed: options.seed ?? Date.now() >>> 0,
  }
}
