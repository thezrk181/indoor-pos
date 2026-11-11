-- Optional LOCAL DEVELOPMENT seed only. Do not run on a live customer's database.
-- The interactive Phase 1 demo is seeded automatically by src/lib/demo.ts.
insert into public.grounds(id,name,description,hourly_rate) values
 ('00000000-0000-4000-8000-000000000010','Development ground','Fictional local test ground',400000)
on conflict(id) do nothing;
insert into public.operating_hours(ground_id,weekday,opens,closes)
select '00000000-0000-4000-8000-000000000010'::uuid,d,960,1560 from generate_series(0,6) d
on conflict(ground_id,weekday) do nothing;
