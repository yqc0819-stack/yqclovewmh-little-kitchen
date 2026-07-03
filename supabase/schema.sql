-- 我们的小厨房：Supabase 数据结构
-- 在 Supabase Dashboard > SQL Editor 中整段执行。

create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我们的小厨房',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  role text not null check (role in ('cook', 'diner')),
  nickname text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.dishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  category text not null check (category in ('荤菜', '素菜', '汤类', '主食', '甜品')),
  description text not null default '',
  image_url text,
  emoji text not null default '🍽️',
  created_at timestamptz not null default now()
);

create table if not exists public.daily_menus (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  menu_date date not null default current_date,
  status text not null default 'open'
    check (status in ('open', 'submitted', 'seen', 'preparing', 'done')),
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (household_id, menu_date)
);

create table if not exists public.menu_items (
  menu_id uuid not null references public.daily_menus(id) on delete cascade,
  dish_id uuid not null references public.dishes(id) on delete cascade,
  primary key (menu_id, dish_id)
);

create table if not exists public.selections (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null unique references public.daily_menus(id) on delete cascade,
  selected_by uuid not null references auth.users(id) on delete cascade,
  note text not null default '',
  submitted_at timestamptz not null default now()
);

create table if not exists public.selection_items (
  selection_id uuid not null references public.selections(id) on delete cascade,
  dish_id uuid not null references public.dishes(id) on delete cascade,
  primary key (selection_id, dish_id)
);

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.profiles where user_id = auth.uid() limit 1
$$;

create or replace function public.current_household_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid() limit 1
$$;

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.dishes enable row level security;
alter table public.daily_menus enable row level security;
alter table public.menu_items enable row level security;
alter table public.selections enable row level security;
alter table public.selection_items enable row level security;

create policy "family reads household"
on public.households for select to authenticated
using (id = public.current_household_id());

create policy "family reads profiles"
on public.profiles for select to authenticated
using (household_id = public.current_household_id());

create policy "family reads dishes"
on public.dishes for select to authenticated
using (household_id = public.current_household_id());

create policy "cook manages dishes"
on public.dishes for all to authenticated
using (
  household_id = public.current_household_id()
  and public.current_household_role() = 'cook'
)
with check (
  household_id = public.current_household_id()
  and public.current_household_role() = 'cook'
);

create policy "family reads menus"
on public.daily_menus for select to authenticated
using (household_id = public.current_household_id());

create policy "cook manages menus"
on public.daily_menus for all to authenticated
using (
  household_id = public.current_household_id()
  and public.current_household_role() = 'cook'
)
with check (
  household_id = public.current_household_id()
  and public.current_household_role() = 'cook'
);

create policy "family reads menu items"
on public.menu_items for select to authenticated
using (
  exists (
    select 1 from public.daily_menus m
    where m.id = menu_id and m.household_id = public.current_household_id()
  )
);

create policy "cook manages menu items"
on public.menu_items for all to authenticated
using (
  public.current_household_role() = 'cook'
  and exists (
    select 1 from public.daily_menus m
    where m.id = menu_id and m.household_id = public.current_household_id()
  )
)
with check (
  public.current_household_role() = 'cook'
  and exists (
    select 1 from public.daily_menus m
    where m.id = menu_id and m.household_id = public.current_household_id()
  )
);

create policy "family reads selections"
on public.selections for select to authenticated
using (
  exists (
    select 1 from public.daily_menus m
    where m.id = menu_id and m.household_id = public.current_household_id()
  )
);

create policy "diner submits selection"
on public.selections for insert to authenticated
with check (
  selected_by = auth.uid()
  and public.current_household_role() = 'diner'
  and exists (
    select 1 from public.daily_menus m
    where m.id = menu_id and m.household_id = public.current_household_id()
  )
);

create policy "diner updates selection"
on public.selections for update to authenticated
using (selected_by = auth.uid() and public.current_household_role() = 'diner')
with check (selected_by = auth.uid() and public.current_household_role() = 'diner');

create policy "family reads selected dishes"
on public.selection_items for select to authenticated
using (
  exists (
    select 1
    from public.selections s
    join public.daily_menus m on m.id = s.menu_id
    where s.id = selection_id and m.household_id = public.current_household_id()
  )
);

create policy "diner manages selected dishes"
on public.selection_items for all to authenticated
using (
  public.current_household_role() = 'diner'
  and exists (
    select 1 from public.selections s
    where s.id = selection_id and s.selected_by = auth.uid()
  )
)
with check (
  public.current_household_role() = 'diner'
  and exists (
    select 1 from public.selections s
    where s.id = selection_id and s.selected_by = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('dish-images', 'dish-images', true)
on conflict (id) do update set public = true;

create policy "cook uploads dish images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'dish-images'
  and public.current_household_role() = 'cook'
  and (storage.foldername(name))[1] = public.current_household_id()::text
);

create policy "cook updates dish images"
on storage.objects for update to authenticated
using (
  bucket_id = 'dish-images'
  and public.current_household_role() = 'cook'
  and (storage.foldername(name))[1] = public.current_household_id()::text
);

create policy "cook deletes dish images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dish-images'
  and public.current_household_role() = 'cook'
  and (storage.foldername(name))[1] = public.current_household_id()::text
);

do $$
begin
  alter publication supabase_realtime add table public.dishes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.menu_items;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.daily_menus;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.selections;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.selection_items;
exception when duplicate_object then null;
end $$;
