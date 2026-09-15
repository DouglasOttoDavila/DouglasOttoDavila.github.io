begin;
create table if not exists public.lab_model_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 model text not null check (length(model) between 3 and 200),
 updated_at timestamptz not null default now()
);
alter table public.lab_model_preferences enable row level security;
revoke all on public.lab_model_preferences from anon, authenticated;
create or replace function public.lab_model_preference(p_user_id uuid,p_model text default null)
returns text language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.lab_access where user_id=p_user_id and state='approved') then raise exception 'Approved Lab access required' using errcode='42501'; end if;
 if p_model is not null then
  insert into public.lab_model_preferences(user_id,model) values(p_user_id,p_model)
  on conflict(user_id) do update set model=excluded.model,updated_at=now();
 end if;
 return (select model from public.lab_model_preferences where user_id=p_user_id);
end; $$;
revoke all on function public.lab_model_preference(uuid,text) from public,anon,authenticated;
grant execute on function public.lab_model_preference(uuid,text) to service_role;
commit;
