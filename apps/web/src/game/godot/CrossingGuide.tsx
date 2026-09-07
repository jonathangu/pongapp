import { learningToSail, rescueTarget, storyCrewName, type RescueState } from '@pongapp/game-core'

export function crossingObjective(state: RescueState, captain: boolean) {
  if (state.odyssey) {
    const chapter = state.odyssey
    if (chapter.history.includes('unwritten')) return { title: 'Beneath unwritten stars', body: 'Explore the living sea together. Visit a harbor, cook a meal, and keep learning this world. Your two-part story is safe in the logbook.', job: 'Helm' }
    if (chapter.stage === 'sky') return { title: 'Rise through the cloudbreak', body: 'Mara has the helm; Finn can cover the ship with Cannons or Shield. Follow the gold arrow up to the blue light. Luma helps when she chooses.', job: captain ? 'Helm' : 'Shield' }
    if (chapter.stage === 'gate') return { title: 'Reach the forbidden gate', body: 'Your sun’s last heartbeat is safely recorded. Steer toward the ring of black moons. Hold in the blue light while Finn covers the ship.', job: captain ? 'Helm' : 'Cannons' }
    return { title: chapter.history.includes('dragon') ? 'Follow the golden wings' : 'Approach the six-winged stranger', body: chapter.history.includes('dragon') ? 'Luma made it a game. Follow the gold light to the quiet shore; hold there to finish this chapter.' : 'This world is alive. Steer toward the golden creature. Approach gently and let your youngest say hello.', job: 'Helm' }
  }
  const step = state.seamanship?.step ?? 5, target = rescueTarget(state)
  const distance = target ? Math.round(Math.hypot(target.x - state.ship.x, target.y - state.ship.y)) : 0
  const open = target?.open
  if (step === 0) return { title: '1 · Get a feel for the helm', body: captain ? 'Drag the round joystick a little. Release it to brake. Finn is safe; there is no damage during practice.' : 'Your captain is learning to steer. Tap Cannons to lend a hand; your character walks there automatically.', job: captain ? 'Helm' : 'Cannons' }
  if (step === 1) return { title: '2 · Answer the nearest light', body: captain ? 'Follow the gold arrow toward the rescue signal. Those people are trapped in a lantern cage. Steer around islands.' : 'Help your captain reach the gold signal. Tap Cannons: you’ll free the trapped crew when they come into range.', job: captain ? 'Helm' : 'Cannons' }
  if (step === 2) return { title: '3 · Take a cannon station', body: 'Tap Cannons below. You walk to a gun; it aims and fires for you. We’re breaking the cage—not shooting the people.', job: 'Cannons' }
  if (step === 3) return { title: '4 · Bring the first crew aboard', body: open ? 'The cage is open! Take Helm and move close to the green light to pick them up.' : 'Stay near the signal while the cannons open its cage. Then take Helm and sail close to pick up the crew.', job: open ? 'Helm' : 'Cannons' }
  if (step === 4) return { title: '5 · Make something warm', body: 'Tap Cook. Wait at the galley for a three-second meal. Food makes everyone work faster. You’ve brought someone in from the cold.', job: 'Cook' }
  if (state.stats.rescues < 5) return { title: `${state.stats.rescues} / 5 crews safe · follow the next light`, body: state.stats.rescues === 1 ? 'First crew home! Keep rescuing. Shield blocks fire; Cook boosts the crew. Gentle seas stay forgiving—change difficulty in the menu.' : open ? 'Cage open. Sail close to bring this crew aboard. Every rescue repairs one heart.' : 'Steer near a gold light, let your cannons open the cage, then sail close. Visit a harbor to repair and upgrade.', job: open || distance > 22 ? 'Helm' : 'Cannons' }
  if (!state.guardianDefeated) return { title: 'Protect all five crews', body: 'The Breakwater Keeper guards the passage. Keep moving, use Cannons and Shield, and watch its warning before it attacks.', job: 'Cannons' }
  return { title: 'Bring everyone home', body: 'Follow the green home beacon. Sail into its light and hold there to finish the crossing.', job: 'Helm' }
}

export function CrossingGuide({ state, captain, playerId, onMap }: { state: RescueState; captain: boolean; playerId: string; onMap: () => void }) {
  if (state.story?.pending || state.odyssey?.pending || state.phase !== 'playing') return null
  const objective = crossingObjective(state, captain), target = state.odyssey ? state.world.portal : rescueTarget(state) ?? (state.guardianDefeated ? state.world.portal : state.enemies.find(e => e.kind === 'guardian'))
  const direction = target ? Math.atan2(target.x - state.ship.x, target.y - state.ship.y) * 180 / Math.PI : 0
  const distance = target ? Math.round(Math.hypot(target.x - state.ship.x, target.y - state.ship.y)) : 0
  const partners = state.crew.filter(p => !p.pet && p.id !== playerId)
  return <aside className={'crossing-guide' + (learningToSail(state) ? ' learning' : '')} aria-label="Your next task">
    <div className="crossing-guide-heading"><strong>{objective.title}</strong>{target && <button onClick={onMap} aria-label="Show route on map"><i aria-hidden="true" style={{ transform: `rotate(${direction}deg)` }}>↑</i><span>{distance}m</span></button>}</div>
    <p>{objective.body}</p>
    {learningToSail(state) && <div className="crossing-lesson-progress" aria-label={`Tutorial step ${(state.seamanship?.step ?? 0) + 1} of 5`}>{[0, 1, 2, 3, 4].map(i => <i key={i} className={i <= (state.seamanship?.step ?? 0) ? 'complete' : ''}/>)}</div>}
    {partners.length > 0 && <small>{partners.map(p => `${storyCrewName(state, p)}: ${p.seat === 'engine' ? 'steering' : p.seat === 'galley' ? 'cooking' : p.seat === 'shield' ? 'shielding' : p.seat === 'map' ? 'lookout' : p.seat ? 'cannons' : 'changing jobs'}`).join(' · ')}</small>}
  </aside>
}
