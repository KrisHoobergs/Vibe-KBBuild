/* Maakt een SQL Server-TESTdatabase helemaal leeg (alle tabellen, sleutels en
   full-text van de app), zodat migraties en tests telkens op een lege database
   starten. Draait als de testlogin, via de testscripts
   (scripts/lib/mssql-testomgeving.mts), buiten een transactie: full-text-DDL
   mag niet in een transactie. Eén batch, zonder GO.

   Weigert als de database niet kb_test*, kennisbank_test*, kb_pariteit* of
   kennisbank_pariteit* heet, of als de markering kb_testdatabase = 'ja'
   (gezet door testdatabase.sql) ontbreekt.

   Bewust geen SET NOCOUNT ON: de verbinding gaat terug naar de pool, en de
   app heeft de rijtellingen nodig (numUpdatedRows). */
IF DB_NAME() NOT LIKE N'kb[_]test%' AND DB_NAME() NOT LIKE N'kennisbank[_]test%'
   AND DB_NAME() NOT LIKE N'kb[_]pariteit%' AND DB_NAME() NOT LIKE N'kennisbank[_]pariteit%'
  THROW 50001, N'Geweigerd: dit is geen testdatabase (naam).', 1;
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties
               WHERE class = 0 AND name = N'kb_testdatabase' AND CAST(value AS nvarchar(10)) = N'ja')
  THROW 50002, N'Geweigerd: de markering kb_testdatabase ontbreekt.', 1;

DECLARE @s nvarchar(max);

-- 1. Full-text-indexen (moeten weg vóór hun catalogus en hun tabel)
SET @s = N'';
SELECT @s += N'DROP FULLTEXT INDEX ON ' + QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.' + QUOTENAME(t.name) + N'; '
FROM sys.fulltext_indexes AS fi JOIN sys.tables AS t ON t.object_id = fi.object_id;
IF @s <> N'' EXEC sys.sp_executesql @s;

-- 2. Full-text-catalogi
SET @s = N'';
SELECT @s += N'DROP FULLTEXT CATALOG ' + QUOTENAME(name) + N'; ' FROM sys.fulltext_catalogs;
IF @s <> N'' EXEC sys.sp_executesql @s;

-- 3. Alle foreign keys (dan maakt de volgorde van de tabellen niet meer uit)
SET @s = N'';
SELECT @s += N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(t.schema_id)) + N'.' + QUOTENAME(t.name)
           + N' DROP CONSTRAINT ' + QUOTENAME(fk.name) + N'; '
FROM sys.foreign_keys AS fk JOIN sys.tables AS t ON t.object_id = fk.parent_object_id;
IF @s <> N'' EXEC sys.sp_executesql @s;

-- 4. Alle tabellen, ook kb_migrations
SET @s = N'';
SELECT @s += N'DROP TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N'; '
FROM sys.tables WHERE is_ms_shipped = 0;
IF @s <> N'' EXEC sys.sp_executesql @s;

SELECT COUNT(*) AS overgebleven_tabellen FROM sys.tables WHERE is_ms_shipped = 0;
