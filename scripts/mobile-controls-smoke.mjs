import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ui=process.env.UI_URL??'http://127.0.0.1:5173/pongapp/'
const output=process.env.QA_OUTPUT??await mkdtemp(join(tmpdir(),'mobile-controls-qa-'))
await mkdir(output,{recursive:true})
const profile=await mkdtemp(join(tmpdir(),'mobile-controls-chrome-'))
const chrome=spawn(process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']})
const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome timeout')),15000);chrome.stderr.on('data',d=>{const m=String(d).match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1])}});chrome.once('exit',code=>reject(Error('Chrome exited '+code)))})
const ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
let serial=0;const pending=new Map(),errors=[]
ws.onmessage=({data})=>{const m=JSON.parse(String(data));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);const p=pending.get(m.id);if(p){pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}}
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}))})
const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result?.value}
async function until(expression,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate('Boolean('+expression+')'))return;await new Promise(r=>setTimeout(r,50))}throw Error('Timed out: '+expression)}
async function click(selector){await until(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)}
async function box(selector){return evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`)}
async function capture(name){const r=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'))}
async function touch(type,points=[]){await send('Input.dispatchTouchEvent',{type,touchPoints:points},sessionId)}
async function hold(selector){const b=await box(selector);await touch('touchStart',[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}])}
const results=[]
try{
  await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId)
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},sessionId)
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true},sessionId)
  await send('Page.navigate',{url:ui},sessionId);await until("document.querySelector('.oars-launch--solo')")
  await click('.oars-launch--solo');await until("document.querySelector('.crew-action-row') && !document.querySelector('.expedition-countdown')")
  await evaluate("(()=>{const n=document.querySelector('.crew-game');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))];while(f&&!f.memoizedProps?.getState)f=f.return;globalThis.qaProps=f.memoizedProps;const s=qaProps.getState();s.objects=[];s.invulnerableTicks=100000})()")
  // Only the disposable, browser-local solo state is adjusted for repeatable fixtures.
  const before=await evaluate('qaProps.getState().boat.x'),start=Date.now()
  await hold('[aria-label="Steer right"]');await until("document.querySelector('[aria-label=\"Steer right\"]').dataset.held==='true'")
  const responseMs=Date.now()-start
  await until(`qaProps.getState().boat.x>${before}`)
  assert.match(await evaluate("document.querySelector('.crew-input-feedback').textContent"),/Steering right/)
  await touch('touchCancel');await until("!document.querySelector('[data-held=true]')")
  results.push({test:'real touch: immediate held feedback, local steering, cancel releases',responseMs})
  await click('[data-job="gunner"]');await until("document.querySelector('.crew-action-row').dataset.station==='gunner'")
  assert.match(await evaluate("document.querySelector('.crew-job-hint').textContent"),/automatically/)
  await hold('.crew-primary');await until("qaProps.getState().crew.heat>15")
  assert.match(await evaluate("document.querySelector('.crew-primary').textContent"),/Rapid firing/)
  await capture('phone-shoot-held');await touch('touchEnd')
  const heat=await evaluate('qaProps.getState().crew.heat');await until(`qaProps.getState().crew.heat<${heat}`)
  const cb=await box('.expedition-canvas'),cx=cb.x+cb.width/2,cy=cb.y+cb.height/2
  await touch('touchStart',[{x:cx-35,y:cy,id:2},{x:cx+35,y:cy,id:3}]);await touch('touchMove',[{x:cx-65,y:cy,id:2},{x:cx+65,y:cy,id:3}]);await touch('touchEnd')
  await until("Number(document.querySelector('.expedition-canvas').dataset.zoom)>1.2")
  await click('[aria-label="Reset camera zoom"]');await until("document.querySelector('.expedition-canvas').dataset.zoom==='1.00'")
  results.push({test:'gunner explains auto-fire; held fire adds heat; release cools; pinch and camera reset',status:'passed'})
  await click('[data-job="engineer"]');await until("document.querySelector('.crew-action-row').dataset.station==='engineer'")
  await evaluate('qaProps.getState().hearts=2;qaProps.getState().crew.scrap=3')
  await until("!document.querySelector('.crew-primary').disabled")
  await hold('.crew-primary');await until('qaProps.getState().crew.repair>15')
  await capture('phone-repair-held');await until("document.querySelector('.crew-hull').dataset.hearts==='3'")
  await touch('touchEnd');assert.equal(await evaluate('qaProps.getState().crew.scrap'),0)
  await hold('.crew-ability');await touch('touchEnd');await until('qaProps.getState().crew.shieldCooldown>0')
  await click('.crew-help-button');await until("document.querySelector('.crew-guide').open")
  assert.match(await evaluate("document.querySelector('.crew-guide').textContent"),/3 scrap/)
  await capture('phone-controls-guide');await click('.crew-guide>button');await until("!document.querySelector('.crew-guide').open")
  results.push({test:'repair adds heart, spends exactly 3 scrap; shield; accessible in-game instructions',status:'passed'})
  for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[1440,900]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:width<600?3:1,mobile:width<600},sessionId)
    for(const job of ['pilot','gunner','engineer']){
      await click(`[data-job="${job}"]`);await until(`document.querySelector('.crew-action-row').dataset.station==='${job}'`)
      await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
      const layout=await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.querySelector('.expedition-canvas').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.crew-controls button,.crew-help-button')].filter(b=>b.getClientRects().length).map(b=>{const r=b.getBoundingClientRect();return {name:b.textContent,...r.toJSON(),uncovered:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}),hearts:document.querySelectorAll('.expedition-hearts svg').length})")
      assert.equal(layout.overflow,false);assert.equal(layout.hearts,3)
      assert.ok(layout.canvas.height>=140,`${width}x${height} ${job}: game area`)
      for(const b of layout.buttons){assert.ok(b.height>=43&&b.width>=43,`small touch target ${b.name}`);assert.ok(b.x>=0&&b.right<=width+1&&b.y>=0&&b.bottom<=height+1,`clipped ${width}x${height} ${job} ${b.name}`);assert.ok(b.uncovered,`covered ${b.name}`)}
      await capture(`${width}x${height}-${job}`);results.push({test:'layout',width,height,job,canvasHeight:layout.canvas.height,status:'passed'})
    }
  }
  assert.deepEqual(errors,[])
  await writeFile(join(output,'results.json'),JSON.stringify({ui,results,errors,physicalDeviceTest:false},null,2));console.log(JSON.stringify({results,errors,output},null,2))
}finally{ws.close();chrome.kill('SIGTERM')}
