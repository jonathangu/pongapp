import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const {chromium,webkit}=await import(process.env.QA_PLAYWRIGHT??'playwright')
const ui=process.env.UI_URL??'http://127.0.0.1:5173/pongapp/',out=process.env.QA_OUTPUT??'/tmp/orbital-controls'
await mkdir(out,{recursive:true})
const results=[]
for(const engine of (process.env.QA_ENGINES??'chromium,webkit').split(',')){
  const browser=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch({headless:true}))
  try{
    for(const [width,height] of [[320,568],[390,844],[844,390],[1440,900]]){
      const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<600,deviceScaleFactor:width<600?3:1})
      const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
      page.setDefaultTimeout(15000)
      await page.goto(ui);await page.locator('.oars-launch--solo').click()
      await page.waitForFunction(()=>document.querySelector('.crew-tap-grid')&&!document.querySelector('.expedition-countdown')&&document.querySelector('.expedition-canvas')?.dataset.renderer==='webgl-3d')
      await page.evaluate(()=>{
        const n=document.querySelector('.crew-game');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))];while(f&&!f.memoizedProps?.getState)f=f.return;window.qaProps=f.memoizedProps
        const canvas=document.querySelector('.expedition-canvas');let cf=canvas[Object.keys(canvas).find(k=>k.startsWith('__reactFiber$'))]
        while(cf&&!window.qaScene){for(let h=cf.memoizedState;h;h=h.next){const c=h.memoizedState?.current;if(c&&typeof c.pick==='function'&&typeof c.project==='function'){window.qaScene=c;break}}cf=cf.return}
        // Isolate human input in this disposable solo fixture. Real two-player behavior has its own room test.
        const s=qaProps.getState();delete s.players['solo-scout'];s.invulnerableTicks=100000;s.objects=[];s.crew.altitudeEventIndex=3;s.crew.encounterIndex=2
        window.qaQuiet=setInterval(()=>{qaProps.getState().objects=[]},80)
      })
      const down=async action=>{const b=await page.locator('[data-action='+action+']').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down()}
      const count=action=>page.evaluate(action=>qaProps.getState().crew.actions['solo-human']?.[action]??0,action)
      const pause=ms=>page.waitForTimeout(ms)
      const rightBefore=await count('right')
      await down('right')
      const orbit=await page.evaluate(duration=>new Promise(resolve=>{
        let last=qaProps.getState().boat.x,traveled=0,maxStep=0;const tick=qaProps.getState().tick,until=performance.now()+duration
        const frame=()=>{const x=qaProps.getState().boat.x,lap=Math.PI*2,d=((x-last+Math.PI)%lap+lap)%lap-Math.PI;traveled+=d;maxStep=Math.max(maxStep,Math.abs(d));last=x;if(performance.now()<until)requestAnimationFrame(frame);else resolve({traveled,maxStep,simulationTicks:qaProps.getState().tick-tick,durationMs:duration,position:x,roll:Number(document.querySelector('.expedition-canvas').dataset.worldRoll)})};frame()
      }),width===390?5500:650)
      assert.ok(orbit.traveled>.8);if(width===390)assert.ok(orbit.traveled>Math.PI*2,'full circumference in a comfortable hold: '+JSON.stringify(orbit))
      assert.ok(orbit.maxStep<.2,'no seam jump');assert.equal(await count('right'),rightBefore+1)
      assert.equal(await page.locator('[data-action=right]').getAttribute('data-active'),'true')
      await page.screenshot({path:out+'/'+engine+'-'+width+'-orbit.png'})
      await page.mouse.up()
      await page.waitForFunction(()=>Math.abs(qaProps.getState().boat.heading)<.0001,{},{timeout:1200})
      assert.equal(await page.locator('[data-action=right]').getAttribute('data-active'),'false')
      for(let i=0;i<3;i++){await page.locator('[data-action=left]').tap();await pause(30)}
      assert.equal(await count('left'),3)
      const shotsBefore=await page.evaluate(()=>qaProps.getState().crew.shotsFired),tapBefore=await count('shoot')
      await down('shoot');await pause(650)
      assert.ok(await page.evaluate(()=>qaProps.getState().crew.shotsFired)>shotsBefore+4)
      assert.equal(await count('shoot'),tapBefore+1)
      await page.mouse.up();await pause(150)
      const stopped=await page.evaluate(()=>qaProps.getState().crew.shotsFired);await pause(250)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.shotsFired),stopped)
      for(const key of ['Space','Enter']){
        await page.locator('[data-action=shoot]').focus();const before=await count('shoot')
        await page.keyboard.down(key);await page.keyboard.down(key);await pause(250);await page.keyboard.up(key);await pause(100)
        assert.equal(await count('shoot'),before+1,key+' repeat/release must not manufacture power taps')
      }
      await page.evaluate(()=>{const s=qaProps.getState();s.hearts=2;s.crew.scrap=0;s.crew.repair=0})
      await page.waitForFunction(()=>!document.querySelector('[data-action=recover]').disabled)
      await down('recover');await pause(500)
      const repair=await page.evaluate(()=>qaProps.getState().crew.repair)
      assert.ok(repair>36&&repair<180,'held recovery fills the bar without salvage')
      assert.ok(Number(await page.locator('.crew-recovery-meter').getAttribute('aria-valuenow'))>20)
      await page.screenshot({path:out+'/'+engine+'-'+width+'-recovery.png'})
      await page.mouse.up();await pause(50)
      const savedRepair=await page.evaluate(()=>qaProps.getState().crew.repair);await pause(150)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.repair),savedRepair)
      await down('recover');await page.waitForFunction(()=>qaProps.getState().hearts===3);await page.mouse.up()
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.scrap),0)
      // Blur, guide and genuine lost pointer capture must clear held fire.
      await page.locator('[data-action=shoot]').focus();await page.keyboard.down('Space');await pause(150)
      await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('Space');await pause(100)
      const blurred=await page.evaluate(()=>qaProps.getState().crew.shotsFired);await pause(200)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.shotsFired),blurred)
      await page.locator('[data-action=shoot]').focus();await page.keyboard.down('Space');await page.locator('.crew-help-button').click()
      await page.waitForFunction(()=>document.querySelector('.crew-guide').open);await page.keyboard.up('Space');await pause(100)
      const guided=await page.evaluate(()=>qaProps.getState().crew.shotsFired);await pause(200)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.shotsFired),guided)
      assert.match(await page.locator('.crew-guide').textContent(),/5 repair taps/);await page.locator('.crew-guide>button').click()
      await page.evaluate(()=>document.querySelector('[data-action=shoot]').addEventListener('pointerdown',e=>{window.qaPointer=e.pointerId},{once:true}))
      await down('shoot');await pause(100)
      // Establish pending capture with a move before testing its loss (Pointer Events lifecycle).
      await page.mouse.move(8,8);await pause(50)
      await page.evaluate(()=>document.querySelector('[data-action=shoot]').releasePointerCapture(qaPointer))
      // WebKit processes pending capture changes on the next native pointer event.
      await page.mouse.move(5,5)
      await page.waitForFunction(()=>document.querySelector('[data-action=shoot]').dataset.active==='false');await pause(150)
      const lost=await page.evaluate(()=>qaProps.getState().crew.shotsFired);await pause(200);await page.mouse.up()
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.shotsFired),lost)
      let multitouch='separate Chromium CDP case'
      if(engine==='chromium'&&width===390){
        await page.evaluate(()=>{const s=qaProps.getState();s.hearts=1;s.crew.scrap=0;s.crew.repair=0})
        await page.waitForFunction(()=>!document.querySelector('[data-action=recover]').disabled)
        const cdp=await ctx.newCDPSession(page),points=[]
        for(const [i,action] of ['right','shoot','recover'].entries()){const b=await page.locator('[data-action='+action+']').boundingBox();points.push({id:i+1,x:b.x+b.width/2,y:b.y+b.height/2})}
        const fired=await page.evaluate(()=>qaProps.getState().crew.shotsFired)
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await pause(650)
        assert.equal(await page.locator('.crew-tap[data-active=true]').count(),3)
        assert.ok(await page.evaluate(()=>qaProps.getState().crew.shotsFired)>fired+4)
        assert.ok(await page.evaluate(()=>qaProps.getState().crew.repair)>50)
        await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await pause(100)
        assert.equal(await page.locator('.crew-tap[data-active=true]').count(),0)
        const cancelled=await page.evaluate(()=>qaProps.getState().crew.shotsFired);await pause(200)
        assert.equal(await page.evaluate(()=>qaProps.getState().crew.shotsFired),cancelled)
        const canvas=await page.locator('.expedition-canvas').boundingBox(),cx=canvas.x+canvas.width/2,cy=canvas.y+canvas.height/2
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:4,x:cx-65,y:cy},{id:5,x:cx+65,y:cy}]})
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:4,x:cx-35,y:cy},{id:5,x:cx+35,y:cy}]})
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
        await page.waitForFunction(()=>Number(document.querySelector('.expedition-canvas').dataset.zoom)<1)
        await page.locator('[aria-label="Reset camera zoom"]').click()
        multitouch='three real held touch pointers, native touchCancel, pinch/reset: passed';await cdp.detach()
      }
      // Native pointer target selection now persists; the teammate's neutral input no longer clears it.
      await page.evaluate(()=>{clearInterval(qaQuiet);const s=qaProps.getState();s.objects=[{id:80001,type:'predator',enemy:'ambusher',x:(s.boat.x+.1)%(Math.PI*2),y:.4,radius:.04,phase:0,drift:0,age:0,hp:100,maxHp:100}];s.boat.heading=0})
      await pause(150)
      const position=async fallback=>page.evaluate(fallback=>{const o=qaProps.getState().objects.find(o=>o.id===80001),r=document.querySelector('.expedition-canvas').getBoundingClientRect();if(fallback)qaScene.roll=Number(document.querySelector('.expedition-canvas').dataset.worldRoll);const p=qaScene.project(o.x,o.y,fallback?0:.45);return{x:p[0]+r.x,y:p[1]+r.y}},fallback)
      let p=await position(false);await page.touchscreen.tap(p.x,p.y);await pause(150)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.targetId),80001)
      await page.evaluate(()=>qaScene.renderer.getContext().getExtension('WEBGL_lose_context').loseContext())
      await page.waitForFunction(()=>document.querySelector('.expedition-canvas').dataset.renderer==='canvas-fallback')
      await page.evaluate(()=>qaProps.onCrew({targetId:null}));await pause(30)
      p=await position(true);await page.touchscreen.tap(p.x,p.y);await pause(100)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.targetId),80001)
      await page.locator('[aria-label="Zoom out"]').click();await page.locator('[aria-label="Reset camera zoom"]').click()
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,canvas:document.querySelector('.expedition-canvas').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.crew-tap,.crew-camera button,.crew-help-button')].map(n=>{const r=n.getBoundingClientRect();return{...r.toJSON(),uncovered:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})}))
      assert.equal(layout.overflow,false);assert.ok(layout.canvas.height>=140)
      assert.ok(layout.buttons.every(b=>b.width>=43&&b.height>=43&&b.left>=0&&b.right<=width+1&&b.bottom<=height+1&&b.uncovered))
      assert.deepEqual(errors,[])
      results.push({engine,width,height,orbit,holdTapReleaseKeyboardRepair:'passed',blurHelpLostCapture:'passed',multitouch,manualAimAndFallback:'passed',layout,errors})
      console.log('PASS orbital controls',engine,width,height);await ctx.close()
    }
  }finally{await browser.close()}
}
await writeFile(out+'/results.json',JSON.stringify({runtimeSession:'01a0369d-0914-7190-ac0e-b4d37e1fc052',ui,results,physicalPhoneVerified:false},null,2))
