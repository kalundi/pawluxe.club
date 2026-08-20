drop policy if exists "Members create their adoption requests" on public.pet_adoption_requests;
create policy "Members create their adoption requests" on public.pet_adoption_requests for insert to authenticated with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.pets p
    where p.id = pet_id
      and lower(p.owner_email) = lower(((select auth.jwt()) ->> 'email'))
      and p.deleted_at is null
  )
);

drop policy if exists "Members update their adoption requests" on public.pet_adoption_requests;
create policy "Members update their adoption requests" on public.pet_adoption_requests for update to authenticated
using ((select auth.uid()) = owner_user_id)
with check (
  (select auth.uid()) = owner_user_id
  and exists (
    select 1 from public.pets p
    where p.id = pet_id
      and lower(p.owner_email) = lower(((select auth.jwt()) ->> 'email'))
  )
);
