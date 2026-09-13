-- Recurring check-ins stopped the moment a client did one.
--
-- setTaskComplete marks the task done and then inserts the next occurrence,
-- carrying the original trainer_id. The client's policies are:
--
--   client_tasks: client read    (select)
--   client_tasks: client complete (update)
--
-- There is no insert. So when the client ticked the box, the update succeeded,
-- the insert was refused, and the refusal went unchecked - the series simply
-- ended. It worked when the coach ticked it, which is why it was never
-- obvious: it failed only for the one person expected to do it.
--
-- catchUpRecurring did not repair it either. That only considers tasks still
-- unfinished, and this one is finished; its successor is the thing missing.
--
-- Completion is therefore one privileged step: mark it done and lay down the
-- next occurrence together, with rights the client does not have and cannot
-- borrow for anything else. The function is the only way in, it checks the
-- caller is a party to the task, and it writes only what the series says.
create or replace function public.complete_task(p_task_id uuid, p_complete boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t       public.client_tasks%rowtype;
  v_next  date;
  v_new   uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into t from public.client_tasks where id = p_task_id;
  if not found then
    raise exception 'no such task';
  end if;

  -- The client it belongs to, or their coach. Nobody else, and note this is
  -- checked here rather than trusted from the caller - the whole point of the
  -- function is that it runs with rights the caller hasn't got.
  if not (t.client_id = auth.uid() or t.trainer_id = auth.uid()) then
    raise exception 'not your task';
  end if;

  update public.client_tasks
     set completed_at = case when p_complete then now() else null end
   where id = p_task_id;

  if not p_complete then return null; end if;
  if t.recurrence is null or t.recurrence = 'none' or t.recur_spawned then return null; end if;

  -- Month-end, honestly. Adding a month to 31 January in Postgres gives
  -- 28 February rather than spilling into March, which is what someone
  -- means by "monthly" - so the interval does the work rather than a
  -- day-arithmetic rule that has to guess.
  v_next := case t.recurrence
    when 'daily'   then coalesce(t.due_date, current_date) + 1
    when 'weekly'  then coalesce(t.due_date, current_date) + 7
    when 'monthly' then (coalesce(t.due_date, current_date) + interval '1 month')::date
  end;
  if v_next is null then return null; end if;

  -- Claim the spawn first. Two devices ticking the same task at once would
  -- otherwise both see recur_spawned false and both insert, and a client facing
  -- two identical check-ins is worse than facing none.
  update public.client_tasks set recur_spawned = true
   where id = p_task_id and recur_spawned = false;
  if not found then return null; end if;

  insert into public.client_tasks
    (client_id, trainer_id, title, kind, form_id, icon, due_date, recurrence,
     notify_on_assign, remind)
  values
    (t.client_id, t.trainer_id, t.title, t.kind, t.form_id, t.icon, v_next, t.recurrence,
     coalesce(t.notify_on_assign, true), coalesce(t.remind, 'chase'))
  returning id into v_new;

  return v_new;
end;
$$;

revoke all on function public.complete_task(uuid, boolean) from public, anon;
grant execute on function public.complete_task(uuid, boolean) to authenticated;

-- Repair what has already been lost: every recurring task that was completed
-- but never spawned its successor. Run once, here, rather than asking the app
-- to notice - those series have been silently dead for as long as the client
-- has been ticking them off.
do $$
declare r record; v_next date;
begin
  for r in
    select * from public.client_tasks
     where recurrence is not null and recurrence <> 'none'
       and recur_spawned = false and completed_at is not null
  loop
    v_next := case r.recurrence
      when 'daily'   then coalesce(r.due_date, current_date) + 1
      when 'weekly'  then coalesce(r.due_date, current_date) + 7
      when 'monthly' then (coalesce(r.due_date, current_date) + interval '1 month')::date
    end;
    if v_next is null then continue; end if;
    -- Don't resurrect a series into the distant past; bring it to the next
    -- occurrence that is still ahead of today.
    while v_next < current_date loop
      v_next := case r.recurrence
        when 'daily'   then v_next + 1
        when 'weekly'  then v_next + 7
        when 'monthly' then (v_next + interval '1 month')::date
      end;
    end loop;
    -- Only if the series really has no later occurrence already.
    if exists (select 1 from public.client_tasks x
                where x.client_id = r.client_id and x.title = r.title
                  and x.recurrence = r.recurrence and x.id <> r.id
                  and coalesce(x.due_date, current_date) > coalesce(r.due_date, current_date)) then
      update public.client_tasks set recur_spawned = true where id = r.id;
      continue;
    end if;
    update public.client_tasks set recur_spawned = true where id = r.id;
    insert into public.client_tasks
      (client_id, trainer_id, title, kind, form_id, icon, due_date, recurrence, notify_on_assign, remind)
    values
      (r.client_id, r.trainer_id, r.title, r.kind, r.form_id, r.icon, v_next, r.recurrence,
       coalesce(r.notify_on_assign, true), coalesce(r.remind, 'chase'));
  end loop;
end $$;
