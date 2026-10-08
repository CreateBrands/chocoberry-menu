alter table printers add column if not exists paper_mm integer default 80;
notify pgrst, 'reload schema';
