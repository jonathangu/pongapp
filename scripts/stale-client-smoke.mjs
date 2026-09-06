import assert from 'node:assert/strict'
const server=process.env.ROOM_SERVER_URL??'http://127.0.0.1:8787'
const response=await fetch(server+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hostName:'Compatibility QA',mode:'coop'})})
assert.equal(response.status,201)
const {roomCode}=await response.json(),url=new URL('/api/rooms/'+roomCode+'/websocket',server)
url.protocol=url.protocol==='https:'?'wss:':'ws:'
const socket=new WebSocket(url)
try{
  const result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Old client rejection timed out')),10000)
    socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'hello',version:8,guestId:'stale-qa',displayName:'Old client',role:'player'})))
    socket.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.type==='error'){clearTimeout(timer);resolve(m)}})
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Connection failed'))})
  })
  assert.equal(result.code,'refresh_required');assert.equal(result.recoverable,false)
  console.log(JSON.stringify({server,oldProtocol:8,result,verifiedAt:new Date().toISOString()},null,2))
}finally{socket.close()}
