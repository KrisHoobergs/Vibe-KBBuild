import { sql } from "kysely";
import type { Migratie } from "../../migrate";

// Tabellen van de eigen login (Better Auth, zie src/lib/auth/better-auth-opties.ts).
// Precies wat Better Auth 1.7 zelf genereert voor die instellingen (getMigrations),
// zodat zijn schemacontrole bij het opstarten slaagt. Kolomnamen in camelCase.
export const auth: Migratie = {
  naam: "0002_auth",
  transactioneel: true,
  async up(db) {
    await sql`
      CREATE TABLE IF NOT EXISTS "auth_users" (
        "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
        "name" text NOT NULL,
        "email" text NOT NULL UNIQUE,
        "emailVerified" boolean NOT NULL,
        "image" text,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `.execute(db);
    await sql`
      CREATE TABLE IF NOT EXISTS "auth_sessions" (
        "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
        "expiresAt" timestamptz NOT NULL,
        "token" text NOT NULL UNIQUE,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        "ipAddress" text,
        "userAgent" text,
        "userId" uuid NOT NULL REFERENCES "auth_users" ("id") ON DELETE CASCADE
      )
    `.execute(db);
    await sql`
      CREATE TABLE IF NOT EXISTS "auth_accounts" (
        "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
        "accountId" text NOT NULL,
        "providerId" text NOT NULL,
        "userId" uuid NOT NULL REFERENCES "auth_users" ("id") ON DELETE CASCADE,
        "accessToken" text,
        "refreshToken" text,
        "idToken" text,
        "accessTokenExpiresAt" timestamptz,
        "refreshTokenExpiresAt" timestamptz,
        "scope" text,
        "password" text,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz NOT NULL
      )
    `.execute(db);
    await sql`
      CREATE TABLE IF NOT EXISTS "auth_verifications" (
        "id" uuid DEFAULT pg_catalog.gen_random_uuid() NOT NULL PRIMARY KEY,
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS "auth_sessions_userId_idx" ON "auth_sessions" ("userId")`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS "auth_accounts_userId_idx" ON "auth_accounts" ("userId")`.execute(db);
    await sql`CREATE INDEX IF NOT EXISTS "auth_verifications_identifier_idx" ON "auth_verifications" ("identifier")`.execute(db);

    // Elk profiel hoort bij een account; account weg = profiel (en zijn artikels) weg.
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_id_auth_users_fkey') THEN
          ALTER TABLE profiles
            ADD CONSTRAINT profiles_id_auth_users_fkey
            FOREIGN KEY (id) REFERENCES auth_users(id) ON DELETE CASCADE;
        END IF;
      END $$
    `.execute(db);
  },
};
