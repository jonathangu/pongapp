import { ORBIT_LAP } from '@pongapp/game-core'

export interface SkyObject {kind:'cloud'|'island'|'sun'|'planet'|'star';x:number;y:number;altitude:number;scale:number;color:number;rotation:number}
const noise=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v)}
/** World coordinates, never screen coordinates or boat-relative decoration. Shared with Canvas fallback. */
export function livingSky(world:number,distance:number,tick:number):SkyObject[]{
  const objects:SkyObject[]=[],scroll=distance*.3,t=tick/60
  const clouds=world===4?10:20
  for(let i=0;i<clouds;i++)objects.push({kind:'cloud',x:i/clouds*ORBIT_LAP+noise(i+20)*.2,y:.5+(((noise(i+40)*64+scroll)%64)-80)/22,altitude:7+noise(i+60)*10,scale:1.2+noise(i)*1.8,color:world===4?0x6966a2:world===1?0xffdbb9:0xf3f4e2,rotation:i*.7})
  for(let i=0;i<7;i++)objects.push({kind:'island',x:i/7*ORBIT_LAP+.2,y:.5+(((i*13+scroll*.6)%72)-94)/22,altitude:3+noise(i+9)*11+Math.sin(t*.2+i)*.2,scale:.75+noise(i+30)*.55,color:world===4?0xaea1da:0xffffff,rotation:i})
  objects.push({kind:'sun',x:1.4,y:-2.1,altitude:17,scale:world===4?2.4:3,color:world===4?0xd4d6ff:0xffedab,rotation:0})
  if(world===4)objects.push({kind:'planet',x:5.6,y:-1.7,altitude:13,scale:2.6,color:0x9580d6,rotation:-.35})
  for(let i=0;i<(world===4?90:20);i++)objects.push({kind:'star',x:noise(i+201)*ORBIT_LAP,y:.5+(((noise(i+230)*90+scroll*.2)%90)-100)/22,altitude:12+noise(i+280)*15,scale:.8+noise(i+1)*1.5,color:world===4?0xd4e5ff:0xffeab0,rotation:0})
  return objects
}
