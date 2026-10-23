#!/usr/bin/env bash
# Monta o site do ERP Line e grava na branch "site" (de onde a Hostinger publica).
# Sempre igual em todos os chats, para um não apagar o trabalho do outro:
#   - monta a partir da paineis-no-ar mais nova do GitHub (com o que todos os chats já enviaram);
#   - junta os arquivos do site.zip mais novo da branch site (quem está com a versão antiga aberta não vê erro);
#   - se outro chat gravou na branch site no meio do caminho, o envio é recusado: rode de novo.
# Antes de rodar, pegue a trava no banco (veja o CLAUDE.md). Depois, publique na Hostinger e solte a trava.
# Uso: scripts/publicar-site.sh   (SEM_ENVIAR=1 monta e confere, sem gravar na branch site)
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"
tmp="$(mktemp -d)"
trap 'git worktree remove --force "$tmp/codigo" 2>/dev/null; git worktree remove --force "$tmp/site" 2>/dev/null; rm -rf "$tmp"' EXIT

git fetch -q origin paineis-no-ar site
codigo="$(git rev-parse --short origin/paineis-no-ar)"
echo "Montando o site da paineis-no-ar $codigo"

git worktree add -q --detach "$tmp/codigo" origin/paineis-no-ar
git worktree add -q --detach "$tmp/site" origin/site

cd "$tmp/codigo"
if [ -d "$repo/node_modules" ] && cmp -s "$repo/package-lock.json" package-lock.json; then
  ln -s "$repo/node_modules" node_modules
else
  npm ci --no-audit --no-fund
fi
npx vite build >/dev/null

# arquivos das versões anteriores entram sem sobrescrever os novos
unzip -q -n "$tmp/site/site.zip" -d dist
python3 -I - dist "$tmp/site/site.zip" <<'PY'
import os, sys, zipfile
raiz, destino = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
    for pasta, _, arquivos in os.walk(raiz):
        for a in arquivos:
            cam = os.path.join(pasta, a)
            z.write(cam, os.path.relpath(cam, raiz))
PY

cd "$tmp/site"
git add site.zip
git commit -q -m "site $codigo"
if [ "${SEM_ENVIAR:-}" = 1 ]; then echo "Teste: montado ($(unzip -l site.zip | tail -1)), nada enviado."; exit 0; fi
if ! git push -q origin HEAD:site; then
  echo "Outro chat gravou na branch site agora há pouco. Nada foi enviado: rode de novo." >&2
  exit 1
fi
echo "Gravado na branch site: $(git rev-parse --short HEAD) (código $codigo)."
echo "Agora: publicar na Hostinger (branch site, pasta _deploy, arquivo _deploy/site.zip) e conferir o index.html."
