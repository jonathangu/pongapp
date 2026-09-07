import { useCallback, useEffect, useRef, useState } from 'react'
import themeUrl from '../../assets/story/tides-of-the-old-world.m4a'
import choicesUrl from '../../assets/story/each-way-i-turn.m4a'
import { SONGS, songForCue, songCueVolume, type SongCue, type SongId } from './story-song-cues'

const sources = { tides: themeUrl, turn: choicesUrl }
export type StorySong = ReturnType<typeof useStorySong>
const clock = (time: number) => `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`
export function useStorySong() {
  const media = useRef<HTMLAudioElement | null>(null), desired = useRef(true), cue = useRef<SongCue>('home')
  const trackRef = useRef<SongId>('tides'), attempt = useRef(0)
  const [track, setTrack] = useState<SongId>('tides')
  const [playing, setPlaying] = useState(false), [position, setPosition] = useState(0), [duration, setDuration] = useState(0), [error, setError] = useState('')
  const [volume, setVolume] = useState(() => { try { const v = Number(localStorage.getItem('starling.song.volume') ?? '.6'); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : .6 } catch { return .6 } })
  const volumeRef = useRef(volume); volumeRef.current = volume
  const play = useCallback((restart = false) => {
    const audio = media.current
    if (!audio) return
    desired.current = true; setError('')
    if (restart) audio.currentTime = 0
    audio.volume = volumeRef.current * songCueVolume(cue.current)
    const currentAttempt = ++attempt.current
    void audio.play().catch(() => { if (attempt.current === currentAttempt) { setPlaying(false); setError('Tap Play theme song to listen.') } })
  }, [])
  const pause = useCallback(() => { desired.current = false; attempt.current++; media.current?.pause() }, [])
  const loadTrack = useCallback((id: SongId, restart = false) => {
    const audio = media.current
    if (!audio) return
    attempt.current++; setError('')
    if (trackRef.current !== id) {
      audio.pause(); trackRef.current = id; setTrack(id); setPosition(0); setDuration(0); setPlaying(false)
      // Change the single media element synchronously inside the user's gesture.
      // React's initial src remains stable; subsequent selections are owned here.
      audio.src = sources[id]; audio.load()
    } else if (restart) { audio.currentTime = 0; setPosition(0) }
  }, [])
  const select = useCallback((id: SongId) => { loadTrack(id, true); play() }, [loadTrack, play])
  const begin = useCallback(() => { cue.current = 'opening'; loadTrack('tides', true); if (desired.current) play() }, [loadTrack, play])
  const setCue = useCallback((next: SongCue) => {
    if (next === cue.current) return
    cue.current = next
    if (next === 'sailing') { attempt.current++; media.current?.pause() }
    else {
      const nextTrack = songForCue(next)
      if (nextTrack) { loadTrack(nextTrack, true); if (desired.current) play() }
    }
    if (media.current) media.current.volume = volumeRef.current * songCueVolume(next)
  }, [loadTrack, play])
  useEffect(() => {
    if (media.current) media.current.volume = volume * songCueVolume(cue.current)
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
  const stats = () => ({ track: trackRef.current, title: SONGS[trackRef.current].title, cue: cue.current, playing: Boolean(media.current && !media.current.paused), time: media.current?.currentTime ?? 0, duration: media.current?.duration || 0, volume: media.current?.volume ?? 0, readyState: media.current?.readyState ?? 0, source: media.current?.currentSrc ?? '', error: media.current?.error?.message ?? error })
  const audio = <audio ref={media} src={themeUrl} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => setPosition(media.current?.currentTime ?? 0)} onLoadedMetadata={() => setDuration(media.current?.duration ?? 0)} onError={() => setError('The theme could not load. The voyage is still playable.')}/>
  return { audio, track, select, playing, position, duration, volume, setVolume, play, pause, begin, setCue, stats, error }
}
export function SongControls({ song, compact = false }: { song: StorySong; compact?: boolean }) {
  return <section className={'story-song' + (compact ? ' compact' : '')} aria-label="Original theme song">
    <button className="story-song-toggle" aria-label={song.playing ? 'Pause theme song' : 'Play theme song'} onClick={() => song.playing ? song.pause() : song.play()}><span aria-hidden="true">{song.playing ? 'Ⅱ' : '▶'}</span></button>
    <div className="story-song-credit"><select aria-label="Choose theme song" title={SONGS[song.track].theme} value={song.track} onChange={event => { const id = event.target.value; if (id === 'tides' || id === 'turn') song.select(id) }}>{Object.entries(SONGS).map(([id, entry]) => <option key={id} value={id}>{entry.title}</option>)}</select><small>Song by Jonathan Gu · {clock(song.position)} / {clock(song.duration || SONGS[song.track].duration)}</small></div>
    <label className="story-song-volume"><span>Song volume</span><input aria-label="Theme song volume" type="range" min="0" max="1" step=".05" value={song.volume} onChange={event => song.setVolume(Number(event.target.value))}/></label>
    {song.error && <p role="status">{song.error}</p>}
  </section>
}
