// Two normal-input bots play a real authoritative room. No game-state writes or test endpoints.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { advanceRescueGame, encodeRescueSave, neutralRescueInput, petRescueInput, rescueAngle, routeRescueCrew, RESCUE_BUTTON, type RescueState, type RescueInput, type RescueCrew } from '../packages/game-core/src/rescue'
import { mergeRescueFrame } from '../packages/protocol/src/rescue'
const server = process.env.ROOM_SERVER_URL || 'http://127.0.0.1:8787'
const evidence = process.env.STARLING_EVIDENCE || '/Users/guclaw/.openclaw/workspace/task-artifacts/starling-rescue-release'
const latency = Number(process.env.STARLING_LATENCY_MS || 150), dropEvery = Number(process.env.STARLING_DROP_EVERY || 10)
await mkdir(evidence, { recursive: true })
const response = await fetch(server + '/api/rescue/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Voyage captain', guestId: crypto.randomUUID(), seed: 73599, biome: 0 }) })
assert.equal(response.status, 201)
const { roomCode } = await response.json() as { roomCode: string }
console.log('room', roomCode)
type Peer = { ws: WebSocket; id: string; state: RescueState; authoritative: RescueState; pending: RescueInput[]; seq: number; bytes: number; frames: number; dropped: number; errors: string[]; routes: Partial<RescueCrew> }
const peers: Peer[] = [], trace: unknown[] = []
let timer: ReturnType<typeof setInterval> | undefined, report: Record<string, unknown> = {}, done = false
async function connect(name: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(server.replace(/^http/, 'ws') + `/api/rescue/rooms/${roomCode}/websocket`)
    const peer = { ws, seq: 0, bytes: 0, frames: 0, dropped: 0, errors: [], routes: {}, pending: [] } as unknown as Peer
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
function plannedRoute(peer: Peer, seat: 'engine' | 'galley' | 'shield') {
  const p = peer.state.crew.find(c => c.id === peer.id)!
  Object.assign(p, peer.routes)
  const input = routeRescueCrew(p, seat, peer.state.tick, 1 / 30)
  peer.routes = { route: p.route, routeAt: p.routeAt, routeAge: p.routeAge, routeLastX: p.routeLastX, routeLastY: p.routeLastY }
  return input
}
function send(peer: Peer, input: RescueInput) {
  input.seq = ++peer.seq
  const size = Math.max(1, Math.hypot(input.aimX, input.aimY)); input.aimX /= size; input.aimY /= size
  peer.pending.push({ ...input }); peer.pending = peer.pending.slice(-12)
  advanceRescueGame(peer.state, { [peer.id]: input }, 1 / 30)
  if (peer.seq % dropEvery === 0) { peer.dropped++; return }
  const wire = JSON.stringify({ type: 'input', epoch: peer.state.epoch, input })
  setTimeout(() => { if (!done && peer.ws.readyState === WebSocket.OPEN) peer.ws.send(wire) }, latency)
}
try {
  const host = await connect('Voyage Captain'), friend = await connect('Voyage Cook'); peers.push(host, friend)
  let stage = 'cage', previous = -1, progress = 0, cooked = false, minHp = 12
  const started = Date.now()
  timer = setInterval(() => {
    const s = host.state, captain = s.crew.find(c => c.id === host.id)!, origin = { x: 0, y: -24 }
    minHp = Math.min(minHp, s.ship.hp)
    if (s.stats.rescues !== progress) { progress = s.stats.rescues; const point = { time: s.time, rescued: progress, hp: s.ship.hp, crew: s.crew.length }; trace.push(point); console.log('progress', JSON.stringify(point)) }
    if (captain.seat !== 'engine') send(host, plannedRoute(host, 'engine'))
    else {
      let target = origin
      const cage = s.world.cages.find(c => !c.rescued)
      if (cage) {
        if (previous !== -1 && previous !== cage.id && stage === 'cage') stage = 'return'
        if (stage === 'return' && Math.hypot(s.ship.x, s.ship.y + 24) < 3) stage = 'cage'
        if (stage === 'cage') { const dx = cage.x, dy = cage.y + 24, d = Math.hypot(dx, dy); target = cage.open ? cage : { x: cage.x - dx / d * 20, y: cage.y - dy / d * 20 } }
        previous = cage.id
      } else target = s.world.portal
      const input = neutralRescueInput(), dx = target.x - s.ship.x, dy = target.y - s.ship.y, d = Math.max(.001, Math.hypot(dx, dy))
      const speed = Math.min(7.5, d * 1.3), ax = dx / d * speed - s.ship.vx, ay = dy / d * speed - s.ship.vy, a = Math.max(.001, Math.hypot(ax, ay))
      input.aimX = -ax / a; input.aimY = -ay / a
      if (a > .8 && Math.abs(rescueAngle(Math.atan2(-ay, -ax) - s.stations.find(st => st.id === 'engine')!.angle)) < .22) input.buttons = RESCUE_BUTTON.fire
      send(host, input)
    }
    const f = friend.state, p = f.crew.find(c => c.id === friend.id)!
    cooked ||= f.meal.remaining > 0
    const destination = cooked ? 'shield' : 'galley'
    if (p.seat !== destination) send(friend, plannedRoute(friend, destination))
    else { p.order = destination; p.commandSeq = 0; send(friend, petRescueInput(f, p, 1 / 30)) }
  }, 1000 / 30)
  while (host.authoritative.phase === 'playing' && Date.now() - started < 240000) await new Promise(resolve => setTimeout(resolve, 500))
  host.state = host.authoritative
  const saved = encodeRescueSave(host.authoritative)
  await writeFile(`${evidence}/online-voyage-save.json`, saved)
  report = { server, roomCode, latencyEachWayMs: latency, dropEvery, seconds: (Date.now() - started) / 1000, phase: host.state.phase, rescued: host.state.stats.rescues, guardian: host.state.guardianDefeated, minHp, hp: host.state.ship.hp, cooked, trace, peers: peers.map(p => ({ frames: p.frames, logicalBytes: p.bytes, droppedPackets: p.dropped, errors: p.errors })), crew: host.state.crew.map(c => ({ name: c.name, seat: c.seat, order: c.order, x: c.x, y: c.y })) }
  console.log(JSON.stringify(report, null, 2))
  assert.equal(host.state.phase, 'won'); assert.ok(cooked); assert.ok(host.state.crew.length > 3)
  assert.deepEqual(peers.flatMap(p => p.errors), [])
} finally {
  done = true; if (timer) clearInterval(timer)
  for (const peer of peers) peer.ws.close(1000, 'Full voyage verified')
  await writeFile(`${evidence}/online-voyage-smoke.json`, JSON.stringify(report, null, 2))
}
