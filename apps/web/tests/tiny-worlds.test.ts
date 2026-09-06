import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { readFileSync } from 'node:fs'
import { tinyWorldCamera } from '../src/game/TinyWorldScene'
import { CYLINDER_RADIUS, cylinderPoint, followRoll, orbitVisible, projectRolling, rollingCamera, skyDropHeight, worldRoll } from '../src/game/RollingWorld'
import { ORBIT_LAP, RIVER_WIDTH, type RiverObject } from '@pongapp/game-core'
import { livingSky } from '../src/game/LivingSky'

describe('tiny-world art contract', () => {
  it('keeps forward up-screen and the playable width visible on phone and desktop', () => {
    for(const [w,h] of [[320,430],[390,572],[950,660],[844,150]]){
      const {camera,depth}=tinyWorldCamera(w!,h!)
      const a=new Vector3(0,0,.26*depth).project(camera),b=new Vector3(0,0,.15*depth).project(camera)
      expect(b.y).toBeGreaterThan(a.y)
      expect(Math.abs(b.x-a.x)).toBeLessThan(.025)
      expect(a.y).toBeGreaterThan(-.7);expect(a.y).toBeLessThan(0)
      expect(Math.abs(new Vector3(-7,0,0).project(camera).x)).toBeLessThan(.9)
      expect(Math.abs(new Vector3(7,0,0).project(camera).x)).toBeLessThan(.9)
    }
  })
  it('curves the banks downward and rolls the same world opposite lateral steering', () => {
    expect(cylinderPoint(7,0,0).y).toBeLessThan(-1)
    for(const x of [-10,-7,0,7,10]){
      const p=cylinderPoint(x,0,0,worldRoll(.9))
      expect(Math.hypot(p.x,p.y+CYLINDER_RADIUS)).toBeCloseTo(CYLINDER_RADIUS,10)
    }
    expect(cylinderPoint(0,0,0,worldRoll(.9)).x).toBeLessThan(0)
    expect(cylinderPoint(0,0,0,worldRoll(.1)).x).toBeGreaterThan(0)
  })
  it('matches fallback to WebGL at every altitude and keeps the closer craft in frame', () => {
    for(const [w,h] of [[320,320],[390,532],[1440,712],[844,150]])for(const boatX of [.06,.5,.94])for(const cameraAltitude of [0,3.5,5]){
      const {camera,depth}=tinyWorldCamera(w!,h!,cameraAltitude),roll=worldRoll(boatX)
      for(const x of [.06,.5,.94])for(const y of [.24,.5,.76])for(const elevation of [0,.45,4]){
        const p=cylinderPoint((x-.5)*RIVER_WIDTH,elevation,(y-.5)*depth,roll)
        const v=new Vector3(p.x,p.y,p.z).project(camera),fallback=projectRolling(w!,h!,x,y,elevation,roll,cameraAltitude)
        expect(fallback[0]).toBeCloseTo((v.x+1)*w!/2,8)
        expect(fallback[1]).toBeCloseTo((1-v.y)*h!/2,8)
      }
      const boat=projectRolling(w!,h!,boatX,.76,cameraAltitude,roll,cameraAltitude)
      expect(boat[1]/h!).toBeGreaterThan(.4);expect(boat[1]/h!).toBeLessThan(.85)
      expect(boat[0]/w!).toBeCloseTo(.5)
    }
  })
  it('renders authoritative height for all entity types, including airborne predators', () => {
    for(const type of ['rock','log','heart','relic','firefly','rescue','predator','gate'] as const){
      for(const y of [-.08,.24,.76])expect(skyDropHeight({type,y,altitude:4.2} as RiverObject)).toBe(4.2)
      expect(skyDropHeight({type,y:-.08} as RiverObject)).toBe(0)
    }
  })
  it('zooms substantially closer while preserving the prior camera pitch',()=>{
    const c=rollingCamera(390,532),oldDistance=30/Math.cos(c.pitch-10*Math.PI/180+c.halfFov*.4)
    const distance=Math.hypot(c.y,c.z-.26*c.depth)
    expect(distance/oldDistance).toBeCloseTo(16/30)
    expect(oldDistance/distance).toBeGreaterThan(1.3)
  })
  it('anchors clouds, floating islands and celestial bodies to the world with wrap and height parallax',()=>{
    const sky=livingSky(0,40,1000),same=livingSky(0,40,1000)
    expect(sky).toEqual(same);expect(sky.length).toBeLessThan(120)
    for(let world=0;world<5;world++)expect(livingSky(world,40,1000).length).toBeLessThan(120)
    const sun=sky.find(o=>o.kind==='sun')!,a=projectRolling(390,532,sun.x,sun.y,sun.altitude,worldRoll(.5)),b=projectRolling(390,532,sun.x,sun.y,sun.altitude,worldRoll(.8)),lap=projectRolling(390,532,sun.x,sun.y,sun.altitude,worldRoll(.5+ORBIT_LAP))
    expect(Math.abs(a[0]-b[0])).toBeGreaterThan(20);expect(a[0]).toBeCloseTo(lap[0],8)
    expect(projectRolling(390,532,sun.x,sun.y,sun.altitude,0,5)[1]).not.toBeCloseTo(a[1],1)
    const shifted=livingSky(0,80,1000)
    expect(shifted.filter(o=>o.kind==='cloud').map(o=>o.y)).not.toEqual(sky.filter(o=>o.kind==='cloud').map(o=>o.y))
    expect(orbitVisible(390,532,2.1,0,0)).toBe(false)
    expect(orbitVisible(390,532,2.1,0,12)).toBe(true)
  })
  it('tilts exactly ten degrees farther downward and follows a wrap without rotating the long way',()=>{
    for(const [w,h] of [[390,500],[844,180],[1440,700]]){
      const c=rollingCamera(w!,h!),baseline=Math.max(10,Math.min(26,c.halfFov*180/Math.PI-8))
      expect(c.pitch*180/Math.PI-baseline).toBeCloseTo(10,10)
    }
    const before=worldRoll(ORBIT_LAP-.01),after=followRoll(before,.01,16)
    expect(after).toBeGreaterThan(before);expect(after-before).toBeLessThan(.02*RIVER_WIDTH)
    for(const x of [0,.5,2,5]){
      const roll=worldRoll(x),a=projectRolling(390,500,x,.76,0,roll),b=projectRolling(390,500,x+ORBIT_LAP,.76,0,roll)
      expect(a[0]).toBeCloseTo(b[0],9);expect(a[1]).toBeCloseTo(b[1],9)
      expect(orbitVisible(390,500,x,roll)).toBe(true)
      expect(orbitVisible(390,500,x+ORBIT_LAP/2,roll)).toBe(false)
    }
  })
  it('ships a valid local GLB with original one-primitive, vertex-painted assets', () => {
    const bytes=readFileSync(new URL('../public/art/tiny-worlds.glb',import.meta.url))
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);expect(bytes.readUInt32LE(4)).toBe(2)
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);expect(bytes.length).toBeLessThan(4_000_000)
    const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length).toString())
    const names=new Set(gltf.nodes.map((n:{name:string})=>n.name))
    for(const name of ['boat','truck','airship','ship','predator','turret','rescue','temple','palm','fir','cactus','garden_tree','crystal_cluster','star','heart','gate'])expect(names.has(name)).toBe(true)
    for(const name of ['ark_hull','ark_controls','ark_cannon','ark_engine','crew_body','crew_head','crew_arm','crew_boot','beast_crab','crab_leg','crab_claw','beast_manta','manta_wing','beast_jelly','jelly_tentacle','beast_wyrm','wyrm_segment','wyrm_fin'])expect(names.has(name)).toBe(true)
    for(const mesh of gltf.meshes){expect(mesh.primitives).toHaveLength(1);expect(mesh.primitives[0].attributes.COLOR_0).toBeTypeOf('number');expect(mesh.primitives[0].attributes.TEXCOORD_0).toBeTypeOf('number')}
    expect(gltf.images??[]).toHaveLength(0)
  })
})
