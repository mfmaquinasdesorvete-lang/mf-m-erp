#!/usr/bin/env bash
# Gera o backup completo do ERP na pasta $BACKUP_DIR:
#   banco/roles.sql, banco/schema.sql, banco/data.sql  (como o Supabase recomenda para restaurar)
#   banco/interno.sql                                   (agendamentos, fila HTTP e Vault: só para consulta)
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
# Separa o que não se restaura num Supabase novo (o usuário postgres não grava aí e não faria sentido):
#   agendamentos (cron), fila HTTP (net), webhooks (supabase_functions) e segredos do Vault (cifrados com a chave
#   do projeto antigo) vão para banco/interno.sql, só para consulta; tabelas internas vazias (ex.: storage.buckets_vectors)
#   saem do arquivo. As tabelas do ERP (public) ficam todas, mesmo vazias.
awk -v dados="$TRAB/data.sql" -v interno="$BACKUP_DIR/banco/interno.sql" '
  BEGIN { print "-- Dados internos do Supabase, só para consulta: NÃO restaurar junto com data.sql" > interno }
  dentro { print > destino; if ($0 == "\\.") dentro = 0; next }
  pend != "" {
    if ($0 == "\\.") { pend = ""; next }
    print pend > destino; pend = ""; print > destino; dentro = 1; next
  }
  /^COPY .* FROM stdin;$/ {
    destino = ($2 ~ /^"?(cron|net|supabase_functions|vault)"?\./) ? interno : dados
    if ($2 ~ /^"?public"?\./) { print > destino; dentro = 1 } else pend = $0
    next
  }
  /^SELECT pg_catalog\.setval\(."?(cron|net|supabase_functions|vault)"?\./ { print > interno; next }
  { print > dados }
' "$BACKUP_DIR/banco/data.sql"
mv "$TRAB/data.sql" "$BACKUP_DIR/banco/data.sql"

node "$AQUI/arquivos.mjs"
cp "$AQUI/LEIA.txt" "$BACKUP_DIR/LEIA.txt"
echo "Backup gerado: $(du -sh "$BACKUP_DIR" | cut -f1)"
