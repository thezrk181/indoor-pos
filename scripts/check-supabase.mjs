import {readFileSync} from 'node:fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
const base=env.NEXT_PUBLIC_SUPABASE_URL;
const headers={apikey:env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
const settings=await fetch(base+'/auth/v1/settings',{headers});
console.log('Auth service:',settings.status);
if(settings.ok){const data=await settings.json();console.log('Public signups disabled:',data.disable_signup);console.log('Email auth enabled:',data.external?.email);}
for(const path of ['/rest/v1/reservations?select=id&limit=1','/rest/v1/payments?select=id&limit=1','/rest/v1/rpc/pos_snapshot']){
 const r=await fetch(base+path,{headers,method:path.includes('/rpc/')?'POST':'GET',...(path.includes('/rpc/')?{body:'{}'}:{})});
 const body=await r.json();console.log(path.split('?')[0],r.status,Array.isArray(body)?`Visible rows: ${body.length}`:`${body.code??''} ${body.message??''}`);
 if(r.ok)process.exitCode=1;
}
