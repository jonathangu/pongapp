import type { CoopGameState, VersusGameState } from '@pongapp/game-core'
import { z } from 'zod'

export const PROTOCOL_VERSION = 7 as const

export const createRoomRequestSchema = z.object({
  hostName: z.string().trim().min(2).max(16),
  roomName: z.string().trim().min(2).max(32).optional(),
  mode: z.enum(['coop', 'versus']).default('coop'),
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
    clientSessionId: z.string().uuid().optional(),
    reconnectAttempt: z.number().int().min(0).max(10).optional(),
  }),
  z.object({
    type: z.literal('input'),
    seq: z.number().int().nonnegative(),
    paddle: z.number().min(0).max(1),
    controlActive: z.boolean().optional(),
  }),
  z.object({ type: z.literal('emote'), emote: z.enum(['gg', 'wow', 'nice', 'oops']) }),
  z.object({ type: z.literal('rematch') }),
  z.object({ type: z.literal('peerSignal'), targetId: z.string().uuid(), data: z.string().max(60000) }).strict(),
  z.object({ type: z.literal('ping'), sentAt: z.number() }),
  z.object({
    type: z.literal('clientTelemetry'),
    event: z.enum(['control_surface_visible', 'room_full_visible', 'network_sample', 'performance_sample']),
    latencyMs: z.number().int().min(0).max(60_000).optional(),
    latencyP95Ms: z.number().int().min(0).max(60_000).optional(),
    jitterMs: z.number().int().min(0).max(60_000).optional(),
    snapshotGapP95Ms: z.number().int().min(0).max(60_000).nullable().optional(),
    connectionQuality: z.enum(['good', 'fair', 'poor']).optional(),
    frameGapP95Ms: z.number().int().min(0).max(60_000).optional(),
    maxFrameGapMs: z.number().int().min(0).max(60_000).optional(),
    renderP95Ms: z.number().int().min(0).max(60_000).optional(),
    longFrameCount: z.number().int().min(0).max(100_000).optional(),
    freezeCount: z.number().int().min(0).max(100_000).optional(),
    rendererResolution: z.number().min(0.5).max(4).optional(),
    renderQuality: z.enum(['full', 'adaptive']).optional(),
  }).strict(),
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
  supportTraceId: string
  participants: RoomParticipant[]
  phase: 'lobby' | 'countdown' | 'playing' | 'finished'
  mode: 'coop' | 'versus'
}

export type OnlineGameState = CoopGameState | VersusGameState

export type ServerMessage =
  | { type: 'peerSignal'; fromId: string; data: string }
  | {
      type: 'welcome'
      version: typeof PROTOCOL_VERSION
      clientId: string
      reconnectToken: string
      participant: RoomParticipant
      lobby: RoomLobby
    }
  | { type: 'lobby'; lobby: RoomLobby }
  | { type: 'snapshot'; serverTick: number; acknowledgedSeq: number; state: OnlineGameState }
  | { type: 'event'; event: OnlineGameState['events'][number] }
  | { type: 'emote'; playerId: string; emote: 'gg' | 'wow' | 'nice' | 'oops' }
  | { type: 'result'; state: OnlineGameState }
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
