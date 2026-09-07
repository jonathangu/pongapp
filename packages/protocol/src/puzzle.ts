import { z } from 'zod'
import type { MatchGame, MatchParty, MatchRole } from '@pongapp/game-core'

export const PUZZLE_PROTOCOL = 1
const revision = z.number().int().min(0).max(100000000)
export const puzzleClientSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), version: z.literal(PUZZLE_PROTOCOL), token: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal('swap'), revision, a: z.number().int().min(0).max(35), b: z.number().int().min(0).max(35) }).strict(),
  z.object({ type: z.literal('next'), revision }).strict(),
  z.object({ type: z.literal('more'), revision }).strict(),
  z.object({ type: z.literal('ping') }).strict(),
])
export type PuzzleClientMessage = z.infer<typeof puzzleClientSchema>
export type PuzzlePresence = [boolean, boolean]
export type PuzzleServerMessage =
  | { type: 'welcome'; version: 1; token: string; role: MatchRole; party: MatchParty; presence: PuzzlePresence }
  | { type: 'state'; party: MatchParty; presence: PuzzlePresence; move?: { before: MatchGame; a: number; b: number; role: MatchRole; teamwork: boolean } }
  | { type: 'presence'; presence: PuzzlePresence }
  | { type: 'error'; code: 'full' | 'expired' | 'invalid' | 'stale' | 'unavailable' | 'replaced' }
  | { type: 'pong' }
export function parsePuzzleClient(raw: string): PuzzleClientMessage | null {
  if (raw.length > 2048) return null
  try { const result = puzzleClientSchema.safeParse(JSON.parse(raw)); return result.success ? result.data : null } catch { return null }
}
