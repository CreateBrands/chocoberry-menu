-- Brand scoping: bands carry a brand; every unassigned store/menu/band belongs to Chocoberry.
alter table menu_price_bands add column if not exists brand_id uuid references menu_brands(id);
update menu_locations set brand_id = '44fad7e0-3080-4f7f-a497-c7191c3dbfe9' where brand_id is null;
update menu_menus set brand_id = '44fad7e0-3080-4f7f-a497-c7191c3dbfe9' where brand_id is null;
update menu_modifier_groups set brand_id = '44fad7e0-3080-4f7f-a497-c7191c3dbfe9' where brand_id is null;
update menu_price_bands set brand_id = '44fad7e0-3080-4f7f-a497-c7191c3dbfe9' where brand_id is null and id <> '83de90db-22e6-5d8c-9689-5e48d58ce871';
update menu_price_bands set brand_id = '8526aaeb-0d7a-5aba-89d8-5388f0a0edb5' where id = '83de90db-22e6-5d8c-9689-5e48d58ce871';
notify pgrst, 'reload schema';
