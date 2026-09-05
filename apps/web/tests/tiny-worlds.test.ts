import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { readFileSync } from 'node:fs'
import { tinyWorldCamera } from '../src/game/TinyWorldScene'
import { CYLINDER_RADIUS, cylinderPoint, projectRolling, skyDropHeight, worldRoll } from '../src/game/RollingWorld'
import { RIVER_WIDTH, type RiverObject } from '@pongapp/game-core'

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
  it('matches fallback projection to WebGL, with boat and landing lanes in every viewport', () => {
    for(const [w,h] of [[320,320],[390,532],[1440,712],[844,150]])for(const boatX of [.06,.5,.94]){
      const {camera,depth}=tinyWorldCamera(w!,h!),roll=worldRoll(boatX)
      for(const x of [.06,.5,.94])for(const y of [.24,.5,.76])for(const elevation of [0,.45,4]){
        const p=cylinderPoint((x-.5)*RIVER_WIDTH,elevation,(y-.5)*depth,roll)
        const v=new Vector3(p.x,p.y,p.z).project(camera),fallback=projectRolling(w!,h!,x,y,elevation,roll)
        expect(fallback[0]).toBeCloseTo((v.x+1)*w!/2,8)
        expect(fallback[1]).toBeCloseTo((1-v.y)*h!/2,8)
        if(elevation===0){expect(fallback[0]).toBeGreaterThan(0);expect(fallback[0]).toBeLessThan(w!);expect(fallback[1]).toBeGreaterThan(0);expect(fallback[1]).toBeLessThan(h!)}
      }
      const boat=projectRolling(w!,h!,boatX,.76,0,roll)
      expect(boat[1]/h!).toBeGreaterThan(.6);expect(boat[1]/h!).toBeLessThan(.85)
    }
  })
  it('lands sky drops before the collision row without moving predators or gates', () => {
    const object=(type:RiverObject['type'],y:number)=>({type,y} as RiverObject)
    expect(skyDropHeight(object('rock',-.08))).toBe(9)
    expect(skyDropHeight(object('relic',.08))).toBeCloseTo(2.25)
    for(const type of ['rock','log','heart','relic','firefly','rescue'] as const){
      expect(skyDropHeight(object(type,.24))).toBe(0)
      expect(skyDropHeight(object(type,.76))).toBe(0)
    }
    expect(skyDropHeight(object('predator',-.08))).toBe(0)
    expect(skyDropHeight(object('gate',-.08))).toBe(0)
  })
  it('ships a valid local GLB with original one-primitive, vertex-painted assets', () => {
    const bytes=readFileSync(new URL('../public/art/tiny-worlds.glb',import.meta.url))
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);expect(bytes.readUInt32LE(4)).toBe(2)
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);expect(bytes.length).toBeLessThan(3_000_000)
    const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length).toString())
    const names=new Set(gltf.nodes.map((n:{name:string})=>n.name))
    for(const name of ['boat','truck','airship','ship','predator','turret','rescue','temple','palm','fir','cactus','garden_tree','crystal_cluster','star','heart','gate'])expect(names.has(name)).toBe(true)
    for(const mesh of gltf.meshes){expect(mesh.primitives).toHaveLength(1);expect(mesh.primitives[0].attributes.COLOR_0).toBeTypeOf('number');expect(mesh.primitives[0].attributes.TEXCOORD_0).toBeTypeOf('number')}
    expect(gltf.images??[]).toHaveLength(0)
  })
})
