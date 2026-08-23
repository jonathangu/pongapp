import type { ActivePalType } from '@pongapp/game-core'

const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`

export const PAL_SPRITE_URLS: Record<ActivePalType, string> = {
  guard: `${baseUrl}assets/pals/bumper.png`,
  striker: `${baseUrl}assets/pals/hook.png`,
  captain: `${baseUrl}assets/pals/captain.png`,
  hatchling: `${baseUrl}assets/pals/hatchling.png`,
}

