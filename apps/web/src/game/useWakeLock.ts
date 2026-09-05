import { useEffect } from 'react'
export function useWakeLock(): void {
  useEffect(()=>{
    let lock: WakeLockSentinel | null=null;let disposed=false
    const acquire=async()=>{if(document.visibilityState!=='visible'||!navigator.wakeLock)return;try{const next=await navigator.wakeLock.request('screen');if(disposed)await next.release();else lock=next}catch{/* play still works when denied */}}
    void acquire();document.addEventListener('visibilitychange',acquire)
    return()=>{disposed=true;document.removeEventListener('visibilitychange',acquire);void lock?.release()}
  },[])
}
