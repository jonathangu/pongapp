const serverUrl = process.env.ROOM_SERVER_URL ?? 'http://127.0.0.1:8080'
const PROTOCOL_VERSION = 4

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function waitFor(client, predicate, timeoutMs = 10_000) {
  const existing = client.messages.find(predicate)
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${client.name}`)), timeoutMs)
    client.waiters.push({
      predicate,
      resolve: (message) => {
        clearTimeout(timeout)
        resolve(message)
      },
    })
  })
}

async function connect(roomCode, index, reconnect = null, expectedSlot = index) {
  const name = `Player ${index + 1}`
  const url = new URL(`/api/rooms/${roomCode}/websocket`, serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(url)
  const client = { name, socket, messages: [], waiters: [] }
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    client.messages.push(message)
    for (let waiterIndex = client.waiters.length - 1; waiterIndex >= 0; waiterIndex -= 1) {
      const waiter = client.waiters[waiterIndex]
      if (!waiter.predicate(message)) continue
      client.waiters.splice(waiterIndex, 1)
      waiter.resolve(message)
    }
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error(`Could not connect ${name}`)), { once: true })
  })
  socket.send(JSON.stringify({
    type: 'hello',
    version: PROTOCOL_VERSION,
    guestId: reconnect?.guestId ?? `smoke-player-${index + 1}`,
    displayName: name,
    role: 'player',
    ...(reconnect?.reconnectToken ? { reconnectToken: reconnect.reconnectToken } : {}),
    clientSessionId: crypto.randomUUID(),
    reconnectAttempt: reconnect ? 1 : 0,
  }))
  const welcome = await waitFor(client, (message) => message.type === 'welcome')
  invariant(welcome.version === PROTOCOL_VERSION, `${name} received the wrong protocol`)
  invariant(welcome.lobby.roomName === 'Smoke Boat', `${name} received the wrong room name`)
  invariant(/^[A-F0-9]{8}$/.test(welcome.lobby.supportTraceId), `${name} received an invalid support trace`)
  invariant(welcome.participant.slot === expectedSlot, `${name} did not receive slot ${expectedSlot}`)
  client.playerId = welcome.participant.id
  client.guestId = reconnect?.guestId ?? `smoke-player-${index + 1}`
  client.reconnectToken = welcome.reconnectToken
  return client
}

const health = await fetch(new URL('/api/health', serverUrl)).then((response) => response.json())
invariant(health.status === 'ok', 'Room server health check failed')
invariant(health.protocol === PROTOCOL_VERSION, `Expected protocol ${PROTOCOL_VERSION}, received ${health.protocol}`)

const createResponse = await fetch(new URL('/api/rooms', serverUrl), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hostName: 'Player 1', roomName: 'Smoke Boat' }),
})
invariant(createResponse.status === 201, `Room creation failed with ${createResponse.status}`)
const { roomCode } = await createResponse.json()
invariant(/^[A-Z2-9]{6}$/.test(roomCode), 'Room code was invalid')

const clients = []
let completed = false
try {
  clients.push(await connect(roomCode, 0))
  clients.push(await connect(roomCode, 1))

  const snapshot = await waitFor(
    clients[0],
    (message) => message.type === 'snapshot' && message.state.phase === 'playing',
    15_000,
  )
  const players = Object.values(snapshot.state.players)
  invariant(players.length === 2, `Expected two rowers, received ${players.length}`)
  invariant(players.some((player) => player.side === 'left') && players.some((player) => player.side === 'right'), 'Expected one player on each oar')

  clients[0].socket.send(JSON.stringify({ type: 'clientTelemetry', event: 'control_surface_visible' }))
  clients[0].socket.send(JSON.stringify({ type: 'input', seq: 1, paddle: 1, controlActive: true }))
  const paddled = await waitFor(
    clients[0],
    (message) => message.type === 'snapshot'
      && message.acknowledgedSeq >= 1
      && message.state.paddles.left === 1,
  )
  invariant(paddled.state.rulesetVersion === 4, 'Expected the cooperative v4 ruleset')

  const latencySamples = []
  for (let index = 0; index < 7; index += 1) {
    const sentAt = Date.now()
    const startedAt = performance.now()
    clients[0].socket.send(JSON.stringify({ type: 'ping', sentAt }))
    const pong = await waitFor(clients[0], (message) => message.type === 'pong' && message.sentAt === sentAt)
    invariant(Number.isFinite(pong.serverAt) && Math.abs(pong.serverAt - sentAt) < 60_000, 'Pong timestamp was invalid')
    latencySamples.push(performance.now() - startedAt)
  }
  latencySamples.sort((a, b) => a - b)
  const medianLatency = Math.round(latencySamples[Math.floor(latencySamples.length / 2)])
  const p95Latency = Math.round(latencySamples[Math.floor((latencySamples.length - 1) * 0.95)])
  clients[0].socket.send(JSON.stringify({
    type: 'clientTelemetry', event: 'network_sample', latencyMs: medianLatency, latencyP95Ms: p95Latency,
    jitterMs: 1, snapshotGapP95Ms: 34, connectionQuality: 'good',
  }))

  const fullRoomVisitor = await connect(roomCode, 2, null, null)
  clients.push(fullRoomVisitor)
  fullRoomVisitor.socket.send(JSON.stringify({ type: 'clientTelemetry', event: 'room_full_visible' }))

  const originalHost = clients[0]
  const originalHostClosed = new Promise((resolve) => originalHost.socket.addEventListener('close', resolve, { once: true }))
  const replacementHost = await connect(roomCode, 0, originalHost)
  clients.push(replacementHost)
  const replaced = await originalHostClosed
  invariant(replaced.code === 4001, `Expected replaced host to close with 4001, received ${replaced.code}`)
  invariant(replacementHost.playerId === originalHost.playerId, 'Replacement host did not reclaim the original seat')
  replacementHost.socket.send(JSON.stringify({ type: 'clientTelemetry', event: 'control_surface_visible' }))
  const replacementControlled = waitFor(replacementHost, (message) => message.type === 'snapshot' && message.acknowledgedSeq >= 2)
  replacementHost.socket.send(JSON.stringify({ type: 'input', seq: 2, paddle: 0.5, controlActive: true }))
  await replacementControlled
  const reconnectPingAt = Date.now()
  replacementHost.socket.send(JSON.stringify({ type: 'ping', sentAt: reconnectPingAt }))
  await waitFor(replacementHost, (message) => message.type === 'pong' && message.sentAt === reconnectPingAt)

  console.log(`room-smoke ok: ${roomCode} / Smoke Boat, two rowers auto-started, paddle acknowledged, third player shown a full boat, duplicate host seat transferred once and controlled, room RTT median ${medianLatency} ms / p95 ${p95Latency} ms`)
  completed = true
} finally {
  for (const client of clients) client.socket.close(1000, 'smoke complete')
}

if (completed) process.exit(0)
