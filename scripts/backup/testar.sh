#!/usr/bin/env bash
# Teste de restauração: sobe um Supabase local (no próprio GitHub), restaura o banco do backup do jeito que o
# Supabase ensina e confere se cada tabela voltou com o mesmo número de linhas. Resultado em restauracao.json.
# Agendamentos (cron) e a fila de chamadas HTTP (net) não são restaurados aqui: o banco de teste não chama nada de fora.
set -uo pipefail
: "${BACKUP_DIR:?}"
RES="$(dirname "$BACKUP_DIR")/restauracao.json"
AQUI="$(cd "$(dirname "$0")" && pwd)"
INICIO=$(date +%s)
falhou() { printf '{"ok":false,"motivo":"%s"}' "$1" > "$RES"; echo "Teste de restauração: FALHOU ($1)"; exit 1; }

LOCAL="$(mktemp -d)"
cd "$LOCAL"
supabase init < /dev/null > /dev/null 2>&1 || falhou "supabase init"
supabase start -x realtime,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgrest,postgres-meta,kong < /dev/null > start.log 2>&1 \
  || { tail -5 start.log; falhou "não subiu o banco de teste"; }
URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
URL_ADMIN="postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres"   # papéis com ajustes que só o superusuário faz
# mensagens de erro sem valores entre aspas (o log é público)
limpo() { grep -m3 -i "error" "$1" | sed -E "s/\"[^\"]*\"/\"…\"/g; s/'[^']*'/'…'/g" | cut -c1-160; }

# dados sem os agendamentos e a fila HTTP
awk '
  /^COPY "?(cron|net|supabase_functions)"?\./ { pular=1; next }
  pular && /^\\\.$/ { pular=0; next }
  !pular { print }
' "$BACKUP_DIR/banco/data.sql" > "$LOCAL/data-teste.sql"

psql --quiet --single-transaction --variable ON_ERROR_STOP=1 --file "$BACKUP_DIR/banco/roles.sql" --dbname "$URL_ADMIN" > papeis.log 2>&1 \
  || { limpo papeis.log; falhou "os papéis não restauraram"; }
psql --quiet --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$BACKUP_DIR/banco/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$LOCAL/data-teste.sql" \
  --dbname "$URL" > restaura.log 2>&1 \
  || { limpo restaura.log; falhou "o banco não restaurou"; }

node "$AQUI/conferir.mjs" "$URL" "$RES" "$(( $(date +%s) - INICIO ))" || falhou "contagens diferentes"
supabase stop --no-backup < /dev/null > /dev/null 2>&1 || true
