# Backup container: the PostgreSQL client tools (same version as the db service) plus age, to encrypt each dump
# when BACKUP_AGE_RECIPIENT is set. Keep the base image identical to the db service in deploy/compose.yaml.
FROM postgres:18.7@sha256:e754b839f447639b7004895f4d8a4bfcb4e9dbe3a1bc035f27f646562a16fd61
RUN apt-get update \
 && apt-get install -y --no-install-recommends age \
 && rm -rf /var/lib/apt/lists/* \
 && age --version
COPY backup.sh /backup.sh
ENTRYPOINT ["/bin/sh", "/backup.sh"]
