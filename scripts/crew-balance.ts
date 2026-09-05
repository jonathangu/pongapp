import { advanceCoopGame, createCoopGame, type CoopInput } from '../packages/game-core/src/coop'

// Deterministic balance probe, not a substitute for a human playtest.
const rows = []
for (let seed = 1; seed <= 20; seed++) {
  const s = createCoopGame([{id:'pilot',name:'Pilot'},{id:'support',name:'Support'}], seed)
  for(let t=0;t<7400&&s.phase!=='finished';t++) {
    const hazards=s.objects.filter(o=>['rock','log','predator'].includes(o.type)&&Math.abs(o.y-.76)<.24&&Math.abs(o.x-s.boat.x)<.17)
    const rescue=s.objects.filter(o=>o.type==='rescue'&&o.y>.05&&o.y<.8).sort((a,b)=>b.y-a.y)[0]
    const scrap=s.objects.filter(o=>o.type==='relic'&&o.y>.2&&o.y<.8).sort((a,b)=>b.y-a.y)[0]
    const danger=hazards[0], prize=rescue??scrap
    const target=danger?Math.max(.1,Math.min(.9,s.boat.x+(danger.x>s.boat.x?-.22:.22))):prize?.x??.5
    const pilot:CoopInput={paddle:0,steer:Math.abs(target-s.boat.x)<.02?0:target>s.boat.x?1:-1}
    const needRepair=s.hearts<3&&s.crew.scrap>=3
    const support:CoopInput={paddle:0,station:needRepair?'engineer':'gunner',action:needRepair||s.crew.heat<80,flare:needRepair&&hazards.length>0,targetId:s.objects.find(o=>o.enemy==='boss')?.id??null}
    if(s.crew.choiceTicks)pilot.upgrade=s.crew.upgrades.includes('magnet')?'frost':'magnet'
    advanceCoopGame(s,{pilot,support})
  }
  rows.push({seed,win:s.crew.victory,seconds:Math.round((s.tick-180)/60),hearts:s.hearts,rescued:s.rescued,kills:s.crew.kills,boss:s.crew.bossDefeated,bossHp:s.objects.find(o=>o.enemy==='boss')?.hp??0})
}
console.log(JSON.stringify({wins:rows.filter(r=>r.win).length,runs:rows.length,rows},null,2))
