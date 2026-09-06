import { neutralRescueInput, RESCUE_BUTTON, type RescueCrew } from '@pongapp/game-core'

export class RescueControls {
  x = 0
  y = 0
  buttons = 0
  commandHeld = false
  private keys = new Set<string>()
  private down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyF', 'KeyQ', 'KeyC'].includes(e.code)) e.preventDefault()
    this.keys.add(e.code)
  }
  private up = (e: KeyboardEvent) => { this.keys.delete(e.code) }
  private blur = () => this.clear()
  constructor() { window.addEventListener('keydown', this.down); window.addEventListener('keyup', this.up); window.addEventListener('blur', this.blur) }
  clear() { this.keys.clear(); this.x = this.y = this.buttons = 0; this.commandHeld = false }
  input(crew?: RescueCrew, blocked = false) {
    const input = neutralRescueInput()
    if (blocked || document.hidden) { input.active = false; return input }
    const keys = this.keys
    input.x = this.x || (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
    input.y = this.y || (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
    if (crew?.seat === 'engine') { input.aimX = -input.x; input.aimY = -input.y }
    input.buttons = this.buttons | (keys.has('Space') ? RESCUE_BUTTON.jump : 0) | (keys.has('KeyE') ? RESCUE_BUTTON.interact : 0) | (keys.has('KeyF') ? RESCUE_BUTTON.fire : 0) | (keys.has('KeyQ') ? RESCUE_BUTTON.drop : 0) | (this.commandHeld || keys.has('KeyC') ? RESCUE_BUTTON.command : 0)
    return input
  }
  dispose() { this.clear(); window.removeEventListener('keydown', this.down); window.removeEventListener('keyup', this.up); window.removeEventListener('blur', this.blur) }
}
