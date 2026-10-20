/* Terugzetten van een back-up (docs/installatie.md). Eerst de app stoppen en
   het .bak-bestand in /var/opt/mssql/backup/ zetten:
     docker compose -f docker-compose.mssql.yml stop app
     docker compose -f docker-compose.mssql.yml cp kennisbank.bak db:/var/opt/mssql/backup/kennisbank.bak
     docker compose -f docker-compose.mssql.yml exec -T -u root db chown mssql /var/opt/mssql/backup/kennisbank.bak
     docker compose -f docker-compose.mssql.yml exec -T db sh -c '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -b -i /init/terugzetten.sql'
     docker compose -f docker-compose.mssql.yml up -d
   Bij "up" draait db-init opnieuw en koppelt de app-gebruiker weer aan zijn
   login (nodig bij een back-up van een andere server).

   MOVE zet de bestanden altijd in /var/opt/mssql/data/, ook als de back-up
   van een andere server komt (bv. een SQL Server op Windows, E2). Dat werkt
   voor elke database die als "kennisbank" gemaakt is (E1: db-init, E2:
   stap 4): die heeft de logische bestandsnamen kennisbank en kennisbank_log.
   Andere namen? Bekijk ze met
     RESTORE FILELISTONLY FROM DISK = N'/var/opt/mssql/backup/kennisbank.bak'
   en pas de twee MOVE-regels aan. */
:on error exit
USE master;
IF DB_ID(N'kennisbank') IS NOT NULL
  ALTER DATABASE [kennisbank] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE [kennisbank]
  FROM DISK = N'/var/opt/mssql/backup/kennisbank.bak'
  WITH REPLACE, CHECKSUM,
    MOVE N'kennisbank' TO N'/var/opt/mssql/data/kennisbank.mdf',
    MOVE N'kennisbank_log' TO N'/var/opt/mssql/data/kennisbank_log.ldf';
ALTER DATABASE [kennisbank] SET MULTI_USER;
