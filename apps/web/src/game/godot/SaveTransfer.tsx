import { useState } from 'react'
import { decodeRescueSave, encodeRescueSave, RESCUE_SAVE_MAX_BYTES, type RescueState } from '@pongapp/game-core'
import { SAVE_KEY } from '../rescue/RescueSession'

/** Installation can create a separate storage context on iOS. Export stays
 * available before installation; imports never overwrite a voyage silently. */
export function SaveTransfer({ saved, onImport }: { saved: RescueState | null; onImport: (state: RescueState) => void }) {
  const [candidate, setCandidate] = useState<RescueState | null>(null)
  const [message, setMessage] = useState('')
  const exportVoyage = () => {
    if (!saved) return
    const url = URL.createObjectURL(new Blob([encodeRescueSave(saved)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'starling-voyage.json'; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const inspect = async (file?: File) => {
    setCandidate(null); setMessage('')
    if (!file) return
    if (file.size > RESCUE_SAVE_MAX_BYTES) { setMessage('This file is too large to be a Starling voyage. Your current save is unchanged.'); return }
    try {
      const next = decodeRescueSave(await file.text())
      if (!next) { setMessage('This is not a supported Starling voyage. Your current save is unchanged.'); return }
      setCandidate(next)
    } catch { setMessage('The file could not be read. Your current save is unchanged.') }
  }
  const accept = () => {
    if (!candidate) return
    try {
      localStorage.setItem(SAVE_KEY, encodeRescueSave(candidate)); onImport(candidate); setCandidate(null)
      setMessage('Voyage restored. After setup, choose Continue your voyage.')
    } catch { setMessage('There is not enough available browser storage. Your voyage file is still safe.') }
  }
  return <details className="crossing-save-transfer" open={Boolean(saved)}><summary>Keep or restore a voyage</summary>
    <p>Already played in this browser? Save a copy before installing. Open the Starling icon, then restore that file here. This also works when changing phones.</p>
    {saved && <button className="g-secondary" onClick={exportVoyage}>Download your voyage save</button>}
    <label>Choose a voyage file<input aria-label="Choose a voyage file" type="file" accept=".json,application/json" onChange={e => { void inspect(e.target.files?.[0]); e.target.value = '' }}/></label>
    {candidate && <div><p>{candidate.odyssey ? 'Part II' : 'Sea crossing'} · {candidate.story?.history.length ?? 0} story moments saved. {saved ? 'Download your current voyage above first if you want to keep both.' : 'Ready to restore on this device.'}</p><button className="g-primary" onClick={accept}>{saved ? 'Replace this device’s saved voyage' : 'Use this voyage save'}</button><button className="g-text-button" onClick={() => setCandidate(null)}>Cancel restore</button></div>}
    {message && <p role="status">{message}</p>}
  </details>
}
