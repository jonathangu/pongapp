import { useCallback, useEffect, useRef, useState } from 'react'
import themeUrl from '../../assets/story/tides-of-the-old-world.m4a'

export type SongCue = 'home' | 'opening' | 'sailing' | 'ending'
export type StorySong = ReturnType<typeof useStorySong>
const clock = (time: number) => `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`
export function useStorySong() {
  const media = useRef<HTMLAudioElement | null>(null), desired = useRef(true), cue = useRef<SongCue>('home')
  const [playing, setPlaying] = useState(false), [position, setPosition] = useState(0), [duration, setDuration] = useState(0), [error, setError] = useState('')
  const [volume, setVolume] = useState(() => { try { const v = Number(localStorage.getItem('starling.song.volume') ?? '.6'); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : .6 } catch { return .6 } })
  const volumeRef = useRef(volume); volumeRef.current = volume
  const play = useCallback((restart = false) => {
    const audio = media.current
    if (!audio) return
    desired.current = true; setError('')
    if (restart) audio.currentTime = 0
    audio.volume = volumeRef.current * (cue.current === 'opening' || cue.current === 'ending' ? .55 : 1)
    void audio.play().catch(() => { setPlaying(false); setError('Tap Play theme song to listen.') })
  }, [])
  const pause = useCallback(() => { desired.current = false; media.current?.pause() }, [])
  const begin = useCallback(() => { cue.current = 'opening'; if (desired.current) play(true) }, [play])
  const setCue = useCallback((next: SongCue) => {
    if (next === cue.current) return
    cue.current = next
    if (next === 'sailing') media.current?.pause()
    else if (next === 'ending' && desired.current) play(true)
    if (media.current) media.current.volume = volumeRef.current * (next === 'opening' || next === 'ending' ? .55 : 1)
  }, [play])
  useEffect(() => {
    if (media.current) media.current.volume = volume * (cue.current === 'opening' || cue.current === 'ending' ? .55 : 1)
    try { localStorage.setItem('starling.song.volume', String(volume)) } catch { /* storage is optional */ }
  }, [volume])
  useEffect(() => {
    let resume = false
    const visibility = () => {
      if (document.hidden) { resume = Boolean(media.current && !media.current.paused); media.current?.pause() }
      else if (resume && desired.current && cue.current !== 'sailing') { resume = false; play() }
    }
    document.addEventListener('visibilitychange', visibility)
    return () => { document.removeEventListener('visibilitychange', visibility); media.current?.pause() }
  }, [play])
  const stats = () => ({ playing: Boolean(media.current && !media.current.paused), time: media.current?.currentTime ?? 0, duration: media.current?.duration || 0, volume: media.current?.volume ?? 0, readyState: media.current?.readyState ?? 0, source: media.current?.currentSrc ?? '', error: media.current?.error?.message ?? error })
  const audio = <audio ref={media} src={themeUrl} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => setPosition(media.current?.currentTime ?? 0)} onLoadedMetadata={() => setDuration(media.current?.duration ?? 0)} onError={() => setError('The theme could not load. The voyage is still playable.')}/>
  return { audio, playing, position, duration, volume, setVolume, play, pause, begin, setCue, stats, error }
}
export function SongControls({ song, compact = false }: { song: StorySong; compact?: boolean }) {
  return <section className={'story-song' + (compact ? ' compact' : '')} aria-label="Original theme song">
    <button className="story-song-toggle" aria-label={song.playing ? 'Pause theme song' : 'Play theme song'} onClick={() => song.playing ? song.pause() : song.play()}><span aria-hidden="true">{song.playing ? 'Ⅱ' : '▶'}</span></button>
    <div className="story-song-credit"><strong>Tides of the Old World</strong><small>Song by Jonathan Gu · {clock(song.position)} / {song.duration ? clock(song.duration) : '6:17'}</small></div>
    <label className="story-song-volume"><span>Song volume</span><input aria-label="Theme song volume" type="range" min="0" max="1" step=".05" value={song.volume} onChange={event => song.setVolume(Number(event.target.value))}/></label>
    {song.error && <p role="status">{song.error}</p>}
  </section>
}
