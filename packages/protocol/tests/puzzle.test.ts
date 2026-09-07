import { describe, expect, it } from 'vitest'
import { parsePuzzleClient } from '../src/puzzle'
describe('shared puzzle messages', () => {
  it('accepts the five bounded commands', () => {
    for (const message of [{ type: 'hello', version: 1 }, { type: 'swap', revision: 0, a: 0, b: 6 }, { type: 'next', revision: 2 }, { type: 'more', revision: 2 }, { type: 'ping' }]) expect(parsePuzzleClient(JSON.stringify(message))).toEqual(message)
  })
  it('rejects invalid, oversized, and client-authored game states', () => {
    for (const raw of ['{', 'x'.repeat(2049), JSON.stringify({ type: 'hello', version: 2 }), JSON.stringify({ type: 'swap', revision: -1, a: 0, b: 6 }), JSON.stringify({ type: 'swap', revision: 0, a: 0, b: 36 }), JSON.stringify({ type: 'next', revision: 0, game: {} })]) expect(parsePuzzleClient(raw)).toBeNull()
  })
})
