/* Database en app-login voor docker-compose.mssql.yml (dienst db-init).
   Draait bij elke start als sa; idempotent, en mag na een fout opnieuw (de
   dienst db-init probeert het enkele keren: vlak na de eerste start is SQL
   Server soms nog bezig, wat een deadlock (1205) kan geven). sqlcmd-variabelen:
     DB             naam van de database (kennisbank)
     APPLOGIN       login en gebruiker van de app (kennisbank)
     APPWACHTWOORD  wachtwoord van die login (MSSQL_APP_PASSWORD in .env)
   Het wachtwoord in .env is de bron van waarheid: het wordt telkens opnieuw
   gezet. Het mag geen ' of " bevatten (het komt letterlijk in de SQL; de
   dienst db-init weigert zo'n wachtwoord al).

   Wat de app krijgt: tabellen maken en wijzigen (migraties, full-text-index:
   db_ddladmin), lezen en schrijven. Geen sysadmin, geen db_owner, geen rechten
   in andere databases. Hetzelfde als docs/installatie.md voor een eigen server. */
:on error exit
SET NOCOUNT ON;
USE master;
GO
-- UTF-8 en hoofdletterongevoelig, met tekens buiten het BMP (emoji) als één teken.
IF DB_ID(N'$(DB)') IS NULL
  CREATE DATABASE [$(DB)] COLLATE Latin1_General_100_CI_AS_SC_UTF8;
GO
-- Eerste inrichting, één keer: daarna zet de markering kb_ingericht een later
-- bewust gewijzigde instelling niet terug. Lukt dit deel niet (bv. een
-- deadlock vlak na de eerste start), dan doet de volgende poging het opnieuw.
IF NOT EXISTS (SELECT 1 FROM [$(DB)].sys.extended_properties WHERE class = 0 AND name = N'kb_ingericht')
BEGIN
  ALTER DATABASE [$(DB)] SET RECOVERY SIMPLE;
  -- Lezers wachten niet op schrijvers (zoals in PostgreSQL).
  ALTER DATABASE [$(DB)] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
  EXEC [$(DB)].sys.sp_addextendedproperty @name = N'kb_ingericht', @value = N'ja';
END
GO
IF SUSER_ID(N'$(APPLOGIN)') IS NULL
  CREATE LOGIN [$(APPLOGIN)] WITH PASSWORD = N'$(APPWACHTWOORD)',
    DEFAULT_DATABASE = [$(DB)], CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
ELSE
  ALTER LOGIN [$(APPLOGIN)] WITH PASSWORD = N'$(APPWACHTWOORD)';
GO
USE [$(DB)];
IF USER_ID(N'$(APPLOGIN)') IS NULL
  CREATE USER [$(APPLOGIN)] FOR LOGIN [$(APPLOGIN)] WITH DEFAULT_SCHEMA = dbo;
ELSE
  -- Na het terugzetten van een back-up (ook van een andere server) hoort de
  -- gebruiker bij een oude login-SID: opnieuw koppelen.
  ALTER USER [$(APPLOGIN)] WITH LOGIN = [$(APPLOGIN)], DEFAULT_SCHEMA = dbo;
ALTER ROLE db_ddladmin   ADD MEMBER [$(APPLOGIN)];
ALTER ROLE db_datareader ADD MEMBER [$(APPLOGIN)];
ALTER ROLE db_datawriter ADD MEMBER [$(APPLOGIN)];
GO
PRINT N'Database $(DB) en login $(APPLOGIN) zijn klaar.';
GO
