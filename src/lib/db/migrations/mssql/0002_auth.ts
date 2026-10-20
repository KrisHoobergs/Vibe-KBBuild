import { sql } from "kysely";
import type { Migratie } from "../../migrate";

// Tabellen van de eigen login (Better Auth, zie src/lib/auth/better-auth-opties.ts).
// Kolommen, NOT NULL en standaardwaarden zijn exact die van postgres/0002_auth
// (wat Better Auth zelf genereert), maar bewust NIET de generator-uitvoer voor
// SQL Server: die geeft varchar-kolommen, een index op varchar(8000)
// (waarschuwing 1946), CURRENT_TIMESTAMP (lokale servertijd) en naamloze
// constraints. Better Auth controleert bij het opstarten alleen of tabellen en
// kolommen bestaan, niet hun exacte type; nvarchar, bit en datetime2 aanvaardt
// hij voor string, boolean en date.
//
// Geen triggers op deze tabellen: Better Auth schrijft met OUTPUT inserted.*.
export const auth: Migratie = {
  naam: "0002_auth",
  transactioneel: true,
  async up(db) {
    await sql`
      IF OBJECT_ID(N'dbo.auth_users', N'U') IS NULL
      CREATE TABLE dbo.auth_users (
        "id" nvarchar(36) NOT NULL CONSTRAINT PK_auth_users PRIMARY KEY,
        "name" nvarchar(400) NOT NULL,
        "email" nvarchar(320) NOT NULL CONSTRAINT UQ_auth_users_email UNIQUE,
        "emailVerified" bit NOT NULL,
        "image" nvarchar(max) NULL,
        "createdAt" datetime2(3) NOT NULL CONSTRAINT DF_auth_users_createdAt DEFAULT SYSUTCDATETIME(),
        "updatedAt" datetime2(3) NOT NULL CONSTRAINT DF_auth_users_updatedAt DEFAULT SYSUTCDATETIME()
      )
    `.execute(db);

    await sql`
      IF OBJECT_ID(N'dbo.auth_sessions', N'U') IS NULL
      CREATE TABLE dbo.auth_sessions (
        "id" nvarchar(36) NOT NULL CONSTRAINT PK_auth_sessions PRIMARY KEY,
        "expiresAt" datetime2(3) NOT NULL,
        "token" nvarchar(255) NOT NULL CONSTRAINT UQ_auth_sessions_token UNIQUE,
        "createdAt" datetime2(3) NOT NULL CONSTRAINT DF_auth_sessions_createdAt DEFAULT SYSUTCDATETIME(),
        "updatedAt" datetime2(3) NOT NULL,
        "ipAddress" nvarchar(max) NULL,
        "userAgent" nvarchar(max) NULL,
        "userId" nvarchar(36) NOT NULL
          CONSTRAINT FK_auth_sessions_user REFERENCES dbo.auth_users ("id") ON DELETE CASCADE
      )
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.auth_sessions') AND name = N'auth_sessions_userId_idx')
      CREATE INDEX "auth_sessions_userId_idx" ON dbo.auth_sessions ("userId")
    `.execute(db);

    await sql`
      IF OBJECT_ID(N'dbo.auth_accounts', N'U') IS NULL
      CREATE TABLE dbo.auth_accounts (
        "id" nvarchar(36) NOT NULL CONSTRAINT PK_auth_accounts PRIMARY KEY,
        "accountId" nvarchar(255) NOT NULL,
        "providerId" nvarchar(255) NOT NULL,
        "userId" nvarchar(36) NOT NULL
          CONSTRAINT FK_auth_accounts_user REFERENCES dbo.auth_users ("id") ON DELETE CASCADE,
        "accessToken" nvarchar(max) NULL,
        "refreshToken" nvarchar(max) NULL,
        "idToken" nvarchar(max) NULL,
        "accessTokenExpiresAt" datetime2(3) NULL,
        "refreshTokenExpiresAt" datetime2(3) NULL,
        "scope" nvarchar(max) NULL,
        "password" nvarchar(max) NULL,
        "createdAt" datetime2(3) NOT NULL CONSTRAINT DF_auth_accounts_createdAt DEFAULT SYSUTCDATETIME(),
        "updatedAt" datetime2(3) NOT NULL
      )
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.auth_accounts') AND name = N'auth_accounts_userId_idx')
      CREATE INDEX "auth_accounts_userId_idx" ON dbo.auth_accounts ("userId")
    `.execute(db);

    await sql`
      IF OBJECT_ID(N'dbo.auth_verifications', N'U') IS NULL
      CREATE TABLE dbo.auth_verifications (
        "id" nvarchar(36) NOT NULL CONSTRAINT PK_auth_verifications PRIMARY KEY,
        "identifier" nvarchar(450) NOT NULL,
        "value" nvarchar(max) NOT NULL,
        "expiresAt" datetime2(3) NOT NULL,
        "createdAt" datetime2(3) NOT NULL CONSTRAINT DF_auth_verifications_createdAt DEFAULT SYSUTCDATETIME(),
        "updatedAt" datetime2(3) NOT NULL CONSTRAINT DF_auth_verifications_updatedAt DEFAULT SYSUTCDATETIME()
      )
    `.execute(db);
    await sql`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.auth_verifications') AND name = N'auth_verifications_identifier_idx')
      CREATE INDEX "auth_verifications_identifier_idx" ON dbo.auth_verifications ("identifier")
    `.execute(db);

    // Elk profiel hoort bij een account; account weg = profiel (en zijn artikels) weg.
    await sql`
      IF OBJECT_ID(N'dbo.FK_profiles_auth_users', N'F') IS NULL
      ALTER TABLE dbo.profiles ADD CONSTRAINT FK_profiles_auth_users
        FOREIGN KEY ("id") REFERENCES dbo.auth_users ("id") ON DELETE CASCADE
    `.execute(db);
  },
};
