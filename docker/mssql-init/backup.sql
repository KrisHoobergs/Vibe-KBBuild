/* Back-up van de kennisbank-database, in de container (docs/installatie.md):
     docker compose -f docker-compose.mssql.yml exec -T db sh -c '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -b -i /init/backup.sql'
     docker compose -f docker-compose.mssql.yml cp db:/var/opt/mssql/backup/kennisbank.bak kennisbank.bak
   Bewaar daarnaast ook de geüploade bestanden (volume bestanden) en .env.
   COMPRESSION ontbreekt bewust: Express kan dat niet. */
:on error exit
BACKUP DATABASE [kennisbank]
  TO DISK = N'/var/opt/mssql/backup/kennisbank.bak'
  WITH INIT, FORMAT, CHECKSUM, NAME = N'kennisbank';
RESTORE VERIFYONLY FROM DISK = N'/var/opt/mssql/backup/kennisbank.bak' WITH CHECKSUM;
