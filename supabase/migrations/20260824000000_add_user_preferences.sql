-- Persoonlijke voorkeuren per gebruiker op het profiel
ALTER TABLE public.profiles
  ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'
    CHECK (theme IN ('light', 'dark', 'system')),
  ADD COLUMN items_per_page INTEGER NOT NULL DEFAULT 20
    CHECK (items_per_page IN (10, 20, 50, 100)),
  ADD COLUMN default_sort TEXT NOT NULL DEFAULT 'updated_at'
    CHECK (default_sort IN ('updated_at', 'title'));
