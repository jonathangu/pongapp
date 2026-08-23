import type { GameState } from '@pongapp/game-core'

/** Copy only the mutable simulation branches consumed by rendering and React. */
export function cloneGameStateSnapshot(source: GameState): GameState {
  return {
    ...source,
    players: Object.fromEntries(Object.entries(source.players).map(([id, player]) => [id, { ...player }])),
    balls: source.balls.map((ball) => ({ ...ball })),
    pals: source.pals.map((pal) => ({ ...pal })),
    powerStar: source.powerStar ? { ...source.powerStar } : null,
    scores: { ...source.scores },
  }
}
