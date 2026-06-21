#!/usr/bin/env zsh
# Registers the guardian-notify pg_cron job against the linked Supabase project.
# Run once per environment (production, staging).
#
# Usage:
#   PROJECT_REF=xxxx CRON_SECRET=yyyy zsh scripts/register-guardian-cron.sh

set -e

if [[ -z "$PROJECT_REF" || -z "$CRON_SECRET" ]]; then
  echo "Error: PROJECT_REF and CRON_SECRET must be set."
  echo "Usage: PROJECT_REF=xxxx CRON_SECRET=yyyy zsh scripts/register-guardian-cron.sh"
  exit 1
fi

SQL_FILE=$(mktemp -t guardian-cron)

cat > "$SQL_FILE" << ENDSQL
SELECT cron.schedule(
  'guardian-notify',
  '*/5 * * * *',
  \$\$
  SELECT net.http_post(
    url     := 'https://${PROJECT_REF}.supabase.co/functions/v1/send-guardian-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ${CRON_SECRET}',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  \$\$
);
ENDSQL

echo "Registering CRON job..."
supabase db query --linked -f "$SQL_FILE"
rm "$SQL_FILE"

echo "Verifying..."
supabase db query --linked "SELECT jobid, schedule, jobname FROM cron.job WHERE jobname = 'guardian-notify';"
