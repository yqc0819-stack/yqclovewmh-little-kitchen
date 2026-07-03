-- 我们的小厨房：补充一组家常菜
-- 可重复执行；同一家庭已有同名菜品时不会重复添加。

with family as (
  select household_id
  from public.profiles
  where user_id = '76872b0d-618a-4222-8e8b-b569003f74d1'
),
sample(name, category, description, emoji) as (
  values
    ('番茄炒蛋', '素菜', '酸甜软嫩，拌米饭特别香', '🍳'),
    ('可乐鸡翅', '荤菜', '甜咸入味，一口一个很满足', '🍗'),
    ('土豆炖牛肉', '荤菜', '软烂浓香，汤汁也舍不得剩', '🥩'),
    ('蒜蓉西兰花', '素菜', '清爽脆嫩，蒜香刚刚好', '🥦'),
    ('冬瓜丸子汤', '汤类', '清清爽爽的一碗暖汤', '🍲'),
    ('紫菜蛋花汤', '汤类', '十分钟就能端上桌的家常汤', '🥣'),
    ('葱油拌面', '主食', '葱香浓郁，简单又管饱', '🍜'),
    ('红糖小圆子', '甜品', '软糯香甜，饭后来一点', '🍡')
)
insert into public.dishes (household_id, name, category, description, emoji)
select family.household_id, sample.name, sample.category, sample.description, sample.emoji
from family
cross join sample
where not exists (
  select 1
  from public.dishes existing
  where existing.household_id = family.household_id
    and existing.name = sample.name
);

select name, category, description, emoji, image_url
from public.dishes
where household_id = (
  select household_id
  from public.profiles
  where user_id = '76872b0d-618a-4222-8e8b-b569003f74d1'
)
order by created_at;
