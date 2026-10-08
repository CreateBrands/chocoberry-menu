-- Device (USB) printers: queued ESC/POS bytes the till/KDS prints over WebUSB.
alter table print_jobs add column if not exists content_hex text;
alter table print_jobs add column if not exists trade_no text;
alter table printers add column if not exists notes text;
create index if not exists print_jobs_queue on print_jobs(printer_sn, status) where status = 'queued';
notify pgrst, 'reload schema';
