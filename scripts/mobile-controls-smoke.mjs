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
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const counts=()=>evaluate("structuredClone(qaProps.getState().crew.actions['solo-human']??{left:0,right:0,shoot:0,recover:0})")
async function tap(action){await hold('[data-action="'+action+'"]');await touch('touchEnd')}
try{
  await send('Runtime.enable',{},sessionId);await send('Page.enable',{},sessionId)
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},sessionId)
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true},sessionId)
  await send('Page.navigate',{url:ui},sessionId);await until("document.querySelector('.oars-launch--solo')")
  await click('.oars-launch--solo');await until("document.querySelector('.crew-tap-grid') && !document.querySelector('.expedition-countdown')")
  await evaluate("(()=>{const n=document.querySelector('.crew-game');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))];while(f&&!f.memoizedProps?.getState)f=f.return;globalThis.qaProps=f.memoizedProps;const s=qaProps.getState();s.objects=[];s.invulnerableTicks=100000})()")
  const before=await counts(),x=await evaluate('qaProps.getState().boat.x'),start=Date.now()
  await hold('[data-action="right"]')
  await until("document.querySelector('[data-action=right]').dataset.active==='true'")
  const responseMs=Date.now()-start
  await pause(700);assert.equal((await counts()).right,before.right+1)
  await until('qaProps.getState().boat.x>'+x)
  await touch('touchEnd');await pause(80);assert.equal((await counts()).right,before.right+1)
  for(let i=0;i<3;i++)await tap('left')
  await until("qaProps.getState().crew.actions['solo-human'].left===3")
  results.push({test:'real touch: hold counts once, release does not add a tap, three rapid taps preserved',responseMs})
  const shots=(await counts()).shoot
  await hold('[data-action="shoot"]');await pause(650);assert.equal((await counts()).shoot,shots+1)
  await touch('touchEnd');await pause(80);assert.equal((await counts()).shoot,shots+1)
  for(let i=0;i<3;i++)await tap('shoot')
  await until("qaProps.getState().crew.actions['solo-human'].shoot==="+(shots+4))
  await capture('phone-cannon-taps')
  // Keyboard auto-repeat is ignored; a fresh key press is another action.
  await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyJ',key:'j',windowsVirtualKeyCode:74},sessionId)
  for(let i=0;i<4;i++)await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyJ',key:'j',windowsVirtualKeyCode:74,autoRepeat:true},sessionId)
  await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyJ',key:'j',windowsVirtualKeyCode:74},sessionId)
  await pause(80);assert.equal((await counts()).shoot,shots+5)
  results.push({test:'shoot: one shell command per physical press, burst taps preserved, keyboard repeat ignored',status:'passed'})
  await evaluate('qaProps.getState().hearts=2;qaProps.getState().crew.scrap=3;qaProps.getState().crew.repair=0')
  await until("!document.querySelector('[data-action=recover]').disabled")
  await hold('[data-action="recover"]');await pause(650)
  assert.equal(await evaluate('qaProps.getState().crew.repair'),1)
  await touch('touchEnd');await pause(80);assert.equal(await evaluate('qaProps.getState().crew.repair'),1)
  for(let i=0;i<4;i++)await tap('recover')
  await until('qaProps.getState().crew.repair===5');await capture('phone-repair-five-taps')
  await tap('recover');await until("document.querySelector('.crew-hull').dataset.hearts==='3'")
  assert.equal(await evaluate('qaProps.getState().crew.scrap'),0)
  const cb=await box('.expedition-canvas'),cx=cb.x+cb.width/2,cy=cb.y+cb.height/2
  await touch('touchStart',[{x:cx-65,y:cy,id:2},{x:cx+65,y:cy,id:3}])
  await touch('touchMove',[{x:cx-35,y:cy,id:2},{x:cx+35,y:cy,id:3}]);await touch('touchEnd')
  await until("Number(document.querySelector('.expedition-canvas').dataset.zoom)<.9")
  await click('[aria-label="Reset camera zoom"]');await until("document.querySelector('.expedition-canvas').dataset.zoom==='0.90'")
  await evaluate('qaProps.getState().tick=1259')
  await until("qaProps.getState().crew.upgrades.includes('twin')")
  assert.equal(await evaluate("document.querySelectorAll('.crew-upgrades,dialog[open]').length"),0)
  await click('.crew-help-button');await until("document.querySelector('.crew-guide').open")
  assert.match(await evaluate("document.querySelector('.crew-guide').textContent"),/3 scrap/)
  await capture('phone-controls-guide');await click('.crew-guide>button');await until("!document.querySelector('.crew-guide').open")
  results.push({test:'six repair taps restore a heart for exactly 3 scrap; pinch/reset wide camera; upgrade auto-equips with no popup',status:'passed'})
  for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[1440,900]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:width<600?3:1,mobile:width<600},sessionId)
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const layout=await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.querySelector('.expedition-canvas').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.crew-controls button,.crew-help-button,.crew-camera button')].map(b=>{const r=b.getBoundingClientRect();return {name:b.textContent,...r.toJSON(),uncovered:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}}),hearts:document.querySelectorAll('.expedition-hearts svg').length})")
    assert.equal(layout.overflow,false);assert.equal(layout.hearts,3);assert.ok(layout.canvas.height>=140)
    for(const b of layout.buttons){assert.ok(b.height>=43&&b.width>=43,'small touch target '+b.name);assert.ok(b.x>=0&&b.right<=width+1&&b.y>=0&&b.bottom<=height+1,'clipped '+width+'x'+height+' '+b.name);assert.ok(b.uncovered,'covered '+b.name)}
    await capture(width+'x'+height+'-four-buttons');results.push({test:'layout',width,height,canvasHeight:layout.canvas.height,status:'passed'})
  }
  assert.deepEqual(errors,[])
  await writeFile(join(output,'results.json'),JSON.stringify({ui,results,errors,physicalDeviceTest:false},null,2));console.log(JSON.stringify({results,errors,output},null,2))
}finally{ws.close();chrome.kill('SIGTERM')}
