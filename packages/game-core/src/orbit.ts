/** One coordinate unit remains one former river-width; a complete barrel is 2π units. */
export const ORBIT_LAP = Math.PI * 2
export const wrapOrbit = (x: number): number => ((x % ORBIT_LAP) + ORBIT_LAP) % ORBIT_LAP
/** Signed shortest displacement from `from` to `to`, including the seam. */
export const orbitDelta = (to: number, from: number): number => wrapOrbit(to - from + ORBIT_LAP / 2) - ORBIT_LAP / 2
export const orbitDistance = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(orbitDelta(ax,bx),ay-by)
