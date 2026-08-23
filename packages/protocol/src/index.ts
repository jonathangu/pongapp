import type { GameState, PalType } from '@pongapp/game-core'
import { z } from 'zod'

export const PROTOCOL_VERSION = 3 as const

const palTypeSchema = z.enum(['guard', 'striker', 'captain'])

export const createRoomRequestSchema = z.object({
  hostName: z.string().trim().min(2).max(16),
  roomName: z.string().trim().min(2).max(32).optional(),
}).strict()

export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    version: z.literal(PROTOCOL_VERSION),
    guestId: z.string().min(8).max(80),
    displayName: z.string().trim().min(2).max(16),
    role: z.enum(['player', 'spectator']).default('player'),
    reconnectToken: z.string().min(16).max(200).optional(),
    accessToken: z.string().min(20).max(4096).optional(),
  }),
  z.object({
    type: z.literal('input'),
    seq: z.number().int().nonnegative(),
    targetX: z.number().min(0).max(1),
    targetY: z.number().min(0).max(1),
    palAction: palTypeSchema.nullable(),
  }),
  z.object({ type: z.literal('emote'), emote: z.enum(['gg', 'wow', 'nice', 'oops']) }),
  z.object({ type: z.literal('rematch') }),
  z.object({ type: z.literal('ping'), sentAt: z.number() }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>

export interface RoomParticipant {
  id: string
  profileId: string | null
  displayName: string
  slot: number | null
  isHost: boolean
  isAi: boolean
  connected: boolean
}

export interface RoomLobby {
  roomCode: string
  roomName: string
  participants: RoomParticipant[]
  phase: 'lobby' | 'countdown' | 'playing' | 'finished'
}

export type ServerMessage =
  | {
      type: 'welcome'
      version: typeof PROTOCOL_VERSION
      clientId: string
      reconnectToken: string
      participant: RoomParticipant
      lobby: RoomLobby
    }
  | { type: 'lobby'; lobby: RoomLobby }
  | { type: 'snapshot'; serverTick: number; acknowledgedSeq: number; state: GameState }
  | { type: 'event'; event: GameState['events'][number] }
  | { type: 'emote'; playerId: string; emote: 'gg' | 'wow' | 'nice' | 'oops' }
  | { type: 'result'; state: GameState }
  | { type: 'pong'; sentAt: number; serverAt: number }
  | { type: 'error'; code: string; message: string; recoverable: boolean }

export interface StoredRoomConfig extends CreateRoomRequest {
  roomCode: string
  createdAt: number
}

export function parseClientMessage(value: unknown): ClientMessage | null {
  const parsed = clientMessageSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseWireMessage(value: string): ClientMessage | null {
  try {
    return parseClientMessage(JSON.parse(value))
  } catch {
    return null
  }
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message)
}

export type { PalType }
