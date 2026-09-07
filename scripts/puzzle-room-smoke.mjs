import assert from 'node:assert/strict'
const server = process.env.ROOM_SERVER_URL || 'http://127.0.0.1:8787'
const origin = 'https://www.jonathangu.com', peers = []
const headers = { origin, 'content-type': 'application/json' }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn) { for (let i = 0; i < 100; i++) { const value = fn(); if (value) return value; await sleep(50) }; throw new Error('Timed out waiting for shared puzzle') }
async function join(code, token) {
  const socket = new WebSocket(server.replace(/^http/, 'ws') + '/api/puzzle/rooms/' + code, { headers: { origin } })
  const peer = { socket, messages: [], token: null, state: null }; peers.push(peer)
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); peer.messages.push(message); if (message.type === 'welcome') peer.token = message.token; if (message.party) peer.state = message.party })
  await until(() => socket.readyState === WebSocket.OPEN)
  socket.send(JSON.stringify({ type: 'hello', version: 1, ...(token ? { token } : {}) })); return peer
}
function move(board) {
  const matches = cells => { for (let i = 0; i < 36; i++) if (i % 6 < 4 && cells[i].color === cells[i + 1].color && cells[i].color === cells[i + 2].color || i < 24 && cells[i].color === cells[i + 6].color && cells[i].color === cells[i + 12].color) return true; return false }
  for (let a = 0; a < 36; a++) for (const b of [a % 6 < 5 ? a + 1 : 99, a + 6]) if (b < 36) { const cells = board.slice(); [cells[a], cells[b]] = [cells[b], cells[a]]; if (matches(cells)) return { a, b } }
  throw new Error('No playable move')
}
try {
  assert.equal((await fetch(server + '/api/puzzle/rooms', { method: 'POST', headers, body: 'null' })).status, 400)
  assert.equal((await fetch(server + '/api/puzzle/rooms', { method: 'POST', headers: { ...headers, origin: 'https://untrusted.invalid' }, body: '{}' })).status, 403)
  const created = await fetch(server + '/api/puzzle/rooms', { method: 'POST', headers, body: '{}' }); assert.equal(created.status, 201)
  const { code, token } = await created.json()
  const a = await join(code, token); await until(() => a.state)
  const b = await join(code); await until(() => b.state)
  assert.deepEqual(a.state, b.state); assert.equal(a.messages.find(m => m.type === 'welcome').role, 0); assert.equal(b.messages.find(m => m.type === 'welcome').role, 1)
  const swap = { type: 'swap', revision: 0, ...move(a.state.game.board) }; a.socket.send(JSON.stringify(swap)); b.socket.send(JSON.stringify(swap))
  await until(() => a.state.revision === 1 && b.state.revision === 1)
  await until(() => [...a.messages, ...b.messages].some(m => m.type === 'error' && m.code === 'stale'))
  assert.deepEqual(a.state, b.state); assert.equal(a.state.game.moves, 15)
  const other = a.state.lastActor === 0 ? b : a; other.socket.send(JSON.stringify({ type: 'swap', revision: 1, ...move(other.state.game.board) }))
  await until(() => a.state.revision === 2 && b.state.revision === 2); assert.deepEqual(a.state, b.state); assert.equal(a.state.teamwork, 1)
  const full = await join(code); await until(() => full.messages.some(m => m.type === 'error' && m.code === 'full'))
  const state = b.state, guestToken = b.token; b.socket.close(); await sleep(100)
  const returned = await join(code, guestToken); await until(() => returned.state); assert.deepEqual(returned.state, state)
  for (let turn = 0; a.state.game.collected < a.state.game.target && turn < 30; turn++) {
    const revision = a.state.revision; a.socket.send(JSON.stringify(a.state.game.moves ? { type: 'swap', revision, ...move(a.state.game.board) } : { type: 'more', revision })); await until(() => a.state.revision > revision)
  }
  assert.ok(a.state.game.collected >= a.state.game.target)
  const revision = a.state.revision; a.socket.send(JSON.stringify({ type: 'next', revision })); returned.socket.send(JSON.stringify({ type: 'next', revision }))
  await until(() => a.state.game.level === 2 && returned.state.game.level === 2); assert.equal(a.state.revision, revision + 1); assert.deepEqual(a.state, returned.state)
  console.log(JSON.stringify({ test: 'puzzle-room-smoke', result: 'passed', server, checks: ['invalid creation', 'origin restriction', 'two roles', 'shared board', 'simultaneous move exactly once', 'teamwork bonus', 'third seat rejected', 'reconnection', 'shared win', 'duplicate next exactly once'] }))
} finally { for (const peer of peers) peer.socket.close() }
