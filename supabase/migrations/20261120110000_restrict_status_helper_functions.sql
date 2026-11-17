-- Restrict the restriction-status helpers to server callers.
--
-- is_restricted(uuid, text) and is_social_restricted(uuid) were executable by signed-in users with any user id, so
-- the answer ("is this person blocked or banned?") was readable for anyone. Every caller except four RLS policies
-- runs as the service role or inside another SECURITY DEFINER function (which executes as the owner), so client
-- EXECUTE can be revoked. The four policies (friendships, friend_activity_events, nudges, team_members) run as the
-- querying user and called is_social_restricted directly; revoking would have broken them for everyone. They now
-- call policy_social_restricted(), which gives the real answer only for the caller, a friend of the caller, or a
-- member of the caller's team, and answers "restricted" (fail closed) for anyone else. Each policy already
-- required one of those relationships, so what rows are visible is unchanged.
--
-- No table, column or grant change on any table. Idempotent.

create or replace function public.policy_social_restricted(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user = (select auth.uid())
      or exists (
        select 1 from public.friendships f
        where (f.user_id = (select auth.uid()) and f.friend_id = p_user)
           or (f.user_id = p_user and f.friend_id = (select auth.uid()))
      )
      or exists (
        select 1 from public.team_members tm
        where tm.user_id = p_user and tm.team_id = (select public._my_team_id())
      )
    then public.is_social_restricted(p_user)
    else true
  end;
$$;

revoke execute on function public.policy_social_restricted(uuid) from public, anon;
grant execute on function public.policy_social_restricted(uuid) to authenticated, service_role;

alter policy fr_view_own on public.friendships
  using (
    ((select auth.uid()) = user_id)
    or (((select auth.uid()) = friend_id) and not public.policy_social_restricted(user_id))
  );

alter policy friend_activity_readable_by_friends on public.friend_activity_events
  using (
    ((select auth.uid()) = user_id)
    or (
      exists (
        select 1 from public.friendships f
        where f.user_id = (select auth.uid()) and f.friend_id = friend_activity_events.user_id and f.status = 'accepted'
      )
      and not exists (
        select 1 from public.blocked_users bu
        where (bu.blocker = (select auth.uid()) and bu.blocked = friend_activity_events.user_id)
           or (bu.blocker = friend_activity_events.user_id and bu.blocked = (select auth.uid()))
      )
      and not public.policy_social_restricted(user_id)
    )
  );

alter policy nudges_insert_to_friend on public.nudges
  with check (
    ((select auth.uid()) = sender_id)
    and exists (
      select 1 from public.friendships f
      where f.user_id = (select auth.uid()) and f.friend_id = nudges.recipient_id and f.status = 'accepted'
    )
    and not exists (
      select 1 from public.blocked_users bu
      where (bu.blocker = (select auth.uid()) and bu.blocked = nudges.recipient_id)
         or (bu.blocker = nudges.recipient_id and bu.blocked = (select auth.uid()))
    )
    and not public.policy_social_restricted((select auth.uid()))
    and not public.policy_social_restricted(recipient_id)
  );

alter policy team_members_select_own_team on public.team_members
  using (
    (team_id = (select public._my_team_id()))
    and ((user_id = (select auth.uid())) or not public.policy_social_restricted(user_id))
  );

revoke execute on function public.is_restricted(uuid, text) from public, anon, authenticated;
revoke execute on function public.is_social_restricted(uuid) from public, anon, authenticated;
grant execute on function public.is_restricted(uuid, text) to service_role;
grant execute on function public.is_social_restricted(uuid) to service_role;
