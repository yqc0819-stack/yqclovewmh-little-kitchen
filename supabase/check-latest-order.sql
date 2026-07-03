-- 检查今天的菜单和点餐结果是否已写入云端。
-- 仅用于排查，不会修改任何数据。

select
  menus.menu_date,
  menus.status,
  selections.submitted_at,
  users.email as selected_by,
  selections.note,
  array_remove(array_agg(dishes.name order by dishes.name), null) as selected_dishes
from public.daily_menus menus
left join public.selections selections on selections.menu_id = menus.id
left join auth.users users on users.id = selections.selected_by
left join public.selection_items selected_items on selected_items.selection_id = selections.id
left join public.dishes dishes on dishes.id = selected_items.dish_id
where menus.household_id = (
  select household_id
  from public.profiles
  where user_id = '76872b0d-618a-4222-8e8b-b569003f74d1'
)
and menus.menu_date = current_date
group by
  menus.menu_date,
  menus.status,
  selections.submitted_at,
  users.email,
  selections.note
order by selections.submitted_at desc nulls last;
