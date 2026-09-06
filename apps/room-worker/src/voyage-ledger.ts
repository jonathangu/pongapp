import { validateVoyage, type VoyagePack } from '@pongapp/game-core'

export const VOYAGE_RESERVATION=30_000 // $0.03 micro-USD, above maximum bounded request cost.
export const VOYAGE_HARD_CAP=100_000_000
export const utcMonth=(now:number)=>new Date(now).toISOString().slice(0,7)
export interface SqlStore{
  sql:{exec(query:string,...args:Array<string|number|null>):{toArray():Record<string,unknown>[]}}
  transactionSync<T>(fn:()=>T):T
}
export class VoyageLedger{
  constructor(private storage:SqlStore){
    for(const q of [
      'CREATE TABLE IF NOT EXISTS voyage_budget(month TEXT PRIMARY KEY, used INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS voyage_cache(key TEXT PRIMARY KEY, pack TEXT, lease TEXT, until_ms INTEGER NOT NULL, attempt_day TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS voyage_rates(id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)',
    ])storage.sql.exec(q)
  }
  spent(now:number){return Number(this.storage.sql.exec('SELECT used FROM voyage_budget WHERE month=?',utcMonth(now)).toArray()[0]?.used??0)}
  cached(key:string):VoyagePack|null{
    const raw=this.storage.sql.exec('SELECT pack FROM voyage_cache WHERE key=?',key).toArray()[0]?.pack
    try{return typeof raw==='string'?validateVoyage(JSON.parse(raw)):null}catch{return null}
  }
  rate(id:string,max:number,now:number,period=86400_000){
    return this.storage.transactionSync(()=>{
      this.storage.sql.exec('DELETE FROM voyage_rates WHERE expires<=?',now)
      const count=Number(this.storage.sql.exec('SELECT count FROM voyage_rates WHERE id=?',id).toArray()[0]?.count??0)
      if(count>=max)return false
      this.storage.sql.exec('INSERT INTO voyage_rates(id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1',id,now+period)
      return true
    })
  }
  begin(key:string,now:number,cap=VOYAGE_HARD_CAP):{kind:'reserved';lease:string}|{kind:'cache';pack:VoyagePack}|{kind:'budget'|'pending'|'daily'}{
    return this.storage.transactionSync(()=>{
      const pack=this.cached(key);if(pack)return {kind:'cache',pack}
      const row=this.storage.sql.exec('SELECT lease,until_ms,attempt_day FROM voyage_cache WHERE key=?',key).toArray()[0]
      if(Number(row?.until_ms??0)>now)return {kind:'pending'}
      const day=new Date(now).toISOString().slice(0,10)
      if(row?.attempt_day===day)return {kind:'daily'}
      if(!Number.isSafeInteger(cap)||cap<=0||cap>VOYAGE_HARD_CAP||this.spent(now)+VOYAGE_RESERVATION>cap)return {kind:'budget'}
      const lease=crypto.randomUUID()
      this.storage.sql.exec('INSERT INTO voyage_budget(month,used) VALUES (?,?) ON CONFLICT(month) DO UPDATE SET used=used+excluded.used',utcMonth(now),VOYAGE_RESERVATION)
      this.storage.sql.exec('INSERT INTO voyage_cache(key,pack,lease,until_ms,attempt_day) VALUES (?,NULL,?,?,?) ON CONFLICT(key) DO UPDATE SET pack=NULL,lease=excluded.lease,until_ms=excluded.until_ms,attempt_day=excluded.attempt_day',key,lease,now+30000,day)
      return {kind:'reserved',lease}
    })
  }
  finish(key:string,lease:string,pack:VoyagePack,now:number){
    return this.storage.transactionSync(()=>{
      const row=this.storage.sql.exec('SELECT lease,until_ms FROM voyage_cache WHERE key=?',key).toArray()[0]
      if(row?.lease!==lease||Number(row.until_ms)<=now||!validateVoyage(pack))return false
      this.storage.sql.exec('UPDATE voyage_cache SET pack=?,lease=NULL,until_ms=0 WHERE key=?',JSON.stringify(pack),key);return true
    })
  }
  fail(key:string,lease:string){this.storage.sql.exec('UPDATE voyage_cache SET lease=NULL WHERE key=? AND lease=?',key,lease)}
}
