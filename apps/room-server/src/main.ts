import { resolve } from 'node:path'
import { createRoomServer } from './server'

const port = Number.parseInt(process.env.PORT ?? '8080', 10)
const dataPath = process.env.ROOM_DATA_PATH ?? resolve('.data/rooms.json')

async function main(): Promise<void> {
  const roomServer = await createRoomServer({ dataPath })
  await roomServer.start(port, '0.0.0.0')
  console.log(`PongApp room server listening on :${port} (${dataPath})`)

  let closing = false
  async function close(signal: string): Promise<void> {
    if (closing) return
    closing = true
    console.log(`Received ${signal}; closing room server`)
    await roomServer.close()
    process.exit(0)
  }

  process.on('SIGTERM', () => void close('SIGTERM'))
  process.on('SIGINT', () => void close('SIGINT'))
}

void main().catch((error: unknown) => {
  console.error('Room server failed to start', error)
  process.exit(1)
})
