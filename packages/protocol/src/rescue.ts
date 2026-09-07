import { decodeRescueSave, validRescueAction, validRescueInput, type RescueAction, type RescueInput, type RescueState, type RescueWorld, type BiomeId } from '@pongapp/game-core'

export const RESCUE_PROTOCOL_VERSION = 1 as const
export interface RescueRoomRequest { name: string; guestId: string; biome: BiomeId; seed: number; voyageKey?: string; save?: string; story?: boolean }
export type RescueClientMessage =
  | { type: 'hello'; version: typeof RESCUE_PROTOCOL_VERSION; guestId: string; name: string; token?: string }
  | { type: 'input'; epoch: number; input: RescueInput }
  | { type: 'rematch'; epoch: number; next: boolean }
  | { type: 'action'; epoch: number; action: RescueAction }
  | { type: 'ping'; at: number }
export interface RescuePresence { id: string; name: string; connected: boolean; pet: boolean }
export interface RescueFrame {
  type: 'frame'; state: Omit<RescueState, 'world' | 'voyage' | 'docks'>; world: Pick<RescueWorld, 'cages' | 'gifts'> & { fog?: number[] }
  acks: Record<string, number>; presence: RescuePresence[]; started: boolean
}
export type RescueServerMessage =
  | { type: 'welcome'; version: typeof RESCUE_PROTOCOL_VERSION; playerId: string; token: string; code: string; state: RescueState; presence: RescuePresence[]; started: boolean }
  | RescueFrame
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; at: number; serverAt: number }

const text = (v: unknown, min: number, max: number) => typeof v === 'string' && v.length >= min && v.length <= max && !/[\u0000-\u001f<>]/.test(v)
export function parseRescueRoomRequest(v: unknown): RescueRoomRequest | null {
  if (!v || typeof v !== 'object') return null
  const r = v as RescueRoomRequest
  if (!text(r.name, 1, 16) || !text(r.guestId, 8, 80) || ![0, 1, 2].includes(r.biome) || !Number.isInteger(r.seed) || r.seed < 0 || r.seed > 0xffffffff || (r.voyageKey !== undefined && !/^ark-v1:[0-4]:[0-7]$/.test(r.voyageKey))) return null
  if (r.save !== undefined && (typeof r.save !== 'string' || !decodeRescueSave(r.save))) return null
  if (r.story !== undefined && typeof r.story !== 'boolean') return null
  return { name: r.name.trim() || 'Explorer', guestId: r.guestId, biome: r.biome, seed: r.seed, ...(r.voyageKey ? { voyageKey: r.voyageKey } : {}), ...(r.save ? { save: r.save } : {}), ...(r.story !== undefined ? { story: r.story } : {}) }
}
export function parseRescueClientMessage(raw: string): RescueClientMessage | null {
  if (raw.length > 2048) return null
  let v: RescueClientMessage
  try { v = JSON.parse(raw) as RescueClientMessage } catch { return null }
  if (!v || typeof v !== 'object') return null
  if (v.type === 'hello' && v.version === RESCUE_PROTOCOL_VERSION && text(v.guestId, 8, 80) && text(v.name, 1, 16) && (v.token === undefined || text(v.token, 16, 160))) return v
  if (v.type === 'input' && Number.isSafeInteger(v.epoch) && v.epoch > 0 && validRescueInput(v.input)) return v
  if (v.type === 'rematch' && Number.isSafeInteger(v.epoch) && v.epoch > 0 && typeof v.next === 'boolean') return v
  if (v.type === 'action' && Number.isSafeInteger(v.epoch) && v.epoch > 0 && validRescueAction(v.action)) return v
  if (v.type === 'ping' && Number.isFinite(v.at) && v.at >= 0) return v
  return null
}
/** Round wire coordinates only. Authoritative physics keeps its full precision. */
export const encodeRescueMessage = (message: RescueServerMessage) => JSON.stringify(message, (_key, value: unknown) => typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 10000) / 10000 : value)
export function rescueFrame(state: RescueState, acks: Record<string, number>, presence: RescuePresence[], started: boolean, fog = false): RescueFrame {
  const { world, voyage: _voyage, docks: _docks, ...dynamic } = state
  return { type: 'frame', state: dynamic, world: { cages: world.cages, gifts: world.gifts, ...(fog ? { fog: world.fog } : {}) }, acks, presence, started }
}
export function mergeRescueFrame(previous: RescueState, frame: RescueFrame): RescueState {
  return { ...frame.state, voyage: previous.voyage, docks: previous.docks, world: { ...previous.world, ...frame.world, fog: frame.world.fog ?? previous.world.fog } }
}
