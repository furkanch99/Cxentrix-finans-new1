-- =====================================================================
-- Maaş Planı + Avans takibi.
--
-- salary_plan: belirli bir ay için her çalışanın beklenen maaşı ve
-- ödeme durumu (tam maaşı, ödendi mi, kaç ödendi).
--
-- salary_advance: çalışana erkenden verilen avans. Hangi ayın
-- maaşından düşüleceğini (target_year, target_month) tutar. Avanslar
-- net ödemeyi hesaplamak için salary_plan'ın expected_amount'ından
-- düşülür.
-- =====================================================================

create table if not exists public.salary_plan (
  id              uuid primary key default gen_random_uuid(),
  employee_name   text not null,
  year            int  not null,
  month           int  not null check (month between 0 and 11),
  expected_amount numeric(18,2),
  is_paid         boolean not null default false,
  paid_amount     numeric(18,2),
  paid_date       date,
  notes           text,
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (employee_name, year, month)
);
create index if not exists idx_salary_plan_period on public.salary_plan(year, month);

create table if not exists public.salary_advance (
  id            uuid primary key default gen_random_uuid(),
  employee_name text not null,
  amount        numeric(18,2) not null,
  advance_date  date not null,
  target_year   int  not null,
  target_month  int  not null check (target_month between 0 and 11),
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_advance_target on public.salary_advance(target_year, target_month);
create index if not exists idx_advance_employee on public.salary_advance(employee_name);

-- RLS
alter table public.salary_plan    enable row level security;
alter table public.salary_advance enable row level security;

drop policy if exists "read_all_salary_plan" on public.salary_plan;
create policy "read_all_salary_plan" on public.salary_plan
  for select to anon, authenticated using (true);
drop policy if exists "write_all_salary_plan" on public.salary_plan;
create policy "write_all_salary_plan" on public.salary_plan
  for all to authenticated using (true) with check (true);

drop policy if exists "read_all_salary_advance" on public.salary_advance;
create policy "read_all_salary_advance" on public.salary_advance
  for select to anon, authenticated using (true);
drop policy if exists "write_all_salary_advance" on public.salary_advance;
create policy "write_all_salary_advance" on public.salary_advance
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
