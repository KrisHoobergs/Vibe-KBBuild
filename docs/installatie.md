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

SQL Server volgt later (fase 3).

## Wat altijd geldt (B, C en D)

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

## Reverse proxy en HTTPS (C en D)

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
    daarna `docker compose up -d`. Docker omzeilt de firewall van de server
    (ufw), dus dit is nodig.
  - Proxy op dezelfde server, zonder Docker: `HOSTNAME=127.0.0.1` in de
    volledige lijst van D, stap 4.
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
Docker `docker compose logs --tail 200 app`, Windows-dienst
`D:\kennisbank\logboek.txt` (zie D, stap 4), Linux `journalctl -u <dienst> -n 200`.

| Melding of symptoom | Oorzaak en oplossing |
|---|---|
| Configuratie: *DATABASE_URL ontbreekt* | Sleutel ontbreekt of is fout gespeld (bv. `DATABSE_URL`). |
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
