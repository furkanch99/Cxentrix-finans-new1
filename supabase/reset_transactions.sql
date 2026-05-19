-- =====================================================================
-- Reset transactions table — preserving Fatih-linked records:
--   * fatih_settings           (untouched)
--   * fatih_monthly_salaries   (untouched, and their linked transactions kept)
--   * french_team_commissions  (untouched, and their linked transactions kept)
--
-- Categories and payment_types are also preserved.
-- =====================================================================

begin;

-- Quick visibility before
select 'before_total_transactions' as label, count(*) as rows from public.transactions;

-- Delete everything in transactions that is NOT referenced by Fatih salary
-- or French Team commission rows.
delete from public.transactions
where id not in (
  select transaction_id from public.fatih_monthly_salaries where transaction_id is not null
  union
  select transaction_id from public.french_team_commissions where transaction_id is not null
);

-- Also clear payment_status rows that referenced now-deleted transactions
-- (these were cascade-deleted automatically but make it explicit).

select 'after_total_transactions'         as label, count(*) as rows from public.transactions
union all
select 'preserved_salary_linked'          as label, count(*) from public.transactions t
  where exists (select 1 from public.fatih_monthly_salaries s where s.transaction_id = t.id)
union all
select 'preserved_commission_linked'      as label, count(*) from public.transactions t
  where exists (select 1 from public.french_team_commissions c where c.transaction_id = t.id);

commit;
