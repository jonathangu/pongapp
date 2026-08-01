import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { WebSocketServer } from 'ws'
import { createRoomRequestSchema, PROTOCOL_VERSION, type StoredRoomConfig } from '@pongapp/protocol'
import { allowedOrigin, generateRoomCode, validRoomCode } from './helpers'
import { FileRoomStore } from './persistence'
import { GameRoom } from './room'

export interface RoomServerOptions {
  dataPath: string
}

export interface RoomServer {
  server: Server
  start(port?: number, hostname?: string): Promise<number>
  close(): Promise<void>
}

const MAX_BODY_BYTES = 16_384

function corsHeaders(request: IncomingMessage): Record<string, string> {
  const origin = allowedOrigin(request.headers.origin)
  return {
    'access-control-allow-origin': origin ?? 'https://www.jonathangu.com',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

function json(request: IncomingMessage, response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { ...corsHeaders(request), 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > MAX_BODY_BYTES) throw new Error('body_too_large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export async function createRoomServer(options: RoomServerOptions): Promise<RoomServer> {
  const store = new FileRoomStore(options.dataPath)
  const rooms = new Map<string, GameRoom>()
  for (const [code, record] of await store.load()) {
    rooms.set(code, new GameRoom(record.config, (next) => store.save(code, next), record))
  }

  const server = createServer((request, response) => void (async () => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders(request))
      response.end()
      return
    }
    if (url.pathname === '/api/health') {
      json(request, response, 200, { status: 'ok', service: 'pongapp-room', protocol: PROTOCOL_VERSION, region: process.env.FLY_REGION ?? 'local' })
      return
    }
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const origin = request.headers.origin
      if (origin && !allowedOrigin(origin)) {
        json(request, response, 403, { error: 'origin_not_allowed' })
        return
      }
      let body: unknown
      try { body = await readJson(request) } catch {
        json(request, response, 400, { error: 'invalid_json' })
        return
      }
      const parsed = createRoomRequestSchema.safeParse(body)
      if (!parsed.success) {
        json(request, response, 400, { error: 'invalid_room_config' })
        return
      }
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const roomCode = generateRoomCode()
        if (rooms.has(roomCode)) continue
        const config: StoredRoomConfig = { ...parsed.data, roomCode, createdAt: Date.now() }
        const room = new GameRoom(config, (record) => store.save(roomCode, record))
        await room.initialize()
        rooms.set(roomCode, room)
        json(request, response, 201, { roomCode })
        return
      }
      json(request, response, 503, { error: 'room_code_collision' })
      return
    }
    json(request, response, 404, { error: 'not_found' })
  })().catch((error: unknown) => {
    console.error('request failed', error)
    if (!response.headersSent) json(request, response, 500, { error: 'internal_error' })
    else response.end()
  }))

  const webSockets = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    const match = /^\/api\/rooms\/([A-Z2-9]{6})\/websocket$/.exec(url.pathname)
    const roomCode = match?.[1]
    const origin = request.headers.origin
    if (!roomCode || !validRoomCode(roomCode) || !rooms.has(roomCode) || (origin && !allowedOrigin(origin))) {
      const status = roomCode && validRoomCode(roomCode) && !rooms.has(roomCode) ? '404 Not Found' : '403 Forbidden'
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
      socket.destroy()
      return
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => rooms.get(roomCode)!.connect(webSocket))
  })

  return {
    server,
    start(port = 0, hostname = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        const onError = (error: Error) => reject(error)
        server.once('error', onError)
        server.listen(port, hostname, () => {
          server.off('error', onError)
          const address = server.address()
          if (!address || typeof address === 'string') reject(new Error('Room server did not receive a TCP port'))
          else resolve(address.port)
        })
      })
    },
    async close() {
      for (const room of rooms.values()) room.stop()
      webSockets.close()
      if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      await store.flush()
    },
  }
}
