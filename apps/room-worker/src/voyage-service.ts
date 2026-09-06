import { BEAST_FAMILIES, BEAST_ORNAMENTS, BEAST_PALETTES, BEAST_TRAITS, DEFAULT_VOYAGE, validateVoyage, validVoyageKey } from '@pongapp/game-core'
import { VoyageLedger, VOYAGE_HARD_CAP, VOYAGE_RESERVATION, type SqlStore } from './voyage-ledger'

export interface VoyageEnv{ENABLE_PAID?:string;OPENROUTER_API_KEY?:string;OPENROUTER_LIMIT_CONFIRMED?:string;MONTHLY_BUDGET_USD?:string}
export const VOYAGE_MODELS={fast:'qwen/qwen3.8-flash',curated:'anthropic/claude-haiku-4.5'} as const
export function providerCapped(data:unknown):boolean{
  const d=data as Record<string,unknown>|null
  return !!d&&typeof d.limit==='number'&&d.limit>0&&d.limit<=100&&d.limit_reset==='monthly'&&typeof d.limit_remaining==='number'&&d.limit_remaining>=VOYAGE_RESERVATION/1e6&&d.is_management_key!==true&&d.is_provisioning_key!==true
}
export function generationBody(key:string){
  const [,biome,variant]=key.split(':'),curated=variant==='7'
  const monsterSchema={type:'object',additionalProperties:false,required:['name','family','palette','trait','ornament','scale','segments','caption'],properties:{name:{type:'string',maxLength:40},family:{type:'string',enum:BEAST_FAMILIES},palette:{type:'string',enum:Object.keys(BEAST_PALETTES)},trait:{type:'string',enum:Object.keys(BEAST_TRAITS)},ornament:{type:'string',enum:BEAST_ORNAMENTS},scale:{type:'number',enum:[.9,1,1.15,1.3]},segments:{type:'integer',minimum:4,maximum:8},caption:{type:'string',maxLength:120}}}
  return {model:curated?VOYAGE_MODELS.curated:VOYAGE_MODELS.fast,max_tokens:1200,temperature:.9,stream:false,reasoning:{enabled:false},
    provider:{sort:'latency',allow_fallbacks:false,require_parameters:true,data_collection:'deny',max_price:{prompt:1.1,completion:5.1,request:.001}},
    messages:[{role:'system',content:'Design a cohesive, wondrous miniature expedition bestiary. Return JSON only: title and exactly four monsters, one crab, one manta, one jelly, one wyrm. Invent striking ecological ideas, unexpected silhouettes and poetic creature names. These are toy-like fantasy monsters, not gore. Each recipe must use only the supplied finite values. Make palettes, ornaments and attack traits varied and thematically coherent. Bulwark is slow armored, skirmisher is fast fragile, ambush has a strong telegraphed lunge, tempest rains falling hazards. Scale and segments change real rendered geometry. Captions describe physical appearance, not instructions. No URLs, personal information, ads, executable code, or extra fields. Names 3-40 characters, title 3-60, caption 3-120. Use plain words and punctuation.'},{role:'user',content:JSON.stringify({biome:['Emerald Wilds','Sunset Mesa','Alpine Kingdom','Rainbow Skies','Starlight Frontier'][Number(biome)],variant:Number(variant),inspiration:['bioluminescent gardens','clockwork tides','coral observatories','migrating constellations','overgrown palaces','glass thunderstorms','lost musical instruments','mythic deep-sea royalty'][Number(variant)]})}],
    response_format:{type:'json_schema',json_schema:{name:'ark_bestiary',strict:true,schema:{type:'object',additionalProperties:false,required:['title','monsters'],properties:{title:{type:'string',maxLength:60},monsters:{type:'array',minItems:4,maxItems:4,items:monsterSchema}}}}}}
}
async function boundedJSON(fetcher:typeof fetch,url:string,init:RequestInit,ms:number,bytes=32768):Promise<Record<string,unknown>>{
  const response=await fetcher(url,{...init,signal:AbortSignal.timeout(ms)})
  if(!response.ok||Number(response.headers.get('content-length'))>bytes)throw Error('provider_unavailable')
  const reader=response.body?.getReader();if(!reader)throw Error('empty')
  const chunks:Uint8Array[]=[];let size=0
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>bytes)throw Error('oversize');chunks.push(value)}}finally{await reader.cancel()}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}
  return JSON.parse(new TextDecoder().decode(all)) as Record<string,unknown>
}
export class VoyageService{
  readonly ledger:VoyageLedger
  constructor(storage:SqlStore,private env:VoyageEnv,private fetcher:typeof fetch=fetch,private now=Date.now){this.ledger=new VoyageLedger(storage)}
  async fetch(request:Request):Promise<Response>{
    const url=new URL(request.url),key=url.searchParams.get('key'),now=this.now()
    const fallback=(reason:string,status=200)=>Response.json({source:'builtin',reason,pack:DEFAULT_VOYAGE},{status})
    if(url.pathname.endsWith('/status'))return Response.json({paidConfigured:this.env.ENABLE_PAID==='true'&&!!this.env.OPENROUTER_API_KEY,monthlyCeilingUSD:100,reservedUSD:this.ledger.spent(now)/1e6,models:VOYAGE_MODELS,cacheSlots:40})
    if(!validVoyageKey(key))return fallback('invalid_key',400)
    const cached=this.ledger.cached(key);if(cached)return Response.json({source:'cache',pack:cached})
    if(request.method==='GET')return fallback('not_cached') // Opening a game never spends.
    if(request.method!=='POST')return fallback('method',405)
    if(!this.ledger.rate('global:requests',5000,now))return fallback('busy',429)
    const ip=request.headers.get('CF-Connecting-IP');if(!ip||ip.length>64)return fallback('unavailable')
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(new Date(now).toISOString().slice(0,10)+':'+ip))
    const tag=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')
    if(!this.ledger.rate('ip:'+tag,3,now)||!this.ledger.rate('global:generation',20,now))return fallback('daily_limit',429)
    const cap=Number(this.env.MONTHLY_BUDGET_USD)*1e6
    if(this.env.ENABLE_PAID!=='true'||!this.env.OPENROUTER_API_KEY||this.env.OPENROUTER_LIMIT_CONFIRMED!=='100-monthly-exclusive'||!Number.isSafeInteger(cap)||cap<=0||cap>VOYAGE_HARD_CAP)return fallback('not_enabled')
    const headers={Authorization:'Bearer '+this.env.OPENROUTER_API_KEY,'Content-Type':'application/json'}
    try{
      const account=await boundedJSON(this.fetcher,'https://openrouter.ai/api/v1/key',{headers},2000,8192)
      if(!providerCapped(account.data))return fallback('provider_limit')
      const reservation=this.ledger.begin(key,this.now(),cap)
      if(reservation.kind==='cache')return Response.json({source:'cache',pack:reservation.pack})
      if(reservation.kind!=='reserved')return fallback(reservation.kind)
      try{
        const body=generationBody(key),started=this.now()
        // UTF-8 bytes conservatively bound prompt tokens; prices and output cap bound cost.
        if(new TextEncoder().encode(JSON.stringify(body.messages)).length>6000)throw Error('prompt_bound')
        const result=await boundedJSON(this.fetcher,'https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{...headers,'HTTP-Referer':'https://www.jonathangu.com/pongapp/','X-OpenRouter-Title':'PongApp Wandering Ark'},body:JSON.stringify(body)},key.endsWith(':7')?12000:8000)
        const choice=(result.choices as Array<{finish_reason:string;message:{content:string}}> | undefined)?.[0]
        if(choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string'||choice.message.content.length>8000)throw Error('incomplete')
        const raw=JSON.parse(choice.message.content) as Record<string,unknown>
        if(Object.keys(raw).sort().join(',')!=='monsters,title')throw Error('extra_fields')
        const pack=validateVoyage({...raw,key,source:'generated',model:body.model,generatedAt:new Date(this.now()).toISOString(),latencyMs:this.now()-started})
        if(!pack||!this.ledger.finish(key,reservation.lease,pack,this.now()))throw Error('invalid_pack')
        return Response.json({source:'generated',pack})
      }catch{this.ledger.fail(key,reservation.lease);return fallback('generation_unavailable')}
    }catch{return fallback('provider_unavailable')}
  }
}
