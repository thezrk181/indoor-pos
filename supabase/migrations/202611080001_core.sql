create extension if not exists btree_gist;

create table public.admin_users (user_id uuid primary key references auth.users(id) on delete cascade);
create unique index one_club_admin on public.admin_users((true));
create table public.club_settings (
 id boolean primary key default true check(id), name text not null default 'Your cricket club',
 description text not null default '', phone text not null default '', whatsapp text not null default '',
 address text not null default '', logo_url text not null default '', receipt_note text not null default 'Thank you. See you on the ground!',
 currency text not null default 'PKR' check(currency ~ '^[A-Z]{3}$'), timezone text not null default 'Asia/Karachi',
 accent text not null default '#c9f66f' check(accent ~ '^#[0-9a-fA-F]{6}$'), updated_at timestamptz not null default now()
);
insert into public.club_settings(id) values(true);
create table public.grounds (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 description text not null default '', active boolean not null default true,
 hourly_rate bigint not null check(hourly_rate between 0 and 100000000), created_at timestamptz not null default now()
);
-- Minutes from midnight, end may be in the following calendar day (up to 48h).
create table public.operating_hours (
 id uuid primary key default gen_random_uuid(), ground_id uuid not null references public.grounds(id),
 weekday integer not null check(weekday between 0 and 6), opens integer not null check(opens between 0 and 1410 and opens % 30 = 0),
 closes integer not null check(closes between 30 and 2880 and closes % 30 = 0),
 check(closes > opens and closes - opens <= 1440), unique(ground_id,weekday)
);
create table public.pricing_rules (
 id uuid primary key default gen_random_uuid(), ground_id uuid not null references public.grounds(id), name text not null,
 weekday integer not null check(weekday between 0 and 6), starts integer not null check(starts between 0 and 1410 and starts % 30 = 0),
 ends integer not null check(ends between 30 and 1440 and ends % 30 = 0 and ends > starts),
 hourly_rate bigint not null check(hourly_rate between 0 and 100000000),
 exclude using gist(ground_id with =, weekday with =, int4range(starts,ends,'[)') with &&)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 phone text unique, notes text not null default '', created_at timestamptz not null default now()
);
create table public.reservations (
 id uuid primary key default gen_random_uuid(), ground_id uuid not null references public.grounds(id),
 kind text not null check(kind in ('booking','block')), customer_id uuid references public.customers(id),
 starts_at timestamptz not null, ends_at timestamptz not null, check(ends_at > starts_at),
 status text not null default 'confirmed' check(status in ('confirmed','completed','cancelled','no-show')),
 quoted_price bigint not null default 0 check(quoted_price >= 0), total_price bigint not null default 0 check(total_price between 0 and 10000000000),
 price_reason text not null default '', hours_override_reason text not null default '', notes text not null default '',
 cancellation_handling text check(cancellation_handling in ('retain','refund')),
 refund_due bigint not null default 0 check(refund_due >= 0), version integer not null default 1,
 request_id uuid not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((kind='booking' and customer_id is not null) or (kind='block' and customer_id is null)),
 exclude using gist(ground_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where(status <> 'cancelled')
);
create index reservations_start_idx on public.reservations(starts_at);
create index reservations_customer_idx on public.reservations(customer_id);
create table public.payments (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.reservations(id),
 kind text not null check(kind in ('payment','refund')), amount bigint not null check(amount > 0 and amount <= 10000000000),
 method text not null check(method in ('cash','bank','other')), note text not null default '',
 request_id uuid not null unique, created_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments(booking_id);
create index payments_date_idx on public.payments(created_at);
create table public.activity (
 id uuid primary key default gen_random_uuid(), actor uuid not null, action text not null,
 entity_id uuid, detail jsonb not null default '{}', created_at timestamptz not null default now()
);

create function public.is_admin() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_users where user_id=auth.uid()); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

do $$ declare t text; begin
 foreach t in array array['admin_users','club_settings','grounds','operating_hours','pricing_rules','customers','reservations','payments','activity'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon, authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())',t);
 end loop;
end $$;

create function public.immutable_ledger() returns trigger language plpgsql as $$ begin raise exception 'Financial and activity records are append-only'; end; $$;
create trigger immutable_payments before update or delete on public.payments for each row execute function public.immutable_ledger();
create trigger immutable_activity before update or delete on public.activity for each row execute function public.immutable_ledger();

-- All financial calculations are integer minor units. Each half hour rounds half up.
create function public.booking_quote(g uuid, s timestamptz, e timestamptz, override_reason text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare tz text; base bigint; total bigint:=0; tick timestamptz; local_tick timestamp; day_start date; h record;
 allowed boolean:=false; rate bigint; label text; parts jsonb:='[]'; minutes integer;
begin
 if not public.is_admin() then raise exception 'Unauthorized'; end if;
 select timezone into tz from club_settings where id;
 select hourly_rate into base from grounds where id=g and active;
 if base is null then raise exception 'Ground is inactive or missing'; end if;
 if s is null or e is null or e<=s or e-s>interval '24 hours' or mod(extract(epoch from e-s)::numeric,1800)<>0
 or mod(extract(epoch from (s at time zone tz)::time)::numeric,1800)<>0 then raise exception 'Use 30-minute increments, up to 24 hours'; end if;
 day_start:=(s at time zone tz)::date;
 for h in select * from operating_hours where ground_id=g loop
   if (h.weekday=extract(dow from day_start) and s>=(day_start+h.opens*interval '1 minute') at time zone tz and e<=(day_start+h.closes*interval '1 minute') at time zone tz)
   or (h.weekday=extract(dow from day_start-1) and s>=((day_start-1)+h.opens*interval '1 minute') at time zone tz and e<=((day_start-1)+h.closes*interval '1 minute') at time zone tz) then allowed:=true; end if;
 end loop;
 if not allowed and length(trim(override_reason))<5 then raise exception 'Outside operating hours. An explicit override reason is required'; end if;
 tick:=s;
 while tick<e loop
   local_tick:=tick at time zone tz; minutes:=extract(hour from local_tick)::int*60+extract(minute from local_tick)::int;
   rate:=null; label:=null;
   select hourly_rate,name into rate,label from pricing_rules where ground_id=g and weekday=extract(dow from local_tick) and starts<=minutes and ends>minutes;
   rate:=coalesce(rate,base); label:=coalesce(label,'Standard');
   total:=total+(rate+1)/2;
   parts:=parts||jsonb_build_object('start',tick,'rate',rate,'amount',(rate+1)/2,'label',label);
   tick:=tick+interval '30 minutes';
 end loop;
 return jsonb_build_object('total',total,'parts',parts);
end $$;
revoke all on function public.booking_quote(uuid,timestamptz,timestamptz,text) from public;
grant execute on function public.booking_quote(uuid,timestamptz,timestamptz,text) to authenticated;

-- One configuration lock serializes mutations across devices. Exclusion constraints remain the
-- final occupancy guard. No direct client INSERT/UPDATE/DELETE grants exist.
create function public.pos_mutate(op text, payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b reservations; cid uuid; rid uuid; g uuid; quote jsonb; agreed bigint; advance bigint;
 net bigint; received bigint; refunded bigint; amount bigint; r record; s timestamptz; e timestamptz; ph text;
begin
 if not public.is_admin() then raise exception 'Unauthorized'; end if;
 perform 1 from club_settings where id for update;
 if op='booking' then
   select * into b from reservations where request_id=(payload->>'request_id')::uuid;
   if found then return jsonb_build_object('id',b.id); end if;
   g:=(payload->>'ground_id')::uuid; s:=(payload->>'starts_at')::timestamptz; e:=(payload->>'ends_at')::timestamptz;
   quote:=booking_quote(g,s,e,coalesce(payload->>'hours_override_reason',''));
   agreed:=coalesce((payload->>'total_price')::bigint,(quote->>'total')::bigint); advance:=coalesce((payload->>'advance')::bigint,0);
   if agreed<>(quote->>'total')::bigint and length(trim(coalesce(payload->>'price_reason','')))<5 then raise exception 'Explain the agreed-price adjustment'; end if;
   if advance<0 or advance>agreed then raise exception 'Advance exceeds booking price'; end if;
   ph:=nullif(trim(payload->>'phone'),'');
   cid:=nullif(payload->>'customer_id','')::uuid;
   if cid is not null then
     perform 1 from customers where id=cid; if not found then raise exception 'Customer not found'; end if;
   elsif ph is not null then
     insert into customers(name,phone) values(payload->>'customer_name',ph) on conflict(phone) do update set name=excluded.name returning id into cid;
   else insert into customers(name) values(payload->>'customer_name') returning id into cid;
   end if;
   insert into reservations(ground_id,kind,customer_id,starts_at,ends_at,quoted_price,total_price,price_reason,hours_override_reason,notes,request_id)
   values(g,'booking',cid,s,e,(quote->>'total')::bigint,agreed,coalesce(payload->>'price_reason',''),coalesce(payload->>'hours_override_reason',''),coalesce(payload->>'notes',''),(payload->>'request_id')::uuid) returning id into rid;
   if advance>0 then insert into payments(booking_id,kind,amount,method,request_id) values(rid,'payment',advance,payload->>'method',(payload->>'request_id')::uuid); end if;
 elsif op='block' then
   select id into rid from reservations where request_id=(payload->>'request_id')::uuid;
   if rid is not null then return jsonb_build_object('id',rid); end if;
   if length(trim(coalesce(payload->>'notes','')))<3 then raise exception 'A block reason is required'; end if;
   perform 1 from grounds where id=(payload->>'ground_id')::uuid and active; if not found then raise exception 'Ground is inactive'; end if;
   insert into reservations(ground_id,kind,starts_at,ends_at,notes,request_id) values((payload->>'ground_id')::uuid,'block',(payload->>'starts_at')::timestamptz,(payload->>'ends_at')::timestamptz,payload->>'notes',(payload->>'request_id')::uuid) returning id into rid;
 elsif op in ('payment','update_booking','status','remove_block') then
   select * into b from reservations where id=(payload->>'id')::uuid for update;
   if not found then raise exception 'Booking not found'; end if; rid:=b.id;
   if op='payment' and exists(select 1 from payments where request_id=(payload->>'request_id')::uuid and booking_id=b.id) then return jsonb_build_object('id',rid); end if;
   if b.version is distinct from (payload->>'version')::integer then raise exception 'This booking changed on another device. Refresh and try again'; end if;
   select coalesce(sum(p.amount) filter(where p.kind='payment'),0),coalesce(sum(p.amount) filter(where p.kind='refund'),0) into received,refunded from payments p where p.booking_id=b.id;
   net:=received-refunded;
   if op='payment' then
     if b.kind<>'booking' then raise exception 'Blocks cannot receive payments'; end if;
     amount:=(payload->>'amount')::bigint;
     if payload->>'kind'='payment' then
       if b.status='cancelled' or amount>b.total_price-net then raise exception 'Payment exceeds balance or booking is cancelled'; end if;
     elsif payload->>'kind'='refund' then
       if amount>net then raise exception 'Refund exceeds money held'; end if;
       if length(trim(coalesce(payload->>'note','')))<5 then raise exception 'Explain the refund'; end if;
     else raise exception 'Invalid transaction type'; end if;
     insert into payments(booking_id,kind,amount,method,note,request_id) values(b.id,payload->>'kind',amount,payload->>'method',coalesce(payload->>'note',''),(payload->>'request_id')::uuid);
     update reservations set refund_due=case when payload->>'kind'='refund' then greatest(0,refund_due-amount) else refund_due end,version=version+1,updated_at=now() where id=b.id;
   elsif op='update_booking' then
     if b.kind<>'booking' or b.status<>'confirmed' then raise exception 'Only confirmed bookings can be rescheduled or repriced'; end if;
     g:=(payload->>'ground_id')::uuid; s:=(payload->>'starts_at')::timestamptz; e:=(payload->>'ends_at')::timestamptz;
     quote:=booking_quote(g,s,e,coalesce(payload->>'hours_override_reason',''));
     agreed:=(payload->>'total_price')::bigint;
     if agreed<>b.total_price and length(trim(coalesce(payload->>'price_reason','')))<5 then raise exception 'Explain the price adjustment'; end if;
     if agreed<net then raise exception 'Record the excess refund before reducing this price'; end if;
     update reservations set ground_id=g,starts_at=s,ends_at=e,total_price=agreed,notes=coalesce(payload->>'notes',''),price_reason=coalesce(payload->>'price_reason',''),hours_override_reason=coalesce(payload->>'hours_override_reason',''),version=version+1,updated_at=now() where id=b.id;
   elsif op='status' then
     if b.kind<>'booking' or b.status<>'confirmed' then raise exception 'Only confirmed bookings can change status'; end if;
     if payload->>'status' not in ('cancelled','completed','no-show') then raise exception 'Invalid status'; end if;
     if payload->>'status'='cancelled' and net>0 and coalesce(payload->>'handling','') not in ('retain','refund') then raise exception 'Choose whether money is retained or a refund is owed'; end if;
     update reservations set status=payload->>'status',cancellation_handling=case when payload->>'status'='cancelled' then nullif(payload->>'handling','') else null end,refund_due=case when payload->>'status'='cancelled' and payload->>'handling'='refund' then net else 0 end,version=version+1,updated_at=now() where id=b.id;
   else
     if b.kind<>'block' or b.starts_at<=now() then raise exception 'Only future blocks can be removed'; end if;
     update reservations set status='cancelled',version=version+1,updated_at=now() where id=b.id;
   end if;
 elsif op='ground' then
   rid:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
   insert into grounds(id,name,description,active,hourly_rate) values(rid,payload->>'name',coalesce(payload->>'description',''),coalesce((payload->>'active')::boolean,true),(payload->>'hourly_rate')::bigint)
   on conflict(id) do update set name=excluded.name,description=excluded.description,active=excluded.active,hourly_rate=excluded.hourly_rate;
   delete from operating_hours where ground_id=rid;
   for r in select * from jsonb_to_recordset(payload->'hours') as x(weekday int,opens int,closes int) loop
     insert into operating_hours(ground_id,weekday,opens,closes) values(rid,r.weekday,r.opens,r.closes);
   end loop;
   -- Reject operating windows overlapping the next day's window, including Saturday -> Sunday.
   if exists(select 1 from operating_hours a join operating_hours c on c.ground_id=a.ground_id and c.weekday=(a.weekday+1)%7 where a.ground_id=rid and a.closes>1440+c.opens) then raise exception 'Operating windows overlap across business days'; end if;
 elsif op='rule' then
   rid:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
   insert into pricing_rules(id,ground_id,name,weekday,starts,ends,hourly_rate) values(rid,(payload->>'ground_id')::uuid,payload->>'name',(payload->>'weekday')::int,(payload->>'starts')::int,(payload->>'ends')::int,(payload->>'hourly_rate')::bigint)
   on conflict(id) do update set name=excluded.name,weekday=excluded.weekday,starts=excluded.starts,ends=excluded.ends,hourly_rate=excluded.hourly_rate;
 elsif op='delete_rule' then
   rid:=(payload->>'id')::uuid; delete from pricing_rules where id=rid;
 elsif op='customer' then
   rid:=(payload->>'id')::uuid; update customers set name=payload->>'name',phone=nullif(payload->>'phone',''),notes=coalesce(payload->>'notes','') where id=rid;
 elsif op='settings' then
   if not exists(select 1 from pg_timezone_names where name=payload->>'timezone') then raise exception 'Unknown time zone'; end if;
   if exists(select 1 from reservations where kind='booking') and exists(select 1 from club_settings where currency<>payload->>'currency') then raise exception 'Currency cannot change after bookings exist. Use a separate deployment for another currency'; end if;
   update club_settings set name=payload->>'name',description=coalesce(payload->>'description',''),phone=coalesce(payload->>'phone',''),whatsapp=coalesce(payload->>'whatsapp',''),address=coalesce(payload->>'address',''),logo_url=coalesce(payload->>'logo_url',''),currency=payload->>'currency',timezone=payload->>'timezone',accent=payload->>'accent',receipt_note=coalesce(payload->>'receipt_note',''),updated_at=now() where id;
 else raise exception 'Unknown operation'; end if;
 insert into activity(actor,action,entity_id,detail) values(auth.uid(),op,rid,jsonb_build_object('previous',case when b.id is not null then to_jsonb(b) else null end,'request',payload));
 return jsonb_build_object('id',rid);
end $$;
revoke all on function public.pos_mutate(text,jsonb) from public;
grant execute on function public.pos_mutate(text,jsonb) to authenticated;

-- A single statement snapshot keeps bookings and ledger balances consistent during concurrent writes.
create function public.pos_snapshot() returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
 'settings',(select to_jsonb(s) from club_settings s where id),
 'grounds',coalesce((select jsonb_agg(g order by name) from grounds g),'[]'),
 'hours',coalesce((select jsonb_agg(h) from operating_hours h),'[]'),
 'rules',coalesce((select jsonb_agg(r) from pricing_rules r),'[]'),
 'customers',coalesce((select jsonb_agg(c order by name) from customers c),'[]'),
 'reservations',coalesce((select jsonb_agg(b order by starts_at) from reservations b),'[]'),
 'payments',coalesce((select jsonb_agg(p order by created_at) from payments p),'[]'));
$$;
revoke all on function public.pos_snapshot() from public;
grant execute on function public.pos_snapshot() to authenticated;

-- Supabase Realtime sends only rows visible through RLS.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['reservations','payments','grounds','operating_hours','pricing_rules','customers','club_settings'] loop
 execute format('alter publication supabase_realtime add table public.%I',t);
 end loop; end if;
end $$;
