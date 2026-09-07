import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const server = process.env.ROOM_SERVER_URL || 'http://127.0.0.1:8787'
const evidence = process.env.STARLING_EVIDENCE || 'artifacts/starling-rescue'
await mkdir(evidence, { recursive: true })
const request = { name: 'Captain Test', guestId: crypto.randomUUID(), seed: 73599, biome: 0 }
const created = await fetch(server + '/api/rescue/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
assert.equal(created.status, 201)
const { roomCode } = await created.json()
const peers = []
function connect(guestId, name, token, targetCode = roomCode) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(server.replace(/^http/, 'ws') + `/api/rescue/rooms/${targetCode}/websocket`)
    const peer = { ws, guestId, name, token, id: null, state: null, messages: 0, bytes: 0, errors: [], seq: 0 }
    const timeout = setTimeout(() => reject(new Error('Welcome timed out')), 10000)
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', version: 1, guestId, name, ...(token ? { token } : {}) })))
    ws.addEventListener('message', event => {
      peer.messages++; peer.bytes += event.data.length
      const message = JSON.parse(event.data)
      if (message.type === 'welcome') { peer.id = message.playerId; peer.token = message.token; peer.state = message.state; clearTimeout(timeout); resolve(peer) }
      if (message.type === 'frame') peer.state = { ...peer.state, ...message.state, world: { ...peer.state.world, ...message.world } }
      if (message.type === 'error') { peer.errors.push(message); if (!peer.id) { clearTimeout(timeout); ws.close(); reject(new Error(message.code)) } }
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
await assert.rejects(connect(crypto.randomUUID(), 'Ninth Explorer'), /room_full/)
const starts = peers.map(p => p.state.crew.find(c => c.id === p.id).x)
const input = (peer, x = 0) => ({ type: 'input', epoch: peer.state.epoch, input: { seq: ++peer.seq, x, y: 0, aimX: 0, aimY: 0, buttons: 0, command: null, commandCrew: null, active: true } })
for (const peer of peers) peer.ws.send(JSON.stringify(input(peer, peer.seq % 2 ? -1 : 1)))
await new Promise(resolve => setTimeout(resolve, 350))
for (const [i, peer] of peers.entries()) { assert.ok(peer.state.crew.find(c => c.id === peer.id).x > starts[i] + .2); peer.ws.send(JSON.stringify(input(peer))) }
// Back-to-back press/release and order/neutral packets cannot erase an action before a simulation tick.
const jump = input(host); jump.input.buttons = 1
host.ws.send(JSON.stringify(jump)); host.ws.send(JSON.stringify(input(host)))
const command = input(host); command.input.command = 'west'; command.input.commandCrew = host.state.crew.find(c => c.origin === 'companion').id
host.ws.send(JSON.stringify(command)); host.ws.send(JSON.stringify(input(host)))
// Observe replicated state, not a 160 ms wall-clock guess. The room publishes
// at 10 Hz and a real network round trip can exceed that old observation window.
const quickInputObservations = []
let quickJumpObserved = false, quickOrderObserved = false
const quickDeadline = Date.now() + 2500
while (Date.now() < quickDeadline && !(quickJumpObserved && quickOrderObserved)) {
  const captain = host.state.crew.find(c => c.id === host.id), companion = host.state.crew.find(c => c.origin === 'companion')
  quickJumpObserved ||= captain.y > -.8
  quickOrderObserved ||= companion.order === 'west' && companion.commandSeq >= command.input.seq
  quickInputObservations.push({ tick: host.state.tick, seq: captain.lastSeq, y: captain.y, grounded: captain.grounded, petOrder: companion.order, petCommandSeq: companion.commandSeq })
  if (!(quickJumpObserved && quickOrderObserved)) await new Promise(resolve => setTimeout(resolve, 25))
}
await writeFile(`${evidence}/quick-input-observations.json`, JSON.stringify(quickInputObservations, null, 2))
assert.ok(quickJumpObserved, 'Quick jump was dropped')
assert.ok(quickOrderObserved, 'Quick order was dropped')
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
const rawSave = JSON.stringify({ format: 'starling-rescue', version: 1, state: { ...host.state, events: [] } })
const resumedResponse = await fetch(server + '/api/rescue/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...request, guestId: crypto.randomUUID(), save: rawSave }) })
assert.equal(resumedResponse.status, 201)
const resumedCode = (await resumedResponse.json()).roomCode
const resumedHost = await connect(crypto.randomUUID(), 'Resumed Captain', undefined, resumedCode), resumedGuest = await connect(crypto.randomUUID(), 'Resumed Friend', undefined, resumedCode)
assert.equal(resumedGuest.state.crew.length, host.state.crew.length)
assert.equal(resumedGuest.state.crew.filter(c => !c.pet).length, 2)
assert.ok(resumedGuest.state.crew.some(c => c.id === 'pip' && c.pet))
assert.equal(resumedGuest.state.initialSeed, host.state.initialSeed)
resumedHost.ws.close(1000, 'Resume verified'); resumedGuest.ws.close(1000, 'Resume verified')
const report = { server, roomCode, humans: 8, totalCrew: host.state.crew.length, uniqueIdentities: new Set(ids).size, reconnectSameId: restored.id === old.id, hostAuthority: true, ninthRejected: true, quickInputsRetained: true, saveResumedWithTwoHumansAndAI: true, tick: host.state.tick, messages: host.messages, bytes: host.bytes, errors: peers.flatMap(p => p.errors).filter(e => e.code !== 'host_action') }
for (const peer of peers) peer.ws.close(1000, 'Smoke completed')
assert.deepEqual(report.errors, [])
await writeFile(`${evidence}/room-smoke.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
