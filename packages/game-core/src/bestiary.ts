export const BEAST_FAMILIES=['crab','manta','jelly','wyrm'] as const
export const BEAST_PALETTES={jade:0xa3e9cf,ember:0xffb788,opal:0xd6efff,abyss:0xa4a1e8,sunmetal:0xffe0a0,orchid:0xefb2dc} as const
export const BEAST_TRAITS={
  bulwark:{hp:120,speed:.003,windup:156,strike:.013,recovery:120},
  skirmisher:{hp:66,speed:.005,windup:132,strike:.017,recovery:85},
  ambush:{hp:84,speed:.0038,windup:144,strike:.02,recovery:120},
  tempest:{hp:92,speed:.0034,windup:156,strike:.014,recovery:105},
} as const
export const BEAST_ORNAMENTS=['antlers','halo','spines','lanterns'] as const
export interface MonsterRecipe{
  name:string;family:typeof BEAST_FAMILIES[number];palette:keyof typeof BEAST_PALETTES
  trait:keyof typeof BEAST_TRAITS;ornament:typeof BEAST_ORNAMENTS[number];scale:.9|1|1.15|1.3;segments:number;caption:string
}
export interface VoyagePack{key:string;title:string;monsters:MonsterRecipe[];source:'builtin'|'generated';model?:string;generatedAt?:string;latencyMs?:number}
// Names/captions are rendered as escaped text, never HTML or executable data.
// Keep bounded prose and reject links/markup; normal punctuation and words such
// as "inscriptions" are not code and should not discard an otherwise valid pack.
const safeText=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>=3&&v.length<=max&&!/[\u0000-\u001f<>\u0060{}]/u.test(v)&&!/(?:https?:\/\/|www\.|subscribe|password|api key)/i.test(v)
export const validVoyageKey=(v:unknown):v is string=>typeof v==='string'&&/^ark-v1:[0-4]:[0-7]$/.test(v)
export function validateMonster(value:unknown):MonsterRecipe|null{
  if(!value||typeof value!=='object')return null
  const r=value as MonsterRecipe
  if(Object.keys(r).sort().join(',')!=='caption,family,name,ornament,palette,scale,segments,trait')return null
  if(!safeText(r.name,40)||!safeText(r.caption,120)||!BEAST_FAMILIES.includes(r.family)||!Object.hasOwn(BEAST_PALETTES,r.palette)||!Object.hasOwn(BEAST_TRAITS,r.trait)||!BEAST_ORNAMENTS.includes(r.ornament)||![.9,1,1.15,1.3].includes(r.scale)||!Number.isInteger(r.segments)||r.segments<4||r.segments>8)return null
  return {...r}
}
export function validateVoyage(value:unknown):VoyagePack|null{
  if(!value||typeof value!=='object')return null
  const p=value as VoyagePack
  if(!validVoyageKey(p.key)||!safeText(p.title,60)||!['builtin','generated'].includes(p.source)||!Array.isArray(p.monsters)||p.monsters.length!==4)return null
  const monsters=p.monsters.map(validateMonster)
  if(monsters.some(m=>!m)||new Set(monsters.map(m=>m!.family)).size!==4)return null
  return {key:p.key,title:p.title,monsters:monsters as MonsterRecipe[],source:p.source,...(typeof p.model==='string'&&p.model.length<100?{model:p.model}:{}),...(typeof p.generatedAt==='string'?{generatedAt:p.generatedAt}:{}),...(Number.isFinite(p.latencyMs)?{latencyMs:p.latencyMs}:{})}
}
export const DEFAULT_VOYAGE:VoyagePack={key:'ark-v1:0:0',title:'The Lantern Sea',source:'builtin',monsters:[
  {name:'Cathedral Crab',family:'crab',palette:'jade',trait:'bulwark',ornament:'antlers',scale:1.15,segments:6,caption:'An armored pilgrim carrying a forest of brass antlers.'},
  {name:'Moonlit Lantern Manta',family:'manta',palette:'orchid',trait:'skirmisher',ornament:'lanterns',scale:1.3,segments:4,caption:'A velvet-winged hunter whose lanterns illuminate the storm.'},
  {name:'Crown of Rain',family:'jelly',palette:'opal',trait:'tempest',ornament:'halo',scale:1,segments:8,caption:'A floating crown that rings the sea with falling stars.'},
  {name:'Brassbone Stormwyrm',family:'wyrm',palette:'sunmetal',trait:'ambush',ornament:'spines',scale:1,segments:7,caption:'A long armored serpent that coils before its thunderous lunge.'},
]}
