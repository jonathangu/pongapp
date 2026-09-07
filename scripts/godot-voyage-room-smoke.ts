// Real authoritative voyage using only ordinary assisted input packets.
// Reuses the radial approach procedure from starling-voyage-room-smoke.ts.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { advanceRescueGame, encodeRescueSave, neutralRescueInput, type RescueState, type RescueInput, type StationId } from '../packages/game-core/src/rescue'
import { mergeRescueFrame } from '../packages/protocol/src/rescue'
const server = process.env.ROOM_SERVER_URL || 'http://127.0.0.1:8787'
const evidence = process.env.GODOT_EVIDENCE || 'artifacts/godot-voyage'
const latency = Number(process.env.GODOT_LATENCY_MS || 150), dropEvery = Number(process.env.GODOT_DROP_EVERY || 10)
await mkdir(evidence, { recursive: true })
const response = await fetch(server + '/api/rescue/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Godot Captain', guestId: crypto.randomUUID(), seed: 73599, biome: 0 }) })
assert.equal(response.status, 201)
const { roomCode } = await response.json() as { roomCode: string }
console.log('Assisted full voyage room', roomCode)
type Peer = { ws: WebSocket; id: string; state: RescueState; authoritative: RescueState; pending: RescueInput[]; seq: number; bytes: number; frames: number; dropped: number; errors: string[] }
const peers: Peer[] = [], trace: unknown[] = []
let timer: ReturnType<typeof setInterval> | undefined, report: Record<string, unknown> = {}, done = false
async function connect(name: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(server.replace(/^http/, 'ws') + `/api/rescue/rooms/${roomCode}/websocket`)
    const peer = { ws, seq: 0, bytes: 0, frames: 0, dropped: 0, errors: [], pending: [] } as unknown as Peer
    const timeout = setTimeout(() => reject(new Error('Welcome timeout')), 10000)
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', version: 1, guestId: crypto.randomUUID(), name })))
    ws.addEventListener('message', event => {
      peer.bytes += String(event.data).length
      const message = JSON.parse(String(event.data))
      if (message.type === 'error') peer.errors.push(message.code)
      if (message.type === 'welcome') { peer.id = message.playerId; peer.authoritative = message.state; peer.state = structuredClone(message.state); clearTimeout(timeout); resolve(peer) }
      if (message.type === 'frame') {
        if (++peer.frames % dropEvery === 0) { peer.dropped++; return }
        setTimeout(() => {
          if (done) return
          peer.authoritative = mergeRescueFrame(peer.authoritative, message)
          peer.pending = peer.pending.filter(input => input.seq > (message.acks[peer.id] ?? -1)).slice(-12)
          peer.state = structuredClone(peer.authoritative)
          for (const input of peer.pending) advanceRescueGame(peer.state, { [peer.id]: input }, 1 / 30)
        }, latency)
      }
    })
    ws.addEventListener('error', reject)
  })
}
function send(peer: Peer, input: RescueInput) {
  input.seq = ++peer.seq; input.assist = true
  peer.pending.push({ ...input }); peer.pending = peer.pending.slice(-12)
  advanceRescueGame(peer.state, { [peer.id]: input }, 1 / 30)
  if (peer.seq % dropEvery === 0) { peer.dropped++; return }
  const wire = JSON.stringify({ type: 'input', epoch: peer.state.epoch, input })
  setTimeout(() => { if (!done && peer.ws.readyState === WebSocket.OPEN) peer.ws.send(wire) }, latency)
}
function command(peer: Peer, input: RescueInput, station: StationId) {
  const player = peer.state.crew.find(c => c.id === peer.id)!
  if (player.order !== station || player.commandSeq < 0) { input.command = station; input.commandCrew = peer.id }
}
try {
  const host = await connect('Godot Captain'), friend = await connect('Godot Cook'); peers.push(host, friend)
  let stage = 'cage', previous = -1, progress = 0, cooked = false, minHp = 12, lastTrace = 0
  const started = Date.now()
  timer = setInterval(() => {
    const s = host.state
    minHp = Math.min(minHp, s.ship.hp)
    if (s.stats.rescues !== progress || s.time - lastTrace > 15) {
      progress = s.stats.rescues; lastTrace = s.time
      const point = { time: s.time, rescued: progress, hp: s.ship.hp, crew: s.crew.length, x: s.ship.x, y: s.ship.y, guardian: s.guardianDefeated }
      trace.push(point); console.log('voyage', JSON.stringify(point))
    }
    let target = { x: 0, y: -24 }
    const cage = s.world.cages.find(c => !c.rescued)
    if (cage) {
      if (previous !== -1 && previous !== cage.id && stage === 'cage') stage = 'return'
      if (stage === 'return' && Math.hypot(s.ship.x, s.ship.y + 24) < 3) stage = 'cage'
      if (stage === 'cage') {
        const dx = cage.x, dy = cage.y + 24, d = Math.hypot(dx, dy)
        target = cage.open ? cage : { x: cage.x - dx / d * 18, y: cage.y - dy / d * 18 }
      }
      previous = cage.id
    } else target = s.world.portal
    const input = neutralRescueInput(), dx = target.x - s.ship.x, dy = target.y - s.ship.y
    const distance = Math.max(.001, Math.hypot(dx, dy)), speed = Math.min(.7, distance * .1)
    input.x = dx / distance * speed; input.y = dy / distance * speed
    command(host, input, 'engine'); send(host, input)
    const f = friend.state
    cooked ||= f.meal.remaining > 0
    const destination = cooked ? 'shield' : 'galley', friendInput = neutralRescueInput()
    command(friend, friendInput, destination); send(friend, friendInput)
  }, 1000 / 30)
  while (host.authoritative.phase === 'playing' && Date.now() - started < 240000) await new Promise(resolve => setTimeout(resolve, 500))
  const final = host.authoritative
  await writeFile(`${evidence}/assisted-voyage-save.json`, encodeRescueSave(final))
  report = { runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', server, roomCode, ruleset: final.rulesetVersion, latencyEachWayMs: latency, dropEvery, seconds: (Date.now() - started) / 1000, phase: final.phase, rescued: final.stats.rescues, guardian: final.guardianDefeated, minHp, hp: final.ship.hp, cooked, trace, peers: peers.map(p => ({ frames: p.frames, logicalBytes: p.bytes, droppedPackets: p.dropped, errors: p.errors })), crew: final.crew.map(c => ({ name: c.name, seat: c.seat, order: c.order })) }
  console.log(JSON.stringify(report, null, 2))
  assert.equal(final.phase, 'won'); assert.ok(cooked); assert.ok(final.crew.length > 3)
  assert.deepEqual(peers.flatMap(p => p.errors), [])
} finally {
  done = true; if (timer) clearInterval(timer)
  for (const peer of peers) peer.ws.close(1000, 'Assisted full voyage verification')
  await writeFile(`${evidence}/assisted-voyage-smoke.json`, JSON.stringify(report, null, 2))
}
