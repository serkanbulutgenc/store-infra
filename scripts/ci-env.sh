#!/usr/bin/env bash
# Write throwaway env files for CI / e2e runs. Random secrets, never reused.
# Expects sibling checkouts at ../store-backend and ../store-frontend unless
# BACKEND_DIR / FRONTEND_DIR are already set.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
rand() { openssl rand -hex 24; }

cat > .env <<ENV
BACKEND_DIR=${BACKEND_DIR:-../store-backend}
FRONTEND_DIR=${FRONTEND_DIR:-../store-frontend}
HTTP_PORT=8080
ENV

cat > env/postgres.env <<ENV
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=store
POSTGRES_USER=store
POSTGRES_PASSWORD=$(rand)
ENV

cat > env/django.env <<ENV
DJANGO_SETTINGS_MODULE=config.settings.production
DJANGO_SECRET_KEY=$(rand)
DJANGO_ADMIN_URL=admin/
DJANGO_ALLOWED_HOSTS=localhost,api
DJANGO_SECURE_SSL_REDIRECT=False
WEB_CONCURRENCY=2
REDIS_URL=redis://redis:6379/0
ENV

cat > env/web.env <<ENV
API_INTERNAL_URL=http://api:5000
SESSION_COOKIE_NAME=store_session
ENV
echo "wrote .env and env/*.env"
