#!/usr/bin/env sh
set -eu

echo "[soteria] applying migrations..."
attempt=1
max_attempts=20
until alembic upgrade head; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[soteria] migration failed after ${max_attempts} attempts"
    exit 1
  fi
  echo "[soteria] migration attempt ${attempt} failed, retrying in 3s..."
  attempt=$((attempt + 1))
  sleep 3
done

if [ "${AUTO_SEED:-false}" = "true" ]; then
  echo "[soteria] seeding deterministic demo data..."
  python scripts/seed_data.py
fi

echo "[soteria] starting api server..."
exec gunicorn main:app \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --workers "${WEB_CONCURRENCY:-2}" \
  --timeout "${WEB_TIMEOUT:-120}" \
  --access-logfile - \
  --error-logfile -
