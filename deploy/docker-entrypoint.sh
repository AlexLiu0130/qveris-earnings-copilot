#!/bin/sh
set -eu

database_path="${SQLITE_DATABASE_PATH:-/data/earnings.db}"
database_dir="$(dirname "$database_path")"

mkdir -p "$database_dir"

# Named volumes can retain ownership from an older image or a backup restore.
# SQLite must be able to create the database, WAL, and shared-memory files.
chown node:node "$database_dir"
chmod u+rwx "$database_dir"

for sqlite_file in "$database_path" "$database_path-wal" "$database_path-shm"; do
  if [ -e "$sqlite_file" ]; then
    chown node:node "$sqlite_file"
    chmod u+rw "$sqlite_file"
  fi
done

exec gosu node "$@"
