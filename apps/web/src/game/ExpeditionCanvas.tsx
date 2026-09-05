import { useEffect, useRef } from 'react'
import { EXPEDITION_WORLDS, expeditionWorld, type CoopGameState } from '@pongapp/game-core'

type Point = [number, number]
const TAU = Math.PI * 2
const noise = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }

/** A small, depth-sorted isometric renderer. No textures, downloads or per-frame React tree. */
export function drawExpedition(ctx: CanvasRenderingContext2D, w: number, h: number, state: CoopGameState, time: number): void {
  const world = expeditionWorld(state)
  const theme = EXPEDITION_WORLDS[world]!
  const unit = Math.min(w / 1.95, h / 1.3)
  const t = time / 1000
  const project = (x: number, y: number, z = 0): Point => {
    const u = (x - .5) * unit * .92; const v = (y - .5) * unit * 1.42
    return [w * .5 + (u - v) * .866, h * .53 + (u + v) * .5 - z]
  }
  const poly = (points: Point[], fill: string, stroke?: string) => {
    ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath()
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke() }
  }
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient) => {
    ctx.beginPath(); ctx.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,TAU); ctx.fillStyle = fill; ctx.fill()
  }
  const line = (a: Point, b: Point, color: string, width = 1) => {
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke()
  }
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,color); g.addColorStop(1,'transparent'); ellipse(x,y,r,r,g)
  }
  const prism = (x: number, y: number, size: number, height: number, top: string, left: string, right: string) => {
    const a=project(x-size,y-size), b=project(x+size,y-size), c=project(x+size,y+size), d=project(x-size,y+size)
    const up = ([px,py]: Point): Point => [px,py-height]
    poly([d,c,up(c),up(d)],left); poly([b,c,up(c),up(b)],right); poly([up(a),up(b),up(c),up(d)],top)
  }
  const tree = (x: number, y: number, scale: number, variant: number) => {
    const [px,py] = project(x,y,8); const s = unit * .09 * scale
    ellipse(px,py+3,s*.65,s*.18,'#091d3038')
    line([px,py],[px+2,py-s*1.5],world===1?'#68382f':'#45534a',Math.max(3,s*.12))
    if (world===0 && variant>.45) {
      for(let i=0;i<5;i++) { const a=i*1.3+t*.03; const tip:Point=[px+Math.cos(a)*s,py-s*1.4+Math.sin(a)*s*.4]; poly([[px,py-s*1.5],[tip[0],tip[1]+7],[tip[0]*.3+px*.7,tip[1]-6]], i%2?'#54a06a':'#2c7654') }
    } else {
      for(let i=0;i<3;i++) { const sy=py-i*s*.4; const r=s*(1-i*.19); poly([[px-r*.65,sy],[px,sy-s],[px+r*.65,sy]], world===2?(i===2?'#eff9ed':'#bbd7dc'):world===1?'#ad7160':i%2?'#488968':'#2b6757') }
    }
  }

  ctx.clearRect(0,0,w,h)
  const sky=ctx.createLinearGradient(0,0,0,h); sky.addColorStop(0,theme.sky); sky.addColorStop(.7,world===4?'#37285b':world===1?'#e7a379':world===3?'#c5c6dc':'#82a4a0'); sky.addColorStop(1,theme.sky)
  ctx.fillStyle=sky; ctx.fillRect(0,0,w,h)
  // Sky panorama: distant layers, a setting sun, and orbiting constellations.
  const sunX=w*.77, sunY=h*.17
  glow(sunX,sunY,w*.25,world===4?'#9482ed44':'#ffe0a54a')
  ellipse(sunX,sunY,w*.087,w*.087,world===4?'#e2def5':'#ffe5b1')
  if(world===4) {
    ellipse(sunX+w*.035,sunY-w*.015,w*.079,w*.079,'#302344')
    for(let i=0;i<65;i++) { const x=noise(i)*w, y=noise(i+83)*h; ellipse(x,y,.6+noise(i+42)*1.4,.6+noise(i+42)*1.4,`rgba(219,245,255,${.25+(Math.sin(t+ i)+1)*.28})`) }
    ctx.save();ctx.translate(w*.2,h*.2);ctx.rotate(-.3);ctx.strokeStyle='#b1c5fb50';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,0,w*.17,w*.035,0,0,TAU);ctx.stroke();ellipse(0,0,w*.064,w*.064,'#897bb0');ctx.restore()
  } else if(world!==3) {
    for(let layer=0;layer<3;layer++) {
      const base=h*(.29+layer*.07); const points:Point[]=[[0,h]]
      for(let i=-1;i<9;i++) points.push([i*w/7,base-noise(i+layer*11)*h*(.16-layer*.025)])
      points.push([w,h]);poly(points,[world===1?'#9c6672':'#506f80',world===1?'#a56864':'#527e80',world===1?'#a77465':'#598889'][layer]!)
      if(world===2) for(let i=0;i<7;i++) { const px=i*w/7, py=base-noise(i+layer*11)*h*(.16-layer*.025);poly([[px-13,py+18],[px,py],[px+17,py+22],[px+3,py+15],[px-3,py+20]],'#e8f4eeaa') }
    }
  }
  if(world===3) {
    const colors=['#f79daf','#ffc190','#f4e7a1','#9eddc4','#9ecafa','#b9b1f5']
    colors.forEach((c,i)=> {ctx.beginPath();ctx.arc(w*.56,h*.38,w*.43-i*7,Math.PI*1.08,Math.PI*1.93);ctx.lineWidth=7;ctx.strokeStyle=c;ctx.globalAlpha=.7;ctx.stroke();ctx.globalAlpha=1})
  }
  for(let i=0;i<(world===3?14:5);i++) {
    const cx=((noise(i+10)*w+t*(3+noise(i)*3))%(w+140))-70, cy=noise(i+100)*h*.38
    const r=18+noise(i+1)*30
    ellipse(cx,cy,r*1.5,r*.28,world===4?'#8f80b011':'#eff2df22');ellipse(cx+10,cy-r*.17,r*.7,r*.4,world===4?'#8f80b011':'#eff2df22')
  }
  const edge=[project(0,-.32),project(1,-.32),project(1,1.32),project(0,1.32)]
  if(world<3) {
    poly(edge,theme.water)
    poly([edge[3]!,edge[2]!,[edge[2]![0],edge[2]![1]+35],[edge[3]![0],edge[3]![1]+35]],'#254658')
  } else {
    // Air and space have open skies, no reskinned river slab.
    glow(w*.45,h*.58,w*.6,world===4?'#886adf28':'#d3d7ff22')
    for(const x of [.08,.92]) {ctx.setLineDash([2,14]);line(project(x,-.25),project(x,1.2),world===4?'#bba4f255':'#fff2d355',1);ctx.setLineDash([])}
  }
  ctx.save(); ctx.beginPath();edge.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.clip()
  for(let i=0;i<28;i++) {
    const y=((i/20+state.distance*.045)%1.65)-.32
    const x=noise(i+15)*.85+.075
    const a=project(x,y),b=project(x+.05+noise(i)*.1,y)
    line(a,b,world===1?'#efc08b66':world===2?'#e5ffff80':world===4?'#93a1ec33':'#b4f0df45',world===1?3:1)
  }
  if(world===1||world===2) {
    for(let j=0;j<2;j++) { const x=j?.8:.2;line(project(x,-.3),project(x,1.3),world===1?'#724c5144':'#567c9633',unit*.04) }
  }
  ctx.restore()

  const entities:Array<{depth:number;draw:()=>void}>=[]
  // Raised terrain and island silhouettes, ordered with the vehicle and creatures.
  for(let i=0;i<(world>=3?12:28);i++) {
    const side=i%2; const y=((Math.floor(i/2)/(world>=3?3.5:9)+state.distance*.025)%1.75)-.35
    const x=side?1.08+noise(i)*.3:-.08-noise(i)*.3
    entities.push({depth:project(x,y)[1],draw:()=>{
      const elevation=(world===3||world===4?18:9)+noise(i+4)*18
      const top=world===0?'#478660':world===1?'#d28d6f':world===2?'#d2e3df':world===3?'#adcdbd':'#665793'
      prism(x,y,(world>=3?.035:.075)+noise(i)*.045,elevation,top,theme.bank,world===4?'#36294f':'#3d5660')
      if(world===0||world===1||world===2) tree(x,y,.55+noise(i)*.65,noise(i))
      else if(world===3) {const [px,py]=project(x,y,elevation);ellipse(px,py,unit*.065,unit*.025,'#f3f0dc');ellipse(px-8,py-6,unit*.035,unit*.027,'#fff6e4')}
      else {const [px,py]=project(x,y,elevation);poly([[px-8,py],[px,py-24],[px+8,py],[px,py+5]],'#ac97dd');line([px,py-24],[px,py+5],'#e1cdfb',1)}
      if(i%9===0) {prism(x,y,.033,elevation+unit*.08,'#d6c99e','#8d9377','#647c70');const [px,py]=project(x,y,elevation+unit*.1);glow(px,py,15,theme.glow+'70');ellipse(px,py,3,4,theme.glow)}
    }})
  }

  for(const object of state.objects) {
    const [x,y]=project(object.x,object.y)
    const s=unit*.062
    entities.push({depth:y,draw:()=> {
      ellipse(x,y+2,s*.8,s*.28,'#081a3828')
      const bob=Math.sin(t*3+object.id)*3
      if(object.type==='rock') {
        poly([[x-s,y],[x-s*.5,y-s*.8],[x+s*.35,y-s],[x+s,y-s*.15],[x+s*.4,y+s*.25]],world===4?'#8e7eb6':world===1?'#c39a82':'#809c9e')
        poly([[x-s*.5,y-s*.8],[x+s*.35,y-s],[x+s*.2,y-s*.2],[x-s,y]],world===2?'#f2faf1':'#b5c5be')
        poly([[x+s*.2,y-s*.2],[x+s,y-s*.15],[x+s*.4,y+s*.25],[x-s,y]],'#526b80')
      } else if(object.type==='log') {
        line([x-s,y-s*.4],[x+s,y+s*.4],world===4?'#b895d7':'#87684d',s*.65);ellipse(x+s,y+s*.4,s*.25,s*.31,'#d8b584');ellipse(x+s,y+s*.4,s*.11,s*.14,'#967451')
      } else if(object.type==='predator') {
        const warn=object.y>.24&&object.y<.58
        ctx.save();ctx.translate(x,y);ctx.rotate(.4)
        ellipse(0,0,s*1.6,s*.55,world===4?'#9685d1':world===3?'#da9ebb':world===0?'#5b9b58':'#625d77')
        poly([[-s,0],[-s*2.3,-s*.5],[-s*1.7,s*.2]],world===0?'#76b168':'#aa98ca')
        poly([[s*.5,-s*.4],[s*2,-s*.25],[s*2,s*.23],[s*.5,s*.5]],world===0?'#84b56d':'#bca4d2')
        for(let j=0;j<4;j++) poly([[s*.4+j*s*.36,s*.29],[s*.58+j*s*.36,s*.29],[s*.5+j*s*.36,s*.55]],'#fff1c4')
        ellipse(s*.7,-s*.38,3,3,warn?'#ffdc77':'#ff8c87');ellipse(s*.7,-s*.38,1,2,'#26274b');ctx.restore()
        if(warn) {ctx.fillStyle='#ffe0a1';ctx.font=`bold ${Math.max(13,s)}px sans-serif`;ctx.textAlign='center';ctx.fillText('!',x,y-s*1.3)}
      } else if(object.type==='gate') {
        ctx.save();ctx.translate(x,y-s*.4);ctx.scale(.65,1);ctx.beginPath();ctx.arc(0,0,s*1.7,0,TAU);ctx.strokeStyle=theme.glow;ctx.lineWidth=4;ctx.stroke();ctx.restore();glow(x,y,s*2,theme.glow+'24')
      } else if(object.type==='rescue') {
        ellipse(x,y-5+bob,s*.7,s*.43,'#ffd88f');ellipse(x+s*.27,y-s*.55+bob,s*.36,s*.36,'#ffebbb');ellipse(x+s*.4,y-s*.6+bob,1.7,1.7,'#283c50');poly([[x+s*.6,y-s*.4+bob],[x+s*.95,y-s*.3+bob],[x+s*.6,y-s*.2+bob]],'#f3986b')
        if(world===4) {ctx.strokeStyle='#a5edfa';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+s*.27,y-s*.55+bob,s*.48,0,TAU);ctx.stroke()}
      } else {
        const color=object.type==='heart'?'#ffa49e':object.type==='relic'?'#9cece1':theme.glow
        const size=object.type==='firefly'?s*.35:s*.7
        glow(x,y-8+bob,s*1.5,color+'60')
        if(object.type==='heart') {ctx.font=`${s*1.65}px serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText('♥',x,y+bob)}
        else {poly([[x,y-8-size+bob],[x+size*.65,y-8+bob],[x,y-8+size+bob],[x-size*.65,y-8+bob]],color);line([x,y-8-size+bob],[x,y-8+size+bob],'#fffbe3',1)}
      }
    }})
  }

  const [bx,by]=project(state.boat.x,.76)
  entities.push({depth:by,draw:()=>{
    const s=unit*.082
    ellipse(bx,by+7,s*1.25,s*.43,'#10294455')
    for(let i=0;i<5;i++) {const p=project(state.boat.x,.77+(i+1)*.035);ellipse(p[0],p[1],s*(.5+i*.12),s*.15,world===4?'#abc4f52b':'#d7f4db35')}
    if(state.flareTicks>0) {const radius=(1-state.flareTicks/60)*unit*.75;ctx.beginPath();ctx.ellipse(bx,by,Math.max(1,radius),Math.max(1,radius*.5),0,0,TAU);ctx.strokeStyle='#fff0b8';ctx.lineWidth=3;ctx.stroke();glow(bx,by,unit*.3,'#ffe5a033')}
    if(state.rushTicks>0) glow(bx,by,s*2.5,theme.glow+'55')
    ctx.save();ctx.translate(bx,by);ctx.rotate(-.52+state.boat.heading*8)
    if(state.invulnerableTicks>0 && Math.floor(t*10)%2===0) ctx.globalAlpha=.6
    if(theme.vehicle==='truck') {
      for(const px of [-s*.7,s*.7]) for(const py of [-s*.45,s*.45]) {ellipse(px,py,s*.4,s*.42,'#202c43');ellipse(px,py,s*.19,s*.2,'#8495a0');ellipse(px,py,s*.07,s*.08,'#e2d8ad')}
      poly([[-s,-s*.5],[s,-s*.5],[s,s*.4],[-s,s*.4]],'#deaa66');poly([[-s,-s*.5],[s,-s*.5],[s*.6,-s],[-s*.7,-s]],'#ffdf92');poly([[-s*.55,-s*.9],[s*.4,-s*.9],[s*.6,-s*.5],[-s*.6,-s*.5]],'#80c4cd');line([-s,s*.42],[s,s*.42],'#91513d',4)
      ellipse(s,-s*.25,3,3,'#fff4be');ellipse(s,s*.15,3,3,'#fff4be')
    } else if(theme.vehicle==='ship') {
      poly([[-s*1.3,s*.6],[0,-s*1.5],[s*1.3,s*.6],[s*.4,s*.45],[0,s],[-s*.4,s*.45]],'#c9dbe3');poly([[0,-s*1.5],[s*.4,s*.45],[0,s]],'#8ba7c2');ellipse(0,-s*.2,s*.32,s*.5,'#5fd2d0');glow(0,s,s,'#92f5ec77');poly([[-s*.3,s*.7],[0,s*(1.8+Math.sin(t*15)*.3)],[s*.3,s*.7]],'#b3fff0')
    } else {
      poly([[0,-s*1.55],[s*.67,-s*.55],[s*.64,s],[0,s*1.5],[-s*.64,s],[-s*.67,-s*.55]],'#d98d57');poly([[0,-s*1.55],[s*.67,-s*.55],[s*.64,s],[0,s*1.5],[s*.35,s*.65],[s*.38,-s*.5]],'#975a49');poly([[0,-s*1.15],[s*.44,-s*.4],[s*.39,s*.7],[0,s*.98],[-s*.39,s*.7],[-s*.44,-s*.4]],'#ffe0a1')
    }
    for(const side of [-1,1]) {
      const active=side===-1?state.paddles.left:state.paddles.right
      const oy=Math.sin(t*12)*s*.45*active
      line([side*s*.4,0],[side*s*1.6,oy],theme.vehicle==='truck'?'#a8cdd0':'#efcf8c',3)
      line([side*s*1.35,oy],[side*s*1.8,oy+s*.2],'#fff0b0',5)
      ellipse(0,side*s*.4-4,s*.22,s*.26,side===-1?'#96efe0':'#ffc486');ellipse(0,side*s*.4-8,s*.25,s*.12,side===-1?'#398e8a':'#cc8264')
    }
    if(theme.vehicle==='airship') {
      line([-s*.5,0],[-s*.65,-s*1.4],'#e9d8ba',1);line([s*.5,0],[s*.65,-s*1.4],'#e9d8ba',1)
      ellipse(0,-s*1.9,s*1.2,s*1.05,'#e8bf91');ellipse(-s*.25,-s*2,s*.8,s*.92,'#fff0bc');line([0,-s*2.93],[0,-s*.95],'#cc9c7b',3)
    }
    ctx.restore()
  }})
  entities.sort((a,b)=>a.depth-b.depth).forEach((entity)=>entity.draw())
  for(let i=0;i<15;i++) {const x=noise(i+230)*w+Math.sin(t*.5+i)*12,y=noise(i+250)*h;ellipse(x,y,1.1,1.1,theme.glow+'90')}
  const vignette=ctx.createRadialGradient(w*.5,h*.5,w*.15,w*.5,h*.5,Math.max(w,h)*.7);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#080d294a');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h)
}

export function ExpeditionCanvas({ getState, preview = false }: { getState: () => CoopGameState; preview?: boolean }) {
  const ref=useRef<HTMLCanvasElement>(null)
  useEffect(()=>{
    const canvas=ref.current;const ctx=canvas?.getContext('2d',{alpha:false});if(!canvas||!ctx)return
    let frame=0;let width=0;let height=0;let lastDraw=0
    const resize=()=>{const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(window.devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize()
    const draw=(now:number)=>{if(width&&height&&(!preview||now-lastDraw>33)){drawExpedition(ctx,width,height,getState(),now);lastDraw=now}frame=requestAnimationFrame(draw)}
    frame=requestAnimationFrame(draw);return()=>{cancelAnimationFrame(frame);observer.disconnect()}
  },[getState,preview])
  return <canvas ref={ref} className="expedition-canvas" aria-label="Isometric expedition through jungle, desert, mountains, rainbow skies and space" />
}
