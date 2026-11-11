import 'server-only';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {addDays,dateKey,localISO} from './domain';
import {configured} from './supabase/server';
import type {State} from './types';
export function demoEnabled(){return !configured()&&process.env.NODE_ENV==='development';}
const ADMIN='00000000-0000-4000-8000-000000000001';
const globalDemo=globalThis as typeof globalThis&{creaseDemo?:Promise<PGlite>};
async function init(){
 const db=new PGlite(join(process.cwd(),'.local-db'),{extensions:{btree_gist}});
 const check=await db.query<{exists:boolean}>("select to_regclass('public.reservations') is not null as exists");
 if(!check.rows[0].exists){
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec(await readFile(join(process.cwd(),'supabase/migrations/202611080001_core.sql'),'utf8'));
  await db.query('insert into auth.users values($1)',[ADMIN]);await db.query('insert into admin_users values($1)',[ADMIN]);
  await db.exec("update club_settings set name='The Pavilion Club',description='Indoor cricket. Uninterrupted.',address='Demo workspace · fictional club',receipt_note='DEMO RECEIPT — no real booking or payment.' where id");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);await db.exec('set role authenticated');
  const mutate=async(op:string,payload:unknown)=>{const r=await db.query<{r:{id:string}}>('select pos_mutate($1,$2::jsonb) r',[op,JSON.stringify(payload)]);return r.rows[0].r.id;};
  const grounds:string[]=[];
  for(const [name,description,rate] of [['The Oval','Our signature indoor cricket ground',400000],['The Pavilion','A premium space for your next innings',350000],['Practice Lane','Focused sessions. More time at the crease.',200000]] as const){grounds.push(await mutate('ground',{name,description,hourly_rate:rate,active:true,hours:Array.from({length:7},(_,weekday)=>({weekday,opens:600,closes:1560}))}));}
  for(const g of grounds)for(const weekday of [5,6])await mutate('rule',{ground_id:g,name:'Weekend evenings',weekday,starts:1080,ends:1440,hourly_rate:g===grounds[0]?500000:g===grounds[1]?450000:250000});
  const today=dateKey(new Date(),'Asia/Karachi');
  const fixtures=[{name:'Ali Hassan',g:0,day:0,start:960,duration:120,paid:200000},{name:'Usman Shah',g:0,day:0,start:1140,duration:90,paid:0},{name:'Hamza Ahmed',g:0,day:0,start:1350,duration:120,paid:300000},{name:'Bilal Khan',g:1,day:0,start:900,duration:90,paid:100000},{name:'Saad Malik',g:1,day:0,start:1080,duration:120,paid:400000},{name:'Daniyal Raza',g:2,day:0,start:1020,duration:60,paid:100000},{name:'Ali Hassan',g:0,day:1,start:1080,duration:120,paid:200000},{name:'Hamza Ahmed',g:1,day:-1,start:1200,duration:60,paid:100000},{name:'Bilal Khan',g:0,day:-2,start:1080,duration:90,paid:200000}];
  const customers=new Map<string,string>();
  for(const f of fixtures){const day=addDays(today,f.day);const id=await mutate('booking',{ground_id:grounds[f.g],customer_name:f.name,customer_id:customers.get(f.name)??null,phone:'',starts_at:localISO(day,f.start,'Asia/Karachi'),ends_at:localISO(day,f.start+f.duration,'Asia/Karachi'),advance:f.paid,method:f.g===1?'bank':'cash',notes:'Fictional Phase 1 test booking',request_id:randomUUID(),price_reason:'',hours_override_reason:'',total_price:null});const c=await db.query<{customer_id:string}>('select customer_id from reservations where id=$1',[id]);customers.set(f.name,c.rows[0].customer_id);if(f.day<0)await mutate('status',{id,version:1,status:'completed',handling:null});}
  await mutate('block',{ground_id:grounds[1],starts_at:localISO(today,780,'Asia/Karachi'),ends_at:localISO(today,840,'Asia/Karachi'),notes:'Net maintenance',request_id:randomUUID()});
 }else{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ADMIN]);await db.exec('set role authenticated');}
 return db;
}
async function database(){if(!demoEnabled())throw new Error('Local demo is available only in development without Supabase configuration');return globalDemo.creaseDemo??=init().catch(error=>{globalDemo.creaseDemo=undefined;throw error;});}
export async function demoSnapshot(){const db=await database();return (await db.query<{state:State}>('select pos_snapshot() state')).rows[0].state;}
export async function demoMutation(op:string,payload:Record<string,unknown>){const db=await database();if(op==='quote')return (await db.query<{result:unknown}>('select booking_quote($1,$2,$3,$4) result',[payload.ground_id,payload.starts_at,payload.ends_at,payload.hours_override_reason])).rows[0].result;return (await db.query<{result:{id:string}}>('select pos_mutate($1,$2::jsonb) result',[op,JSON.stringify(payload)])).rows[0].result;}
