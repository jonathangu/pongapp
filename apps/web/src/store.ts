import type { AbilityId, GameState } from '@pongapp/game-core'
import type { CourtEffectsSettings } from './game/PixiCourt'

export interface GuestProfile {
  id: string
  name: string
  favoriteAbility: AbilityId
  matches: number
  wins: number
  bestRally: number
  unlockedCosmetics: string[]
}

export interface AppSettings extends CourtEffectsSettings {
  muted: boolean
}

const PROFILE_KEY = 'pongapp.guest-profile.v1'
const SETTINGS_KEY = 'pongapp.settings.v1'

function randomId(): string {
  return `guest-${crypto.randomUUID()}`
}

export function loadProfile(): GuestProfile {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<GuestProfile> | null
    if (parsed?.id && parsed.name) {
      return {
        id: parsed.id,
        name: parsed.name,
        favoriteAbility: parsed.favoriteAbility ?? 'dash',
        matches: parsed.matches ?? 0,
        wins: parsed.wins ?? 0,
        bestRally: parsed.bestRally ?? 0,
        unlockedCosmetics: parsed.unlockedCosmetics ?? ['classic-lime'],
      }
    }
  } catch { /* use a fresh local profile */ }
  const profile: GuestProfile = {
    id: randomId(),
    name: 'Player One',
    favoriteAbility: 'dash',
    matches: 0,
    wins: 0,
    bestRally: 0,
    unlockedCosmetics: ['classic-lime'],
  }
  saveProfile(profile)
  return profile
}

export function saveProfile(profile: GuestProfile): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)) } catch { /* private browsing */ }
}

export function recordResult(profile: GuestProfile, state: GameState, playerId: string): GuestProfile {
  const player = state.players[playerId]
  if (!player) return profile
  const matches = profile.matches + 1
  const wins = profile.wins + (state.winnerTeam === player.team ? 1 : 0)
  // `player.returns` is a whole-match total, so "best rally" used to record
  // roughly "longest match" — a 30-point grind beat a genuine 20-hit rally. The
  // match screen now tracks the real per-rally peak and passes it in.
  const bestRally = Math.max(profile.bestRally, state.longestRally ?? 0)
  const unlocked = new Set(profile.unlockedCosmetics)
  if (matches >= 3) unlocked.add('paper-trail')
  if (wins >= 3) unlocked.add('court-orange')
  if (bestRally >= 12) unlocked.add('rally-glow')
  const next = { ...profile, matches, wins, bestRally, unlockedCosmetics: [...unlocked] }
  saveProfile(next)
  return next
}

export function loadSettings(): AppSettings {
  const defaults: AppSettings = {
    muted: false,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    screenShake: true,
    effectDensity: 'standard',
  }
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<AppSettings> | null) }
  } catch { return defaults }
}

export function saveSettings(settings: AppSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* private browsing */ }
}
