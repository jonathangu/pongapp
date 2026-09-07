import { describe, expect, it } from 'vitest'
import { applyMatchCommand, createMatchParty } from '../src/match-party'
import { createMatchGame, findMatchMove, matchPhase } from '../src/match3'

describe('Mara and Finn share one puzzle', () => {
  it('allows either partner to make the first move', () => {
    const party = createMatchParty(createMatchGame()), [a, b] = findMatchMove(party.game.board)!
    for (const role of [0, 1] as const) expect(applyMatchCommand(party, role, { kind: 'swap', revision: 0, a, b }).accepted).toBe(true)
  })
  it('never charges a second move when both act on the same board revision', () => {
    const party = createMatchParty(createMatchGame()), [a, b] = findMatchMove(party.game.board)!
    const first = applyMatchCommand(party, 0, { kind: 'swap', revision: 0, a, b })
    const second = applyMatchCommand(first.party, 1, { kind: 'swap', revision: 0, a, b })
    expect(second.accepted).toBe(false); expect(second.reason).toBe('stale'); expect(second.party).toBe(first.party)
  })
  it('rewards building on a partner’s match, without forcing alternation', () => {
    let party = createMatchParty(createMatchGame())
    for (const role of [0, 0, 1] as const) {
      const [a, b] = findMatchMove(party.game.board)!
      const result = applyMatchCommand(party, role, { kind: 'swap', revision: party.revision, a, b })
      expect(result.teamwork).toBe(role === 1); party = result.party
    }
    expect(party.teamwork).toBe(1)
  })
  it('does not allow either player to skip or refill an active level', () => {
    const party = createMatchParty(createMatchGame())
    for (const kind of ['next', 'more'] as const) expect(applyMatchCommand(party, 1, { kind, revision: 0 }).accepted).toBe(false)
  })
  it('completes three shared levels and advances only once for simultaneous next taps', () => {
    let party = createMatchParty(createMatchGame())
    for (let level = 1; level <= 3; level++) {
      while (matchPhase(party.game) === 'playing') {
        const [a, b] = findMatchMove(party.game.board)!
        party = applyMatchCommand(party, party.revision % 2 as 0 | 1, { kind: 'swap', revision: party.revision, a, b }).party
      }
      expect(matchPhase(party.game)).toBe('won')
      const revision = party.revision
      party = applyMatchCommand(party, 1, { kind: 'next', revision }).party
      expect(party.game.level).toBe(level + 1)
      expect(applyMatchCommand(party, 0, { kind: 'next', revision }).accepted).toBe(false)
    }
  })
})
