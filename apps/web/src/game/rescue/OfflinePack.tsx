import { useEffect, useRef, useState } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
type PackStatus = { ready?: boolean; reason?: string; version?: string; bytes?: number; files?: number }
export function OfflinePack() {
  const [status, setStatus] = useState<PackStatus>({}), [manifest, setManifest] = useState<{ bytes: number; version: string } | null>(null)
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [message, setMessage] = useState('Checking offline storage…'), [help, setHelp] = useState(false)
  const [installable, setInstallable] = useState(false), [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches)
  const worker = useRef<ServiceWorker | null>(null), prompt = useRef<InstallPrompt | null>(null), port = useRef<MessagePort | null>(null)
  useEffect(() => {
    let alive = true
    const showInstall = (event: Event) => { event.preventDefault(); prompt.current = event as InstallPrompt; setInstallable(true) }
    const didInstall = () => { setInstalled(true); setInstallable(false) }
    window.addEventListener('beforeinstallprompt', showInstall); window.addEventListener('appinstalled', didInstall)
    if (!('serviceWorker' in navigator) || !window.isSecureContext) setMessage('Offline installation needs a secure, supported browser.')
    else if (import.meta.env.DEV) setMessage('Offline packs are available in the published build.')
    else void (async () => {
      try {
        await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
        const registration = await navigator.serviceWorker.ready
        if (!alive) return
        worker.current = registration.active
        const channel = new MessageChannel(); port.current = channel.port1
        channel.port1.onmessage = event => { if (!alive) return; setStatus(event.data); setMessage(event.data.ready ? 'Complete pack verified on this device.' : event.data.reason === 'evicted' ? 'Some offline files were removed by your browser. Download again before going offline.' : 'Download once. Play solo without internet.') }
        worker.current?.postMessage({ type: 'starling-status' }, [channel.port2])
        if (navigator.onLine) {
          const response = await fetch(import.meta.env.BASE_URL + 'starling-pack.json', { cache: 'no-store' })
          if (response.ok && alive) setManifest(await response.json())
        }
      } catch { if (alive) setMessage('Cannot check the pack right now. Connect once and try again.') }
    })()
    return () => { alive = false; port.current?.close(); window.removeEventListener('beforeinstallprompt', showInstall); window.removeEventListener('appinstalled', didInstall) }
  }, [])
  const download = async () => {
    if (!worker.current) { setMessage('Open the published game in Safari, Chrome, Edge or Firefox to download.'); return }
    setBusy(true); setProgress(0); setMessage('Verifying and downloading your game…')
    void navigator.storage?.persist?.().catch(() => {})
    port.current?.close(); const channel = new MessageChannel(); port.current = channel.port1
    channel.port1.onmessage = event => {
      const v = event.data
      if (v.type === 'progress') { setProgress(v.bytes / v.totalBytes); setMessage(`${v.done}/${v.total} files verified · ${(v.bytes / 1048576).toFixed(1)} MB`) }
      else if (v.type === 'complete') { setStatus(v); setBusy(false); setProgress(1); setMessage('Ready for offline solo play. You can install the game now.') }
      else if (v.type === 'error') { setBusy(false); setMessage(v.message) }
    }
    worker.current.postMessage({ type: 'starling-download' }, [channel.port2])
  }
  const install = async () => {
    if (prompt.current) { await prompt.current.prompt(); const choice = await prompt.current.userChoice; if (choice.outcome === 'accepted') setInstalled(true); prompt.current = null; setInstallable(false) }
    else setHelp(true)
  }
  const update = status.ready && manifest && status.version !== manifest.version
  return <section className="sr-offline-section"><div><p className="sr-kicker">TAKE THE WHOLE LITTLE WORLD WITH YOU</p><h2>Make room on your home screen.</h2><p>Download the complete Godot solo game pack, then install Starling as a home-screen app. No app-store account needed.</p><p className="sr-small">Co-op needs internet. Saves stay on your device; export one before switching phones. Browser storage can be evicted, so check your pack before traveling.</p></div><div className="sr-pack-actions"><button className="sr-primary" disabled={busy || Boolean(status.ready && !update)} onClick={() => void download()}>{busy ? `Downloading · ${Math.round(progress * 100)}%` : update ? 'Download updated pack' : status.ready ? '✓ Offline pack ready' : `Download offline pack${manifest ? ` · ${(manifest.bytes / 1048576).toFixed(1)} MB` : ''}`}</button>{busy && <><progress value={progress} max="1" aria-label="Offline pack download progress"/><button onClick={() => worker.current?.postMessage({ type: 'starling-cancel' })}>Cancel download</button></>}<button onClick={() => void install()} disabled={installed}>{installed ? '✓ Installed' : installable ? 'Install Starling' : 'Install on your phone'}</button><p role="status">{message}</p>{help && <div className="sr-install-help"><b>iPhone / iPad</b><p>Open in Safari, tap Share, then Add to Home Screen. If offered, enable Open as Web App.</p><b>Android</b><p>Open in Chrome, tap its menu, then Install app or Add to home screen.</p><b>Desktop</b><p>Use your browser’s install icon or app menu. Firefox can still download the offline pack without a standalone install.</p><p>Download the pack first. This is a web app, not an APK or IPA.</p><button onClick={() => setHelp(false)}>Got it</button></div>}</div></section>
}
