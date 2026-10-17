// Mercado Livre (fase 2): o ERP manda o estoque e o preço para os anúncios.
//  enviarAnuncios: esvazia a fila (ml_sync_fila). Para cada anúncio calcula o estoque e o preço (o mesmo cálculo da
//    tela, em _shared/ml-anuncios.ts) e manda só o que mudou: PUT /items/{id}, ou /items/{id}/variations/{variação}.
//    Mudança de preço acima da trava não vai: fica esperando aprovação no ERP. Muitas chamadas (429): espera e tenta
//    de novo (1, 2, 4 e 8 segundos); se continuar, para e o resto vai no próximo envio.
//  buscarAnuncios: traz os anúncios da conta (ativos e pausados), com as variações, e liga pelo SKU igual ao do cadastro.
//  mudarSituacao: pausa ou reativa vários anúncios de uma vez (PUT /items/{id} { status }), como no Tiny.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { chamarML, ErroML } from "../_shared/mercadolivre.ts";
import {
  anunciosDoItem, caminhoAnuncio, configDaConta, erroPassageiro, esperaMinutos, planejarEnvio,
  type AnuncioCalculo, type AnuncioML, type ConfigEnvio,
} from "../_shared/ml-anuncios.ts";

type ContaEnvio = Partial<Record<keyof ConfigEnvio, unknown>> & { id: string; ml_user_id: number };
type ItemFila = { anuncio_id: string; motivo: string | null; forcar: boolean; versao: number; tentativas: number };
type Dados = AnuncioCalculo & {
  anuncio_id: string; ml_item_id: string; variation_id: string | null; titulo: string | null;
  lido_em: string | null; status_ml: string | null; estoque_ml: number | null;
};
type Resultado = "enviados" | "em_dia" | "aguardando" | "erros";

/** Limite de tempo de uma execução (a função tem uns 150 s; o agendamento chama de novo em 5 minutos). */
const LIMITE_MS = 100_000;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 400);

/** Acesso perdido ou o Mercado Livre segurando as chamadas: para e deixa o resto na fila. */
class Parar extends Error {}

/** Repete com espera crescente quando o Mercado Livre pede calma (429): 1, 2, 4 e 8 segundos. */
async function comEspera<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ErroML && e.status === 429 && i < 4) { await pausa(1000 * 2 ** i); continue; }
      throw e;
    }
  }
}

async function mandar(caminho: string, corpo: Record<string, number>, token: string) {
  await comEspera(() => chamarML(caminho, token, { method: "PUT", body: JSON.stringify(corpo), cabecalhos: { "Content-Type": "application/json" } }));
  await pausa(150); // sem pressa: o Mercado Livre limita as chamadas por minuto
}

// ---------------------------------------------------------------------
// Enviar estoque e preço (fila)
// ---------------------------------------------------------------------
export async function enviarAnuncios(db: SupabaseClient, conta: ContaEnvio, pegarToken: () => Promise<string>) {
  const cfg = configDaConta(conta);
  const resumo: Record<Resultado, number> & { restam: number; parou?: string; aviso?: string } = { enviados: 0, em_dia: 0, aguardando: 0, erros: 0, restam: 0 };
  if (!cfg.enviar_estoque && !cfg.enviar_preco) return { ...resumo, aviso: "o envio de estoque e de preço está desligado" };
  const inicio = Date.now();
  let token: string | null = null;
  lotes: while (Date.now() - inicio < LIMITE_MS) {
    const { data: lote, error } = await db.rpc("ml_fila_pegar", { p_limite: 40 });
    if (error) throw new Error(`fila do Mercado Livre: ${error.message}`);
    const fila = (lote ?? []) as ItemFila[];
    if (!fila.length) break;
    token ??= await pegarToken();
    const { data: linhas, error: e2 } = await db.rpc("ml_anuncios_dados", { p_anuncios: fila.map((f) => f.anuncio_id) });
    if (e2) throw new Error(`anúncios: ${e2.message}`);
    const porId = new Map(((linhas ?? []) as Dados[]).map((l) => [l.anuncio_id, l]));
    for (const f of fila) {
      // passou do tempo: o que sobrou deste lote volta para a fila em 3 minutos
      if (Date.now() - inicio > LIMITE_MS) break lotes;
      try {
        resumo[await enviarUm(db, cfg, porId.get(f.anuncio_id), f, token)]++;
      } catch (e) {
        if (e instanceof Parar) { resumo.parou = e.message; break lotes; }
        throw e;
      }
    }
  }
  const { count } = await db.from("ml_sync_fila").select("anuncio_id", { count: "exact", head: true });
  resumo.restam = count ?? 0;
  return resumo;
}

async function tirarDaFila(db: SupabaseClient, f: ItemFila) {
  // só se ninguém mudou o produto enquanto o envio acontecia (senão fica para a próxima volta)
  await db.from("ml_sync_fila").delete().eq("anuncio_id", f.anuncio_id).eq("versao", f.versao);
}

async function gravar(db: SupabaseClient, anuncioId: string, campos: Record<string, unknown>) {
  const agora = new Date().toISOString();
  const { error } = await db.from("ml_anuncios_envio").upsert({ anuncio_id: anuncioId, ...campos, atualizado_em: agora }, { onConflict: "anuncio_id" });
  if (error) console.error("mercadolivre: gravar envio", anuncioId, error.message);
}

/** Erro numa chamada: acesso ou limite param tudo; passageiro tenta de novo mais tarde; o resto fica como erro do anúncio. */
async function falhou(db: SupabaseClient, f: ItemFila, e: unknown): Promise<Resultado> {
  const status = e instanceof ErroML ? e.status : null;
  if (status === 401) throw new Parar("o Mercado Livre recusou o acesso: conecte a conta de novo");
  if (status === 429) throw new Parar("o Mercado Livre pediu para esperar (muitas chamadas): o resto vai no próximo envio");
  const agora = new Date().toISOString();
  await gravar(db, f.anuncio_id, { erro: msg(e), erro_em: agora, conferido_em: agora });
  if (erroPassageiro(status)) {
    const proxima = new Date(Date.now() + esperaMinutos(f.tentativas) * 60_000).toISOString();
    await db.from("ml_sync_fila").update({ proxima_em: proxima, ultimo_erro: msg(e) }).eq("anuncio_id", f.anuncio_id).eq("versao", f.versao);
  } else {
    await tirarDaFila(db, f);
  }
  return "erros";
}

async function enviarUm(db: SupabaseClient, cfg: ConfigEnvio, d: Dados | undefined, f: ItemFila, token: string): Promise<Resultado> {
  if (!d || !d.produto_id) { await tirarDaFila(db, f); return "em_dia"; }

  // primeira vez: lê o anúncio (o preço de lá vale de referência para a trava; Full e variações)
  if (!d.lido_em) {
    try {
      const item = await comEspera(() => chamarML(`/items/${encodeURIComponent(d.ml_item_id)}?include_attributes=all`, token));
      const linha = anunciosDoItem(item).find((x) => x.variation_id === (d.variation_id ?? "")) ?? null;
      const lido = {
        preco_ml: linha?.preco ?? null, estoque_ml: linha?.estoque ?? null,
        status_ml: item?.status ?? null, logistica: item?.shipping?.logistic_type ?? null, lido_em: new Date().toISOString(),
      };
      await gravar(db, d.anuncio_id, lido);
      Object.assign(d, lido);
      if (!linha) {
        const agora = new Date().toISOString();
        await gravar(db, d.anuncio_id, {
          erro: d.variation_id ? "esta variação não existe mais no anúncio" : "o anúncio tem variações: use \"Buscar anúncios\" e ligue cada variação a um produto",
          erro_em: agora, conferido_em: agora,
        });
        await tirarDaFila(db, f);
        return "erros";
      }
    } catch (e) {
      return await falhou(db, f, e);
    }
  }

  const plano = planejarEnvio(cfg, d, { forcar: f.forcar });
  const erros: string[] = plano.erro ? [plano.erro] : [];
  const corpo: Record<string, number> = {};
  if (plano.enviarEstoque && plano.estoque !== null) corpo.available_quantity = plano.estoque;
  if (plano.enviarPreco && plano.preco !== null) corpo.price = plano.preco;
  let foiEstoque = false;
  let foiPreco = false;
  if (Object.keys(corpo).length) {
    const caminho = caminhoAnuncio(d.ml_item_id, d.variation_id);
    const nome = (campo: string) => (campo === "price" ? "preço" : "estoque");
    try {
      await mandar(caminho, corpo, token);
      foiEstoque = "available_quantity" in corpo;
      foiPreco = "price" in corpo;
    } catch (e) {
      if (!(e instanceof ErroML) || erroPassageiro(e.status) || e.status === 401) return await falhou(db, f, e);
      if (Object.keys(corpo).length === 1) {
        erros.push(`${nome(Object.keys(corpo)[0])}: ${msg(e)}`);
      } else {
        // recusou os dois juntos: manda separado (um preço recusado não segura o estoque)
        for (const [campo, valor] of Object.entries(corpo)) {
          try {
            await mandar(caminho, { [campo]: valor }, token);
            if (campo === "price") foiPreco = true; else foiEstoque = true;
          } catch (e2) {
            if (!(e2 instanceof ErroML) || erroPassageiro(e2.status) || e2.status === 401) return await falhou(db, f, e2);
            erros.push(`${nome(campo)}: ${msg(e2)}`);
          }
        }
      }
    }
  }

  const agora = new Date().toISOString();
  await gravar(db, d.anuncio_id, {
    conferido_em: agora,
    preco_pendente: plano.travado?.para ?? null,
    preco_pendente_de: plano.travado?.de ?? null,
    erro: erros.length ? erros.join(" · ").slice(0, 500) : null,
    erro_em: erros.length ? agora : null,
    ...(foiEstoque ? { ultimo_estoque: plano.estoque, estoque_enviado_em: agora } : {}),
    ...(foiPreco ? { ultimo_preco: plano.preco, preco_enviado_em: agora, preco_aprovado: null } : {}),
  });
  await tirarDaFila(db, f);
  if (erros.length) return "erros";
  if (plano.travado) return "aguardando";
  return foiEstoque || foiPreco ? "enviados" : "em_dia";
}

// ---------------------------------------------------------------------
// Buscar os anúncios da conta
// ---------------------------------------------------------------------
export async function buscarAnuncios(db: SupabaseClient, conta: ContaEnvio, token: string) {
  const ids = new Set<string>();
  let mais = false;
  for (const status of ["active", "paused"]) {
    // a busca devolve até 1000 por situação (de 100 em 100)
    for (let offset = 0; offset < 1000; offset += 100) {
      const r = await comEspera(() => chamarML(`/users/${conta.ml_user_id}/items/search?status=${status}&limit=100&offset=${offset}`, token));
      const lista: string[] = Array.isArray(r?.results) ? r.results : [];
      lista.forEach((id) => ids.add(String(id)));
      const total = Number(r?.paging?.total ?? 0);
      if (lista.length < 100 || offset + 100 >= total) break;
      if (offset + 100 >= 1000) mais = true;
    }
  }
  const todos = [...ids];
  const linhas: AnuncioML[] = [];
  for (let i = 0; i < todos.length; i += 20) {
    const r = await comEspera(() => chamarML<any[]>(`/items?ids=${todos.slice(i, i + 20).map(encodeURIComponent).join(",")}&include_attributes=all`, token));
    for (const x of Array.isArray(r) ? r : []) if (Number(x?.code) === 200) linhas.push(...anunciosDoItem(x.body));
    await pausa(150);
  }
  const resumo = { anuncios: todos.length, total: 0, novos: 0, ligados: 0, sem_produto: 0, mais };
  for (let i = 0; i < linhas.length; i += 200) {
    const { data, error } = await db.rpc("ml_registrar_anuncios", { p: linhas.slice(i, i + 200) });
    if (error) throw new Error(`gravar anúncios: ${error.message}`);
    const d = (data ?? {}) as Record<string, number>;
    resumo.total += Number(d.total ?? 0);
    resumo.novos += Number(d.novos ?? 0);
    resumo.ligados += Number(d.ligados ?? 0);
    resumo.sem_produto = Number(d.sem_produto ?? 0);
  }
  return resumo;
}

// ---------------------------------------------------------------------
// Pausar ou reativar anúncios em massa
// ---------------------------------------------------------------------
/** Até 200 anúncios por vez; cada um que o Mercado Livre recusar volta com o motivo, sem parar os outros. */
export async function mudarSituacao(db: SupabaseClient, itens: unknown, status: unknown, token: string) {
  if (status !== "paused" && status !== "active") throw new Error("situação inválida: use pausar ou reativar");
  const ids = [...new Set((Array.isArray(itens) ? itens : []).map((x) => String(x ?? "").trim().toUpperCase()).filter((x) => /^[A-Z]{3}\d+$/.test(x)))];
  if (!ids.length) throw new Error("escolha ao menos um anúncio");
  if (ids.length > 200) throw new Error("no máximo 200 anúncios por vez");
  const r = { mudados: 0, erros: [] as { id: string; erro: string }[] };
  for (const id of ids) {
    try {
      await mandarSituacao(id, status, token);
      const { data } = await db.from("ml_anuncios").select("id").eq("ml_item_id", id);
      for (const a of data ?? []) await gravar(db, String((a as { id: string }).id), { status_ml: status });
      r.mudados++;
    } catch (e) {
      if (e instanceof ErroML && e.status === 401) throw e; // acesso perdido: para tudo
      r.erros.push({ id, erro: msg(e) });
    }
  }
  return r;
}

async function mandarSituacao(id: string, status: "paused" | "active", token: string) {
  await comEspera(() => chamarML(`/items/${id}`, token, { method: "PUT", body: JSON.stringify({ status }), cabecalhos: { "Content-Type": "application/json" } }));
  await pausa(150);
}
