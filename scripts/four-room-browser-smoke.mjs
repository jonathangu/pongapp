import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
const {chromium,webkit}=await import(process.env.QA_PLAYWRIGHT??'playwright')
const ui=process.env.UI_URL??'http://127.0.0.1:5173/pongapp/',out=process.env.QA_OUTPUT??'/tmp/four-room-qa'
await mkdir(out,{recursive:true});const results=[]
for(const engine of (process.env.QA_ENGINES??'chromium,webkit').split(',')){
  const browser=await(engine==='chromium'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch({headless:true}))
  try{
    for(const [width,height] of (process.env.QA_ONE_SIZE?[[390,844]]:[[320,568],[390,844],[844,390],[1440,900]])){
      const ctx=await browser.newContext({viewport:{width,height},isMobile:width<600,hasTouch:width<900,deviceScaleFactor:width<600?3:1}),page=await ctx.newPage(),errors=[]
      page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(18000)
      await page.goto(ui);await page.locator('.oars-launch--solo').click()
      await page.waitForFunction(()=>document.querySelector('.crew-tap-grid')&&!document.querySelector('.expedition-countdown')&&document.querySelector('.expedition-canvas')?.dataset.renderer==='webgl-3d')
      await page.evaluate(()=>{
        let n=document.querySelector('.crew-game'),f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))]
        while(f&&!f.memoizedProps?.getState)f=f.return;window.qaProps=f.memoizedProps
        for(let h=f.memoizedState;h;h=h.next){const v=h.memoizedState?.current;if(v&&typeof v.update==='function'&&typeof v.setMuted==='function')window.qaAudio=v}
        n=document.querySelector('.expedition-canvas');f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))]
        while(f&&!window.qaScene){for(let h=f.memoizedState;h;h=h.next){const v=h.memoizedState?.current;if(v&&typeof v.project==='function'&&typeof v.pick==='function'){window.qaScene=v;break}}f=f.return}
        const s=qaProps.getState();s.objects=[];s.invulnerableTicks=100000
      })
      const press=async action=>page.locator('[data-action='+action+']').click()
      await press('right')
      const immediate=await page.evaluate(()=>({x:qaProps.getState().boat.x,p:{...qaProps.getState().players['solo-human'].deck}}))
      assert.ok(immediate.p.moving,'crew runs immediately');assert.equal(immediate.x,.5,'ship waits for crew arrival')
      await page.waitForFunction(()=>!qaProps.getState().players['solo-human'].deck.moving&&qaProps.getState().boat.x>.51)
      assert.equal(await page.locator('[data-action=right]').getAttribute('aria-pressed'),'true')
      await press('shoot')
      await page.waitForFunction(()=>qaProps.getState().players['solo-human'].deck.moving)
      await page.screenshot({path:out+'/'+engine+'-'+width+'-crew-running.png'})
      await page.waitForFunction(()=>!qaProps.getState().players['solo-human'].deck.moving)
      const count=await page.evaluate(()=>qaProps.getState().crew.actions['solo-human'].shoot)
      for(let i=0;i<3;i++)await press('shoot')
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.actions['solo-human'].shoot),count,'reselecting a station cannot add work')
      await page.locator('[data-action=shoot]').focus();await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space')
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.actions['solo-human'].shoot),count,'keyboard repeat does not restart travel')
      await page.evaluate(()=>{const s=qaProps.getState();s.hearts=2;s.crew.repair=0;s.crew.scrap=3})
      await press('recover');await page.waitForTimeout(150)
      assert.equal(await page.evaluate(()=>qaProps.getState().crew.repair),0,'repair waits for arrival')
      await page.waitForFunction(()=>qaProps.getState().hearts===3,null,{timeout:10000})
      assert.ok(await page.evaluate(()=>qaProps.getState().crew.scrap<=2))
      await page.locator('.crew-help-button').click();assert.match(await page.locator('.crew-guide').textContent(),/no work while running/i);await page.locator('.crew-guide>button').click()
      const audio=await page.evaluate(async()=>{
        if(!qaAudio?.context)return null
        const c=qaAudio.context,analyser=c.createAnalyser();analyser.fftSize=2048;qaAudio.master.connect(analyser)
        const values=new Float32Array(2048),samples=[]
        for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,90));analyser.getFloatTimeDomainData(values);samples.push(Math.sqrt(values.reduce((n,v)=>n+v*v,0)/values.length))}
        qaAudio.master.disconnect(analyser);return {state:c.state,rms:Math.max(...samples),...qaAudio.stats}
      })
      assert.ok(audio?.rms>.0001,'music must produce a non-silent signal');assert.ok(audio.maxVoices<=40)
      await page.locator('[aria-label="Mute music"]').click();assert.equal(await page.evaluate(()=>qaAudio.isMuted),true)
      await page.locator('[aria-label="Enable music"]').click()
      // Four fixed family fixtures: physical silhouette/animation and recipe modifiers.
      await page.evaluate(()=>{const s=qaProps.getState();s.objects=s.voyage.monsters.map((m,i)=>({id:9000+i,type:'predator',enemy:'ambusher',family:m.family,recipe:i,x:s.boat.x+(i-1.5)*.2,y:.18+i*.04,radius:.09,phase:0,drift:0,hp:10000,maxHp:10000,age:0,attackPhase:'telegraph',attackTick:0,targetX:s.boat.x,targetY:.76}));s.boat.flight=null;s.boat.altitude=0;s.crew.altitudeEventIndex=3;s.crew.encounterIndex=2})
      await page.waitForTimeout(120);await page.screenshot({path:out+'/'+engine+'-'+width+'-bestiary.png'})
      const stats=await page.evaluate(()=>JSON.parse(document.querySelector('.expedition-canvas').dataset.renderStats))
      assert.ok(stats.drawCalls<70&&stats.triangles<180000,'mobile geometry budget')
      await page.locator('[aria-label="Zoom out"]').click();assert.ok(Number(await page.locator('.expedition-canvas').getAttribute('data-zoom'))<1)
      await page.locator('[aria-label="Reset camera zoom"]').click()
      const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('.crew-tap,.crew-camera button,.crew-help-button')].map(n=>{const r=n.getBoundingClientRect();return {...r.toJSON(),uncovered:n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})}))
      assert.equal(layout.overflow,false);assert.ok(layout.buttons.every(b=>b.width>=43&&b.height>=43&&b.left>=0&&b.right<=width+1&&b.bottom<=height+1&&b.uncovered),'controls visible/touch-sized')
      await page.evaluate(()=>qaScene.renderer.forceContextLoss());await page.waitForFunction(()=>document.querySelector('.expedition-canvas').dataset.renderer==='canvas-fallback')
      await press('left');await page.waitForFunction(()=>qaProps.getState().players['solo-human'].station==='left'&&!qaProps.getState().players['solo-human'].deck.moving)
      await page.screenshot({path:out+'/'+engine+'-'+width+'-fallback.png'})
      assert.deepEqual(errors,[]);results.push({engine,width,height,crewTravel:'passed',persistentStation:'passed',repair:'passed',audio,stats,layout:'passed',fallback:'passed',errors})
      console.log('PASS',engine,width,height);await ctx.close()
    }
  }finally{await browser.close()}
}
await writeFile(out+'/results.json',JSON.stringify({runtimeSession:'01a0369d-0914-7190-ac0e-b4d37e1fc052',ui,results,physicalPhoneVerified:false},null,2))
