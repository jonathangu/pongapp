import { createRoot } from 'react-dom/client'
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import App from './PuzzleApp'

// Experimental code (including collision queries) never enters the original game's initial bundle.
const Ricochet = lazy(() => import('./ricochet/RicochetApp'))
class PrototypeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override render() { return this.state.failed ? <main className="rr-loading"><div><p>The prototype could not load.</p><button onClick={() => location.reload()}>Reload</button><p><a href={import.meta.env.BASE_URL}>Back to original Starling</a></p></div></main> : this.props.children }
}
function Router() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => { const changed = () => setHash(location.hash); addEventListener('hashchange', changed); return () => removeEventListener('hashchange', changed) }, [])
  return /^#\/ricochet(?:\/|$)/.test(hash) ? <PrototypeBoundary key={hash}><Suspense fallback={<main className="rr-loading">Opening your little rescue cove…</main>}><Ricochet/></Suspense></PrototypeBoundary> : <App/>
}

const root = document.getElementById('root')
if (!root) throw new Error('PongApp root element is missing.')

createRoot(root).render(<Router />)
