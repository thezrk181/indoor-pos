// Requires a dedicated authorized test account in ignored .env.local.
// Creates clearly marked fixtures, cancels/refunds them, and deactivates its ground.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
if(!env.SUPABASE_TEST_EMAIL||!env.SUPABASE_TEST_PASSWORD)throw Error('Add SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD to .env.local. No live changes made.');
const clients=Array.from({length:2},()=>createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}));
const checked=({data,error})=>{if(error)throw error;return data;};
const mutate=async(c,op,payload)=>checked(await c.rpc('pos_mutate',{op,payload}));
const snapshot=async()=>checked(await clients[0].rpc('pos_snapshot'));
let ground;
const groundConfig={name:'TEST concurrency '+randomUUID().slice(0,8),description:'Acceptance fixture; no real bookings or money.',active:true,hourly_rate:150000,hours:Array.from({length:7},(_,weekday)=>({weekday,opens:0,closes:1440}))};
try{
 for(const c of clients){checked(await c.auth.signInWithPassword({email:env.SUPABASE_TEST_EMAIL,password:env.SUPABASE_TEST_PASSWORD}));assert.equal(checked(await c.rpc('is_admin')),true);}
 ground=await mutate(clients[0],'ground',{...groundConfig,id:null});
 const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 const base={ground_id:ground.id,starts_at:date+'T12:00:00Z',ends_at:date+'T13:00:00Z',customer_id:null,customer_name:'TEST concurrent acceptance',phone:'',advance:0,method:'other',total_price:null,price_reason:'',hours_override_reason:'TEST authorized off-hours',notes:'TEST ONLY - no money exchanged'};
 const attempts=await Promise.all(clients.map(c=>c.rpc('pos_mutate',{op:'booking',payload:{...base,request_id:randomUUID()}})));
 assert.equal(attempts.filter(r=>!r.error).length,1,'Exactly one concurrent booking must commit');
 assert.equal(attempts.find(r=>r.error).error.code,'23P01','Loser must fail on overlap constraint');
 const id=attempts.find(r=>!r.error).data.id;
 let booking=(await snapshot()).reservations.find(b=>b.id===id);
 const payments=clients.map(()=>({id,version:booking.version,request_id:randomUUID(),kind:'payment',amount:100000,method:'other',note:'TEST ONLY concurrent payment'}));
 const results=await Promise.all(clients.map((c,i)=>c.rpc('pos_mutate',{op:'payment',payload:payments[i]})));
 assert.equal(results.filter(r=>!r.error).length,1,'Only one payment may commit');
 assert.match(results.find(r=>r.error).error.message,/changed on another device|exceeds/i);
 await mutate(clients[0],'payment',payments[results.findIndex(r=>!r.error)]);
 const state=await snapshot();assert.equal(state.payments.filter(p=>p.booking_id===id).length,1,'Retry must not duplicate payment');
 console.log('PASS live independent-client booking conflict, payment contention, and payment retry idempotency.');
}finally{
 if(ground){
  const state=await snapshot();
  for(const b of state.reservations.filter(b=>b.ground_id===ground.id&&b.kind==='booking')){
   if(b.status!=='cancelled')await mutate(clients[0],'status',{id:b.id,version:b.version,status:'cancelled',handling:'refund'});
   const latest=(await snapshot()).reservations.find(r=>r.id===b.id);
   if(latest.refund_due>0)await mutate(clients[0],'payment',{id:b.id,version:latest.version,request_id:randomUUID(),kind:'refund',amount:latest.refund_due,method:'other',note:'TEST ONLY reversing acceptance ledger'});
  }
  await mutate(clients[0],'ground',{...groundConfig,id:ground.id,active:false});
  console.log('Test bookings cancelled/refunded; test ground inactive. Audit fixtures retained.');
 }
 await Promise.all(clients.map(c=>c.auth.signOut()));
}
