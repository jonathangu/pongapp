/** Experimental, isolated from every previous game/save/protocol. */
export type Point = { x: number; y: number }
export type Payload = 'plain' | 'burst' | 'pierce'
export type Lens = 'mirror' | 'split' | 'focus'
export type Seat = 0 | 1
export type Reflector = Point & { angle: number; mode: Lens }
export type ShotSetup = { aim: number; payload: Payload; reflector: Reflector }
export type RescueTarget = Point & { id: number; kind: 'bunny' | 'bird' | 'otter' }
export type Reef = { a: Point; b: Point }
export type RicochetScene = {
  title: string; subtitle: string; color: string
  targets: RescueTarget[]; reefs: Reef[]
  area: { left: number; right: number; top: number; bottom: number }
  reflector: Reflector; aim: number
}
export type RicochetGame = {
  version: 1; scene: number; shots: number; learned: number
  rescued: number[]; setup: ShotSetup
}
export type FlightSegment = {
  orb: number; from: Point; to: Point; start: number; end: number
  payload: Payload; transformed: boolean; size: number; bounces: number
}
export type ShotEvent = Point & {
  at: number; kind: 'launch' | 'bounce' | 'split' | 'focus' | 'burst' | 'rescue'
  size: number; orb: number; target?: number
}
export type RicochetShot = {
  segments: FlightSegment[]; events: ShotEvent[]; duration: number
  rescued: number[]; combo: string | null; transformed: boolean
}
export type ShotPlayback = { id: number; startedAt: number; before: number[]; shot: RicochetShot }
export type RicochetParty = {
  game: RicochetGame; revision: number; launcher: Seat; ready: boolean
  /** Independent-job edits may merge, but edits from an older shot/role layout may not. */
  layoutRevision: number; editedAt: [number, number]
  busyUntil: number; playback: ShotPlayback | null
}
export type RicochetAction =
  | { kind: 'aim'; aim: number; payload: Payload }
  | { kind: 'reflector'; reflector: Reflector }
  | { kind: 'ready' | 'launch' | 'swap-jobs' | 'next' | 'retry' }
export type RicochetCommand = RicochetAction & { revision: number }
export type RicochetResult = {
  accepted: boolean; party: RicochetParty
  reason?: 'stale' | 'wrong-job' | 'busy' | 'not-ready' | 'partner-away' | 'invalid' | 'unavailable'
}
