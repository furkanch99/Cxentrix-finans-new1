-- =====================================================================
-- "Maaş" kategorisini ekle (gider tipi).
-- Salaries görünümünde otomatik filtreleme için kullanılır.
-- =====================================================================
insert into public.categories (name, type)
values ('Maaş', 'expense')
on conflict (name, type) do nothing;

select name, type from public.categories where name = 'Maaş';
