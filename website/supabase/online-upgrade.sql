-- 如果你已经运行过旧版 schema.sql，请再运行本文件一次。
-- 它补充浏览器客户端权限与今日菜单明细的实时同步。

grant usage on schema public to authenticated;
grant select on public.households to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.dishes to authenticated;
grant select, insert, update, delete on public.daily_menus to authenticated;
grant select, insert, update, delete on public.menu_items to authenticated;
grant select, insert, update, delete on public.selections to authenticated;
grant select, insert, update, delete on public.selection_items to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.menu_items;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.dishes;
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
