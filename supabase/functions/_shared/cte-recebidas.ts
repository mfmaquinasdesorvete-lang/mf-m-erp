// CT-e recebidos pela Focus NFe: os conhecimentos de transporte em que a MF aparece (tomadora, remetente ou
// destinatária), que a Focus busca na SEFAZ (distribuição de documentos). A SEFAZ só guarda para distribuição os
// últimos 3 meses, por isso a busca roda a cada 15 minutos junto com as notas (nfe-processar).
// Para cada CT-e novo o ERP grava o básico da lista e depois baixa o XML (até `limite` por vez): com ele sabe quem paga o
// frete, a transportadora, as notas transportadas e o valor. A gravação e as ligações ficam no banco (salvar_cte_sefaz).
// A empresa precisa estar habilitada para CT-e recebidos na Focus (cadastro da empresa → manifestação de CT-e).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { onlyDigits } from "./supabase.ts";
import { codigoUnidade, erroDeToken, focus, recebidasDisponiveis } from "./focusnfe.ts";
import { lerCte, situacaoFocus } from "./cte-xml.ts";

export type CteFocus = {
  chave: string; nome_emitente: string; documento_emitente: string; valor_total: string | number; data_emissao: string;
  situacao: string; tipo_cte?: string; versao: number;
};
export type ResultadoCtes = { novos: number; atualizados: number; completos: number; avisos: string[] };

const SITUACAO = "ctes_recebidas_situacao";

/** Mensagem da Focus para CT-e: diz o que conferir quando a empresa não está habilitada. */
function erroCte(status: number, body: any, nome: string) {
  const msg = String(body?.mensagem || body?.codigo || `HTTP ${status}`).replace(/\.+$/, "");
  const dica = status === 404 || /habilit|permiss|n[aã]o autoriz|cte/i.test(msg)
    ? " — confira se a empresa está habilitada para CT-e recebidos na Focus (cadastro da empresa → manifestação de CT-e)" : "";
  return `${nome}: ${msg}${dica}`;
}

/** Busca a lista de CT-e novos de um CNPJ e grava o básico de cada um. */
async function sincronizarCnpj(db: SupabaseClient, u: { id: string; codigo: string; cnpj: string; nome: string }) {
  const chave = `ctes_recebidas_versao_${u.codigo}`;
  const { data: estado } = await db.from("sync_estado").select("valor").eq("chave", chave).maybeSingle();
  let versao = Number(estado?.valor ?? 0);
  let novos = 0, atualizados = 0;

  for (let pagina = 0; pagina < 50; pagina++) {
    const res = await focus(`/v2/ctes_recebidas?cnpj=${u.cnpj}&versao=${versao}`, {}, u.codigo, { recebidas: true });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401 || /token/i.test(String(err?.mensagem ?? ""))) throw erroDeToken(err, u.codigo, { recebidas: true });
      throw new Error(erroCte(res.status, err, u.nome));
    }
    const lista = (await res.json()) as CteFocus[];
    if (!Array.isArray(lista) || !lista.length) break;

    const chaves = lista.map((c) => onlyDigits(c.chave)).filter((c) => c.length === 44);
    const { data: existentes } = await db.from("ctes").select("chave, situacao").in("chave", chaves);
    const ja = new Map((existentes ?? []).map((e: any) => [e.chave as string, e.situacao as string]));
    for (const c of lista) {
      const k = onlyDigits(c.chave);
      if (k.length !== 44) continue;
      const situacao = situacaoFocus(c.situacao);
      if (ja.has(k) && ja.get(k) === situacao) continue;
      const { error } = await db.rpc("salvar_cte_sefaz", {
        p_dados: {
          chave: k, emissao: c.data_emissao, valor: c.valor_total, emitente_cnpj: onlyDigits(c.documento_emitente),
          emitente_nome: c.nome_emitente, situacao, versao: c.versao,
        },
        p_unidade: u.id,
      });
      if (error) throw new Error(`${u.nome}: CT-e ${k.slice(25, 34)} não gravou (${error.message})`);
      if (ja.has(k)) atualizados++; else novos++;
    }

    const maior = Math.max(...lista.map((c) => Number(c.versao) || 0));
    const maxHeader = Number(res.headers.get("X-Max-Version") ?? 0);
    if (maior <= versao) break;
    versao = maior;
    if (maxHeader && versao >= maxHeader) break;
  }

  await db.from("sync_estado").upsert({ chave, valor: String(versao), updated_at: new Date().toISOString() });
  return { novos, atualizados };
}

/** Baixa o XML na Focus com o token de uma das unidades (a que recebeu o CT-e primeiro). */
async function baixarXmlCte(chave: string, codigos: string[]): Promise<string | null> {
  for (const codigo of codigos) {
    const res = await focus(`/v2/ctes_recebidas/${chave}.xml`, {}, codigo, { recebidas: true }).catch(() => null);
    if (!res?.ok) continue;
    const xml = await res.text();
    if (xml.includes("infCte")) return xml;
  }
  return null;
}

/** Completa com o XML os CT-e que só têm o básico (até `limite` por vez; desiste depois de 30 tentativas). */
export async function completarCtes(db: SupabaseClient, limite = 30) {
  const { data: pendentes } = await db.from("ctes").select("id, chave, unidade_id, situacao, xml_tentativas")
    .not("chave", "is", null).is("xml", null).lt("xml_tentativas", 30)
    .order("emissao", { ascending: false }).limit(limite);
  if (!pendentes?.length) return 0;
  const { data: unidades } = await db.from("unidades").select("id, codigo").eq("ativo", true);
  const todos = (unidades ?? []).map((u: any) => u.codigo as string).filter(Boolean);
  let completos = 0;
  for (const p of pendentes as any[]) {
    const primeiro = await codigoUnidade(db, p.unidade_id);
    const xml = await baixarXmlCte(p.chave, [...new Set([primeiro, ...todos].filter(Boolean) as string[])]);
    let lido = null;
    try { lido = xml ? lerCte(xml) : null; } catch { lido = null; }
    if (!lido) {
      await db.from("ctes").update({ xml_tentativas: (p.xml_tentativas ?? 0) + 1 }).eq("id", p.id);
      continue;
    }
    const { error } = await db.rpc("salvar_cte_sefaz", {
      p_dados: {
        completo: true, chave: lido.chave, modelo: lido.modelo, numero: lido.numero, serie: lido.serie, tipo: lido.tipo, emissao: lido.emissao,
        cfop: lido.cfop, uf_inicio: lido.uf_inicio, municipio_inicio: lido.municipio_inicio, uf_fim: lido.uf_fim, municipio_fim: lido.municipio_fim,
        emitente_cnpj: lido.emitente.cnpj, emitente_nome: lido.emitente.nome,
        remetente_cnpj: lido.remetente?.cnpj, remetente_nome: lido.remetente?.nome,
        destinatario_cnpj: lido.destinatario?.cnpj, destinatario_nome: lido.destinatario?.nome,
        tomador: lido.tomador, tomador_cnpj: lido.tomador_cnpj, tomador_nome: lido.tomador_nome,
        valor: lido.valor, valor_carga: lido.valor_carga, produto: lido.produto, peso_kg: lido.peso_kg, volumes: lido.volumes, icms: lido.icms,
        nfe_chaves: lido.nfe_chaves, nf_numeros: lido.nf_numeros, prev_entrega: lido.prev_entrega, cobranca: lido.cobranca, xml,
        // a situação é a da lista da Focus (o cancelamento é um evento à parte, não vem no XML)
        situacao: lido.situacao === "denegado" ? "denegado" : p.situacao,
      },
      p_unidade: p.unidade_id,
    });
    if (error) await db.from("ctes").update({ xml_tentativas: (p.xml_tentativas ?? 0) + 1 }).eq("id", p.id);
    else completos++;
  }
  return completos;
}

/**
 * Busca os CT-e de cada unidade (matriz e filial) e completa os que faltam o XML. Uma unidade que a Focus recusar vai
 * para os avisos sem impedir a outra. Guarda o resultado para a tela (ctes_sefaz_situacao).
 */
export async function sincronizarCtes(db: SupabaseClient, limite = 30): Promise<ResultadoCtes> {
  const r: ResultadoCtes = { novos: 0, atualizados: 0, completos: 0, avisos: [] };
  if (!recebidasDisponiveis()) {
    r.avisos.push("os CT-e só existem no ambiente de produção da SEFAZ: falta o FOCUS_NFE_ENV producao ou o FOCUS_NFE_TOKEN_PRODUCAO");
  } else {
    const { data: unidades } = await db.from("unidades").select("id, codigo, nome, cnpj").eq("ativo", true);
    for (const u of (unidades ?? []).filter((x: any) => onlyDigits(x.cnpj).length === 14)) {
      try {
        const s = await sincronizarCnpj(db, { id: u.id, codigo: u.codigo, nome: u.nome, cnpj: onlyDigits(u.cnpj) });
        r.novos += s.novos; r.atualizados += s.atualizados;
      } catch (e) {
        r.avisos.push((e as Error).message);
      }
    }
    try { r.completos = await completarCtes(db, limite); } catch (e) { r.avisos.push(`XML dos CT-e: ${(e as Error).message}`); }
  }
  await db.from("sync_estado").upsert({
    chave: SITUACAO, updated_at: new Date().toISOString(),
    valor: JSON.stringify({ em: new Date().toISOString(), novos: r.novos, atualizados: r.atualizados, completos: r.completos, erro: r.avisos.join(" | ") || null }),
  });
  return r;
}
