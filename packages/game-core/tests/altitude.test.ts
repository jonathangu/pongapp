import { describe,expect,it } from 'vitest'
import { ALTITUDE_EVENTS,BOSS_ENCOUNTERS,advanceAltitude,advanceCoopGame,bossWarning,combatDistance,createCoopGame,flightAltitude,ORBIT_LAP,restartCoopGame,type CoopGameState,type RiverObject } from '../src'
const start=()=>{const s=createCoopGame([{id:'a',name:'A'},{id:'b',name:'B'}],73);s.phase='playing';s.tick=180;s.countdownTicks=0;s.objects=[];s.invulnerableTicks=10000;return s}
const hold=(peak:number)=>({kind:'rise' as const,tick:200,duration:600,peak})
const predator=(id:number,altitude=0):RiverObject=>({id,type:'predator',enemy:'ambusher',x:.5,y:.4,radius:.04,phase:0,drift:0,age:0,hp:4,maxHp:4,altitude,flight:altitude?hold(altitude):null})
const step=(s:CoopGameState,n:number)=>{for(let i=0;i<n;i++)advanceCoopGame(s,{})}

describe('temporary radial altitude and sky encounters',()=>{
  it('eases every trajectory back to exact sea level with finite bounded motion',()=>{
    for(const kind of ['drop','rise','updraft','jetstream','boss-wave'] as const){
      const body={altitude:kind==='drop'?7:0,flight:{kind,tick:0,duration:180,peak:7} as CoopGameState['boat']['flight']}
      let last=body.altitude,maxStep=0
      for(let i=0;i<180;i++){advanceAltitude(body);maxStep=Math.max(maxStep,Math.abs(body.altitude-last));expect(body.altitude).toBeGreaterThanOrEqual(0);expect(body.altitude).toBeLessThanOrEqual(7);last=body.altitude}
      expect(body.altitude).toBe(0);expect(body.flight).toBeNull();expect(maxStep).toBeLessThan(.3)
    }
    expect(flightAltitude({kind:'drop',tick:0,duration:100,peak:9})).toBe(9)
  })
  it('keeps ordinary play at sea level and limits special airtime to three short events',()=>{
    expect(ALTITUDE_EVENTS.reduce((sum,e)=>sum+e.duration,0)).toBeLessThan(7200*.25)
    const s=start(),seen=new Set<string>()
    for(let i=0;i<7200;i++){
      s.objects=[];advanceCoopGame(s,{})
      if(i<ALTITUDE_EVENTS[0]!.at-1)expect(s.boat.altitude).toBe(0)
      if(s.boat.flight)seen.add(s.boat.flight.kind)
      expect(s.boat.altitude).toBeLessThanOrEqual(5)
    }
    expect([...seen]).toEqual(['updraft','jetstream','boss-wave']);expect(s.crew.altitudeEventIndex).toBe(3);expect(s.boat.altitude).toBe(0)
    expect(restartCoopGame(s).boat).toMatchObject({altitude:0,flight:null})
  })
  it('separates ground and airborne collisions and pickups',()=>{
    for(const type of ['rock','rescue'] as const){
      const s=start();s.invulnerableTicks=0;s.boat.altitude=6;s.boat.flight=hold(6)
      const object:RiverObject={id:900,type,x:.5,y:.755,radius:.04,phase:0,drift:0}
      s.objects=[object];advanceCoopGame(s,{})
      expect(s.hearts).toBe(3);expect(s.rescued).toBe(0)
      s.objects=[{...object,y:.755,altitude:6,flight:hold(6)}];advanceCoopGame(s,{})
      if(type==='rock')expect(s.hearts).toBe(2);else expect(s.rescued).toBe(1)
    }
    expect(combatDistance(.02,.5,4,ORBIT_LAP-.02,.5,4)).toBeCloseTo(.04)
  })
  it('automatically homes upward from the sea and downward while airborne',()=>{
    for(const airborne of [false,true]){
      const s=start();if(airborne){s.boat.altitude=6;s.boat.flight=hold(6)}
      s.objects=[predator(900,airborne?0:6)]
      advanceCoopGame(s,{a:{paddle:0,shootTap:true}})
      expect(s.crew.shots[0]!.targetId).toBe(900)
      expect(s.crew.shots[0]!.vAltitude*(airborne?-1:1)).toBeGreaterThan(0)
      for(let i=0;i<85&&s.crew.kills===0;i++)advanceCoopGame(s,{})
      expect(s.crew.kills).toBeGreaterThanOrEqual(1)
      // Contact includes the enemy's radius, so a descending shell detonates just above its center.
      expect(s.crew.explosions.some(e=>airborne?e.altitude<1.5:e.altitude>5)).toBe(true)
    }
  })
  it('keeps aerial splash damage off enemies directly below it',()=>{
    const s=start();s.objects=[predator(900,6),predator(901)]
    advanceCoopGame(s,{a:{paddle:0,targetId:900,shootTap:true}})
    for(let i=0;i<85&&s.crew.kills===0;i++)advanceCoopGame(s,{})
    expect(s.objects.some(o=>o.id===900)).toBe(false);expect(s.objects.find(o=>o.id===901)?.hp).toBe(4)
  })
  it('announces both bosses before their descending entry and settles each entry',()=>{
    for(const [index,encounter] of BOSS_ENCOUNTERS.entries()){
      const s=start();s.crew.encounterIndex=index;s.crew.altitudeEventIndex=3;s.tick=180+encounter.at-181
      expect(bossWarning(s)).toBeNull();advanceCoopGame(s,{})
      expect(bossWarning(s)?.ticks).toBe(180);expect(s.events.some(e=>e.type==='crew'&&e.message.includes('APPROACHING'))).toBe(true)
      step(s,180);expect(bossWarning(s)).toBeNull()
      const boss=s.objects.find(o=>o.bossKind===encounter.kind)!
      expect(boss.altitude).toBeGreaterThan(6);expect(boss.flight?.kind).toBe('drop')
      step(s,149);expect(boss.altitude).toBe(0);expect(boss.flight).toBeNull()
    }
  })
  it('rewards a sentinel once without granting guardian victory, then requires the final boss',()=>{
    const s=start();s.rescued=3;s.crew.encounterIndex=1;s.objects=[{...predator(900),enemy:'boss',bossKind:'sentinel',hp:0}]
    const score=s.score,scrap=s.crew.scrap;advanceCoopGame(s,{})
    expect(s.score-score).toBe(450);expect(s.crew.scrap-scrap).toBe(4);expect(s.crew.bossesDefeated).toBe(1);expect(s.crew.bossDefeated).toBe(false);expect(s.crew.victory).toBe(false)
    step(s,1);expect(s.score-score).toBe(450)
    s.boat.altitude=5;s.boat.flight=hold(5);s.objects=[{...predator(901),enemy:'boss',bossKind:'guardian',hp:0}];advanceCoopGame(s,{})
    expect(s.crew.victory).toBe(true);expect(s.boat.altitude).toBe(0);expect(s.boat.flight).toBeNull()
  })
  it('spawns actual rising and falling objects, with no persistent height after a flight',()=>{
    const s=start();let dropped=false,risen=false
    for(let i=0;i<1000;i++){advanceCoopGame(s,{});for(const o of s.objects){dropped ||= o.flight?.kind==='drop';risen ||= o.flight?.kind==='rise';if(!o.flight)expect(o.altitude??0).toBe(0)}}
    expect(dropped).toBe(true);expect(risen).toBe(true)
  })
})
