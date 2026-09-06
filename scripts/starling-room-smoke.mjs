import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

const server = process.env.ROOM_SERVER_URL || 'http://127.0.0.1:8787'
const evidence = process.env.STARLING_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/starling-rescue-release'
const request = { name: 'Captain Test', guestId: crypto.randomUUID(), seed: 73599, biome: 0 }
const created = await fetch(server + '/api/rescue/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
assert.equal(created.status, 201)
const { roomCode } = await created.json()
const peers = []
function connect(guestId, name, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(server.replace(/^http/, 'ws') + `/api/rescue/rooms/${roomCode}/websocket`)
    const peer = { ws, guestId, name, token, id: null, state: null, messages: 0, bytes: 0, errors: [], seq: 0 }
    const timeout = setTimeout(() => reject(new Error('Welcome timed out')), 10000)
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', version: 1, guestId, name, ...(token ? { token } : {}) })))
    ws.addEventListener('message', event => {
      peer.messages++; peer.bytes += event.data.length
      const message = JSON.parse(event.data)
      if (message.type === 'welcome') { peer.id = message.playerId; peer.token = message.token; peer.state = message.state; clearTimeout(timeout); resolve(peer) }
      if (message.type === 'frame') peer.state = { ...message.state, world: { ...peer.state.world, ...message.world } }
      if (message.type === 'error') peer.errors.push(message)
    })
    ws.addEventListener('error', reject)
  })
}
const host = await connect(request.guestId, request.name); peers.push(host)
for (let i = 1; i < 8; i++) peers.push(await connect(crypto.randomUUID(), `Explorer ${i}`))
await new Promise(resolve => setTimeout(resolve, 500))
assert.equal(host.state.crew.filter(c => c.origin === 'human').length, 8)
assert.equal(host.state.crew.filter(c => c.pet).length, 1)
const ids = peers.map(p => p.id); assert.equal(new Set(ids).size, 8)
const starts = peers.map(p => p.state.crew.find(c => c.id === p.id).x)
const input = (peer, x = 0) => ({ type: 'input', epoch: peer.state.epoch, input: { seq: ++peer.seq, x, y: 0, aimX: 0, aimY: 0, buttons: 0, command: null, commandCrew: null, active: true } })
for (const peer of peers) peer.ws.send(JSON.stringify(input(peer, peer.seq % 2 ? -1 : 1)))
await new Promise(resolve => setTimeout(resolve, 350))
for (const [i, peer] of peers.entries()) { assert.ok(peer.state.crew.find(c => c.id === peer.id).x > starts[i] + .2); peer.ws.send(JSON.stringify(input(peer))) }
// Non-host requests cannot mutate shared voyage decisions.
peers[1].ws.send(JSON.stringify({ type: 'action', epoch: host.state.epoch, action: { kind: 'dock' } }))
await new Promise(resolve => setTimeout(resolve, 150))
assert.ok(peers[1].errors.some(e => e.code === 'host_action'))
const old = peers[3], before = host.state.tick
old.ws.close(1000, 'Reconnect test')
await new Promise(resolve => setTimeout(resolve, 300))
const restored = await connect(old.guestId, old.name, old.token); peers[3] = restored
assert.equal(restored.id, old.id); assert.ok(restored.state.tick >= before)
assert.equal(restored.state.crew.filter(c => c.id === old.id).length, 1)
await new Promise(resolve => setTimeout(resolve, 1000))
const report = { server, roomCode, humans: 8, totalCrew: host.state.crew.length, uniqueIdentities: new Set(ids).size, reconnectSameId: restored.id === old.id, hostAuthority: true, tick: host.state.tick, messages: host.messages, bytes: host.bytes, errors: peers.flatMap(p => p.errors).filter(e => e.code !== 'host_action') }
for (const peer of peers) peer.ws.close(1000, 'Smoke completed')
assert.deepEqual(report.errors, [])
await writeFile(`${evidence}/room-smoke.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
