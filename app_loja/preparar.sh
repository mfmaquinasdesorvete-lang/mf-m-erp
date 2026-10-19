#!/usr/bin/env bash
# Gera as pastas android/, ios/ e web/ do app (uma vez) e ajusta nome e permissões.
# Uso:  cd app_loja && bash preparar.sh
set -euo pipefail
cd "$(dirname "$0")"

flutter create --org br.com.mfmaquinas --project-name loja_mf --platforms=android,ios,web . >/dev/null
# O flutter create deixa um teste de exemplo que não serve para este app
grep -qs 'MyApp' test/widget_test.dart && rm -f test/widget_test.dart

MANIFEST=android/app/src/main/AndroidManifest.xml
if [ -f "$MANIFEST" ]; then
  # Internet (o release do Android não vem com ela) e abrir links do WhatsApp
  grep -q 'android.permission.INTERNET' "$MANIFEST" || \
    sed -i.bak 's#<application#<uses-permission android:name="android.permission.INTERNET"/>\n    <application#' "$MANIFEST"
  grep -q '<data android:scheme="https"' "$MANIFEST" || \
    sed -i.bak 's#</manifest>#    <queries>\n        <intent>\n            <action android:name="android.intent.action.VIEW"/>\n            <data android:scheme="https"/>\n        </intent>\n    </queries>\n</manifest>#' "$MANIFEST"
  sed -i.bak 's#android:label="loja_mf"#android:label="MF Máquinas"#' "$MANIFEST"
  rm -f "$MANIFEST.bak"
fi

PLIST=ios/Runner/Info.plist
if [ -f "$PLIST" ]; then
  sed -i.bak 's#<string>loja_mf</string>#<string>MF Máquinas</string>#; s#<string>Loja Mf</string>#<string>MF Máquinas</string>#' "$PLIST"
  rm -f "$PLIST.bak"
fi

flutter pub get
echo "Pronto. Rode:  flutter run --dart-define-from-file=../.env.production"
