import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
const {chromium,webkit}=await import(process.env.QA_PLAYWRIGHT??'playwright')
const ui=process.env.UI_URL??'http://127.0.0.1:5173/pongapp/',out=process.env.QA_OUTPUT??'/tmp/sky-altitude'
await mkdir(out,{recursive:true})
const results=[]
for(const engine of (process.env.QA_ENGINES??'chromium,webkit').split(',')){
  const browser=await(engine==='chromium'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch({headless:true}))
  try{
    const sizes=process.env.QA_ONE_SIZE?[[390,844]]:[[320,568],[390,844],[844,390],[1440,900]]
    for(const [width,height] of sizes){
      const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<600,deviceScaleFactor:width<600?3:1}),page=await ctx.newPage(),errors=[]
      page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(18000)
      await page.goto(ui);await page.locator('.oars-launch--solo').click()
      await page.waitForFunction(()=>document.querySelector('.crew-tap-grid')&&!document.querySelector('.expedition-countdown')&&document.querySelector('.expedition-canvas')?.dataset.renderer==='webgl-3d')
      await page.evaluate(()=>{
        let n=document.querySelector('.crew-game'),f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))];while(f&&!f.memoizedProps?.getState)f=f.return;window.qaProps=f.memoizedProps
        n=document.querySelector('.expedition-canvas');f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))]
        while(f&&!window.qaScene){for(let h=f.memoizedState;h;h=h.next){const c=h.memoizedState?.current;if(c&&typeof c.project==='function'&&typeof c.pick==='function'){window.qaScene=c;break}}f=f.return}
        qaProps.getState().invulnerableTicks=100000
      })
      const snapshot=async name=>page.screenshot({path:out+'/'+engine+'-'+width+'-'+name+'.png'})
      const pause=ms=>page.waitForTimeout(ms)
      assert.equal(await page.locator('.expedition-canvas').getAttribute('data-zoom'),'1.00')
      assert.equal(await page.locator('.expedition-canvas').getAttribute('data-sky-mode'),'world-volume')
      await snapshot('close-view')
      const before=await page.evaluate(()=>JSON.parse(document.querySelector('.expedition-canvas').dataset.skyAnchor))
      const b=await page.locator('[data-action=right]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await pause(600);await page.mouse.up();await pause(200)
      const after=await page.evaluate(()=>JSON.parse(document.querySelector('.expedition-canvas').dataset.skyAnchor))
      assert.ok(Math.hypot(after[0]-before[0],after[1]-before[1])>25,'sky must move with the cylinder')
      await snapshot('sky-orbit')
      // Jump only the disposable solo fixture to the real scheduled updraft, then let physics run normally.
      await page.evaluate(()=>{const s=qaProps.getState();s.tick=1259;s.crew.altitudeEventIndex=0;s.crew.encounterIndex=0;s.boat.flight=null;s.boat.altitude=0;s.objects=[];s.rescued=0;s.crew.bossDefeated=false})
      await page.waitForFunction(()=>qaProps.getState().boat.altitude>4)
      assert.equal(await page.locator('.crew-altitude').count(),1)
      const lift=await page.evaluate(()=>{const s=qaProps.getState(),r=document.querySelector('.expedition-canvas').getBoundingClientRect(),p=qaScene.project(s.boat.x,.76,s.boat.altitude),shadow=qaScene.project(s.boat.x,.76,0);return{altitude:s.boat.altitude,position:p,shadow,canvas:r.toJSON(),phase:document.querySelector('.crew-altitude').dataset.phase}})
      assert.ok(lift.position[0]>0&&lift.position[0]<lift.canvas.width&&lift.position[1]>0&&lift.position[1]<lift.canvas.height,'craft remains in the close view while lifted')
      assert.ok(lift.shadow[1]-lift.position[1]>15,'visible separation from the sea-level shadow')
      await snapshot('updraft')
      await page.evaluate(()=>{const s=qaProps.getState();s.objects=[{id:91001,type:'predator',enemy:'ambusher',x:(s.boat.x+.12)%(Math.PI*2),y:.4,radius:.04,phase:0,drift:0,age:0,hp:1000,maxHp:1000,altitude:6,flight:{kind:'rise',tick:200,duration:600,peak:6}}];qaProps.onCrew({targetId:null,action:true})})
      await page.waitForFunction(()=>qaProps.getState().crew.shots.some(s=>s.targetId===91001&&s.vAltitude>0))
      const aim=await page.evaluate(()=>{const o=qaProps.getState().objects.find(o=>o.id===91001),p=qaScene.project(o.x,o.y,(o.altitude??0)+.45),r=document.querySelector('.expedition-canvas').getBoundingClientRect();return{x:p[0]+r.x,y:p[1]+r.y}})
      await page.touchscreen.tap(aim.x,aim.y);await pause(100)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.targetId),91001)
      await snapshot('airborne-auto-aim')
      await page.evaluate(()=>qaProps.onCrew({action:false}))
      await page.waitForFunction(()=>qaProps.getState().boat.altitude===0&&qaProps.getState().boat.flight===null)
      await page.waitForFunction(()=>!document.querySelector('.crew-altitude'));await snapshot('sea-level-return')
      // A real scheduled boss warning, entry and reward; ordinary field enemies cannot steal this fixture's aim.
      await page.evaluate(()=>{const s=qaProps.getState();s.tick=2519;s.crew.encounterIndex=0;s.crew.altitudeEventIndex=1;s.objects=[];s.crew.shots=[];s.crew.targetId=null;s.rescued=0;s.crew.bossDefeated=false;s.crew.bossesDefeated=0})
      await page.waitForFunction(()=>document.querySelector('.crew-boss-warning'))
      assert.match(await page.locator('.crew-boss-warning').textContent(),/SKY SENTINEL APPROACHING/)
      await snapshot('boss-warning')
      await page.waitForFunction(()=>qaProps.getState().objects.some(o=>o.bossKind==='sentinel'&&(o.altitude??0)>6))
      await snapshot('boss-descending')
      await page.evaluate(()=>{const s=qaProps.getState(),boss=s.objects.find(o=>o.bossKind==='sentinel');s.objects=[boss];window.qaBossId=boss.id;qaProps.onCrew({targetId:null,action:true})})
      await page.waitForFunction(()=>qaProps.getState().crew.shots.some(s=>s.targetId===qaBossId))
      await page.waitForFunction(()=>qaProps.getState().crew.bossesDefeated===1)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.bossDefeated),false)
      await page.evaluate(()=>qaProps.onCrew({action:false}))
      await page.evaluate(()=>{const s=qaProps.getState();s.tick=5759;s.crew.encounterIndex=1;s.crew.altitudeEventIndex=2;s.objects=[];s.crew.shots=[];s.rescued=0;s.crew.bossDefeated=false})
      await page.waitForFunction(()=>document.querySelector('.crew-boss-warning')?.textContent.includes('STAR DEVOURER'))
      await snapshot('guardian-warning')
      await page.waitForFunction(()=>qaProps.getState().objects.some(o=>o.bossKind==='guardian'&&(o.altitude??0)>7)&&qaProps.getState().boat.flight?.kind==='boss-wave')
      await page.waitForFunction(()=>qaProps.getState().boat.altitude>3)
      await snapshot('guardian-updraft')
      await page.evaluate(()=>qaProps.onCrew({action:true,targetId:null}))
      await page.waitForFunction(()=>{const s=qaProps.getState(),boss=s.objects.find(o=>o.bossKind==='guardian');return boss&&s.crew.shots.some(shot=>shot.targetId===boss.id&&shot.vAltitude<0)})
      await snapshot('guardian-downward-aim');await page.evaluate(()=>qaProps.onCrew({action:false}))
      await page.waitForFunction(()=>qaProps.getState().boat.altitude===0&&qaProps.getState().boat.flight===null)
      // GPU loss must still draw/pick the same elevated target using the fallback projection.
      await page.evaluate(()=>{const s=qaProps.getState();s.objects=[{id:92001,type:'predator',enemy:'ambusher',x:s.boat.x,y:.43,radius:.04,phase:0,drift:0,age:0,hp:1000,maxHp:1000,altitude:4,flight:{kind:'rise',tick:200,duration:600,peak:4}}];qaProps.onCrew({targetId:null});qaScene.renderer.getContext().getExtension('WEBGL_lose_context').loseContext()})
      await page.waitForFunction(()=>document.querySelector('.expedition-canvas').dataset.renderer==='canvas-fallback')
      const fallback=await page.evaluate(()=>{const o=qaProps.getState().objects.find(o=>o.id===92001),r=document.querySelector('.expedition-canvas').getBoundingClientRect();qaScene.roll=Number(document.querySelector('.expedition-canvas').dataset.worldRoll);const p=qaScene.project(o.x,o.y,o.altitude);return{x:p[0]+r.x,y:p[1]+r.y}})
      await page.touchscreen.tap(fallback.x,fallback.y);await pause(100)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.targetId),92001)
      await snapshot('altitude-fallback')
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.crew-tap,.crew-camera button,.crew-help-button')].map(n=>{const r=n.getBoundingClientRect();return{...r.toJSON(),uncovered:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})}))
      assert.equal(layout.overflow,false);assert.ok(layout.buttons.every(b=>b.width>=43&&b.height>=43&&b.left>=0&&b.right<=width+1&&b.bottom<=height+1&&b.uncovered))
      assert.deepEqual(errors,[])
      results.push({engine,width,height,skyOrbit:{before,after},lift,autoAim3D:'upward homing, downward guardian aim and elevated manual selection passed',boss:'both advance warnings, descending sentinel, non-final reward and guardian updraft passed',returnToSea:'both lifts return to exact zero, HUD clears',fallback:'elevated pick passed',layout,errors})
      console.log('PASS living sky',engine,width,height);await ctx.close()
    }
  }finally{await browser.close()}
}
await writeFile(out+'/results.json',JSON.stringify({runtimeSession:'01a0369d-0914-7190-ac0e-b4d37e1fc052',ui,results,physicalPhoneVerified:false},null,2))
