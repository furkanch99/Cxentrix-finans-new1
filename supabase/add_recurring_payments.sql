-- =====================================================================
-- Aylık tekrarlayan ödemeler (Kira, SGK, AWS, ChatGPT, vb.)
--
-- İki tablo:
--   1. recurring_payments        → ödeme tanımı (isim, tutar, ay günü)
--   2. recurring_payment_status  → her ay için ödendi/bekliyor durumu
-- =====================================================================

create table if not exists public.recurring_payments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  amount      numeric(18,2) not null,
  payment_day int not null check (payment_day between 1 and 31),
  category    text,                      -- transactions.category ile gevşek bağ
  notes       text,
  is_active   boolean not null default true,
  started_at  date,                      -- bu tarihten önceki aylar listelenmez
  ended_at    date,                      -- bu tarihten sonraki aylar listelenmez
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_recurring_active on public.recurring_payments(is_active);

create table if not exists public.recurring_payment_status (
  id           uuid primary key default gen_random_uuid(),
  recurring_id uuid not null references public.recurring_payments(id) on delete cascade,
  year         int not null,
  month        int not null check (month between 0 and 11),
  is_paid      boolean not null default false,
  paid_date    date,
  paid_amount  numeric(18,2),
  notes        text,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (recurring_id, year, month)
);

create index if not exists idx_rps_period on public.recurring_payment_status(year, month);

-- RLS — diğer tablolarla aynı şablon
alter table public.recurring_payments        enable row level security;
alter table public.recurring_payment_status  enable row level security;

drop policy if exists "read_all_recurring_payments" on public.recurring_payments;
create policy "read_all_recurring_payments" on public.recurring_payments
  for select to anon, authenticated using (true);

drop policy if exists "write_all_recurring_payments" on public.recurring_payments;
create policy "write_all_recurring_payments" on public.recurring_payments
  for all to authenticated using (true) with check (true);

drop policy if exists "read_all_recurring_payment_status" on public.recurring_payment_status;
create policy "read_all_recurring_payment_status" on public.recurring_payment_status
  for select to anon, authenticated using (true);

drop policy if exists "write_all_recurring_payment_status" on public.recurring_payment_status;
create policy "write_all_recurring_payment_status" on public.recurring_payment_status
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
