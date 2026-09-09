-- Lab authorization is separate from user-editable legacy profiles.
begin;
create table public.lab_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','approved','denied','revoked')),
 is_admin boolean not null default false,
 requested_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id)
);
create table public.lab_settings (
 id boolean primary key default true check(id), lifetime_limit integer not null default 10 check(lifetime_limit between 0 and 100000),
 daily_limit integer not null default 10 check(daily_limit between 0 and 100000), timezone text not null default 'America/Sao_Paulo',
 notification_email text not null default 'douglas.odavila@gmail.com', paused boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.lab_settings(id) values(true);
insert into public.lab_access(user_id,state,is_admin)
select p.user_id,case when p.has_privileges or p.user_id='3b81aae7-6256-4678-99be-fe592ce1eaad' then 'approved' else 'pending' end,
 p.user_id='3b81aae7-6256-4678-99be-fe592ce1eaad' and lower(p.email)='douglas.odavila@gmail.com'
from public.profiles p join auth.users u on u.id=p.user_id;
create table public.lab_executions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, tool_key text not null, request_hash text not null,
 status text not null default 'reserved' check(status in ('reserved','dispatched','completed','error','cancelled')),
 result jsonb, error_message text, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(user_id,request_id)
);
create index lab_executions_created on public.lab_executions(created_at);
create index lab_executions_user on public.lab_executions(user_id);
-- Preserve historical consumption; existing daily reset overrides cannot replenish lifetime budgets.
insert into public.lab_executions(id,user_id,request_id,tool_key,request_hash,status,result,error_message,created_at,completed_at)
select id,user_id,id,tool_key,'legacy',case when status='reserved' then 'dispatched' else status end,response_payload,error_message,created_at,completed_at from public.ai_interaction_logs
where status in ('reserved','completed','error');
create table public.lab_audit (
 id bigint generated always as identity primary key, actor_id uuid, action text not null, target_id uuid,
 details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.lab_email_outbox (
 id uuid primary key default gen_random_uuid(), dedupe_key text not null unique, kind text not null check(kind in ('request','approved')),
 user_id uuid not null references auth.users(id) on delete cascade, recipient text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','cancelled')), attempts integer not null default 0,
 available_at timestamptz not null default now(), locked_at timestamptz, sent_at timestamptz, last_error text, created_at timestamptz not null default now()
);
alter table public.lab_access enable row level security;
alter table public.lab_settings enable row level security;
alter table public.lab_executions enable row level security;
alter table public.lab_audit enable row level security;
alter table public.lab_email_outbox enable row level security;
revoke all on public.lab_access,public.lab_settings,public.lab_executions,public.lab_audit,public.lab_email_outbox from public,anon,authenticated;
grant all on public.lab_access,public.lab_settings,public.lab_executions,public.lab_audit,public.lab_email_outbox to service_role;
grant usage,select on sequence public.lab_audit_id_seq to service_role;
-- Stop self-escalation through the historical profile endpoint. Safe edits still work.
revoke insert,update,delete on public.profiles from public,anon,authenticated;
revoke insert(user_id,email,is_admin,has_privileges),update(user_id,email,is_admin,has_privileges) on public.profiles from public,anon,authenticated;
grant update(full_name,avatar_storage_path,role,company_website_url,phone_country_iso2,phone_dial_code,phone_number) on public.profiles to authenticated;
create or replace function public.is_current_user_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.lab_access where user_id=auth.uid() and is_admin and state='approved');
$$;
-- Legacy admin RPCs must use the same owner role; prevent privilege writes except trusted DB/service execution.
create function public.lab_protect_profile_role() returns trigger language plpgsql as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') then
  if tg_op='INSERT' and (new.is_admin or new.has_privileges) then raise exception 'Protected profile roles' using errcode='42501'; end if;
  if tg_op='UPDATE' and (new.is_admin is distinct from old.is_admin or new.has_privileges is distinct from old.has_privileges) then
   raise exception 'Use Lab access administration' using errcode='42501';
  end if;
 end if;
 return new;
end; $$;
create trigger lab_protect_profile_role before insert or update on public.profiles for each row execute function public.lab_protect_profile_role();
-- Old reservation/completion RPCs cannot be called by a browser or old deployed function.
revoke all on function public.reserve_ai_interaction(text,jsonb) from public,anon,authenticated;
revoke all on function public.complete_ai_interaction(uuid,jsonb,text,text) from public,anon,authenticated;
create function public.lab_status(p_user_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.lab_access; s public.lab_settings; u auth.users; total integer; daily integer; starts timestamptz; ends timestamptz; stamp timestamptz:=clock_timestamp();
begin
 select * into u from auth.users where id=p_user_id;
 if not found then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into a from public.lab_access where user_id=p_user_id;
 if not found then
  if not exists(select 1 from auth.identities where user_id=p_user_id and provider='google') then raise exception 'Use Google login to request Lab access' using errcode='42501'; end if;
  insert into public.lab_access(user_id) values(p_user_id) on conflict do nothing;
  select * into a from public.lab_access where user_id=p_user_id;
 end if;
 select * into s from public.lab_settings where id;
 -- A reservation whose response was lost cannot dispatch without lab_dispatch.
 -- Release only undispatched reservations after the lease; dispatched failures count.
 update public.lab_executions set status='cancelled',error_message='Execution was never dispatched; no allowance consumed',completed_at=stamp where status='reserved' and created_at<stamp-interval '5 minutes';
 if a.state='pending' then
  insert into public.lab_email_outbox(dedupe_key,kind,user_id,recipient) values('request:'||p_user_id,'request',p_user_id,s.notification_email) on conflict do nothing;
 end if;
 starts := date_trunc('day',stamp at time zone s.timezone) at time zone s.timezone;
 ends := (date_trunc('day',stamp at time zone s.timezone)+interval '1 day') at time zone s.timezone;
 select count(*) into total from public.lab_executions where user_id=p_user_id and status<>'cancelled';
 select count(*) into daily from public.lab_executions where created_at>=starts and created_at<ends and status<>'cancelled';
 return jsonb_build_object('access',jsonb_build_object('state',a.state,'is_admin',a.is_admin),'usage',jsonb_build_object(
 'lifetime_used',total,'lifetime_limit',s.lifetime_limit,'lifetime_remaining',greatest(s.lifetime_limit-total,0),
 'daily_used',daily,'daily_limit',s.daily_limit,'daily_remaining',greatest(s.daily_limit-daily,0),'resets_at',ends,'timezone',s.timezone,'paused',s.paused));
end; $$;
create function public.lab_reserve(p_user_id uuid,p_request_id uuid,p_tool_key text,p_request_hash text) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.lab_access; s public.lab_settings; existing public.lab_executions; eid uuid; total integer; daily integer; starts timestamptz; ends timestamptz; stamp timestamptz:=clock_timestamp();
begin
 -- One row serializes reservations and settings changes across every user/tool.
 select * into s from public.lab_settings where id for update;
 stamp:=clock_timestamp();
 perform public.lab_status(p_user_id);
 select * into a from public.lab_access where user_id=p_user_id for share;
 if not found or a.state<>'approved' then raise exception 'Lab access is not approved' using errcode='42501'; end if;
 if p_tool_key not in ('user-story-analyzer','operational-graph-assistant') or p_request_id is null or length(p_request_hash)<>64 then raise exception 'Invalid execution request' using errcode='22023'; end if;
 select * into existing from public.lab_executions where user_id=p_user_id and request_id=p_request_id;
 if found then
  if existing.tool_key<>p_tool_key or existing.request_hash<>p_request_hash then raise exception 'Request ID already used with different input' using errcode='22023'; end if;
  return jsonb_build_object('replay',true,'execution',to_jsonb(existing),'usage',public.lab_status(p_user_id)->'usage');
 end if;
 if s.paused then raise exception 'Lab executions are paused' using errcode='P0001'; end if;
 starts:=date_trunc('day',stamp at time zone s.timezone) at time zone s.timezone;
 ends:=(date_trunc('day',stamp at time zone s.timezone)+interval '1 day') at time zone s.timezone;
 select count(*) into total from public.lab_executions where user_id=p_user_id and status<>'cancelled';
 select count(*) into daily from public.lab_executions where created_at>=starts and created_at<ends and status<>'cancelled';
 if total>=s.lifetime_limit then raise exception 'Lifetime execution limit reached' using errcode='P0001'; end if;
 if daily>=s.daily_limit then raise exception 'Shared daily execution limit reached' using errcode='P0001'; end if;
 insert into public.lab_executions(user_id,request_id,tool_key,request_hash,created_at) values(p_user_id,p_request_id,p_tool_key,p_request_hash,stamp) returning id into eid;
 return jsonb_build_object('replay',false,'execution',jsonb_build_object('id',eid,'status','reserved'),'usage',public.lab_status(p_user_id)->'usage');
end; $$;
create function public.lab_dispatch(p_execution_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.lab_executions set status='dispatched' where id=p_execution_id and status='reserved' and created_at>=clock_timestamp()-interval '5 minutes';
 return found;
end; $$;
create function public.lab_complete(p_execution_id uuid,p_result jsonb,p_error text default null) returns void language sql security definer set search_path=public as $$
 update public.lab_executions set status=case when p_error is null then 'completed' else 'error' end,result=p_result,error_message=p_error,completed_at=now() where id=p_execution_id and status='dispatched';
$$;
create function public.lab_admin(p_actor_id uuid,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare target uuid; next_state text; s public.lab_settings; previous text; recipient_email text;
begin
 if not exists(select 1 from public.lab_access where user_id=p_actor_id and is_admin and state='approved') then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_action='admin_overview' then
  return jsonb_build_object('requests',coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'email',u.email,'full_name',u.raw_user_meta_data->>'full_name','state',a.state,'is_admin',a.is_admin,'requested_at',a.requested_at) order by a.requested_at desc) from public.lab_access a join auth.users u on u.id=a.user_id),'[]'::jsonb),'settings',(select to_jsonb(x)-'id' from public.lab_settings x where id),'logs',coalesce((select jsonb_agg(to_jsonb(l)) from (select id,user_id,tool_key,status,error_message,created_at,completed_at from public.lab_executions order by created_at desc limit 100) l),'[]'::jsonb),'notifications',coalesce((select jsonb_agg(to_jsonb(o)) from (select id,kind,status,attempts,last_error,created_at from public.lab_email_outbox order by created_at desc limit 30) o),'[]'::jsonb));
 elsif p_action='review' then
  target:=(p_payload->>'user_id')::uuid; next_state:=p_payload->>'state';
  if next_state not in ('approved','denied','revoked') then raise exception 'Invalid access state' using errcode='22023'; end if;
  select state into previous from public.lab_access where user_id=target for update;
  if not found then raise exception 'Access request not found' using errcode='22023'; end if;
  if exists(select 1 from public.lab_access where user_id=target and is_admin) then raise exception 'Administrator access cannot be changed here' using errcode='42501'; end if;
  update public.lab_access set state=next_state,reviewed_at=now(),reviewed_by=p_actor_id where user_id=target;
  update public.profiles set has_privileges=next_state='approved' where user_id=target;
  if next_state='approved' and previous<>'approved' then
   select email into recipient_email from auth.users where id=target;
   insert into public.lab_email_outbox(dedupe_key,kind,user_id,recipient) values('approved:'||target||':'||gen_random_uuid(),'approved',target,recipient_email);
  end if;
 elsif p_action='retry_notifications' then
  update public.lab_email_outbox set available_at=now() where status='pending';
 elsif p_action='settings' then
  if not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone') then raise exception 'Invalid timezone' using errcode='22023'; end if;
  if coalesce(p_payload->>'notification_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid notification email' using errcode='22023'; end if;
  update public.lab_settings set lifetime_limit=(p_payload->>'lifetime_limit')::integer,daily_limit=(p_payload->>'daily_limit')::integer,timezone=p_payload->>'timezone',notification_email=p_payload->>'notification_email',paused=(p_payload->>'paused')::boolean,updated_at=now() where id;
 else raise exception 'Unknown administrator action' using errcode='22023'; end if;
 insert into public.lab_audit(actor_id,action,target_id,details) values(p_actor_id,p_action,target,p_payload);
 return jsonb_build_object('ok',true);
end; $$;
create function public.lab_claim_emails() returns setof public.lab_email_outbox language plpgsql security definer set search_path=public as $$
begin
 update public.lab_email_outbox o set status='cancelled',last_error='Access state changed before delivery' from public.lab_access a where o.user_id=a.user_id and (o.status='pending' or (o.status='sending' and o.locked_at<now()-interval '5 minutes')) and ((o.kind='request' and a.state<>'pending') or (o.kind='approved' and a.state<>'approved'));
 return query update public.lab_email_outbox set status='sending',locked_at=now(),attempts=attempts+1 where id in (
 select id from public.lab_email_outbox where (status='pending' and available_at<=now()) or (status='sending' and locked_at<now()-interval '5 minutes') order by created_at for update skip locked limit 10
 ) returning *;
end; $$;
create function public.lab_finish_email(p_id uuid,p_error text default null) returns void language sql security definer set search_path=public as $$
 update public.lab_email_outbox set status=case when p_error is null then 'sent' else 'pending' end,sent_at=case when p_error is null then now() else null end,last_error=left(p_error,1000),available_at=now()+least(interval '1 hour',interval '1 minute'*power(2,least(attempts,6))),locked_at=null where id=p_id and status='sending';
$$;
revoke all on function public.lab_status(uuid),public.lab_reserve(uuid,uuid,text,text),public.lab_dispatch(uuid),public.lab_complete(uuid,jsonb,text),public.lab_admin(uuid,text,jsonb),public.lab_claim_emails(),public.lab_finish_email(uuid,text) from public,anon,authenticated;
grant execute on function public.lab_status(uuid),public.lab_reserve(uuid,uuid,text,text),public.lab_dispatch(uuid),public.lab_complete(uuid,jsonb,text),public.lab_admin(uuid,text,jsonb),public.lab_claim_emails(),public.lab_finish_email(uuid,text) to service_role;
commit;
