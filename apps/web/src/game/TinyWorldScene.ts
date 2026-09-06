import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RIVER_WIDTH, ORBIT_LAP, bossWarning, combatDistance, objectAltitude, orbitDelta, expeditionWorld, type CoopGameState } from '@pongapp/game-core'
import { CYLINDER_RADIUS, MAX_CAMERA_ZOOM, cylinderPoint, orbitVisible, rollingCamera, skyDropHeight, worldRoll } from './RollingWorld'
import { livingSky } from './LivingSky'
import { drawArk, drawBeast } from './ArkAnimation'

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

export function tinyWorldCamera(width: number, height: number,altitude=0) {
  const c = rollingCamera(width, height,altitude)
  const camera = new THREE.PerspectiveCamera(c.halfFov * 360 / Math.PI, c.aspect, .1, 1200)
  camera.position.set(0,c.y,c.z); camera.lookAt(0,c.targetY,c.targetZ); camera.updateMatrixWorld()
  return { camera, depth: c.depth }
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
  private assembly = new THREE.Object3D()
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
  private roll = 0
  private cameraAltitude = 0
  private rollRotation = new THREE.Quaternion()
  private rollAxis = new THREE.Vector3(0,0,1)

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
    this.skyCanvas=document.createElement('canvas');this.skyCanvas.width=1024;this.skyCanvas.height=512
    this.skyTexture=new THREE.CanvasTexture(this.skyCanvas);this.skyTexture.colorSpace=THREE.SRGBColorSpace
    this.scene.background=this.skyTexture;this.textures.push(this.skyTexture)
    const floorCanvas=document.createElement('canvas');floorCanvas.width=floorCanvas.height=128
    const ctx=floorCanvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,128,128)
    for(let i=0;i<100;i++){ctx.strokeStyle=i%3?'#ddebe9':'#b4d6d1';ctx.lineWidth=.6;ctx.beginPath();const x=noise(i)*128,y=noise(i+10)*128;ctx.moveTo(x,y);ctx.quadraticCurveTo(x+9,y-2,x+17,y);ctx.stroke()}
    this.floorTexture=new THREE.CanvasTexture(floorCanvas);this.floorTexture.wrapS=this.floorTexture.wrapT=THREE.RepeatWrapping;this.floorTexture.repeat.set(5,12);this.textures.push(this.floorTexture)
    this.groundMaterial=new THREE.MeshStandardMaterial({color:GROUNDS[0],roughness:.42,metalness:.12,map:this.floorTexture})
    this.materials.push(this.groundMaterial)
    const plane=new THREE.CylinderGeometry(CYLINDER_RADIUS-.28,CYLINDER_RADIUS-.28,1000,64,1,true);plane.rotateX(-Math.PI/2);this.geometries.set('_ground',plane)
    this.ground=new THREE.Mesh(plane,this.groundMaterial);this.ground.position.y=-CYLINDER_RADIUS;this.ground.receiveShadow=true;this.scene.add(this.ground)
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
    const shell=new THREE.IcosahedronGeometry(.22,1);this.geometries.set('_shell',shell)
    const shellMaterial=new THREE.MeshStandardMaterial({color:0xffbd5c,emissive:0xff570c,emissiveIntensity:1.8,roughness:.35,metalness:.2});this.materials.push(shellMaterial)
    this.batches.set('_shell',new Batch(this.scene,shell,shellMaterial,48))
    const blast=new THREE.TorusGeometry(1,.085,5,28);blast.rotateX(Math.PI/2);this.geometries.set('_blast',blast)
    this.batches.set('_blast',new Batch(this.scene,blast,this.glowMaterial,64))
    this.batches.set('_spark',new Batch(this.scene,droplet,this.glowMaterial,384))
    const beamGeometry=new THREE.BufferGeometry();beamGeometry.setAttribute('position',new THREE.BufferAttribute(this.beamPositions,3).setUsage(THREE.DynamicDrawUsage));beamGeometry.setAttribute('color',new THREE.BufferAttribute(this.beamColors,3).setUsage(THREE.DynamicDrawUsage));beamGeometry.setDrawRange(0,0);this.geometries.set('_beams',beamGeometry)
    const beamMaterial=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.85,depthWrite:false});this.materials.push(beamMaterial)
    this.beams=new THREE.LineSegments(beamGeometry,beamMaterial);this.beams.frustumCulled=false;this.scene.add(this.beams)
    const orb=new THREE.SphereGeometry(1,24,16);this.geometries.set('_orb',orb)
    const planetMaterial=new THREE.MeshStandardMaterial({roughness:.85});this.materials.push(planetMaterial)
    this.batches.set('_orb',new Batch(this.scene,orb,planetMaterial,12))
    const sunMaterial=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});this.materials.push(sunMaterial)
    this.batches.set('_sun',new Batch(this.scene,orb,sunMaterial,2))
    this.canvas.dataset.renderer='loading-3d'
  }

  async load() {
    const [source,image]=await Promise.all([loadLibrary(),loadMaterialImage()])
    if(this.disposed)return
    const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;this.textures.push(texture)
    this.surface.map=texture;this.surface.needsUpdate=true
    for(const [name,geometry] of source){const owned=geometry.clone();this.geometries.set(name,owned);const batch=new Batch(this.scene,owned,this.surface);batch.mesh.receiveShadow=true;batch.mesh.castShadow=['boat','truck','ship','airship','turret','predator','temple','palm','fir','cactus','garden_tree'].includes(name);this.batches.set(name,batch)}
    // Sky clouds use a clean diffuse material, not terrain's green vertex paint/texture.
    const cloudMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1});this.materials.push(cloudMaterial)
    this.batches.set('_skyCloud',new Batch(this.scene,this.geometries.get('cloud')!,cloudMaterial,32))
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
    if(this.lastWorld>=0){const world=this.lastWorld;this.lastWorld=-1;this.setWorld(world)}
  }
  setZoom(zoom: number) {
    const value=Math.max(.65,Math.min(MAX_CAMERA_ZOOM,zoom))
    if(this.camera.zoom!==value){this.camera.zoom=value;this.camera.updateProjectionMatrix()}
  }
  private add(name: string,x: number,y: number,z: number,sx=1,sy=sx,sz=sx,rotation=0,color=0xffffff,rx=0,rz=0) {
    const p=cylinderPoint(x,y,z,this.roll)
    this.transform.position.set(p.x,p.y,p.z);this.transform.scale.set(sx,sy,sz);this.transform.rotation.set(rx,rotation,rz)
    this.rollRotation.setFromAxisAngle(this.rollAxis,-p.angle);this.transform.quaternion.premultiply(this.rollRotation);this.transform.updateMatrix()
    this.batches.get(name)?.add(this.transform.matrix,this.tint.setHex(color))
  }
  private shadow(x: number,z: number,size: number,stretch=1) {this.add('_shadow',x,-.235,z,size,1,size*stretch)}
  private anchor(x:number,y:number,z:number,yaw:number,scale=1){
    const p=cylinderPoint(x,y,z,this.roll)
    this.assembly.position.set(p.x,p.y,p.z);this.assembly.scale.setScalar(scale);this.assembly.rotation.set(0,yaw,0)
    this.rollRotation.setFromAxisAngle(this.rollAxis,-p.angle);this.assembly.quaternion.premultiply(this.rollRotation);this.assembly.updateMatrix()
  }
  private part=(name:string,x:number,y:number,z:number,sx=1,sy=sx,sz=sx,yaw=0,color=0xffffff,rx=0,rz=0)=>{
    this.transform.position.set(x,y,z);this.transform.scale.set(sx,sy,sz);this.transform.rotation.set(rx,yaw,rz);this.transform.updateMatrix()
    this.transform.matrix.premultiply(this.assembly.matrix)
    this.batches.get(name)?.add(this.transform.matrix,this.tint.setHex(color))
  }
  private line(x1: number,y1: number,z1: number,x2: number,y2: number,z2: number,color: number) {
    if(this.beamCount>=96)return
    const a=cylinderPoint(x1,y1,z1,this.roll),b=cylinderPoint(x2,y2,z2,this.roll)
    const i=this.beamCount++*6;this.beamPositions.set([a.x,a.y,a.z,b.x,b.y,b.z],i)
    this.tint.setHex(color);this.beamColors.set([this.tint.r,this.tint.g,this.tint.b,this.tint.r,this.tint.g,this.tint.b],i)
  }
  private setWorld(world: number) {
    if(world===this.lastWorld)return
    this.lastWorld=world
    this.ground.visible=true;this.groundMaterial.color.setHex(GROUNDS[world]!)
    this.groundMaterial.roughness=world===0?.32:.82
    this.sun.color.setHex(world===4?0xb0bbff:world===2?0xfff1d7:0xffdfae)
    this.fill.color.setHex(world===4?0xa5b5ff:0xd0f5ef)
    this.fill.groundColor.setHex(world===4?0x705eaa:world===1?0xaa745c:0x718b90)
    this.scene.fog=new THREE.Fog(SKIES[world]!,48,120)
    const ctx=this.skyCanvas.getContext('2d')!;const gradient=ctx.createLinearGradient(0,0,0,512)
    gradient.addColorStop(0,['#4caaa9','#f0a18e','#83bcd7','#dc9aac','#111132'][world]!);gradient.addColorStop(.52,['#cce0b5','#ffe1a9','#deedf0','#ffe3c4','#353664'][world]!);gradient.addColorStop(1,['#539e96','#d8a5a4','#92b5ce','#bbb8d6','#152348'][world]!)
    ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,512)
    // Clear-color atmosphere only. All identifiable sky content is actual world-space geometry.
    this.skyTexture.needsUpdate=true
  }
  project(x: number,y: number,elevation=.35): [number,number] {
    const p=cylinderPoint((x-.5)*RIVER_WIDTH,elevation,(y-.5)*this.depth,this.roll)
    this.point.set(p.x,p.y,p.z).project(this.camera)
    return [(this.point.x+1)*this.width/2,(1-this.point.y)*this.height/2]
  }
  pick(state: CoopGameState,x: number,y: number): number|null {
    let best=70,selected:number|null=null
    for(const object of state.objects){const altitude=objectAltitude(object)+.45;if(object.type!=='predator'||!orbitVisible(this.width,this.height,object.x,this.roll,altitude,this.cameraAltitude))continue;const p=this.project(object.x,object.y,altitude);const d=Math.hypot(p[0]-x,p[1]-y);if(d<best){best=d;selected=object.id}}
    return selected
  }

  draw(state: CoopGameState,now: number,roll=worldRoll(state.boat.x),cameraAltitude=state.boat.altitude): boolean {
    if(!this.ready||this.disposed||!this.width||!this.height)return false
    const world=expeditionWorld(state),t=now/1000
    this.setWorld(world);this.beamCount=0;this.roll=roll
    this.cameraAltitude=cameraAltitude
    const view=rollingCamera(this.width,this.height,cameraAltitude)
    this.camera.position.set(0,view.y,view.z);this.camera.lookAt(0,view.targetY,view.targetZ);this.camera.updateMatrixWorld()
    this.ground.rotation.z=this.roll/CYLINDER_RADIUS
    this.canvas.dataset.worldRoll=this.roll.toFixed(3);this.canvas.dataset.worldShape='rolling-cylinder'
    const scroll=state.distance*.67
    this.floorTexture.offset.y=-scroll*.16
    const sky=livingSky(world,state.distance,state.tick)
    for(const o of sky){
      const x=(o.x-.5)*RIVER_WIDTH,z=(o.y-.5)*this.depth
      if(o.kind==='cloud')this.add('_skyCloud',x,o.altitude,z,o.scale,o.scale*.6,o.scale,o.rotation,o.color)
      else if(o.kind==='island'){
        this.add('island_'+BIOMES[world],x,o.altitude,z,o.scale,o.scale,o.scale,o.rotation,o.color)
        this.add(TREES[world]!,x,o.altitude+.15,z,o.scale*.75,o.scale*.75,o.scale*.75,o.rotation,o.color)
      }else if(o.kind==='star')this.add('_particle',x,o.altitude,z,o.scale,o.scale,o.scale,0,o.color)
      else{
        this.add(o.kind==='sun'&&world!==4?'_sun':'_orb',x,o.altitude,z,o.scale,o.scale,o.scale,0,o.color)
        if(o.kind==='planet')this.add('_ring',x,o.altitude,z,o.scale*1.8,o.scale*.65,o.scale*1.8,0,0xe5c9ff,.3)
      }
    }
    if(world===3){
      const colors=[0xffa5b2,0xffc890,0xffe9ac,0xa9ddbb,0xa6c7ed,0xc9b4f0]
      for(let i=0;i<6;i++)this.add('_arch',0,-.5,-30,8-i*.35,8-i*.35,8-i*.35,0,colors[i]!)
      this.add('airship',-4,7,-28,.85,.85,.85,-.4)
    }
    this.canvas.dataset.skyMode='world-volume';this.canvas.dataset.skyObjectCount=String(sky.length)
    this.canvas.dataset.skyAnchor=JSON.stringify(this.project(1.4,-2.1,17))
    this.canvas.dataset.altitude=state.boat.altitude.toFixed(3);this.canvas.dataset.cameraAltitude=cameraAltitude.toFixed(3)
    // No border walls: a handful of distant landmarks are distributed around the whole barrel.
    let scenery=0
    for(let i=0;i<8;i++){
      const nx=i/8*ORBIT_LAP+noise(i+70)*.15,z=((i*13+scroll)%86)-64
      if(z>-10||!orbitVisible(this.width,this.height,nx,this.roll))continue
      const x=(nx-.5)*RIVER_WIDTH,scale=.65*Math.min(1,(-z-10)/8)
      this.add('island_'+BIOMES[world],x,-.2,z,scale,scale,scale,i)
      this.add(i%3===0?'temple':TREES[world]!,x,.03,z,scale,scale,scale,i*.7)
      scenery+=2
    }
    this.canvas.dataset.sceneryCount=String(scenery)
    // Sparse longitude glints make rotation legible without fencing the playable surface.
    for(let i=0;i<36;i++){
      const x=(i/36*ORBIT_LAP-.5)*RIVER_WIDTH,z=((noise(i+80)*38+scroll)%38)-19
      this.add('_particle',x,-.2,z,.6,.12,4,0,world===1?0xffd5a0:world===4?0x909eea:0xb5eee2)
    }
    const incoming=bossWarning(state)
    if(incoming){const x=(state.boat.x-.5)*RIVER_WIDTH,pulse=1+Math.sin(t*7)*.08;this.add('_ring',x,7,-7,2.5*pulse,2.5*pulse,2.5*pulse,t,0xffab77);this.line(x,1,-7,x,8,-7,0xffd59d)}

    for(const object of state.objects){
      const x=(object.x-.5)*RIVER_WIDTH,z=(object.y-.5)*this.depth
      if(object.y<-.4||object.y>1.6)continue
      const bob=Math.sin(t*3+object.id)*.09
      const drop=skyDropHeight(object)
      if(drop>.1){this.add('_ring',x,.02,z,.55,.55,.55,t,object.type==='rock'||object.type==='log'?0xffb887:0xa8f2e5);this.line(x,drop+.35,z,x,drop+1.8,z,object.type==='rock'||object.type==='log'?0xffcd93:0xd6fff0)}
      if(object.type==='predator'){
        const recipe=state.voyage.monsters[object.recipe??-1]
        const boss=object.enemy==='boss',scale=(boss?object.bossKind==='sentinel'?2:1.6:1.3)*(recipe?.scale??1)
        const tx=x+orbitDelta(object.targetX??state.boat.x,object.x)*RIVER_WIDTH,tz=((object.targetY??.76)-.5)*this.depth
        const angle=Math.atan2(-(tx-x),-(tz-z))
        const warning=object.attackPhase==='telegraph'
        this.shadow(x,z,scale*2.8+drop*.15,1.5)
        this.anchor(x,drop+(object.family==='jelly'?1.2:.08)+bob,z,angle,scale);drawBeast(this.part,object,t,recipe)
        if(boss)this.add('_ring',x,drop+.6,z,scale*1.4,scale*.8,scale*1.4,t*.3,object.bossKind==='sentinel'?0xffd896:0xc3abff,.45)
        if(warning){
          for(let i=0;i<8;i++){const a=i/8,b=a+.05;this.line(x+(tx-x)*a,drop+(state.boat.altitude-drop)*a+.14,z+(tz-z)*a,x+(tx-x)*b,drop+(state.boat.altitude-drop)*b+.14,z+(tz-z)*b,0xff775c)}
          this.add('_ring',tx,.05,tz,.55,.55,.55,0,0xff9d75)
          this.add('crystal',x,drop+1.5*scale,z,.23,.5,.23,0,0xff9a5d)
        }
        if(object.hp!==undefined&&object.maxHp){const r=.56*scale;this.line(x-r,drop+1*scale,z,x+r,drop+1*scale,z,0x4b3c51);this.line(x-r,drop+1.02*scale,z,x-r+r*2*object.hp/object.maxHp,drop+1.02*scale,z,object.slowTicks?0xb6edff:0xff997e)}
        if(state.crew.targetId===object.id)this.add('_ring',x,drop+.08,z,scale*1.2,.7,scale*1.2,t,0xffe9a8)
      }else if(object.type==='rock'||object.type==='log'){
        this.shadow(x,z,1.4)
        this.add(object.type,x,drop,z,1,1,1,object.phase+(object.type==='rock'?t*.1:.6),world===4?0xc8b1ef:world===1?0xf0bc8c:0xffffff)
      }else if(object.type==='gate'){
        this.add('gate',x,.05,z,1,1,1,.12,0xffffff)
        this.add('_ring',x,.015,z,.65,.65,.65,0,0xffe7ab)
      }else if(object.type==='rescue'){
        this.shadow(x,z,1.4);this.add('rescue',x,.17+bob+drop,z,1,1,1,Math.sin(t)*.15)
        this.add('_ring',x,.01,z,.65,.65,.65,0,0xffdda4)
      }else{
        const name=object.type==='heart'?'heart':object.type==='relic'?'crystal':'star',size=object.type==='firefly'?.75:.85
        this.add(name,x,.58+bob+drop,z,size,size,size,t*.8,0xffffff,.3)
        this.shadow(x,z,.9)
      }
    }
    const bx=(state.boat.x-.5)*RIVER_WIDTH,bz=.26*this.depth
    const heading=-Math.atan2(state.boat.heading*RIVER_WIDTH,Math.max(.002,state.boat.speed)*this.depth)*.38
    const lift=state.boat.altitude+(world===3?.28:world===4?.25:.02)
    const bob=(world===1||world===2?Math.sin(t*22)*.025:Math.sin(t*3)*.055)
    this.shadow(bx,bz,6+state.boat.altitude*.2,1.1)
    const target=state.objects.filter(o=>o.type==='predator'&&Math.abs(orbitDelta(o.x,state.boat.x))<1.3).sort((a,b)=>(a.id===state.crew.targetId?-10:combatDistance(a.x,a.y,objectAltitude(a),state.boat.x,.76,state.boat.altitude))-(b.id===state.crew.targetId?-10:combatDistance(b.x,b.y,objectAltitude(b),state.boat.x,.76,state.boat.altitude)))[0]
    const aim=target?Math.atan2(-orbitDelta(target.x,state.boat.x)*RIVER_WIDTH,-((target.y-.5)*this.depth-bz)):heading
    const pitch=target?Math.atan2(objectAltitude(target)+.45-(lift+1.06),Math.hypot(orbitDelta(target.x,state.boat.x)*RIVER_WIDTH,(target.y-.5)*this.depth-bz)):0
    this.anchor(bx,lift+bob,bz,heading);drawArk(this.part,state,t,aim-heading,pitch)
    this.canvas.dataset.crew=JSON.stringify(Object.values(state.players).map(p=>({id:p.id,station:p.station,...p.deck})))
    this.canvas.dataset.ship='four-room-ark'
    if(state.crew.shieldTicks||state.crew.bubble){
      this.add('_ring',bx,lift+.45,bz,1.5,1.5,1.5,t,0x9affeb)
      this.add('_ring',bx,lift+.6,bz,1.45,1.45,1.45,-t,0xa7dcff,.8)
    }
    for(let i=0;i<12;i++){
      const age=((t*(state.rushTicks?2.4:1.2)+i/12)%1),side=i%2?1:-1
      this.add('_particle',bx+side*(.5+age*.3),lift+.04,bz+1+age*2,.8+age*1.4,.25,.8+age*1.4,0,world===1?0xffd3a1:0xb5fff0)
      if(state.rushTicks)this.line(bx+side*.7,.18,bz+1,bx+side*.7,.18,bz+2.6,0xc6ffea)
    }
    if(state.boat.flight){for(let i=0;i<5;i++){const p=((t*.6+i/5)%1);this.add('_ring',bx,p*Math.max(.5,state.boat.altitude),bz,.9+p*.5,.4,.9+p*.5,0,0x9ff5ec)}this.line(bx,.05,bz,bx,state.boat.altitude,bz,0xbaf9ef)}
    for(const shot of state.crew.shots){
      const x=(shot.x-.5)*RIVER_WIDTH,z=(shot.y-.5)*this.depth,age=shot.life-shot.ticks
      const lift=shot.altitude
      const size=shot.kind==='manual'?1.6:1.05
      this.add('_shell',x,lift,z,size,size,size,t*2)
      this.add('_ring',x,lift,z,.42,.42,.42,t*3,0xffef9d,.7)
      for(let i=1;i<=5;i++)this.add('_spark',x-shot.vx*RIVER_WIDTH*i*.75,lift-shot.vAltitude*i*.75,z-shot.vy*this.depth*i*.75,(6-i)*.65,(6-i)*.65,(6-i)*.65,0,i<3?0xffe4a0:0xff7846)
      if(age<6){const muzzle=1-age/6;this.add('_shell',(shot.fromX-.5)*RIVER_WIDTH,shot.fromAltitude,(shot.fromY-.5)*this.depth,muzzle*2,muzzle*2,muzzle*2,0)}
    }
    for(const blast of state.crew.explosions){
      const age=1-blast.ticks/blast.life,x=(blast.x-.5)*RIVER_WIDTH,z=(blast.y-.5)*this.depth
      const radius=blast.radius*RIVER_WIDTH*(.25+age*.85),color=blast.kind==='chain'?0xc4b1ff:0xffbd63
      this.add('_blast',x,blast.altitude+.13,z,radius,Math.max(.15,1-age),radius,0,color)
      this.add('_blast',x,blast.altitude+.2,z,radius*.65,Math.max(.1,.6-age),radius*.65,t,0xffefbd,.15)
      if(age<.45)this.add('_shell',x,blast.altitude+.45,z,(1-age/.45)*2.6,(1-age/.45)*2.6,(1-age/.45)*2.6,0)
      for(let i=0;i<10;i++){const a=i/10*TAU+blast.id;this.add('_spark',x+Math.cos(a)*radius,blast.altitude+.3+Math.sin(age*Math.PI)*1.4,z+Math.sin(a)*radius,3*(1-age),3*(1-age),3*(1-age),0,i%2?color:0xffeabe)}
    }
    for(let i=0;i<28;i++){
      const z=((noise(i+401)*40+state.distance*.3)%40)-20,x=(noise(i+51)*ORBIT_LAP-.5)*RIVER_WIDTH
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
