import { describe, expect, it } from 'vitest'
import { createMatchGame, findMatches, findMatchMove, matchNeighbors, matchPhase, playMatchSwap, restoreMatchGame } from '../src/match3'

describe('one shared match-three game', () => {
  it('opens with no automatic matches and an available move over 500 seeds', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const state = createMatchGame(seed % 12 + 1, seed)
      expect(findMatches(state.board)).toEqual([])
      expect(findMatchMove(state.board)).not.toBeNull()
    }
  })
  it('never wraps neighbors around the board or accepts invalid coordinates', () => {
    expect(matchNeighbors(5, 6)).toBe(false); expect(matchNeighbors(0, 6)).toBe(true)
    for (const index of [-1, 36, .5, NaN, Infinity]) expect(matchNeighbors(0, index)).toBe(false)
  })
  it('finds crosses once, including runs at board boundaries', () => {
    const state = createMatchGame()
    state.board.forEach((p, i) => { p.color = (i + Math.floor(i / 6)) % 5 })
    for (const i of [0, 1, 2, 6, 12]) state.board[i]!.color = 4
    const matches = findMatches(state.board)
    expect(matches).toEqual(expect.arrayContaining([0, 1, 2, 6, 12])); expect(new Set(matches).size).toBe(matches.length)
  })
  it('does not charge a move for an unsuccessful swap', () => {
    const state = createMatchGame()
    for (let a = 0; a < 36; a++) for (const b of [a + 1, a + 6]) {
      const turn = playMatchSwap(state, a, b)
      if (!turn.valid) expect(turn.state).toBe(state)
    }
  })
  it('resolves cascades deterministically without mutating the previous state', () => {
    const state = createMatchGame(), before = JSON.stringify(state), move = findMatchMove(state.board)!
    const turn = playMatchSwap(state, ...move)
    expect(turn).toEqual(playMatchSwap(state, ...move)); expect(JSON.stringify(state)).toBe(before)
    expect(turn.valid).toBe(true); expect(turn.state.moves).toBe(state.moves - 1)
    expect(turn.state.collected).toBe(turn.frames.reduce((n, frame) => n + frame.gained, 0))
    expect(findMatches(turn.state.board)).toEqual([]); expect(findMatchMove(turn.state.board)).not.toBeNull()
    expect(new Set(turn.state.board.map(p => p.id)).size).toBe(36)
  })
  it('finishes the first level without extra moves across 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      let state = createMatchGame(1, seed)
      while (matchPhase(state) === 'playing') state = playMatchSwap(state, ...findMatchMove(state.board)!).state
      expect(matchPhase(state)).toBe('won')
    }
  })
  it('can complete 30 levels using normal swaps and free extra moves', () => {
    for (let level = 1; level <= 30; level++) {
      let state = createMatchGame(level, level * 81)
      for (let turn = 0; matchPhase(state) !== 'won' && turn < 50; turn++) {
        if (matchPhase(state) === 'rest') state = { ...state, moves: 5 }
        state = playMatchSwap(state, ...findMatchMove(state.board)!).state
      }
      expect(matchPhase(state)).toBe('won')
    }
  })
  it('prioritizes success on the last move and rejects moves after the level ends', () => {
    const state = { ...createMatchGame(), moves: 1, collected: 23 }
    const turn = playMatchSwap(state, ...findMatchMove(state.board)!)
    expect(matchPhase(turn.state)).toBe('won'); expect(playMatchSwap(turn.state, 0, 1).valid).toBe(false)
  })
  it('restores only a valid puzzle; rejects corrupt, giant and poisoned saves', () => {
    const state = createMatchGame()
    expect(restoreMatchGame(JSON.stringify(state))).toEqual(state)
    for (const raw of [null, 'x', '[]', '{}', 'x'.repeat(10001), JSON.stringify({ ...state, target: 1 }), JSON.stringify({ ...state, board: Array(36).fill(state.board[0]) }), JSON.stringify({ ...state, moves: -1 })]) expect(restoreMatchGame(raw)).toBeNull()
  })
})
