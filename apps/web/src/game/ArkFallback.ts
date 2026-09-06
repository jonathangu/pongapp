import { CREW_ROOMS, type CoopGameState, type RiverObject } from '@pongapp/game-core'

/** Readable zero-WebGL backup, preserving the same moving crew and room positions. */
export function drawFallbackArk(ctx:CanvasRenderingContext2D,state:CoopGameState,x:number,y:number,size:number,angle:number){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle*.38);ctx.scale(size,size*.72)
  ctx.fillStyle='#267b81';ctx.beginPath();ctx.ellipse(0,0,2.75,3.2,0,0,Math.PI*2);ctx.fill()
  ctx.fillStyle='#f8e7c5';ctx.fillRect(-1.08,-2.75,2.16,5.5);ctx.fillRect(-2.65,-1.08,5.3,2.16)
  for(const room of CREW_ROOMS){
    ctx.fillStyle=room.color;ctx.fillRect(room.x-.7,room.z-.7,1.4,1.4)
    ctx.strokeStyle='#eac98f';ctx.lineWidth=.055;ctx.strokeRect(room.x-.72,room.z-.72,1.44,1.44)
    ctx.fillStyle='#244149';ctx.font='bold .55px sans-serif';ctx.textAlign='center';ctx.fillText(room.icon,room.x,room.z+.2)
  }
  ctx.fillStyle='#25414a';ctx.fillRect(-.44,-2.78,.88,.55);ctx.fillStyle='#eac98f';ctx.fillRect(-.16,-3.24,.32,.6)
  ctx.fillStyle='#eac98f';ctx.fillRect(-.6,2.34,1.2,.35)
  for(const p of Object.values(state.players)){
    const d=p.deck,run=d.moving?Math.sin(d.step*11):0
    ctx.save();ctx.translate(d.x+(d.moving?0:p.side==='left'?-.18:.18),d.z);ctx.rotate(-d.heading)
    ctx.fillStyle='#173642';ctx.fillRect(-.22,-.08,.18,.38+run*.09);ctx.fillRect(.05,-.08,.18,.38-run*.09)
    ctx.fillStyle=p.side==='left'?'#66d9ce':'#f39e88';ctx.beginPath();ctx.ellipse(0,-.23,.31,.43,0,0,Math.PI*2);ctx.fill()
    ctx.strokeStyle='#f6d496';ctx.lineWidth=.12;ctx.beginPath();ctx.moveTo(-.26,-.25);ctx.lineTo(-.4,-.1+run*.16);ctx.moveTo(.26,-.25);ctx.lineTo(.4,-.1-run*.16);ctx.stroke()
    ctx.fillStyle='#f4e9cd';ctx.beginPath();ctx.arc(0,-.58,.32,0,Math.PI*2);ctx.fill();ctx.fillStyle='#24434f';ctx.fillRect(-.23,-.73,.46,.16);ctx.restore()
  }
  ctx.restore()
}
export function drawFallbackBeast(ctx:CanvasRenderingContext2D,o:RiverObject,x:number,y:number,size:number,time:number){
  const s=size*(o.enemy==='boss'?1.8:1.3);ctx.save();ctx.translate(x,y)
  ctx.fillStyle=o.attackPhase==='telegraph'?'#f0b28a':'#8bb7bd';ctx.strokeStyle='#f5d29b';ctx.lineWidth=2
  if(o.family==='manta'){
    ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(-s*2.3,s*.15+Math.sin(time*3)*s*.2);ctx.lineTo(-s*.4,s);ctx.lineTo(0,s*1.6);ctx.lineTo(s*.4,s);ctx.lineTo(s*2.3,s*.15+Math.sin(time*3)*s*.2);ctx.closePath();ctx.fill();ctx.stroke()
  }else if(o.family==='jelly'){
    ctx.beginPath();ctx.ellipse(0,-s*.3,s,s*.7,0,0,Math.PI*2);ctx.fill()
    for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo((i-3)*s*.23,0);ctx.quadraticCurveTo((i-3)*s*.28+Math.sin(time*3+i)*s*.25,s*.8,(i-3)*s*.24,s*1.5);ctx.stroke()}
  }else if(o.family==='wyrm'){
    for(let i=6;i>=0;i--){ctx.beginPath();ctx.ellipse(Math.sin(time*3-i*.5)*s*.3,i*s*.38,s*(.5-i*.045),s*.29,0,0,Math.PI*2);ctx.fill();ctx.stroke()}
  }else{
    for(const side of [-1,1]){for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(side*s*.5,(i-1.5)*s*.25);ctx.lineTo(side*s*1.4,(i-1.5)*s*.4);ctx.stroke()}ctx.fillRect(side*s*1.1-s*.3,-s*.9,s*.6,s*.5)}
    ctx.beginPath();ctx.ellipse(0,0,s,s*.7,0,0,Math.PI*2);ctx.fill();ctx.stroke()
  }
  ctx.fillStyle='#f9eaa9';for(const side of [-1,1]){ctx.beginPath();ctx.arc(side*s*.23,-s*.36,s*.11,0,Math.PI*2);ctx.fill()}
  ctx.restore()
}
