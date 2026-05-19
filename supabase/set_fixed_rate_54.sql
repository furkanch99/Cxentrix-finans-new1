-- =====================================================================
-- Force every CHF -> TRY conversion to use 1 CHF = 54 TL.
--
-- 1. Replace all exchange_rates rows with a single sentinel rate at
--    1900-01-01 so every getRateForDate() / getRateAt() call returns 54.
-- 2. Re-rate Fatih monthly salaries (chf_to_try_rate, amount_try)
--    and the transactions they reference.
-- 3. Re-rate French Team commissions: their TRY amount lives on the
--    referenced transaction row, recalculated from total_chf * 54.
-- =====================================================================

begin;

-- 1. Exchange rates
delete from public.exchange_rates;
insert into public.exchange_rates (date, chf_to_try, source)
values ('1900-01-01', 54, 'fixed');

-- 2. Fatih monthly salaries + their linked transactions
update public.fatih_monthly_salaries
   set chf_to_try_rate = 54,
       amount_try      = round(amount_chf * 54, 2);

update public.transactions t
   set amount = round(s.amount_chf * 54, 2)
  from public.fatih_monthly_salaries s
 where s.transaction_id = t.id;

-- 3. French Team commission transactions (TRY amount = total_chf * 54)
update public.transactions t
   set amount = round(c.total_chf * 54, 2)
  from public.french_team_commissions c
 where c.transaction_id = t.id;

commit;
