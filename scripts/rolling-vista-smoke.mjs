import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.QA_PLAYWRIGHT ?? 'playwright')
const ui=process.env.UI_URL??'http://127.0.0.1:5173/pongapp/'
const out=process.env.QA_OUTPUT??'/tmp/rolling-vista-qa'
await mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'})
const results=[]
try{
  for(const [width,height] of [[390,844],[844,390]]){
    const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.goto(ui);await page.locator('.oars-launch--solo').click()
    await page.waitForFunction(()=>document.querySelector('.crew-game')&&!document.querySelector('.expedition-countdown')&&document.querySelector('.expedition-canvas')?.dataset.worldShape==='rolling-cylinder')
    await page.evaluate(()=>{
      const n=document.querySelector('.crew-game');let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))]
      while(f&&!f.memoizedProps?.getState)f=f.return
      window.qaProps=f.memoizedProps
      const canvas=document.querySelector('.expedition-canvas');let cf=canvas[Object.keys(canvas).find(k=>k.startsWith('__reactFiber$'))]
      while(cf&&!window.qaScene){for(let h=cf.memoizedState;h;h=h.next){const c=h.memoizedState?.current;if(c&&typeof c.pick==='function'&&typeof c.project==='function'){window.qaScene=c;break}}cf=cf.return}
      if(!qaScene)throw Error('Scene ref missing')
      const s=qaProps.getState();s.invulnerableTicks=100000;s.objects=[]
    })
    const before=await page.locator('.expedition-canvas').getAttribute('data-world-roll')
    for(let i=0;i<6;i++)await page.locator('[data-action=right]').tap()
    await page.waitForFunction(v=>Number(document.querySelector('.expedition-canvas').dataset.worldRoll)>Number(v)+.3,before)
    await page.screenshot({path:out+'/roll-right-'+width+'.png'})
    for(let i=0;i<12;i++)await page.locator('[data-action=left]').tap()
    await page.waitForFunction(()=>Number(document.querySelector('.expedition-canvas').dataset.worldRoll)<-.3)
    await page.screenshot({path:out+'/roll-left-'+width+'.png'})
    // Place one known enemy in this disposable solo game. Actual pointer picking must match the curved renderer.
    await page.evaluate(()=>{qaProps.getState().objects=[{id:80001,type:'predator',enemy:'ambusher',x:.5,y:.4,radius:.04,phase:0,drift:0,age:0,hp:100,maxHp:100,targetX:.5,targetY:.76}]})
    await page.waitForTimeout(50)
    const target=await page.evaluate(()=>{const o=qaProps.getState().objects.find(o=>o.id===80001),p=qaScene.project(o.x,o.y,.45),r=document.querySelector('.expedition-canvas').getBoundingClientRect();return{x:p[0]+r.x,y:p[1]+r.y}})
    await page.touchscreen.tap(target.x,target.y)
    await page.waitForFunction(()=>document.body.textContent.includes('Target selected · tap Shoot'))
    const drop=await page.evaluate(()=>{
      const s=qaProps.getState();s.objects.push({id:80002,type:'relic',x:.65,y:.02,radius:.04,phase:0,drift:0})
      const ground=qaScene.project(.65,.02,0),air=qaScene.project(.65,.02,9*((.24-.02)/.32)**2)
      return{ground,air,roll:document.querySelector('.expedition-canvas').dataset.worldRoll}
    })
    assert.ok(drop.air[1]<drop.ground[1]-10,'falling pickup is visibly above its landing lane')
    await page.screenshot({path:out+'/sky-drop-'+width+'.png'})
    await page.waitForFunction(()=>!document.body.textContent.includes('Target selected · tap Shoot'))
    // Hit testing remains aligned after genuine WebGL loss.
    await page.evaluate(()=>qaScene.renderer.getContext().getExtension('WEBGL_lose_context').loseContext())
    await page.waitForFunction(()=>document.querySelector('.expedition-canvas').dataset.renderer==='canvas-fallback')
    const fallbackTarget=await page.evaluate(()=>{
      const s=qaProps.getState();s.crew.targetId=null;const o=s.objects.find(o=>o.id===80001),p=qaScene.project(o.x,o.y,0),r=document.querySelector('.expedition-canvas').getBoundingClientRect()
      return{x:p[0]+r.x,y:p[1]+r.y}
    })
    await page.touchscreen.tap(fallbackTarget.x,fallbackTarget.y)
    await page.waitForFunction(()=>document.body.textContent.includes('Target selected · tap Shoot'))
    await page.screenshot({path:out+'/fallback-target-'+width+'.png'})
    assert.deepEqual(errors,[])
    results.push({width,height,rollBothDirections:'passed',curvedPointerDispatch:'passed',skyDrop:drop,contextLossPointerDispatch:'passed',knownBaselineIssue:'LocalSimulation supplies every player targetId each tick; neutral teammate clears shared selection. Unchanged in this visual release.',errors})
    console.log('PASS rolling vista',width,height);await page.close()
  }
  await writeFile(out+'/results.json',JSON.stringify({runtimeSession:'01a0369d-0914-7190-ac0e-b4d37e1fc052',ui,results},null,2))
}finally{await browser.close()}
