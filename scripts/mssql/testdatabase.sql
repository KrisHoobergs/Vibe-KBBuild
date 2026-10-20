/* Kennisbank: een SQL Server-TESTdatabase en een testlogin met minimale rechten,
   voor de mssql-testscripts (npm run db:test:migraties:mssql, …).

   Uitvoeren als beheerder (sysadmin). Raakt geen andere databases of logins.
   Opnieuw uitvoeren mag (idempotent; zet het wachtwoord opnieuw).

   Met sqlcmd (wachtwoord nooit in een bestand of in git):
     sqlcmd -S <server>[,<poort>] -U <beheerder> -C -b -i testdatabase.sql ^
            -v TESTDATABASE=kb_test TESTLOGIN=kb_test_login TESTWACHTWOORD="<lang wachtwoord>" ^
               COLLATIE=Latin1_General_100_CI_AS_SC_UTF8 RCSI=ON

   In SSMS: menu Query -> SQLCMD Mode aanzetten en bovenaan zelf toevoegen:
     :setvar TESTDATABASE kb_test
     :setvar TESTLOGIN kb_test_login
     :setvar TESTWACHTWOORD "<lang wachtwoord>"
     :setvar COLLATIE Latin1_General_100_CI_AS_SC_UTF8
     :setvar RCSI ON

   TESTDATABASE: de naam MOET beginnen met kb_test, kennisbank_test, kb_pariteit
                 of kennisbank_pariteit; de testscripts weigeren elke andere naam.
                 Voor een tweede database (bv. kb_pariteit): nog eens uitvoeren.
   COLLATIE:     Latin1_General_100_CI_AS_SC_UTF8 vanaf SQL Server 2019,
                 Latin1_General_100_CI_AS_SC op 2016/2017.
   Wachtwoord:   minstens 3 van hoofdletter / kleine letter / cijfer / teken,
                 en geen ' of " (komt letterlijk in de SQL terecht).

   Rechten van de testlogin = wat de app later ook krijgt: tabellen maken en
   wijzigen (migraties, full-text), lezen en schrijven. Geen sysadmin, geen
   db_owner, geen rechten in andere databases.

   MARKERING: de testscripts maken een database alleen leeg als ze de
   eigenschap kb_testdatabase = 'ja' heeft. Die zet alleen dit script (stap 4).
   Bestaat de testdatabase al (door IT aangemaakt) en ben je er db_owner van?
   Voer dan in SSMS alleen stap 4 uit, in die database:
     IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE class = 0 AND name = N'kb_testdatabase')
       EXEC sys.sp_addextendedproperty @name = N'kb_testdatabase', @value = N'ja';
   Zet die markering NOOIT op een database met echte gegevens. */
:on error exit
SET NOCOUNT ON;

-- 1. Alleen een naam van een testdatabase
IF N'$(TESTDATABASE)' NOT LIKE N'kb[_]test%' AND N'$(TESTDATABASE)' NOT LIKE N'kennisbank[_]test%'
   AND N'$(TESTDATABASE)' NOT LIKE N'kb[_]pariteit%' AND N'$(TESTDATABASE)' NOT LIKE N'kennisbank[_]pariteit%'
  THROW 50001, N'Geweigerd: de naam van een testdatabase begint met kb_test, kennisbank_test, kb_pariteit of kennisbank_pariteit.', 1;
GO

-- 2. Database
USE master;
IF DB_ID(N'$(TESTDATABASE)') IS NULL
  CREATE DATABASE [$(TESTDATABASE)] COLLATE $(COLLATIE);
GO
ALTER DATABASE [$(TESTDATABASE)] SET RECOVERY SIMPLE;
IF (SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = N'$(TESTDATABASE)')
   <> CASE N'$(RCSI)' WHEN N'ON' THEN 1 ELSE 0 END
  ALTER DATABASE [$(TESTDATABASE)] SET READ_COMMITTED_SNAPSHOT $(RCSI) WITH ROLLBACK IMMEDIATE;
GO

-- 3. Login en gebruiker met minimale rechten
IF SUSER_ID(N'$(TESTLOGIN)') IS NULL
  CREATE LOGIN [$(TESTLOGIN)] WITH PASSWORD = N'$(TESTWACHTWOORD)',
    DEFAULT_DATABASE = [$(TESTDATABASE)], CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
ELSE
  ALTER LOGIN [$(TESTLOGIN)] WITH PASSWORD = N'$(TESTWACHTWOORD)';
GO
USE [$(TESTDATABASE)];
IF USER_ID(N'$(TESTLOGIN)') IS NULL
  CREATE USER [$(TESTLOGIN)] FOR LOGIN [$(TESTLOGIN)] WITH DEFAULT_SCHEMA = dbo;
ALTER ROLE db_ddladmin   ADD MEMBER [$(TESTLOGIN)];
ALTER ROLE db_datareader ADD MEMBER [$(TESTLOGIN)];
ALTER ROLE db_datawriter ADD MEMBER [$(TESTLOGIN)];
GRANT SHOWPLAN TO [$(TESTLOGIN)];          -- voor de plancontrole (indexgebruik)
GO

-- 4. Markering: de testscripts mogen ALLEEN een database met deze eigenschap leegmaken.
USE [$(TESTDATABASE)];
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE class = 0 AND name = N'kb_testdatabase')
  EXEC sys.sp_addextendedproperty @name = N'kb_testdatabase', @value = N'ja';
GO

USE master;
SELECT name, collation_name, compatibility_level, is_read_committed_snapshot_on, recovery_model_desc
FROM sys.databases WHERE name = N'$(TESTDATABASE)';
SELECT name, is_disabled, default_database_name FROM sys.server_principals WHERE name = N'$(TESTLOGIN)';
GO
