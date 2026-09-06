import { describe,it,expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { DEFAULT_VOYAGE, BEAST_TRAITS, advanceCoopGame, createCoopGame, validateVoyage } from '@pongapp/game-core'
import { VoyageLedger, VOYAGE_HARD_CAP, VOYAGE_RESERVATION, type SqlStore } from '../src/voyage-ledger'
import { VoyageService, generationBody, providerCapped, VOYAGE_MODELS } from '../src/voyage-service'
function store():SqlStore{
  const db=new DatabaseSync(':memory:')
  return {sql:{exec:(q,...args)=>{const rows=db.prepare(q).all(...args);return {toArray:()=>rows}}},transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}}
}
const now=Date.parse('2026-09-06T12:00:00Z')
const env={ENABLE_PAID:'true',OPENROUTER_API_KEY:'test-only-fake-key',OPENROUTER_LIMIT_CONFIRMED:'100-monthly-exclusive',MONTHLY_BUDGET_USD:'100'}
const req=(key='ark-v1:0:1',method='POST',ip='192.0.2.2')=>new Request('https://example.test/api/voyages?key='+key,{method,headers:{'CF-Connecting-IP':ip,'Content-Type':'application/json'}})
const validReply={choices:[{finish_reason:'stop',message:{content:JSON.stringify({title:'The Opaline Procession',monsters:DEFAULT_VOYAGE.monsters})}}]}
describe('paid voyage safety and actual recipe consumption',()=>{
  it('atomically reserves before requests and never exceeds the monthly cap, even after restart',async()=>{
    const storage=store(),ledger=new VoyageLedger(storage)
    const results=await Promise.all(Array.from({length:80},(_,i)=>Promise.resolve().then(()=>ledger.begin('key'+i,now,90000))))
    expect(results.filter(r=>r.kind==='reserved')).toHaveLength(3);expect(ledger.spent(now)).toBe(90000)
    const restart=new VoyageLedger(storage);expect(restart.begin('new',now,90000).kind).toBe('budget')
    expect(restart.begin('october',Date.parse('2026-10-01T00:00:00Z'),90000).kind).toBe('reserved')
    expect(restart.begin('invalid',now,VOYAGE_HARD_CAP+1).kind).toBe('budget')
  })
  it('reuses cache without spending and refuses duplicate or failed daily attempts',()=>{
    const ledger=new VoyageLedger(store()),first=ledger.begin('ark-v1:0:0',now)
    expect(first.kind).toBe('reserved');if(first.kind!=='reserved')throw Error('reservation')
    expect(ledger.begin('ark-v1:0:0',now).kind).toBe('pending')
    expect(ledger.finish('ark-v1:0:0',first.lease,DEFAULT_VOYAGE,now+100)).toBe(true)
    expect(ledger.begin('ark-v1:0:0',now+200,1).kind).toBe('cache');expect(ledger.spent(now)).toBe(VOYAGE_RESERVATION)
    const failed=ledger.begin('ark-v1:0:1',now);if(failed.kind!=='reserved')throw Error('reservation')
    ledger.fail('ark-v1:0:1',failed.lease);expect(ledger.begin('ark-v1:0:1',now+31000).kind).toBe('daily')
    expect(ledger.spent(now)).toBe(2*VOYAGE_RESERVATION)
  })
  it('requires a independently verifiable exclusive monthly provider ceiling',()=>{
    const valid={limit:100,limit_reset:'monthly',limit_remaining:10,is_management_key:false}
    expect(providerCapped(valid)).toBe(true)
    for(const d of [{...valid,limit:null},{...valid,limit:101},{...valid,limit_reset:null},{...valid,is_management_key:true},{...valid,limit_remaining:.001}])expect(providerCapped(d)).toBe(false)
  })
  it('uses cheap fast model normally and stronger model for special packs, with bounded price/tokens',()=>{
    expect(generationBody('ark-v1:0:1').model).toBe(VOYAGE_MODELS.fast);expect(generationBody('ark-v1:4:7').model).toBe(VOYAGE_MODELS.curated)
    const body=generationBody('ark-v1:4:7');expect(body.reasoning.enabled).toBe(false);expect(body.provider.sort).toBe('latency')
    const worstUSD=6000*body.provider.max_price.prompt/1e6+body.max_tokens*body.provider.max_price.completion/1e6+body.provider.max_price.request
    expect(worstUSD).toBeLessThan(VOYAGE_RESERVATION/1e6)
  })
  it('makes zero provider calls for visits, invalid keys, disabled service or absent trusted IP',async()=>{
    let calls=0;const fetcher=async()=>{calls++;throw Error('should not call')}
    const s=new VoyageService(store(),env,fetcher,()=>now)
    await s.fetch(req('ark-v1:0:1','GET'));await s.fetch(req('random'))
    await s.fetch(new Request('https://test/api/voyages?key=ark-v1:0:1',{method:'POST'}))
    await new VoyageService(store(),{...env,ENABLE_PAID:'false'},fetcher,()=>now).fetch(req())
    expect(calls).toBe(0)
  })
  it('generates once, serves cache on repeat, and validated recipes enter authoritative game state',async()=>{
    const calls:string[]=[],storage=store()
    const fetcher:typeof fetch=async(input)=>{const url=String(input);calls.push(url);return Response.json(url.endsWith('/key')?{data:{limit:100,limit_reset:'monthly',limit_remaining:100}}:validReply)}
    const service=new VoyageService(storage,env,fetcher,()=>now)
    const generated=await (await service.fetch(req())).json() as {source:string;pack:unknown}
    expect(generated.source).toBe('generated');expect(calls).toHaveLength(2)
    const pack=validateVoyage(generated.pack)!;expect(pack.title).toBe('The Opaline Procession');expect(pack.model).toBe(VOYAGE_MODELS.fast)
    const game=createCoopGame([{id:'a',name:'A'}],7,pack);expect(game.voyage).toEqual(pack);expect(game.voyage).not.toBe(pack)
    game.phase='playing';game.tick=659;game.invulnerableTicks=10000
    advanceCoopGame(game,{})
    const spawned=game.objects.find(o=>o.type==='predator')!
    expect(spawned).toBeTruthy()
    const recipe=pack.monsters[spawned.recipe!]!
    expect(spawned.family).toBe(recipe.family);expect(spawned.maxHp).toBe(BEAST_TRAITS[recipe.trait].hp)
    expect(spawned.radius).toBeCloseTo(.09*recipe.scale)
    const cached=await (await new VoyageService(storage,env,fetcher,()=>now).fetch(req())).json() as {source:string}
    expect(cached.source).toBe('cache');expect(calls).toHaveLength(2);expect(service.ledger.spent(now)).toBe(VOYAGE_RESERVATION)
  })
  it('refuses uncapped accounts before reserving or generating',async()=>{
    let calls=0;const service=new VoyageService(store(),env,async()=>{calls++;return Response.json({data:{limit:null}})},()=>now)
    const result=await (await service.fetch(req())).json() as {reason:string};expect(result.reason).toBe('provider_limit');expect(calls).toBe(1);expect(service.ledger.spent(now)).toBe(0)
  })
  it('charges failed attempts conservatively and never caches executable or invalid recipes',async()=>{
    for(const content of ['not json',JSON.stringify({...DEFAULT_VOYAGE,script:'evil()'}),JSON.stringify({title:'Bad ideas',monsters:DEFAULT_VOYAGE.monsters.map(m=>({...m,scale:999}))})]){
      const service=new VoyageService(store(),env,async input=>Response.json(String(input).endsWith('/key')?{data:{limit:100,limit_reset:'monthly',limit_remaining:100}}:{choices:[{finish_reason:'stop',message:{content}}]}),()=>now)
      const result=await (await service.fetch(req())).json() as {source:string}
      expect(result.source).toBe('builtin');expect(service.ledger.spent(now)).toBe(VOYAGE_RESERVATION);expect(service.ledger.cached('ark-v1:0:1')).toBeNull()
    }
  })
  it('limits repeated public requests independently of provider budget',async()=>{
    const service=new VoyageService(store(),{...env,ENABLE_PAID:'false'},async()=>{throw Error('unused')},()=>now)
    for(let i=0;i<3;i++)expect((await service.fetch(req('ark-v1:0:'+i))).status).toBe(200)
    expect((await service.fetch(req('ark-v1:0:4'))).status).toBe(429)
  })
})
