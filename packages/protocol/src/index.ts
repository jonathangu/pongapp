import type { AbilityId, AiDifficulty, GameMode, GameState, ItemIntensity, MatchConfig } from '@pongapp/game-core'
import { z } from 'zod'

export const PROTOCOL_VERSION = 1 as const

const abilitySchema = z.enum(['dash', 'bend', 'guard', 'pulse'])
const modeSchema = z.enum(['duel', 'arena', 'crosscourt'])
const itemIntensitySchema = z.enum(['off', 'standard', 'wild'])
const aiDifficultySchema = z.enum(['rookie', 'rally', 'pro', 'ace'])

export const createRoomRequestSchema = z.object({
  mode: modeSchema,
  itemIntensity: itemIntensitySchema,
  aiDifficulty: aiDifficultySchema,
  aiSlots: z.number().int().min(0).max(3),
  hostName: z.string().trim().min(2).max(16),
  hostAbility: abilitySchema,
})

export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    version: z.literal(PROTOCOL_VERSION),
    guestId: z.string().min(8).max(80),
    displayName: z.string().trim().min(2).max(16),
    ability: abilitySchema,
    role: z.enum(['player', 'spectator']).default('player'),
    reconnectToken: z.string().min(16).max(200).optional(),
    accessToken: z.string().min(20).max(4096).optional(),
  }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  z.object({
    type: z.literal('input'),
    seq: z.number().int().nonnegative(),
    target: z.number().min(0).max(1),
    abilityPressed: z.boolean(),
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
  ability: AbilityId
  slot: number | null
  isHost: boolean
  isAi: boolean
  isReady: boolean
  connected: boolean
}

export interface RoomLobby {
  roomCode: string
  mode: GameMode
  itemIntensity: ItemIntensity
  aiDifficulty: AiDifficulty
  aiSlots: number
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
  matchConfig?: MatchConfig
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
