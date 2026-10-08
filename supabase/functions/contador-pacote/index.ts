// Pacote do fechamento mensal para o contador: ZIP com os XML (NF-e emitidas, canceladas, recebidas,
// cartas de correção e inutilizações) e planilhas (saídas e entradas por CFOP, notas, pagamentos e recebimentos).
// POST { acao: "gerar", competencia: "2026-09", unidade_id, enviar_email? } -> { url, arquivos, faltando }
// POST { acao: "link", fechamento_id }                                    -> link novo para baixar o último pacote
// Agendamento (Authorization: Bearer ERP_CRON_TOKEN): envia sozinho o mês anterior no dia configurado.
import { createClient } from "npm:@supabase/supabase-js@2.86.0";
import { zipSync, strToU8 } from "npm:fflate@0.8.2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, HttpError } from "../_shared/supabase.ts";
import { focusBaseUrl, focusToken, focusUrl } from "../_shared/focusnfe.ts";
import { baixarXml } from "../_shared/nfe-recebidas.ts";
import { lerNfe } from "../_shared/nfe-xml.ts";
import { enviarEmail } from "../_shared/email.ts";

type Db = ReturnType<typeof adminClient>;
const SETE_DIAS = 7 * 24 * 3600;

/** Contador ou financeiro/admin. */
async function autorizar(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new HttpError(401, "não autenticado");
  const u = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: { user } } = await u.auth.getUser();
  if (!user) throw new HttpError(401, "sessão inválida");
  const [{ data: contador }, { data: fin }] = await Promise.all([u.rpc("e_contador"), u.rpc("tem_algum_papel", { p_papeis: ["financeiro"] })]);
  if (!contador && !fin) throw new HttpError(403, "sem permissão");
  return { contador: !!contador };
}

/** Baixa um arquivo da Focus (com o token) ou de qualquer URL pública. */
async function baixar(url: string | null | undefined, codigo?: string | null): Promise<string | null> {
  if (!url) return null;
  const token = focusToken(codigo);
  const headers: Record<string, string> = url.startsWith(focusBaseUrl()) && token ? { Authorization: "Basic " + btoa(`${token}:`) } : {};
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

const csv = (linhas: (string | number | null | undefined)[][]) =>
  "﻿" + linhas.map((l) => l.map((v) => {
    const s = v == null ? "" : typeof v === "number" ? v.toFixed(2).replace(".", ",") : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\r\n");

function periodo(comp: string) {
  const [a, m] = comp.split("-").map(Number);
  const ini = `${comp}-01`;
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10); // 1º dia do mês seguinte
  return { ini, fim };
}

async function gerar(db: Db, competencia: string, unidadeId: string) {
  const { ini, fim } = periodo(competencia);
  const { data: u } = await db.from("unidades").select("*").eq("id", unidadeId).single();
  if (!u) throw new HttpError(404, "unidade não encontrada");
  const arquivos: Record<string, Uint8Array> = {};
  const faltando: string[] = [];

  // NF-e emitidas no mês (autorizadas e canceladas)
  const { data: notas } = await db.from("notas_fiscais")
    .select("id, numero, serie, chave, status, valor_total, created_at, xml_url, danfe_url, resposta, payload, destinatario_nome, destinatario_doc, pedido:pedidos(numero, cliente:clientes(nome, cpf_cnpj, uf)), importado:notas_fiscais_xml(xml, xml_cancelamento)")
    .eq("unidade_id", unidadeId).gte("created_at", ini).lt("created_at", fim).in("status", ["autorizada", "cancelada"]);
  const cfops = new Map<string, { base: number; icms: number; ipi: number; pis: number; cofins: number; valor: number; n: number }>();
  for (const n of notas ?? []) {
    const nome = n.chave || `nota-${n.numero}`;
    const imp = (Array.isArray(n.importado) ? n.importado[0] : n.importado) as { xml: string; xml_cancelamento: string | null } | null;
    const xml = imp?.xml ?? await baixar(n.xml_url, u.codigo);
    if (xml) arquivos[`saidas/${n.status === "cancelada" ? "canceladas/" : ""}${nome}.xml`] = strToU8(xml);
    else faltando.push(`XML da NF-e ${n.numero ?? n.id}`);
    if (n.status === "cancelada") {
      const canc = imp?.xml_cancelamento ?? await baixar(focusUrl(n.resposta?.caminho_xml_cancelamento), u.codigo);
      if (canc) arquivos[`saidas/canceladas/${nome}-cancelamento.xml`] = strToU8(canc);
      continue;
    }
    for (const i of n.payload?.items ?? []) {
      const c = cfops.get(i.cfop) ?? { base: 0, icms: 0, ipi: 0, pis: 0, cofins: 0, valor: 0, n: 0 };
      c.valor += Number(i.valor_bruto ?? 0); c.base += Number(i.icms_base_calculo ?? 0); c.icms += Number(i.icms_valor ?? 0);
      c.ipi += Number(i.ipi_valor ?? 0); c.pis += Number(i.pis_valor ?? 0); c.cofins += Number(i.cofins_valor ?? 0); c.n++;
      cfops.set(i.cfop, c);
    }
  }

  // Cartas de correção e inutilizações do mês
  const { data: cartas } = await db.from("nfe_cartas_correcao").select("sequencia, xml_url, nota:notas_fiscais!inner(chave, unidade_id)")
    .eq("status", "autorizada").eq("nota.unidade_id", unidadeId).gte("created_at", ini).lt("created_at", fim);
  for (const c of cartas ?? []) { const x = await baixar(c.xml_url, u.codigo); if (x) arquivos[`saidas/cartas-correcao/${(c as any).nota?.chave}-cce${c.sequencia ?? ""}.xml`] = strToU8(x); }
  const { data: inut } = await db.from("nfe_inutilizacoes").select("serie, numero_inicial, numero_final, xml_url").eq("unidade_id", unidadeId)
    .eq("status", "autorizada").gte("created_at", ini).lt("created_at", fim);
  for (const i of inut ?? []) { const x = await baixar(i.xml_url, u.codigo); if (x) arquivos[`saidas/inutilizacoes/serie${i.serie}-${i.numero_inicial}-${i.numero_final}.xml`] = strToU8(x); }

  // NF-e recebidas (entradas)
  const { data: recebidas } = await db.from("nfe_recebidas").select("id, chave, emitente_nome, emitente_cnpj, valor_total, data_emissao, situacao, manifestacao, xml, itens")
    .eq("unidade_id", unidadeId).gte("data_emissao", ini).lt("data_emissao", fim);
  const entradas = new Map<string, { valor: number; n: number }>();
  for (const r of recebidas ?? []) {
    const xml = r.xml || await baixarXml(db, r.chave);
    if (xml) arquivos[`entradas/${r.chave}.xml`] = strToU8(xml); else faltando.push(`XML da nota de ${r.emitente_nome} (${r.chave})`);
    // nota antiga importada do XML ainda sem itens lidos: lê do próprio XML
    let itens = (r.itens ?? []) as any[];
    if (!itens.length && xml) try { itens = lerNfe(xml).itens; } catch (_) { /* XML ilegível: fica sem o resumo por CFOP */ }
    for (const i of itens) {
      const k = i.cfop ?? "sem CFOP";
      const e = entradas.get(k) ?? { valor: 0, n: 0 };
      e.valor += Number(i.valor_total ?? 0); e.n++;
      entradas.set(k, e);
    }
  }

  // Financeiro do mês (pelo pagamento)
  const { data: recebido } = await db.from("contas_receber").select("descricao, valor, valor_pago, vencimento, data_pagamento, forma_pagamento, cliente:clientes(nome)")
    .eq("unidade_id", unidadeId).eq("status", "pago").gte("data_pagamento", ini).lt("data_pagamento", fim);
  const { data: pago } = await db.from("contas_pagar").select("descricao, categoria, documento, valor, valor_pago, vencimento, data_pagamento, fornecedor:fornecedores(nome, cnpj)")
    .eq("unidade_id", unidadeId).eq("status", "pago").gte("data_pagamento", ini).lt("data_pagamento", fim);

  const autorizadas = (notas ?? []).filter((n) => n.status === "autorizada");
  const total = (l: { valor_total: number }[]) => l.reduce((s, n) => s + Number(n.valor_total ?? 0), 0);
  arquivos["saidas-por-cfop.csv"] = strToU8(csv([["CFOP", "Itens", "Valor dos produtos", "Base ICMS", "ICMS", "IPI", "PIS", "COFINS"],
    ...[...cfops.entries()].sort().map(([k, c]) => [k, c.n, c.valor, c.base, c.icms, c.ipi, c.pis, c.cofins])]));
  arquivos["entradas-por-cfop.csv"] = strToU8(csv([["CFOP do fornecedor", "Itens", "Valor dos produtos"], ...[...entradas.entries()].sort().map(([k, e]) => [k, e.n, e.valor])]));
  arquivos["notas-emitidas.csv"] = strToU8(csv([["Número", "Série", "Chave", "Data", "Situação", "Destinatário", "CPF/CNPJ", "UF", "Valor"],
    ...(notas ?? []).map((n: any) => [n.numero, n.serie, n.chave, n.created_at.slice(0, 10), n.status, n.pedido?.cliente?.nome ?? n.destinatario_nome, n.pedido?.cliente?.cpf_cnpj ?? n.destinatario_doc, n.pedido?.cliente?.uf ?? n.payload?.uf_destinatario, Number(n.valor_total)])]));
  arquivos["notas-recebidas.csv"] = strToU8(csv([["Número", "Chave", "Emissão", "Fornecedor", "CNPJ", "Valor", "Situação", "Manifestação"],
    ...(recebidas ?? []).map((r) => [r.chave.slice(25, 34).replace(/^0+/, ""), r.chave, r.data_emissao?.slice(0, 10), r.emitente_nome, r.emitente_cnpj, Number(r.valor_total), r.situacao, r.manifestacao])]));
  arquivos["recebimentos.csv"] = strToU8(csv([["Data", "Cliente", "Descrição", "Forma", "Valor recebido"],
    ...(recebido ?? []).map((c: any) => [c.data_pagamento, c.cliente?.nome, c.descricao, c.forma_pagamento, Number(c.valor_pago ?? c.valor)])]));
  arquivos["pagamentos.csv"] = strToU8(csv([["Data", "Fornecedor", "CNPJ", "Descrição", "Categoria", "Documento", "Valor pago"],
    ...(pago ?? []).map((c: any) => [c.data_pagamento, c.fornecedor?.nome, c.fornecedor?.cnpj, c.descricao, c.categoria, c.documento, Number(c.valor_pago ?? c.valor)])]));
  const resumo = {
    emitidas: autorizadas.length, valor_emitidas: total(autorizadas), canceladas: (notas ?? []).length - autorizadas.length,
    recebidas: (recebidas ?? []).length, valor_recebidas: total(recebidas ?? []), cartas: (cartas ?? []).length, inutilizacoes: (inut ?? []).length,
    recebimentos: (recebido ?? []).reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0), pagamentos: (pago ?? []).reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0),
    faltando: faltando.length,
  };
  const [ano, mes] = competencia.split("-");
  arquivos["LEIA-ME.txt"] = strToU8([
    `Fechamento ${mes}/${ano} — ${u.razao_social ?? u.nome} (${u.nome}) — CNPJ ${u.cnpj ?? ""}`, "",
    `NF-e emitidas autorizadas: ${resumo.emitidas} (R$ ${resumo.valor_emitidas.toFixed(2)}) · canceladas: ${resumo.canceladas}`,
    `NF-e recebidas: ${resumo.recebidas} (R$ ${resumo.valor_recebidas.toFixed(2)}) · cartas de correção: ${resumo.cartas} · inutilizações: ${resumo.inutilizacoes}`,
    `Recebimentos no mês: R$ ${resumo.recebimentos.toFixed(2)} · pagamentos: R$ ${resumo.pagamentos.toFixed(2)}`, "",
    faltando.length ? `Não foi possível baixar:\n- ${faltando.join("\n- ")}` : "Todos os XML incluídos.", "",
    `Gerado pelo ERP Line em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
  ].join("\r\n"));

  const zip = zipSync(arquivos, { level: 6 });
  const caminho = `${competencia}/${u.codigo}-${Date.now()}.zip`;
  const { error } = await db.storage.from("contador").upload(caminho, zip, { contentType: "application/zip" });
  if (error) throw error;
  const { data: link } = await db.storage.from("contador").createSignedUrl(caminho, SETE_DIAS, { download: `fechamento-${u.codigo}-${competencia}.zip` });
  return { caminho, url: link?.signedUrl ?? null, arquivos: Object.keys(arquivos).length, faltando, resumo, unidade: u };
}

async function registrar(db: Db, unidadeId: string, competencia: string, r: { caminho: string; resumo: unknown }, enviado: boolean) {
  const { data: atual } = await db.from("fechamentos").select("status").eq("unidade_id", unidadeId).eq("competencia", competencia).maybeSingle();
  await db.from("fechamentos").upsert({
    unidade_id: unidadeId, competencia, arquivo_caminho: r.caminho, resumo: r.resumo,
    ...(enviado ? { enviado_em: new Date().toISOString(), status: atual?.status === "fechado" ? "fechado" : "enviado" } : { status: atual?.status ?? "aberto" }),
  }, { onConflict: "unidade_id,competencia" });
}

async function enviarAoContador(db: Db, competencia: string, r: Awaited<ReturnType<typeof gerar>>) {
  const { data: cfg } = await db.from("configuracoes").select("contador_email, contador_nome, nome_fantasia, razao_social, email").eq("id", 1).single();
  if (!cfg?.contador_email) throw new HttpError(400, "cadastre o e-mail do contador em Configurações");
  const [ano, mes] = competencia.split("-");
  const site = (Deno.env.get("ERP_SITE_URL") ?? "").replace(/\/$/, "");
  const empresa = cfg.nome_fantasia || cfg.razao_social;
  const texto = [
    `Olá${cfg.contador_nome ? ` ${cfg.contador_nome.split(" ")[0]}` : ""}!`, "",
    `Segue o fechamento de ${mes}/${ano} da ${empresa} — ${r.unidade.nome} (CNPJ ${r.unidade.cnpj ?? ""}).`,
    `NF-e emitidas: ${r.resumo.emitidas} · canceladas: ${r.resumo.canceladas} · recebidas: ${r.resumo.recebidas}.`, "",
    `Baixe o pacote (XML + planilhas), válido por 7 dias: ${r.url}`,
    site ? `Ou entre no painel do contador: ${site}/contador` : "", "", empresa,
  ].join("\n");
  await enviarEmail({
    para: cfg.contador_email, assunto: `Fechamento ${mes}/${ano} — ${empresa} (${r.unidade.nome})`, texto,
    html: texto.split("\n").map((l) => l.replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')).join("<br>"),
    responderPara: cfg.email, idempotencia: `fechamento-${r.unidade.id}-${competencia}-${r.caminho}`,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = adminClient();
  try {
    const cron = Deno.env.get("ERP_CRON_TOKEN");
    if (cron && req.headers.get("Authorization") === `Bearer ${cron}`) {
      const { data: cfg } = await db.from("configuracoes").select("contador_envio_auto, contador_envio_dia, contador_email").eq("id", 1).single();
      const hojeSP = new Date(Date.now() - 3 * 3600_000);
      if (!cfg?.contador_envio_auto || !cfg.contador_email || hojeSP.getUTCDate() !== cfg.contador_envio_dia) return json({ ok: true, enviado: 0 });
      const ant = new Date(Date.UTC(hojeSP.getUTCFullYear(), hojeSP.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
      const { data: unidades } = await db.from("unidades").select("id").eq("ativo", true);
      let enviados = 0;
      for (const u of unidades ?? []) {
        const { data: f } = await db.from("fechamentos").select("enviado_em").eq("unidade_id", u.id).eq("competencia", ant).maybeSingle();
        if (f?.enviado_em) continue;
        const r = await gerar(db, ant, u.id);
        await enviarAoContador(db, ant, r);
        await registrar(db, u.id, ant, r, true);
        enviados++;
      }
      return json({ ok: true, enviados });
    }

    const { contador } = await autorizar(req);
    const body = await req.json();
    if (body.acao === "link") {
      const { data: f } = await db.from("fechamentos").select("arquivo_caminho, competencia, unidade:unidades(codigo)").eq("id", body.fechamento_id).single();
      if (!f?.arquivo_caminho) throw new HttpError(404, "nenhum pacote gerado ainda");
      const { data } = await db.storage.from("contador").createSignedUrl(f.arquivo_caminho, SETE_DIAS, { download: `fechamento-${(f as any).unidade?.codigo}-${f.competencia}.zip` });
      return json({ url: data?.signedUrl });
    }
    if (body.acao !== "gerar") throw new HttpError(400, "ação inválida");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.competencia ?? "")) throw new HttpError(400, "competência inválida");
    const r = await gerar(db, body.competencia, body.unidade_id);
    const enviar = !!body.enviar_email && !contador;
    if (enviar) await enviarAoContador(db, body.competencia, r);
    await registrar(db, body.unidade_id, body.competencia, r, enviar);
    return json({ ok: true, url: r.url, arquivos: r.arquivos, faltando: r.faltando, resumo: r.resumo, enviado: enviar });
  } catch (e) {
    return json({ error: (e as Error).message }, e instanceof HttpError ? e.status : 500);
  }
});
