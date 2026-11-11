import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
if(!env.SUPABASE_TEST_EMAIL||!env.SUPABASE_TEST_PASSWORD)throw Error('Test credentials are required');
const clients=Array.from({length:2},()=>createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}));
const checked=({data,error})=>{if(error)throw error;return data;};
const name='TEST realtime '+randomUUID().slice(0,8);
const config={id:null,name,description:'TEST live sync verification',active:false,hourly_rate:150000,hours:[]};
let ground,channel;
async function watch(){
 let resolveEvent;
 const event=new Promise(resolve=>{resolveEvent=resolve;});
 channel=clients[1].channel(randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'grounds'},payload=>{if(payload.new?.name===name)resolveEvent(payload);});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Subscription timed out')),15000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){clearTimeout(timer);reject(Error(status));}});});
 return {event};
}
async function receive(event){let timer;try{return await Promise.race([event,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Realtime event timed out')),15000);})]);}finally{clearTimeout(timer);}}
async function save(description){return checked(await clients[0].rpc('pos_mutate',{op:'ground',payload:{...config,id:ground?.id??null,description}}));}
try{
 for(const c of clients)checked(await c.auth.signInWithPassword({email:env.SUPABASE_TEST_EMAIL,password:env.SUPABASE_TEST_PASSWORD}));
 let listener=await watch();ground=await save('TEST first event');assert.equal((await receive(listener.event)).new.id,ground.id);
 await clients[1].removeChannel(channel);channel=null;
 await save('TEST changed while disconnected');
 const state=checked(await clients[1].rpc('pos_snapshot'));assert.equal(state.grounds.find(g=>g.id===ground.id).description,'TEST changed while disconnected');
 listener=await watch();await save('TEST reconnected event');assert.equal((await receive(listener.event)).new.description,'TEST reconnected event');
 console.log('PASS live independent-client Realtime delivery, reconnect/resubscribe, and snapshot recovery after a missed event. Physical-device behavior remains separate.');
}finally{
 if(ground)await save('TEST completed; inactive audit fixture');
 if(channel)await clients[1].removeChannel(channel);
 await Promise.all(clients.map(c=>c.auth.signOut()));
 clients.forEach(c=>c.realtime.disconnect());
}
