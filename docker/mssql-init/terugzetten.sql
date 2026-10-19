/* Terugzetten van een back-up (docs/installatie.md). Eerst de app stoppen en
   het .bak-bestand in /var/opt/mssql/backup/ zetten:
     docker compose -f docker-compose.mssql.yml stop app
     docker compose -f docker-compose.mssql.yml cp kennisbank.bak db:/var/opt/mssql/backup/kennisbank.bak
     docker compose -f docker-compose.mssql.yml exec -T -u root db chown mssql /var/opt/mssql/backup/kennisbank.bak
     docker compose -f docker-compose.mssql.yml exec -T db sh -c '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -b -i /init/terugzetten.sql'
     docker compose -f docker-compose.mssql.yml up -d
   Bij "up" draait db-init opnieuw en koppelt de app-gebruiker weer aan zijn
   login (nodig bij een back-up van een andere server). */
:on error exit
USE master;
IF DB_ID(N'kennisbank') IS NOT NULL
  ALTER DATABASE [kennisbank] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE [kennisbank]
  FROM DISK = N'/var/opt/mssql/backup/kennisbank.bak'
  WITH REPLACE, CHECKSUM;
ALTER DATABASE [kennisbank] SET MULTI_USER;
