# SQL Server met Full-Text Search, voor docker-compose.mssql.yml en voor CI
# (.github/workflows/sqlserver.yml). Het officiële image heeft geen full-text.
#
# Waarom niet gewoon `apt-get install mssql-server-fts`? In het officiële image
# is mssql-server NIET als dpkg-pakket geregistreerd (het komt uit een tar), en
# mssql-server-fts hangt af van mssql-server. apt zou dus de hele server er nog
# eens over installeren, en dan in de nieuwste versie in plaats van die van het
# image. Lukt deze aanpak ooit niet meer: zie Dockerfile.apt (terugvaloptie).
#
# Het FTS-pakket bevat één bestand dat telt: /opt/mssql/lib/sqlservr.fts.sfp
# (plus semanticsdb.bak). We pakken het uit in exact de versie van de server in
# het image (label com.microsoft.version + "-1"), gecontroleerd met een vaste
# SHA-256 uit de Packages-index van packages.microsoft.com.
#
# Standaard: SQL Server 2025. Voor SQL Server 2022 (oudere Nederlandse stemmer):
#   docker build \
#     --build-arg MSSQL_TAG=2022-CU27-GDR1-ubuntu-22.04 \
#     --build-arg FTS_REPO=ubuntu/22.04/mssql-server-2022 \
#     --build-arg FTS_VERSIE=16.0.4305.5-1 \
#     --build-arg FTS_SHA256=1299890caaa62fdc5334d65f8723f5457e6e154f8a02a2da78c7efd4c7c50336 \
#     -t kennisbank-mssql:2022-fts docker/mssql-fts
#
# Bijwerken (nieuwe CU): MSSQL_TAG, FTS_VERSIE en FTS_SHA256 SAMEN aanpassen,
# hier én in .github/workflows/sqlserver.yml.
#   versie:  docker inspect --format '{{ index .Config.Labels "com.microsoft.version" }}' mcr.microsoft.com/mssql/server:<tag>
#   sha256:  https://packages.microsoft.com/ubuntu/24.04/mssql-server-2025/dists/noble/main/binary-amd64/Packages
#            (2022: https://packages.microsoft.com/ubuntu/22.04/mssql-server-2022/dists/jammy/main/binary-amd64/Packages)
ARG MSSQL_TAG=2025-CU9-GDR1-ubuntu-24.04
FROM mcr.microsoft.com/mssql/server:${MSSQL_TAG}

ARG FTS_REPO=ubuntu/24.04/mssql-server-2025
ARG FTS_VERSIE=17.0.5015.4-1
ARG FTS_SHA256=fa1e3e5e3073937fdaf4c9865b47aa2bf483d8da0a760674a5de1a9bea49ee3a

USER root
# Downloaden (curl of wget, wat het image heeft), controleren, uitpakken.
# Daarna een map voor back-ups (docker/mssql-init/backup.sql); een nieuw volume
# op /var/opt/mssql neemt die map over.
RUN set -eux; \
    url="https://packages.microsoft.com/${FTS_REPO}/pool/main/m/mssql-server-fts/mssql-server-fts_${FTS_VERSIE}_amd64.deb"; \
    if command -v curl > /dev/null; then \
      curl -fsSL --retry 3 -o /tmp/fts.deb "$url"; \
    elif command -v wget > /dev/null; then \
      wget -q -O /tmp/fts.deb "$url"; \
    else \
      apt-get update; \
      apt-get install -y --no-install-recommends curl ca-certificates; \
      rm -rf /var/lib/apt/lists/*; \
      curl -fsSL --retry 3 -o /tmp/fts.deb "$url"; \
    fi; \
    echo "${FTS_SHA256}  /tmp/fts.deb" | sha256sum -c -; \
    dpkg-deb -x /tmp/fts.deb /; \
    rm -f /tmp/fts.deb; \
    test -f /opt/mssql/lib/sqlservr.fts.sfp; \
    mkdir -p /var/opt/mssql/backup; \
    chown -R mssql /var/opt/mssql
USER mssql
# ENTRYPOINT (/opt/mssql/bin/launch_sqlservr.sh) en CMD blijven die van het officiële image.
