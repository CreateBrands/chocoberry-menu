-- Store music (Admin → Music): a public storage bucket for the audio files.
-- Library, playlists and schedules live in menu_app_settings (see src/music.js).
-- Run once in the Supabase SQL editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music', 'music', true, 52428800,
        array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Admin uploads with the public key, the same way menu photos are uploaded.
-- Read is public (players stream and cache the files). No delete or update
-- policy: removing a track from the library leaves the file, so nothing can
-- be deleted with the public key.
drop policy if exists music_upload on storage.objects;
create policy music_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'music');
drop policy if exists music_read on storage.objects;
create policy music_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'music');
