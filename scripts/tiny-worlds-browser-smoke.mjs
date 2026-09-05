import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ui=process.env.UI_URL??'http://127.0.0.1:5173/pongapp/'
const output=process.env.QA_OUTPUT??await mkdtemp(join(tmpdir(),'tiny-worlds-qa-'))
await mkdir(output,{recursive:true})
const profile=await mkdtemp(join(tmpdir(),'tiny-worlds-chrome-'))
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']})
const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome start timed out')),15000);chrome.stderr.on('data',data=>{const m=String(data).match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1])}});chrome.once('exit',code=>reject(Error('Chrome exited '+code)))})
const ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
let serial=0;const pending=new Map(),errors=[]
ws.onmessage=({data})=>{const m=JSON.parse(String(data));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);const p=pending.get(m.id);if(p){pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}}
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}))})
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const {targetId}=await send('Target.createTarget',{url:'about:blank'})
const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result?.value}
async function waitFor(expression,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate('Boolean('+expression+')'))return;await sleep(100)}throw Error('Timed out: '+expression)}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId);await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'))}
async function size(width,height){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600},sessionId)}
const results=[]
try {
  await send('Page.enable',{},sessionId);await send('Runtime.enable',{},sessionId)
  await size(390,844);await send('Page.navigate',{url:ui},sessionId)
  await waitFor("document.querySelector('.expedition-canvas')?.dataset.renderer==='webgl-3d'")
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Solo Adventure')).click()")
  await waitFor("document.querySelector('.crew-game') && !document.querySelector('.expedition-countdown') && document.querySelector('.expedition-canvas')?.dataset.renderer==='webgl-3d'")
  // Own disposable solo game only: establish reproducible busy scenes, not network rooms.
  await evaluate("(()=>{let n=document.querySelector('.crew-game');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))];while(f&&!f.memoizedProps?.getState)f=f.return;globalThis.qaProps=f.memoizedProps})()")
  for(let world=0;world<5;world++){
    await evaluate(`(()=>{const s=qaProps.getState();s.tick=180+${world}*1440+260;s.crew.finishedTick=null;s.phase='playing';s.hearts=3;s.invulnerableTicks=900;s.boat.x=.5;s.boat.heading=0;s.distance=12;s.crew.choiceTicks=0;s.crew.shotCooldown=1000;s.crew.bossSpawned=true;s.objects=[{id:8000,type:'predator',enemy:'ambusher',x:.7,y:.42,age:10,hp:18,maxHp:18,targetX:.5,targetY:.76},{id:8001,type:'predator',enemy:'chaser',x:.24,y:.61,age:10,hp:12,maxHp:12,targetX:.5,targetY:.76},{id:8002,type:'rescue',x:.66,y:.6},{id:8003,type:'gate',x:.35,y:.24},{id:8004,type:'relic',x:.54,y:.44},{id:8005,type:'firefly',x:.5,y:.56},{id:8006,type:'firefly',x:.4,y:.34},{id:8007,type:'rock',x:.21,y:.48}].map(o=>({radius:.04,phase:0,drift:0,...o}));s.nextObjectId=9000})()`)
    await sleep(700);await screenshot('world-'+world+'-mobile')
    await size(1440,960);await sleep(120);await screenshot('world-'+world+'-desktop');await size(390,844)
    await send('Emulation.setCPUThrottlingRate',{rate:4},sessionId)
    const sample=await evaluate(`new Promise(resolve=>{const gaps=[],stats=[];let last=performance.now();const end=last+5000;function frame(now){gaps.push(now-last);last=now;const raw=document.querySelector('.expedition-canvas').dataset.renderStats;if(raw)stats.push(JSON.parse(raw));if(now<end)requestAnimationFrame(frame);else{gaps.sort((a,b)=>a-b);resolve({frames:gaps.length,frameP95Ms:gaps[Math.floor(gaps.length*.95)],maxFrameMs:gaps.at(-1),freezes:gaps.filter(n=>n>250).length,maxDrawCalls:Math.max(...stats.map(s=>s.drawCalls)),maxTriangles:Math.max(...stats.map(s=>s.triangles)),maxRenderMs:Math.max(...stats.map(s=>s.renderMs)),dpr:stats.at(-1)?.dpr,renderer:document.querySelector('.expedition-canvas').dataset.renderer})}}requestAnimationFrame(frame)})`)
    await send('Emulation.setCPUThrottlingRate',{rate:1},sessionId)
    results.push({world,cpuSlowdown:4,durationMs:5000,...sample})
    if(sample.renderer!=='webgl-3d'||sample.freezes||sample.frameP95Ms>25||sample.maxDrawCalls>60||sample.maxTriangles>180000)throw Error('Frame/resource budget exceeded: '+JSON.stringify(results.at(-1)))
  }
  const layout=[]
  for(const [width,height] of [[320,700],[375,812],[390,844],[844,390]]){
    await size(width,height);await sleep(150)
    const info=await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,hearts:[...document.querySelectorAll('.expedition-hearts svg')].map(e=>e.getBoundingClientRect().toJSON()),canvas:document.querySelector('.expedition-canvas').getBoundingClientRect().toJSON()})")
    if(info.overflow||info.canvas.width<100||info.canvas.height<100||info.hearts.length!==3||info.hearts.some(h=>h.width<10||h.left<0||h.right>width))throw Error('Invalid narrow/orientation layout: '+JSON.stringify(info))
    layout.push({width,height,...info});await screenshot('layout-'+width+'x'+height)
  }
  await size(390,844)
  // A lost GPU context must retain a responsive, targetable fallback, not a black game.
  await evaluate("document.querySelector('.expedition-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
  await waitFor("document.querySelector('.expedition-canvas')?.dataset.renderer==='canvas-fallback'")
  await sleep(200);await screenshot('context-loss-fallback')
  const before=await evaluate('qaProps.getState().boat.x')
  await evaluate('qaProps.onCrew({steer:1})');await sleep(120)
  if(await evaluate('qaProps.getState().boat.x')===before)throw Error('Controls stopped after GPU context loss')
  await evaluate('qaProps.onCrew({steer:0})')
  // A failed model download must also preserve the instantly usable base game.
  await send('Network.enable',{},sessionId)
  await send('Network.setBlockedURLs',{urls:['*tiny-worlds.glb*']},sessionId)
  await send('Page.navigate',{url:ui},sessionId)
  await waitFor("document.querySelector('.expedition-canvas')?.dataset.renderer==='canvas-fallback'")
  await screenshot('asset-failure-fallback')
  if(errors.length)throw Error('Browser exceptions: '+JSON.stringify(errors))
  await writeFile(join(output,'results.json'),JSON.stringify({results,layout,contextLossFallback:'passed with responsive controls',assetFailureFallback:'passed',browserErrors:errors.length,output},null,2))
  console.log(JSON.stringify({results,contextLossFallback:'passed with responsive controls',assetFailureFallback:'passed',browserErrors:errors.length,output},null,2))
} finally {ws.close();chrome.kill('SIGTERM')}
