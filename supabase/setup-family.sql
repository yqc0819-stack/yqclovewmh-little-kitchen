-- 我们的小厨房：新项目家庭账号绑定
-- 前提：已经运行 schema.sql 和 online-upgrade.sql，
-- 并已在 Authentication > Users 创建下面两个用户。
-- 本文件只运行一次。

begin;

with new_household as (
  insert into public.households (name)
  values ('我们的小厨房')
  returning id
)
insert into public.profiles (user_id, household_id, role, nickname)
select account.user_id, new_household.id, account.role, account.nickname
from new_household
cross join (
  values
    ('76872b0d-618a-4222-8e8b-b569003f74d1'::uuid, 'cook', '今天掌勺的人'),
    ('12dd176b-d49b-4d58-9dc0-aa75b311a3fb'::uuid, 'diner', '今天等饭的人')
) as account(user_id, role, nickname);

commit;

-- 成功后应返回两行，并且两行 household_id 完全相同。
select
  profiles.user_id,
  users.email,
  profiles.household_id,
  profiles.role,
  profiles.nickname
from public.profiles
join auth.users on users.id = profiles.user_id
where profiles.user_id in (
  '76872b0d-618a-4222-8e8b-b569003f74d1',
  '12dd176b-d49b-4d58-9dc0-aa75b311a3fb'
)
order by profiles.role;
