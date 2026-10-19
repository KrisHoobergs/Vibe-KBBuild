/* Kennisbank: inventaris van een SQL Server. ALLEEN LEZEN.

   Beantwoordt de vragen vóór een installatie op SQL Server: versie en editie,
   Full-Text Search (met Nederlands), NOCOUNT, collaties, netwerk en TLS.

   Uitvoeren als beheerder (sysadmin), in SSMS / Azure Data Studio, of:
     sqlcmd -S <server>[,<poort>] -U <beheerder> -C -i inventaris.sql -o inventaris.txt
   (op de server zelf met Windows-login: sqlcmd -S localhost -E -C -i ...)

   Verandert niets aan de server. De uitvoer bevat geen wachtwoorden.
   Werkt op SQL Server 2016 en nieuwer; onderdelen die een versie niet kent,
   geven een foutregel in plaats van het script te stoppen. */
SET NOCOUNT ON;

PRINT N'== 1. Versie en editie';
SELECT
  CAST(SERVERPROPERTY('ProductVersion')     AS nvarchar(30))  AS productversie,         -- 13=2016, 14=2017, 15=2019, 16=2022, 17=2025
  CAST(SERVERPROPERTY('ProductLevel')       AS nvarchar(30))  AS niveau,                -- RTM / SPn
  CAST(SERVERPROPERTY('ProductUpdateLevel') AS nvarchar(30))  AS cu,                    -- CUnn
  CAST(SERVERPROPERTY('Edition')            AS nvarchar(128)) AS editie,
  CAST(SERVERPROPERTY('EngineEdition')      AS int)           AS engine_editie,         -- 2 Standard, 3 Enterprise/Developer, 4 Express
  CAST(SERVERPROPERTY('Collation')          AS nvarchar(128)) AS server_collatie,
  CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS int)     AS alleen_windows_login,  -- 1 = SQL-logins staan uit
  CAST(SERVERPROPERTY('InstanceName')       AS nvarchar(128)) AS instantie,             -- NULL = standaardinstantie
  CAST(SERVERPROPERTY('IsFullTextInstalled') AS int)          AS fulltext_geinstalleerd,
  FULLTEXTSERVICEPROPERTY('IsFullTextInstalled')              AS fulltext_dienst;
SELECT @@VERSION AS versie_volledig;

PRINT N'== 2. Besturingssysteem en tijd';
BEGIN TRY
  EXEC (N'SELECT host_platform, host_distribution, host_release FROM sys.dm_os_host_info');
END TRY BEGIN CATCH SELECT ERROR_MESSAGE() AS host_info_fout; END CATCH;
-- Niet 0 = de server draait niet in UTC: dan geven GETDATE()/CURRENT_TIMESTAMP lokale tijd.
SELECT DATEDIFF(MINUTE, GETUTCDATE(), GETDATE()) AS minuten_lokaal_min_utc,
       SYSDATETIMEOFFSET()                       AS servertijd_met_offset;

PRINT N'== 3. Netwerk en versleuteling';
BEGIN TRY  -- vraagt VIEW SERVER STATE (sysadmin heeft dat)
  EXEC (N'SELECT net_transport, local_tcp_port, encrypt_option, auth_scheme
          FROM sys.dm_exec_connections WHERE session_id = @@SPID');
  EXEC (N'SELECT DISTINCT local_tcp_port AS luistert_op_tcp_poort
          FROM sys.dm_exec_connections WHERE local_tcp_port IS NOT NULL');
END TRY BEGIN CATCH
  SELECT ERROR_MESSAGE() AS verbindingen_fout,
         CAST(CONNECTIONPROPERTY('net_transport') AS nvarchar(40)) AS net_transport,
         CAST(CONNECTIONPROPERTY('local_tcp_port') AS int)         AS local_tcp_port,
         CAST(CONNECTIONPROPERTY('auth_scheme') AS nvarchar(40))   AS auth_scheme;
END CATCH;
BEGIN TRY
  EXEC (N'SELECT servicename, status_desc, startup_type_desc, service_account FROM sys.dm_server_services');
END TRY BEGIN CATCH SELECT ERROR_MESSAGE() AS diensten_fout; END CATCH;
BEGIN TRY  -- alleen Windows: TCP/IP aan, vaste of dynamische poort, Force Encryption
  EXEC (N'SELECT registry_key, value_name, value_data FROM sys.dm_server_registry
          WHERE registry_key LIKE N''%SuperSocketNetLib%''
            AND value_name IN (N''Enabled'', N''TcpPort'', N''TcpDynamicPorts'', N''ForceEncryption'', N''ForceStrict'')');
END TRY BEGIN CATCH SELECT ERROR_MESSAGE() AS register_fout; END CATCH;

PRINT N'== 4. Instellingen die het gedrag van de app raken';
SELECT name, CAST(value_in_use AS int) AS waarde
FROM sys.configurations
WHERE name IN (N'user options', N'default language', N'default full-text language',
               N'contained database authentication', N'max server memory (MB)');
SELECT @@OPTIONS & 512 AS nocount_staat_standaard_aan,  -- moet 0 zijn (anders telt de app geen gewijzigde rijen)
       @@LANGUAGE      AS taal_van_deze_sessie;

PRINT N'== 5. Full-text search';
IF FULLTEXTSERVICEPROPERTY('IsFullTextInstalled') = 1
BEGIN
  SELECT lcid, name FROM sys.fulltext_languages WHERE lcid IN (0, 1033, 1043) ORDER BY lcid;
  SELECT COUNT(*) AS nederlandse_systeemstopwoorden
  FROM sys.fulltext_system_stopwords WHERE language_id = 1043;
  BEGIN TRY  -- vraagt sysadmin; toont hoe Nederlands woorden splitst en vervoegt
    EXEC (N'SELECT display_term, occurrence, expansion_type
            FROM sys.dm_fts_parser(N''FORMSOF(INFLECTIONAL, "artikelen")'', 1043, 0, 0)');
    EXEC (N'SELECT display_term, occurrence
            FROM sys.dm_fts_parser(N''"databaseserver node.js c# e-mail handleidingen"'', 1043, 0, 0)');
  END TRY BEGIN CATCH SELECT ERROR_MESSAGE() AS parser_fout; END CATCH;
END
ELSE
  SELECT N'Full-text search is NIET geïnstalleerd' AS fulltext;

PRINT N'== 6. Bestaande gebruikersdatabases';
SELECT name, collation_name, compatibility_level, is_read_committed_snapshot_on,
       snapshot_isolation_state_desc, recovery_model_desc, state_desc
FROM sys.databases WHERE database_id > 4 ORDER BY name;

PRINT N'== 7. Collaties die de kennisbank kan gebruiken';
SELECT name FROM sys.fn_helpcollations()
WHERE name IN (N'Latin1_General_100_CI_AS_SC_UTF8', N'Latin1_General_100_CI_AS_SC', N'Latin1_General_100_BIN2')
ORDER BY name;
