export const owner = "3b81aae7-6256-4678-99be-fe592ce1eaad";
export const alice = "11111111-1111-4111-8111-111111111111";
export const bob = "22222222-2222-4222-8222-222222222222";
export const pending = "33333333-3333-4333-8333-333333333333";
export const baseline =
  `create role anon; create role authenticated; create role service_role; create role supabase_admin; create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create table auth.identities(user_id uuid,provider text);
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.profiles(user_id uuid primary key,email text,full_name text,has_privileges boolean default false,is_admin boolean default false,avatar_storage_path text,role text,company_website_url text,phone_country_iso2 text,phone_dial_code text,phone_number text);
 create table public.ai_interaction_logs(id uuid primary key,user_id uuid,tool_key text,status text,response_payload jsonb,error_message text,created_at timestamptz,completed_at timestamptz);
 create function public.reserve_ai_interaction(text,jsonb) returns void language sql as $$select$$;
 create function public.complete_ai_interaction(uuid,jsonb,text,text) returns void language sql as $$select$$;
 insert into auth.users(id,email) values('${owner}','douglas.odavila@gmail.com'),('${alice}','alice@example.test'),('${bob}','bob@example.test'),('${pending}','pending@example.test');
 insert into auth.identities select id,'google' from auth.users;
 insert into profiles(user_id,email,has_privileges,is_admin) select id,email,id<>'${pending}',id='${owner}' from auth.users;
 grant all on profiles to authenticated; grant insert(is_admin,has_privileges),update(is_admin,has_privileges) on profiles to authenticated;`;
