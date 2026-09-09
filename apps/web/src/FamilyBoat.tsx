import type { SVGProps } from 'react'

export default function FamilyBoat(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 130 100" aria-hidden="true" className="little-boat" {...props}>
    <path d="M63 12V75" stroke="#79534d" strokeWidth="4" strokeLinecap="round"/>
    <path d="M58 17L18 63H58Z" fill="#fff5d7" stroke="#e3c98c" strokeWidth="2"/>
    <path d="M69 23V63H105Z" fill="#f7b693" stroke="#e2947b" strokeWidth="2"/>
    <path d="M62 11L88 16L62 23Z" fill="#e06c70"/>
    <g><path d="M25 75Q20 47 38 48Q53 49 49 76" fill="#513d46"/><circle cx="37" cy="64" r="11" fill="#f3ba91"/><path d="M25 60Q25 44 44 51L49 59Q35 58 34 52L29 60" fill="#513d46"/><path d="M33 67Q37 71 41 67" fill="none" stroke="#ac625b" strokeWidth="1.6"/><circle cx="33" cy="63" r="1.3"/><circle cx="42" cy="63" r="1.3"/></g>
    <g><circle cx="85" cy="65" r="10" fill="#f3ba91"/><path d="M74 64Q69 47 89 52L96 61L86 57L77 63" fill="#513d46"/><circle cx="81" cy="65" r="1.3"/><circle cx="90" cy="65" r="1.3"/><path d="M82 70Q86 73 89 69" fill="none" stroke="#ac625b" strokeWidth="1.6"/></g>
    <g><path d="M51 77V67Q51 53 63 56Q76 55 75 77" fill="#513d46"/><circle cx="63" cy="69" r="9" fill="#f3ba91"/><path d="M54 66Q54 55 66 58L72 64L61 62L58 67" fill="#513d46"/><path d="M71 57L77 53V61L71 58L67 61V53Z" fill="#89c8df"/><path d="M55 78Q63 72 71 78" fill="#b6a1d5"/><circle cx="59" cy="69" r="1.2"/><circle cx="67" cy="69" r="1.2"/><path d="M60 73Q63 75 66 72" fill="none" stroke="#ac625b" strokeWidth="1.5"/></g>
    <path d="M11 74Q60 79 120 71L108 91Q61 104 23 91Z" fill="#d98d61" stroke="#805345" strokeWidth="3"/>
    <path d="M23 84Q66 89 108 81" fill="none" stroke="#f9ce91" strokeWidth="3"/>
  </svg>
}
