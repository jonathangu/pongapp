/** The complete puzzle rules. Every screen size uses this same deterministic game. */
export const MATCH_SIZE = 6
export const MATCH_COLORS = 5
export type MatchPiece = { id: number; color: number }
export type MatchBoard = MatchPiece[]
export type MatchGame = {
  version: 1; level: number; seed: number; nextId: number
  board: MatchBoard; moves: number; collected: number; target: number
}
export type MatchFrame = { board: MatchBoard; cleared: number[]; gained: number }
export type MatchTurn = { valid: boolean; state: MatchGame; swapped: MatchBoard; frames: MatchFrame[]; shuffled: boolean }

function random(state: Pick<MatchGame, 'seed'>) {
  let value = state.seed || 1
  value ^= value << 13; value ^= value >>> 17; value ^= value << 5
  state.seed = value >>> 0
  return state.seed / 4294967296
}
function piece(state: Pick<MatchGame, 'seed' | 'nextId'>, colors = MATCH_COLORS): MatchPiece {
  return { id: state.nextId++, color: Math.floor(random(state) * colors) }
}
export function matchNeighbors(a: number, b: number) {
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < MATCH_SIZE ** 2 && b < MATCH_SIZE ** 2 &&
    (Math.abs(a - b) === MATCH_SIZE || Math.floor(a / MATCH_SIZE) === Math.floor(b / MATCH_SIZE) && Math.abs(a - b) === 1)
}
export function findMatches(board: MatchBoard): number[] {
  const matched = new Set<number>()
  for (let axis = 0; axis < 2; axis++) for (let line = 0; line < MATCH_SIZE; line++) {
    for (let start = 0; start < MATCH_SIZE;) {
      const index = (offset: number) => axis === 0 ? line * MATCH_SIZE + offset : offset * MATCH_SIZE + line
      let end = start + 1
      while (end < MATCH_SIZE && board[index(end)]?.color === board[index(start)]?.color) end++
      if (end - start >= 3) for (let offset = start; offset < end; offset++) matched.add(index(offset))
      start = end
    }
  }
  return [...matched].sort((a, b) => a - b)
}
function exchanged(board: MatchBoard, a: number, b: number) {
  const next = board.slice(); [next[a], next[b]] = [board[b]!, board[a]!]; return next
}
export function findMatchMove(board: MatchBoard): [number, number] | null {
  for (let a = 0; a < board.length; a++) for (const b of [a + 1, a + MATCH_SIZE]) {
    if (matchNeighbors(a, b) && findMatches(exchanged(board, a, b)).length) return [a, b]
  }
  return null
}
function freshBoard(state: Pick<MatchGame, 'seed' | 'nextId' | 'level'>): MatchBoard {
  const colors = state.level <= 2 ? 4 : MATCH_COLORS
  // Fill without starting matches. The last fallback plants a guaranteed move.
  for (let attempt = 0; attempt < 40; attempt++) {
    const board: MatchBoard = []
    for (let i = 0; i < MATCH_SIZE ** 2; i++) {
      const p = piece(state, colors)
      while (i % MATCH_SIZE >= 2 && p.color === board[i - 1]?.color && p.color === board[i - 2]?.color ||
        i >= MATCH_SIZE * 2 && p.color === board[i - MATCH_SIZE]?.color && p.color === board[i - MATCH_SIZE * 2]?.color) p.color = (p.color + 1) % colors
      board.push(p)
    }
    if (findMatchMove(board)) return board
  }
  const board = Array.from({ length: MATCH_SIZE ** 2 }, (_, i) => ({ id: state.nextId++, color: (i + Math.floor(i / MATCH_SIZE)) % colors }))
  board[0]!.color = 0; board[1]!.color = 1; board[2]!.color = 0; board[7]!.color = 0
  return board
}
export function createMatchGame(level = 1, seed = 73129): MatchGame {
  level = Number.isSafeInteger(level) ? Math.max(1, Math.min(9999, level)) : 1
  const state: MatchGame = { version: 1, level, seed: seed >>> 0 || 1, nextId: 1, board: [], moves: level === 1 ? 16 : 18, collected: 0, target: Math.min(75, 24 + (level - 1) * 5) }
  state.board = freshBoard(state)
  return state
}
export function matchPhase(state: MatchGame): 'playing' | 'won' | 'rest' {
  return state.collected >= state.target ? 'won' : state.moves > 0 ? 'playing' : 'rest'
}
export function playMatchSwap(previous: MatchGame, a: number, b: number): MatchTurn {
  const invalid = { valid: false, state: previous, swapped: previous.board, frames: [], shuffled: false }
  if (matchPhase(previous) !== 'playing' || !matchNeighbors(a, b)) return invalid
  const swapped = exchanged(previous.board, a, b)
  let cleared = findMatches(swapped)
  if (!cleared.length) return { ...invalid, swapped }
  const state: MatchGame = { ...previous, board: swapped, moves: previous.moves - 1 }
  const frames: MatchFrame[] = []
  for (let cascade = 0; cleared.length && cascade < 30; cascade++) {
    frames.push({ board: state.board, cleared, gained: cleared.length })
    state.collected += cleared.length
    const removed = new Set(cleared), board: MatchBoard = new Array(MATCH_SIZE ** 2)
    for (let col = 0; col < MATCH_SIZE; col++) {
      let target = MATCH_SIZE - 1
      for (let row = MATCH_SIZE - 1; row >= 0; row--) {
        const index = row * MATCH_SIZE + col
        if (!removed.has(index)) board[target-- * MATCH_SIZE + col] = state.board[index]!
      }
      while (target >= 0) board[target-- * MATCH_SIZE + col] = piece(state, state.level <= 2 ? 4 : MATCH_COLORS)
    }
    state.board = board; cleared = findMatches(board)
  }
  const shuffled = cleared.length > 0 || !findMatchMove(state.board)
  if (shuffled) state.board = freshBoard(state)
  return { valid: true, state, swapped, frames, shuffled }
}
export function restoreMatchGame(raw: string | null): MatchGame | null {
  if (!raw || raw.length > 10000) return null
  try {
    const value = JSON.parse(raw) as MatchGame
    const integer = (n: unknown, min: number, max: number) => Number.isSafeInteger(n) && Number(n) >= min && Number(n) <= max
    if (!value || value.version !== 1 || !integer(value.level, 1, 9999) || !integer(value.seed, 1, 4294967295) || !integer(value.nextId, 1, 1000000) ||
      !integer(value.moves, 0, 1000) || !integer(value.collected, 0, 1000000) || value.target !== Math.min(75, 24 + (value.level - 1) * 5) ||
      !Array.isArray(value.board) || value.board.length !== MATCH_SIZE ** 2 || value.board.some(p => !p || !integer(p.id, 1, value.nextId - 1) || !integer(p.color, 0, MATCH_COLORS - 1)) ||
      new Set(value.board.map(p => p.id)).size !== MATCH_SIZE ** 2 || findMatches(value.board).length || !findMatchMove(value.board)) return null
    return { version: 1, level: value.level, seed: value.seed, nextId: value.nextId, board: value.board.map(p => ({ id: p.id, color: p.color })), moves: value.moves, collected: value.collected, target: value.target }
  } catch { return null }
}
