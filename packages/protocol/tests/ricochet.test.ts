import { expect, it } from 'vitest'
import { parseRicochetClient } from '../src/ricochet'
it('accepts only versioned, bounded Ricochet inputs, never peer-supplied results', () => {
  expect(parseRicochetClient(JSON.stringify({ type: 'hello', version: 1 }))).not.toBeNull()
  for (const type of ['ready', 'launch', 'swap-jobs', 'next', 'retry']) expect(parseRicochetClient(JSON.stringify({ type, revision: 0, requestId: 1 }))).not.toBeNull()
  expect(parseRicochetClient(JSON.stringify({ type: 'reflector', revision: 0, requestId: 1, reflector: { x: 280, y: 275, angle: -90, mode: 'split' } }))).not.toBeNull()
  for (const message of [{ type: 'hello', version: 2 }, { type: 'hello', version: 1, token: 'bad' }, { type: 'launch', revision: 0 },
    { type: 'launch', revision: 0, requestId: 1, rescued: [1, 2] }, { type: 'aim', revision: -1, requestId: 1, aim: -90, payload: 'burst' },
    { type: 'aim', revision: 0, requestId: 1, aim: 900, payload: 'burst' }, { type: 'aim', revision: 0, requestId: 1, aim: -90, payload: 'cheat' },
    { type: 'reflector', revision: 0, requestId: 1, reflector: { x: 999, y: 275, angle: -90, mode: 'split' } }]) expect(parseRicochetClient(JSON.stringify(message))).toBeNull()
  expect(parseRicochetClient('x'.repeat(2049))).toBeNull(); expect(parseRicochetClient('{')).toBeNull()
})
