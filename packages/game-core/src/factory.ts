import {
  AI_DIFFICULTY_LABEL,
  DEFAULT_SCORE_TO_WIN,
  DEFAULT_TIME_LIMIT_TICKS,
  DUEL_COURT_LENGTH_SCALE,
} from './constants'
import { seatIdentity } from './palette'
import type { AiDifficulty, MatchConfig, PlayerDefinition } from './types'

export interface MatchFactoryOptions {
  humanPlayers: Array<{ id: string; name: string }>
  aiDifficulty?: AiDifficulty
  seed?: number
}

export function buildMatchConfig(options: MatchFactoryOptions): MatchConfig {
  const difficulty = options.aiDifficulty ?? 'rally'
  const sides = ['bottom', 'top'] as const
  const players: PlayerDefinition[] = sides.map((side, index) => {
    const human = options.humanPlayers[index]
    return {
      id: human?.id ?? `ai-${index + 1}`,
      name: human?.name ?? AI_DIFFICULTY_LABEL[difficulty],
      side,
      team: `team-${index}`,
      isAi: !human,
      aiDifficulty: human ? undefined : difficulty,
      color: seatIdentity(index).color,
    }
  })
  return {
    players,
    scoreToWin: DEFAULT_SCORE_TO_WIN,
    timeLimitTicks: DEFAULT_TIME_LIMIT_TICKS,
    courtLengthScale: DUEL_COURT_LENGTH_SCALE,
    seed: options.seed ?? Date.now() >>> 0,
  }
}
