import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { readFileSync } from 'node:fs'
import { tinyWorldCamera } from '../src/game/TinyWorldScene'

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
