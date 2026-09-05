import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ui=process.env.UI_URL??'http://127.0.0.1:5173/pongapp/'
const server=process.env.ROOM_SERVER_URL??'http://127.0.0.1:8787'
const artifacts=process.env.QA_OUTPUT??await mkdtemp(join(tmpdir(),'two-oars-qa-'))
await mkdir(artifacts,{recursive:true})
const profile=await mkdtemp(join(tmpdir(),'two-oars-chrome-'))
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-networking','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']})
const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome start timed out')),15000);chrome.stderr.on('data',data=>{const m=String(data).match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1])}});chrome.once('exit',code=>reject(Error('Chrome exited '+code)))})
const ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
let serial=0;const pending=new Map();const errors=[]
ws.onmessage=({data})=>{const m=JSON.parse(String(data));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);const p=pending.get(m.id);if(p){pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}}
const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,sessionId}))})
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const evaluate=async(session,expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result?.value}
async function waitFor(session,expression,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const value=await evaluate(session,'Boolean('+expression+')');if(value)return value;await sleep(100)}throw Error('Timed out: '+expression)}
async function page(width=390,height=844){const {browserContextId}=await send('Target.createBrowserContext');const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Page.enable',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600},sessionId);await send('Emulation.setFocusEmulationEnabled',{enabled:true},sessionId);await send('Page.navigate',{url:ui},sessionId);await waitFor(sessionId,"document.querySelector('.preview-worlds')");return sessionId}
async function screenshot(session,name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);await writeFile(join(artifacts,name+'.png'),Buffer.from(r.data,'base64'))}
const results=[]
async function verifyTapBurst(a,b,path){
  const id=await evaluate(b,'qav.participant.id')
  await evaluate(a,"qa.peer.state.hearts=2;qa.peer.state.crew.scrap=3;qa.peer.state.crew.repair=0;qa.peer.state.objects=[];qa.peer.state.invulnerableTicks=10000")
  await waitFor(b,'qa.peer.getState().hearts===2 && qa.peer.getState().crew.scrap===3')
  const before=await evaluate(a,`({...qa.peer.state.crew.actions[${JSON.stringify(id)}]})`)
  // Three identical cumulative packets carry a burst; neither coalescing nor duplication may lose/add taps.
  await evaluate(b,"(()=>{const p=qa.peer,send=p.send.bind(p);p.send=()=>{};for(let i=0;i<3;i++){qa.setCrew({tap:'right'});qa.setCrew({tap:'shoot'})}for(let i=0;i<6;i++)qa.setCrew({tap:'recover'});p.send=send;p.sendControl();p.sendControl();p.sendControl()})()")
  await waitFor(a,`qa.peer.state.crew.actions[${JSON.stringify(id)}].recover===${(before.recover??0)+6}`)
  await sleep(400)
  for(const session of [a,b]){
    const state=await evaluate(session,`({actions:qa.peer.getState().crew.actions[${JSON.stringify(id)}],hearts:qa.peer.getState().hearts,scrap:qa.peer.getState().crew.scrap})`)
    if(state.actions.right!==(before.right??0)+3||state.actions.shoot!==(before.shoot??0)+3||state.actions.recover!==(before.recover??0)+6||state.hearts!==3)throw Error(path+' duplicate/coalesced taps failed: '+JSON.stringify(state))
  }
  results.push({mode:'coop',path,tapBurst:'three steering + three shooting + six recovery taps, triplicate cumulative packets, exact once on both peers'})
}
try{
  // Real browser RTC peers, through the real private room signaling endpoint.
  if(!process.env.QA_UI_ONLY) for(const mode of ['coop','versus']){
    const a=await page(),b=await page()
    const roomResponse=await fetch(server+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hostName:'Peer QA',mode})});if(!roomResponse.ok)throw Error('Room create failed')
    const {roomCode}=await roomResponse.json()
    const cls=mode==='coop'?'RoomClient':'VersusClient'
    for(const [session,index] of [[a,0],[b,1]]){await evaluate(session,`(async()=>{const {${cls}}=await import(${JSON.stringify(new URL('src/online/'+cls+'.ts',ui).href)});globalThis.qa=new ${cls}(${JSON.stringify(server)},${JSON.stringify(roomCode)},{guestId:'qa-'+crypto.randomUUID(),displayName:'Player ${index}'});qa.subscribe(v=>globalThis.qav=v);qa.connect()})()`);await waitFor(session,'qav.participant?.id')}
    await waitFor(a,"qav.peer?.path==='local' && !qav.peer.paused && qav.gameState?.phase==='playing'",20000)
    await waitFor(b,"qav.peer?.path==='local' && !qav.peer.paused && qav.gameState?.phase==='playing'",20000)
    // Deliberately prevent all outbound gameplay on the guest. Its local control must still respond.
    const response=await evaluate(b,`new Promise(resolve=>{const p=qa.peer;const original=p.send.bind(p);p.send=()=>{};const before=${mode==='coop'?'p.getState().boat.x':'p.getState().racers[qav.participant.id].lane'};const at=performance.now();qa.${mode==='coop'?'setCrew({tap:"right"})':'tap()'};const poll=()=>{const after=${mode==='coop'?'p.getState().boat.x':'p.getState().racers[qav.participant.id].lane'};if(after!==before){p.send=original;resolve({localResponseMs:performance.now()-at,before,after})}else if(performance.now()-at>300){p.send=original;resolve({localResponseMs:999,before,after})}else requestAnimationFrame(poll)};requestAnimationFrame(poll)})`)
    if(response.localResponseMs>100)throw Error(mode+' did not predict input promptly: '+JSON.stringify(response))
    await sleep(250)
    const direct=await evaluate(a,'qav.peer')
    if(mode==='coop')await verifyTapBurst(a,b,'direct')
    await evaluate(b,"Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
    await waitFor(a,'qav.peer.paused');await waitFor(b,'qav.peer.paused')
    await evaluate(b,"Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'))")
    await waitFor(a,'!qav.peer.paused');await waitFor(b,'!qav.peer.paused')
    // Cloud signaling reconnect must not reset an already established direct game.
    const reconnectEpoch=await evaluate(a,'qa.peer.epoch')
    await evaluate(a,"qa.socket.close(4002,'QA reconnect')")
    try { await waitFor(a,"qa.socket?.readyState===1 && qav.status==='playing'",10000) }
    catch(error){console.log('Reconnect diagnostic',mode,await evaluate(a,'({status:qav.status,error:qav.error,socket:qa.socket?.readyState,peer:qav.peer})'));throw error}
    if(await evaluate(a,'qa.peer.epoch')!==reconnectEpoch)throw Error('Signaling reconnect reset direct match')
    const epoch=await evaluate(a,'qa.peer.epoch')
    const oldFrame=await evaluate(a,"({kind:'frame',epoch:qa.peer.epoch,state:qa.peer.state,controls:qa.peer.controls,consumed:qa.peer.consumed})")
    // Force ICE failure: relay must preserve host authority and epoch, with both simulations running.
    await evaluate(a,'qa.peer.pc.close()');await evaluate(b,'qa.peer.pc.close()')
    await waitFor(a,"qav.peer.path==='relay' && !qav.peer.paused")
    await sleep(400)
    const after=await evaluate(b,'({epoch:qa.peer.epoch,tick:qa.peer.getState().tick,peer:qav.peer})')
    if(after.epoch!==epoch||after.peer.paused)throw Error('Fallback restarted or stalled the match')
    if(mode==='coop')await verifyTapBurst(a,b,'relay')
    // Guest rematch adopts exactly the host's new epoch.
    await evaluate(a,"qa.peer.state.phase='finished'")
    try{await waitFor(b,"qa.peer.getState().phase==='finished'")}catch(error){console.log('Terminal relay diagnostic',mode,await evaluate(a,'({host:qa.peer.host,phase:qa.peer.getState().phase,tick:qa.peer.getState().tick,epoch:qa.peer.epoch,status:qav.peer})'),await evaluate(b,'({host:qa.peer.host,phase:qa.peer.getState().phase,tick:qa.peer.getState().tick,epoch:qa.peer.epoch,status:qav.peer})'));throw error}
    await evaluate(b,'qa.rematch()')
    await waitFor(a,`qa.peer.epoch!==${JSON.stringify(epoch)}`)
    const expectedEpoch=await evaluate(a,'qa.peer.epoch')
    await waitFor(b,`qa.peer.epoch===${JSON.stringify(expectedEpoch)}`)
    const rematchA=await evaluate(a,'qa.peer.epoch'),rematchB=await evaluate(b,'qa.peer.epoch')
    if(rematchA===epoch||rematchA!==rematchB)throw Error('Rematch epoch mismatch')
    await evaluate(b,'qa.peer.receiveRelay('+JSON.stringify(JSON.stringify(oldFrame))+')')
    if(await evaluate(b,'qa.peer.epoch')!==rematchA)throw Error('An old packet undid the rematch')
    if(mode==='coop') {
      const beforeTaps=await evaluate(a,'qa.peer.controls[qa.peer.remoteId].rightTaps')
      const lateInput=await evaluate(a,'({kind:"input",epoch:'+JSON.stringify(epoch)+',control:{...qa.peer.controls[qa.peer.remoteId],rightTaps:qa.peer.controls[qa.peer.remoteId].rightTaps+1,seq:qa.peer.controls[qa.peer.remoteId].seq+1}})')
      await evaluate(a,'qa.peer.receiveRelay('+JSON.stringify(JSON.stringify(lateInput))+')')
      if(await evaluate(a,'qa.peer.controls[qa.peer.remoteId].rightTaps')!==beforeTaps)throw Error('Prior-match input leaked into rematch')
    }
    results.push({mode,...response,direct,relay:after.peer,rematch:'passed',backgroundResume:'passed',signalingReconnect:'passed'})
    await evaluate(a,'qa.close()');await evaluate(b,'qa.close()')
  }
  const mobile=await page(),desktop=await page(1440,960)
  await screenshot(desktop,'home-desktop');await screenshot(mobile,'home-mobile')
  for(let world=0;world<5;world++){await evaluate(mobile,`document.querySelectorAll('.preview-worlds button')[${world}].click();document.querySelector('.expedition-preview').scrollIntoView({block:'center'})`);await sleep(120);await screenshot(mobile,'world-'+world)}
  await evaluate(mobile,"[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Solo Adventure')).click()")
  await waitFor(mobile,"document.querySelector('.expedition-countdown')===null && document.querySelector('.expedition-canvas')")
  await screenshot(mobile,'solo-mobile')
  const multitouch={contract:'Four independent tap buttons; actual touch hold/burst covered by mobile-controls-smoke'}
  const layout=await evaluate(mobile,"({overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.querySelector('.expedition-canvas').getBoundingClientRect().toJSON(),control:document.querySelector('[data-action=right]').getBoundingClientRect().toJSON()})")
  if(layout.overflow||layout.canvas.width<100||layout.canvas.height<100||layout.control.bottom>844)throw Error('Mobile layout overflows: '+JSON.stringify(layout))
  await send('Emulation.setCPUThrottlingRate',{rate:4},mobile)
  const performanceSample=await evaluate(mobile,`new Promise(resolve=>{const gaps=[];let last=performance.now();const end=last+6000;function frame(now){gaps.push(now-last);last=now;if(now<end)requestAnimationFrame(frame);else{gaps.sort((a,b)=>a-b);resolve({cpuSlowdown:4,durationMs:6000,frameP95Ms:gaps[Math.floor(gaps.length*.95)],maxFrameMs:gaps.at(-1),freezes:gaps.filter(n=>n>250).length})}}requestAnimationFrame(frame)})`)
  await send('Emulation.setCPUThrottlingRate',{rate:1},mobile)
  if(performanceSample.freezes>0||performanceSample.frameP95Ms>40)throw Error('Mobile frame budget regression: '+JSON.stringify(performanceSample))
  results.push({performanceSample})
  // Full invitation UI: host creates a room; a fresh browser opens the exact shared URL.
  for(const mode of ['coop','versus']) {
    const host=await page(1440,960),guest=await page()
    await evaluate(host,`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('${mode==='coop'?'Co-op Adventure':'Rapid Rivals'}')).click()`)
    await waitFor(host,"document.querySelector('.oars-link input')")
    await screenshot(host,mode+'-lobby-desktop')
    const invite=await evaluate(host,"document.querySelector('.oars-link input').value")
    await send('Page.navigate',{url:invite},guest)
    await waitFor(host,"document.querySelector('[data-path=local]') && !document.querySelector('.expedition-pause')",20000)
    await waitFor(guest,"document.querySelector('[data-path=local]') && !document.querySelector('.expedition-pause')",20000)
    await sleep(3300);await screenshot(guest,mode+'-invite-mobile');await screenshot(host,mode+'-play-desktop')
    if(mode==='coop') {
      // Inspect the actual React control surface, not a second diagnostic game.
      for(const session of [host,guest]) await evaluate(session,`(()=>{const node=document.querySelector('.crew-game');let f=node[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))];while(f&&!f.memoizedProps?.getState)f=f.return;if(!f)throw Error('Missing game props');globalThis.crewProps=f.memoizedProps})()`)
      await evaluate(host,"crewProps.getState().hearts=2;crewProps.getState().objects=[];crewProps.getState().invulnerableTicks=600")
      for(const session of [host,guest])await waitFor(session,"document.querySelector('.crew-hull').dataset.hearts==='2' && document.querySelectorAll('.expedition-hearts svg.full').length===2")
      await evaluate(host,"crewProps.getState().crew.scrap=3")
      await evaluate(guest,"for(let i=0;i<6;i++)crewProps.onCrew({tap:'recover'})")
      for(const session of [host,guest])await waitFor(session,"document.querySelector('.crew-hull').dataset.hearts==='3'",5000)
      for(const width of [320,375,390]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:740,deviceScaleFactor:1,mobile:true},guest)
        const hull=await evaluate(guest,"(()=>{const r=document.querySelector('.crew-hull').getBoundingClientRect();return {width:innerWidth,left:r.left,right:r.right,icons:document.querySelectorAll('.expedition-hearts svg').length,overflow:document.documentElement.scrollWidth>innerWidth}})()")
        if(hull.left<0||hull.right>width||hull.icons!==3||hull.overflow)throw Error('Guest hull/layout clipped '+JSON.stringify(hull))
        await screenshot(guest,'guest-hull-'+width)
      }
      results.push({health:'host+guest damage and six guest tap repair passed',guestWidths:[320,375,390],vectorHearts:'visible'})
    } else {
      for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]){
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600},guest)
        await evaluate(guest,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        const track=await evaluate(guest,"(()=>{const b=document.querySelector('.race-controls>button'),r=b.getBoundingClientRect(),w=document.querySelector('.race-world').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,button:r.toJSON(),world:w.toJSON(),uncovered:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})()")
        if(track.overflow||track.button.bottom>height||track.button.right>width||track.world.height<140||!track.uncovered)throw Error('Race controls clipped '+JSON.stringify(track))
        await screenshot(guest,'race-controls-'+width+'x'+height)
      }
      await evaluate(guest,"document.querySelector('.race-controls>button').click()")
      await waitFor(guest,"document.querySelector('.race-controls>button').dataset.active==='true'")
      results.push({mode:'versus',mobileControls:'320x568 through desktop, landscape, instant button feedback passed'})
    }
    results.push({mode,invitationUI:'passed',directPath:'local'})
  }
  if(errors.length)throw Error('Browser errors: '+JSON.stringify(errors))
  const evidence={results,layout,multitouch,browserErrors:errors.length,artifacts}
  await writeFile(join(artifacts,'results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2))
}finally{ws.close();chrome.kill('SIGTERM')}
process.exit(0)
