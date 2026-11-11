import {NextResponse,type NextRequest} from 'next/server';
import {serverClient} from '@/lib/supabase/server';
export async function GET(request:NextRequest){const code=request.nextUrl.searchParams.get('code');if(code){const db=await serverClient();const {error}=await db.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL('/login?reset=1',request.url));}return NextResponse.redirect(new URL('/login?error=recovery',request.url));}
