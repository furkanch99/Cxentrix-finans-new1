-- =====================================================================
-- Tuğba Karakaş aylık maaşları tablosu.
--
-- Bu maaşlar Fatih'in cari hesabından (hakedişinden) düşülür — yani
-- şirketin Fatih'e borcunu azaltır. transactions tablosuna yansımaz;
-- sadece Fatih hesap bakiyesinde görünür.
-- =====================================================================
create table if not exists public.tugba_monthly_salaries (
  id               uuid primary key default gen_random_uuid(),
  year             int  not null,
  month            int  not null check (month between 0 and 11),
  amount_chf       numeric(14,2) not null,
  amount_try       numeric(18,2) not null,
  chf_to_try_rate  numeric(14,4) not null,
  notes            text,
  accrued_by       uuid references auth.users(id) on delete set null,
  accrued_at       timestamptz not null default now(),
  unique (year, month)
);

-- RLS politikası — diğer tablolarla aynı şablon (read public / write authenticated)
alter table public.tugba_monthly_salaries enable row level security;

drop policy if exists "read_all_tugba_monthly_salaries" on public.tugba_monthly_salaries;
create policy "read_all_tugba_monthly_salaries" on public.tugba_monthly_salaries
  for select to anon, authenticated using (true);

drop policy if exists "write_all_tugba_monthly_salaries" on public.tugba_monthly_salaries;
create policy "write_all_tugba_monthly_salaries" on public.tugba_monthly_salaries
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
