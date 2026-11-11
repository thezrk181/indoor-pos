import {NextResponse,type NextRequest} from 'next/server';
import {authorized} from '@/lib/supabase/server';
import {schemas,type Operation} from '@/lib/validation';
import {phone} from '@/lib/domain';
import {z} from 'zod';
import {demoEnabled,demoMutation,demoSnapshot} from '@/lib/demo';
export const dynamic='force-dynamic';
function failure(error:unknown){const e=error as {message?:string;code?:string};let message=e.message??'The request failed. Please retry';if(e.code==='23P01')message='This period overlaps an existing reservation or pricing rule. Refresh and choose another period.';else if(e.code==='23505')message='This record already exists. Refresh before retrying.';else if(e.code?.startsWith('23'))message='Invalid data. Check the required fields and amounts.';return NextResponse.json({error:message},{status:/Session|Unauthorized|authorized/.test(message)?401:400,headers:{'Cache-Control':'no-store'}});}
export async function GET(){try{if(demoEnabled())return NextResponse.json(await demoSnapshot(),{headers:{'Cache-Control':'private, no-store'}});const db=await authorized();const {data,error}=await db.rpc('pos_snapshot');if(error)throw error;if(!data?.settings)throw new Error('Club settings are unavailable. Verify database setup.');return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export async function POST(request:NextRequest){try{
 const origin=request.headers.get('origin');
 if(!origin||new URL(origin).host!==request.headers.get('host'))throw new Error('Invalid request origin');
 const db=demoEnabled()?null:await authorized();const body=await request.json();
 if(body.op==='quote'){const p=z.object({ground_id:z.string().uuid(),starts_at:z.string().datetime({offset:true}),ends_at:z.string().datetime({offset:true}),hours_override_reason:z.string().max(2000)}).parse(body.payload);if(!db)return NextResponse.json(await demoMutation('quote',p),{headers:{'Cache-Control':'no-store'}});const {data,error}=await db.rpc('booking_quote',{g:p.ground_id,s:p.starts_at,e:p.ends_at,override_reason:p.hours_override_reason});if(error)throw error;return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});}
 if(!Object.hasOwn(schemas,body.op))throw new Error('Unknown operation');
 const payload=schemas[body.op as Operation].parse(body.payload);
 if('phone' in payload)payload.phone=phone(payload.phone);
 if(!db)return NextResponse.json(await demoMutation(body.op,payload),{headers:{'Cache-Control':'no-store'}});
 const {data,error}=await db.rpc('pos_mutate',{op:body.op,payload});if(error)throw error;
 return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:e.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},{status:400});return failure(e);}}
