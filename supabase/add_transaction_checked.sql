-- =====================================================================
-- transactions tablosuna "checked" (kontrol edildi) bayrağı eklenir.
-- Kullanıcının her işlem için görsel olarak işaretleyebileceği basit
-- bir tık alanı. Varsayılan false.
-- =====================================================================
alter table public.transactions
  add column if not exists checked boolean not null default false;

notify pgrst, 'reload schema';
