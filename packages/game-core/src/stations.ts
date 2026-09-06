import type { CoopPlayer, CrewStation } from './coop'

/** Local deck coordinates are shared by simulation, Blender layout and UI picking. */
export const CREW_ROOMS = [
  { id:'left', name:'Port helm', verb:'Turn left', x:-1.7, z:0, color:'#73d4d0', icon:'←' },
  { id:'right', name:'Starboard helm', verb:'Turn right', x:1.7, z:0, color:'#a4bfff', icon:'→' },
  { id:'shoot', name:'Cannon room', verb:'Auto-aim fire', x:0, z:-1.85, color:'#ffd184', icon:'◎' },
  { id:'recover', name:'Engine room', verb:'Repair hull', x:0, z:1.85, color:'#f4a5a2', icon:'+' },
] as const
export const CREW_WALK_SPEED = .055
export const roomFor = (station:CrewStation) => CREW_ROOMS.find(r=>r.id===station)!
export const isCrewStation = (station:unknown):station is CrewStation => CREW_ROOMS.some(r=>r.id===station)

export function assignStation(player:CoopPlayer,station:CrewStation):boolean {
  if(!isCrewStation(station)||player.station===station)return false
  player.station=station;player.deck.viaCenter=true;player.deck.moving=true;player.deck.workTicks=0
  return true
}

/** Walk through the open central crossing. No station performs work in transit. */
export function advanceCrewMember(player:CoopPlayer):void {
  const deck=player.deck
  if(!player.station){deck.moving=false;deck.workTicks=0;return}
  const room=roomFor(player.station)
  let distanceLeft=CREW_WALK_SPEED
  // At most two legs: current room -> crossing -> destination room.
  for(let leg=0;leg<2;leg++){
    const tx=deck.viaCenter?0:room.x,tz=deck.viaCenter?0:room.z
    const dx=tx-deck.x,dz=tz-deck.z,distance=Math.hypot(dx,dz)
    if(distance>.00001){
      const move=Math.min(distance,distanceLeft)
      deck.x+=dx/distance*move;deck.z+=dz/distance*move
      deck.heading=Math.atan2(-dx,-dz);deck.step+=move;distanceLeft-=move
    }
    if(Math.hypot(tx-deck.x,tz-deck.z)>.00001)break
    deck.x=tx;deck.z=tz
    if(deck.viaCenter){deck.viaCenter=false;if(distanceLeft>0)continue}
    break
  }
  deck.moving=deck.viaCenter||Math.hypot(deck.x-room.x,deck.z-room.z)>.00001
  deck.workTicks=deck.moving?0:deck.workTicks+1
  if(!deck.moving)deck.heading=player.station==='left'?Math.PI/2:player.station==='right'?-Math.PI/2:player.station==='recover'?Math.PI:0
}

export const operatingStation = (player:CoopPlayer):CrewStation|null => player.station&&!player.deck.moving?player.station:null

export function stationTravelTicks(player:CoopPlayer,station:CrewStation):number {
  const room=roomFor(station)
  return Math.ceil((Math.hypot(player.deck.x,player.deck.z)+Math.hypot(room.x,room.z))/CREW_WALK_SPEED)
}
