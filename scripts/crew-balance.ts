import { advanceCoopGame, createCoopGame, type CoopInput, type CrewStation } from '../packages/game-core/src/coop'
import { orbitDelta } from '../packages/game-core/src/orbit'

// Deterministic tactical probe, not a substitute for a human playtest.
const rows=[]
for(const mode of ['idle','coordinated'] as const)for(let seed=1;seed<=20;seed++){
  const s=createCoopGame([{id:'pilot',name:'Pilot'},{id:'support',name:'Support'}],seed)
  for(let t=0;t<11000&&s.phase!=='finished';t++){
    let inputs:Record<string,CoopInput>={}
    if(mode==='coordinated'){
      const pilot=s.players.pilot!,support=s.players.support!
      const danger=s.objects.find(o=>o.type==='predator'&&(o.attackPhase==='telegraph'||o.attackPhase==='strike')&&Math.abs(orbitDelta(o.targetX??o.x,s.boat.x))<.3)
        ??s.objects.find(o=>['rock','log'].includes(o.type)&&o.y>.48&&o.y<.84&&Math.abs(orbitDelta(o.x,s.boat.x))<.22)
      const prize=s.objects.filter(o=>o.type==='rescue'&&o.y>.0&&o.y<.85).sort((a,b)=>b.y-a.y)[0]
      const delta=prize?orbitDelta(prize.x,s.boat.x):0
      let destination:CrewStation='shoot'
      if(danger)destination=orbitDelta(danger.targetX??danger.x,s.boat.x)>0?'left':'right'
      else if(prize&&Math.abs(delta)>.11)destination=delta>0?'right':'left'
      else if(s.hearts===1&&support.station==='shoot')destination='recover'
      const supportDest:CrewStation=s.hearts<3&&destination!=='recover'?'recover':'shoot'
      inputs={pilot:{paddle:0,station:pilot.deck.moving?undefined:destination},support:{paddle:0,station:support.deck.moving?undefined:supportDest,targetId:s.objects.find(o=>o.enemy==='boss')?.id??null}}
    }
    advanceCoopGame(s,inputs)
  }
  rows.push({mode,seed,win:s.crew.victory,seconds:Math.round((s.tick-180)/60),hearts:s.hearts,rescued:s.rescued,kills:s.crew.kills,boss:s.crew.bossDefeated,bossHp:Math.round(s.objects.find(o=>o.bossKind==='guardian')?.hp??0)})
}
console.log(JSON.stringify({runtimeSession:'01a0369d-0914-7190-ac0e-b4d37e1fc052',summary:['idle','coordinated'].map(mode=>({mode,wins:rows.filter(r=>r.mode===mode&&r.win).length,runs:20})),rows},null,2))
