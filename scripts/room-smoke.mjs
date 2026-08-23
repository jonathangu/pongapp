const serverUrl = process.env.ROOM_SERVER_URL ?? 'http://127.0.0.1:8080'
const PROTOCOL_VERSION = 3

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

async function connect(roomCode, index, reconnect = null) {
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
  }))
  const welcome = await waitFor(client, (message) => message.type === 'welcome')
  invariant(welcome.version === PROTOCOL_VERSION, `${name} received the wrong protocol`)
  invariant(welcome.lobby.roomName === 'Smoke Arena', `${name} received the wrong room name`)
  invariant(welcome.participant.slot === index, `${name} did not receive slot ${index}`)
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
  body: JSON.stringify({ hostName: 'Player 1', roomName: 'Smoke Arena' }),
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
  invariant(players.length === 2, `Expected a two-player duel, received ${players.length}`)
  invariant(players.every((player) => !player.isAi), 'Expected exactly two human players')

  clients[0].socket.send(JSON.stringify({ type: 'input', seq: 1, targetX: 0.2, targetY: 0.62, palAction: 'guard' }))
  const summoned = await waitFor(
    clients[0],
    (message) => message.type === 'snapshot'
      && message.acknowledgedSeq >= 1
      && message.state.pals.some((pal) => pal.ownerId === clients[0].playerId && pal.type === 'guard'),
  )
  const owner = summoned.state.players[clients[0].playerId]
  invariant(owner.palEnergy === 0, `Guard did not spend two energy; player has ${owner.palEnergy}`)

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

  const originalHost = clients[0]
  const originalHostClosed = new Promise((resolve) => originalHost.socket.addEventListener('close', resolve, { once: true }))
  const replacementHost = await connect(roomCode, 0, originalHost)
  clients.push(replacementHost)
  const replaced = await originalHostClosed
  invariant(replaced.code === 4001, `Expected replaced host to close with 4001, received ${replaced.code}`)
  invariant(replacementHost.playerId === originalHost.playerId, 'Replacement host did not reclaim the original seat')
  const reconnectPingAt = Date.now()
  replacementHost.socket.send(JSON.stringify({ type: 'ping', sentAt: reconnectPingAt }))
  await waitFor(replacementHost, (message) => message.type === 'pong' && message.sentAt === reconnectPingAt)

  console.log(`room-smoke ok: ${roomCode} / Smoke Arena, 2 humans auto-started in 2D, Guard summoned at tick ${summoned.serverTick}, duplicate host seat transferred once, room RTT median ${medianLatency} ms / p95 ${p95Latency} ms`)
  completed = true
} finally {
  for (const client of clients) client.socket.close(1000, 'smoke complete')
}

if (completed) process.exit(0)
