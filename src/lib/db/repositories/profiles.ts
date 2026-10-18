import "server-only";
import type { Selectable } from "kysely";
import { getDb } from "@/lib/db";
import { isUniqueViolation, toIso } from "@/lib/db/dialect";
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

/**
 * Is dit het oudste account van de installatie (eigen login)? Dat account wordt
 * beheerder, net als bij de Supabase-trigger handle_new_user. Gebaseerd op
 * auth_users en niet op het aantal profielen: zo kunnen twee gelijktijdige
 * registraties niet allebei beheerder worden, en verandert een mislukt
 * profiel niets aan wie de eerste was.
 */
async function isOudsteAccount(userId: string): Promise<boolean> {
  const oudste = await getDb()
    .selectFrom("auth_users")
    .select("id")
    .orderBy("createdAt")
    .orderBy("id")
    .offset(0)
    .fetch(1)
    .executeTakeFirst();
  return oudste?.id === userId;
}

/**
 * Profiel voor een account van de eigen login. Bestaat het al (bv. twee
 * gelijktijdige aanvragen), dan gebeurt er niets.
 */
export async function createProfileForUser(input: {
  id: string;
  email: string;
  displayName: string;
}): Promise<void> {
  const db = getDb();
  if (await db.selectFrom("profiles").select("id").where("id", "=", input.id).executeTakeFirst()) return;

  const nu = new Date();
  try {
    await db
      .insertInto("profiles")
      .values({
        id: input.id,
        email: input.email,
        display_name: input.displayName.trim() || input.email.split("@")[0],
        avatar_url: null,
        is_admin: await isOudsteAccount(input.id),
        created_at: nu,
        updated_at: nu,
      })
      .execute();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

/** Zijn er al accounts in deze installatie (eigen login)? */
export async function hasAnyAccount(): Promise<boolean> {
  const telling = await getDb()
    .selectFrom("auth_users")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(telling.n) > 0;
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
