import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import type { ServerMessage } from '@pongapp/protocol'
import { PROTOCOL_VERSION } from '@pongapp/protocol'
import { createRoomServer, type RoomServer } from '../src/server'

const openServers: RoomServer[] = []
afterEach(async () => { await Promise.all(openServers.splice(0).map((server) => server.close())) })

function waitFor(socket: WebSocket, predicate: (message: ServerMessage) => boolean, timeoutMs = 5_000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for room message')), timeoutMs)
    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString()) as ServerMessage
      if (!predicate(message)) return
      clearTimeout(timeout); socket.off('message', onMessage); resolve(message)
    }
    socket.on('message', onMessage)
  })
}
async function connect(baseUrl: string, roomCode: string, index: number): Promise<WebSocket> {
  const socket = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/api/rooms/${roomCode}/websocket`)
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  const welcome = waitFor(socket, (message) => message.type === 'welcome')
  socket.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, guestId: `room-test-player-${index}`, displayName: `Player ${index}`, role: 'player' }))
  expect((await welcome).type).toBe('welcome')
  return socket
}

describe('local Two Oars room server', () => {
  it('creates an authoritative crew trip, acknowledges input, and persists v6', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pongapp-room-'))
    const dataPath = join(directory, 'rooms.json')
    const roomServer = await createRoomServer({ dataPath }); openServers.push(roomServer)
    const baseUrl = `http://127.0.0.1:${await roomServer.start()}`
    expect(await fetch(`${baseUrl}/api/health`).then((response) => response.json())).toMatchObject({ status: 'ok', protocol: 6 })
    const response = await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hostName: 'Player 1' }) })
    expect(response.status).toBe(201)
    const { roomCode } = await response.json() as { roomCode: string }
    const host = await connect(baseUrl, roomCode, 1); const guest = await connect(baseUrl, roomCode, 2)
    await waitFor(host, (message) => message.type === 'snapshot' && message.state.phase === 'countdown')
    const acknowledged = waitFor(host, (message) => message.type === 'snapshot' && message.acknowledgedSeq === 1)
    host.send(JSON.stringify({ type: 'input', seq: 1, paddle: 1, controlActive: true }))
    const snapshot = await acknowledged
    expect(snapshot.type === 'snapshot' && snapshot.state.rulesetVersion).toBe(7)
    if (snapshot.type !== 'snapshot' || snapshot.state.rulesetVersion !== 7) throw new Error('Missing game')
    const seats = Object.values(snapshot.state.players)
    const fromId = seats.find((p) => p.side === 'left')!.id
    const targetId = seats.find((p) => p.side === 'right')!.id
    const forwarded = waitFor(guest, (message) => message.type === 'peerSignal')
    host.send(JSON.stringify({type:'peerSignal',targetId,data:'{"kind":"ping","at":123}'}))
    expect(await forwarded).toMatchObject({type:'peerSignal',fromId,data:'{"kind":"ping","at":123}'})
    const third = await connect(baseUrl,roomCode,3)
    let injected = false
    guest.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.type==='peerSignal'&&m.data==='unauthorized')injected=true})
    third.send(JSON.stringify({type:'peerSignal',targetId,data:'unauthorized'}))
    await new Promise(resolve=>setTimeout(resolve,80))
    expect(injected).toBe(false);third.close()
    host.close(); guest.close(); await roomServer.close(); openServers.splice(openServers.indexOf(roomServer), 1)
    const database = JSON.parse(await readFile(dataPath, 'utf8')) as { version: number; rooms: Record<string, unknown> }
    expect(database.version).toBe(6); expect(database.rooms[roomCode]).toBeDefined()
  })

  it('rejects untrusted browser origins', async () => {
    const roomServer = await createRoomServer({ dataPath: join(await mkdtemp(join(tmpdir(), 'pongapp-room-')), 'rooms.json') }); openServers.push(roomServer)
    const response = await fetch(`http://127.0.0.1:${await roomServer.start()}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.example' }, body: '{}' })
    expect(response.status).toBe(403)
  })
})
