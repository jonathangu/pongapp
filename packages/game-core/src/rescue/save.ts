import { createRescueGame } from './factory'
import { RESCUE_RULESET, RESCUE_CREW_COLORS, type RescueState } from './types'
import { isRescueStation, RESCUE_STATIONS, RESCUE_LADDERS } from './interior'
import { RESCUE_NAV } from './navigation'
import { rescueMapReachable } from './world'
import { validateMonster, validVoyageKey } from '../bestiary'
import { validRescueStory } from './story'
import { prepareSoloCrossing } from './solo'

export const RESCUE_SAVE_VERSION = 1
export const RESCUE_SAVE_MAX_BYTES = 512_000
type Check = (v: unknown) => boolean
const num = (lo = -10000, hi = 10000, integer = false): Check => v => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && (!integer || Number.isInteger(v))
const text = (max = 80): Check => v => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f<>]/.test(v)
const bool: Check = v => typeof v === 'boolean'
const one = (...values: unknown[]): Check => v => values.includes(v)
const nullable = (check: Check): Check => v => v === null || check(v)
const array = (check: Check, max: number, min = 0): Check => v => Array.isArray(v) && v.length >= min && v.length <= max && v.every(check)
const record = (fields: Record<string, Check>): Check => v => Boolean(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every(k => Object.hasOwn(fields, k)) && Object.entries(fields).every(([k, check]) => check((v as Record<string, unknown>)[k])))
const optional = (check: Check): Check => v => v === undefined || check(v)
const id = num(0, 1e9, true), time = num(0, 1e8), counter = num(0, 1e9, true), seq = num(-1, Number.MAX_SAFE_INTEGER - 1, true)
const xy = { x: num(-100, 100), y: num(-100, 100) }, velocity = { vx: num(-100, 100), vy: num(-100, 100) }
const gemKind = one('power', 'beam', 'metal'), ability = one('none', 'pilot', 'medic', 'prism', 'spark', 'scout')
const stationId: Check = isRescueStation
const crew = record({ ...xy, ...velocity, id: text(), name: text(16), color: one(...RESCUE_CREW_COLORS), pet: bool, origin: one('human', 'companion', 'recruit'), ability, abilityCooldown: time, tourEnds: counter,
  grounded: bool, ladder: nullable(one(...RESCUE_LADDERS.map(l => l.id))), facing: one(-1, 1), seat: nullable(stationId), gem: nullable(id), coyote: time, jumpBuffer: time, dropTime: time,
  lastButtons: num(0, 31, true), lastSeq: seq, commandSeq: seq, step: time, order: stationId, route: array(num(0, RESCUE_NAV.nodes.length - 1, true), 128), routeAt: num(0, 128, true), routeAge: time, routeLastX: num(), routeLastY: num() })
const station = record({ id: stationId, angle: num(-Math.PI - .01, Math.PI + .01), cooldown: time, charge: num(0, 1), heat: num(0, 2), upgrade: nullable(gemKind), operated: bool, firing: bool, lingering: time, flailAngle: num(-Math.PI - .01, Math.PI + .01), flailSpeed: num(-12, 12) })
const ship = record({ ...xy, ...velocity, angle: one(0), angularVelocity: one(0), hp: num(0, 30), maxHp: num(1, 30), invulnerable: time, thrust: num(0, 1), hitAngle: num(-Math.PI - .01, Math.PI + .01), shieldHits: counter })
const stations = array(station, RESCUE_STATIONS.length, RESCUE_STATIONS.length)
const world = record({ width: one(112), height: one(104), title: text(80), portal: record(xy), fog: array(one(0, 1), 700, 700),
  obstacles: array(record({ ...xy, id, radius: num(.1, 6), style: num(0, 3, true) }), 28),
  cages: array(record({ ...xy, id, hp: num(0, 35), open: bool, rescued: bool, pet: num(0, 4, true) }), 5),
  gifts: array(record({ ...xy, id, kind: gemKind, opened: bool }), 3, 3) })
const stateCheck = record({ rulesetVersion: one(RESCUE_RULESET), tick: counter, time, seed: num(0, 0xffffffff, true), initialSeed: num(0, 0xffffffff, true), epoch: num(1, 1e9, true),
  biome: one(0, 1, 2), phase: one('playing', 'won', 'lost'), solo: bool, paused: bool, ship, crew: array(crew, 16, 1), stations, world,
  enemies: array(record({ ...xy, ...velocity, id, kind: one('moth', 'beetle', 'jelly', 'needle', 'sentinel', 'guardian'), hp: num(-1000, 1000), maxHp: num(1, 1000), radius: num(.1, 5), angle: num(), age: time, phase: one('stalk', 'tell', 'attack', 'recover'), phaseTime: time, targetX: num(), targetY: num(), cooldown: num(-1e8, 1e8), variant: num(0, 3, true) }), 12),
  bullets: array(record({ ...xy, ...velocity, id, radius: num(0, 1), damage: num(0, 300), life: num(0, 10), owner: nullable(text()), enemy: bool, kind: one('bolt', 'needle', 'orb'), pierce: num(-1, 30, true), hit: array(id, 64) }), 160),
  gems: array(record({ ...xy, ...velocity, id, kind: gemKind, heldBy: nullable(text()), socket: nullable(stationId), thrown: bool }), 16),
  events: array(record({ ...xy, id, kind: text(), angle: num(), size: num(0, 100), value: num(), color: optional(gemKind), actor: optional(text()) }), 80),
  nextId: num(1000, 1e9, true), nextWave: time, guardianSpawned: bool, guardianDefeated: bool, extraction: time,
  stats: record({ shots: counter, blocks: counter, damage: num(0, 1e9), rescues: num(0, 5, true), sockets: counter, travel: num(0, 1e9), kills: counter }),
  inspiration: v => typeof v === 'string' && v.length <= 80,
  voyage: nullable(record({ key: validVoyageKey, title: text(60), source: one('builtin', 'generated'), monsters: array(v => Boolean(validateMonster(v)), 4, 4), model: optional(text(100)), generatedAt: optional(text(100)), latencyMs: optional(num(0, 1e8)) })),
  campaign: record({ salvage: num(0, 1e8, true), upgrades: record({ hull: num(0, 3, true), drive: num(0, 3, true), reactor: num(0, 3, true), tractor: num(0, 3, true) }), completed: array(one(0, 1, 2), 3), voyages: counter, portVisits: counter,
    alumni: array(record({ id: text(), name: text(16), color: one(...RESCUE_CREW_COLORS), ability, availableAt: counter, reunions: counter }), 64) }),
  vessels: array(record({ id, name: text(40), role: one('ally', 'merchant', 'raider'), ship, crew: array(crew, 8, 1), stations, targetX: num(), targetY: num(), visited: bool, cooldown: time, disabled: bool }), 3),
  region: one('sea', 'sky', 'space', 'jungle'), docks: array(record({ ...xy, id: text(), name: text(40), kind: one('town', 'city', 'island', 'launch'), destination: nullable(one('sea', 'sky', 'space', 'jungle')) }), 4, 2), docked: nullable(text()),
  meal: record({ remaining: num(0, 100), progress: num(0, 3), cooldown: num(0, 65) }),
  weather: record({ phase: one('clear', 'building', 'storm', 'eye'), intensity: num(0, 1), nextStrike: time, strike: nullable(record({ ...xy, at: time })), wave: time, flash: num(0, 1) }),
  story: optional(nullable(validRescueStory)),
  captainMode: optional(bool),
  seamanship: optional(record({ step: num(0, 5, true), difficulty: one('gentle', 'adventure', 'tempest'), travelStart: num(0, 1e9) })),
  littleWing: optional(record({ remaining: num(0, 6), cooldown: num(0, 75), arrivals: counter })),
  odyssey: optional(record({ stage: one('sky', 'gate', 'inner'), pending: nullable(one('launch', 'flare', 'gate', 'dragon', 'unwritten')), history: array(one('launch', 'flare', 'gate', 'dragon', 'unwritten'), 5), pulse: bool })),
})
const unique = (values: unknown[]) => new Set(values).size === values.length
export function validRescueSaveState(value: unknown): value is RescueState {
  if (!stateCheck(value)) return false
  const s = value as RescueState
  if (s.world.cages.length !== (s.odyssey ? 0 : 5)) return false
  if (s.odyssey && (!s.story || !unique(s.odyssey.history) || s.odyssey.pending && s.odyssey.history.includes(s.odyssey.pending) || s.odyssey.stage !== 'sky' && !s.odyssey.pulse)) return false
  if (s.story && (!s.crew.some(c => c.id === s.story!.motherId) || !s.crew.some(c => c.id === s.story!.sonId))) return false
  if (!unique(s.crew.map(c => c.id)) || !unique(s.stations.map(v => v.id)) || s.ship.hp > s.ship.maxHp || s.ship.maxHp !== 12 + s.campaign.upgrades.hull * 3) return false
  if (!unique(s.crew.filter(c => c.seat).map(c => c.seat)) || s.crew.filter(c => c.origin === 'human').length > 8) return false
  if (s.crew.some(c => Math.abs(c.x) > 4.7 || c.y < -3.5 || c.y > 4.3)) return false
  if (s.gems.some(g => g.heldBy !== null && !s.crew.some(c => c.id === g.heldBy && c.gem === g.id) || g.socket !== null && !s.stations.some(v => v.id === g.socket && v.upgrade === g.kind))) return false
  if (s.crew.some(c => c.gem !== null && !s.gems.some(g => g.id === c.gem && g.heldBy === c.id))) return false
  if (!unique(s.gems.filter(g => g.socket).map(g => g.socket))) return false
  const ids = [...s.world.obstacles, ...s.world.cages, ...s.world.gifts, ...s.enemies, ...s.bullets, ...s.gems, ...s.vessels].map(v => v.id)
  if (!unique(ids) || ids.some(v => v >= s.nextId)) return false
  if (s.docked !== null && !s.docks.some(d => d.id === s.docked)) return false
  return rescueMapReachable(s.world)
}
/** Private unranked campaign data only: no network identities, tokens, account or executable content. */
export function encodeRescueSave(state: RescueState): string {
  const copy = structuredClone(state)
  copy.events = []; copy.paused = false
  for (const c of copy.crew) { c.lastButtons = 0; c.lastSeq = -1; c.commandSeq = -1; c.route = []; c.routeAt = 0 }
  if (!validRescueSaveState(copy)) throw new Error('The current voyage could not be safely saved.')
  return JSON.stringify({ format: 'starling-rescue', version: RESCUE_SAVE_VERSION, state: copy })
}
export function decodeRescueSave(raw: string): RescueState | null {
  if (raw.length > RESCUE_SAVE_MAX_BYTES) return null
  try {
    const v = JSON.parse(raw) as { format?: unknown; version?: unknown; state?: unknown }
    if (v?.format !== 'starling-rescue' || v.version !== RESCUE_SAVE_VERSION || !validRescueSaveState(v.state)) return null
    const s = v.state; s.events = []; s.paused = false
    return s
  } catch { return null }
}
export function resumeRescueSolo(s: RescueState): RescueState {
  const copy = structuredClone(s), captain = copy.crew.find(c => c.origin === 'human')
  if (!captain) return createRescueGame()
  for (const c of copy.crew) { c.pet = c.id !== captain.id; c.lastButtons = 0; c.lastSeq = -1; c.commandSeq = -1 }
  copy.solo = true; copy.paused = false; copy.epoch++; copy.events = []
  prepareSoloCrossing(copy)
  return copy
}
