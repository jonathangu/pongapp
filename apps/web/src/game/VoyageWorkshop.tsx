import { useRef, useState } from 'react'
import { DEFAULT_VOYAGE, EXPEDITION_WORLDS, validateVoyage, type VoyagePack } from '@pongapp/game-core'

export function VoyageWorkshop({serverUrl,pack,onPack}:{serverUrl:string;pack:VoyagePack;onPack:(pack:VoyagePack)=>void}){
  const [biome,setBiome]=useState(0),[status,setStatus]=useState('Built-in voyage ready. Play instantly.'),[busy,setBusy]=useState(false)
  const serial=useRef(0)
  const discover=async()=>{
    if(busy)return
    setBusy(true);setStatus('Discovering a bestiary… You can play while it arrives.')
    const request=++serial.current,variant=Math.floor(Math.random()*8),key='ark-v1:'+biome+':'+variant
    try{
      const response=await fetch(new URL('/api/voyages?key='+encodeURIComponent(key),serverUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(16000)})
      const data=await response.json() as {source?:string;pack?:unknown;reason?:string},next=validateVoyage(data.pack)
      if(request!==serial.current)return
      if(next&&data.source!=='builtin'){onPack(next);setStatus(data.source==='cache'?'Cached AI bestiary ready — no new generation cost.':'New AI bestiary ready in '+((next.latencyMs??0)/1000).toFixed(1)+'s.')}
      else setStatus(data.reason==='not_enabled'?'Paid generation is not configured yet. Your built-in voyage is ready.':data.reason==='budget'?'Generation budget reached. Your current voyage is ready.':'Discovery is unavailable right now. Your current voyage is ready.')
    }catch{if(request===serial.current)setStatus('Discovery is unavailable right now. Your current voyage is ready.')}
    finally{if(request===serial.current)setBusy(false)}
  }
  return <section className="voyage-workshop" aria-labelledby="voyage-title"><div><p className="oars-kicker">THE BESTIARY WORKSHOP</p><h2 id="voyage-title">{pack.title}</h2><p>Distinct bodies. Strange ornaments. Dangerous personalities.</p></div><div className="voyage-recipes">{pack.monsters.map(monster=><article key={monster.family} data-family={monster.family}><span>{({crab:'♜',manta:'⋈',jelly:'♛',wyrm:'〰'})[monster.family]}</span><h3>{monster.name}</h3><p>{monster.caption}</p><small>{monster.trait} · {monster.ornament} · {monster.palette}</small></article>)}</div><div className="voyage-discover"><label>Inspiration<select aria-label="Voyage inspiration" value={biome} onChange={e=>setBiome(Number(e.target.value))}>{EXPEDITION_WORLDS.map((w,i)=><option key={w.name} value={i}>{w.name}</option>)}</select></label><button onClick={()=>void discover()} disabled={busy}>{busy?'Discovering…':'Discover an AI voyage ✦'}</button>{pack.source!=='builtin'&&<button className="quiet" onClick={()=>{onPack(DEFAULT_VOYAGE);setStatus('Built-in voyage restored.')}}>Use original voyage</button>}</div><p className="voyage-status" role="status">{status}</p><small>Optional server-side generation, only when you ask. Shared cached packs are free to reuse. The game never waits for AI.</small></section>
}
