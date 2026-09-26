create or replace function public.lab_reserve(p_user_id uuid,p_request_id uuid,p_tool_key text,p_request_hash text) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.lab_access; s public.lab_settings; existing public.lab_executions; eid uuid; total integer; daily integer; starts timestamptz; ends timestamptz; stamp timestamptz:=clock_timestamp();
begin
 -- One row serializes reservations and settings changes across every user/tool.
 select * into s from public.lab_settings where id for update;
 stamp:=clock_timestamp();
 perform public.lab_status(p_user_id);
 select * into a from public.lab_access where user_id=p_user_id for share;
 if not found or a.state<>'approved' then raise exception 'Lab access is not approved' using errcode='42501'; end if;
 if p_tool_key not in ('user-story-analyzer','operational-graph-assistant','quality-twin-analyst') or p_request_id is null or length(p_request_hash)<>64 then raise exception 'Invalid execution request' using errcode='22023'; end if;
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

