import "server-only";
import type { Selectable } from "kysely";
import { getDb } from "@/lib/db";
import { toIso } from "@/lib/db/dialect";
import type { ProfilesTable } from "@/lib/db/schema";
import type { ArticleSort, Profile, Theme } from "@/types";

const KOLOMMEN = [
  "id",
  "email",
  "display_name",
  "avatar_url",
  "is_admin",
  "theme",
  "items_per_page",
  "default_sort",
  "created_at",
  "updated_at",
] as const;

export function naarProfile(rij: Selectable<ProfilesTable>): Profile {
  return {
    id: rij.id,
    email: rij.email,
    display_name: rij.display_name,
    avatar_url: rij.avatar_url,
    is_admin: Boolean(rij.is_admin),
    theme: rij.theme as Theme,
    items_per_page: Number(rij.items_per_page),
    default_sort: rij.default_sort as ArticleSort,
    created_at: toIso(rij.created_at),
    updated_at: toIso(rij.updated_at),
  };
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const rij = await getDb()
    .selectFrom("profiles")
    .select(KOLOMMEN)
    .where("id", "=", id)
    .executeTakeFirst();
  return rij ? naarProfile(rij) : null;
}

export async function profileExistsWithEmail(email: string): Promise<boolean> {
  const rij = await getDb()
    .selectFrom("profiles")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();
  return !!rij;
}

export async function listProfiles(): Promise<Profile[]> {
  const rijen = await getDb()
    .selectFrom("profiles")
    .select(KOLOMMEN)
    .orderBy("created_at", "desc")
    .orderBy("id")
    .execute();
  return rijen.map(naarProfile);
}

export async function updateProfileFields(
  id: string,
  velden: Partial<{
    display_name: string;
    avatar_url: string | null;
    theme: Theme;
    items_per_page: number;
    default_sort: ArticleSort;
  }>
): Promise<void> {
  await getDb()
    .updateTable("profiles")
    .set({ ...velden, updated_at: new Date() })
    .where("id", "=", id)
    .execute();
}
