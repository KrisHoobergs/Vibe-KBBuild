# Een nieuwe kennisbank opzetten

Eén code, meerdere installaties. Elke installatie heeft een eigen adres, een
eigen database en eigen gebruikers. Wat een installatie gebruikt, bepalen
een paar instellingen (omgevingsvariabelen). Updates gaan naar alle
installaties die `main` volgen.

| Soort | Database | Login | Bestanden | Draait op | Voorbeeld |
|---|---|---|---|---|---|
| **A. Supabase** | Supabase | Supabase Auth | Supabase Storage | Vercel | de privé-kennisbank |
| **B. Online** | PostgreSQL bij Neon | eigen login | in de database (max. 4 MB per bestand) | Vercel | kennisbank-werk |
| **C. Zelf hosten met Docker** | PostgreSQL in Docker | eigen login | map op de server, of in de database | eigen server | |
| **D. Zelf hosten zonder Docker** | PostgreSQL | eigen login | map op de server | Windows- of Linux-server | |

SQL Server volgt later (fase 3).

## Wat altijd geldt (B, C en D)

- **De eerste die zich registreert, wordt beheerder.** Registreer jezelf dus
  meteen na de installatie, vóór je het adres deelt. Daarna kan registreren
  alleen nog met een uitnodiging (`REGISTRATIE=uitnodiging`).
- **Collega's uitnodigen:** Beheer → Gebruikers → Gebruiker uitnodigen →
  Link kopiëren. De link zelf doorsturen; de app verstuurt geen mail.
- **Wachtwoord vergeten:** de beheerder maakt in Beheer → Gebruikers een
  **herstellink** (eenmalig, 7 dagen geldig) en geeft die door.
- **Artikels mailen:** elke gebruiker stelt zijn Gmail in via Profiel → E-mail.
- **Controle:** `/status` (ook gelinkt onder het inlogformulier) toont of de
  configuratie, de database en de migraties in orde zijn, zonder wachtwoorden
  of adressen te tonen. Voor scripts: `/api/gezondheid` (JSON).
- **Database bijwerken:** met `DB_AUTO_MIGRATE=true` gebeurt dat bij het
  opstarten; anders met `npm run db:migrate`. Op een Supabase-database
  weigert dat altijd.

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
3. **Settings → Environments → Production → Add Environment Variable**, voor
   **Production** én **Preview**:

   | Sleutel | Waarde |
   |---|---|
   | `DATABASE_URL` | het Neon-adres uit stap 1.3 |
   | `DATABASE_SSL` | `verify` |
   | `DB_DIALECT` | `postgres` |
   | `AUTH_DRIVER` | `local` |
   | `STORAGE_DRIVER` | `database` |
   | `REGISTRATIE` | `uitnodiging` |
   | `DB_AUTO_MIGRATE` | `true` |
   | `SITE_URL` | `https://<naam>.vercel.app` (alleen Production) |
   | `BETTER_AUTH_SECRET` | nieuw: `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"` |
   | `MAIL_ENCRYPTION_KEY` | nieuw: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

   Let op de spelling: een sleutel met een tikfout (bv. `DATABSE_URL`) wordt
   gewoon genegeerd, en de site werkt dan niet.
4. **Deployments → Redeploy** (of push iets naar `main`).
5. Open `https://<naam>.vercel.app/status`: alles moet groen zijn.
6. Registreer jezelf meteen op `/registreren`.

Claude kan stap 2 grotendeels zelf doen via de Vercel-koppeling; dan hoef je
alleen `DATABASE_URL` in te vullen.

---

## C. Zelf hosten met Docker

Voor een eigen server (bv. op het werk), met PostgreSQL erbij. De data blijft
op die server.

**Nodig:** een server met Docker en Docker Compose (Linux, of Windows met
Docker Desktop), Git, en voor gebruik buiten het eigen netwerk een domeinnaam
met HTTPS (zie *Reverse proxy*).

```bash
git clone https://github.com/KrisHoobergs/Vibe-KBBuild.git kennisbank
cd kennisbank
cp .env.docker.example .env      # en vul .env in (wachtwoord, SITE_URL, twee sleutels)
docker compose up -d --build
```

Daarna:

- `http://<server>:3000/status` moet groen zijn (`docker compose ps` toont
  ook "healthy").
- Registreer jezelf meteen op `/registreren`.

**Bestanden:** standaard in een map (Docker-volume `bestanden`). Wil je ze in
de database, zet dan `STORAGE_DRIVER=database` in `.env`.

**Bijwerken:**

```bash
git pull
docker compose up -d --build     # de database wordt automatisch bijgewerkt
```

**Back-up** (database en bestanden):

```bash
docker compose exec -T db pg_dump -U kennisbank -Fc kennisbank > kennisbank.dump
docker run --rm -v kennisbank_bestanden:/data -v "$PWD":/backup alpine \
  tar czf /backup/bestanden.tgz -C /data .
```

(`kennisbank_bestanden` = `<mapnaam>_bestanden`; zie `docker volume ls`.)
Terugzetten: `docker compose exec -T db pg_restore -U kennisbank -d kennisbank --clean < kennisbank.dump`
en het tar-bestand terug uitpakken in het volume.

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

   Op Windows heet de locale anders; gebruik daar `LOCALE 'en-US'` in plaats
   van `'C.UTF-8'`. Gebruik **nooit** `LOCALE 'C'`: dan splitst het zoeken
   woorden verkeerd.

2. **Bouwen** (PowerShell, in de map van de code):

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
   | `STORAGE_DIR` | bv. `D:\kennisbank\bestanden` (blijvende, beschrijfbare map) |
   | `REGISTRATIE` | `uitnodiging` |
   | `DB_AUTO_MIGRATE` | `true` |
   | `SITE_URL` | het adres waarop gebruikers de kennisbank openen |
   | `BETTER_AUTH_SECRET` | nieuwe sleutel (zie B, stap 2.3) |
   | `MAIL_ENCRYPTION_KEY` | nieuwe sleutel (zie B, stap 2.3) |
   | `PORT` | `3000` |

   Staat de database op een andere server, zet dan ook `DATABASE_SSL`
   (`verify`, `no-verify` of `off`).

4. **Als Windows-dienst**, bv. met [NSSM](https://nssm.cc):

   ```powershell
   nssm install Kennisbank "C:\Program Files\nodejs\node.exe" "C:\kennisbank\.next\standalone\server.js"
   nssm set Kennisbank AppDirectory C:\kennisbank\.next\standalone
   nssm set Kennisbank AppEnvironmentExtra DATABASE_URL=… AUTH_DRIVER=local STORAGE_DRIVER=filesystem STORAGE_DIR=D:\kennisbank\bestanden REGISTRATIE=uitnodiging DB_AUTO_MIGRATE=true SITE_URL=https://… BETTER_AUTH_SECRET=… MAIL_ENCRYPTION_KEY=… PORT=3000
   nssm start Kennisbank
   ```

   Op Linux kan hetzelfde met een systemd-service.

5. Open `/status` en registreer jezelf meteen op `/registreren`.

**Bijwerken:** `git pull`, `npm ci`, opnieuw bouwen en kopiëren (stap 2),
dienst herstarten. **Back-up:** `pg_dump` van de database en een kopie van
`STORAGE_DIR`.

---

## Reverse proxy en HTTPS (C en D)

Zet de kennisbank achter een reverse proxy die HTTPS verzorgt. Belangrijk:

- `SITE_URL` = het publieke `https://`-adres.
- De proxy moet de **Host**-header ongewijzigd doorgeven en
  **X-Forwarded-For** / **X-Forwarded-Proto** zetten. Zonder X-Forwarded-For
  telt de begrenzing van inlogpogingen alle gebruikers als één IP.

**Caddy** (regelt HTTPS zelf):

```
kennis.voorbeeld.be {
    reverse_proxy localhost:3000
}
```

**nginx:**

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 60m;   # video's tot 50 MB
}
```

Op Windows kan ook IIS met *URL Rewrite* en *Application Request Routing*.

---

## Problemen oplossen

Kijk eerst op **`/status`**.

| Melding of symptoom | Oorzaak en oplossing |
|---|---|
| Configuratie: *DATABASE_URL ontbreekt* | Sleutel ontbreekt of is fout gespeld (bv. `DATABSE_URL`). |
| Configuratie: *DATABASE_URL is geen geldige URL* | Er staat iets anders dan het adres in, bv. `psql '…'` of `DATABASE_URL=…`. |
| Configuratie: *BETTER_AUTH_SECRET …* / *SITE_URL ontbreekt* | Instelling toevoegen (zie de tabellen hierboven). |
| Database: *code 28P01* | Verkeerd databasewachtwoord. |
| Database: *ENOTFOUND* / *timeout* | Verkeerde host, of de database is (nog) niet bereikbaar. Bij Neon: even wachten en opnieuw laden. |
| Migraties: fout | De melding staat erbij. Na het oplossen: herstarten (of opnieuw deployen). |
| Inloggen lukt, maar je wordt meteen uitgelogd | `SITE_URL` klopt niet met het adres in de browser (http/https, domein). |
| *Registreren kan alleen met een uitnodiging* | Er bestaat al een account; vraag de beheerder een uitnodiging. |
| Beheerder kan niet meer inloggen | Een andere beheerder maakt een herstellink. Is er geen: vraag Claude, die kan met toegang tot de database een herstellink aanmaken. |
| Upload mislukt op Vercel | Bestand groter dan 4 MB. |
