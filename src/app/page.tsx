import {redirect} from 'next/navigation';
import {configured,serverClient} from '@/lib/supabase/server';
import {Terminal} from '@/components/terminal';
import {demoEnabled} from '@/lib/demo';
export const dynamic='force-dynamic';
export default async function Home(){if(demoEnabled())return <Terminal configured demo/>;if(!configured())return <Terminal configured={false}/>;const db=await serverClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const {data}=await db.rpc('is_admin');if(!data)redirect('/login?error=unauthorized');return <Terminal configured/>;}
