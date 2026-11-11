import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const origin='http://127.0.0.1:3000';
async function state(){const r=await fetch(origin+'/api/pos');assert.equal(r.status,200);return r.json();}
async function post(op,payload,expected=200){const r=await fetch(origin+'/api/pos',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({op,payload})});const b=await r.json();assert.equal(r.status,expected,JSON.stringify(b));return b;}
const initial=await state();assert.equal(initial.settings.name,'The Pavilion Club','Only run this smoke test against the fictional local demo');
const ground=initial.grounds.find(g=>g.active);assert.ok(ground);
// Find a future date with no occupancy, using explicit +05:00 local test times.
let day;for(let offset=5;offset<100;offset++){const d=new Date();d.setUTCDate(d.getUTCDate()+offset);const candidate=d.toISOString().slice(0,10);if(!initial.reservations.some(b=>b.starts_at.slice(0,10)===candidate)){day=candidate;break;}}assert.ok(day);
const slot={ground_id:ground.id,starts_at:day+'T15:00:00+05:00',ends_at:day+'T16:30:00+05:00',hours_override_reason:''};
const quote=await post('quote',slot);assert.equal(quote.total,ground.hourly_rate*3/2);
const request_id=randomUUID();const payload={...slot,request_id,customer_id:null,customer_name:'HTTP acceptance fixture',phone:'',advance:50000,method:'cash',total_price:null,price_reason:'',notes:'Fictional automated acceptance record'};
const created=await post('booking',payload);assert.ok(created.id);assert.equal((await post('booking',payload)).id,created.id);
await post('booking',{...payload,request_id:randomUUID()},400);
let current=await state();let b=current.reservations.find(b=>b.id===created.id);assert.equal(b.total_price,quote.total);assert.equal(current.payments.filter(p=>p.booking_id===b.id).length,1);
const receipt=await fetch(origin+'/receipt/'+created.id);assert.equal(receipt.status,200);assert.match(await receipt.text(),/HTTP acceptance fixture/);
await post('status',{id:b.id,version:b.version,status:'cancelled',handling:'refund'});
current=await state();b=current.reservations.find(b=>b.id===created.id);assert.equal(b.refund_due,50000);
await post('payment',{id:b.id,version:b.version,request_id:randomUUID(),kind:'refund',amount:50000,method:'cash',note:'Test refund returned'});
current=await state();b=current.reservations.find(b=>b.id===created.id);assert.equal(b.refund_due,0);assert.equal(current.payments.filter(p=>p.booking_id===b.id).length,2);
const denied=await fetch(origin+'/api/pos',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify({op:'quote',payload:slot})});assert.equal(denied.status,400);
const manifest=await fetch(origin+'/manifest.webmanifest');assert.equal(manifest.status,200);assert.equal((await manifest.json()).display,'standalone');
for(const path of ['/offline.html','/sw.js','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png'])assert.equal((await fetch(origin+path)).status,200,path);
console.log('PASS: demo HTTP booking, quote, idempotency, conflict, receipt, cancellation, refund, origin protection, manifest and PWA assets.');
