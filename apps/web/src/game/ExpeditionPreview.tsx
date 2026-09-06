import { useCallback, useMemo, useState } from 'react'
import { createCoopGame, EXPEDITION_WORLDS, assignStation, advanceCrewMember } from '@pongapp/game-core'
import { ExpeditionCanvas } from './ExpeditionCanvas'
export function ExpeditionPreview() {
  const [world,setWorld]=useState(0)
  const state=useMemo(()=>{
    const s=createCoopGame([{id:'preview-left',name:'You'},{id:'preview-right',name:'Your person'}],42)
    s.phase='playing';s.tick=180+world*2160+300;s.paddles={left:1,right:1};s.boat.wake=1
    assignStation(s.players['preview-left']!,'left');assignStation(s.players['preview-right']!,'shoot')
    for(let i=0;i<60;i++)for(const p of Object.values(s.players))advanceCrewMember(p)
    s.objects.push({id:90,type:'predator',family:world%2?'manta':'crab',x:.78,y:.38,radius:.09,phase:0,drift:0},{id:91,type:'gate',x:.55,y:.17,radius:.04,phase:0,drift:0},{id:92,type:'rescue',x:.68,y:.62,radius:.04,phase:0,drift:0})
    return s
  },[world])
  const getState=useCallback(()=>state,[state])
  return <div className="expedition-preview"><ExpeditionCanvas getState={getState} preview/><div className="preview-caption"><span>FIVE WORLDS. YOUR FAVORITE PERSON.</span><h2>{EXPEDITION_WORLDS[world]!.name}</h2></div><div className="preview-worlds">{EXPEDITION_WORLDS.map((v,i)=><button key={v.name} className={i===world?'active':''} aria-label={'Preview '+v.name} aria-pressed={i===world} onClick={()=>setWorld(i)}>{['✿','☀','▲','☁','✦'][i]}</button>)}</div></div>
}
