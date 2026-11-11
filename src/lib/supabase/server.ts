import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export function configured(){return !!process.env.NEXT_PUBLIC_SUPABASE_URL&&!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;}
export async function serverClient(){const store=await cookies();return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>store.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>store.set(name,value,options));}catch{/* Read-only server component; proxy refreshes cookies. */}}}});}
export async function authorized(){if(!configured())throw new Error('Supabase configuration is required');const db=await serverClient();const {data:{user},error}=await db.auth.getUser();if(error||!user)throw new Error('Session expired. Please sign in again');const {data}=await db.rpc('is_admin');if(!data)throw new Error('This account is not authorized for this club');return db;}
