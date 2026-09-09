import assert from 'node:assert/strict'
const server = process.env.ROOM_SERVER_URL || 'http://127.0.0.1:8787'
const origin = 'https://www.jonathangu.com', headers = { origin, 'content-type': 'application/json' }, peers = []
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn, label = 'Ricochet state') { for (let i = 0; i < 200; i++) { const value = fn(); if (value) return value; await sleep(40) }; throw new Error('Timed out: ' + label) }
async function join(code, token, hello = true) {
  const socket = new WebSocket(server.replace(/^http/, 'ws') + '/api/ricochet/rooms/' + code, { headers: { origin } })
  const peer = { socket, messages: [], token: null, state: null, presence: [], seq: 0 }; peers.push(peer)
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); peer.messages.push(message); if (message.type === 'welcome') peer.token = message.token; if (message.party) peer.state = message.party; if (message.presence) peer.presence = message.presence })
  await until(() => socket.readyState === WebSocket.OPEN, 'socket open')
  if (hello) socket.send(JSON.stringify({ type: 'hello', version: 1, ...(token ? { token } : {}) }))
  return peer
}
function send(peer, type, fields = {}, revision = peer.state.revision) { const requestId = ++peer.seq; peer.socket.send(JSON.stringify({ type, ...fields, revision, requestId })); return requestId }
async function ack(peer, id) { await until(() => peer.messages.some(m => m.ack?.requestId === id && m.ack.seat === peer.messages.find(m => m.type === 'welcome').seat), 'command acknowledged') }
async function error(peer, id, code) { await until(() => peer.messages.some(m => m.type === 'error' && m.requestId === id && m.code === code), 'expected ' + code) }

try {
  for (const body of ['null', '[]', '{"unexpected":true}', '{"game":{"version":1}}']) assert.equal((await fetch(server + '/api/ricochet/rooms', { method: 'POST', headers, body })).status, 400)
  assert.equal((await fetch(server + '/api/ricochet/rooms', { method: 'POST', headers: { ...headers, origin: 'https://untrusted.invalid' }, body: '{}' })).status, 403)
  const created = await fetch(server + '/api/ricochet/rooms', { method: 'POST', headers, body: '{}' }); assert.equal(created.status, 201)
  const { code, token } = await created.json()
  const a = await join(code, token); await until(() => a.state)
  const stranger = await join(code, undefined, false)
  const b = await join(code); await until(() => b.state && a.presence.every(Boolean))
  assert.deepEqual(a.state, b.state)
  assert.equal(a.messages.find(m => m.type === 'welcome').seat, 0); assert.equal(b.messages.find(m => m.type === 'welcome').seat, 1)
  await error(b, send(b, 'aim', { aim: -90, payload: 'plain' }), 'wrong-job')
  await error(a, send(a, 'launch'), 'not-ready')
  const revision = a.state.revision
  const leftEdit = send(a, 'aim', { aim: -88, payload: 'plain' }, revision)
  const rightEdit = send(b, 'reflector', { reflector: { ...b.state.game.setup.reflector, angle: -98 } }, revision)
  await ack(a, leftEdit); await ack(b, rightEdit); await until(() => a.state.revision === b.state.revision)
  assert.equal(a.state.game.setup.aim, -88); assert.equal(a.state.game.setup.reflector.angle, -98)
  await ack(b, send(b, 'ready')); assert.equal(b.state.ready, true)
  const readyRevision = b.state.revision
  await ack(a, send(a, 'aim', { aim: -90, payload: 'plain' })); await until(() => b.state.revision === a.state.revision)
  assert.equal(a.state.ready, false)
  await error(a, send(a, 'launch', {}, readyRevision), 'stale')
  await ack(b, send(b, 'ready')); await until(() => a.state.ready)
  const shotRevision = a.state.revision, first = send(a, 'launch', {}, shotRevision), duplicate = send(a, 'launch', {}, shotRevision)
  await ack(a, first); await error(a, duplicate, 'busy'); await until(() => a.state.revision === b.state.revision)
  assert.equal(a.state.game.shots, 1); assert.deepEqual(a.state.game.rescued, [0]); assert.deepEqual(a.state, b.state)
  await error(b, send(b, 'reflector', { reflector: b.state.game.setup.reflector }), 'busy')
  assert.equal(stranger.messages.length, 0, 'Unauthenticated sockets must receive no game snapshots')
  stranger.socket.close()
  const full = await join(code); await until(() => full.messages.some(m => m.code === 'full'))
  const guestToken = b.token, playbackId = b.state.playback.id
  b.socket.close(); await until(() => !a.presence[1])
  const returned = await join(code, guestToken); await until(() => returned.state && a.presence.every(Boolean))
  assert.equal(returned.state.playback.id, playbackId); assert.equal(returned.state.game.shots, 1)
  await until(() => Date.now() > a.state.busyUntil + 50, 'shot finishes')
  await ack(returned, send(returned, 'ready')); await until(() => a.state.ready)
  returned.socket.close(); await until(() => !a.presence[1] && !a.state.ready, 'disconnect clears Ready')
  const back = await join(code, guestToken); await until(() => back.state && a.presence.every(Boolean))
  assert.equal(back.state.ready, false)
  await ack(a, send(a, 'swap-jobs')); await until(() => back.state.launcher === 1)
  await error(a, send(a, 'aim', { aim: -90, payload: 'plain' }), 'wrong-job')
  await ack(back, send(back, 'retry')); await until(() => a.state.game.shots === 0)
  assert.equal(a.state.launcher, 1); assert.deepEqual(a.state, back.state)
  // A genuine second scene fixture exercises authoritative split explosions.
  const game = { version: 1, scene: 1, shots: 1, learned: 2, rescued: [0, 1, 2], setup: {
    aim: Math.atan2(265 - 402, 100) * 180 / Math.PI, payload: 'burst', reflector: { x: 280, y: 265, angle: -87, mode: 'split' } } }
  const comboResponse = await fetch(server + '/api/ricochet/rooms', { method: 'POST', headers, body: JSON.stringify({ game }) }); assert.equal(comboResponse.status, 201)
  const comboRoom = await comboResponse.json(), c = await join(comboRoom.code, comboRoom.token), d = await join(comboRoom.code)
  await until(() => c.state && d.state && c.presence.every(Boolean)); await ack(d, send(d, 'ready')); await until(() => c.state.ready)
  await ack(c, send(c, 'launch')); await until(() => d.state.playback)
  assert.equal(c.state.playback.shot.combo, 'Triple fireworks!'); assert.ok(c.state.playback.shot.rescued.length >= 7)
  assert.equal(c.state.playback.shot.events.filter(e => e.kind === 'burst').length, 3); assert.deepEqual(c.state, d.state)
  console.log(JSON.stringify({ test: 'ricochet-room-smoke', result: 'passed', server, checks: ['strict creation', 'origin restriction', 'separate rooms', 'two jobs', 'merge independent edits', 'Ready invalidation', 'stale launch rejection', 'server shot exactly once', 'in-flight lock', 'no unauthenticated state', 'third seat rejected', 'mid-flight reconnect', 'disconnect clears consent', 'swap jobs', 'shared retry', 'authoritative triple fireworks'] }))
} finally { for (const peer of peers) peer.socket.close() }
