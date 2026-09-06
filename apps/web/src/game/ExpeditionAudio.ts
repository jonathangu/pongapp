import { expeditionWorld, type CoopGameState } from '@pongapp/game-core'

const midi=(n:number)=>440*2**((n-69)/12)
const CHORDS=[[50,57,60,65],[46,53,57,62],[53,60,64,69],[48,55,58,65]]
const MELODY=[0,7,12,10,7,3,5,7,12,15,14,10,7,5,3,2]

/** Original 84-BPM Dorian expedition score. Slow pads, felt-like plucks, warm bass,
 * and danger percussion. Scheduling stays off the simulation's frame path. */
export class ExpeditionAudio{
  private context:AudioContext|null=null
  private master:GainNode|null=null
  private dry:GainNode|null=null
  private reverb:ConvolverNode|null=null
  private timer=0
  private beat=0
  private next=0
  private danger=0
  private world=0
  private muted=false
  private volume=.32
  private lastShot=0
  private lastHearts=3
  private voices=new Set<OscillatorNode>()
  readonly stats={notes:0,effects:0,maxVoices:0}

  async start(){
    if(!this.context){
      const c=this.context=new AudioContext(),master=this.master=c.createGain(),dry=this.dry=c.createGain(),compressor=c.createDynamicsCompressor()
      master.gain.value=this.muted?0:this.volume;dry.gain.value=.7;compressor.threshold.value=-18;compressor.ratio.value=4
      dry.connect(compressor);compressor.connect(master);master.connect(c.destination)
      const reverb=this.reverb=c.createConvolver(),wet=c.createGain();wet.gain.value=.19
      const impulse=c.createBuffer(2,c.sampleRate*2.2,c.sampleRate)
      let seed=17
      for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*Math.pow(1-i/data.length,3)}}
      reverb.buffer=impulse;reverb.connect(wet);wet.connect(compressor)
      this.next=c.currentTime+.06
    }
    await this.context.resume()
    if(!this.timer)this.timer=window.setInterval(()=>this.schedule(),80)
  }
  setMuted(muted:boolean){this.muted=muted;if(this.master&&this.context)this.master.gain.setTargetAtTime(muted?0:this.volume,this.context.currentTime,.12)}
  setVolume(level:number){if(Number.isFinite(level)){this.volume=Math.max(0,Math.min(1,level))*.64;this.setMuted(this.muted)}}
  get isMuted(){return this.muted}
  async suspend(){window.clearInterval(this.timer);this.timer=0;if(this.context){await this.context.suspend();this.next=this.context.currentTime+.08}}
  private note(n:number,at:number,duration:number,volume:number,type:OscillatorType='sine',soft=false){
    const c=this.context;if(!c||!this.dry||this.voices.size>=40)return
    const osc=c.createOscillator(),gain=c.createGain(),filter=c.createBiquadFilter()
    osc.type=type;osc.frequency.value=midi(n);filter.type='lowpass';filter.frequency.value=soft?650:1800;filter.Q.value=.3
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+(soft?.35:.008));gain.gain.exponentialRampToValueAtTime(.0001,at+duration)
    osc.connect(filter);filter.connect(gain);gain.connect(this.dry);if(this.reverb)gain.connect(this.reverb)
    this.voices.add(osc);this.stats.notes++;this.stats.maxVoices=Math.max(this.stats.maxVoices,this.voices.size)
    osc.onended=()=>{this.voices.delete(osc);osc.disconnect();filter.disconnect();gain.disconnect()}
    osc.start(at);osc.stop(at+duration+.05)
  }
  private schedule(){
    const c=this.context;if(!c||c.state!=='running')return
    const eighth=60/84/2
    if(this.next<c.currentTime-.3)this.next=c.currentTime+.04
    while(this.next<c.currentTime+.22){
      const bar=Math.floor(this.beat/16),chord=CHORDS[bar%4]!,trans=[0,2,5,7,0][this.world]!,at=this.next
      if(this.beat%16===0)for(const n of chord)this.note(n+trans,at,eighth*18,.045,'triangle',true)
      if(this.beat%4===0){this.note(chord[0]!-12+trans,at,eighth*3.8,.19);this.note(chord[0]!+trans,at,eighth*2,.025)}
      const arpeggio=chord[[0,2,1,3,2,1,3,2][this.beat%8]!]!+12+trans
      this.note(arpeggio,at,eighth*3,.065,'triangle')
      if(this.beat%2===0)this.note(chord[0]!+24+trans+MELODY[Math.floor(this.beat/2)%16]!,at,eighth*2.7,.055)
      if(this.danger>.1&&this.beat%2===0){this.note(31,at,.16,.12*this.danger);this.note(78+(this.beat%4)*2,at,.045,.018*this.danger,'triangle')}
      this.beat++;this.next+=eighth
    }
  }
  update(state:CoopGameState){
    this.world=expeditionWorld(state);this.danger=Math.min(1,(3-state.hearts)*.22+state.objects.filter(o=>o.type==='predator').length*.13)
    const c=this.context;if(!c||c.state!=='running')return
    if(state.crew.shotsFired>this.lastShot){this.note(38,c.currentTime,.24,.18,'triangle');this.note(62,c.currentTime,.12,.04);this.stats.effects++}
    if(state.hearts<this.lastHearts){this.note(28,c.currentTime,.5,.3,'triangle');this.stats.effects++}
    if(state.hearts>this.lastHearts)for(let i=0;i<3;i++)this.note(74+i*3,c.currentTime+i*.12,.65,.09)
    this.lastShot=state.crew.shotsFired;this.lastHearts=state.hearts
  }
  dispose(){window.clearInterval(this.timer);this.timer=0;for(const voice of this.voices){try{voice.stop()}catch{/* already stopped */}}void this.context?.close();this.context=null}
}
