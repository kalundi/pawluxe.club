alter table public.pets
  add column if not exists birth_date date;

alter table public.pets
  drop constraint if exists pets_birth_date_valid;

alter table public.pets
  add constraint pets_birth_date_valid
  check (birth_date is null or (birth_date <= current_date and birth_date >= date '1980-01-01'));

comment on column public.pets.birth_date is
  'Owner-provided pet date of birth. Current age is calculated from this value.';

alter table public.pets
  add column if not exists deleted_at timestamptz,
  add column if not exists adoption_status text not null default 'not_listed';

alter table public.pets
  drop constraint if exists pets_adoption_status_valid;

alter table public.pets
  add constraint pets_adoption_status_valid
  check (adoption_status in ('not_listed', 'placement_requested', 'under_review', 'matched', 'placed', 'cancelled'));

create table if not exists public.member_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  home_zip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_profiles_home_zip_valid check (home_zip is null or home_zip ~ '^\d{5}(-\d{4})?$')
);

alter table public.member_profiles enable row level security;
grant select, insert, update on public.member_profiles to authenticated;
drop policy if exists "Members read their profile" on public.member_profiles;
create policy "Members read their profile" on public.member_profiles for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Members create their profile" on public.member_profiles;
create policy "Members create their profile" on public.member_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Members update their profile" on public.member_profiles;
create policy "Members update their profile" on public.member_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.pet_adoption_requests (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  home_zip text not null,
  status text not null default 'requested',
  selected_center_name text,
  selected_center_source_id text,
  selected_center_qualification_status text,
  owner_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_adoption_home_zip_valid check (home_zip ~ '^\d{5}(-\d{4})?$'),
  constraint pet_adoption_status_valid check (status in ('requested', 'under_review', 'center_contacted', 'matched', 'placed', 'cancelled'))
);

create index if not exists pet_adoption_requests_owner_idx on public.pet_adoption_requests(owner_user_id, created_at desc);
create index if not exists pet_adoption_requests_pet_idx on public.pet_adoption_requests(pet_id, created_at desc);
alter table public.pet_adoption_requests enable row level security;
grant select, insert, update on public.pet_adoption_requests to authenticated;
drop policy if exists "Members read their adoption requests" on public.pet_adoption_requests;
create policy "Members read their adoption requests" on public.pet_adoption_requests for select to authenticated using ((select auth.uid()) = owner_user_id);
drop policy if exists "Members create their adoption requests" on public.pet_adoption_requests;
create policy "Members create their adoption requests" on public.pet_adoption_requests for insert to authenticated with check (
  (select auth.uid()) = owner_user_id
  and exists (select 1 from public.pets p where p.id = pet_id and lower(p.owner_email) = lower((select auth.jwt() ->> 'email')) and p.deleted_at is null)
);
drop policy if exists "Members update their adoption requests" on public.pet_adoption_requests;
create policy "Members update their adoption requests" on public.pet_adoption_requests for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and exists (select 1 from public.pets p where p.id = pet_id and lower(p.owner_email) = lower((select auth.jwt() ->> 'email')))
);
