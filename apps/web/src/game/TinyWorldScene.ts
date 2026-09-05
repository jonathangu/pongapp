import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { EXPEDITION_WORLDS, expeditionWorld, type CoopGameState } from '@pongapp/game-core'

const ART = import.meta.env.BASE_URL + 'art/'
const TAU = Math.PI * 2
const noise = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
const BIOMES = ['jungle','mesa','snow','garden','cosmic'] as const
const TREES = ['palm','cactus','fir','garden_tree','crystal_cluster'] as const
const SKIES = [0x7fbfb2,0xefb18b,0xa1cbd9,0xf0b7bb,0x191a47]
const GROUNDS = [0x177c83,0xd09b72,0xbddee2,0xe8c9c1,0x333765]
const ENEMIES = [0xffffff,0xce724a,0x548faf,0xc780ae,0x8c75bc]
type Library = Map<string, THREE.BufferGeometry>
let libraryPromise: Promise<Library> | undefined
let materialImagePromise: Promise<HTMLImageElement> | undefined

/** Immutable CPU-side source cache: each canvas owns and disposes its GPU resources. */
function loadLibrary(): Promise<Library> {
  if (!libraryPromise) libraryPromise = new GLTFLoader().loadAsync(ART+'tiny-worlds.glb').then(gltf => {
    const meshes: Library = new Map()
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld)
      meshes.set(object.name, geometry)
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
    })
    if (!meshes.has('boat') || !meshes.has('predator')) throw Error('Incomplete tiny-world model library')
    return meshes
  }).catch(error => { libraryPromise = undefined; throw error })
  return libraryPromise
}
function loadMaterialImage(): Promise<HTMLImageElement> {
  if (!materialImagePromise) materialImagePromise = new Promise<HTMLImageElement>((resolve,reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error('Paint texture unavailable')); img.src = ART+'painted-material.jpg'
  }).catch(error => { materialImagePromise = undefined; throw error })
  return materialImagePromise
}

export function tinyWorldCamera(width: number, height: number) {
  const aspect = Math.max(.25,width/Math.max(1,height))
  const viewHeight = Math.max(12,15.5/aspect)
  const camera = new THREE.OrthographicCamera(-viewHeight*aspect/2,viewHeight*aspect/2,viewHeight/2,-viewHeight/2,.1,150)
  camera.position.set(.65,20,15); camera.lookAt(0,0,0); camera.updateMatrixWorld()
  return { camera, depth: viewHeight*.74/.8 }
}

/** GPU instancing groups every repeated object by asset, not by scene entity. */
class Batch {
  readonly mesh: THREE.InstancedMesh
  count = 0
  constructor(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, capacity = 220) {
    this.mesh = new THREE.InstancedMesh(geometry,material,capacity)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    scene.add(this.mesh)
  }
  add(matrix: THREE.Matrix4, color?: THREE.Color) {
    if(this.count>=this.mesh.instanceMatrix.count)return
    this.mesh.setMatrixAt(this.count,matrix)
    if(color)this.mesh.setColorAt(this.count,color)
    this.count++
  }
  finish() {
    this.mesh.count=this.count;this.mesh.visible=this.count>0
    this.mesh.instanceMatrix.needsUpdate=true
    if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true
    this.count=0
  }
}

/** Renderer only. It never sends inputs, mutates game state, or drives simulation time. */
export class TinyWorldScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  camera = tinyWorldCamera(390,570).camera
  private depth = 16
  private width = 0
  private height = 0
  private disposed = false
  private ready = false
  private lastWorld = -1
  private lastSample = 0
  private lastFrame = 0
  private slowFrames = 0
  private dpr = 1
  private batches = new Map<string,Batch>()
  private geometries = new Map<string,THREE.BufferGeometry>()
  private materials: THREE.Material[] = []
  private textures: THREE.Texture[] = []
  private transform = new THREE.Object3D()
  private tint = new THREE.Color()
  private point = new THREE.Vector3()
  private ground: THREE.Mesh
  private groundMaterial: THREE.MeshStandardMaterial
  private sun: THREE.DirectionalLight
  private fill: THREE.HemisphereLight
  private surface: THREE.MeshStandardMaterial
  private glowMaterial: THREE.MeshBasicMaterial
  private floorTexture: THREE.CanvasTexture
  private skyTexture: THREE.CanvasTexture
  private skyCanvas: HTMLCanvasElement
  private beams: THREE.LineSegments
  private beamPositions = new Float32Array(6*96)
  private beamColors = new Float32Array(6*96)
  private beamCount = 0
  private renderFrame = 0

  constructor(private canvas: HTMLCanvasElement, private preview = false) {
    this.renderer = new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:'high-performance'})
    this.renderer.outputColorSpace=THREE.SRGBColorSpace
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure=1.1
    // One small shadow atlas, no postprocessing, physics, or per-frame React tree.
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false
    this.surface=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,metalness:.06,side:THREE.DoubleSide})
    this.glowMaterial=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.66,depthWrite:false})
    this.materials.push(this.surface,this.glowMaterial)
    this.sun=new THREE.DirectionalLight(0xffe2b3,3.2);this.sun.position.set(-6,12,-8)
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);this.sun.shadow.camera.left=-15;this.sun.shadow.camera.right=15;this.sun.shadow.camera.top=23;this.sun.shadow.camera.bottom=-23;this.sun.shadow.camera.near=.1;this.sun.shadow.camera.far=70;this.sun.shadow.bias=-.0005;this.sun.shadow.normalBias=.06
    this.fill=new THREE.HemisphereLight(0xc7f1ff,0x626775,1.45)
    this.scene.add(this.sun,this.fill)
    this.skyCanvas=document.createElement('canvas');this.skyCanvas.width=256;this.skyCanvas.height=512
    this.skyTexture=new THREE.CanvasTexture(this.skyCanvas);this.skyTexture.colorSpace=THREE.SRGBColorSpace
    this.scene.background=this.skyTexture;this.textures.push(this.skyTexture)
    const floorCanvas=document.createElement('canvas');floorCanvas.width=floorCanvas.height=128
    const ctx=floorCanvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,128,128)
    for(let i=0;i<100;i++){ctx.strokeStyle=i%3?'#ddebe9':'#b4d6d1';ctx.lineWidth=.6;ctx.beginPath();const x=noise(i)*128,y=noise(i+10)*128;ctx.moveTo(x,y);ctx.quadraticCurveTo(x+9,y-2,x+17,y);ctx.stroke()}
    this.floorTexture=new THREE.CanvasTexture(floorCanvas);this.floorTexture.wrapS=this.floorTexture.wrapT=THREE.RepeatWrapping;this.floorTexture.repeat.set(5,12);this.textures.push(this.floorTexture)
    this.groundMaterial=new THREE.MeshStandardMaterial({color:GROUNDS[0],roughness:.42,metalness:.12,map:this.floorTexture})
    this.materials.push(this.groundMaterial)
    const plane=new THREE.PlaneGeometry(35,80);this.geometries.set('_ground',plane)
    this.ground=new THREE.Mesh(plane,this.groundMaterial);this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.28;this.ground.receiveShadow=true;this.scene.add(this.ground)
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64
    const sc=shadowCanvas.getContext('2d')!;const gradient=sc.createRadialGradient(32,32,3,32,32,32);gradient.addColorStop(0,'rgba(15,28,39,.43)');gradient.addColorStop(.5,'rgba(15,28,39,.22)');gradient.addColorStop(1,'rgba(15,28,39,0)');sc.fillStyle=gradient;sc.fillRect(0,0,64,64)
    const shadowTex=new THREE.CanvasTexture(shadowCanvas);this.textures.push(shadowTex)
    const shadowMaterial=new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false});this.materials.push(shadowMaterial)
    const shadowGeometry=new THREE.PlaneGeometry(1,1);shadowGeometry.rotateX(-Math.PI/2);this.geometries.set('_shadow',shadowGeometry)
    this.batches.set('_shadow',new Batch(this.scene,shadowGeometry,shadowMaterial))
    const ring=new THREE.TorusGeometry(1,.025,4,40);ring.rotateX(Math.PI/2);this.geometries.set('_ring',ring)
    this.batches.set('_ring',new Batch(this.scene,ring,this.glowMaterial))
    const arch=new THREE.TorusGeometry(1,.035,6,48,Math.PI);this.geometries.set('_arch',arch)
    this.batches.set('_arch',new Batch(this.scene,arch,this.glowMaterial,6))
    const droplet=new THREE.IcosahedronGeometry(.06,0);this.geometries.set('_particle',droplet)
    this.batches.set('_particle',new Batch(this.scene,droplet,this.glowMaterial))
    const beamGeometry=new THREE.BufferGeometry();beamGeometry.setAttribute('position',new THREE.BufferAttribute(this.beamPositions,3).setUsage(THREE.DynamicDrawUsage));beamGeometry.setAttribute('color',new THREE.BufferAttribute(this.beamColors,3).setUsage(THREE.DynamicDrawUsage));beamGeometry.setDrawRange(0,0);this.geometries.set('_beams',beamGeometry)
    const beamMaterial=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.85,depthWrite:false});this.materials.push(beamMaterial)
    this.beams=new THREE.LineSegments(beamGeometry,beamMaterial);this.beams.frustumCulled=false;this.scene.add(this.beams)
    const orb=new THREE.SphereGeometry(1,24,16);this.geometries.set('_orb',orb)
    const planetMaterial=new THREE.MeshStandardMaterial({roughness:.85});this.materials.push(planetMaterial)
    this.batches.set('_orb',new Batch(this.scene,orb,planetMaterial,12))
    this.canvas.dataset.renderer='loading-3d'
  }

  async load() {
    const [source,image]=await Promise.all([loadLibrary(),loadMaterialImage()])
    if(this.disposed)return
    const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;this.textures.push(texture)
    this.surface.map=texture;this.surface.needsUpdate=true
    for(const [name,geometry] of source){const owned=geometry.clone();this.geometries.set(name,owned);const batch=new Batch(this.scene,owned,this.surface);batch.mesh.receiveShadow=true;batch.mesh.castShadow=['boat','truck','ship','airship','turret','predator','temple','palm','fir','cactus','garden_tree'].includes(name);this.batches.set(name,batch)}
    for(let world=1;world<5;world++){
      const geometry=source.get('predator')!.clone(),colors=geometry.getAttribute('color'),base=new THREE.Color(ENEMIES[world]!)
      for(let i=0;i<colors.count;i++){const r=colors.getX(i),g=colors.getY(i),b=colors.getZ(i);if(g>r*1.05&&g>b*1.1){const light=Math.min(1.7,.6+g*1.3);colors.setXYZ(i,base.r*light,base.g*light,base.b*light)}}
      this.geometries.set('predator'+world,geometry);const batch=new Batch(this.scene,geometry,this.surface);batch.mesh.castShadow=true;batch.mesh.receiveShadow=true;this.batches.set('predator'+world,batch)
    }
    this.ready=true;this.canvas.dataset.renderer='webgl-3d';this.canvas.dataset.assets='ready'
  }
  resize(width: number,height: number) {
    this.width=width;this.height=height
    const projection=tinyWorldCamera(width,height);this.camera=projection.camera;this.depth=projection.depth
    this.dpr=Math.min(devicePixelRatio||1,1.5);this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(width,height,false)
  }
  setZoom(zoom: number) {
    const value=Math.max(1,Math.min(1.35,zoom))
    if(this.camera.zoom!==value){this.camera.zoom=value;this.camera.updateProjectionMatrix()}
  }
  private add(name: string,x: number,y: number,z: number,sx=1,sy=sx,sz=sx,rotation=0,color=0xffffff,rx=0,rz=0) {
    this.transform.position.set(x,y,z);this.transform.scale.set(sx,sy,sz);this.transform.rotation.set(rx,rotation,rz);this.transform.updateMatrix()
    this.batches.get(name)?.add(this.transform.matrix,this.tint.setHex(color))
  }
  private shadow(x: number,z: number,size: number,stretch=1) {this.add('_shadow',x,-.235,z,size,1,size*stretch)}
  private line(x1: number,y1: number,z1: number,x2: number,y2: number,z2: number,color: number) {
    if(this.beamCount>=96)return
    const i=this.beamCount++*6;this.beamPositions.set([x1,y1,z1,x2,y2,z2],i)
    this.tint.setHex(color);this.beamColors.set([this.tint.r,this.tint.g,this.tint.b,this.tint.r,this.tint.g,this.tint.b],i)
  }
  private setWorld(world: number) {
    if(world===this.lastWorld)return
    this.lastWorld=world
    this.ground.visible=world<3;this.groundMaterial.color.setHex(GROUNDS[world]!)
    this.groundMaterial.roughness=world===0?.32:.82
    this.sun.color.setHex(world===4?0xb0bbff:world===2?0xfff1d7:0xffdfae)
    this.fill.color.setHex(world===4?0xa5b5ff:0xd0f5ef)
    this.fill.groundColor.setHex(world===4?0x705eaa:world===1?0xaa745c:0x718b90)
    this.scene.fog=new THREE.Fog(SKIES[world]!,28,75)
    const ctx=this.skyCanvas.getContext('2d')!;const gradient=ctx.createLinearGradient(0,0,0,512)
    gradient.addColorStop(0,['#4caaa9','#f0a18e','#83bcd7','#dc9aac','#111132'][world]!);gradient.addColorStop(.52,['#cce0b5','#ffe1a9','#deedf0','#ffe3c4','#353664'][world]!);gradient.addColorStop(1,['#539e96','#d8a5a4','#92b5ce','#bbb8d6','#152348'][world]!)
    ctx.fillStyle=gradient;ctx.fillRect(0,0,256,512)
    if(world===4)for(let i=0;i<130;i++){ctx.fillStyle=i%3?'#d1defd':'#fff6d4';ctx.globalAlpha=.2+noise(i+20)*.6;ctx.beginPath();ctx.arc(noise(i)*256,noise(i+5)*512,.3+noise(i+11),0,TAU);ctx.fill()}
    ctx.globalAlpha=1;this.skyTexture.needsUpdate=true
  }
  project(x: number,y: number,elevation=.35): [number,number] {
    this.point.set((x-.5)*8.5,elevation,(y-.5)*this.depth).project(this.camera)
    return [(this.point.x+1)*this.width/2,(1-this.point.y)*this.height/2]
  }
  pick(state: CoopGameState,x: number,y: number): number|null {
    let best=70,selected:number|null=null
    for(const object of state.objects){if(object.type!=='predator')continue;const p=this.project(object.x,object.y,.45);const d=Math.hypot(p[0]-x,p[1]-y);if(d<best){best=d;selected=object.id}}
    return selected
  }

  draw(state: CoopGameState,now: number): boolean {
    if(!this.ready||this.disposed||!this.width||!this.height)return false
    const world=expeditionWorld(state),t=now/1000
    this.setWorld(world);this.beamCount=0
    const scroll=state.distance*.67
    this.floorTexture.offset.y=-scroll*.16
    const theme=EXPEDITION_WORLDS[world]!
    // Banks are a chain of sculpted chunks, not a flat corridor painted on a sky.
    const rows=world>=3?7:11
    for(let i=0;i<rows*2;i++){
      const side=i%2?1:-1,seed=Math.floor(i/2)
      const z=((seed*3.6+noise(i+70)*1.5+scroll)% (rows*3.6))-rows*1.8
      const x=side*(5.7+noise(i)*.65),lift=world>=3?-.75+Math.sin(t*.7+i)*.17:0
      const scale=.8+noise(i+40)*.4
      this.add('island_'+BIOMES[world],x,lift,z,scale,scale,scale,noise(i+42)*TAU)
      if(world<3)this.shadow(x,z,4.4)
      if(world<3)this.add('island_'+BIOMES[world],x+side*2.4,-.2,z+1,1.7,1.6,1.8,noise(i)*3)
      const treeScale=.65+noise(i+10)*.5
      this.add(TREES[world]!,x-side*.3,lift+.16,z+.1,treeScale,treeScale,treeScale,noise(i+12)*TAU)
      this.add('rock',x-side*.9,lift+.12,z+.75,.4,.5,.5,i,world===1?0xefb687:world===4?0xbd9ee8:0xffffff)
      if(world===0)this.add('garden_tree',x+side*.45,lift+.05,z+.8,.58,.55,.58,i,0xa4c49a)
      if(i%3===0)this.add('temple',x-side*.25,lift+.13,z-.3,.63,.63,.63,side*.2,world===4?0xccd2ff:0xffffff)
      if(world===0||world===3){for(let j=0;j<3;j++)this.add('flower',x-side*(.7+j*.18),lift+.15,z+j*.25,.75,.75,.75,j)}
      if(world===1||world===2)this.add(world===1?'mesa':'mountain',x+side*.5,-.05,z-.45,.7+noise(i)*.45,1+noise(i+8)*.45,1,noise(i+22)*TAU)
      if(world>=3){this.add('cloud',x+side*.2,-2.3,z,1.4,.8,1.2,0,world===4?0x575488:0xffffff)}
    }
    // A distant hero landmark gives each chapter a destination and skyline.
    if(world<4){
      this.add('island_'+BIOMES[world],4,-.1,-this.depth*.5,1.7,1.6,1.7,.3)
      this.add('temple',4,.4,-this.depth*.51,1.2,1.2,1.2,-.13,world===2?0xd7edff:0xffffff)
      for(let i=0;i<2;i++)this.add(TREES[world]!,6-i*4,.3,-this.depth*.51-1,1.1,1.1,1.1,i)
    }
    // Outer mountains and distant landmarks establish depth beyond the playable strip.
    if(world<3)for(let i=0;i<12;i++){
      const x=(i%2?1:-1)*(7.8+noise(i)*2),z=-this.depth*.6+Math.floor(i/2)*6
      this.add(world===1?'mesa':'mountain',x,-.5,z,2,1.6+noise(i+44)*1.6,2,i*.4,world===0?0x81aa92:0xffffff)
      if(world===0)this.add('palm',x-.5,1,z,1.5,1.5,1.5,i)
    }
    if(world>=3)for(let i=0;i<7;i++)this.add('cloud',(noise(i+82)-.5)*24+Math.sin(t*.08+i),-.7+noise(i+6)*2,-this.depth*(.42+noise(i+14)*.18),2.5,1.5,2,i*.2,world===4?0x635b96:0xffffff)
    if(world<3)for(let i=0;i<60;i++){
      const z=((noise(i+80)*this.depth*1.5+scroll)%(this.depth*1.5))-this.depth*.75
      const x=(i%2?1:-1)*(3.3+noise(i+21)*.8)
      this.add('rock',x,-.25,z,.09+noise(i)*.13,.06,.14,i,world===1?0xffd5a0:world===2?0xe8ffff:0x65bca4)
    }
    if(world===3){
      // Rainbow arches are light effects, the environment itself remains mesh geometry.
      const colors=[0xffa5b2,0xffc890,0xffe9ac,0xa9ddbb,0xa6c7ed,0xc9b4f0]
      for(let c=0;c<colors.length;c++){const r=6-c*.4;this.add('_arch',0,-2,-this.depth*.44,r,r,r,0,colors[c]!)}
      this.add('airship',-4,2+Math.sin(t*.4)*.25,-this.depth*.43,.65,.65,.65,-.5)
      this.add('airship',5,1.6,-this.depth*.6,.5,.5,.5,.6)
    }
    if(world===4){
      this.add('_orb',3.5,1,-this.depth*.44,2.1,2.1,2.1,t*.015,0x8b72ba)
      this.add('_ring',3.5,1,-this.depth*.44,3.7,1.6,3.7,-.3,0xd3abef,.25,.3)
      this.add('_orb',-5,.8,-this.depth*.6,1.2,1.2,1.2,0,0xdea5ac)
      for(let i=0;i<10;i++)this.add('crystal_cluster',(noise(i+53)-.5)*18,-2,-20+noise(i+1)*30,1.8,1.8,1.8,i,0xcccbff)
    }

    for(const object of state.objects){
      const x=(object.x-.5)*8.5,z=(object.y-.5)*this.depth
      if(object.y<-.4||object.y>1.6)continue
      const bob=Math.sin(t*3+object.id)*.09
      if(object.type==='predator'){
        const boss=object.enemy==='boss',scale=boss?1.85:.85
        const tx=((object.targetX??state.boat.x)-.5)*8.5,tz=((object.targetY??.76)-.5)*this.depth
        const angle=Math.atan2(-(tx-x),-(tz-z))
        const warning=(object.age??0)<55||boss&&(object.age??0)%200<80
        this.shadow(x,z,scale*2.8,1.5)
        this.add(world?'predator'+world:'predator',x,.03+bob*.4,z,scale,scale,scale,angle,object.slowTicks?0x9ae5ff:0xffffff,0,Math.sin(t*8+object.id)*.035)
        if(warning){
          for(let i=0;i<8;i++){const a=i/8,b=a+.05;this.line(x+(tx-x)*a,.14,z+(tz-z)*a,x+(tx-x)*b,.14,z+(tz-z)*b,0xff775c)}
          this.add('_ring',tx,.05,tz,.55,.55,.55,0,0xff9d75)
          this.add('crystal',x,1.5*scale,z,.23,.5,.23,0,0xff9a5d)
        }
        if(object.hp!==undefined&&object.maxHp){const r=.56*scale;this.line(x-r,1*scale,z,x+r,1*scale,z,0x4b3c51);this.line(x-r,1.02*scale,z,x-r+r*2*object.hp/object.maxHp,1.02*scale,z,object.slowTicks?0xb6edff:0xff997e)}
        if(state.crew.targetId===object.id)this.add('_ring',x,.08,z,scale*1.2,.7,scale*1.2,t,0xffe9a8)
      }else if(object.type==='rock'||object.type==='log'){
        this.shadow(x,z,1.4)
        this.add(object.type,x,0,z,1,1,1,object.phase+(object.type==='rock'?t*.1:.6),world===4?0xc8b1ef:world===1?0xf0bc8c:0xffffff)
      }else if(object.type==='gate'){
        this.add('gate',x,.05,z,1,1,1,.12,0xffffff)
        this.add('_ring',x,.015,z,.65,.65,.65,0,0xffe7ab)
      }else if(object.type==='rescue'){
        this.shadow(x,z,1.4);this.add('rescue',x,.17+bob,z,1,1,1,Math.sin(t)*.15)
        this.add('_ring',x,.01,z,.65,.65,.65,0,0xffdda4)
      }else{
        const name=object.type==='heart'?'heart':object.type==='relic'?'crystal':'star',size=object.type==='firefly'?.75:.85
        this.add(name,x,.58+bob,z,size,size,size,t*.8,0xffffff,.3)
        this.shadow(x,z,.9)
      }
    }
    const bx=(state.boat.x-.5)*8.5,bz=.26*this.depth
    const heading=-Math.atan2(state.boat.heading*8.5,Math.max(.002,state.boat.speed)*this.depth)
    const lift=world===3?.28:world===4?.25:.02
    const bob=(world===1||world===2?Math.sin(t*22)*.025:Math.sin(t*3)*.055)
    this.shadow(bx,bz,3.1,1.3)
    this.add(theme.vehicle,bx,lift+bob,bz,1.15,1.15,1.15,heading,0xffffff,0,-heading*.07)
    const target=state.objects.find(o=>o.id===state.crew.targetId)??state.objects.filter(o=>o.type==='predator').sort((a,b)=>Math.abs(a.y-.76)-Math.abs(b.y-.76))[0]
    for(const side of [-1,1]){
      const x=bx+Math.cos(heading)*side*.9,z=bz-Math.sin(heading)*side*.9-.05
      const aim=target?Math.atan2(-((target.x-.5)*8.5-x),-((target.y-.5)*this.depth-z)):heading
      this.add('turret',x,.92+lift+bob,z,1,1,1,aim,state.crew.overheated?0xffa28c:0xffffff)
    }
    if(state.crew.shieldTicks||state.crew.bubble){
      this.add('_ring',bx,.45,bz,1.5,1.5,1.5,t,0x9affeb)
      this.add('_ring',bx,.6,bz,1.45,1.45,1.45,-t,0xa7dcff,.8)
    }
    for(let i=0;i<12;i++){
      const age=((t*(state.rushTicks?2.4:1.2)+i/12)%1),side=i%2?1:-1
      this.add('_particle',bx+side*(.5+age*.3),.04,bz+1+age*2,.8+age*1.4,.25,.8+age*1.4,0,world===1?0xffd3a1:0xb5fff0)
      if(state.rushTicks)this.line(bx+side*.7,.18,bz+1,bx+side*.7,.18,bz+2.6,0xc6ffea)
    }
    for(const shot of state.crew.shots){
      const x=(shot.x-.5)*8.5,z=(shot.y-.5)*this.depth,tx=(shot.toX-.5)*8.5,tz=(shot.toY-.5)*this.depth
      const color=shot.kind==='manual'?0xffd185:shot.kind==='chain'?0xc1acff:0x9bffed
      this.line(x,.9,z,tx,.45,tz,color)
      this.add('_particle',tx,.45,tz,3,3,3,0,color)
    }
    for(let i=0;i<28;i++){
      const z=((noise(i+401)*40+t*.25)%40)-20,x=(noise(i+51)-.5)*17
      this.add('_particle',x,1+Math.sin(t*.3+i)*.8,z,.35,.35,.35,0,world===2?0xffffff:world===4?0xb5daff:0xffecb9)
    }
    for(const batch of this.batches.values())batch.finish()
    this.beams.geometry.setDrawRange(0,this.beamCount*2);this.beams.geometry.attributes.position!.needsUpdate=true;this.beams.geometry.attributes.color!.needsUpdate=true
    this.renderer.shadowMap.needsUpdate=this.renderFrame++%4===0
    const started=performance.now();this.renderer.render(this.scene,this.camera)
    const renderMs=performance.now()-started
    // Only lower resolution after sustained slow rendering; never sacrifice simulation ticks.
    const gap=now-this.lastFrame
    if(renderMs>14||this.lastFrame>0&&gap>(this.preview?43:23)&&gap<200)this.slowFrames++;else this.slowFrames=Math.max(0,this.slowFrames-1)
    if(this.slowFrames>90){if(this.dpr>.8){this.dpr=Math.max(.8,this.dpr-.25);this.renderer.setPixelRatio(this.dpr)}else this.renderer.shadowMap.enabled=false;this.slowFrames=0}
    if(now-this.lastSample>1000){
      this.canvas.dataset.renderStats=JSON.stringify({drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,renderMs:Math.round(renderMs*100)/100,frameMs:Math.round((now-this.lastFrame)*100)/100,dpr:this.dpr,world})
      this.lastSample=now
    }
    this.lastFrame=now
    return true
  }
  dispose() {
    this.disposed=true
    for(const batch of this.batches.values())batch.mesh.dispose()
    for(const geometry of this.geometries.values())geometry.dispose()
    for(const material of this.materials)material.dispose()
    for(const texture of this.textures)texture.dispose()
    this.sun.shadow.map?.dispose()
    this.renderer.dispose();this.renderer.forceContextLoss()
  }
}
