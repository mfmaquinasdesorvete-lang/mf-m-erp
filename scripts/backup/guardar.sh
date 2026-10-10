#!/usr/bin/env bash
# Empacota e criptografa o backup (GPG, AES-256, com a frase do secret BACKUP_CHAVE), divide em partes de 45 MB,
# guarda no bucket privado "backups" do Supabase e registra no ERP. A Hostinger baixa daí todo dia.
set -euo pipefail
: "${BACKUP_DIR:?}"
if [ "${#BACKUP_CHAVE}" -lt 16 ]; then
  echo "::error::Falta o secret BACKUP_CHAVE (uma frase longa, com 16 caracteres ou mais) em Settings → Secrets and variables → Actions."
  exit 1
fi
AQUI="$(cd "$(dirname "$0")" && pwd)"
NOME="$(basename "$BACKUP_DIR")"
SAIDA="$(mktemp -d)"

tar -C "$(dirname "$BACKUP_DIR")" -czf "$SAIDA/$NOME.tar.gz" "$NOME"
printf '%s' "$BACKUP_CHAVE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 --s2k-digest-algo SHA512 --s2k-count 65011712 --compress-algo none \
  -o "$SAIDA/$NOME.tar.gz.gpg" "$SAIDA/$NOME.tar.gz"
rm "${SAIDA:?}/${NOME:?}.tar.gz"
split -b 45M -d -a 3 "$SAIDA/$NOME.tar.gz.gpg" "$SAIDA/parte-"

node "$AQUI/registrar.mjs" ok "$SAIDA" "$NOME"
