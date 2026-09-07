// Paste into the disposable test tab through the browser's developer console/CDP.
// Uses the shipped steering bridge and visible buttons. Never mutates game state,
// grants resources, teleports, skips a lesson, or speeds up the simulation.
(() => {
  if (window.__SOLO_QA__?.running) throw new Error('Solo QA is already running')
  const started = performance.now(), lessons = new Set(), story = new Set(), chapters = new Set()
  const report = window.__SOLO_QA__ = { running: true, passed: false, pulses: 0, minimumHp: 12, trace: [], error: null }
  let previous = -1, returning = false, lastRescue = -1
  const choices = { watch: 'wind', whale: 'channel', 'first-light': 'signal', coat: 'patch', sometimes: 'spoon', 'small-hands': 'read', keeper: 'together', home: 'pass' }
  const finish = (error = null) => {
    clearInterval(timer); window.__STARLING_BRIDGE__.steer(0, 0)
    const s = window.__STARLING__.snapshot()
    Object.assign(report, { running: false, passed: !error, error, seconds: (performance.now() - started) / 1000, lessons: [...lessons], story: s.story.history, chapters: s.odyssey?.history, phase: s.phase, captainMode: s.captainMode, finalHp: s.ship.hp, stats: window.__STARLING__.stats() })
    if (error) document.querySelector('[aria-label="Pause and settings"]')?.click()
  }
  const timer = setInterval(() => {
    try {
      const s = window.__STARLING__.snapshot()
      if (performance.now() - started > 240000) { finish('240 second journey timeout'); return }
      if (s.phase === 'lost') { finish('Ship lost'); return }
      if (!s.captainMode) { finish('Solo captain mode missing'); return }
      lessons.add(s.seamanship.step); report.minimumHp = Math.min(report.minimumHp, s.ship.hp)
      if (s.story.pending) {
        const id = s.story.pending
        if (!story.has(id)) { story.add(id); report.trace.push({ scene: id, time: s.time }) }
        document.querySelector(s.story.result ? `[data-story-continue="${id}"]` : `[data-story-choice="${choices[id]}"]`)?.click()
        return
      }
      if (s.odyssey?.pending) {
        const id = s.odyssey.pending
        if (!chapters.has(id)) { chapters.add(id); report.trace.push({ chapter: id, time: s.time }) }
        document.querySelector('[data-odyssey-continue]')?.click()
        return
      }
      if (s.phase === 'won') {
        if (s.odyssey?.history.includes('unwritten')) { finish(); return }
        const next = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Part II · Lift'))
        next?.click(); return
      }
      if (s.crew.find(c => !c.pet)?.seat !== 'engine') { finish('Captain left the helm'); return }
      if (s.stats.rescues !== lastRescue) { lastRescue = s.stats.rescues; report.trace.push({ rescued: lastRescue, hp: s.ship.hp, time: s.time }) }
      const cage = s.world.cages.find(c => !c.rescued)
      let target = s.world.portal
      if (cage) {
        if (previous !== -1 && previous !== cage.id) returning = true
        previous = cage.id
        if (Math.hypot(s.ship.x, s.ship.y + 24) < 3) returning = false
        target = returning ? { x: 0, y: -24 } : cage
      }
      const dx = target.x - s.ship.x, dy = target.y - s.ship.y, distance = Math.max(.001, Math.hypot(dx, dy)), speed = Math.min(.7, distance * .1)
      window.__STARLING_BRIDGE__.steer(dx / distance * speed, dy / distance * speed)
      const pulse = document.querySelector('[aria-label="Together pulse"]')
      if (pulse && !pulse.disabled && (s.seamanship.step === 2 || [...s.enemies, ...s.world.cages.filter(c => !c.open)].some(t => Math.hypot(t.x - s.ship.x, t.y - s.ship.y) < 18))) { pulse.click(); report.pulses++ }
    } catch (error) { finish(String(error)) }
  }, 100)
  return 'Solo browser journey started; inspect window.__SOLO_QA__ for evidence.'
})()
