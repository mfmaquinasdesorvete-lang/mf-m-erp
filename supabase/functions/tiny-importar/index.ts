// Importa do Tiny / Olist ERP (API v2): contatos, produtos com estoque e contas em aberto.
// POST { acao: "status" }                  -> situação da importação e se o TINY_API_TOKEN está cadastrado
// POST { acao: "iniciar", unidade_id }     -> confere o token e começa do zero (o que já existe é atualizado, não duplica)
// POST { acao: "continuar" }               -> avança ~40 s e devolve o progresso; a tela chama de novo até concluir
// O Tiny limita as consultas por minuto: quando ele pede para esperar, a resposta traz { aguardar: segundos }.
import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { contaParaItem, contatoParaItem, num, produtoParaItem, Ritmo, tiny, TinyErro, tinyToken } from "../_shared/tiny.ts";

const ETAPAS = ["contatos", "produtos", "receber_aberto", "receber_parcial", "pagar_aberto", "pagar_parcial", "concluida"] as const;
type Etapa = (typeof ETAPAS)[number];
const LOTE = 25;
const PRAZO_MS = 40_000;

type Estado = {
  etapa: Etapa; pagina: number; indice: number; unidade_id: string | null;
  totais: Record<string, any>; erros: { quando: string; etapa: string; mensagem: string }[];
  atualizado_em: string | null;
};

const soma = (alvo: Record<string, number>, r: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(r ?? {})) if (typeof v === "number") alvo[k] = (alvo[k] ?? 0) + v;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { userId } = await requireErpUser(req, ["financeiro"]);
    const { acao, unidade_id } = await req.json();
    const db = adminClient();
    // as funções de importação conferem o papel de quem chamou
    const dbUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false },
    });
    const token = tinyToken();
    const { data: atual } = await db.from("importacao_tiny").select("*").eq("id", 1).maybeSingle();

    if (acao === "status") return json({ ok: true, configurado: !!token, estado: atual });
    if (!token) throw new HttpError(400, "cadastre o token do Tiny no Supabase (Edge Functions → Secrets) com o nome TINY_API_TOKEN");

    if (acao === "iniciar") {
      const { data: u } = await db.from("unidades").select("id").eq("id", unidade_id).maybeSingle();
      if (!u) throw new HttpError(400, "escolha a unidade em que entram o estoque e as contas");
      const ritmo = new Ritmo();
      let conta: any = null;
      try {
        conta = (await tiny("info.obter.php", {}, token, ritmo))?.conta ?? null;
      } catch (e) {
        if (e instanceof TinyErro && e.tokenInvalido) throw new HttpError(400, `o Tiny recusou o token: ${e.message}. Confira o TINY_API_TOKEN no Supabase.`);
        if (!(e instanceof TinyErro)) throw e;
      }
      const estado = {
        id: 1, etapa: "contatos", pagina: 1, indice: 0, unidade_id,
        totais: { conta: conta ? { nome: conta.nome ?? null, cnpj: conta.cpf_cnpj ?? null } : null, limite: ritmo.limite },
        erros: [], iniciado_por: userId, iniciado_em: new Date().toISOString(), atualizado_em: new Date(ritmo.ultima).toISOString(), concluido_em: null,
      };
      await db.from("importacao_tiny").upsert(estado);
      return json({ ok: true, configurado: true, estado });
    }

    if (acao !== "continuar") throw new HttpError(400, "ação inválida");
    if (!atual) throw new HttpError(400, "comece a importação primeiro");
    const e: Estado = { ...atual, totais: atual.totais ?? {}, erros: atual.erros ?? [] };
    if (e.etapa === "concluida") return json({ ok: true, configurado: true, estado: atual });

    const ritmo = new Ritmo(Number(e.totais.limite) || 30, e.atualizado_em ? Date.parse(e.atualizado_em) : 0);
    const fim = Date.now() + PRAZO_MS;
    const total = (chave: string) => (e.totais[chave] ??= {});
    const erro = (mensagem: string) => {
      e.erros = [...e.erros, { quando: new Date().toISOString(), etapa: e.etapa, mensagem: mensagem.slice(0, 300) }].slice(-50);
    };
    const proxima = () => { e.etapa = ETAPAS[ETAPAS.indexOf(e.etapa) + 1]; e.pagina = 1; e.indice = 0; };
    const salvar = async () => {
      e.totais.limite = ritmo.limite;
      await db.from("importacao_tiny").update({
        etapa: e.etapa, pagina: e.pagina, indice: e.indice, totais: e.totais, erros: e.erros,
        atualizado_em: new Date(ritmo.ultima || Date.now()).toISOString(),
        concluido_em: e.etapa === "concluida" ? new Date().toISOString() : null,
      }).eq("id", 1);
    };
    const rpc = async (nome: string, args: Record<string, unknown>) => {
      const { data, error } = await dbUsuario.rpc(nome, args);
      if (error) throw new HttpError(400, error.message);
      return data as Record<string, unknown>;
    };

    let aguardar = 0;
    try {
      // (a etapa muda dentro do laço por proxima(); a função evita o estreitamento de tipo do TypeScript)
      const etapa = (): Etapa => e.etapa;
      while (Date.now() < fim && etapa() !== "concluida") {
        if (e.etapa === "contatos" || e.etapa === "produtos") {
          const contatos = e.etapa === "contatos";
          const lista = await tiny(contatos ? "contatos.pesquisa.php" : "produtos.pesquisa.php", { pesquisa: "", pagina: e.pagina }, token, ritmo);
          const registros: any[] = (contatos ? lista?.contatos?.map((x: any) => x.contato) : lista?.produtos?.map((x: any) => x.produto)) ?? [];
          if (!registros.length) { proxima(); await salvar(); continue; }
          const t = total(e.etapa);
          t.paginas = Number(lista.numero_paginas) || t.paginas || 1;
          // se algo der errado antes de gravar o lote, a próxima chamada recomeça deste ponto
          const inicioLote = e.indice;
          const itens: any[] = [];
          let lidos = 0, ignorados = 0;
          try {
            while (e.indice < registros.length && itens.length < LOTE && Date.now() < fim) {
              const r = registros[e.indice];
              try {
                if (contatos) {
                  const d = await tiny("contato.obter.php", { id: r.id }, token, ritmo);
                  const item = contatoParaItem(d?.contato ?? r);
                  if (item) itens.push(item); else ignorados++;
                } else {
                  const d = (await tiny("produto.obter.php", { id: r.id }, token, ritmo))?.produto;
                  // o saldo às vezes já vem na pesquisa; se não, consulta o estoque (só de quem vai entrar)
                  let saldo: number | null = r.saldo != null && String(r.saldo) !== "" ? num(r.saldo) : null;
                  if (d && saldo == null && produtoParaItem(d, 0)) {
                    const est = await tiny("produto.obter.estoque.php", { id: r.id }, token, ritmo);
                    saldo = est?.produto?.saldo != null ? num(est.produto.saldo) : 0;
                  }
                  const item = d ? produtoParaItem(d, saldo) : null;
                  if (item) itens.push(item); else ignorados++;
                }
                lidos++;
              } catch (x) {
                if (x instanceof TinyErro && x.excessoDeConsultas) { aguardar = 60; break; }
                if (x instanceof TinyErro && x.tokenInvalido) throw x;
                erro(`${r.nome ?? r.id}: ${(x as Error).message}`);
                lidos++;
              }
              e.indice++;
            }
            if (itens.length) {
              soma(t, contatos
                ? await rpc("importar_contatos", { p_itens: itens })
                : await rpc("importar_produtos", { p_itens: itens, p_unidade: e.unidade_id, p_lancar_estoque: true }));
            }
          } catch (x) {
            e.indice = inicioLote;
            throw x;
          }
          t.lidos = (t.lidos ?? 0) + lidos;
          t.ignorados = (t.ignorados ?? 0) + ignorados;
          if (e.indice >= registros.length) {
            e.pagina++; e.indice = 0;
            if (e.pagina > (Number(lista.numero_paginas) || 1)) proxima();
          }
          await salvar();
          if (aguardar) break;
          continue;
        }

        // contas em aberto (e parcialmente pagas): a página inteira de uma vez
        const receber = e.etapa.startsWith("receber");
        const lista = await tiny(receber ? "contas.receber.pesquisa.php" : "contas.pagar.pesquisa.php",
          { pagina: e.pagina, situacao: e.etapa.endsWith("parcial") ? "parcial" : "aberto" }, token, ritmo);
        const contas: any[] = lista?.contas?.map((x: any) => x.conta) ?? [];
        if (!contas.length) { proxima(); await salvar(); continue; }
        const t = total(receber ? "receber" : "pagar");
        t.lidas = (t.lidas ?? 0) + contas.length;
        soma(t, await rpc("importar_contas", { p_tipo: receber ? "receber" : "pagar", p_itens: contas.map(contaParaItem), p_unidade: e.unidade_id }));
        e.pagina++;
        if (e.pagina > (Number(lista.numero_paginas) || 1)) proxima();
        await salvar();
      }
    } catch (x) {
      if (x instanceof TinyErro && x.excessoDeConsultas) {
        aguardar = 60;
        await salvar();
      } else if (x instanceof TinyErro && x.tokenInvalido) {
        await salvar();
        throw new HttpError(400, `o Tiny recusou o token: ${x.message}. Confira o TINY_API_TOKEN no Supabase.`);
      } else {
        erro((x as Error).message);
        await salvar();
        throw x;
      }
    }

    const { data: depois } = await db.from("importacao_tiny").select("*").eq("id", 1).single();
    return json({ ok: true, configurado: true, estado: depois, aguardar });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
