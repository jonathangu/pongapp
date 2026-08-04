import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { buildMatchConfig, createGame, type GameState } from '@pongapp/game-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerMessage } from '@pongapp/protocol'
import { PROTOCOL_VERSION } from '@pongapp/protocol'
import { GameRoom } from '../src/room'
import { createRoomServer, type RoomServer } from '../src/server'

const openServers: RoomServer[] = []

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => server.close()))
})

function waitFor(socket: WebSocket, predicate: (message: ServerMessage) => boolean, timeoutMs = 5_000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for room message')), timeoutMs)
    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString()) as ServerMessage
      if (!predicate(message)) return
      clearTimeout(timeout)
      socket.off('message', onMessage)
      resolve(message)
    }
    socket.on('message', onMessage)
  })
}

async function connect(baseUrl: string, roomCode: string, index: number): Promise<WebSocket> {
  const socket = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/api/rooms/${roomCode}/websocket`)
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', reject)
  })
  const welcome = waitFor(socket, (message) => message.type === 'welcome')
  socket.send(JSON.stringify({
    type: 'hello',
    version: PROTOCOL_VERSION,
    guestId: `room-test-player-${index}`,
    displayName: `Player ${index}`,
    role: 'player',
  }))
  expect((await welcome).type).toBe('welcome')
  return socket
}

describe('Fly room server', () => {
  it('logs balance outcomes without room or player identity', () => {
    const game = createGame(buildMatchConfig({
      humanPlayers: [
        { id: 'private-player-id', name: 'Jonathan' },
        { id: 'private-wife-id', name: 'Private Wife' },
      ],
      seed: 4,
    }))
    game.phase = 'finished'
    game.tick = 420
    game.scores['team-0'] = 5
    game.players['private-wife-id']!.goalCampTicks = 180
    game.players['private-wife-id']!.goalsConceded = 5
    game.players['private-wife-id']!.campedGoalsConceded = 3
    game.events = [
      { type: 'score', scorerId: 'private-player-id', team: 'team-0', againstPlayerId: 'private-wife-id', ballId: 'private-ball-id', points: 1, rallyHits: 6, defenderCamping: true },
      { type: 'matchEnd', winnerTeam: 'team-0' },
    ]
    const room = new GameRoom(
      { roomCode: 'ABCDEF', hostName: 'Secret Host', createdAt: 1 },
      async () => undefined,
    )
    const internal = room as unknown as { game: GameState | null; logBalanceEvents(): void }
    internal.game = game
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    try {
      internal.logBalanceEvents()
      const records = log.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
      expect(records).toHaveLength(2)
      expect(records[0]).toMatchObject({ event: 'pongapp.balance.goal.v1', defenderCamping: true })
      expect(records[1]).toMatchObject({ event: 'pongapp.balance.match.v1', longestRallyHits: 0 })
      const rendered = JSON.stringify(records)
      for (const secret of ['ABCDEF', 'Secret Host', 'Jonathan', 'Private Wife', 'private-player-id', 'private-wife-id', 'private-ball-id']) {
        expect(rendered).not.toContain(secret)
      }
    } finally {
      log.mockRestore()
    }
  })

  it('creates an authoritative duel, acknowledges input, and persists the room', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pongapp-room-'))
    const dataPath = join(directory, 'rooms.json')
    const roomServer = await createRoomServer({ dataPath })
    openServers.push(roomServer)
    const port = await roomServer.start()
    const baseUrl = `http://127.0.0.1:${port}`

    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json())
    expect(health).toMatchObject({ status: 'ok', service: 'pongapp-room', protocol: 3 })

    const createResponse = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hostName: 'Player 1' }),
    })
    expect(createResponse.status).toBe(201)
    const { roomCode } = await createResponse.json() as { roomCode: string }

    const host = await connect(baseUrl, roomCode, 1)
    const guest = await connect(baseUrl, roomCode, 2)
    const playing = waitFor(host, (message) => message.type === 'snapshot' && message.state.phase === 'playing')
    expect((await playing).type).toBe('snapshot')

    const acknowledged = waitFor(host, (message) => message.type === 'snapshot' && message.acknowledgedSeq === 1)
    host.send(JSON.stringify({ type: 'input', seq: 1, targetX: 0.8, targetY: 0.64, palAction: null }))
    expect((await acknowledged).type).toBe('snapshot')

    await waitFor(host, (message) => message.type === 'snapshot' && message.state.phase === 'playing' && message.state.serveTicks === 0)
    const summoned = waitFor(host, (message) => message.type === 'snapshot'
      && message.acknowledgedSeq === 3
      && message.state.pals.some((pal) => pal.type === 'guard'))
    // A continuous steering packet must not erase a Pal edge before the
    // authoritative tick consumes it.
    host.send(JSON.stringify({ type: 'input', seq: 2, targetX: 0.8, targetY: 0.64, palAction: 'guard' }))
    host.send(JSON.stringify({ type: 'input', seq: 3, targetX: 0.76, targetY: 0.52, palAction: null }))
    expect((await summoned).type).toBe('snapshot')

    host.close()
    guest.close()
    await roomServer.close()
    openServers.splice(openServers.indexOf(roomServer), 1)
    const database = JSON.parse(await readFile(dataPath, 'utf8')) as { version: number; rooms: Record<string, unknown> }
    expect(database.version).toBe(3)
    expect(database.rooms[roomCode]).toBeDefined()
  })

  it('rejects untrusted browser origins', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pongapp-room-'))
    const roomServer = await createRoomServer({ dataPath: join(directory, 'rooms.json') })
    openServers.push(roomServer)
    const port = await roomServer.start()
    const response = await fetch(`http://127.0.0.1:${port}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
      body: '{}',
    })
    expect(response.status).toBe(403)
  })
})
