"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updatePreferences } from "@/actions/preferences";
import {
  ITEMS_PER_PAGE_OPTIONS,
  THEME_LABELS,
  ARTICLE_SORT_LABELS,
} from "@/lib/constants";
import type { ArticleSort, Profile, Theme } from "@/types";

interface PreferencesFormProps {
  profile: Profile;
}

export function PreferencesForm({ profile }: PreferencesFormProps) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();

  const [theme, setThemeValue] = useState<Theme>(profile.theme);
  const [itemsPerPage, setItemsPerPage] = useState(profile.items_per_page);
  const [defaultSort, setDefaultSort] = useState<ArticleSort>(
    profile.default_sort
  );

  // Thema meteen toepassen zodat de keuze zichtbaar is vóór het opslaan.
  function handleThemeChange(value: string) {
    const next = value as Theme;
    setThemeValue(next);
    setTheme(next);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updatePreferences({
        theme,
        items_per_page: itemsPerPage,
        default_sort: defaultSort,
      });

      if (result.success) {
        toast.success("Voorkeuren opgeslagen");
        router.refresh();
      } else {
        toast.error(result.error ?? "Fout bij opslaan");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voorkeuren</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="theme">Thema</Label>
          <Select value={theme} onValueChange={handleThemeChange}>
            <SelectTrigger id="theme" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(THEME_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Kies &quot;Systeem&quot; om de instelling van je apparaat te volgen.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="itemsPerPage">Artikelen per pagina</Label>
          <Select
            value={String(itemsPerPage)}
            onValueChange={(value) => setItemsPerPage(Number(value))}
          >
            <SelectTrigger id="itemsPerPage" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="defaultSort">Standaard sortering</Label>
          <Select
            value={defaultSort}
            onValueChange={(value) => setDefaultSort(value as ArticleSort)}
          >
            <SelectTrigger id="defaultSort" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ARTICLE_SORT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Vastgepinde artikelen staan altijd bovenaan.
          </p>
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Opslaan..." : "Opslaan"}
        </Button>
      </CardContent>
    </Card>
  );
}
