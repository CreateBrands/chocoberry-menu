-- Device licences. Every KDS screen and POS till is a kds_screens row with a
-- kind, a one-time licence code, and a device secret issued at activation.
alter table kds_screens add column if not exists kind text not null default 'kds';          -- kds | pos | kds+pos
alter table kds_screens add column if not exists licence_code text;                          -- e.g. LR-KDS-7F3K, used once
alter table kds_screens add column if not exists device_secret_hash text;                    -- sha256 of the secret the device holds
alter table kds_screens add column if not exists status text not null default 'unassigned';  -- unassigned | active | revoked
alter table kds_screens add column if not exists fingerprint text;
alter table kds_screens add column if not exists activated_at timestamptz;
alter table kds_screens add column if not exists activated_by text;
alter table kds_screens add column if not exists revoked_at timestamptz;
alter table kds_screens add column if not exists last_seen_at timestamptz;
alter table kds_screens add column if not exists app_version text;
create unique index if not exists kds_screens_licence on kds_screens(licence_code) where licence_code is not null;
-- Screens already in use keep working: they are marked active on their next load (legacy claim).
update kds_screens set status = 'active' where status = 'unassigned' and (label is not null or station is not null or printer_sn is not null or routing is not null);

-- Trace-back: which device did it.
alter table menu_orders add column if not exists device_key text;
alter table service_log add column if not exists device_key text;
alter table till_closures add column if not exists device_key text;

-- Device activity log.
create table if not exists device_events (
  id bigserial primary key,
  location_id uuid not null,
  screen_key text not null,
  event text not null,          -- activated | revoked | replaced | heartbeat_gap | version | refused
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists device_events_loc on device_events(location_id, created_at desc);
notify pgrst, 'reload schema';
