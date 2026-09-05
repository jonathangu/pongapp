import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CoopGameState, VersusGameState } from '@pongapp/game-core'
import type { RoomParticipant, StoredRoomConfig } from '@pongapp/protocol'

export interface StoredParticipant extends RoomParticipant {
  guestId: string
  reconnectToken: string
  lastSeq: number
  lastPaddle: number
  disconnectedAt: number | null
}

export interface StoredRoomRecord {
  config: StoredRoomConfig
  participants: StoredParticipant[]
  game: CoopGameState | VersusGameState | null
  updatedAt: number
}

interface RoomDatabase {
  version: 5
  rooms: Record<string, StoredRoomRecord>
}

export class FileRoomStore {
  private readonly records = new Map<string, StoredRoomRecord>()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {}

  async load(): Promise<Map<string, StoredRoomRecord>> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<RoomDatabase>
      // v5 is intentionally a hard ruleset cut. Ignore persisted older rooms so
      // the server can boot cleanly on the existing Fly volume.
      if (parsed.version !== 5 || !parsed.rooms) return new Map()
      for (const [code, record] of Object.entries(parsed.rooms)) this.records.set(code, record)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return new Map(this.records)
  }

  save(code: string, record: StoredRoomRecord): Promise<void> {
    this.records.set(code, structuredClone(record))
    const database: RoomDatabase = { version: 5, rooms: Object.fromEntries(this.records) }
    const payload = JSON.stringify(database)
    const temporaryPath = `${this.path}.next`
    this.writeQueue = this.writeQueue.catch((error: unknown) => {
      console.error('previous room persistence write failed; retrying', error)
    }).then(async () => {
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(temporaryPath, payload, 'utf8')
      await rename(temporaryPath, this.path)
    })
    return this.writeQueue
  }

  flush(): Promise<void> {
    return this.writeQueue
  }
}
