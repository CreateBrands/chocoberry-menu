-- A printer can be tied to the device that placed the order (e.g. a handheld printing only its own tickets).
alter table printers add column if not exists source_screen_key text;
notify pgrst, 'reload schema';
