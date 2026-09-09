import type { KeyboardEvent, PointerEvent } from 'react'
import { aimHandle, reflectorHandle, LAUNCHER, MIRROR_HALF, RICOCHET_SCENES,
  type FlightSegment, type RescueTarget, type RicochetGame, type ShotPlayback } from '@pongapp/game-core/ricochet'
import FamilyBoat from '../FamilyBoat'

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const line = (segment: FlightSegment, fraction = 1) => `${segment.from.x},${segment.from.y} ${segment.from.x + (segment.to.x - segment.from.x) * fraction},${segment.from.y + (segment.to.y - segment.from.y) * fraction}`
const orbColor = (payload: string) => payload === 'burst' ? '#ffd29a' : payload === 'pierce' ? '#c9b6ff' : '#b5fff1'

export function Friend({ kind, rescued = false }: { kind: RescueTarget['kind']; rescued?: boolean }) {
  return <g className={rescued ? 'rr-friend rescued' : 'rr-friend'}>
    {kind === 'bunny' && <><ellipse cx="-5" cy="-10" rx="3" ry="7" fill="#fff3df"/><ellipse cx="4" cy="-11" rx="3" ry="7" fill="#fff3df"/><ellipse cx="-5" cy="-11" rx="1" ry="4" fill="#e9b5b8"/></>}
    {kind === 'otter' && <><circle cx="-7" cy="-6" r="4" fill="#ae846c"/><circle cx="7" cy="-6" r="4" fill="#ae846c"/></>}
    <ellipse cy="1" rx="10" ry="9" fill={kind === 'bunny' ? '#fff3df' : kind === 'bird' ? '#ffdc91' : '#c89572'}/>
    {kind === 'bird' ? <path d="M-2 2L2 2L0 5Z" fill="#db815c"/> : <ellipse cy="4" rx="5" ry="3" fill="#ffe6d1"/>}
    <circle cx="-3.5" cy="0" r="1.2" fill="#31434f"/><circle cx="3.5" cy="0" r="1.2" fill="#31434f"/>
    {rescued ? <path d="M-3 4Q0 7 3 4" fill="none" stroke="#614b48" strokeWidth="1.2" strokeLinecap="round"/> : <path d="M-1 3L1 3" stroke="#614b48" strokeWidth="1.3" strokeLinecap="round"/>}
  </g>
}

type Props = {
  game: RicochetGame; preview: FlightSegment[]; playback: ShotPlayback | null; elapsed: number
  busy: boolean; reduced: boolean; canAim: boolean; canReflect: boolean; activeJob: 'aim' | 'reflector'
  onPointerDown: (event: PointerEvent<SVGSVGElement>) => void
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void
  onPointerUp: (event: PointerEvent<SVGSVGElement>) => void
  onKey: (kind: 'aim' | 'move' | 'rotate', event: KeyboardEvent<SVGGElement>) => void
}
export default function RescueBoard({ game, preview, playback, elapsed, busy, reduced, canAim, canReflect, activeJob, onPointerDown, onPointerMove, onPointerUp, onKey }: Props) {
  const scene = RICOCHET_SCENES[game.scene]!, mirror = game.setup.reflector, handle = reflectorHandle(mirror), aim = aimHandle(game.setup.aim)
  const rescued = busy && playback ? new Set([...playback.before, ...playback.shot.events.filter(e => e.kind === 'rescue' && e.at <= elapsed).map(e => e.target!)]) : new Set(game.rescued)
  const paths = busy && playback ? playback.shot.segments : []
  const effects = busy && playback ? playback.shot.events.filter(event => event.at <= elapsed && elapsed - event.at < 700) : []
  const active = paths.filter(segment => segment.start <= elapsed && segment.end >= elapsed)
  const transform = playback?.shot.events.find(event => event.kind === 'split' || event.kind === 'focus')
  const combo = busy && transform && elapsed > transform.at && elapsed < transform.at + 1600 ? playback?.shot.combo : null
  return <div className={'rr-stage' + (busy ? ' rr-in-flight' : '')}>
    <svg className="rr-board" viewBox="0 0 360 440" role="group" aria-label="Rescue cove. Aim from the boat; move and turn the reflector in the dotted water area."
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <defs>
        <linearGradient id="rr-water" x2="0" y2="1"><stop stopColor="#123e55"/><stop offset=".65" stopColor="#13596a"/><stop offset="1" stopColor="#277781"/></linearGradient>
        <radialGradient id="rr-light"><stop stopColor="#83e1dc" stopOpacity=".24"/><stop offset="1" stopColor="#83e1dc" stopOpacity="0"/></radialGradient>
        <linearGradient id="rr-reef" x2="0" y2="1"><stop stopColor="#64838e"/><stop offset="1" stopColor="#314e61"/></linearGradient>
        <radialGradient id="rr-blast"><stop stopColor="#fff9d4" stopOpacity=".8"/><stop offset=".48" stopColor="#ffd694" stopOpacity=".35"/><stop offset="1" stopColor="#f5a67b" stopOpacity="0"/></radialGradient>
        <filter id="rr-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
      </defs>
      <rect x="1" y="1" width="358" height="438" rx="25" fill="url(#rr-water)" stroke="#74a2aa" strokeOpacity=".55"/>
      <ellipse cx="160" cy="122" rx="190" ry="165" fill="url(#rr-light)"/>
      <path d="M14 24H346M14 414H346" fill="none" stroke="#a4d7d0" strokeOpacity=".16" strokeLinecap="round"/>
      <g className="rr-ripples" fill="none" stroke="#b3e4e3" strokeOpacity=".12" strokeLinecap="round">
        {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${34 + i % 3 * 110} ${59 + i * 57}q10 5 20 0m20 2q6 3 12 0`}/>)}
      </g>
      <g aria-hidden="true" fill="#ddf8e9" opacity=".35">{[0, 1, 2, 3, 4, 5, 6].map(i => <circle key={i} cx={29 + (i * 53 % 300)} cy={48 + (i * 73 % 310)} r={i % 2 ? 1 : 1.5}/>)}</g>
      <rect x={scene.area.left - 16} y={scene.area.top - 16} width={scene.area.right - scene.area.left + 32} height={scene.area.bottom - scene.area.top + 32}
        rx="20" fill="#b0dcf0" fillOpacity={canReflect && !busy ? .1 : .035} stroke="#bde8f6" strokeOpacity={canReflect && !busy ? .48 : .2} strokeDasharray="3 6"/>
      {!busy && activeJob === 'reflector' && <text x={scene.area.left + 4} y={scene.area.bottom + 31} fill="#c1e4e8" fontSize="8" letterSpacing="1">MOVE HERE</text>}
      {scene.reefs.map((reef, i) => <g key={i} className="rr-reef">
        <line x1={reef.a.x} y1={reef.a.y + 5} x2={reef.b.x} y2={reef.b.y + 5} stroke="#082e41" strokeWidth="22" strokeLinecap="round" opacity=".5"/>
        <line x1={reef.a.x} y1={reef.a.y} x2={reef.b.x} y2={reef.b.y} stroke="url(#rr-reef)" strokeWidth="14"/>
        <line x1={reef.a.x + 3} y1={reef.a.y - 5} x2={reef.b.x - 3} y2={reef.b.y - 5} stroke="#9cadad" strokeWidth="3" strokeLinecap="round"/>
        <path d={`M${reef.a.x + 18} ${reef.a.y - 6}l6 -8 13 3 5 6m45 -1 8 -10 13 5 5 6`} fill="#76969a"/>
        <text x={(reef.a.x + reef.b.x) / 2} y={reef.a.y + 26} textAnchor="middle" fill="#b9d4d6" fontSize="9" letterSpacing="1.8">REEF</text>
      </g>)}
      {!busy && preview.map((segment, i) => <g key={i} pointerEvents="none">
        <polyline points={line(segment)} fill="none" stroke={segment.transformed ? '#d0c0ff' : '#d5fff1'} strokeWidth={segment.transformed && segment.size > 1 ? 9 : 2}
          strokeOpacity={segment.transformed && segment.size > 1 ? .2 : .58} strokeDasharray="3 7" strokeLinecap="round"/>
        <circle cx={segment.to.x} cy={segment.to.y} r="2" fill="#f9e9c0" opacity=".7"/>
      </g>)}
      {scene.targets.map(target => rescued.has(target.id) ? null : <g key={target.id} data-rr-target={target.id} transform={`translate(${target.x} ${target.y})`}>
        <ellipse cy="19" rx="11" ry="3" fill="#012d40" opacity=".24"/>
        <g className="rr-bubble" style={{ animationDelay: `${target.id * -.31}s` }}>
          <circle r="16" fill="#d4f1e5" fillOpacity=".13" stroke="#c8f4eb" strokeOpacity=".76" strokeWidth="1.3"/>
          <path d="M-11 -5Q-8 -13 -2 -13" fill="none" stroke="#fff4df" strokeWidth="2" strokeLinecap="round" opacity=".7"/>
          <Friend kind={target.kind}/>
        </g>
      </g>)}
      <g transform={`translate(${mirror.x} ${mirror.y}) rotate(${mirror.angle})`} data-rr-reflector data-angle={mirror.angle}>
        <ellipse rx="38" ry="12" fill="#082d49" opacity=".3"/>
        <rect x={-MIRROR_HALF - 3} y="-6" width={MIRROR_HALF * 2 + 6} height="12" rx="6" fill="#efcf95" stroke="#a68870" strokeWidth="1.5"/>
        <rect x={-MIRROR_HALF} y="-3" width={MIRROR_HALF * 2} height="6" rx="3" fill={mirror.mode === 'split' ? '#c5affc' : mirror.mode === 'focus' ? '#ffd9a1' : '#a1f3e7'}/>
        <path d="M-23 -1H23" stroke="#fffce9" strokeWidth="1.5" opacity=".85"/>
      </g>
      <g className="rr-reflector-center" role="button" tabIndex={canReflect && !busy ? 0 : -1} aria-label="Move reflector. Arrow keys move it within its water area."
        onKeyDown={event => onKey('move', event)} data-rr-move transform={`translate(${mirror.x} ${mirror.y})`}>
        <circle r="25" fill="transparent"/>
        <circle r="12" fill="#f4ead0" stroke="#c8a77f" strokeWidth="1.5"/>
        {mirror.mode === 'split' ? <path d="M-6 5L0 -6L6 5ZM0 -5V6" fill="none" stroke="#745ab6" strokeWidth="1.7" strokeLinejoin="round"/> :
          mirror.mode === 'focus' ? <><circle r="6" fill="none" stroke="#bf855a" strokeWidth="1.4"/><circle r="2.5" fill="#bf855a"/></> : <path d="M-6 0H6M0 -6V6" stroke="#287f87" strokeWidth="1.5" strokeLinecap="round"/>}
      </g>
      {!busy && <g className={canReflect ? 'rr-handle rr-handle-active' : 'rr-handle rr-handle-peer'} role="button" tabIndex={canReflect ? 0 : -1}
        aria-label="Turn reflector. Arrow keys rotate its face." onKeyDown={event => onKey('rotate', event)} data-rr-rotate>
        <line x1={mirror.x} y1={mirror.y} x2={handle.x} y2={handle.y} stroke="#ddc9fb" strokeWidth="1.5" strokeDasharray="3 4"/>
        <circle cx={handle.x} cy={handle.y} r="23" fill="transparent"/>
        <circle cx={handle.x} cy={handle.y} r="13" fill="#b9a2ea" stroke="#e0ceff" strokeWidth="1.5"/>
        <path d={`M${handle.x - 5} ${handle.y + 3}a6 6 0 1 1 9 -7m-3 0h4v-4`} stroke="#392e60" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      </g>}
      <ellipse cx="180" cy="424" rx="55" ry="7" fill="#a7ead6" fillOpacity=".12"/>
      <FamilyBoat x="126" y="359" width="108" height="79" className="rr-family-boat"/>
      <g transform={`translate(${LAUNCHER.x} ${LAUNCHER.y})`}>
        <circle r="15" fill="#e7ce9a" stroke="#ac8a63" strokeWidth="2"/>
        <circle r="10" fill="#245767"/>
        <g transform={`rotate(${game.setup.aim})`}><rect x="1" y="-6" width="24" height="12" rx="5" fill="#dbbe8c" stroke="#f4e0b2" strokeWidth="1.5"/></g>
        <circle r="6" fill={orbColor(game.setup.payload)} className={busy ? '' : 'rr-launch-glow'}/>
      </g>
      {!busy && <g className={canAim ? 'rr-handle rr-handle-active' : 'rr-handle rr-handle-peer'} role="button" tabIndex={canAim ? 0 : -1}
        aria-label="Aim the launcher. Left and right arrow keys change the shot angle." onKeyDown={event => onKey('aim', event)} data-rr-aim>
        <circle cx={aim.x} cy={aim.y} r="25" fill="transparent"/>
        <circle cx={aim.x} cy={aim.y} r="16" fill="#b5eadb" fillOpacity=".2" stroke="#c6fbe9" strokeWidth="1.4"/>
        <path d={`M${aim.x - 5} ${aim.y}h10M${aim.x} ${aim.y - 5}v10`} stroke="#e7fff3" strokeWidth="1.5" strokeLinecap="round"/>
      </g>}
      {busy && paths.filter(segment => reduced || elapsed >= segment.start && elapsed < segment.end + 320).map((segment, i) => {
        const fraction = reduced ? 1 : clamp((elapsed - segment.start) / (segment.end - segment.start || 1))
        return <g key={i} pointerEvents="none" opacity={reduced ? .45 : elapsed > segment.end ? clamp(1 - (elapsed - segment.end) / 320) : 1}>
          <polyline points={line(segment, fraction)} fill="none" stroke={orbColor(segment.payload)} strokeWidth={segment.payload === 'pierce' ? segment.size > 1 ? 23 : 5 : 4} strokeOpacity={segment.payload === 'pierce' ? .18 : .15} strokeLinecap="round"/>
          <polyline points={line(segment, fraction)} fill="none" stroke={orbColor(segment.payload)} strokeWidth={segment.payload === 'pierce' ? segment.size > 1 ? 7 : 2.3 : 1.5} strokeOpacity=".8" strokeLinecap="round"/>
        </g>
      })}
      {!reduced && active.map(segment => {
        const progress = clamp((elapsed - segment.start) / (segment.end - segment.start || 1)), x = segment.from.x + (segment.to.x - segment.from.x) * progress, y = segment.from.y + (segment.to.y - segment.from.y) * progress
        return <g key={segment.orb} transform={`translate(${x} ${y})`} data-rr-orb={segment.orb} pointerEvents="none">
          <circle r={12 * segment.size} fill={orbColor(segment.payload)} opacity=".35" filter="url(#rr-glow)"/>
          <circle r={5 * segment.size} fill={orbColor(segment.payload)}/><circle cx="-1" cy="-1" r={2 * segment.size} fill="#fffef1"/>
        </g>
      })}
      {!reduced && effects.filter(event => event.kind !== 'rescue' && event.kind !== 'launch').map((event, i) => {
        const progress = clamp((elapsed - event.at) / 550), size = event.kind === 'burst' ? event.size : event.kind === 'bounce' ? 17 : 38
        return <g key={`${event.at}-${event.orb}-${i}`} data-rr-effect={event.kind} transform={`translate(${event.x} ${event.y})`} opacity={1 - progress} pointerEvents="none">
          {event.kind === 'burst' && <circle r={size * (.2 + .8 * progress)} fill="url(#rr-blast)"/>}
          <circle r={size * (.25 + .75 * progress)} fill="none" stroke={event.kind === 'split' ? '#d9c3ff' : '#ffe0a6'} strokeWidth={event.kind === 'burst' ? 3 : 1.5}/>
          {(event.kind === 'burst' || event.kind === 'split' || event.kind === 'focus') && [0, 1, 2, 3, 4, 5, 6, 7].map(j => {
            const angle = j * Math.PI / 4, d = size * (.15 + .85 * progress)
            return <circle key={j} cx={Math.cos(angle) * d} cy={Math.sin(angle) * d} r={2.5 * (1 - progress) + .5} fill="#fff3cc"/>
          })}
        </g>
      })}
      {!reduced && effects.filter(event => event.kind === 'rescue').map(event => {
        const progress = clamp((elapsed - event.at) / 650), target = scene.targets[event.target!]!
        return <g key={event.target} pointerEvents="none" transform={`translate(${event.x + (180 - event.x) * progress} ${event.y + (418 - event.y) * progress - Math.sin(progress * Math.PI) * 48}) scale(${1 - progress * .45})`} opacity={progress > .85 ? (1 - progress) / .15 : 1}>
          <Friend kind={target.kind} rescued/>
        </g>
      })}
      <g aria-hidden="true" transform="translate(24 404)"><path d="M0 0C-8 -8 -17 4 0 14C17 4 8 -8 0 0" fill="#eeaeaa"/><text x="19" y="11" fill="#f9efda" fontSize="13" fontWeight="700">{rescued.size}/{scene.targets.length}</text></g>
      <text x="337" y="415" textAnchor="end" fill="#c7e5df" fontSize="8.5" letterSpacing=".3">Mara · Finn · Luma</text>
    </svg>
    {combo && <div className={'rr-combo' + (reduced ? ' rr-static' : '')} key={playback!.id}><span>✦</span> {combo}</div>}
  </div>
}
