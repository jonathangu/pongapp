import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BEAST_PALETTES, HULL_RADIUS, RESCUE_BIOMES, RESCUE_LADDERS, RESCUE_PLATFORMS, RESCUE_STATIONS, rescueEnemyRecipe, stationSpec,
  type RescueCrew, type RescueEnemy, type RescueEvent, type RescueState } from '@pongapp/game-core'

const ART = import.meta.env.BASE_URL + 'art/starling/'
const TAU = Math.PI * 2
export const CREW_TINTS = { mint: '#9df6d9', coral: '#ff9c99', gold: '#ffe39a', violet: '#c2a2ff', sky: '#9bdfff', rose: '#ffa6db', lime: '#d0f4a0', pearl: '#edf4ff' }
const GEM_COLORS = { power: '#ff82b8', beam: '#ffe6a2', metal: '#8ed4ff' }
export interface RescueRenderSettings { reducedMotion: boolean; lowEffects: boolean }
export function rescueView(width: number, height: number, zoom = 1) { const scale = Math.min(width / 14.4, height / 15.8) / zoom; return { scale, width: width / scale, height: height / scale } }
const basic = (color: THREE.ColorRepresentation, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color, ...extra })
const solid = (color: THREE.ColorRepresentation, metalness = .3) => new THREE.MeshStandardMaterial({ color, roughness: .4, metalness })
function part(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); group.add(m); return m }
function box(group: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) { return part(group, new THREE.BoxGeometry(w, h, d), material, x, y, z) }
function orb(group: THREE.Group, x: number, y: number, z: number, radius: number, material: THREE.Material, sx = 1, sy = 1) { const m = part(group, new THREE.SphereGeometry(radius, 16, 10), material, x, y, z); m.scale.set(sx, sy, 1); return m }
function labelTexture(text: string, color = '#ffe4ae') {
  const c = document.createElement('canvas'); c.width = 192; c.height = 64; const ctx = c.getContext('2d')!
  ctx.font = '700 38px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, 96, 33)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!, fill = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  fill.addColorStop(0, 'rgba(255,255,255,1)'); fill.addColorStop(.18, 'rgba(255,255,255,.65)'); fill.addColorStop(.5, 'rgba(255,255,255,.13)'); fill.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = fill; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}
interface Actor { group: THREE.Group; limbs: THREE.Object3D[]; head: THREE.Object3D; aura: THREE.Mesh }
function crewActor(color: string, pet: boolean): Actor {
  const g = new THREE.Group(), suit = solid(color, .2), dark = solid('#123e4a'), cream = solid('#fff2ce', .05), brass = solid('#b9864a', .6)
  box(g, 0, .35, 0, .35, .4, .28, suit); box(g, -.04, .36, -.16, .3, .34, .16, dark)
  const head = new THREE.Group(); head.position.set(0, .79, .025); g.add(head)
  orb(head, 0, 0, 0, .34, suit, 1.08, .93)
  orb(head, 0, -.025, .18, .285, cream, 1.04, .86)
  orb(head, -.107, .01, .425, .036, basic('#092536'), 1, 1.4); orb(head, .107, .01, .425, .036, basic('#092536'), 1, 1.4)
  orb(head, -.097, .025, .452, .011, basic('#ffffff')); orb(head, .117, .025, .452, .011, basic('#ffffff'))
  orb(head, .0, -.098, .44, .035, basic(pet ? '#674436' : '#ce8975'), 1, .55)
  orb(head, -.32, -.015, .02, .1, brass); orb(head, .32, -.015, .02, .1, brass)
  if (pet) { const ear = new THREE.ConeGeometry(.12, .28, 3); part(head, ear, suit, -.22, .28, 0); part(head, ear.clone(), suit, .22, .28, 0) }
  else { box(head, .18, .37, 0, .025, .18, .025, brass); orb(head, .18, .48, 0, .05, basic('#ffe89a')) }
  const limbs: THREE.Object3D[] = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .23, .5, .015); box(arm, 0, -.1, 0, .12, .24, .13, suit); orb(arm, 0, -.22, .02, .075, cream); g.add(arm); limbs.push(arm)
    const leg = new THREE.Group(); leg.position.set(side * .105, .2, .01); box(leg, 0, -.09, 0, .135, .18, .15, dark); orb(leg, .025, -.16, .055, .1, suit, 1.15, .55); g.add(leg); limbs.push(leg)
  }
  const aura = part(g, new THREE.RingGeometry(.56, .61, 40), basic('#d9fff0', { transparent: true, opacity: .8, depthTest: false }), 0, .47, -.3)
  aura.visible = false
  return { group: g, limbs, head, aura }
}
function consoleGroup(id: typeof RESCUE_STATIONS[number]['id']) {
  const spec = stationSpec(id), g = new THREE.Group(), brass = solid('#d5a270', .6), black = solid('#102a3b')
  box(g, 0, .12, .1, .55, .23, .26, brass); box(g, 0, .4, .06, .66, .52, .22, brass); box(g, 0, .43, .19, .53, .36, .02, black)
  const screen = box(g, 0, .45, .214, .43, .25, .025, basic(spec.color, { transparent: true, opacity: .75 }))
  screen.name = 'screen'
  const text = part(g, new THREE.PlaneGeometry(.52, .173), new THREE.MeshBasicMaterial({ map: labelTexture(spec.short, '#142834'), transparent: true }), 0, .45, .232)
  text.name = 'label'
  orb(g, -.2, .23, .26, .045, basic('#fcf0b3')); orb(g, .2, .23, .26, .045, basic(spec.color))
  return g
}
interface Effect { event: RescueEvent; born: number; mesh: THREE.Mesh; duration: number }
function lightningGeometry(seed: number) {
  const vertices: number[] = []
  const segment = (ax: number, ay: number, bx: number, by: number, width: number) => {
    const length = Math.hypot(bx - ax, by - ay), dx = -(by - ay) / length * width, dy = (bx - ax) / length * width
    vertices.push(ax + dx, ay + dy, 0, ax - dx, ay - dy, 0, bx + dx, by + dy, 0, bx + dx, by + dy, 0, ax - dx, ay - dy, 0, bx - dx, by - dy, 0)
  }
  let x = 0, y = 0
  for (let i = 1; i <= 16; i++) {
    const nx = Math.sin(seed * 1.37 + i * 7.91) * (i % 3 ? .7 : 1.7), ny = i * 1.5
    segment(x, y, nx, ny, .065)
    if (i === 5 || i === 10) {
      const side = i === 5 ? 1 : -1
      segment(nx, ny, nx + side * 1.5, ny - .8, .035); segment(nx + side * 1.5, ny - .8, nx + side * 2.6, ny - 3, .022)
    }
    x = nx; y = ny
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); return geometry
}

/** Pure view: world curvature is decorative; all actionable actors share one orthographic plane. */
export class RescueScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 300)
  private sky = new THREE.Scene()
  private atmosphere = new THREE.Scene()
  private weatherMaterial: THREE.ShaderMaterial
  private warning = new THREE.Group()
  private landscape = new THREE.Scene()
  private landscapeCamera = new THREE.PerspectiveCamera(58, 1, .1, 3000)
  private skyCamera = new THREE.Camera()
  private surface: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>
  private hull = new THREE.Group()
  private actors = new Map<string, Actor>()
  private seats = new Map<string, THREE.Group>()
  private mounts = new Map<string, THREE.Group>()
  private flails = new Map<string, THREE.Group>()
  private enemies = new Map<number, THREE.Group>()
  private objects = new THREE.Group()
  private worldKey = ''
  private cages = new Map<number, THREE.Group>()
  private gifts = new Map<number, THREE.Group>()
  private gems = new Map<number, THREE.Group>()
  private portal: THREE.Group | null = null
  private bullets: THREE.Mesh[] = []
  private effects: Effect[] = []
  private glow = glowTexture()
  private shield: THREE.Mesh
  private lastEvent = 0
  private width = 1
  private height = 1
  private disposed = false
  private loaded = false
  private renderTimes: number[] = []
  private frameTimes: number[] = []
  private lastFrame = 0
  private frames = 0
  private cameraX = 0
  private cameraY = -24
  private shake = 0
  private zoom = 1
  private textures: THREE.Texture[] = []
  private enemyTextures: THREE.Texture[] = []
  private enemyArt = new Map<string, THREE.Texture>()
  private vessels = new Map<number, { group: THREE.Group; crew: Map<string, Actor>; guns: Map<string, THREE.Group> }>()
  private settings: RescueRenderSettings = { lowEffects: false, reducedMotion: false }
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.autoClear = false; this.renderer.setClearColor('#08152d')
    this.renderer.info.autoReset = false
    const skyMaterial = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,1.,1.);}',
      fragmentShader: 'varying vec2 vUv; float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} void main(){vec3 c=mix(vec3(.028,.055,.15),vec3(.11,.09,.23),vUv.y);vec2 p=floor(vUv*vec2(420.,600.));float star=step(.997,hash(p))*pow(max(0.,1.-length(fract(vUv*vec2(420.,600.))-.5)*2.),3.);gl_FragColor=vec4(c+star*.7,1.);}' })
    this.sky.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMaterial))
    const surfaceMaterial = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, offset: { value: new THREE.Vector2() }, biome: { value: 0 }, storm: { value: 0 }, region: { value: 0 } },
      vertexShader: 'varying vec3 p; varying vec3 n; uniform float time;uniform float storm;uniform float region; void main(){p=position;n=normal;vec3 pos=position;float wave=(sin(pos.z*.4+pos.x*.18+time*1.8)+.35*sin(pos.z*.85-pos.x*.32-time*2.5))*(.12+storm*.9);if(region<.5)pos+=normal*wave;gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);}',
      fragmentShader: `varying vec3 p; varying vec3 n; uniform float time; uniform vec2 offset; uniform float biome;uniform float storm;uniform float region;
        float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);} float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        void main(){vec2 q=vec2(p.x,p.z)+offset; float broad=noise(q*.045)+.5*noise(q*.11)+.2*noise(q*.36);float veins=pow(abs(sin(q.x*.19+q.y*.12+noise(q*.06)*5.)),14.);float ripples=pow(abs(sin(q.x*.8+q.y*.24+time*.22+noise(q*.18)*3.)),28.);
        vec3 deep=biome<.5?vec3(.026,.18,.21):biome<1.5?vec3(.16,.09,.17):vec3(.10,.07,.25);vec3 light=biome<.5?vec3(.10,.38,.34):biome<1.5?vec3(.39,.26,.24):vec3(.24,.20,.47);
        vec3 color=mix(deep,light,clamp(broad*.7,0.,1.));color+=veins*vec3(.08,.15,.14)+ripples*.027;float sparkle=step(.993,hash(floor(q*1.7)))*pow(max(0.,1.-length(fract(q*1.7)-.5)*2.),4.);color+=sparkle*vec3(.6,.5,.27);
        if(region<.5){float crest=sin(q.y*.4+q.x*.18+time*1.8)+.35*sin(q.y*.85-q.x*.32-time*2.5);float foam=smoothstep(.9,1.3,crest)*(.2+.8*storm)*noise(q*1.4);color=mix(color,vec3(.58,.79,.72),foam*.55);color*=1.-storm*.24;}
        else if(region<1.5){float rivers=1.-smoothstep(.08,.18,abs(sin(q.y*.017+sin(q.x*.014)*2.)));vec3 forest=mix(vec3(.035,.12,.075),vec3(.19,.32,.14),noise(q*.36)*noise(q*.91)*2.);vec2 cell=floor(q*.28),uv=fract(q*.28)-.5;float canopy=1.-smoothstep(.22,.48,length(uv+vec2(hash(cell)-.5,hash(cell+7.)-.5)*.2));forest+=canopy*vec3(.025,.075,.02);color=mix(forest,vec3(.09,.30,.29)+ripples*.04,rivers);}
        else{vec2 cell=floor(q*.19),uv=fract(q*.19)-.5;float size=.16+hash(cell)*.17;float d=length(uv+vec2(hash(cell)-.5,hash(cell+8.)-.5)*.25);float rim=exp(-pow((d-size)*30.,2.));float pit=1.-smoothstep(size*.55,size,d);color=mix(vec3(.07,.045,.16),vec3(.28,.18,.34),noise(q*.45))*(1.-pit*.24)+rim*vec3(.065,.045,.09)+veins*vec3(.06,.035,.1);color+=sparkle*vec3(.7,.6,.9);}
        float horizon=pow(1.-max(.0,n.y),2.);color=mix(color,vec3(.17,.37,.46),horizon*.55);gl_FragColor=vec4(color,1.);}` })
    const cylinder = new THREE.CylinderGeometry(48, 48, 1800, 128, 180, true); cylinder.rotateX(Math.PI / 2)
    this.surface = new THREE.Mesh(cylinder, surfaceMaterial); this.surface.position.y = -48; this.landscape.add(this.surface)
    this.scene.add(new THREE.AmbientLight('#bddfff', 2.2)); const light = new THREE.DirectionalLight('#ffe0b5', 3); light.position.set(-8, 12, 20); this.scene.add(light)
    this.scene.add(this.objects, this.hull)
    this.buildShip()
    this.shield = new THREE.Mesh(new THREE.RingGeometry(HULL_RADIUS + .48, HULL_RADIUS + .65, 40, 1, -Math.PI / 4, Math.PI / 2), basic('#ffe38a', { transparent: true, opacity: .88, side: THREE.DoubleSide, depthTest: false }))
    this.shield.position.z = 6; this.hull.add(this.shield)
    const loader = new THREE.TextureLoader()
    void new GLTFLoader().loadAsync(ART + 'galley.glb').then(gltf => {
      if (this.disposed) { this.disposeObject(gltf.scene); return }
      const spec = stationSpec('galley'); gltf.scene.position.set(spec.x + .12, spec.y, 2)
      gltf.scene.traverse(o => { o.renderOrder = 7 }); this.hull.add(gltf.scene); this.seats.get('galley')!.visible = false
    }).catch(() => {})
    for (const [kind, file] of Object.entries({ moth: 'glasswing', beetle: 'ram-beetle', jelly: 'jelly', needle: 'needle', sentinel: 'sentinel', guardian: 'guardian' })) {
      void loader.loadAsync(ART + file + '.webp').then(texture => { if (this.disposed) { texture.dispose(); return }; texture.colorSpace = THREE.SRGBColorSpace; this.enemyTextures.push(texture); this.enemyArt.set(kind, texture) }).catch(() => {})
    }
    void loader.loadAsync(ART + 'observatory-hull.webp').then(texture => {
      if (this.disposed) { texture.dispose(); return }
      texture.colorSpace = THREE.SRGBColorSpace; this.textures.push(texture)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(12.54, 12.54), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))
      m.position.set(0, .62, .4); m.renderOrder = 1; this.hull.add(m); this.loaded = true
    }).catch(() => { /* sculpted vector hull below remains playable offline */ })
    for (let i = 0; i < 160; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basic('#ffe8a4', { transparent: true, map: this.glow, depthWrite: false, blending: THREE.AdditiveBlending }))
      mesh.visible = false; mesh.position.z = 10; mesh.renderOrder = 20; this.scene.add(mesh); this.bullets.push(mesh)
    }
    this.weatherMaterial = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false,
      uniforms: { time: { value: 0 }, intensity: { value: 0 }, flash: { value: 0 }, view: { value: new THREE.Vector2(20, 20) }, ship: { value: new THREE.Vector2() }, reduced: { value: 0 } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `varying vec2 vUv;uniform float time;uniform float intensity;uniform float flash;uniform float reduced;uniform vec2 view;uniform vec2 ship;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}float fbm(vec2 p){return noise(p)*.52+noise(p*2.03)*.27+noise(p*4.01)*.14+noise(p*8.02)*.07;}
      void main(){vec2 p=(vUv-.5)*view;vec2 flow=vec2(time*.35,time*.09);float cloud=fbm(p*.16+flow);float thick=smoothstep(.27,.73,cloud);float safe=smoothstep(5.5,7.5,length(p-ship));float alpha=thick*intensity*.94*safe;vec3 c=mix(vec3(.055,.09,.15),vec3(.28,.34,.40),pow(cloud,2.));float rain=step(.981,fract((p.x+p.y*.4)*3.1+hash(floor(p*2.))*2.))*step(.5,fract(p.y*.9+time*4.));c+=rain*.12*intensity*(1.-reduced);c+=flash*.16;alpha=max(alpha,flash*.07);gl_FragColor=vec4(c,alpha);}` })
    this.atmosphere.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.weatherMaterial))
    const ring = part(this.warning, new THREE.RingGeometry(2.7, 2.83, 64), basic('#ffd590', { transparent: true, depthTest: false }), 0, 0, 30)
    ring.name = 'warning-ring'
    for (const a of [0, Math.PI / 2]) { const m = box(this.warning, 0, 0, 30, 1.2, .08, .02, basic('#fff1c0')); m.rotation.z = a }
    this.scene.add(this.warning); this.warning.visible = false
  }
  private buildShip() {
    const brass = solid('#b98555', .7), floor = solid('#a56b60', .35), dark = solid('#0b1a30')
    part(this.hull, new THREE.CircleGeometry(4.8, 80), dark, 0, 0, .1)
    part(this.hull, new THREE.TorusGeometry(4.55, .25, 8, 100), solid('#e78686', .4), 0, 0, .2)
    for (const platform of RESCUE_PLATFORMS) {
      const x = (platform.x1 + platform.x2) / 2, width = platform.x2 - platform.x1
      box(this.hull, x, platform.y - .12, 1, width, .24, .3, floor).renderOrder = 3
      box(this.hull, x, platform.y + .015, 1.2, width, .035, .08, basic('#ffd698')).renderOrder = 4
      for (let px = platform.x1 + .25; px < platform.x2; px += .6) orb(this.hull, px, platform.y - .10, 1.19, .038, brass).renderOrder = 4
    }
    for (const ladder of RESCUE_LADDERS) {
      const h = ladder.y2 - ladder.y1, cy = (ladder.y1 + ladder.y2) / 2
      for (const side of [-1, 1]) box(this.hull, ladder.x + side * .21, cy, 1.15, .075, h + .15, .09, brass).renderOrder = 5
      for (let y = ladder.y1 + .15; y < ladder.y2; y += .28) box(this.hull, ladder.x, y, 1.22, .44, .055, .1, basic('#ffd48a')).renderOrder = 5
    }
    for (const spec of RESCUE_STATIONS) {
      const console = consoleGroup(spec.id); console.position.set(spec.x, spec.y, 1.65); console.traverse(o => { o.renderOrder = 6 }); this.hull.add(console); this.seats.set(spec.id, console)
      if (spec.id === 'map' || spec.id === 'shield' || spec.id === 'galley') continue
      const mount = new THREE.Group()
      orb(mount, 0, 0, 0, .42, brass); box(mount, .37, 0, .08, .72, .38, .4, solid(spec.id === 'engine' ? '#5bcfbe' : spec.id === 'starburst' ? '#8a8bd3' : '#d78989'))
      box(mount, .7, 0, .15, .25, .3, .28, dark); box(mount, .78, 0, .30, .12, .21, .02, basic(spec.color))
      mount.position.z = 3; mount.traverse(o => { o.renderOrder = 9 }); this.hull.add(mount); this.mounts.set(spec.id, mount)
    }
    const dock = box(this.hull, 0, -1.2, 1.3, .8, .06, .3, basic('#a8f4df')); dock.renderOrder = 7
  }
  resize(width: number, height: number) {
    this.width = Math.max(1, width); this.height = Math.max(1, height)
    const view = rescueView(this.width, this.height, this.zoom)
    this.camera.left = -view.width / 2; this.camera.right = view.width / 2; this.camera.top = view.height / 2; this.camera.bottom = -view.height / 2; this.camera.updateProjectionMatrix()
    const aspect = this.width / this.height, half = Math.atan(Math.tan(29 * Math.PI / 180) / Math.max(1, aspect / .78))
    // Solve the cylinder tangency at the upper 3% of each side: tiny corner horizons at any aspect.
    let lo = half, hi = 1.5
    for (let i = 0; i < 30; i++) { const p = (lo + hi) / 2, dx = Math.tan(half) * aspect, dy = -Math.sin(p) + .94 * Math.tan(half) * Math.cos(p); if ((112 * dy) ** 2 - 4 * (dx * dx + dy * dy) * (56 * 56 - 48 * 48) > 0) hi = p; else lo = p }
    const pitch = (lo + hi) / 2
    this.landscapeCamera.aspect = aspect; this.landscapeCamera.fov = half * 360 / Math.PI; this.landscapeCamera.position.set(0, 8, 26)
    this.landscapeCamera.lookAt(0, 8 - Math.sin(pitch) * 60, 26 - Math.cos(pitch) * 60); this.landscapeCamera.updateProjectionMatrix()
    this.renderer.setPixelRatio(this.settings.lowEffects ? 1 : Math.min(1.65, window.devicePixelRatio || 1)); this.renderer.setSize(this.width, this.height, false)
  }
  setSettings(settings: RescueRenderSettings) { if (this.settings.lowEffects !== settings.lowEffects) { this.settings = settings; this.resize(this.width, this.height) } else this.settings = settings }
  worldPoint(clientX: number, clientY: number) { const bounds = this.canvas.getBoundingClientRect(), view = rescueView(this.width, this.height, this.zoom); return { x: this.cameraX + ((clientX - bounds.left) / this.width - .5) * view.width, y: this.cameraY - ((clientY - bounds.top) / this.height - .5) * view.height } }
  private buildWorld(state: RescueState) {
    for (const child of [...this.objects.children]) this.disposeObject(child)
    this.objects.clear(); this.cages.clear(); this.gifts.clear()
    const palette = RESCUE_BIOMES[state.biome]
    if (state.region === 'jungle') {
      const positions: Array<[number, number, number]> = []
      for (let x = -50; x <= 50; x += 10) for (let y = -48; y <= 48; y += 10) {
        const xx = x + Math.sin(x * 2.1 + y) * 2, yy = y + Math.cos(y * 1.7 + x) * 2
        if (Math.hypot(xx, yy + 24) < 8 || state.docks.some(d => Math.hypot(xx - d.x, yy - d.y) < 9) || state.world.cages.some(c => Math.hypot(xx - c.x, yy - c.y) < 4)) continue
        positions.push([xx, yy, .8 + (Math.sin(x * 3 + y) + 1) * .3])
      }
      const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .2, 2.4, 5), solid('#7b6550'), positions.length)
      const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), solid('#548662'), positions.length * 3)
      const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3()
      for (const [i, [x, y, size]] of positions.entries()) {
        matrix.compose(position.set(x, y, -4), rotation, scale.set(size, size, size)); trunks.setMatrixAt(i, matrix)
        for (let j = 0; j < 3; j++) {
          matrix.compose(position.set(x + (j - 1) * .8 * size, y + (j === 1 ? 1.8 : 1) * size, -3.5), rotation, scale.set(1.4 * size, 1.05 * size, .8 * size)); leaves.setMatrixAt(i * 3 + j, matrix)
          leaves.setColorAt(i * 3 + j, new THREE.Color(j === 1 ? '#8baa68' : i % 2 ? '#67a17d' : '#507e65'))
        }
      }
      this.objects.add(trunks, leaves)
    }
    for (const o of state.world.obstacles) {
      const g = new THREE.Group(), rock = part(g, new THREE.IcosahedronGeometry(o.radius, 1), solid(state.biome === 0 ? '#376566' : state.biome === 1 ? '#7b5f62' : '#625988', .35))
      rock.rotation.set(o.style * .4, o.style * .7, o.id * .43); g.position.set(o.x, o.y, -2)
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + o.id; const crystal = part(g, new THREE.ConeGeometry(o.radius * .12, o.radius * .75, 5), basic(palette.tint, { transparent: true, opacity: .6 }), Math.cos(a) * o.radius * .6, Math.sin(a) * o.radius * .6, o.radius * .6); crystal.rotation.z = a - Math.PI / 2 }
      this.objects.add(g)
    }
    for (const cage of state.world.cages) {
      const g = new THREE.Group(); g.position.set(cage.x, cage.y, .4)
      const pet = crewActor(['#a5f4d5', '#ffd697', '#e4b3ff', '#ffb2c7', '#a9e8ff'][cage.pet]!, true); pet.group.scale.setScalar(.9); pet.group.position.y = -.4; g.add(pet.group)
      const shell = new THREE.Group(); shell.name = 'shell'; part(shell, new THREE.TorusGeometry(1.12, .065, 6, 48), solid('#d9b875', .6))
      part(shell, new THREE.CircleGeometry(1.08, 48), basic('#8df9e9', { transparent: true, opacity: .10, depthWrite: false }), 0, 0, -.1)
      for (const x of [-.5, 0, .5]) box(shell, x, 0, .8, .05, Math.sqrt(1.05 ** 2 - x * x) * 2, .06, basic('#ead797'))
      g.add(shell); this.objects.add(g); this.cages.set(cage.id, g)
    }
    for (const gift of state.world.gifts) {
      const g = new THREE.Group(); g.position.set(gift.x, gift.y, .8)
      box(g, 0, 0, 0, .8, .75, .7, solid(GEM_COLORS[gift.kind], .2)); box(g, 0, 0, .37, .16, .78, .02, basic('#fff1cb')); box(g, 0, 0, .38, .83, .14, .02, basic('#fff1cb'))
      this.objects.add(g); this.gifts.set(gift.id, g)
    }
    for (const dock of state.docks) {
      const g = new THREE.Group(); g.position.set(dock.x, dock.y, -.4)
      const land = orb(g, 0, -.3, -.8, 4.5, solid(state.region === 'space' ? '#75638d' : '#77976a'), 1.25, .63)
      land.rotation.z = .08
      for (let x = -1; x <= 1; x++) box(g, x * .28, -3.6, .6, .23, 3.7, .25, solid('#ae8060'))
      for (let y = -5.2; y < -2; y += .3) box(g, 0, y, .7, 1.2, .12, .15, solid('#d4ad77'))
      const houses = dock.kind === 'city' ? 5 : dock.kind === 'launch' ? 1 : 3
      for (let i = 0; i < houses; i++) {
        const x = (i - (houses - 1) / 2) * 1.55, h = dock.kind === 'city' ? 1.8 + (i % 3) * .65 : 1.35
        box(g, x, h / 2, 0, 1.2, h, .8, solid(i % 2 ? '#c4a989' : '#c38f85'))
        const roof = part(g, new THREE.ConeGeometry(.95, .9, 4), solid('#47746f'), x, h + .25, .1); roof.rotation.y = Math.PI / 4
        for (const side of [-1, 1]) box(g, x + side * .27, h * .64, .44, .23, .4, .015, basic('#ffdda3'))
        box(g, x, .2, .44, .28, .5, .03, solid('#28444b'))
      }
      if (dock.kind === 'launch') {
        box(g, 0, 3, -.2, .35, 7, .4, solid('#c7a27d')); box(g, 1.6, 5.8, -.1, 3.4, .22, .3, solid('#d7bd8f'))
        part(g, new THREE.TorusGeometry(1.9, .11, 8, 64), basic('#b9a4ff'), 1.7, 3.5, .5)
        part(g, new THREE.ConeGeometry(.52, 1.4, 12), solid('#d2d9c9'), 1.7, 3.6, .4)
      }
      if (state.region !== 'space') for (const side of [-1, 1]) {
        box(g, side * 4, 1.3, .1, .22, 3.3, .3, solid('#987257'))
        for (let i = 0; i < 5; i++) { const leaf = orb(g, side * 4 + Math.cos(i / 5 * TAU) * .6, 2.8 + Math.sin(i / 5 * TAU) * .45, .2, .8, solid('#57977b'), 1.4, .38); leaf.rotation.z = i / 5 * TAU }
      }
      part(g, new THREE.PlaneGeometry(7, 1.3), new THREE.MeshBasicMaterial({ map: labelTexture(dock.name, '#fff0c8'), transparent: true, depthTest: false }), 0, -6.2, 3)
      this.objects.add(g)
    }
    this.portal = new THREE.Group(); this.portal.position.set(state.world.portal.x, state.world.portal.y, .3)
    for (const [radius, color] of [[3.8, '#83f8e0'], [3.45, '#e4b1ff'], [3.05, '#ffe8b3']] as const) part(this.portal, new THREE.TorusGeometry(radius, .065, 6, 90), basic(color))
    this.objects.add(this.portal)
  }
  private drawCrew(p: RescueCrew, state: RescueState, playerId: string) {
    let actor = this.actors.get(p.id)
    if (!actor) { actor = crewActor(CREW_TINTS[p.color], p.pet); actor.group.traverse(o => { o.renderOrder = 12 }); this.hull.add(actor.group); this.actors.set(p.id, actor) }
    const motion = this.settings.reducedMotion ? 0 : Math.sin(p.step * 8), moving = Math.abs(p.vx) > .3, climbing = Boolean(p.ladder)
    actor.group.position.set(p.x, p.y + (p.seat ? .1 : 0), 2.6); actor.group.scale.x = p.facing
    actor.head.rotation.z = this.settings.reducedMotion ? 0 : p.seat ? Math.sin(state.time * 2) * .04 : moving ? motion * .06 : 0
    for (let i = 0; i < actor.limbs.length; i++) actor.limbs[i]!.rotation.z = climbing ? Math.sin(p.step * 6 + i * Math.PI) * .7 : moving ? motion * (i < 2 ? .55 : -.55) : p.seat && i % 2 === 0 ? -.6 : !p.grounded ? (i % 2 ? .3 : -.5) : 0
    actor.aura.visible = p.id === playerId; (actor.aura.material as THREE.MeshBasicMaterial).opacity = .65
  }
  private enemyActor(enemy: RescueEnemy) {
    const g = new THREE.Group(), color = enemy.kind === 'beetle' ? '#f0938c' : enemy.kind === 'sentinel' ? '#c79c5a' : enemy.kind === 'guardian' ? '#b69afe' : '#87e9df'
    const shell = solid(color, .4), gold = solid('#dfb45e', .65), eye = basic('#abfff4')
    orb(g, 0, 0, 0, enemy.radius * .8, shell, enemy.kind === 'needle' ? 1.7 : 1, enemy.kind === 'needle' ? .55 : 1)
    if (enemy.kind === 'moth') for (const side of [-1, 1]) { const wing = orb(g, side * enemy.radius * .9, .15, -.1, enemy.radius * .8, solid('#a6ddeb', .5), .8, 1.4); wing.name = `wing${side}`; wing.rotation.z = side * -.5 }
    if (enemy.kind === 'beetle' || enemy.kind === 'sentinel') for (const side of [-1, 1]) { const claw = part(g, new THREE.TorusGeometry(enemy.radius * .5, enemy.radius * .16, 6, 20, Math.PI * 1.5), gold, side * enemy.radius * .8, .25, .4); claw.name = `wing${side}`; claw.rotation.z = side * .7 }
    if (enemy.kind === 'guardian' || enemy.kind === 'jelly') for (let i = 0; i < 6; i++) { const tendril = part(g, new THREE.TorusGeometry(enemy.radius * .7, enemy.radius * .07, 5, 20, Math.PI * 1.1), gold, Math.cos(i / 6 * TAU) * enemy.radius * .7, Math.sin(i / 6 * TAU) * enemy.radius * .7, -.2); tendril.rotation.z = i / 6 * TAU; tendril.name = `tendril${i}` }
    orb(g, -.25 * enemy.radius, .14, enemy.radius * .75, .17 * enemy.radius, eye); orb(g, .25 * enemy.radius, .14, enemy.radius * .75, .17 * enemy.radius, eye)
    const tell = part(g, new THREE.RingGeometry(enemy.radius * 1.3, enemy.radius * 1.38, 48), basic('#ffcf95', { transparent: true, opacity: .8, depthTest: false }), 0, 0, 4); tell.name = 'tell'
    const health = box(g, 0, enemy.radius * 1.5, 4, enemy.radius * 2, .07, .02, basic('#ffd8a7')); health.name = 'health'
    this.scene.add(g); return g
  }
  private drawVessels(state: RescueState) {
    for (const vessel of state.vessels) {
      let model = this.vessels.get(vessel.id)
      if (!model) {
        const group = new THREE.Group(), crew = new Map<string, Actor>(), guns = new Map<string, THREE.Group>()
        const color = vessel.role === 'raider' ? '#cb7182' : vessel.role === 'merchant' ? '#a6c497' : '#80c6d2'
        part(group, new THREE.CircleGeometry(4.5, 64), basic('#152935'), 0, 0, 0)
        part(group, new THREE.TorusGeometry(4.6, .23, 8, 80), solid(color), 0, 0, .2)
        part(group, new THREE.TorusGeometry(4.28, .055, 6, 64), basic('#dec193'), 0, 0, .3)
        for (const floor of RESCUE_PLATFORMS) box(group, (floor.x1 + floor.x2) / 2, floor.y - .08, .5, floor.x2 - floor.x1, .16, .3, solid('#ab856a'))
        for (const ladder of RESCUE_LADDERS) { for (const side of [-1, 1]) box(group, ladder.x + side * .2, (ladder.y1 + ladder.y2) / 2, .5, .06, ladder.y2 - ladder.y1, .1, solid('#d5b785')); for (let y = ladder.y1 + .15; y < ladder.y2; y += .35) box(group, ladder.x, y, .6, .4, .06, .1, basic('#ecd49b')) }
        for (const station of RESCUE_STATIONS) { const console = consoleGroup(station.id); console.position.set(station.x, station.y, 1); group.add(console); if (!['map', 'galley', 'shield'].includes(station.id)) { const gun = new THREE.Group(); orb(gun, 0, 0, 0, .33, solid('#bb9d75')); box(gun, .4, 0, .15, .7, .28, .3, solid(color)); group.add(gun); guns.set(station.id, gun) } }
        part(group, new THREE.PlaneGeometry(7, 1), new THREE.MeshBasicMaterial({ map: labelTexture(vessel.name, vessel.role === 'raider' ? '#ffb1b5' : '#d6fff0'), transparent: true, depthTest: false }), 0, 5.5, 4)
        const hp = box(group, 0, 4.9, 4, 5, .09, .02, basic(color)); hp.name = 'vessel-hp'
        this.scene.add(group); model = { group, crew, guns }; this.vessels.set(vessel.id, model)
      }
      model.group.visible = !vessel.disabled && Math.hypot(vessel.ship.x - state.ship.x, vessel.ship.y - state.ship.y) < 50
      model.group.position.set(vessel.ship.x, vessel.ship.y, 0)
      model.group.getObjectByName('vessel-hp')!.scale.x = vessel.ship.hp / vessel.ship.maxHp
      for (const p of vessel.crew) {
        let actor = model.crew.get(p.id)
        if (!actor) { actor = crewActor(vessel.role === 'raider' ? '#eab0b8' : CREW_TINTS[p.color], true); model.group.add(actor.group); model.crew.set(p.id, actor) }
        actor.group.position.set(p.x, p.y, 2.5); actor.group.scale.x = p.facing
        for (let i = 0; i < actor.limbs.length; i++) actor.limbs[i]!.rotation.z = this.settings.reducedMotion ? 0 : Math.abs(p.vx) > .3 || p.ladder ? Math.sin(p.step * 7 + i * Math.PI) * .5 : 0
      }
      for (const station of vessel.stations) { const gun = model.guns.get(station.id); if (gun) { const spec = stationSpec(station.id), angle = spec.rail ? station.angle : spec.angle; gun.position.set(Math.cos(angle) * HULL_RADIUS, Math.sin(angle) * HULL_RADIUS, 3); gun.rotation.z = station.angle } }
    }
    for (const [id, v] of this.vessels) if (!state.vessels.some(s => s.id === id)) { this.disposeObject(v.group); this.vessels.delete(id) }
  }
  private receiveEvents(events: RescueEvent[], now: number, synthetic = false) {
    for (const event of events) {
      if (!synthetic && event.id <= this.lastEvent) continue
      if (!synthetic) this.lastEvent = event.id
      if (event.kind === 'hit' && event.size === 1) this.shake = .25
      if (!['shot', 'beam', 'flail', 'shield', 'hit', 'boom', 'rescue', 'starburst', 'lightning', 'ability', 'meal'].includes(event.kind)) continue
      if (this.effects.length > (this.settings.lowEffects ? 60 : 160)) continue
      const line = event.kind === 'beam' || event.kind === 'starburst' && event.value >= 0 || event.kind === 'flail' || event.kind === 'lightning'
      const color = event.kind === 'shield' ? '#ffe7a2' : event.kind === 'rescue' ? '#9bffe4' : event.kind === 'boom' ? '#ffbbcb' : '#fff2ae'
      const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>(line ? new THREE.PlaneGeometry(1, 1) : new THREE.PlaneGeometry(2, 2), basic(color, { map: this.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }))
      mesh.position.set(event.x, event.y, 12); mesh.renderOrder = 30
      if (line) { mesh.scale.set(event.size, event.kind === 'starburst' ? 1.5 : event.kind === 'flail' ? .32 : .32, 1); mesh.rotation.z = event.angle; mesh.position.x += Math.cos(event.angle) * event.size / 2; mesh.position.y += Math.sin(event.angle) * event.size / 2 }
      if (event.kind === 'lightning') {
        mesh.geometry.dispose(); mesh.geometry = lightningGeometry(event.id)
        mesh.material.map = null; mesh.material.color.set('#d6f4ff'); mesh.material.side = THREE.DoubleSide
        mesh.position.set(event.x, event.y, 12); mesh.scale.setScalar(1); mesh.rotation.z = 0
      }
      this.scene.add(mesh); this.effects.push({ event, born: now, mesh, duration: event.kind === 'boom' ? .8 : event.kind === 'rescue' ? 1.2 : line ? .22 : .3 })
    }
  }
  render(state: RescueState, playerId: string, now: number) {
    if (this.disposed) return
    const start = performance.now(), seconds = now / 1000, key = `${state.epoch}:${state.initialSeed}:${state.biome}`
    if (key !== this.worldKey) { this.worldKey = key; this.buildWorld(state); this.cameraX = state.ship.x; this.cameraY = state.ship.y + 1; this.lastEvent = 0 }
    if (this.lastFrame) this.frameTimes.push(now - this.lastFrame); this.lastFrame = now
    if (this.frameTimes.length > 600) this.frameTimes.shift()
    const smoothing = this.settings.reducedMotion ? 1 : .10
    const activeSeat = state.crew.find(c => c.id === playerId)?.seat
    const targetZoom = state.enemies.some(e => e.kind === 'guardian') ? 1.45 : activeSeat && !['map', 'galley'].includes(activeSeat) ? 1.35 : state.enemies.length ? 1.18 : 1
    this.zoom += (targetZoom - this.zoom) * (this.settings.reducedMotion ? 1 : .05)
    const framing = rescueView(this.width, this.height, this.zoom)
    this.camera.left = -framing.width / 2; this.camera.right = framing.width / 2; this.camera.top = framing.height / 2; this.camera.bottom = -framing.height / 2; this.camera.updateProjectionMatrix()
    this.cameraX += (state.ship.x + state.ship.vx * .18 - this.cameraX) * smoothing
    this.cameraY += (state.ship.y + state.ship.vy * .18 + 1 - this.cameraY) * smoothing
    this.shake *= .83
    this.camera.position.set(this.cameraX + (this.settings.reducedMotion ? 0 : Math.sin(seconds * 75) * this.shake), this.cameraY + (this.settings.reducedMotion ? 0 : Math.cos(seconds * 60) * this.shake), 100)
    this.camera.lookAt(this.camera.position.x, this.camera.position.y, 0)
    this.surface.material.uniforms.time!.value = state.time; this.surface.material.uniforms.offset!.value.set(state.ship.x * .9, -state.ship.y * .9); this.surface.material.uniforms.biome!.value = state.biome
    this.surface.material.uniforms.storm!.value = this.settings.reducedMotion ? state.weather.intensity * .2 : state.weather.intensity; this.surface.material.uniforms.region!.value = state.region === 'sea' ? 0 : state.region === 'jungle' ? 1 : 2
    const view = rescueView(this.width, this.height, this.zoom)
    this.weatherMaterial.uniforms.time!.value = this.settings.reducedMotion ? 0 : state.time; this.weatherMaterial.uniforms.intensity!.value = state.weather.intensity
    this.weatherMaterial.uniforms.flash!.value = this.settings.reducedMotion ? 0 : state.weather.flash
    this.weatherMaterial.uniforms.view!.value.set(view.width, view.height); this.weatherMaterial.uniforms.ship!.value.set(state.ship.x - this.cameraX, state.ship.y - this.cameraY)
    this.weatherMaterial.uniforms.reduced!.value = this.settings.reducedMotion ? 1 : 0
    this.warning.visible = Boolean(state.weather.strike)
    if (state.weather.strike) { this.warning.position.set(state.weather.strike.x, state.weather.strike.y, 0); this.warning.rotation.z = this.settings.reducedMotion ? 0 : state.time; this.warning.scale.setScalar(1 + Math.max(0, state.weather.strike.at - state.time) * .2) }
    this.hull.position.set(state.ship.x, state.ship.y, 0); this.hull.rotation.set(0, 0, 0)
    this.drawVessels(state)
    for (const p of state.crew) this.drawCrew(p, state, playerId)
    for (const [id, actor] of this.actors) if (!state.crew.some(p => p.id === id)) { this.disposeObject(actor.group); this.actors.delete(id) }
    for (const station of state.stations) {
      const spec = stationSpec(station.id), console = this.seats.get(station.id)!, screen = console.getObjectByName('screen') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>
      screen.material.color.set(station.upgrade ? GEM_COLORS[station.upgrade] : spec.color); screen.material.opacity = station.operated ? 1 : .52
      const mount = this.mounts.get(station.id)
      if (mount) { const angle = spec.rail ? station.angle : spec.angle; mount.position.set(Math.cos(angle) * HULL_RADIUS, Math.sin(angle) * HULL_RADIUS, 3); mount.rotation.z = station.angle; mount.scale.setScalar(station.upgrade ? 1.15 : 1) }
      const hasFlail = station.upgrade === 'metal' && ['north', 'south', 'east', 'west'].includes(station.id)
      let flail = this.flails.get(station.id)
      if (hasFlail && !flail) {
        flail = new THREE.Group()
        const metal = solid('#95cee7', .8), brass = solid('#d6ac73', .7)
        for (let i = 0; i < 11; i++) {
          const link = part(flail, new THREE.TorusGeometry(.11, .035, 5, 8), i % 2 ? brass : metal, i * .28 + .15, 0, 0)
          if (i % 2) link.rotation.x = Math.PI / 3
        }
        orb(flail, 3.3, 0, 0, .46, metal)
        for (let i = 0; i < 8; i++) {
          const a = i * TAU / 8, spike = part(flail, new THREE.ConeGeometry(.13, .42, 4), brass, 3.3 + Math.cos(a) * .53, Math.sin(a) * .53, .04)
          spike.rotation.z = a - Math.PI / 2
        }
        flail.renderOrder = 12; this.hull.add(flail); this.flails.set(station.id, flail)
      }
      if (flail) { flail.visible = hasFlail; flail.position.set(Math.cos(spec.angle) * (HULL_RADIUS + .6), Math.sin(spec.angle) * (HULL_RADIUS + .6), 5); flail.rotation.z = station.flailAngle }
      if (station.id === 'shield') { this.shield.visible = station.operated || station.lingering > 0; this.shield.rotation.z = station.angle; this.shield.scale.setScalar(station.upgrade === 'power' ? 1.035 : 1) }
    }
    if (state.ship.thrust && !this.settings.lowEffects) {
      const engine = state.stations.find(v => v.id === 'engine')!, x = state.ship.x + Math.cos(engine.angle) * 5.5, y = state.ship.y + Math.sin(engine.angle) * 5.5
      if (this.frames % 2 === 0 && this.effects.length < 120) this.receiveEvents([{ id: 0, kind: 'shot', x, y, angle: engine.angle, size: 1, value: 0 }], seconds, true)
    }
    for (const cage of state.world.cages) { const g = this.cages.get(cage.id)!; g.visible = !cage.rescued; g.getObjectByName('shell')!.visible = !cage.open; g.position.y = cage.y + (this.settings.reducedMotion ? 0 : Math.sin(state.time * 1.5 + cage.id) * .12) }
    for (const gift of state.world.gifts) { const g = this.gifts.get(gift.id)!; g.visible = !gift.opened; g.rotation.z = this.settings.reducedMotion ? 0 : Math.sin(state.time + gift.id) * .1 }
    if (this.portal) { this.portal.rotation.z = this.settings.reducedMotion ? 0 : state.time * .12; this.portal.scale.setScalar(state.guardianDefeated ? 1 + Math.sin(state.time * 3) * .025 : .7) }
    for (const gem of state.gems) {
      let g = this.gems.get(gem.id)
      if (!g) { g = new THREE.Group(); part(g, new THREE.OctahedronGeometry(.19), solid(GEM_COLORS[gem.kind], .55)); this.hull.add(g); this.gems.set(gem.id, g) }
      g.position.set(gem.x, gem.y, 4.5); g.rotation.y = this.settings.reducedMotion ? 0 : state.time * 2; g.visible = !gem.socket
    }
    for (const [id, g] of this.gems) if (!state.gems.some(v => v.id === id)) { this.disposeObject(g); this.gems.delete(id) }
    for (const enemy of state.enemies) {
      let g = this.enemies.get(enemy.id); if (!g) { g = this.enemyActor(enemy); this.enemies.set(enemy.id, g) }
      const art = this.enemyArt.get(enemy.kind)
      if (art && !g.getObjectByName('creature-art')) {
        for (const child of g.children) if (!['tell', 'health'].includes(child.name)) child.visible = false
        const geometry = new THREE.PlaneGeometry(enemy.radius * (enemy.kind === 'needle' ? 4 : 3.2), enemy.radius * 3.2, 16, 16)
        const material = new THREE.MeshBasicMaterial({ map: art, transparent: true, depthWrite: false, side: THREE.DoubleSide })
        const recipe = rescueEnemyRecipe(state, enemy.kind)
        if (recipe) {
          material.color.setHex(BEAST_PALETTES[recipe.palette]).lerp(new THREE.Color('#ffffff'), .7)
          const accent = basic(BEAST_PALETTES[recipe.palette])
          if (recipe.ornament === 'halo') { const halo = part(g, new THREE.TorusGeometry(enemy.radius * 1.15, .045, 6, 48), accent, 0, enemy.radius * .5, 3); halo.scale.y = .45 }
          else for (let i = 0; i < recipe.segments; i++) {
            const a = i / recipe.segments * Math.PI * 1.5 + Math.PI * .25
            if (recipe.ornament === 'lanterns') orb(g, Math.cos(a) * enemy.radius * 1.2, Math.sin(a) * enemy.radius * 1.2, 3, .12, accent)
            else { const spike = part(g, new THREE.ConeGeometry(.09, recipe.ornament === 'antlers' ? .65 : .35, 4), accent, Math.cos(a) * enemy.radius, Math.sin(a) * enemy.radius, 3); spike.rotation.z = a - Math.PI / 2 }
          }
        }
        material.onBeforeCompile = shader => { shader.uniforms.animTime = { value: 0 }; material.userData.shader = shader; shader.vertexShader = 'uniform float animTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(animTime*3.0+position.y*2.0)*.08*(.3+abs(position.x)); transformed.y += sin(animTime*2.0+position.x*1.3)*.045;') }
        const sprite = part(g, geometry, material, 0, 0, 2); sprite.name = 'creature-art'
      }
      const sprite = g.getObjectByName('creature-art') as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | undefined
      if (sprite?.material.userData.shader) sprite.material.userData.shader.uniforms.animTime.value = this.settings.reducedMotion ? 0 : state.time + enemy.id
      g.position.set(enemy.x, enemy.y, 1); g.rotation.z = enemy.kind === 'needle' ? enemy.angle : 0
      for (const child of g.children) if (child.name.startsWith('wing')) child.rotation.z = Math.sin(state.time * 5 + enemy.id) * .22
      const tell = g.getObjectByName('tell')!; tell.visible = enemy.phase === 'tell'; tell.scale.setScalar(.96 + Math.sin(state.time * 12) * .06)
      g.getObjectByName('health')!.scale.x = Math.max(0, enemy.hp / enemy.maxHp)
    }
    for (const [id, g] of this.enemies) if (!state.enemies.some(e => e.id === id)) { this.disposeObject(g); this.enemies.delete(id) }
    for (let i = 0; i < this.bullets.length; i++) {
      const mesh = this.bullets[i]!, bullet = state.bullets[i]; mesh.visible = Boolean(bullet)
      if (bullet) { mesh.position.set(bullet.x, bullet.y, 10); mesh.rotation.z = Math.atan2(bullet.vy, bullet.vx); mesh.scale.set(bullet.kind === 'orb' ? .8 : 1.1, bullet.kind === 'orb' ? .8 : .28, 1); (mesh.material as THREE.MeshBasicMaterial).color.set(bullet.enemy ? '#ff999e' : '#fff0ad') }
    }
    this.receiveEvents(state.events, seconds)
    this.effects = this.effects.filter(effect => {
      const t = (seconds - effect.born) / effect.duration
      if (t > 1) { this.disposeObject(effect.mesh); return false }
      const m = effect.mesh.material as THREE.MeshBasicMaterial; m.opacity = (1 - t) * .9
      if (!['beam', 'flail', 'starburst', 'lightning'].includes(effect.event.kind)) effect.mesh.scale.setScalar(effect.event.size * (.4 + t * 2))
      return true
    })
    this.renderer.info.reset(); this.renderer.clear(); this.renderer.render(this.sky, this.skyCamera); this.renderer.clearDepth(); this.renderer.render(this.landscape, this.landscapeCamera); this.renderer.clearDepth(); this.renderer.render(this.scene, this.camera); this.renderer.render(this.atmosphere, this.skyCamera)
    this.frames++; this.renderTimes.push(performance.now() - start); if (this.renderTimes.length > 600) this.renderTimes.shift()
  }
  stats() { const percentile = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)] ?? 0; return { renderer: 'three-webgl2', hullAssetLoaded: this.loaded, frames: this.frames, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, programs: this.renderer.info.programs?.length ?? 0, effects: this.effects.length, renderP95Ms: percentile(this.renderTimes, .95), frameP95Ms: percentile(this.frameTimes, .95), drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles } }
  private disposeObject(object: THREE.Object3D) {
    object.traverse(node => { if (node instanceof THREE.InstancedMesh) node.dispose() })
    object.removeFromParent(); object.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) { const map = (material as THREE.MeshBasicMaterial).map; if (map && map !== this.glow && !this.textures.includes(map) && !this.enemyTextures.includes(map)) map.dispose(); material.dispose() } } })
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.disposeObject(this.scene); this.disposeObject(this.landscape); this.disposeObject(this.sky); this.disposeObject(this.atmosphere); for (const texture of this.textures) texture.dispose(); for (const texture of this.enemyTextures) texture.dispose(); this.glow.dispose(); this.renderer.dispose() }
}
