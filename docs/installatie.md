# Een nieuwe kennisbank opzetten

Eén code, meerdere installaties. Elke installatie heeft een eigen adres, een
eigen database en eigen gebruikers. Wat een installatie gebruikt, bepalen
een paar instellingen (omgevingsvariabelen). Updates gaan naar alle
installaties die `main` volgen.

| Soort | Database | Login | Bestanden | Draait op | Voorbeeld |
|---|---|---|---|---|---|
| **A. Supabase** | Supabase | Supabase Auth | Supabase Storage | Vercel | de privé-kennisbank |
| **B. Online** | PostgreSQL bij Neon | eigen login | in de database (max. 4 MB per bestand) | Vercel | kennisbank-werk |
| **C. Zelf hosten met Docker** | PostgreSQL in Docker | eigen login | map op de server, of in de database | eigen Linux-server | |
| **D. Zelf hosten zonder Docker** | PostgreSQL | eigen login | map op de server | Windows- of Linux-server | |
| **E. SQL Server** | SQL Server 2016 of nieuwer (ook Express) | eigen login | map op de server, of in de database | Linux-server met Docker, of Windows-server (als dienst) | |

## Wat altijd geldt (B tot en met E)

- **De eerste die zich registreert, wordt beheerder.** Registreer jezelf dus
  meteen na de installatie, vóór je het adres deelt, en doe dat via het adres
  uit `SITE_URL`. Daarna kan registreren alleen nog met een uitnodiging
  (`REGISTRATIE=uitnodiging`).
- **Collega's uitnodigen:** Beheer → Gebruikers → Gebruiker uitnodigen →
  Link kopiëren. De link zelf doorsturen; de app verstuurt geen mail.
- **Wachtwoord vergeten:** de beheerder maakt in Beheer → Gebruikers een
  **herstellink** (eenmalig, 7 dagen geldig) en geeft die door.
- **Artikels mailen:** elke gebruiker stelt zijn Gmail in via Profiel → E-mail.
- **Controle:** `/status` (ook gelinkt onder het inlogformulier) toont of de
  configuratie, de database, de migraties en de mailsleutel in orde zijn,
  zonder wachtwoorden of adressen te tonen. Voor scripts: `/api/gezondheid`
  (JSON).
- **Database bijwerken:** met `DB_AUTO_MIGRATE=true` gebeurt dat bij het
  opstarten (is de database dan nog niet bereikbaar, dan probeert de app het
  elke minuut opnieuw); anders met `npm run db:migrate`. Op een
  Supabase-database weigert dat altijd.
- **Bewaar de instellingen veilig**, vooral `MAIL_ENCRYPTION_KEY`: zonder
  dezelfde sleutel zijn de opgeslagen Gmail-wachtwoorden na het terugzetten
  van een back-up onleesbaar.

---

## B. Online: Vercel + Neon

Snel en zonder eigen server. Beperkingen: uploads max. 4 MB per bestand
(grens van Vercel), de gratis database slaapt na een paar minuten (de eerste
pagina daarna is een paar seconden trager), en Vercel Hobby is formeel voor
persoonlijk, niet-commercieel gebruik.

### 1. Database bij Neon

1. Op [neon.tech](https://neon.tech): **New project**, Postgres **17**,
   regio **AWS Europe Central 1 (Frankfurt)**.
2. Maak een database met **Nederlandse sortering** (de standaarddatabase
   `neondb` sorteert "Zebra" vóór "appel"). In Neon: **SQL Editor**, database
   `neondb`, en voer uit:

   ```sql
   CREATE DATABASE kennisbank
     TEMPLATE template0 ENCODING 'UTF8'
     LOCALE_PROVIDER icu ICU_LOCALE 'nl-NL' LOCALE 'C.UTF-8';
   ```

   Weigert de SQL Editor dit ("cannot run inside a transaction block"), maak
   de database dan aan met een eigen databaseprogramma (bv. `psql`, met het
   adres zonder pooling), of laat Claude het doen.

3. **Connect** → database **`kennisbank`** → **Connection pooling aan** →
   kopieer het adres. Kopieer het adres zelf (`postgresql://…`), niet de
   `psql '…'`- of `DATABASE_URL=…`-variant.

### 2. Project bij Vercel

1. **Add New → Project**, importeer de GitHub-repo, kies een projectnaam (die
   bepaalt het adres: `<naam>.vercel.app`).
2. **Settings → Functions → Region:** Frankfurt (`fra1`), dicht bij de database.
3. **Settings → Environments → Production → Add Environment Variable**,
   **alleen voor Production** (vink Preview en Development uit):

   | Sleutel | Waarde |
   |---|---|
   | `DATABASE_URL` | het Neon-adres uit stap 1.3 |
   | `DATABASE_SSL` | `verify` |
   | `DB_DIALECT` | `postgres` |
   | `AUTH_DRIVER` | `local` |
   | `STORAGE_DRIVER` | `database` |
   | `REGISTRATIE` | `uitnodiging` |
   | `DB_AUTO_MIGRATE` | `true` |
   | `SITE_URL` | `https://<naam>.vercel.app` |
   | `BETTER_AUTH_SECRET` | nieuw: `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"` (of `openssl rand -base64 36`) |
   | `MAIL_ENCRYPTION_KEY` | nieuw: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` (of `openssl rand -base64 32`) |

   Let op de spelling: een sleutel met een tikfout (bv. `DATABSE_URL`) wordt
   gewoon genegeerd, en de site werkt dan niet.

   **Previews** (deployments van andere branches dan `main`) werken zo bewust
   niet. Met dezelfde instellingen zouden ze de echte database gebruiken met
   code die nog niet af is. Migraties voert een preview sowieso nooit uit.
   Wil je toch previews, maak dan in Neon een aparte branch-database en zet
   díe als `DATABASE_URL` voor Preview, nooit het adres van de echte database.
4. **Deployments → Redeploy** (of push iets naar `main`).
5. Open `https://<naam>.vercel.app/status`: alles moet groen zijn.
6. Registreer jezelf meteen op `https://<naam>.vercel.app/registreren`.

Claude kan stap 2 grotendeels zelf doen via de Vercel-koppeling; dan hoef je
alleen `DATABASE_URL` in te vullen.

---

## C. Zelf hosten met Docker

Voor een eigen server (bv. op het werk), met PostgreSQL erbij. De data blijft
op die server.

**Nodig:** een Linux-server met Docker Engine en Docker Compose, Git, en voor
gebruik buiten het eigen netwerk een domeinnaam met HTTPS (zie *Reverse proxy*).

> **Windows?** Docker Desktop is niet bedoeld als server: het werkt niet op
> Windows Server, het start pas als iemand zich aanmeldt (na een herstart of
> Windows Update blijft de kennisbank dus plat tot iemand inlogt), het geeft
> het echte IP-adres van gebruikers niet door (de begrenzing van
> inlogpogingen telt dan iedereen als één gebruiker), en in bedrijven met meer
> dan 250 werknemers of meer dan 10 miljoen dollar omzet is een betaald
> abonnement nodig. Gebruik op een Windows-server daarom **D. Zelf hosten
> zonder Docker**. Docker Desktop op een eigen pc is alleen geschikt om het
> uit te proberen.

```bash
git clone https://github.com/KrisHoobergs/Vibe-KBBuild.git kennisbank
cd kennisbank
cp .env.docker.example .env      # en vul .env in (zie hieronder)
docker compose up -d --build
```

In `.env` vul je in (de uitleg staat ook in het bestand zelf):

- `POSTGRES_PASSWORD`: bv. de uitvoer van `openssl rand -hex 24`. Het geldt
  vanaf de eerste start; later wijzigen in `.env` verandert het wachtwoord in
  de database niet meer.
- `SITE_URL`: het adres waarop gebruikers de kennisbank openen.
- `BETTER_AUTH_SECRET`: `openssl rand -base64 36`
- `MAIL_ENCRYPTION_KEY`: `openssl rand -base64 32`

Staat Node niet op de server, dan kan het ook via Docker:
`docker run --rm node:24-slim node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Daarna:

- `http://<server>:3000/status` moet groen zijn (`docker compose ps` toont
  ook "healthy").
- Registreer jezelf meteen via het adres uit `SITE_URL` (`<SITE_URL>/registreren`).
  Is dat een `https://`-adres, richt dan eerst de reverse proxy in. Via
  `http://<server>:3000` krijgt de browser dan geen login-cookie: je account
  wordt wel aangemaakt, maar je blijft op de inlogpagina.

**Bestanden:** standaard in een map (Docker-volume `bestanden`). Wil je ze in
de database, zet dan `STORAGE_DRIVER=database` in `.env`, **vóór de eerste
upload**. Later wisselen zet bestaande afbeeldingen, video's en
profielfoto's niet over: ze geven dan 404 (ze blijven wel bewaard en komen
terug als je terugwisselt). Verwijder het volume `bestanden` dus nooit zolang
er bestanden in staan.

**Bijwerken:**

```bash
git pull
docker compose up -d --build     # de database wordt automatisch bijgewerkt
```

**Back-up** (database en bestanden). Deze commando's werken in bash én in
PowerShell. Gebruik geen `pg_dump … > bestand`: in Windows PowerShell maakt
dat het dumpbestand ongemerkt stuk.

```bash
docker compose exec -T db pg_dump -U kennisbank -Fc -f /tmp/kennisbank.dump kennisbank
docker compose cp db:/tmp/kennisbank.dump kennisbank.dump
docker compose exec -T app tar czf /tmp/bestanden.tgz -C /data/bestanden .
docker compose cp app:/tmp/bestanden.tgz bestanden.tgz
```

Bewaar `kennisbank.dump`, `bestanden.tgz` en een kopie van `.env` samen op
een veilige plek, buiten de server. Test een back-up minstens één keer:
`docker compose exec -T db pg_restore -l /tmp/kennisbank.dump` moet een
inhoudsopgave tonen zonder fout.

**Terugzetten** (met dezelfde `.env`, na `docker compose up -d`):

```bash
docker compose stop app
docker compose cp kennisbank.dump db:/tmp/kennisbank.dump
docker compose exec -T db pg_restore -U kennisbank -d kennisbank --clean --if-exists /tmp/kennisbank.dump
docker compose start app
docker compose cp bestanden.tgz app:/tmp/bestanden.tgz
docker compose exec -T -u root app chown node:node /tmp/bestanden.tgz
docker compose exec -T app tar xzf /tmp/bestanden.tgz -C /data/bestanden
```

**Logboek:** `docker compose logs --tail 200 app`.

---

## D. Zelf hosten zonder Docker (bv. Windows-server)

**Nodig:** Node.js 22 of nieuwer (24 aanbevolen), PostgreSQL 17, Git.

1. **Database.** Maak in PostgreSQL een gebruiker en een database met
   Nederlandse sortering:

   ```sql
   CREATE USER kennisbank WITH PASSWORD '…';
   CREATE DATABASE kennisbank OWNER kennisbank
     TEMPLATE template0 ENCODING 'UTF8'
     LOCALE_PROVIDER icu ICU_LOCALE 'nl-NL' LOCALE 'C.UTF-8';
   ```

   Voer de twee opdrachten één voor één uit: samen in één keer geeft
   PostgreSQL de fout *CREATE DATABASE cannot run inside a transaction
   block*. In pgAdmin (Query Tool op de database `postgres`): selecteer één
   opdracht en druk F5. In `psql` (SQL Shell) mag je ze samen plakken.

   Op Windows heet de locale anders; gebruik daar `LOCALE 'en-US'` in plaats
   van `'C.UTF-8'`. Gebruik **nooit** `LOCALE 'C'`: dan splitst het zoeken
   woorden verkeerd. Kies een wachtwoord met alleen letters en cijfers: het
   komt in `DATABASE_URL` terecht, waar `#`, `/`, `?` en `%` het adres
   ongeldig maken (of codeer ze daar: `#` → `%23`, `/` → `%2F`, `?` → `%3F`,
   `%` → `%25`).

2. **Bouwen** (PowerShell):

   ```powershell
   git clone https://github.com/KrisHoobergs/Vibe-KBBuild.git C:\kennisbank
   cd C:\kennisbank
   npm ci
   $env:BUILD_STANDALONE = "1"; npm run build
   Copy-Item -Recurse .next\static .next\standalone\.next\static
   Copy-Item -Recurse public .next\standalone\public
   ```

3. **Instellingen** (als omgevingsvariabelen van de dienst, zie stap 4):

   | Sleutel | Waarde |
   |---|---|
   | `DATABASE_URL` | `postgres://kennisbank:<wachtwoord>@localhost:5432/kennisbank` |
   | `AUTH_DRIVER` | `local` |
   | `STORAGE_DRIVER` | `filesystem` |
   | `STORAGE_DIR` | een **absoluut** pad buiten `C:\kennisbank`, bv. `D:\kennisbank\bestanden` (blijvende, beschrijfbare map; niet meer wijzigen na de eerste upload) |
   | `REGISTRATIE` | `uitnodiging` |
   | `DB_AUTO_MIGRATE` | `true` |
   | `SITE_URL` | het adres waarop gebruikers de kennisbank openen |
   | `BETTER_AUTH_SECRET` | nieuwe sleutel (zie B, stap 2.3) |
   | `MAIL_ENCRYPTION_KEY` | nieuwe sleutel (zie B, stap 2.3) |
   | `PORT` | `3000` |
   | `HOSTNAME` | `127.0.0.1` als de reverse proxy op dezelfde server draait (anders weglaten) |

   Staat de database op een andere server, zet dan ook `DATABASE_SSL`
   (`verify`, `no-verify` of `off`).

4. **Als Windows-dienst**, bv. met [NSSM](https://nssm.cc):

   ```powershell
   nssm install Kennisbank "C:\Program Files\nodejs\node.exe" "C:\kennisbank\.next\standalone\server.js"
   nssm set Kennisbank AppDirectory C:\kennisbank\.next\standalone
   nssm set Kennisbank AppEnvironmentExtra DATABASE_URL=… AUTH_DRIVER=local STORAGE_DRIVER=filesystem STORAGE_DIR=D:\kennisbank\bestanden REGISTRATIE=uitnodiging DB_AUTO_MIGRATE=true SITE_URL=https://… BETTER_AUTH_SECRET=… MAIL_ENCRYPTION_KEY=… PORT=3000 HOSTNAME=127.0.0.1
   nssm set Kennisbank DependOnService postgresql-x64-17
   nssm set Kennisbank AppStdout D:\kennisbank\logboek.txt
   nssm set Kennisbank AppStderr D:\kennisbank\logboek.txt
   nssm set Kennisbank AppRotateFiles 1
   nssm set Kennisbank AppRotateBytes 10485760
   nssm start Kennisbank
   ```

   - `HOSTNAME=127.0.0.1` alleen als de reverse proxy op dezelfde server
     draait; anders weglaten.
   - **Let op:** `nssm set Kennisbank AppEnvironmentExtra …` vervangt telkens
     de hele lijst. Geef dus altijd alle variabelen samen op, of wijzig ze via
     `nssm edit Kennisbank` (tabblad *Environment*), en doe daarna
     `nssm restart Kennisbank`.
   - `DependOnService` alleen als PostgreSQL op dezelfde server draait (de
     naam van de dienst staat in *Services*); zo start de kennisbank na een
     herstart pas als de database draait.
   - Het logboek komt in `D:\kennisbank\logboek.txt` (buiten `C:\kennisbank`,
     want de build maakt `.next` leeg).

   Op Linux kan hetzelfde met een systemd-service (`After=postgresql.service`;
   logboek: `journalctl -u <dienst> -n 200`).

5. Open `/status` en registreer jezelf meteen via het adres uit `SITE_URL`
   (bij een `https://`-adres: pas als de reverse proxy werkt).

**Bijwerken.** Stop eerst de dienst: `next build` verwijdert de map
`.next\standalone`, waarin de dienst draait. Anders breekt de build af en
blijft de site plat. De kennisbank is tijdens het bijwerken een paar minuten
offline.

```powershell
nssm stop Kennisbank
cd C:\kennisbank
git pull
npm ci
$env:BUILD_STANDALONE = "1"; npm run build
Copy-Item -Recurse .next\static .next\standalone\.next\static
Copy-Item -Recurse public .next\standalone\public
nssm start Kennisbank
```

Op Linux idem, met `systemctl stop` en `systemctl start`.

**Back-up.** De PostgreSQL-installer zet `pg_dump` niet in het PATH, dus met
het volledige pad, en altijd met `-f` (niet met `>`):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -h localhost -U kennisbank -Fc -f kennisbank.dump kennisbank
```

Bewaar daarbij een kopie van de map `STORAGE_DIR` en de instellingen van
stap 3 (vooral `MAIL_ENCRYPTION_KEY`). Op Linux:
`pg_dump -h localhost -U kennisbank -Fc -f kennisbank.dump kennisbank`.

**Terugzetten:**

```powershell
nssm stop Kennisbank
& "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" -h localhost -U kennisbank -d kennisbank --clean --if-exists kennisbank.dump
# zet daarna de inhoud van de map STORAGE_DIR terug uit de back-up
nssm start Kennisbank
```

---

## E. SQL Server

Voor wie SQL Server wil of moet gebruiken in plaats van PostgreSQL (bv. op het
werk). De app is dezelfde, alleen de database verschilt. Altijd zelf gehost
en met de eigen login: op Vercel weigert de app SQL Server.

**Welke SQL Server?**

- **Versie:** SQL Server 2016 of nieuwer, op Windows of Linux. Aanbevolen:
  **2025**. Op 2016 tot en met 2022 zoekt de app minder goed in het
  Nederlands (zie *Zoeken en andere verschillen*).
- **Editie:** **Express** is gratis, ook voor productie, maar een database
  mag er hoogstens 50 GB groot worden (tot en met SQL Server 2022: 10 GB).
  Bewaar de bestanden (afbeeldingen, video's) dan in een map
  (`STORAGE_DRIVER=filesystem`), niet in de database. Standard en Enterprise
  hebben die grens niet. *Developer* is gratis, maar mag niet voor productie.
- **Full-Text Search**, een apart onderdeel van SQL Server, is sterk
  aanbevolen: daarmee vindt het zoeken ook andere vormen van een woord
  (`artikel` ↔ `artikelen`, `lopen` ↔ `liep`). Zonder werkt het zoeken
  eenvoudiger (zie E2, stap 1).
- **Azure SQL** zou moeten werken (`MSSQL_AUTH=azure-default`), maar is niet
  getest.

Twee manieren:

- **E1. Met Docker:** SQL Server en de kennisbank samen op één Linux-server.
  Het eenvoudigst als er nog geen SQL Server is.
- **E2. Met een bestaande SQL Server**, bv. die van het werk op Windows. De
  kennisbank draait dan als dienst, zoals in D.

Is er al een SQL Server, laat IT dan eerst `scripts/mssql/inventaris.sql`
uitvoeren (in SSMS of met `sqlcmd`, als beheerder). Dat script verandert
niets. Het toont wat hieronder nodig is: versie en editie, of Full-Text
Search geïnstalleerd is, of SQL-logins mogen, de poort en de versleuteling.

### E1. Met Docker (Linux-server)

**Nodig:** een Linux-server met een x86-64-processor (SQL Server draait niet
op ARM), minstens 4 GB geheugen (SQL Server alleen gebruikt er al 2), Docker
Engine en Docker Compose, en Git. Voor gebruik buiten het eigen netwerk ook
een domeinnaam met HTTPS (zie *Reverse proxy*). Docker Desktop op Windows is
niet geschikt als server (zie C).

```bash
git clone https://github.com/KrisHoobergs/Vibe-KBBuild.git kennisbank
cd kennisbank
cp .env.mssql.example .env      # en vul .env in (zie hieronder)
docker compose -f docker-compose.mssql.yml up -d --build
```

De eerste keer duurt dat enkele minuten: Docker haalt SQL Server op (ruim
een gigabyte) en voegt er Full-Text Search aan toe.

In `.env` vul je in (de uitleg staat ook in het bestand zelf):

- `MSSQL_SA_PASSWORD` (de beheerder van SQL Server, `sa`) en
  `MSSQL_APP_PASSWORD` (de login waarmee de app werkt). Elk minstens 8 tekens
  met hoofdletters, kleine letters en cijfers, zonder `'` of `"`. Bv. de
  uitvoer van `echo "Kb1-$(openssl rand -hex 16)"`. Het `sa`-wachtwoord geldt
  vanaf de eerste start: later wijzigen in `.env` verandert het in SQL Server
  niet meer. Dat van de app wordt bij elke start opnieuw gezet.
- `MSSQL_PID`: de editie, standaard `Express`. Voor Standard of Enterprise:
  de productsleutel. `Developer` mag niet voor productie.
- `SITE_URL`, `BETTER_AUTH_SECRET` en `MAIL_ENCRYPTION_KEY`: zoals in C.

Optioneel: `POORT` (zie *Reverse proxy*), `STORAGE_DRIVER` (standaard
`filesystem`; `database` zet de bestanden in SQL Server, en dat kies je vóór
de eerste upload), `REGISTRATIE` en `MSSQL_MEMORY_LIMIT_MB` (geheugen voor SQL
Server, standaard en minstens 2048).

Wat er dan draait: `db` is SQL Server met Full-Text Search. `db-init` maakt
bij elke start de database `kennisbank` en de login `kennisbank` aan, of werkt
ze bij (`docker/mssql-init/kennisbank.sql`). Daarna start `app`, die zelf de
tabellen en de zoekindex aanmaakt. SQL Server is niet bereikbaar van buiten
Docker.

Daarna:

- `http://<server>:3000/status` moet groen zijn, met onderaan *Database: SQL
  Server* en *Zoeken: Full-text*. `docker compose -f docker-compose.mssql.yml ps`
  toont `db` en `app` als "healthy". Bij `ps -a` staat `db-init` op
  "Exited (0)": dat is normaal.
- Registreer jezelf meteen via het adres uit `SITE_URL`, zoals in C.

Tip: zet `COMPOSE_FILE=docker-compose.mssql.yml` in `.env`, dan mag
`-f docker-compose.mssql.yml` in alle commando's weg. Hieronder staat het er
telkens bij.

**Bijwerken:**

```bash
git pull
docker compose -f docker-compose.mssql.yml up -d --build    # de database wordt automatisch bijgewerkt
```

**Back-up** (database en bestanden), in bash op de server:

```bash
docker compose -f docker-compose.mssql.yml exec -T db sh -c '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -b -i /init/backup.sql'
docker compose -f docker-compose.mssql.yml cp db:/var/opt/mssql/backup/kennisbank.bak kennisbank.bak
docker compose -f docker-compose.mssql.yml exec -T app tar czf /tmp/bestanden.tgz -C /data/bestanden .
docker compose -f docker-compose.mssql.yml cp app:/tmp/bestanden.tgz bestanden.tgz
```

Het eerste commando maakt de back-up en controleert ze meteen. Bewaar
`kennisbank.bak`, `bestanden.tgz` en een kopie van `.env` samen op een
veilige plek, buiten de server.

**Terugzetten** (met dezelfde `.env`, na `docker compose -f docker-compose.mssql.yml up -d`):

```bash
docker compose -f docker-compose.mssql.yml stop app
docker compose -f docker-compose.mssql.yml cp kennisbank.bak db:/var/opt/mssql/backup/kennisbank.bak
docker compose -f docker-compose.mssql.yml exec -T -u root db chown mssql /var/opt/mssql/backup/kennisbank.bak
docker compose -f docker-compose.mssql.yml exec -T db sh -c '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -b -i /init/terugzetten.sql'
docker compose -f docker-compose.mssql.yml up -d
docker compose -f docker-compose.mssql.yml cp bestanden.tgz app:/tmp/bestanden.tgz
docker compose -f docker-compose.mssql.yml exec -T -u root app chown node:node /tmp/bestanden.tgz
docker compose -f docker-compose.mssql.yml exec -T app tar xzf /tmp/bestanden.tgz -C /data/bestanden
```

Bij `up -d` koppelt `db-init` de gebruiker van de app weer aan zijn login.
Zo werkt ook een back-up van een andere server.

**Logboek:** `docker compose -f docker-compose.mssql.yml logs --tail 200 app`
(SQL Server zelf: `… logs --tail 200 db`).

**Met SSMS in de database kijken** (zelden nodig): voeg bij de dienst `db` in
`docker-compose.mssql.yml` de regel `ports: ["127.0.0.1:1433:1433"]` toe, voer
`docker compose -f docker-compose.mssql.yml up -d` uit en verbind via een
SSH-tunnel naar de server, als `sa`.

### E2. Met een bestaande SQL Server (bv. Windows-server)

**Nodig:** de SQL Server en iemand met beheerrechten erop (sysadmin), SQL
Server Management Studio (SSMS, gratis bij Microsoft) om de database aan te
maken, en voor de kennisbank zelf hetzelfde als in D: Node.js 22 of nieuwer
(24 aanbevolen) en Git. De kennisbank mag op dezelfde server staan als SQL
Server, of op een andere.

1. **Full-Text Search** (aanbevolen). Nagaan in SSMS:
   `SELECT FULLTEXTSERVICEPROPERTY('IsFullTextInstalled')` moet `1` geven.
   Anders installeren:

   - **Windows:** start de installatie van SQL Server opnieuw (*SQL Server
     Installation Center* → *Installation* → *New SQL Server stand-alone
     installation or add features to an existing installation*), kies de
     bestaande instantie en vink bij *Feature Selection* **Full-Text and
     Semantic Extractions for Search** aan. Express tot en met 2022 heeft dat
     onderdeel alleen in het pakket *Express with Advanced Services* (in de
     installer: *Download Media* → *Express Advanced*). Vanaf 2025 zit het in
     elke Express.
   - **Linux** (Ubuntu):

     ```bash
     sudo apt-get update
     sudo apt-get install -y mssql-server-fts
     sudo systemctl restart mssql-server
     ```

     Op Red Hat: `sudo yum install -y mssql-server-fts`. Het pakket hoort
     bij exact dezelfde versie van SQL Server; apt werkt SQL Server zo nodig
     mee bij. Plan het dus als een update.

   Komt Full-Text Search er pas na de installatie van de kennisbank bij, dan
   maakt de kennisbank de zoekindex bij de volgende start
   (`DB_AUTO_MIGRATE=true`, dus `nssm restart Kennisbank`) of met
   `npm run db:migrate` (zie stap 8). Binnen 5 minuten zoekt ze er dan mee.

2. **SQL-logins toestaan** (*mixed mode*; op Linux staat dat al goed). In
   SSMS: rechtsklik op de server → *Properties* → *Security* → **SQL Server
   and Windows Authentication mode** → OK. Herstart daarna SQL Server
   (rechtsklik op de server → *Restart*). Bij de installatie heet dit
   *Mixed Mode*.

   Staat IT alleen Windows-accounts toe? Dan kan een dienstaccount mét
   wachtwoord, via NTLM (`MSSQL_AUTH=ntlm`, zie *Alle SQL
   Server-instellingen*). Aanmelden zonder wachtwoord (Kerberos, of het
   account waaronder de dienst draait) kan niet. NTLM is nog niet getest op
   een echte domeinserver.

3. **TCP/IP met een vaste poort** (op Linux staat dat al goed: poort 1433).
   De app verbindt altijd via TCP/IP, en Express zet dat standaard uit. In
   *SQL Server Configuration Manager* → *SQL Server Network Configuration* →
   *Protocols for MSSQLSERVER* (Express: *Protocols for SQLEXPRESS*):

   - *TCP/IP* → *Enabled*: **Yes**;
   - *TCP/IP* → *Properties* → tabblad *IP Addresses* → helemaal onderaan
     **IPAll**: *TCP Dynamic Ports* leegmaken, *TCP Port* `1433`;
   - herstart SQL Server (onder *SQL Server Services*: *SQL Server (…)* →
     *Restart*).

   Staat de kennisbank op een **andere** server, open dan poort 1433 in de
   firewall van de SQL Server, alleen voor die server (PowerShell als
   beheerder; op Linux bv. `sudo ufw allow from <IP-adres> to any port 1433 proto tcp`):

   ```powershell
   New-NetFirewallRule -DisplayName "SQL Server voor de kennisbank" -Direction Inbound -Protocol TCP -LocalPort 1433 -RemoteAddress <IP-adres van de kennisbankserver> -Action Allow
   ```

   Op dezelfde server is geen firewallregel nodig. Een instantienaam zonder
   vaste poort (`sqlsrv01\SQLEXPRESS`) kan ook, maar vraagt de dienst *SQL
   Server Browser* en UDP-poort 1434. Een vaste poort is eenvoudiger.

4. **Database en login.** In SSMS, aangemeld als beheerder: *New Query*, plak
   dit, vul een wachtwoord in en druk **F5**:

   ```sql
   -- 1. Database: UTF-8, hoofdletterongevoelig, emoji als één teken
   CREATE DATABASE kennisbank COLLATE Latin1_General_100_CI_AS_SC_UTF8;
   GO
   ALTER DATABASE kennisbank SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
   ALTER DATABASE kennisbank SET RECOVERY SIMPLE;
   GO
   -- 2. Login voor de app
   CREATE LOGIN kennisbank WITH PASSWORD = N'<wachtwoord>',
     DEFAULT_DATABASE = kennisbank, CHECK_POLICY = ON, CHECK_EXPIRATION = OFF;
   GO
   -- 3. Gebruiker in de database, met alleen deze rechten
   USE kennisbank;
   CREATE USER kennisbank FOR LOGIN kennisbank WITH DEFAULT_SCHEMA = dbo;
   ALTER ROLE db_ddladmin ADD MEMBER kennisbank;
   ALTER ROLE db_datareader ADD MEMBER kennisbank;
   ALTER ROLE db_datawriter ADD MEMBER kennisbank;
   GO
   ```

   - SQL Server 2016 of 2017: `COLLATE Latin1_General_100_CI_AS_SC` (zonder
     `_UTF8`, dat bestaat pas vanaf 2019).
   - `READ_COMMITTED_SNAPSHOT ON`: wie leest, wacht niet op wie schrijft,
     zoals in PostgreSQL.
   - `RECOVERY SIMPLE`: geen log-back-ups nodig. Maakt IT al log-back-ups van
     alle databases, laat die regel dan weg.
   - `CHECK_EXPIRATION = OFF`: het wachtwoord verloopt niet. Anders werkt de
     kennisbank op een dag plots niet meer.
   - Het wachtwoord: minstens drie soorten tekens (hoofdletters, kleine
     letters, cijfers, leestekens). Vermijd `'`, `"`, `$` en spaties: die
     geven problemen in de commando's van stap 7 en 8.
   - De rechten: `db_ddladmin` om tabellen en de zoekindex aan te maken en bij
     te werken (bij de installatie en na een update), `db_datareader` en
     `db_datawriter` voor de gegevens. Geen `db_owner`, geen `sysadmin`, geen
     rechten in andere databases.
   - Wil IT de app geen `db_ddladmin` geven? Laat die regel dan weg, zet
     `DB_AUTO_MIGRATE=false` (stap 6) en laat IT na de installatie en na elke
     update `npm run db:migrate` uitvoeren (stap 8).
   - Met een Windows-account (NTLM) in plaats van een SQL-login: vervang deel
     2 door `CREATE LOGIN [DOMEIN\svc_kennisbank] FROM WINDOWS WITH DEFAULT_DATABASE = kennisbank;`
     en gebruik in deel 3 `[DOMEIN\svc_kennisbank]` als naam van de
     gebruiker en de login, dus overal behalve in `USE kennisbank`.

5. **Bouwen:** zoals D, stap 2.

6. **Instellingen** (als omgevingsvariabelen van de dienst, zie stap 7):

   | Sleutel | Waarde |
   |---|---|
   | `DB_DIALECT` | `mssql` |
   | `MSSQL_SERVER` | `localhost` als SQL Server op dezelfde server staat; anders de servernaam zoals in SSMS, bv. `sqlsrv01` of `sqlsrv01,1433` |
   | `MSSQL_DATABASE` | `kennisbank` |
   | `MSSQL_USER` | `kennisbank` |
   | `MSSQL_PASSWORD` | het wachtwoord uit stap 4 |
   | `AUTH_DRIVER` | `local` |
   | `STORAGE_DRIVER` | `filesystem` (aanbevolen, zeker met Express) of `database` |
   | `STORAGE_DIR` | alleen bij `filesystem`: zoals in D, stap 3 |
   | `REGISTRATIE`, `DB_AUTO_MIGRATE`, `SITE_URL`, `BETTER_AUTH_SECRET`, `MAIL_ENCRYPTION_KEY`, `PORT`, `HOSTNAME` | zoals in D, stap 3 |

   `DATABASE_URL` en `DATABASE_SSL` zijn bij SQL Server niet nodig (ze tellen
   niet mee). De verbinding is standaard versleuteld, zonder het certificaat
   van SQL Server te controleren (een standaardinstallatie heeft een
   zelfondertekend certificaat). Andere poort, instantienaam, NTLM of het
   certificaat wél controleren: zie *Alle SQL Server-instellingen*.

7. **Als Windows-dienst**, zoals D, stap 4, met deze instellingen en met SQL
   Server als afhankelijkheid:

   ```powershell
   nssm install Kennisbank "C:\Program Files\nodejs\node.exe" "C:\kennisbank\.next\standalone\server.js"
   nssm set Kennisbank AppDirectory C:\kennisbank\.next\standalone
   nssm set Kennisbank AppEnvironmentExtra DB_DIALECT=mssql MSSQL_SERVER=localhost MSSQL_DATABASE=kennisbank MSSQL_USER=kennisbank MSSQL_PASSWORD=… AUTH_DRIVER=local STORAGE_DRIVER=filesystem STORAGE_DIR=D:\kennisbank\bestanden REGISTRATIE=uitnodiging DB_AUTO_MIGRATE=true SITE_URL=https://… BETTER_AUTH_SECRET=… MAIL_ENCRYPTION_KEY=… PORT=3000 HOSTNAME=127.0.0.1
   nssm set Kennisbank DependOnService MSSQLSERVER
   nssm set Kennisbank AppStdout D:\kennisbank\logboek.txt
   nssm set Kennisbank AppStderr D:\kennisbank\logboek.txt
   nssm set Kennisbank AppRotateFiles 1
   nssm set Kennisbank AppRotateBytes 10485760
   nssm start Kennisbank
   ```

   - `DependOnService` is de naam van de dienst van SQL Server (zie
     *Services*): `MSSQLSERVER` voor de standaardinstantie,
     `'MSSQL$SQLEXPRESS'` voor Express. Die enkele aanhalingstekens zijn
     nodig, anders maakt PowerShell iets anders van `$SQLEXPRESS`. Zo start
     de kennisbank na een herstart pas als SQL Server draait. Staat SQL
     Server op een andere server, laat de regel dan weg.
   - De opmerkingen bij D, stap 4 gelden ook hier, vooral: `nssm set
     Kennisbank AppEnvironmentExtra …` vervangt telkens de hele lijst.
   - Op Linux: een systemd-service met `After=mssql-server.service` als SQL
     Server op dezelfde server draait.

8. **Controle.** Open `/status`: alles groen, en onderaan *Database: SQL
   Server* en *Zoeken: Full-text* (of *Eenvoudig*, zie hieronder). Een kader
   *Aandachtspunten SQL Server* noemt wat werkt, maar beter kan. Registreer
   jezelf daarna meteen via het adres uit `SITE_URL`.

   Meer details (versie, collatie, rechten van de login, versleuteling van
   de verbinding) toont `npm run db:mssql:controle`. Dat verandert niets. Het
   heeft dezelfde instellingen nodig als de dienst, bv. in PowerShell:

   ```powershell
   cd C:\kennisbank
   $env:DB_DIALECT = "mssql"; $env:MSSQL_SERVER = "localhost"; $env:MSSQL_DATABASE = "kennisbank"
   $env:MSSQL_USER = "kennisbank"; $env:MSSQL_PASSWORD = "…"
   $env:AUTH_DRIVER = "local"; $env:STORAGE_DRIVER = "database"; $env:SITE_URL = "https://…"; $env:BETTER_AUTH_SECRET = "…"
   npm run db:mssql:controle
   ```

   In hetzelfde venster werkt ook `npm run db:migrate` (de database
   bijwerken). Zonder `db_ddladmin` voor de app (stap 4) gebruikt IT daarvoor
   in `MSSQL_USER` en `MSSQL_PASSWORD` een login met `db_ddladmin` of
   `db_owner` in de database. Sluit het venster daarna: het wachtwoord staat
   erin.

**Bijwerken:** zoals in D (dienst stoppen, `git pull`, `npm ci`, bouwen,
kopiëren, dienst starten). De database wordt bij het starten bijgewerkt, of
met `npm run db:migrate` (stap 8).

**Back-up.** Met `sqlcmd` (komt mee met SQL Server; anders
`winget install sqlcmd`), in PowerShell als een Windows-account dat beheerder
is in SQL Server. De map moet bestaan, en de dienst van SQL Server moet erin
mogen schrijven. Eenmalig:

```powershell
New-Item -ItemType Directory -Force D:\kennisbank\backup
icacls D:\kennisbank\backup /grant "NT Service\MSSQLSERVER:(OI)(CI)M"
```

Express: `icacls D:\kennisbank\backup /grant 'NT Service\MSSQL$SQLEXPRESS:(OI)(CI)M'`
(met enkele aanhalingstekens). Daarna, telkens:

```powershell
sqlcmd -S localhost -E -C -b -Q "BACKUP DATABASE [kennisbank] TO DISK = N'D:\kennisbank\backup\kennisbank.bak' WITH INIT, FORMAT, CHECKSUM; RESTORE VERIFYONLY FROM DISK = N'D:\kennisbank\backup\kennisbank.bak' WITH CHECKSUM"
```

- Express: `-S localhost\SQLEXPRESS`.
- `RESTORE VERIFYONLY` controleert de back-up meteen.
- Bewaar daarbij een kopie van de map `STORAGE_DIR` en de instellingen van
  stap 6 (vooral `MAIL_ENCRYPTION_KEY`).
- Express heeft geen SQL Server Agent om back-ups te plannen. Plan dezelfde
  regel dan met de Windows Taakplanner.

**Terugzetten:**

```powershell
nssm stop Kennisbank
sqlcmd -S localhost -E -C -b -Q "IF DB_ID(N'kennisbank') IS NOT NULL ALTER DATABASE [kennisbank] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; RESTORE DATABASE [kennisbank] FROM DISK = N'D:\kennisbank\backup\kennisbank.bak' WITH REPLACE, CHECKSUM; ALTER DATABASE [kennisbank] SET MULTI_USER"
sqlcmd -S localhost -E -C -b -d kennisbank -Q "ALTER USER [kennisbank] WITH LOGIN = [kennisbank]"
# zet daarna de inhoud van de map STORAGE_DIR terug uit de back-up
nssm start Kennisbank
```

- `ALTER USER … WITH LOGIN` koppelt de gebruiker in de database weer aan de
  login. Dat is nodig op een andere server, of als de login opnieuw gemaakt
  is; anders kan het geen kwaad.
- Op een andere server moet de login al bestaan (stap 4, deel 2). Staan de
  databasebestanden daar in andere mappen, dan is `RESTORE … WITH MOVE`
  nodig: vraag het aan IT.
- Een back-up van een oudere versie van SQL Server kan naar een nieuwere,
  niet omgekeerd.

### Alle SQL Server-instellingen

Alleen gelezen bij `DB_DIALECT=mssql`.

| Sleutel | Standaard | Uitleg |
|---|---|---|
| `MSSQL_SERVER` | verplicht | De servernaam zoals in SSMS: `sqlsrv01`, `sqlsrv01,1433`, `sqlsrv01\SQLEXPRESS` of `tcp:sqlsrv01,1433`. `localhost` als SQL Server op dezelfde server staat. |
| `MSSQL_DATABASE` | verplicht | `kennisbank` |
| `MSSQL_PORT` | `1433` | Alleen voor een andere poort. Niet samen met een instantienaam. |
| `MSSQL_INSTANCE` | – | Een instantienaam (bv. `SQLEXPRESS`) in plaats van een poort. Vraagt de dienst *SQL Server Browser* (UDP 1434). |
| `MSSQL_AUTH` | `sql` | `sql` (een SQL-login), `ntlm` (een Windows-account met wachtwoord) of `azure-default` (Azure SQL, niet getest). |
| `MSSQL_USER`, `MSSQL_PASSWORD` | verplicht bij `sql` en `ntlm` | De login. Bij `ntlm` mag `MSSQL_USER` de vorm `DOMEIN\naam` hebben. |
| `MSSQL_DOMAIN` | – | Het domein bij `ntlm`, als `MSSQL_USER` geen `DOMEIN\` bevat. |
| `MSSQL_AZURE_CLIENT_ID` | – | Alleen bij `azure-default`: de client-id van een user-assigned managed identity. |
| `MSSQL_ENCRYPT` | `true` | `true`: versleuteld. `strict`: versleuteld vanaf de eerste byte (TDS 8, SQL Server 2022 en nieuwer, Azure), en controleert het certificaat altijd. `false`: onversleuteld, alleen toegestaan als SQL Server op dezelfde machine staat. |
| `MSSQL_TRUST_SERVER_CERT` | `true` | `true`: het certificaat van SQL Server wordt niet gecontroleerd (zoals `DATABASE_SSL=no-verify`). `false`: wel controleren. Dat vraagt een echt certificaat op SQL Server, of `MSSQL_CA`. Standaard `false` met `MSSQL_CA` of `strict`. |
| `MSSQL_CA` | – | Het CA-certificaat (PEM-tekst of base64) waarmee het certificaat van SQL Server gecontroleerd wordt. Niet samen met `MSSQL_TRUST_SERVER_CERT=true`. |
| `MSSQL_TLS_SERVERNAME` | – | De naam in het certificaat, als je via een IP-adres of een andere naam verbindt. |
| `DATABASE_POOL_MAX` | `5` | Hoeveel verbindingen de app tegelijk mag openen. |

### Zoeken en andere verschillen met PostgreSQL

**Met Full-Text Search** (*Zoeken: Full-text* op `/status`) werkt zoeken
zoals bij PostgreSQL: andere vormen van een woord tellen mee (`artikelen`
vindt `artikel`), hoofdletters en accenten niet (`cafe` vindt `café`), met
`"…"` zoek je een exacte zin, met `-woord` sluit je uit en met `or` zoek je
het ene of het andere. De verschillen:

- Een zoekvraag met alleen uitsluitingen (`-concept`) vindt niets.
- Een `"zin tussen aanhalingstekens"` moet exact zo voorkomen, zonder andere
  vormen van de woorden.
- Samengestelde woorden worden gesplitst: `bank` vindt ook `kennisbank`.
- Een net opgeslagen of gewijzigd artikel is pas na enkele seconden
  vindbaar.
- Artikels met dezelfde score staan in een vaste volgorde (laatst gewijzigd
  eerst).
- SQL Server 2016 tot en met 2022 kent het Nederlands minder goed. In onze
  tests (SQL Server 2022 op Linux) vond zoeken daar geen andere vormen van
  een woord, alleen het woord zelf en de delen van samengestelde woorden.
  Gebruik daarom bij voorkeur SQL Server 2025.

**Zonder Full-Text Search** (*Zoeken: Eenvoudig*) zoekt de app naar (delen
van) woorden. Hoofdletters en accenten tellen niet. `artikelen` vindt ook
`artikel` (de app laat `-en` en `-s` weg), `kat` vindt ook `kater`, maar
`liep` vindt `lopen` niet. Met veel artikels is dat ook trager. Oplossing:
Full-Text Search installeren (E2, stap 1).

**Verder:**

- Adressen van artikels zijn niet hoofdlettergevoelig: `/artikelen/Mijn-Artikel`
  opent ook `mijn-artikel`.
- Bij sorteren op titel tellen leestekens (bv. een koppelteken) anders mee,
  dus een enkele titel staat op een iets andere plaats.
- Met Express mag de database hoogstens 50 GB (2025) of 10 GB (tot en met
  2022) groot worden: bewaar bestanden dan in een map.

---

## Reverse proxy en HTTPS (C, D en E)

Zet de kennisbank achter een reverse proxy die HTTPS verzorgt. Belangrijk:

- `SITE_URL` = het publieke `https://`-adres.
- De proxy moet de **Host**-header ongewijzigd doorgeven en
  **X-Forwarded-Proto** zetten. Anders weigert de app elke actie, ook
  inloggen (*Invalid Server Actions request*).
- De proxy moet **X-Forwarded-For** zetten met het IP van de bezoeker. De
  begrenzing van inlogpogingen gebruikt het laatste adres in die header.
- De proxy moet verzoeken tot ongeveer **60 MB** doorlaten (video's tot 50 MB).
- Maak poort 3000 alleen bereikbaar voor de proxy, zodat niemand de proxy
  (en HTTPS) kan overslaan en zelf een X-Forwarded-For kan meesturen:
  - Proxy op dezelfde server, met Docker: `POORT=127.0.0.1:3000` in `.env`,
    daarna `docker compose up -d` (met SQL Server:
    `docker compose -f docker-compose.mssql.yml up -d`). Docker omzeilt de
    firewall van de server (ufw), dus dit is nodig.
  - Proxy op dezelfde server, zonder Docker: `HOSTNAME=127.0.0.1` in de
    volledige lijst van D, stap 4 (of E2, stap 7).
  - Proxy op een andere server: een firewallregel die poort 3000 alleen voor
    het IP van de proxy openzet.
- Zonder proxy (rechtstreeks via `http://<server>:3000`, alleen op het eigen
  netwerk) werkt alles, maar kan iemand zijn IP-adres vervalsen: de
  begrenzing van inlogpogingen telt dan in feite alleen per e-mailadres (50
  per kwartier).

**Caddy** (regelt HTTPS zelf, ook op Windows de eenvoudigste keuze):

```
kennis.voorbeeld.be {
    reverse_proxy 127.0.0.1:3000
}
```

**nginx:**

```nginx
server {
    listen 443 ssl;
    server_name kennis.voorbeeld.be;
    ssl_certificate     /etc/letsencrypt/live/kennis.voorbeeld.be/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kennis.voorbeeld.be/privkey.pem;
    client_max_body_size 60m;   # video's tot 50 MB

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**IIS** (Windows, met *URL Rewrite* en *Application Request Routing*) kan
ook, maar vraagt extra instellingen, want standaard vervangt IIS de
Host-header en laat het maar ±28 MB per verzoek toe:

1. Eenmalig, in PowerShell als beheerder:

   ```powershell
   & "$env:windir\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /enabled:"True" /preserveHostHeader:"True" /commit:apphost
   & "$env:windir\system32\inetsrv\appcmd.exe" set config -section:system.webServer/rewrite/allowedServerVariables /+"[name='HTTP_X_FORWARDED_PROTO']" /commit:apphost
   ```

2. `web.config` van de site:

   ```xml
   <configuration>
     <system.webServer>
       <rewrite>
         <rules>
           <rule name="kennisbank" stopProcessing="true">
             <match url="(.*)" />
             <serverVariables>
               <set name="HTTP_X_FORWARDED_PROTO" value="https" />
             </serverVariables>
             <action type="Rewrite" url="http://127.0.0.1:3000/{R:1}" />
           </rule>
         </rules>
       </rewrite>
       <security>
         <requestFiltering>
           <requestLimits maxAllowedContentLength="62914560" />
         </requestFiltering>
       </security>
     </system.webServer>
   </configuration>
   ```

---

## Problemen oplossen

Kijk eerst op **`/status`**. Meer details staan in het logboek van de server:
Docker `docker compose logs --tail 200 app` (met SQL Server:
`docker compose -f docker-compose.mssql.yml logs --tail 200 app`),
Windows-dienst `D:\kennisbank\logboek.txt` (zie D, stap 4), Linux
`journalctl -u <dienst> -n 200`.

| Melding of symptoom | Oorzaak en oplossing |
|---|---|
| Configuratie: *DATABASE_URL ontbreekt* | Sleutel ontbreekt of is fout gespeld (bv. `DATABSE_URL`). Bij SQL Server: `DB_DIALECT=mssql` ontbreekt. |
| Configuratie: *DATABASE_URL is geen geldige URL* | Er staat iets anders dan het adres in, bv. `psql '…'` of `DATABASE_URL=…`. Of het wachtwoord in het adres bevat `#`, `/`, `?` of `%` (zie D, stap 1). |
| Configuratie: *BETTER_AUTH_SECRET …* / *SITE_URL ontbreekt* | Instelling toevoegen (zie de tabellen hierboven). |
| Vercel-preview: `/status` geeft een serverfout, `/api/gezondheid` meldt *DATABASE_URL ontbreekt* | Normaal: de instellingen staan bewust alleen op Production (zie B, stap 2.3). Zet voor Preview nooit het adres van de echte database. |
| Configuratie: *STORAGE_DIR moet een absoluut pad zijn* | Een volledig pad gebruiken, buiten de map van de code (zie D, stap 3). |
| Database: *code 28P01* | Verkeerd databasewachtwoord. Docker: `POSTGRES_PASSWORD` geldt alleen bij de eerste start, dus later wijzigen in `.env` helpt niet. Zet het oude terug in `.env` en voer `docker compose up -d` uit (niet `restart`, dat leest `.env` niet opnieuw). Of pas het in de database aan: `docker compose exec db psql -U kennisbank -d kennisbank -c "ALTER USER kennisbank PASSWORD '<nieuw>'"`, daarna `docker compose restart app`. |
| Database: *ENOTFOUND* / *timeout* | Verkeerde host, of de database is (nog) niet bereikbaar. Bij Neon: even wachten en opnieuw laden. |
| Migraties: fout | De melding staat erbij. Was de database alleen even onbereikbaar, dan probeert de app het elke minuut opnieuw. Anders: oplossen en herstarten (of opnieuw deployen). |
| Sleutel voor het mailen: rood | `MAIL_ENCRYPTION_KEY` is geen base64-sleutel van 32 bytes. Maak een nieuwe (zie B, stap 2.3); er is nog niets mee versleuteld als niemand Gmail kon instellen. |
| Inloggen of opslaan mislukt, het logboek toont *… does not match `origin` header …* / *Invalid Server Actions request* | De reverse proxy geeft de Host-header niet door (IIS: `preserveHostHeader`, nginx: `proxy_set_header Host $host`). |
| Inloggen lukt, maar je wordt meteen uitgelogd | `SITE_URL` klopt niet met het adres in de browser (http/https, domein). Bv. je opent `http://<server>:3000` terwijl `SITE_URL` met `https://` begint: gebruik het adres uit `SITE_URL`. |
| *Registreren kan alleen met een uitnodiging* | Er bestaat al een account (misschien het jouwe: zie de rij hierboven). Anders: vraag de beheerder een uitnodiging. |
| Alle afbeeldingen en video's geven 404 | `STORAGE_DRIVER` (of `STORAGE_DIR`) is gewijzigd nadat er bestanden waren. Zet de oude waarde terug. |
| Beheerder kan niet meer inloggen | Een andere beheerder maakt een herstellink. Is er geen: vraag Claude, die kan met toegang tot de database een herstellink aanmaken. |
| Upload mislukt op Vercel | Bestand groter dan 4 MB. |
| Upload van een grote video mislukt achter een proxy | De proxy laat zo'n groot verzoek niet door (nginx: `client_max_body_size`, IIS: `maxAllowedContentLength`). |

**SQL Server (E).** De melding op `/status` toont nooit de servernaam of de
login (`[server]`, `[gebruiker]`). Het foutlogboek van SQL Server zelf (SSMS:
*Management* → *SQL Server Logs*; Docker: `… logs db`) zegt vaak meer.

| Melding of symptoom | Oorzaak en oplossing |
|---|---|
| Configuratie: *MSSQL_… ontbreekt*, *Geef een poort óf een instantienaam op*, *MSSQL_ENCRYPT=false mag alleen …* | De melding noemt de instelling. Zie *Alle SQL Server-instellingen* (E). `MSSQL_ENCRYPT=false` mag alleen als SQL Server op dezelfde machine staat; laat het anders weg. |
| Configuratie: *SQL Server wordt op Vercel niet ondersteund* | Klopt: host de kennisbank zelf (E1 of E2). |
| Database: *code ELOGIN … Login failed for user '[gebruiker]'* | Dezelfde melding voor verschillende oorzaken. Het foutlogboek van SQL Server toont fout 18456 met een *state*: 8 = verkeerd wachtwoord (`MSSQL_PASSWORD`), 5 = de login bestaat niet (`MSSQL_USER`), 58 = SQL-logins staan uit (E2, stap 2). Staat er vlak ervoor fout 4060, dan bestaat de database uit `MSSQL_DATABASE` niet, of heeft de login er geen gebruiker in (E2, stap 4; na het terugzetten op een andere server: `ALTER USER … WITH LOGIN`). Docker: na een wijziging van `MSSQL_APP_PASSWORD` in `.env` `up -d` gebruiken, niet `restart`. |
| Database: *code ESOCKET … Failed to connect to [server]:1433 - connect ECONNREFUSED* of *code ETIMEOUT* | SQL Server is niet bereikbaar: de dienst draait niet, TCP/IP staat uit of luistert op een andere poort (E2, stap 3), de firewall houdt het tegen, of `MSSQL_SERVER`/`MSSQL_PORT` is fout. Test vanaf de server van de kennisbank: `Test-NetConnection <server> -Port 1433` (PowerShell) moet *TcpTestSucceeded : True* geven. |
| Database: *code EINSTLOOKUP … SQL Server Browser* | Een instantienaam zonder poort, maar de dienst *SQL Server Browser* draait niet of UDP 1434 is dicht. Beter: een vaste poort (E2, stap 3) en `MSSQL_SERVER` zonder instantienaam. |
| Database: *code ESOCKET … self-signed certificate*, *certificate has expired* of *… is not in the cert's altnames* | Het certificaat van SQL Server wordt gecontroleerd (`MSSQL_TRUST_SERVER_CERT=false`, `MSSQL_ENCRYPT=strict` of `MSSQL_CA`), maar klopt niet. Laat IT een echt certificaat op SQL Server zetten, zet de naam uit het certificaat in `MSSQL_TLS_SERVERNAME`, geef de CA in `MSSQL_CA`, of laat die instellingen weg (wel versleuteld, zonder controle). |
| Database: *code EENCRYPT* | `MSSQL_ENCRYPT=false`, maar SQL Server eist versleuteling. Laat `MSSQL_ENCRYPT` weg. |
| Database: *NOCOUNT staat aan in de serverinstellingen (user options)* | IT heeft NOCOUNT voor alle verbindingen aangezet; de app ziet dan niet of opslaan gelukt is. Laat IT bit 512 uit de serverinstelling *user options* halen (`sp_configure 'user options'`). |
| Database: *SQL Server 2016 of nieuwer nodig* | De server is te oud. |
| Migraties: *nr 262 … permission denied* | De login van de app mag geen tabellen maken (geen `db_ddladmin`). Geef die rol (E2, stap 4), of laat IT `npm run db:migrate` uitvoeren met een login die het wel mag (E2, stap 8). |
| Aandachtspunten: *READ_COMMITTED_SNAPSHOT staat uit* | Werkt, maar wie leest, moet soms wachten op wie schrijft. Stop de kennisbank, voer als beheerder `ALTER DATABASE [kennisbank] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;` uit en start ze weer. |
| *Zoeken: Eenvoudig*, met *Full-text search is niet geïnstalleerd* | Installeer Full-Text Search (E2, stap 1) en herstart de kennisbank (met `DB_AUTO_MIGRATE=true`) of voer `npm run db:migrate` uit. |
| *Zoeken: Eenvoudig*, met *Er is nog geen full-text-index* | Full-Text Search is er, maar de migraties liepen nog niet opnieuw: herstart de kennisbank of voer `npm run db:migrate` uit. |
| Logboek: *[zoeken] full-text-fout …, terugval op LIKE* | Full-text gaf een fout; de app zoekt dan 5 minuten eenvoudig en probeert het daarna opnieuw. Blijft het terugkomen: kijk of de dienst *SQL Full-text Filter Daemon Launcher* draait (Windows). Na het terugzetten van een back-up van een oudere SQL Server: voer in de database `ALTER FULLTEXT CATALOG kb_fulltext REBUILD;` uit. |
| Docker: de app start niet, `docker compose -f docker-compose.mssql.yml ps -a` toont `db-init` met "Exited" en een andere code dan 0 | `docker compose -f docker-compose.mssql.yml logs db-init`. *Password validation failed*: `MSSQL_APP_PASSWORD` is te eenvoudig. *mag geen ' of " bevatten*: kies een ander wachtwoord. Verander het in `.env` en voer `up -d` opnieuw uit. |
| Docker: `db` stopt meteen of wordt nooit "healthy" | `docker compose -f docker-compose.mssql.yml logs db`. Bij de eerste start: `MSSQL_SA_PASSWORD` voldoet niet aan de regels (te kort of te eenvoudig), of de server heeft te weinig geheugen (minstens 2 GB voor SQL Server). Later: `MSSQL_SA_PASSWORD` in `.env` is gewijzigd, maar dat van de eerste start blijft gelden: zet het oude terug. |
