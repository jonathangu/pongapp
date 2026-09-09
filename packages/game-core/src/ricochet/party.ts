import { createRicochetGame, finishRicochetShot, ricochetWon, validReflector, validSetup } from './game'
import { simulateRicochet } from './simulation'
import type { RicochetCommand, RicochetParty, RicochetResult, Seat } from './types'

export function createRicochetParty(game = createRicochetGame()): RicochetParty {
  return { game, revision: 0, launcher: 0, ready: false, layoutRevision: 0, editedAt: [0, 0], busyUntil: 0, playback: null }
}
export function applyRicochetCommand(party: RicochetParty, seat: Seat, command: RicochetCommand, now: number, presence: [boolean, boolean] = [true, true]): RicochetResult {
  const reject = (reason: RicochetResult['reason']): RicochetResult => ({ accepted: false, party, reason })
  if (seat !== 0 && seat !== 1 || !Number.isSafeInteger(command.revision) || command.revision > party.revision || command.revision < 0) return reject('invalid')
  if (now < party.busyUntil) return reject('busy')
  const edit = command.kind === 'aim' || command.kind === 'reflector'
  if (command.revision < party.layoutRevision || edit && command.revision < party.editedAt[seat] || !edit && command.revision !== party.revision) return reject('stale')
  const revision = party.revision + 1
  let next: RicochetParty = { ...party, revision }
  if (command.kind === 'aim' || command.kind === 'reflector') {
    if (ricochetWon(party.game)) return reject('unavailable')
    if (command.kind === 'aim' ? seat !== party.launcher : seat === party.launcher) return reject('wrong-job')
    const setup = command.kind === 'aim' ? { ...party.game.setup, aim: command.aim, payload: command.payload } : { ...party.game.setup, reflector: { ...command.reflector } }
    if (!validSetup(party.game, setup) || command.kind === 'reflector' && !validReflector(party.game, command.reflector)) return reject('invalid')
    const editedAt: [number, number] = [...party.editedAt]; editedAt[seat] = revision
    next = { ...next, game: { ...party.game, setup }, ready: false, editedAt }
  } else if (command.kind === 'ready') {
    if (seat === party.launcher) return reject('wrong-job')
    if (ricochetWon(party.game)) return reject('unavailable')
    if (!presence.every(Boolean)) return reject('partner-away')
    next.ready = true
  } else if (command.kind === 'launch') {
    if (seat !== party.launcher) return reject('wrong-job')
    if (ricochetWon(party.game)) return reject('unavailable')
    if (!presence.every(Boolean)) return reject('partner-away')
    if (!party.ready) return reject('not-ready')
    const shot = simulateRicochet(party.game)
    next = { ...next, game: finishRicochetShot(party.game, shot), ready: false, layoutRevision: revision,
      busyUntil: now + shot.duration, playback: { id: revision, startedAt: now, before: party.game.rescued, shot } }
  } else if (command.kind === 'swap-jobs') {
    next = { ...next, launcher: party.launcher === 0 ? 1 : 0, ready: false, layoutRevision: revision, editedAt: [revision, revision] }
  } else if (command.kind === 'retry' || command.kind === 'next') {
    if (command.kind === 'next' && (!ricochetWon(party.game) || party.game.scene === 2)) return reject('unavailable')
    next = { ...next, game: createRicochetGame(party.game.scene + (command.kind === 'next' ? 1 : 0), party.game.learned),
      ready: false, layoutRevision: revision, editedAt: [revision, revision], busyUntil: 0, playback: null }
  } else return reject('invalid')
  return { accepted: true, party: next }
}

/** A lost partner invalidates the consent for that exact setup, even on reconnect. */
export function clearRicochetReadiness(party: RicochetParty): RicochetParty {
  return party.ready ? { ...party, ready: false, revision: party.revision + 1 } : party
}
