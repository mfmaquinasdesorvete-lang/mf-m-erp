// Importa do Tiny / Olist ERP (API v2): contatos, produtos com estoque e contas em aberto.
// POST { acao: "status" }                  -> situação da importação e se o TINY_API_TOKEN está cadastrado
// POST { acao: "iniciar", unidade_id }     -> confere o token e começa do zero (o que já existe é atualizado, não duplica)
//      { ..., so_cadastros: true }           -> só clientes, fornecedores e transportadoras (com a data de cadastro no Tiny);
//                                             termina depois dos contatos, sem produtos nem contas
// POST { acao: "continuar" }               -> avança ~40 s e devolve o progresso; a tela chama de novo até concluir
// POST { acao: "datas_contatos", pagina }  -> só a data de cadastro no Tiny dos contatos já importados (~40 s por vez;
//                                             devolve a próxima página, ou null no fim)
// POST { acao: "recebidas", unidade_id, pagina, indice } -> contas a receber já pagas no Tiny (desde 2025), com a data do
//                                             pagamento, gravadas como recebidas e ligadas à venda (importar_recebidas_tiny);
//                                             ~40 s por vez, devolve onde parou (pagina/indice) ou pagina null no fim
// O Tiny limita as consultas por minuto: quando ele pede para esperar, a resposta traz { aguardar: segundos }.
import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import {
  contaParaItem, contatoParaItem, dataCadastroContato, num, produtoParaItem, recebidaParaItem, Ritmo, tiny, TinyErro, tinyToken,
} from "../_shared/tiny.ts";

const ETAPAS = ["contatos", "produtos", "receber_aberto", "receber_parcial", "pagar_aberto", "pagar_parcial", "concluida"] as const;
type Etapa = (typeof ETAPAS)[number];
const LOTE = 25;
const PRAZO_MS = 40_000;
/** Recebimentos: só as contas emitidas desde esta data (o extrato dos bancos no ERP começa em 2025). */
const RECEBIDAS_DESDE = "01/01/2025";

type Estado = {
  etapa: Etapa; pagina: number; indice: number; unidade_id: string | null;
  totais: Record<string, any>; erros: { quando: string; etapa: string; mensagem: string }[];
  atualizado_em: string | null;
};

/** Mensagem para quem está na tela quando o Tiny não deixa continuar. */
const motivoFatal = (e: TinyErro) => e.acessoBloqueado
  ? `o Tiny bloqueou o acesso à API desta conta ("${e.message}"). Isso é liberado pelo Tiny: peça ao suporte para ativar a API (token) da conta. Enquanto isso, os produtos podem vir pela planilha (Produtos → Importar).`
  : `o Tiny recusou o token: ${e.message}. Confira o TINY_API_TOKEN no Supabase.`;

const soma = (alvo: Record<string, number>, r: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(r ?? {})) if (typeof v === "number") alvo[k] = (alvo[k] ?? 0) + v;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { userId } = await requireErpUser(req, ["financeiro"]);
    const { acao, unidade_id, pagina, indice, so_cadastros } = await req.json();
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
        if (e instanceof TinyErro && e.fatal) throw new HttpError(400, motivoFatal(e));
        if (!(e instanceof TinyErro)) throw e;
      }
      const estado = {
        id: 1, etapa: "contatos", pagina: 1, indice: 0, unidade_id,
        totais: { conta: conta ? { nome: conta.nome ?? null, cnpj: conta.cpf_cnpj ?? null } : null, limite: ritmo.limite, so_cadastros: !!so_cadastros },
        erros: [], iniciado_por: userId, iniciado_em: new Date().toISOString(), atualizado_em: new Date(ritmo.ultima).toISOString(), concluido_em: null,
      };
      await db.from("importacao_tiny").upsert(estado);
      return json({ ok: true, configurado: true, estado });
    }

    if (acao === "datas_contatos") {
      const ritmo = new Ritmo();
      const fim = Date.now() + PRAZO_MS;
      let pg: number | null = Math.max(1, Number(pagina) || 1);
      let paginas = 1, lidos = 0, comData = 0, gravados = 0, aguardar = 0;
      let chaves: string[] | null = null;
      try {
        while (pg && Date.now() < fim) {
          const lista = await tiny("contatos.pesquisa.php", { pesquisa: "", pagina: pg }, token, ritmo);
          const regs: any[] = lista?.contatos?.map((x: any) => x.contato) ?? [];
          paginas = Number(lista?.numero_paginas) || paginas;
          if (!regs.length) { pg = null; break; }
          chaves ??= Object.keys(regs[0] ?? {});
          const itens = regs.map((r) => ({ id_externo: String(r?.id ?? ""), data: dataCadastroContato(r) })).filter((x) => x.id_externo && x.data);
          lidos += regs.length;
          comData += itens.length;
          if (itens.length) {
            const { data, error } = await dbUsuario.rpc("datas_contatos_tiny", { p_itens: itens });
            if (error) throw new HttpError(400, error.message);
            gravados += Number((data as { gravados?: number })?.gravados ?? 0);
          }
          pg = pg + 1 > paginas ? null : pg + 1;
        }
      } catch (x) {
        if (x instanceof TinyErro && x.excessoDeConsultas) aguardar = 60;
        else if (x instanceof TinyErro && x.fatal) throw new HttpError(400, motivoFatal(x));
        else throw x;
      }
      // sem nenhuma data, devolve só os nomes dos campos que o Tiny mandou (para achar o campo certo), nunca os valores
      return json({ ok: true, pagina: pg, paginas, lidos, com_data: comData, gravados, aguardar, campos: comData ? undefined : chaves });
    }

    if (acao === "recebidas") {
      const { data: u } = await db.from("unidades").select("id").eq("id", unidade_id).maybeSingle();
      if (!u) throw new HttpError(400, "escolha a unidade das contas que não têm venda ligada");
      const ritmo = new Ritmo();
      const fim = Date.now() + PRAZO_MS;
      let pg: number | null = Math.max(1, Number(pagina) || 1);
      let ind = Math.max(0, Number(indice) || 0);
      let paginas = 1, lidas = 0, aguardar = 0;
      const totais: Record<string, number> = {};
      const erros: string[] = [];
      let chaves: string[] | null = null;
      try {
        while (pg && Date.now() < fim) {
          const lista = await tiny("contas.receber.pesquisa.php", { pagina: pg, situacao: "pago", data_ini_emissao: RECEBIDAS_DESDE }, token, ritmo);
          const contas: any[] = lista?.contas?.map((x: any) => x.conta) ?? [];
          paginas = Number(lista?.numero_paginas) || paginas;
          if (!contas.length) { pg = null; break; }
          // a página em lotes de LOTE contas (cada lote é gravado antes do próximo: se o tempo acabar, nada se perde)
          while (ind < contas.length && !aguardar && Date.now() < fim) {
            const itens: ReturnType<typeof recebidaParaItem>[] = [];
            while (ind < contas.length && itens.length < LOTE && Date.now() < fim) {
              const c = contas[ind];
              try {
                // o detalhe traz a data do pagamento e o contato; a pesquisa só traz o vencimento
                const d = (await tiny("conta.receber.obter.php", { id: c.id }, token, ritmo))?.conta;
                if (d && !chaves) chaves = Object.keys(d);
                itens.push(recebidaParaItem({ ...c, ...(d ?? {}) }));
              } catch (x) {
                if (x instanceof TinyErro && x.excessoDeConsultas) { aguardar = 60; break; }
                if (x instanceof TinyErro && x.fatal) throw x;
                itens.push(recebidaParaItem(c)); // sem o detalhe, grava com o que veio na pesquisa
              }
              ind++; lidas++;
            }
            if (itens.length) {
              const { data, error } = await dbUsuario.rpc("importar_recebidas_tiny", { p_itens: itens, p_unidade: unidade_id });
              if (error) throw new HttpError(400, error.message);
              const r = (data ?? {}) as Record<string, unknown>;
              soma(totais, r);
              for (const x of (r.erros as { id: string; erro: string }[] | undefined) ?? []) erros.push(`${x.id}: ${x.erro}`);
            }
          }
          if (aguardar || ind < contas.length) break;
          if (ind >= contas.length) { ind = 0; pg = pg + 1 > paginas ? null : pg + 1; }
        }
      } catch (x) {
        if (x instanceof TinyErro && x.excessoDeConsultas) aguardar = 60;
        else if (x instanceof TinyErro && x.fatal) throw new HttpError(400, motivoFatal(x));
        else throw x;
      }
      // sem a data do pagamento, devolve só os nomes dos campos que o Tiny mandou (para achar o campo certo), nunca os valores
      return json({ ok: true, pagina: pg, indice: ind, paginas, lidas, aguardar, ...totais, erros: erros.slice(0, 20),
        campos: totais.sem_data ? chaves : undefined });
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
    // só cadastros: depois dos contatos já termina (produtos e contas ficam como estão)
    const proxima = () => {
      e.etapa = e.totais.so_cadastros && e.etapa === "contatos" ? "concluida" : ETAPAS[ETAPAS.indexOf(e.etapa) + 1];
      e.pagina = 1; e.indice = 0;
    };
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
          const datas: { id_externo: string; data: string }[] = [];
          let lidos = 0, ignorados = 0;
          try {
            while (e.indice < registros.length && itens.length < LOTE && Date.now() < fim) {
              const r = registros[e.indice];
              try {
                if (contatos) {
                  const d = await tiny("contato.obter.php", { id: r.id }, token, ritmo);
                  const item = contatoParaItem(d?.contato ?? r);
                  if (item) itens.push(item); else ignorados++;
                  const data = dataCadastroContato(d?.contato) ?? dataCadastroContato(r);
                  if (item && data) datas.push({ id_externo: item.id_externo, data });
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
                if (x instanceof TinyErro && x.fatal) throw x;
                erro(`${r.nome ?? r.id}: ${(x as Error).message}`);
                lidos++;
              }
              e.indice++;
            }
            if (itens.length) {
              soma(t, contatos
                ? await rpc("importar_contatos", { p_itens: itens })
                : await rpc("importar_produtos", { p_itens: itens, p_unidade: e.unidade_id, p_lancar_estoque: true }));
              // a data de cadastro no Tiny vale como "cliente desde" (a data da importação não)
              if (datas.length) await rpc("datas_contatos_tiny", { p_itens: datas });
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
      } else if (x instanceof TinyErro && x.fatal) {
        await salvar();
        throw new HttpError(400, motivoFatal(x));
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
