import { BEAST_PALETTES, CREW_ROOMS, operatingStation, type CoopGameState, type RiverObject, type MonsterRecipe } from '@pongapp/game-core'

export type Part=(name:string,x:number,y:number,z:number,sx?:number,sy?:number,sz?:number,yaw?:number,color?:number,rx?:number,rz?:number)=>void

/** Authored Blender pivots, animated against authoritative crew positions. */
export function drawArk(part:Part,state:CoopGameState,t:number,aim:number,pitch:number){
  part('ark_hull',0,0,0);part('ark_controls',0,0,0)
  const firing=Object.values(state.players).some(p=>operatingStation(p)==='shoot')
  const recoil=firing?Math.max(0,(state.crew.shotCooldown-34)/8)*.18:0
  part('ark_cannon',0,1.06,-2.32+recoil,1,1,1,aim,0xffffff,pitch)
  part('ark_engine',0,.95,2.42,.72,.72,.72,t*(state.hearts<3?5:2))
  for(const room of CREW_ROOMS){
    const occupants=Object.values(state.players).filter(p=>p.station===room.id)
    if(occupants.length)part('_ring',room.x,.51,room.z,.53,1,.53,0,occupants.some(p=>!p.deck.moving)?0xc0ffe1:0xffd393)
  }
  for(const p of Object.values(state.players)){
    const d=p.deck,color=p.side==='left'?0x68dcd4:0xf6a18d
    const run=d.moving?Math.sin(d.step*11):0,work=!d.moving&&d.workTicks?Math.sin(t*7)*.06:0
    const x=d.x+(d.moving?0:p.side==='left'?-.18:.18),z=d.z,y=.49+Math.abs(run)*.06
    const limb=(name:string,lx:number,ly:number,lz:number,rx=0)=>part(name,x+Math.cos(d.heading)*lx+Math.sin(d.heading)*lz,y+ly,z-Math.sin(d.heading)*lx+Math.cos(d.heading)*lz,1,1,1,d.heading,color,rx)
    part('_ring',x,.5,z,.23,.6,.23,0,color)
    limb('crew_body',0,0,0,run*.07)
    limb('crew_head',0,1.07+work,0)
    for(const side of [-1,1]){
      limb('crew_boot',side*.13,.33,0,run*side*.7)
      limb('crew_arm',side*.27,.83,0,d.moving?-run*side*.8:d.workTicks?-.65+work:0)
    }
    if(d.moving){
      const room=CREW_ROOMS.find(r=>r.id===p.station)!
      const tx=d.viaCenter?0:room.x,tz=d.viaCenter?0:room.z
      for(let i=1;i<5;i++){const f=i/5;part('_particle',x+(tx-x)*f,.53,z+(tz-z)*f,.7,.3,.7,0,color)}
    }
  }
}

export function drawBeast(part:Part,o:RiverObject,t:number,recipe?:MonsterRecipe){
  const family=o.family??'crab',strike=o.attackPhase==='strike',warning=o.attackPhase==='telegraph'
  const motion=t*(strike?10:o.attackPhase==='recover'?1:3)+o.id
  const color=o.slowTicks?0x9edfff:warning?0xffd2ab:recipe?BEAST_PALETTES[recipe.palette]:0xffffff
  part('beast_'+family,0,0,0,1,1,1,0,color,0,Math.sin(motion)*.025)
  if(family==='crab'){
    for(const side of [-1,1]){
      for(let j=0;j<4;j++)part('crab_leg',side*.64,.5,(j-1.5)*.3,side,1,1,side*(j-1.5)*.3,color,Math.sin(motion+j)*.16)
      part('crab_claw',side*.55,.58,-.49,side,1,1,side*(warning?.65:Math.sin(motion)*.12),color,strike?-.65:0)
    }
  }else if(family==='manta'){
    for(const side of [-1,1])part('manta_wing',side*.27,.44,0,side,1,1,0,color,0,side*Math.sin(motion)*.32)
  }else if(family==='jelly'){
    const count=recipe?.segments??8
    for(let j=0;j<count;j++){const a=j/count*Math.PI*2;part('jelly_tentacle',Math.cos(a)*.56,.61,Math.sin(a)*.56,1,1,1,a,color,Math.sin(motion+j)*.24,Math.cos(motion+j)*.14)}
  }else{
    for(let j=0;j<(recipe?.segments??7);j++){
      const x=Math.sin(motion-j*.55)*.24,z=.65+j*.55,size=1-j*.085
      part('wyrm_segment',x,Math.sin(motion-j*.4)*.07,z,size,size,size,Math.cos(motion-j*.55)*.16,color)
      if(j%2===0)for(const side of [-1,1])part('wyrm_fin',x+side*.25,.52,z,side*size,size,size,0,color,0,side*Math.sin(motion+j)*.22)
    }
  }
  if(recipe?.ornament==='halo')part('_ring',0,1.65,0,1.05,1.05,1.05,t*.3,0xffe8aa,.12)
  if(recipe?.ornament==='spines')for(let i=0;i<5;i++)part('crystal',0,.9,-.2+i*.25,.16,.65,.16,0,0xffe6a4)
  if(recipe?.ornament==='antlers')for(const side of [-1,1]){part('crab_leg',side*.35,1.1,0,side,.9,-.9,0,0xffe9ac,0,side*.3);part('crystal',side*.85,1.58,-.1,.16,.55,.16,0,0xffe9ac)}
  if(recipe?.ornament==='lanterns')for(let i=0;i<3;i++)part('_shell',(i-1)*.45,1.25+Math.sin(t*2+i)*.14,.1,.35,.35,.35,0)
}
