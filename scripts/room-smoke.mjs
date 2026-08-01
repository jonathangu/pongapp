const serverUrl = process.env.ROOM_SERVER_URL ?? 'http://127.0.0.1:8080'

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

async function connect(roomCode, index) {
  const name = `Player ${index + 1}`
  const url = new URL(`/api/rooms/${roomCode}/websocket`, serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(url)
  const client = { name, socket, messages: [], waiters: [] }
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    client.messages.push(message)
    for (let index = client.waiters.length - 1; index >= 0; index -= 1) {
      const waiter = client.waiters[index]
      if (!waiter.predicate(message)) continue
      client.waiters.splice(index, 1)
      waiter.resolve(message)
    }
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error(`Could not connect ${name}`)), { once: true })
  })
  socket.send(JSON.stringify({
    type: 'hello',
    version: 1,
    guestId: `smoke-player-${index + 1}`,
    displayName: name,
    ability: ['dash', 'bend', 'guard'][index],
    role: 'player',
  }))
  const welcome = await waitFor(client, (message) => message.type === 'welcome')
  invariant(welcome.participant.slot === index, `${name} did not receive slot ${index}`)
  return client
}

const health = await fetch(new URL('/api/health', serverUrl)).then((response) => response.json())
invariant(health.status === 'ok', 'Room server health check failed')

const createResponse = await fetch(new URL('/api/rooms', serverUrl), {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    mode: 'arena',
    itemIntensity: 'wild',
    aiDifficulty: 'pro',
    aiSlots: 1,
    hostName: 'Player 1',
    hostAbility: 'dash',
  }),
})
invariant(createResponse.status === 201, `Room creation failed with ${createResponse.status}`)
const { roomCode } = await createResponse.json()
invariant(/^[A-Z2-9]{6}$/.test(roomCode), 'Room code was invalid')

const clients = []
let completed = false
try {
  for (let index = 0; index < 3; index += 1) clients.push(await connect(roomCode, index))
  for (const client of clients) client.socket.send(JSON.stringify({ type: 'ready', ready: true }))

  const snapshot = await waitFor(clients[0], (message) => message.type === 'snapshot' && message.state.phase === 'playing', 15_000)
  const players = Object.values(snapshot.state.players)
  invariant(players.length === 4, `Expected a four-player Arena, received ${players.length}`)
  invariant(players.filter((player) => player.isAi).length === 1, 'Expected exactly one AI player')
  invariant(players.filter((player) => !player.isAi).length === 3, 'Expected exactly three human players')

  clients[0].socket.send(JSON.stringify({ type: 'input', seq: 1, target: 0.2, abilityPressed: true }))
  const acknowledged = await waitFor(clients[0], (message) => message.type === 'snapshot' && message.acknowledgedSeq === 1)
  invariant(acknowledged.serverTick > snapshot.serverTick, 'Server did not advance after input')

  const sentAt = Date.now()
  clients[0].socket.send(JSON.stringify({ type: 'ping', sentAt }))
  const pong = await waitFor(clients[0], (message) => message.type === 'pong' && message.sentAt === sentAt)
  invariant(pong.serverAt >= sentAt, 'Pong timestamp was invalid')

  console.log(`room-smoke ok: ${roomCode}, 3 humans + 1 AI, input acknowledged at tick ${acknowledged.serverTick}`)
  completed = true
} finally {
  for (const client of clients) client.socket.close(1000, 'smoke complete')
}

if (completed) process.exit(0)
