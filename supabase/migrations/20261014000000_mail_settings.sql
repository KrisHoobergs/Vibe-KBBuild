-- =============================================================
-- Gmail-instellingen per gebruiker, om artikels te versturen
-- vanuit het eigen Google-account (SMTP met app-wachtwoord).
--
-- Het app-wachtwoord staat versleuteld (AES-256-GCM); de sleutel
-- (MAIL_ENCRYPTION_KEY) staat alleen bij de servercode, niet in de
-- database. RLS staat aan zónder policies en anon/authenticated
-- hebben geen rechten: alleen de server (service role) kan erbij.
-- =============================================================

CREATE TABLE public.mail_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  gmail_address TEXT NOT NULL,
  app_password_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mail_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.mail_settings FROM anon, authenticated;

CREATE TRIGGER mail_settings_updated_at
  BEFORE UPDATE ON public.mail_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
