-- 我们的小厨房：家庭实时对话
-- 可以重复运行，不会删除已有消息。

create table if not exists public.household_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists household_messages_household_time_idx
on public.household_messages (household_id, created_at);

alter table public.household_messages enable row level security;

drop policy if exists "family reads household messages" on public.household_messages;
create policy "family reads household messages"
on public.household_messages for select to authenticated
using (household_id = public.current_household_id());

drop policy if exists "family sends household messages" on public.household_messages;
create policy "family sends household messages"
on public.household_messages for insert to authenticated
with check (
  household_id = public.current_household_id()
  and sender_id = auth.uid()
);

grant select, insert on public.household_messages to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.household_messages;
exception when duplicate_object then null;
end $$;
