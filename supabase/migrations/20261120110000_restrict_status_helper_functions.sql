-- Restrict the restriction-status helpers to server callers.
--
-- is_restricted(uuid, text) and is_social_restricted(uuid) were executable by signed-in users with any user id, so
-- the answer ("is this person blocked or banned?") was readable for anyone. Every caller except one runs as the
-- service role or inside another SECURITY DEFINER function (which executes as the owner), so client EXECUTE can be
-- revoked. The one exception is the friendships SELECT policy, which runs as the querying user and called
-- is_social_restricted directly; revoking would have broken the friends list for everyone. That policy now calls
-- friendship_row_visible(), which answers only for a person who has the caller as a friend.
--
-- No table, column or grant change on any table. Idempotent.

create or replace function public.friendship_row_visible(_user_id uuid, _friend_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = _user_id
      or ((select auth.uid()) = _friend_id
          and exists (
            select 1 from public.friendships f
            where f.user_id = _user_id and f.friend_id = _friend_id
          )
          and not public.is_social_restricted(_user_id));
$$;

revoke execute on function public.friendship_row_visible(uuid, uuid) from public, anon;
grant execute on function public.friendship_row_visible(uuid, uuid) to authenticated, service_role;

alter policy fr_view_own on public.friendships
  using (public.friendship_row_visible(user_id, friend_id));

revoke execute on function public.is_restricted(uuid, text) from public, anon, authenticated;
revoke execute on function public.is_social_restricted(uuid) from public, anon, authenticated;
grant execute on function public.is_restricted(uuid, text) to service_role;
grant execute on function public.is_social_restricted(uuid) to service_role;
