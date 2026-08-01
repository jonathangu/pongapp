export function nextRandom(state: number): { value: number; state: number } {
  let next = (state + 0x6d2b79f5) | 0
  let value = next
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return {
    value: ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296,
    state: next,
  }
}

export function reflectUnit(value: number): number {
  let reflected = value % 2
  if (reflected < 0) reflected += 2
  return reflected <= 1 ? reflected : 2 - reflected
}
