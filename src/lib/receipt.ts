import {authorized} from './supabase/server';
import {redirect} from 'next/navigation';
import {demoEnabled,demoSnapshot} from './demo';
import type {Customer,Ground,Payment,Reservation,Settings} from './types';
export async function receiptData(id:string){
 if(demoEnabled()){const state=await demoSnapshot();const b=state.reservations.find(b=>b.id===id&&b.kind==='booking');if(!b)return null;return {b,s:state.settings,customer:state.customers.find(c=>c.id===b.customer_id),ground:state.grounds.find(g=>g.id===b.ground_id),p:state.payments.filter(p=>p.booking_id===id)};}
 const db=await authorized().catch((error:Error)=>{if(/Session expired|not authorized/.test(error.message))redirect('/login');throw error;});const {data,error}=await db.rpc('pos_snapshot');if(error)throw error;const b=(data.reservations as Reservation[]).find(b=>b.id===id&&b.kind==='booking');if(!b)return null;return {b,s:data.settings as Settings,customer:(data.customers as Customer[]).find(c=>c.id===b.customer_id),ground:(data.grounds as Ground[]).find(g=>g.id===b.ground_id),p:(data.payments as Payment[]).filter(p=>p.booking_id===id)};
}
