import { orbitDelta } from './orbit'
import type { AltitudeFlight, CoopGameState, RiverObject } from './coop'

/** Radial world height, independent of the cylinder's along-route coordinate. */
export const ALTITUDE_SCALE = 14
export const ALTITUDE_EVENTS = [
  { at:18*60, duration:420, peak:4.2, kind:'updraft' },
  { at:62*60, duration:420, peak:5, kind:'jetstream' },
  { at:96*60, duration:480, peak:4.8, kind:'boss-wave' },
] as const
export const BOSS_ENCOUNTERS = [
  { at:42*60, kind:'sentinel', name:'SKY SENTINEL', hp:110, reward:450, salvage:4 },
  { at:96*60, kind:'guardian', name:'STAR DEVOURER', hp:240, reward:1000, salvage:6 },
] as const
const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t)}
export function flightAltitude(flight:AltitudeFlight):number{
  const p=Math.max(0,Math.min(1,flight.tick/flight.duration))
  if(p>=1)return 0
  if(flight.kind==='drop')return flight.peak*(1-smooth(p))
  return flight.peak*smooth(p/.24)*(1-smooth((p-.66)/.34))
}
export const objectAltitude=(object:RiverObject):number=>Math.max(0,object.altitude??0)
export const combatDistance=(ax:number,ay:number,az:number,bx:number,by:number,bz:number):number=>Math.hypot(orbitDelta(ax,bx),ay-by,(az-bz)/ALTITUDE_SCALE)
export function advanceAltitude(body:{altitude?:number;flight?:AltitudeFlight|null}):void{
  if(!body.flight){body.altitude=0;return}
  body.flight.tick++;body.altitude=flightAltitude(body.flight)
  if(body.flight.tick>=body.flight.duration){body.flight=null;body.altitude=0}
}
export function bossWarning(state:CoopGameState){
  if(state.phase!=='playing')return null
  const elapsed=state.tick-180,next=BOSS_ENCOUNTERS[state.crew.encounterIndex]
  return next&&elapsed>=next.at-180&&elapsed<next.at?{...next,ticks:next.at-elapsed}:null
}
