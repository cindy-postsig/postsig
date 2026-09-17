insert into inv_stages (code, display_name, sort_order)
select 'series_f', 'Series F', 11
where not exists (select 1 from inv_stages where code = 'series_f');

insert into inv_stages (code, display_name, sort_order)
select 'series_g', 'Series G', 12
where not exists (select 1 from inv_stages where code = 'series_g');