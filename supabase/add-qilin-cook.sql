-- 添加第二位掌勺人：启林大厨
-- 可以重复运行，不会创建重复成员。

insert into public.profiles (user_id, household_id, role, nickname)
select
  '81e7d694-5839-471f-9ac1-64f644cd8dba'::uuid,
  existing_cook.household_id,
  'cook',
  '启林大厨'
from public.profiles existing_cook
where existing_cook.user_id = '76872b0d-618a-4222-8e8b-b569003f74d1'::uuid
on conflict (user_id) do update
set
  household_id = excluded.household_id,
  role = excluded.role,
  nickname = excluded.nickname;

-- 成功后应返回一行，role 为 cook，昵称为“启林大厨”。
select
  profiles.user_id,
  users.email,
  profiles.household_id,
  profiles.role,
  profiles.nickname
from public.profiles
join auth.users on users.id = profiles.user_id
where profiles.user_id = '81e7d694-5839-471f-9ac1-64f644cd8dba'::uuid;
