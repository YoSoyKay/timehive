-- Run in Supabase SQL Editor. Invite users via Supabase Auth, then insert their profiles.
create extension if not exists pgcrypto;
create table public.tenants(id uuid primary key default gen_random_uuid(),name text not null,slug text unique not null,logo_url text,accent_color text not null default '#efb83e',created_at timestamptz not null default now());
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,tenant_id uuid not null references public.tenants(id),full_name text not null,employee_code text not null,role text not null default 'employee' check(role in('employee','admin')),unique(tenant_id,employee_code));
create table public.locations(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),name text not null,active boolean not null default true,unique(id,tenant_id));
create table public.time_events(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),employee_id uuid not null references public.profiles(id),location_id uuid not null references public.locations(id),event_type text not null check(event_type in('in','out')),occurred_at timestamptz not null default now(),latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),accuracy_m double precision not null check(accuracy_m>=0));
create index on public.time_events(tenant_id,employee_id,occurred_at desc);
create function public.my_tenant() returns uuid language sql stable security definer set search_path=public as $$select tenant_id from public.profiles where id=(select auth.uid())$$;
create function public.is_tenant_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin')$$;
alter table public.tenants enable row level security;alter table public.profiles enable row level security;alter table public.locations enable row level security;alter table public.time_events enable row level security;
create policy tenant_read on public.tenants for select to authenticated using(id=public.my_tenant());
create policy profiles_read on public.profiles for select to authenticated using(tenant_id=public.my_tenant() and (id=(select auth.uid()) or public.is_tenant_admin()));
create policy locations_read on public.locations for select to authenticated using(tenant_id=public.my_tenant());
create policy events_read on public.time_events for select to authenticated using(tenant_id=public.my_tenant() and (employee_id=(select auth.uid()) or public.is_tenant_admin()));
-- Clock events are inserted exclusively through this authenticated server-side function.
create function public.record_time_event(p_location_id uuid,p_event_type text,p_latitude double precision,p_longitude double precision,p_accuracy_m double precision) returns timestamptz language plpgsql security definer set search_path=public as $$
declare v_tenant uuid;v_last text;v_now timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if p_event_type not in ('in','out') then raise exception 'Invalid event type';end if;
 if p_latitude is null or p_latitude not between -90 and 90 or p_longitude is null or p_longitude not between -180 and 180 or p_accuracy_m is null or p_accuracy_m < 0 then raise exception 'Invalid GPS data';end if;
 select tenant_id into v_tenant from public.profiles where id=auth.uid();
 if v_tenant is null then raise exception 'Employee profile not found';end if;
 if not exists(select 1 from public.locations where id=p_location_id and tenant_id=v_tenant and active) then raise exception 'Invalid work location';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select event_type into v_last from public.time_events where employee_id=auth.uid() order by occurred_at desc,id desc limit 1;
 if v_last=p_event_type then raise exception 'Already clocked %',p_event_type;end if;
 if v_last is null and p_event_type='out' then raise exception 'Clock in before clocking out';end if;
 insert into public.time_events(tenant_id,employee_id,location_id,event_type,latitude,longitude,accuracy_m) values(v_tenant,auth.uid(),p_location_id,p_event_type,p_latitude,p_longitude,p_accuracy_m) returning occurred_at into v_now;
 return v_now;
end$$;
revoke all on function public.record_time_event(uuid,text,double precision,double precision,double precision) from public,anon;grant execute on function public.record_time_event(uuid,text,double precision,double precision,double precision) to authenticated;
