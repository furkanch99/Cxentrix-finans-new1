-- =====================================================================
-- recurring_payments: amount alanını opsiyonel yap + 4 sabit kalemi
-- seed et. Bu kalemler "hatırlatıcı" amaçlı — Kira, Aidat, SGK ve
-- Kredi Kartı. Diğer abonelikler (ChatGPT, AWS, vs.) bu listede YOK.
-- =====================================================================

-- Amount artık opsiyonel: kredi kartı gibi tutarı değişen kalemler
-- için zorunlu olmamalı.
alter table public.recurring_payments
  alter column amount drop not null;

-- 4 sabit kalemi seed et. on conflict do nothing → tekrar çalışırsa
-- mevcut kayıtları bozmaz.
insert into public.recurring_payments (name, amount, payment_day, category, notes)
values
  ('Kira',                 null, 1,  'Kira Giderleri',    'Aylık ofis kirası'),
  ('Aidat',                null, 1,  'Aidat',             'Aylık aidat'),
  ('SGK',                  null, 28, 'SGK',               'Aylık SGK primi'),
  ('Kredi Kartı Ödemesi',  null, 15, 'Kredi Kartı',       'Aylık kredi kartı ödemesi (tutar her ay değişir)')
on conflict do nothing;

select id, name, payment_day, category from public.recurring_payments order by payment_day;
