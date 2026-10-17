// Histórico do Tiny / Olist ERP (API v2) para a migração: todos os pedidos de venda, com itens, e o vínculo com as
// NF-e do Tiny já importadas. Não mexe em estoque, contas, comissão nem avisa cliente (ver importar_pedidos_tiny).
// POST { acao: "status" }                  -> situação da importação e se o TINY_API_TOKEN está cadastrado
// POST { acao: "iniciar", unidade_id }     -> começa do zero (o que já entrou não duplica; pedido igual nem é consultado)
// POST { acao: "continuar" }               -> avança ~40 s e devolve o progresso; a tela chama de novo até concluir
// Etapas: notas (lista das NF-e do Tiny, 100 por consulta) -> pedidos (pesquisa + pedido.obter de cada um) -> ligar.
import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError, requireErpUser } from "../_shared/supabase.ts";
import { Ritmo, tiny, TinyErro, tinyToken } from "../_shared/tiny.ts";

const ETAPAS = ["notas", "pedidos", "ligar", "concluida"] as const;
type Etapa = (typeof ETAPAS)[number];
const LOTE = 20;
const PRAZO_MS = 40_000;

type Estado = {
  etapa: Etapa; pagina: number; indice: number; unidade_id: string | null;
  totais: Record<string, any>; erros: { quando: string; etapa: string; mensagem: string }[];
  atualizado_em: string | null;
};

const motivoFatal = (e: TinyErro) => e.acessoBloqueado
  ? `o Tiny bloqueou o acesso à API desta conta ("${e.message}"). Isso é liberado pelo Tiny: peça ao suporte para ativar a API (token) da conta.`
  : `o Tiny recusou o token: ${e.message}. Confira o TINY_API_TOKEN no Supabase.`;

const soma = (alvo: Record<string, number>, r: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(r ?? {})) if (typeof v === "number") alvo[k] = (alvo[k] ?? 0) + v;
};
const texto = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { userId } = await requireErpUser(req);
    const dbUsuario = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } }, auth: { persistSession: false },
    });
    const { data: admin } = await dbUsuario.rpc("is_erp_admin");
    if (!admin) throw new HttpError(403, "só o administrador importa o histórico do Tiny");
    const { acao, unidade_id } = await req.json();
    const db = adminClient();
    const token = tinyToken();
    const { data: atual } = await db.from("importacao_tiny_historico").select("*").eq("id", 1).maybeSingle();
    // recusa do Tiny (token ou API bloqueada na conta) fica guardada para a tela mostrar o motivo sem precisar clicar
    const registrarBloqueio = async (mensagem: string) => {
      if (!atual) return;
      await db.from("importacao_tiny_historico")
        .update({ totais: { ...(atual.totais ?? {}), bloqueio: { mensagem, em: new Date().toISOString() } } }).eq("id", 1);
    };

    if (acao === "status") return json({ ok: true, configurado: !!token, estado: atual });
    if (!token) throw new HttpError(400, "cadastre o token do Tiny no Supabase (Edge Functions → Secrets) com o nome TINY_API_TOKEN");

    if (acao === "iniciar") {
      const { data: u } = await db.from("unidades").select("id").eq("id", unidade_id).maybeSingle();
      if (!u) throw new HttpError(400, "escolha a unidade da conta do Tiny");
      const ritmo = new Ritmo();
      let conta: any = null;
      try {
        conta = (await tiny("info.obter.php", {}, token, ritmo))?.conta ?? null;
      } catch (e) {
        if (e instanceof TinyErro && e.fatal) {
          await registrarBloqueio(motivoFatal(e));
          throw new HttpError(400, motivoFatal(e));
        }
        if (!(e instanceof TinyErro)) throw e;
      }
      const estado = {
        id: 1, etapa: "notas", pagina: 1, indice: 0, unidade_id,
        totais: { conta: conta ? { nome: conta.razao_social ?? conta.nome ?? null, cnpj: conta.cnpj ?? conta.cpf_cnpj ?? null } : null, limite: ritmo.limite },
        erros: [], iniciado_por: userId, iniciado_em: new Date().toISOString(), atualizado_em: new Date(ritmo.ultima).toISOString(), concluido_em: null,
      };
      await db.from("importacao_tiny_historico").upsert(estado);
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
    let bloqueado = false;
    const salvar = async () => {
      e.totais.limite = ritmo.limite;
      if (!bloqueado) delete e.totais.bloqueio; // o Tiny respondeu: a recusa anterior não vale mais
      await db.from("importacao_tiny_historico").update({
        etapa: e.etapa, pagina: e.pagina, indice: e.indice, totais: e.totais, erros: e.erros,
        atualizado_em: new Date(ritmo.ultima || Date.now()).toISOString(),
        concluido_em: e.etapa === "concluida" ? new Date().toISOString() : null,
      }).eq("id", 1);
    };
    const rpc = async (nome: string, args: Record<string, unknown>) => {
      const { data, error } = await dbUsuario.rpc(nome, args);
      if (error) throw new HttpError(400, error.message);
      return data as Record<string, any>;
    };
    const guardar = async (tipo: "pedido" | "nota", docs: any[]) => {
      if (!docs.length) return;
      const { error } = await db.from("tiny_documentos").upsert(docs.map((d) => ({
        tipo, tiny_id: texto(d.id), dados: d, situacao: texto(d.situacao_pesquisa ?? d.situacao ?? d.descricao_situacao) || null,
        atualizado_em: new Date().toISOString(),
      })), { onConflict: "tipo,tiny_id" });
      if (error) throw new HttpError(500, error.message);
    };

    let aguardar = 0;
    try {
      const etapa = (): Etapa => e.etapa;
      while (Date.now() < fim && etapa() !== "concluida") {
        // 1) NF-e de saída do Tiny: só número, série e chave importam (para ligar ao pedido); 100 por consulta
        if (e.etapa === "notas") {
          let lista: any = null;
          try {
            lista = await tiny("notas.fiscais.pesquisa.php", { tipoNota: "S", pagina: e.pagina }, token, ritmo);
          } catch (x) {
            if (x instanceof TinyErro && !x.fatal && !x.excessoDeConsultas) {
              // sem a lista das notas a ligação ainda acontece por cliente + valor + data
              erro(`lista de notas do Tiny: ${x.message}`); proxima(); await salvar(); continue;
            }
            throw x;
          }
          const notas: any[] = (lista?.notas_fiscais ?? lista?.notas ?? []).map((x: any) => x.nota_fiscal ?? x.nota ?? x);
          if (!notas.length) { proxima(); await salvar(); continue; }
          await guardar("nota", notas.filter((n) => texto(n.id)));
          const t = total("notas");
          t.lidas = (t.lidas ?? 0) + notas.length;
          t.paginas = Number(lista.numero_paginas) || 1;
          e.pagina++;
          if (e.pagina > (Number(lista.numero_paginas) || 1)) proxima();
          await salvar();
          continue;
        }

        // 3) liga as NF-e importadas aos pedidos
        if (e.etapa === "ligar") {
          const r = await rpc("ligar_notas_tiny", { p_unidade: e.unidade_id });
          e.totais.notas_ligadas = r;
          proxima();
          await salvar();
          continue;
        }

        // 2) pedidos: a pesquisa traz 100 por página; o detalhe (itens, cliente, parcelas, nota) vem do pedido.obter
        const lista = await tiny("pedidos.pesquisa.php", { pagina: e.pagina }, token, ritmo);
        const registros: any[] = (lista?.pedidos ?? []).map((x: any) => x.pedido ?? x);
        if (!registros.length) { proxima(); await salvar(); continue; }
        const t = total("pedidos");
        t.paginas = Number(lista.numero_paginas) || t.paginas || 1;
        // o que já entrou com a mesma situação não é consultado de novo
        const ids = registros.map((r) => texto(r.id)).filter(Boolean);
        const { data: ja } = await db.from("tiny_documentos").select("tiny_id, situacao, importado_em").eq("tipo", "pedido").in("tiny_id", ids);
        const feitos = new Map((ja ?? []).filter((d: any) => d.importado_em).map((d: any) => [d.tiny_id, d.situacao]));
        const inicioLote = e.indice;
        const docs: any[] = [];
        let lidos = 0, pulados = 0;
        try {
          while (e.indice < registros.length && docs.length < LOTE && Date.now() < fim) {
            const r = registros[e.indice];
            const id = texto(r.id);
            if (!id) { e.indice++; continue; }
            if (feitos.has(id) && feitos.get(id) === (texto(r.situacao) || null)) { pulados++; e.indice++; continue; }
            try {
              const d = (await tiny("pedido.obter.php", { id }, token, ritmo))?.pedido;
              // guarda a situação como veio na pesquisa: é com ela que a próxima importação compara
              if (d) docs.push({ ...d, id: texto(d.id) || id, situacao_pesquisa: texto(r.situacao) || null });
              lidos++;
            } catch (x) {
              if (x instanceof TinyErro && x.excessoDeConsultas) { aguardar = 60; break; }
              if (x instanceof TinyErro && x.fatal) throw x;
              erro(`pedido ${r.numero ?? id}: ${(x as Error).message}`);
              lidos++;
            }
            e.indice++;
          }
          if (docs.length) {
            await guardar("pedido", docs);
            const r = await rpc("importar_pedidos_tiny", { p_unidade: e.unidade_id, p_ids: docs.map((d) => texto(d.id)) });
            for (const x of r.erros ?? []) erro(`pedido ${x.pedido}: ${x.erro}`);
            soma(t, r);
          }
        } catch (x) {
          e.indice = inicioLote;
          throw x;
        }
        t.lidos = (t.lidos ?? 0) + lidos;
        t.pulados = (t.pulados ?? 0) + pulados;
        if (e.indice >= registros.length) {
          e.pagina++; e.indice = 0;
          if (e.pagina > (Number(lista.numero_paginas) || 1)) proxima();
        }
        await salvar();
        if (aguardar) break;
      }
    } catch (x) {
      if (x instanceof TinyErro && x.excessoDeConsultas) {
        aguardar = 60;
        await salvar();
      } else if (x instanceof TinyErro && x.fatal) {
        bloqueado = true;
        e.totais.bloqueio = { mensagem: motivoFatal(x), em: new Date().toISOString() };
        await salvar();
        throw new HttpError(400, motivoFatal(x));
      } else {
        erro((x as Error).message);
        await salvar();
        throw x;
      }
    }

    const { data: depois } = await db.from("importacao_tiny_historico").select("*").eq("id", 1).single();
    return json({ ok: true, configurado: true, estado: depois, aguardar });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: (e as Error).message }, status);
  }
});
