create table if not exists public.vet_record_requests (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  clinic_name text not null,
  clinic_phone text,
  clinic_website text,
  clinic_source_id text,
  status text not null default 'pending_clinic_contact',
  requested_at timestamptz not null default now(),
  received_at timestamptz,
  imported_at timestamptz,
  notes text,
  constraint vet_record_request_status_valid check (status in ('pending_clinic_contact','clinic_contacted','authorization_required','records_received','imported','unavailable','cancelled'))
);

create index if not exists vet_record_requests_owner_idx on public.vet_record_requests(owner_user_id, requested_at desc);
create index if not exists vet_record_requests_pet_idx on public.vet_record_requests(pet_id, requested_at desc);
alter table public.vet_record_requests enable row level security;
grant select, insert, update on public.vet_record_requests to authenticated;
drop policy if exists "Members read their vet record requests" on public.vet_record_requests;
create policy "Members read their vet record requests" on public.vet_record_requests for select to authenticated using ((select auth.uid()) = owner_user_id);
drop policy if exists "Members create their vet record requests" on public.vet_record_requests;
create policy "Members create their vet record requests" on public.vet_record_requests for insert to authenticated with check (
  (select auth.uid()) = owner_user_id
  and exists (select 1 from public.pets p where p.id = pet_id and lower(p.owner_email) = lower(((select auth.jwt()) ->> 'email')) and p.deleted_at is null)
);
drop policy if exists "Members update their vet record requests" on public.vet_record_requests;
create policy "Members update their vet record requests" on public.vet_record_requests for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);
