import { createMatchGame, matchPhase, playMatchSwap, type MatchGame, type MatchTurn } from './match3'

export type MatchRole = 0 | 1
export type MatchParty = { game: MatchGame; revision: number; lastActor: MatchRole | null; teamwork: number }
export type MatchCommand = { revision: number } & ({ kind: 'swap'; a: number; b: number } | { kind: 'next' | 'more' })
export type MatchPartyResult = { accepted: boolean; reason?: 'stale' | 'unavailable'; party: MatchParty; turn?: MatchTurn; teamwork?: boolean }

export function createMatchParty(game: MatchGame): MatchParty { return { game, revision: 0, lastActor: null, teamwork: 0 } }
/** The same board belongs to both people. Serial revisions prevent double moves. */
export function applyMatchCommand(party: MatchParty, role: MatchRole, command: MatchCommand): MatchPartyResult {
  if (command.revision !== party.revision) return { accepted: false, reason: 'stale', party }
  if (command.kind === 'swap') {
    const turn = playMatchSwap(party.game, command.a, command.b)
    if (!turn.valid) return { accepted: false, reason: 'unavailable', party, turn }
    const teamwork = party.lastActor !== null && party.lastActor !== role
    // Luma contributes when her family builds on each other's moves. No new control.
    const game = teamwork ? { ...turn.state, collected: turn.state.collected + 3 } : turn.state
    return { accepted: true, party: { game, revision: party.revision + 1, lastActor: role, teamwork: party.teamwork + Number(teamwork) }, turn: { ...turn, state: game }, teamwork }
  }
  if (command.kind === 'next' && matchPhase(party.game) === 'won') return { accepted: true, party: { game: createMatchGame(party.game.level + 1, party.game.seed), revision: party.revision + 1, lastActor: null, teamwork: 0 } }
  if (command.kind === 'more' && matchPhase(party.game) === 'rest') return { accepted: true, party: { ...party, game: { ...party.game, moves: 5 }, revision: party.revision + 1 } }
  return { accepted: false, reason: 'unavailable', party }
}
