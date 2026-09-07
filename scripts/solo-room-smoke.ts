import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRescueGame, encodeRescueSave, isSoloCrossing, prepareSoloCrossing, type RescueState } from '../packages/game-core/src/rescue'

const server = process.env.ROOM_SERVER_URL || 'http://127.0.0.1:8787'
const evidence = process.env.GODOT_EVIDENCE || 'artifacts/solo-room'
const report: Record<string, unknown> = { runtimeSession: '01a0369d-0914-7190-ac0e-b4d37e1fc052', server }
const sockets: WebSocket[] = []
await mkdir(evidence, { recursive: true })
try {
  const saved = createRescueGame({ story: true, guided: true, seed: 73599 }); saved.captainMode = true; prepareSoloCrossing(saved)
  const created = await fetch(server + '/api/rescue/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Solo transfer', guestId: crypto.randomUUID(), seed: 73599, biome: 0, story: true, guided: true, save: encodeRescueSave(saved) }) })
  assert.equal(created.status, 201)
  const { roomCode } = await created.json() as { roomCode: string }; report.roomCode = roomCode
  async function join(name: string) {
    const ws = new WebSocket(server.replace(/^http/, 'ws') + `/api/rescue/rooms/${roomCode}/websocket`); sockets.push(ws)
    return new Promise<{ playerId: string; state: RescueState }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Welcome timeout')), 10000)
      ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'hello', version: 1, guestId: crypto.randomUUID(), name })))
      ws.addEventListener('message', event => {
        const message = JSON.parse(String(event.data))
        if (message.type === 'welcome') { clearTimeout(timeout); resolve(message) }
        if (message.type === 'error') { clearTimeout(timeout); reject(new Error(message.code)) }
      })
      ws.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Socket failed')) })
    })
  }
  const host = await join('Mara transfer')
  assert.equal(host.state.captainMode, undefined); assert.equal(isSoloCrossing(host.state), false)
  assert.equal(host.state.solo, true); assert.equal(host.state.story?.pending, 'watch')
  assert.equal(host.state.story?.motherId, host.playerId)
  const guest = await join('Finn transfer')
  assert.equal(guest.state.solo, false); assert.equal(guest.state.captainMode, undefined)
  assert.equal(guest.state.story?.sonId, guest.playerId)
  assert.equal(guest.state.crew.find(c => c.id === guest.playerId)?.pet, false)
  assert.equal(guest.state.crew.filter(c => !c.pet).length, 2)
  report.checks = { importedSoloAccepted: true, soloAbilityDisabledForOneOnlinePlayer: true, realFinnTakeover: true, familyStoryPreserved: true }
  report.passed = true
} catch (error) { report.passed = false; report.failure = String(error); throw error }
finally { for (const socket of sockets) socket.close(1000, 'Solo transfer verified'); await writeFile(`${evidence}/solo-room-smoke.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)) }
