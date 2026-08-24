"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import type { Theme } from "@/types";

interface ThemeSyncProps {
  theme: Theme;
}

/**
 * Past het thema uit het profiel toe, zodat de voorkeur op elk apparaat geldt.
 * next-themes bewaart de laatste keuze lokaal; deze sync laat de database winnen.
 */
export function ThemeSync({ theme }: ThemeSyncProps) {
  const { theme: current, setTheme } = useTheme();

  useEffect(() => {
    if (current !== theme) {
      setTheme(theme);
    }
    // Alleen reageren op een gewijzigde profielvoorkeur, niet op lokale wissels
    // via de topbar-toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return null;
}
