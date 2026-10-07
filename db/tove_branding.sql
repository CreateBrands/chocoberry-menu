-- Tove Coffee per-store branding (overrides the global Chocoberry settings for this store only)
insert into menu_app_settings (key, value) values
  ('theme:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', 'tove'),
  ('welcome_logo_url:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/5c1dcd11-9aee-4509-b8b3-9e2fbacdcbfb/conversions/compressed-logo-celadon-pastel-green-logo_optimized.png'),
  ('welcome_bg_url:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', 'https://apetitomenu.fra1.cdn.digitaloceanspaces.com/prod/media/d606798f-2df9-41d7-aea7-212d37b9dbaf/conversions/compressed-3840-1600-cover-tove-matcha-2jpg-banner_optimized.jpg'),
  ('welcome_eyebrow:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', 'WELCOME TO'),
  ('welcome_subtitle:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', 'Matcha. Coffee. Calm energy.'),
  ('welcome_button:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', 'Menu'),
  ('welcome_footer:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', 'Your daily coffee ritual, elevated'),
  ('welcome_layout:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', ''),
  ('hero_slides:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', '[]'),
  ('app_banner:be8de364-ff8f-5ce5-9d6f-fadbb5676e5d', 'off')
on conflict (key) do update set value = excluded.value;
