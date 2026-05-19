-- =====================================================================
-- Cxentrix Finans — Supabase schema
-- Run this in Supabase Dashboard -> SQL Editor (one-shot).
-- Safe to re-run: uses IF NOT EXISTS / DROP-CREATE for policies.
-- =====================================================================

-- pgcrypto is available by default on Supabase, but ensure gen_random_uuid()
create extension if not exists pgcrypto;

-- =====================================================================
-- 1. categories
-- =====================================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('income','expense')),
  created_at  timestamptz not null default now(),
  unique (name, type)
);

-- =====================================================================
-- 2. payment_types
-- =====================================================================
create table if not exists public.payment_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 3. exchange_rates  (CHF -> TRY)
-- =====================================================================
create table if not exists public.exchange_rates (
  date        date primary key,
  chf_to_try  numeric(14,4) not null,
  source      text default 'manual',
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- 4. transactions
-- =====================================================================
create table if not exists public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  type                   text not null check (type in ('income','expense')),
  date                   date not null,
  amount                 numeric(18,2) not null,
  category               text not null,
  customer               text,
  payment_type           text,
  description            text,
  installment_group_id   uuid,
  installment_no         int,
  installment_total      int,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index if not exists idx_transactions_date          on public.transactions(date);
create index if not exists idx_transactions_type          on public.transactions(type);
create index if not exists idx_transactions_category      on public.transactions(category);
create index if not exists idx_transactions_install_group on public.transactions(installment_group_id);

-- =====================================================================
-- 5. payment_status  (1-to-1 with transactions)
-- =====================================================================
create table if not exists public.payment_status (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null unique references public.transactions(id) on delete cascade,
  is_paid         boolean not null default false,
  paid_date       date,
  paid_by         uuid references auth.users(id) on delete set null,
  notes           text,
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- 6. audit_log
-- =====================================================================
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  user_email  text,
  action      text not null,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);

-- =====================================================================
-- 7. french_team_commissions
-- =====================================================================
create table if not exists public.french_team_commissions (
  id              uuid primary key default gen_random_uuid(),
  year            int  not null,
  month           int  not null check (month between 0 and 11),
  sales_count     int  not null default 0,
  retention_count int  not null default 0,
  total_chf       numeric(14,2) not null default 0,
  transaction_id  uuid references public.transactions(id) on delete set null,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (year, month)
);

-- =====================================================================
-- 8. logic_report_status
-- =====================================================================
create table if not exists public.logic_report_status (
  id          uuid primary key default gen_random_uuid(),
  year        int  not null,
  month       int  not null check (month between 0 and 11),
  status      text not null,           -- e.g. 'draft' | 'sent' | 'paid'
  total_try   numeric(18,2),
  total_chf   numeric(14,2),
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  sent_at     timestamptz,
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (year, month)
);

-- =====================================================================
-- 9. fatih_settings  (single-row config, but keep id-based for flexibility)
-- =====================================================================
create table if not exists public.fatih_settings (
  id                    uuid primary key default gen_random_uuid(),
  initial_balance_try   numeric(18,2) default 0,
  initial_balance_chf   numeric(14,2) default 0,
  initial_balance_date  date,
  monthly_salary_chf    numeric(14,2) default 4000,
  opening_balance_chf   numeric(14,2) default 0,
  updated_by            uuid references auth.users(id) on delete set null,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

-- =====================================================================
-- 10. fatih_monthly_salaries
-- =====================================================================
create table if not exists public.fatih_monthly_salaries (
  id               uuid primary key default gen_random_uuid(),
  year             int  not null,
  month            int  not null check (month between 0 and 11),
  amount_chf       numeric(14,2) not null,
  amount_try       numeric(18,2) not null,
  chf_to_try_rate  numeric(14,4) not null,
  transaction_id   uuid references public.transactions(id) on delete set null,
  accrued_by       uuid references auth.users(id) on delete set null,
  accrued_at       timestamptz not null default now(),
  unique (year, month)
);

-- =====================================================================
-- Row-Level Security
-- Permissive policy: any authenticated user can read/write.
-- Tighten later if multi-tenant rules are needed.
-- =====================================================================
do $$
declare
  t text;
  tables text[] := array[
    'categories','payment_types','exchange_rates','transactions',
    'payment_status','audit_log','french_team_commissions',
    'logic_report_status','fatih_settings','fatih_monthly_salaries'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "auth_all_%s" on public.%I;', t, t);
    execute format(
      'create policy "auth_all_%s" on public.%I
        for all to authenticated using (true) with check (true);',
      t, t
    );
  end loop;
end $$;
