import { z } from 'zod'
import type { RicochetParty, Seat } from '@pongapp/game-core/ricochet'

export const RICOCHET_PROTOCOL = 1
const meta = { revision: z.number().int().min(0).max(100000000), requestId: z.number().int().min(1).max(1000000000) }
const reflector = z.object({ x: z.number().min(0).max(360), y: z.number().min(0).max(440), angle: z.number().min(-180).max(180), mode: z.enum(['mirror', 'split', 'focus']) }).strict()
export const ricochetClientSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), version: z.literal(RICOCHET_PROTOCOL), token: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal('aim'), ...meta, aim: z.number().min(-160).max(-20), payload: z.enum(['plain', 'burst', 'pierce']) }).strict(),
  z.object({ type: z.literal('reflector'), ...meta, reflector }).strict(),
  ...(['ready', 'launch', 'swap-jobs', 'next', 'retry'] as const).map(type => z.object({ type: z.literal(type), ...meta }).strict()),
  z.object({ type: z.literal('ping') }).strict(),
])
export type RicochetClientMessage = z.infer<typeof ricochetClientSchema>
export type RicochetPresence = [boolean, boolean]
export type RicochetError = 'full' | 'expired' | 'invalid' | 'stale' | 'wrong-job' | 'busy' | 'not-ready' | 'partner-away' | 'unavailable' | 'replaced'
export type RicochetServerMessage =
  | { type: 'welcome'; version: 1; token: string; seat: Seat; party: RicochetParty; presence: RicochetPresence; serverAt: number }
  | { type: 'state'; party: RicochetParty; presence: RicochetPresence; serverAt: number; ack?: { seat: Seat; requestId: number } }
  | { type: 'error'; code: RicochetError; requestId?: number; fatal?: boolean }
  | { type: 'pong'; serverAt: number }
export function parseRicochetClient(raw: string): RicochetClientMessage | null {
  if (raw.length > 2048) return null
  try { const result = ricochetClientSchema.safeParse(JSON.parse(raw)); return result.success ? result.data : null } catch { return null }
}
