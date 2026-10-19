# App da loja (Flutter)

App Android/iOS da loja da MF Máquinas. Faz o mesmo que `/loja` do ERP web, usando as
mesmas funções do Supabase (`loja_dados`, `loja_criar_pedido`, `loja_meu_cadastro`,
`loja_salvar_cadastro`, `loja_meus_pedidos`):

- **Loja**: vitrine com filtros (Máquinas, Acessórios, Peças, Insumos) e página do produto
- **Carrinho**: fica salvo no celular; o pedido entra no ERP como orçamento (origem "loja")
- **Conta**: entrar, criar conta (tipo `cliente_loja`), esqueci a senha, cadastro com CPF/CNPJ
  (CNPJ e CEP preenchem o resto sozinhos)
- **Pedidos**: situação, itens, total, rastreio e WhatsApp sobre o pedido

Nenhuma chave fica no código: o app lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
do mesmo `.env.production` do ERP web.

## Baixar o APK pronto (sem instalar nada)

A cada mudança em `app_loja/`, o GitHub gera o APK sozinho:
**Actions → "App da loja (Flutter)" → última execução → Artifacts → `loja-mf-apk`**.
Descompacte e instale o `app-release.apk` no Android.

## Rodar no seu PC

```bash
cd app_loja
bash preparar.sh                                           # só na primeira vez
flutter run --dart-define-from-file=../.env.production     # celular ou emulador conectado
flutter build apk --release --dart-define-from-file=../.env.production
```

No Windows, rode o `preparar.sh` pelo Git Bash.

## Observações

- Links de confirmação de e-mail e de nova senha abrem a loja web (`LOJA_URL`,
  padrão `https://erp.myfrost.ai/loja`); depois é só entrar no app.
  Para trocar: `--dart-define=LOJA_URL=https://outro-endereco/loja`.
- Publicar na Play Store exige uma chave de assinatura própria (hoje o APK de release
  usa a chave de depuração gerada pelo Flutter).
