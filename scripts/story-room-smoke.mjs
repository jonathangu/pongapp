import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const server = process.env.ROOM_SERVER_URL || 'http://127.0.0.1:8787'
const evidence = process.env.GODOT_EVIDENCE || 'artifacts/story-room'
const peers = [], report = { runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', server }
await mkdir(evidence, { recursive: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn) { const end = Date.now() + 10000; while (!fn() && Date.now() < end) await sleep(25); assert.ok(fn(), 'Expected room state timed out') }
try {
  const created = await fetch(server + '/api/rescue/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Story Security', guestId: crypto.randomUUID(), seed: 73599, biome: 0, story: true }) })
  assert.equal(created.status, 201); const { roomCode } = await created.json(); report.roomCode = roomCode
  async function connect(name) {
    const ws = new WebSocket(server.replace(/^http/, 'ws') + `/api/rescue/rooms/${roomCode}/websocket`), peer = { ws, state: null, errors: [], id: null }; peers.push(peer)
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', version: 1, guestId: crypto.randomUUID(), name })))
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.type === 'welcome') { peer.state = m.state; peer.id = m.playerId } if (m.type === 'error') peer.errors.push(m.code) })
    await until(() => peer.id); return peer
  }
  const host = await connect('Mara Security'), guest = await connect('Finn Security')
  const action = (peer, value, epoch = peer.state.epoch) => peer.ws.send(JSON.stringify({ type: 'action', epoch, action: value }))
  const initial = JSON.stringify(host.state.story)
  action(guest, { kind: 'story-choice', encounter: 'watch', choice: 'wind' })
  await until(() => guest.errors.includes('host_action')); assert.equal(JSON.stringify(host.state.story), initial)
  action(host, { kind: 'story-continue', encounter: 'watch' }); await until(() => host.errors.length === 1)
  assert.equal(host.errors[0], 'action_unavailable')
  action(host, { kind: 'story-choice', encounter: 'watch', choice: 'wind' }); await until(() => guest.state.story.result === 'wind')
  const selected = structuredClone(host.state.story)
  action(host, { kind: 'story-choice', encounter: 'watch', choice: 'carry' }); await until(() => host.errors.length === 2)
  assert.deepEqual(host.state.story, selected)
  action(guest, { kind: 'story-continue', encounter: 'watch' }); await until(() => guest.errors.length === 2)
  assert.deepEqual(host.state.story, selected)
  action(host, { kind: 'story-continue', encounter: 'watch' }); await until(() => guest.state.story.pending === null)
  assert.equal(guest.state.story.history.length, 1); assert.equal(guest.state.story.sonId, guest.id)
  report.checks = { guestChoiceRejected: true, prematureContinueRejected: true, replayRejected: true, guestContinueRejected: true, sharedHistory: true, realSonRole: true }
  report.expectedRejections = peers.map(p => p.errors); report.passed = true; console.log(JSON.stringify(report, null, 2))
} catch (error) { report.passed = false; report.failure = error.stack; throw error }
finally { for (const p of peers) p.ws.close(1000, 'Story authority verified'); await writeFile(`${evidence}/story-room-smoke.json`, JSON.stringify(report, null, 2)) }
