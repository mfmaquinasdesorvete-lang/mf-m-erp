# Modelo da memória de cada chat

Arquivo: `.claude/skills/<sigla minúscula>/MEMORY.md`. Quem escreve é o próprio chat, porque é ele que sabe onde parou.

Regras:
- Até umas 60 linhas, frases curtas, em português simples.
- Repositório público: sem CNPJ, CPF, nomes de pessoas ou clientes, valores, senhas, chaves, links privados ou ids
  de sessão. Para falar de uma pessoa, use o papel dela (sócia, financeiro, técnico).
- Atualize no fim de cada pedido, no mesmo commit do trabalho. Troque o que mudou; não vire um diário.
- A armadilha técnica vai para "Cuidados conhecidos" na `SKILL.md`. A memória guarda o estado e as decisões.
- O que vale para todos os chats vai para o `MEMORY.md` da raiz (peça ao ELO).

```
# MEMORY — <SIGLA> (<nome do chat>)
Atualizado em <dd/mm/aaaa>.

## Estado agora
<2 ou 3 linhas: como está o assunto hoje>

## No ar
- <o que já funciona para a usuária, com o commit ou a migração>

## Em andamento
- <o que está sendo feito e onde parou>

## Esperando a usuária
- <o que depende dela: dado, arquivo, autorização, teste>

## Decisões da usuária
- <o que ela decidiu e não pode ser esquecido>

## Onde está
- Telas: <arquivos>
- Banco: <tabelas e funções>
- Funções do Supabase: <nomes>

## Próximos passos
1. <o que fazer depois>
```
