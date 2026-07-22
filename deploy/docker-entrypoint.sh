#!/bin/sh
set -eu

config_path="/app/deploy/wrangler.jsonc"
persist_path="${WRANGLER_PERSIST_TO:-/data}"
listen_port="${PORT:-3000}"

mkdir -p "$persist_path"

npx --no-install wrangler d1 migrations apply DB \
  --config "$config_path" \
  --local \
  --persist-to "$persist_path"

exec npx --no-install wrangler dev \
  --config "$config_path" \
  --ip 0.0.0.0 \
  --port "$listen_port" \
  --persist-to "$persist_path"
