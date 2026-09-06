import { describe, expect, it } from 'vitest'
import { advanceCoopGame, createCoopGame, expeditionWorld, ORBIT_LAP, orbitDelta, RECOVERY_WORK, assignStation, advanceCrewMember, operatingStation, type CoopGameState, type RiverObject, type CrewStation } from '../src'
function start(seed=42){const s=createCoopGame([{id:'a',name:'A'},{id:'b',name:'B'}],seed);for(let t=0;t<180;t++)advanceCoopGame(s,{});s.objects=[];return s}
const step=(s:CoopGameState,n:number)=>{for(let t=0;t<n;t++)advanceCoopGame(s,{})}
const arrive=(s:CoopGameState,id:string,station:CrewStation)=>{assignStation(s.players[id]!,station);for(let i=0;i<100;i++)advanceCrewMember(s.players[id]!)}
const enemy=(id=900,x=.5,y=.4):RiverObject=>({id,type:'predator',enemy:'ambusher',family:'crab',x,y,radius:.09,phase:0,drift:0,hp:90,maxHp:90,age:0,attackPhase:'stalk',attackTick:0})
const rock=(s:CoopGameState):RiverObject=>({id:999,type:'rock',x:s.boat.x,y:.755,radius:.04,phase:0,drift:0})

describe('four-room expedition ruleset11',()=>{
  it('starts with two idle crew and no unattended work',()=>{
    const s=start();expect(s.rulesetVersion).toBe(11);expect(Object.keys(s.players)).toHaveLength(2)
    step(s,30);expect(s.crew.shotsFired).toBe(0);expect(s.boat.x).toBe(.5)
  })
  it('runs before operating a persistent helm',()=>{
    const s=start();advanceCoopGame(s,{a:{paddle:0,station:'right'}})
    expect(s.boat.x).toBe(.5);expect(s.players.a!.deck.moving).toBe(true)
    step(s,20);expect(s.boat.x).toBe(.5)
    step(s,30);expect(operatingStation(s.players.a!)).toBe('right')
    const before=s.boat.x;step(s,50);expect(orbitDelta(s.boat.x,before)).toBeGreaterThan(.3)
  })
  it('cannot multitask or bypass travel with repeated taps or held levels',()=>{
    const s=start();s.hearts=2
    for(let i=0;i<25;i++)advanceCoopGame(s,{a:{paddle:0,station:'shoot',shootTap:true,recoverHeld:true,steer:1}})
    expect(s.crew.shotsFired).toBe(0);expect(s.crew.repair).toBe(0);expect(s.boat.x).toBe(.5)
    step(s,30);expect(s.crew.shotsFired).toBe(1)
    const fired=s.crew.shotsFired;advanceCoopGame(s,{a:{paddle:0,station:'recover'}});step(s,30)
    expect(s.crew.shotsFired).toBe(fired);expect(s.crew.repair).toBe(0);expect(s.players.a!.deck.moving).toBe(true)
  })
  it('redirects without teleportation and opposing helms cancel',()=>{
    const s=start();advanceCoopGame(s,{a:{paddle:0,station:'right'}});step(s,15)
    const before={...s.players.a!.deck};advanceCoopGame(s,{a:{paddle:0,station:'left'}})
    expect(Math.hypot(before.x-s.players.a!.deck.x,before.z-s.players.a!.deck.z)).toBeLessThanOrEqual(.056)
    arrive(s,'a','left');arrive(s,'b','right');s.boat.heading=0;s.boat.x=.5;step(s,60);expect(s.boat.x).toBe(.5)
  })
  it('makes full slow orbits without a seam jump',()=>{
    for(const direction of [-1,1]){
      const s=start();arrive(s,'a',direction<0?'left':'right');let traveled=0
      for(let i=0;i<1000;i++){s.objects=[];const before=s.boat.x;advanceCoopGame(s,{});const d=orbitDelta(s.boat.x,before);expect(d*direction).toBeGreaterThan(0);expect(Math.abs(d)).toBeLessThanOrEqual(.00801);traveled+=d;expect(s.boat.x).toBeGreaterThanOrEqual(0);expect(s.boat.x).toBeLessThan(ORBIT_LAP)}
      expect(traveled*direction).toBeGreaterThan(ORBIT_LAP)
    }
  })
  it('repairs in four/six seconds, saves work in transit and cannot overheal',()=>{
    for(const salvage of [0,3]){
      const s=start();s.hearts=2;s.crew.scrap=salvage;s.invulnerableTicks=10000;arrive(s,'a','recover')
      step(s,40);const saved=s.crew.repair;advanceCoopGame(s,{a:{paddle:0,station:'shoot'}});step(s,20);expect(s.crew.repair).toBe(saved)
      arrive(s,'a','recover');step(s,(salvage?240:360)-40);expect(s.hearts).toBe(3);expect(s.crew.scrap).toBe(0)
    }
    const s=start();s.hearts=2;s.crew.scrap=9;s.crew.repair=RECOVERY_WORK-1;arrive(s,'a','recover');arrive(s,'b','recover')
    step(s,1);expect(s.hearts).toBe(3);expect(s.crew.scrap).toBe(6);expect(s.crew.repair).toBe(0)
  })
  it('fires deliberate heavy shells and only damages on impact',()=>{
    const s=start();arrive(s,'a','shoot');s.objects=[enemy()];step(s,1)
    expect(s.objects[0]!.hp).toBe(90);expect(s.crew.shots).toHaveLength(1);expect(s.crew.shots[0]!.damage).toBe(18)
    step(s,30);expect(s.objects[0]!.hp).toBeLessThan(90);expect(s.crew.shotsFired).toBe(1)
    step(s,20);expect(s.crew.shotsFired).toBe(2)
  })
  it('keeps enemies sparse, persistent and snapshots bounded',()=>{
    const s=start(),ids=new Set<number>();s.invulnerableTicks=100000;let max=0,bytes=0
    for(let i=0;i<10800;i++){advanceCoopGame(s,{});const es=s.objects.filter(o=>o.type==='predator');max=Math.max(max,es.length);if(i<1200)for(const o of es)ids.add(o.id);bytes=Math.max(bytes,JSON.stringify(s).length)}
    expect(ids.size).toBeGreaterThan(0);expect(ids.size).toBeLessThanOrEqual(3);expect(max).toBeLessThanOrEqual(6);expect(bytes).toBeLessThan(60000)
    expect(s.objects.filter(o=>o.type==='predator').every(o=>(o.age??0)>230)).toBe(true)
  })
  it('locks telegraphs, strikes after warning and survives contact',()=>{
    const s=start();s.objects=[{...enemy(),attackPhase:'telegraph',attackTick:0,targetX:s.boat.x,targetY:.76}]
    const o=s.objects[0]!;s.boat.x=.8;step(s,100);expect(o.targetX).toBe(.5);expect(o.attackPhase).toBe('telegraph')
    step(s,44);expect(o.attackPhase).toBe('strike')
    s.boat.x=.5;o.x=.5;o.y=.7;step(s,1);expect(s.hearts).toBe(2);expect(s.objects.some(p=>p.id===o.id)).toBe(true);expect(o.attackPhase).toBe('recover')
    step(s,20);expect(s.hearts).toBe(2)
  })
  it('pursues again after a miss, across the seam',()=>{
    const s=start();s.boat.x=.02;const o={...enemy(900,ORBIT_LAP-.2,.8),attackPhase:'recover' as const,attackTick:105};s.objects=[o]
    const d=Math.abs(orbitDelta(o.x,s.boat.x));step(s,20);expect(Math.abs(orbitDelta(o.x,s.boat.x))).toBeLessThan(d)
  })
  it('equips automatic upgrades, absorbs bubble hit, freezes final results',()=>{
    const s=start();advanceCoopGame(s,{a:{paddle:0,upgrade:'chain'}});expect(s.crew.upgrades).toEqual([])
    s.tick=1259;step(s,1);expect(s.crew.upgrades).toEqual(['twin']);expect(s.crew.choiceTicks).toBe(0)
    s.crew.bubble=1;s.objects=[rock(s)];step(s,1);expect(s.hearts).toBe(3);expect(s.crew.bubble).toBe(0)
    s.objects=[rock(s)];step(s,1);expect(s.hearts).toBe(2)
    s.hearts=0;step(s,1);const end=s.crew.finishedTick,tick=s.tick;step(s,1);expect(s.tick).toBe(tick+1);expect(s.crew.finishedTick).toBe(end)
  })
  it('requires rescues plus guardian defeat and visits five worlds',()=>{
    const s=start(),worlds=new Set<number>();s.invulnerableTicks=100000
    for(let i=0;i<s.durationTicks;i++){advanceCoopGame(s,{});worlds.add(expeditionWorld(s))}
    expect([...worlds]).toEqual([0,1,2,3,4]);expect(s.crew.victory).toBe(false);expect(s.crew.encounterIndex).toBe(2)
    const win=start();win.rescued=3;win.crew.bossDefeated=true;step(win,1);expect(win.crew.victory).toBe(true)
  })
  it('idle crews lose and replay is deterministic including poses and attacks',()=>{
    for(let seed=1;seed<=6;seed++){const s=start(seed);step(s,s.durationTicks);expect(s.crew.victory).toBe(false);expect(s.hearts).toBe(0)}
    const a=start(7),b=start(7)
    for(let t=0;t<10800;t++){const input={a:{paddle:0,station:(['left','shoot','right','recover'] as const)[Math.floor(t/160)%4]},b:{paddle:0,station:'shoot' as const}};advanceCoopGame(a,input);advanceCoopGame(b,input)}
    expect(a).toEqual(b)
  })
})
