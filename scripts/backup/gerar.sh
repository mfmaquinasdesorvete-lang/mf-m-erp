#!/usr/bin/env bash
# Gera o backup completo do ERP na pasta $BACKUP_DIR:
#   banco/roles.sql, banco/schema.sql, banco/data.sql  (como o Supabase recomenda para restaurar)
#   arquivos/<bucket>/...                               (todos os arquivos do Storage, menos os próprios backups)
#   manifesto.json e LEIA.txt
# Usa só o SUPABASE_ACCESS_TOKEN: o Supabase CLI cria um acesso temporário ao banco (sem a senha do banco).
# Nada de dados vai para o log (o repositório é público): só totais.
set -euo pipefail
: "${BACKUP_DIR:?}" "${PROJECT_REF:?}" "${SUPABASE_ACCESS_TOKEN:?falta o secret SUPABASE_ACCESS_TOKEN}"
unset SUPABASE_DB_PASSWORD
mkdir -p "$BACKUP_DIR/banco" "$BACKUP_DIR/arquivos"
AQUI="$(cd "$(dirname "$0")" && pwd)"

TRAB="$(mktemp -d)"
cd "$TRAB"
supabase link --project-ref "$PROJECT_REF" < /dev/null > /dev/null
supabase db dump --linked --role-only -f "$BACKUP_DIR/banco/roles.sql" < /dev/null
supabase db dump --linked -f "$BACKUP_DIR/banco/schema.sql" < /dev/null
supabase db dump --linked --data-only --use-copy -f "$BACKUP_DIR/banco/data.sql" < /dev/null

node "$AQUI/arquivos.mjs"
cp "$AQUI/LEIA.txt" "$BACKUP_DIR/LEIA.txt"
echo "Backup gerado: $(du -sh "$BACKUP_DIR" | cut -f1)"
