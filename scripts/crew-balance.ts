import { advanceCoopGame, createCoopGame, type CoopInput } from '../packages/game-core/src/coop'
import { orbitDelta, wrapOrbit } from '../packages/game-core/src/orbit'

// Deterministic balance probe, not a substitute for a human playtest.
const rows = []
for (let seed = 1; seed <= 20; seed++) {
  const s = createCoopGame([{id:'pilot',name:'Pilot'},{id:'support',name:'Support'}], seed)
  for(let t=0;t<7400&&s.phase!=='finished';t++) {
    const hazards=s.objects.filter(o=>['rock','log','predator'].includes(o.type)&&Math.abs(o.y-.76)<.24&&Math.abs(orbitDelta(o.x,s.boat.x))<.17)
    const rescue=s.objects.filter(o=>o.type==='rescue'&&o.y>.05&&o.y<.8).sort((a,b)=>b.y-a.y)[0]
    const scrap=s.objects.filter(o=>o.type==='relic'&&o.y>.2&&o.y<.8).sort((a,b)=>b.y-a.y)[0]
    const danger=hazards[0], prize=rescue??scrap
    const target=danger?wrapOrbit(s.boat.x+(orbitDelta(danger.x,s.boat.x)>0?-.22:.22)):prize?.x??s.boat.x
    const delta=orbitDelta(target,s.boat.x),canSteer=Math.abs(delta)>.045
    const pilot:CoopInput={paddle:0,steer:canSteer?Math.sign(delta):0,leftTap:Boolean(danger)&&t%10===0&&delta<0,rightTap:Boolean(danger)&&t%10===0&&delta>0}
    const needRepair=s.hearts<3
    const support:CoopInput={paddle:0,recoverHeld:needRepair,recoverTap:needRepair&&t%30===0,action:true,shootTap:t%20===0,targetId:s.objects.find(o=>o.enemy==='boss')?.id??null}
    advanceCoopGame(s,{pilot,support})
  }
  rows.push({seed,win:s.crew.victory,seconds:Math.round((s.tick-180)/60),hearts:s.hearts,rescued:s.rescued,kills:s.crew.kills,boss:s.crew.bossDefeated,bossHp:s.objects.find(o=>o.enemy==='boss')?.hp??0})
}
console.log(JSON.stringify({wins:rows.filter(r=>r.win).length,runs:rows.length,rows},null,2))
