// NFS-e (nota de serviço) pela Focus NFe, a partir da ordem de serviço.
//  - A referência é gravada no banco ANTES de chamar a Focus (uma linha por tentativa, com a foto do que foi enviado).
//  - Sem resposta (tempo esgotado, rede, erro 5xx) a nota fica "incerto" e nunca é reenviada às cegas: primeiro o ERP
//    consulta pela mesma referência; só reenvia (mesma referência, mesmo conteúdo) se a Focus disser que não a recebeu.
//  - Aviso da Focus (webhook) e consulta periódica passam pela mesma função (consultarNfse): o resultado vem sempre da Focus.
//  - "autorizada" em produção fatura a OS e liga a conta a receber (trigger no banco); cancelada desfaz.
//  - Padrão nacional (/v2/nfsen, DPS numerada pelo ERP) ou o da prefeitura (/v2/nfse), conforme nfse_config da unidade.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { codigoUnidade, erroDeToken, focus, focusProducao, focusUrl } from "./focusnfe.ts";
import { HttpError, onlyDigits } from "./supabase.ts";

type Db = SupabaseClient;
type Linha = Record<string, any>;
export type Nfse = Linha & { id: string; referencia: string; status: string; padrao: string; unidade_id: string; ambiente: string };

const TEMPO_FOCUS = 25_000;
/** Reenvios automáticos (só quando a Focus confirma que não recebeu a referência). */
export const MAX_TENTATIVAS = 5;
const ESPERA_PENDENTE_MS = 2 * 60_000;

const caminho = (padrao: string, ref?: string) => `/v2/${padrao === "nacional" ? "nfsen" : "nfse"}${ref ? `/${encodeURIComponent(ref)}` : ""}`;
const ambienteAtual = () => (focusProducao() ? "producao" : "homologacao");
const agora = () => new Date().toISOString();
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Data e hora de Brasília no formato da Focus (2026-10-10T14:30:00-03:00). */
export const agoraBR = (ms = Date.now()) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 19) + "-03:00";
const corta = (v: unknown, n: number) => (v == null ? "" : String(v).trim().replace(/\s+/g, " ").slice(0, n));
/** Tira chaves vazias (a Focus valida campo informado mesmo vazio). */
function limpo<T extends Linha>(o: T): T {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === null || v === undefined || v === "") delete o[k];
    else if (typeof v === "object" && !Array.isArray(v)) {
      limpo(v);
      if (!Object.keys(v).length) delete o[k];
    }
  }
  return o;
}

async function lerJson(res: Response): Promise<any> {
  const texto = await res.text().catch(() => "");
  try { return texto ? JSON.parse(texto) : {}; } catch { return { mensagem: texto.slice(0, 300) }; }
}

/** Erros da Focus/prefeitura em texto: "código — mensagem — Correção: …" */
export function mensagemErros(body: any): string {
  const erros = Array.isArray(body?.erros) ? body.erros : [];
  const partes = erros.map((e: any) => [e?.codigo, e?.mensagem, e?.correcao && `Correção: ${e.correcao}`].filter(Boolean).join(" — "));
  return (partes.join(" | ") || body?.mensagem || body?.codigo || "erro sem descrição").slice(0, 1000);
}

/** A Focus já tem esta referência (envio anterior que chegou, mesmo sem a resposta ter voltado). */
const jaRecebida = (b: any) =>
  b?.codigo === "nfe_autorizada" || /j[aá] (existe|autorizad|processad|enviad|cancelad)|diferente do usado no primeiro envio/i.test(String(b?.mensagem ?? ""));

const SITUACAO_TEXTO: Record<string, string> = {
  processando_autorizacao: "recebida, aguardando a prefeitura", autorizado: "autorizada", cancelado: "cancelada", negado: "negada",
  erro_autorizacao: "não autorizada", erro_cancelamento: "cancelamento recusado",
};
const resumo = (b: any) => (b?.status
  ? `${SITUACAO_TEXTO[b.status] ?? b.status}${b.erros || b.mensagem ? `: ${mensagemErros(b)}` : ""}`
  : b?.mensagem || b?.codigo || null);

/** Dados da nota autorizada/cancelada (só o que veio preenchido, para não apagar o que já existe). */
function dadosNota(b: any) {
  const chave = String(b?.url ?? "").match(/chave=(\d{44,50})/)?.[1] ?? String(b?.caminho_xml_nota_fiscal ?? "").match(/NFS(\d{44,50})/)?.[1];
  return limpo({
    numero: b?.numero != null ? String(b.numero) : null, codigo_verificacao: b?.codigo_verificacao, data_emissao: b?.data_emissao,
    url: b?.url, url_danfse: b?.url_danfse, xml_url: focusUrl(b?.caminho_xml_nota_fiscal), chave_acesso: chave,
  } as Linha);
}

/** Situação da Focus → situação do ERP (null = não muda). */
export function situacaoFocus(b: any): { status: string | null; campos: Linha } {
  switch (b?.status) {
    case "processando_autorizacao": return { status: "processando", campos: { mensagem: null } };
    case "autorizado": return { status: "autorizada", campos: { ...dadosNota(b), mensagem: null } };
    case "cancelado": return { status: "cancelada", campos: { ...dadosNota(b), mensagem: null } };
    case "erro_autorizacao": case "negado": return { status: "rejeitada", campos: { mensagem: mensagemErros(b) } };
    case "erro_cancelamento": return { status: null, campos: { mensagem: `Cancelamento recusado: ${mensagemErros(b)}` } };
    default: return { status: null, campos: {} };
  }
}

/** Mudanças aceitas: cancelada é final; autorizada só vira cancelada; o resultado da Focus vence o "rejeitada". */
export function podeMudar(de: string, para: string) {
  if (de === para) return true;
  if (de === "cancelada") return false;
  if (de === "autorizada") return para === "cancelada";
  if (de === "rejeitada") return para === "autorizada" || para === "cancelada";
  return true;
}

export async function evento(db: Db, nfseId: string, tipo: string, e: { http_status?: number | null; detalhe?: string | null; dados?: unknown; usuario_id?: string | null; status_antes?: string | null; status_depois?: string | null } = {}) {
  await db.from("nfse_eventos").insert({
    nfse_id: nfseId, tipo, http_status: e.http_status ?? null, detalhe: e.detalhe ? String(e.detalhe).slice(0, 2000) : null,
    dados: e.dados ?? null, usuario_id: e.usuario_id ?? null, status_antes: e.status_antes ?? null, status_depois: e.status_depois ?? null,
  });
}

async function mudar(db: Db, n: Nfse, campos: Linha): Promise<Nfse> {
  if (campos.status && !podeMudar(n.status, campos.status)) delete campos.status;
  const { data, error } = await db.from("nfse").update(campos).eq("id", n.id).select("*").single();
  if (error) {
    await evento(db, n.id, "erro", { detalhe: `Não foi possível gravar o retorno: ${error.message}` });
    throw new HttpError(500, error.message);
  }
  return data as Nfse;
}

/** Aplica um retorno da Focus (consulta, aviso ou envio aceito). */
async function aplicarRetorno(db: Db, n: Nfse, body: any, origem: string, http: number, usuario?: string | null): Promise<Nfse> {
  const { status, campos } = situacaoFocus(body);
  const novo = status && podeMudar(n.status, status) ? status : n.status;
  await evento(db, n.id, origem, { http_status: http, detalhe: resumo(body), dados: body, usuario_id: usuario, status_antes: n.status, status_depois: novo });
  return await mudar(db, n, { ...campos, status: novo, resposta: body, ultima_consulta_em: agora() });
}

/** Nota feita em outro ambiente (ex.: teste em homologação e o ERP agora em produção): não consulta nem reenvia. */
const outroAmbiente = (n: Nfse) => n.ambiente !== ambienteAtual();

// ---------------------------------------------------------------------------------------------------------------
// Envio, consulta, reenvio e cancelamento
// ---------------------------------------------------------------------------------------------------------------

async function enviar(db: Db, n: Nfse, tipo: "envio" | "reenvio", usuario?: string | null): Promise<{ nfse: Nfse; mensagem?: string }> {
  const codigo = await codigoUnidade(db, n.unidade_id);
  const tentativas = (n.tentativas ?? 0) + 1;
  let res: Response;
  try {
    res = await focus(`${caminho(n.padrao)}?ref=${encodeURIComponent(n.referencia)}`,
      { method: "POST", body: JSON.stringify(n.payload), signal: AbortSignal.timeout(TEMPO_FOCUS) }, codigo);
  } catch (e) {
    if (e instanceof HttpError) {
      // token não cadastrado: nada saiu do ERP, pode corrigir e enviar de novo
      await evento(db, n.id, "erro", { detalhe: e.message, usuario_id: usuario });
      return { nfse: await mudar(db, n, { status: "rejeitada", mensagem: e.message, tentativas }), mensagem: e.message };
    }
    await evento(db, n.id, "timeout", { detalhe: `Sem resposta da Focus (${(e as Error).name}): consultar pela mesma referência antes de reenviar`, usuario_id: usuario });
    const atual = await mudar(db, n, { status: "incerto", tentativas, mensagem: "A Focus não respondeu a tempo. O ERP vai consultar pela mesma referência antes de qualquer reenvio." });
    return { nfse: atual, mensagem: "A Focus não respondeu a tempo. O ERP vai conferir pela mesma referência, sem emitir de novo" };
  }

  const body = await lerJson(res);
  await evento(db, n.id, tipo, { http_status: res.status, detalhe: resumo(body), dados: body, usuario_id: usuario });
  if (res.status === 401 || res.status === 403) {
    const err = erroDeToken(body, codigo);
    return { nfse: await mudar(db, n, { status: "rejeitada", mensagem: err.message, resposta: body, tentativas }), mensagem: err.message };
  }
  if (res.ok) {
    const { status, campos } = situacaoFocus(body);
    return { nfse: await mudar(db, n, { ...campos, status: status ?? "processando", resposta: body, tentativas }) };
  }
  if (res.status >= 500 || res.status === 429) {
    const atual = await mudar(db, n, { status: "incerto", tentativas, resposta: body, mensagem: `A Focus respondeu ${res.status}. O ERP vai consultar pela mesma referência antes de qualquer reenvio.` });
    return { nfse: atual, mensagem: "A Focus está instável: o ERP vai conferir pela mesma referência, sem emitir de novo" };
  }
  if (jaRecebida(body)) {
    // um envio anterior chegou: o resultado vem da consulta, nunca de um novo envio
    return { nfse: await consultarNfse(db, { ...n, tentativas }, "consulta", usuario, false) };
  }
  // recusada já na validação da Focus (dados faltando ou inválidos): nada foi para a prefeitura
  const mensagem = mensagemErros(body);
  return { nfse: await mudar(db, n, { status: "rejeitada", mensagem, resposta: body, tentativas }), mensagem: `Recusada pela Focus: ${mensagem}` };
}

/** Consulta pela referência e aplica o resultado. Se a Focus não tem a referência e a nota estava sem resultado,
 * reenvia o MESMO conteúdo com a MESMA referência (até MAX_TENTATIVAS). */
export async function consultarNfse(db: Db, n: Nfse, origem: "consulta" | "webhook" = "consulta", usuario?: string | null, podeReenviar = true): Promise<Nfse> {
  if (outroAmbiente(n)) {
    await evento(db, n.id, "erro", { detalhe: `Nota de ${n.ambiente === "producao" ? "produção" : "teste (homologação)"}: o ERP está em ${ambienteAtual() === "producao" ? "produção" : "homologação"} e não a consulta`, usuario_id: usuario });
    return n;
  }
  const codigo = await codigoUnidade(db, n.unidade_id);
  let res: Response;
  try {
    res = await focus(caminho(n.padrao, n.referencia), { signal: AbortSignal.timeout(TEMPO_FOCUS) }, codigo);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    await evento(db, n.id, "erro", { detalhe: `Consulta sem resposta da Focus (${(e as Error).name})`, usuario_id: usuario });
    return await mudar(db, n, { ultima_consulta_em: agora() });
  }
  const body = await lerJson(res);
  if (res.status === 401 || res.status === 403) {
    const err = erroDeToken(body, codigo);
    await evento(db, n.id, "erro", { http_status: res.status, detalhe: err.message, usuario_id: usuario });
    throw err;
  }
  if (res.status === 404) {
    if (podeReenviar && ["incerto", "pendente"].includes(n.status)) {
      // confirmado: a Focus nunca recebeu. Só agora reenvia (mesma referência, mesmo conteúdo).
      await evento(db, n.id, "consulta", { http_status: 404, detalhe: "A Focus não recebeu esta referência", usuario_id: usuario });
      if ((n.tentativas ?? 0) >= MAX_TENTATIVAS) {
        return await mudar(db, n, {
          status: "rejeitada", ultima_consulta_em: agora(),
          mensagem: `A Focus não recebeu a nota depois de ${n.tentativas} tentativas. Confira a conexão e o token e envie de novo.`,
        });
      }
      return (await enviar(db, n, "reenvio", usuario)).nfse;
    }
    await evento(db, n.id, origem, { http_status: 404, detalhe: "A Focus não encontrou esta referência", usuario_id: usuario });
    return await mudar(db, n, { ultima_consulta_em: agora() });
  }
  if (!res.ok) {
    await evento(db, n.id, "erro", { http_status: res.status, detalhe: `Consulta: ${mensagemErros(body)}`, usuario_id: usuario });
    return await mudar(db, n, { ultima_consulta_em: agora() });
  }
  return await aplicarRetorno(db, n, body, origem, res.status, usuario);
}

export async function cancelarNfse(db: Db, n: Nfse, motivo: string, usuario: string): Promise<{ nfse: Nfse; mensagem?: string }> {
  const m = corta(motivo, 255);
  if (m.length < 15) throw new HttpError(400, "Escreva o motivo do cancelamento (de 15 a 255 caracteres)");
  if (n.status !== "autorizada") throw new HttpError(409, "Só uma NFS-e autorizada pode ser cancelada");
  if (outroAmbiente(n)) throw new HttpError(409, "Esta nota é de outro ambiente (teste/produção) e não pode ser cancelada daqui");
  const codigo = await codigoUnidade(db, n.unidade_id);
  n = await mudar(db, n, { cancelamento_motivo: m, cancelamento_solicitado_por: usuario, cancelamento_solicitado_em: agora() });
  await evento(db, n.id, "cancelamento_solicitado", { detalhe: m, usuario_id: usuario });
  let res: Response;
  try {
    res = await focus(caminho(n.padrao, n.referencia), { method: "DELETE", body: JSON.stringify({ justificativa: m }), signal: AbortSignal.timeout(TEMPO_FOCUS) }, codigo);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    await evento(db, n.id, "timeout", { detalhe: "Cancelamento sem resposta da Focus: o ERP confere na próxima consulta", usuario_id: usuario });
    return { nfse: n, mensagem: "A Focus não respondeu: o ERP confere o cancelamento nas próximas consultas" };
  }
  const body = await lerJson(res);
  if (res.status === 401 || res.status === 403) throw erroDeToken(body, codigo);
  if (res.ok && body?.status === "cancelado") return { nfse: await aplicarRetorno(db, n, body, "cancelamento", res.status, usuario) };
  const msg = `Cancelamento recusado: ${mensagemErros(body)}`;
  await evento(db, n.id, "erro", { http_status: res.status, detalhe: msg, dados: body, usuario_id: usuario });
  await mudar(db, n, { mensagem: msg, resposta: body });
  throw new HttpError(422, msg);
}

/** Agendamento: consulta as notas sem resultado final e confere cancelamentos pedidos. */
export async function processarNfses(db: Db, limite = 40) {
  const ag = Date.now();
  const amb = ambienteAtual();
  const [{ data: andamento }, { data: cancelando }] = await Promise.all([
    db.from("nfse").select("*").in("status", ["pendente", "processando", "incerto"]).eq("ambiente", amb).order("solicitado_em").limit(200),
    db.from("nfse").select("*").eq("status", "autorizada").eq("ambiente", amb).is("cancelada_em", null)
      .gt("cancelamento_solicitado_em", new Date(ag - 2 * 86400_000).toISOString()).limit(50),
  ]);
  const desde = (t?: string | null) => (t ? ag - Date.parse(t) : Infinity);
  const alvo = [...(andamento ?? []), ...(cancelando ?? [])].filter((n: Nfse) => {
    const idade = desde(n.solicitado_em), ultima = desde(n.ultima_consulta_em);
    if (n.status === "pendente") return idade > ESPERA_PENDENTE_MS && ultima > ESPERA_PENDENTE_MS; // a emissão pode estar em curso
    if (n.status === "incerto") return ultima > ESPERA_PENDENTE_MS;
    if (n.status === "autorizada") return ultima > 10 * 60_000 || desde(n.cancelamento_solicitado_em) < ultima;
    // processando: no começo a cada 2 min, depois mais espaçado
    return ultima > (idade < 3600_000 ? 2 * 60_000 : idade < 86400_000 ? 15 * 60_000 : 2 * 3600_000);
  }).slice(0, limite) as Nfse[];

  const resultado = { consultadas: 0, autorizadas: 0, rejeitadas: 0, erros: [] as string[] };
  for (const n of alvo) {
    try {
      const r = await consultarNfse(db, n);
      resultado.consultadas++;
      if (r.status === "autorizada" && n.status !== "autorizada") resultado.autorizadas++;
      if (r.status === "rejeitada" && n.status !== "rejeitada") resultado.rejeitadas++;
    } catch (e) {
      resultado.erros.push(`${n.referencia}: ${(e as Error).message}`.slice(0, 300));
    }
  }
  return resultado;
}

// ---------------------------------------------------------------------------------------------------------------
// Montagem da nota a partir da OS (prévia e emissão usam a mesma conta)
// ---------------------------------------------------------------------------------------------------------------

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ibgeCache = new Map<string, string | null>();

/** Código IBGE do município: pelo CEP (ViaCEP) e, se não achar, pelo nome + UF (API do IBGE). */
export async function codigoIbge(cep?: string | null, municipio?: string | null, uf?: string | null): Promise<string | null> {
  const c = onlyDigits(cep);
  const chave = `${c}|${semAcento(municipio ?? "")}|${(uf ?? "").toUpperCase()}`;
  if (ibgeCache.has(chave)) return ibgeCache.get(chave)!;
  let achado: string | null = null;
  if (c.length === 8) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`, { signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      if (/^\d{7}$/.test(String(j?.ibge ?? ""))) achado = String(j.ibge);
    } catch { /* tenta pelo nome */ }
  }
  if (!achado && municipio && uf && /^[A-Za-z]{2}$/.test(uf)) {
    try {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf.toUpperCase()}/municipios`, { signal: AbortSignal.timeout(8000) });
      const lista = await r.json();
      const alvo = semAcento(municipio);
      const m = Array.isArray(lista) ? lista.find((x: any) => semAcento(String(x?.nome ?? "")) === alvo) : null;
      if (m?.id) achado = String(m.id);
    } catch { /* sem código */ }
  }
  ibgeCache.set(chave, achado);
  return achado;
}

/** Telefone com DDD, sem o 55 (10 ou 11 números) */
function telefone(v?: string | null) {
  let d = onlyDigits(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

export function textoDiscriminacao(modelo: string, os: Linha, cliente: Linha | null) {
  const valores: Record<string, string> = {
    os: String(os.numero ?? ""), equipamento: corta(os.equipamento, 200) || "—", serie: corta(os.numero_serie, 60) || "—",
    defeito: corta(os.defeito_relatado, 300) || "—", solucao: corta(os.solucao || os.diagnostico, 600) || "—",
    cliente: corta(cliente?.nome_fantasia || cliente?.nome, 120),
  };
  return modelo.replace(/\{(\w+)\}/g, (t, k) => (k in valores ? valores[k] : t)).replace(/[ \t]+/g, " ").trim();
}

export type Montagem = Awaited<ReturnType<typeof montarNfse>>;

export async function montarNfse(db: Db, osId: string, discriminacaoEditada?: string | null) {
  const { data: os } = await db.from("ordens_servico").select("*").eq("id", osId).maybeSingle();
  if (!os) throw new HttpError(404, "OS não encontrada");
  const unidadeId = os.unidade_id ?? (await db.from("unidades").select("id").eq("matriz", true).limit(1).maybeSingle()).data?.id;
  if (!unidadeId) throw new HttpError(400, "A OS não tem unidade e não há matriz cadastrada");
  const [{ data: unidade }, { data: cfg }, { data: cliente }, { data: vivas }] = await Promise.all([
    db.from("unidades").select("*").eq("id", unidadeId).single(),
    db.from("nfse_config").select("*").eq("unidade_id", unidadeId).maybeSingle(),
    os.cliente_id ? db.from("clientes").select("*").eq("id", os.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("nfse").select("id, numero, status").eq("os_id", osId).in("status", ["pendente", "processando", "autorizada", "incerto"]),
  ]);
  const pendencias: string[] = [];
  const avisos: string[] = [];
  const nomeUnidade = unidade?.nome ?? "unidade";
  const padrao: "nacional" | "municipal" = cfg?.padrao === "municipal" ? "municipal" : "nacional";
  const ambiente = ambienteAtual();

  if (!cfg?.ativo) pendencias.push(`A NFS-e não está ativada para ${nomeUnidade}: Notas fiscais → NFS-e (serviços) → Configuração por unidade`);
  if (vivas?.length) {
    const v = vivas[0] as Linha;
    pendencias.push(v.status === "autorizada" ? `Esta OS já tem NFS-e autorizada${v.numero ? ` (nº ${v.numero})` : ""}` : "Esta OS já tem uma NFS-e em andamento: aguarde o resultado");
  }
  if (!["concluida", "entregue"].includes(os.status)) pendencias.push("Conclua a OS antes de emitir a nota de serviço");

  // valores
  const maoObra = r2(Number(os.valor_mao_obra ?? 0));
  const pecas = r2(Number(os.valor_pecas ?? 0));
  const incluirPecas = !!cfg?.incluir_pecas;
  const valor = r2(maoObra + (incluirPecas ? pecas : 0));
  if (valor <= 0) pendencias.push(os.em_garantia ? "OS em garantia sem valor cobrado: não há serviço a faturar" : "A OS não tem valor de mão de obra");
  const aliquota = cfg?.aliquota_iss != null ? Number(cfg.aliquota_iss) : null;
  const valorIss = aliquota != null ? r2(valor * aliquota / 100) : null;

  // prestador (unidade)
  const cnpj = onlyDigits(unidade?.cnpj);
  if (cnpj.length !== 14) pendencias.push(`Preencha o CNPJ de ${nomeUnidade} em Configurações → Unidades`);
  const im = corta(unidade?.inscricao_municipal, 15);
  if (!im) (padrao === "municipal" ? pendencias : avisos).push(`${nomeUnidade} sem inscrição municipal (Configurações → Unidades)`);
  const municipioPrestador = cfg?.codigo_municipio || await codigoIbge(unidade?.cep, unidade?.municipio, unidade?.uf);
  if (!municipioPrestador) pendencias.push("Informe o código IBGE do município na configuração da NFS-e");
  if (padrao === "nacional" && !cfg?.codigo_tributacao_nacional) pendencias.push("Informe o código de tributação nacional na configuração da NFS-e");
  if (padrao === "municipal" && !cfg?.item_lista_servico) pendencias.push("Informe o item da lista de serviços na configuração da NFS-e");
  if (padrao === "municipal" && aliquota == null) avisos.push("Sem alíquota de ISS na configuração: a prefeitura calcula");

  // tomador (cliente): foto do cadastro no momento da emissão
  const doc = onlyDigits(cliente?.cpf_cnpj);
  if (!cliente) pendencias.push("A OS não tem cliente");
  else if (doc.length !== 11 && doc.length !== 14) pendencias.push("O cliente não tem CPF/CNPJ válido no cadastro");
  const email = cfg?.enviar_email_tomador ? (corta(cliente?.email_nfe || cliente?.email, 80).split(/[;,\s]/)[0] || null) : null;
  if (cliente && cfg?.enviar_email_tomador && !email) avisos.push("Cliente sem e-mail: a nota não será enviada por e-mail (dá para mandar o PDF pelo WhatsApp)");
  const ibgeTomador = cliente ? await codigoIbge(cliente.cep, cliente.municipio, cliente.uf) : null;
  if (cliente && !ibgeTomador) avisos.push("Não achei o código IBGE da cidade do cliente (confira o CEP): o endereço do tomador vai sem o município");
  const tomador = cliente ? {
    nome: corta(cliente.nome, 150), documento: doc, tipo: doc.length === 14 ? "PJ" : "PF", email, telefone: telefone(cliente.whatsapp || cliente.telefone),
    inscricao_municipal: corta(cliente.inscricao_municipal, 15) || null,
    logradouro: corta(cliente.logradouro, 125) || null, numero: corta(cliente.numero, 10) || null, complemento: corta(cliente.complemento, 60) || null,
    bairro: corta(cliente.bairro, 60) || null, municipio: corta(cliente.municipio, 60) || null, uf: corta(cliente.uf, 2).toUpperCase() || null,
    cep: onlyDigits(cliente.cep).length === 8 ? onlyDigits(cliente.cep) : null, codigo_municipio: ibgeTomador,
  } : null;

  // discriminação
  const modelo = cfg?.discriminacao_modelo || "Serviço de assistência técnica — OS nº {os}. Equipamento: {equipamento}. Serviço realizado: {solucao}";
  const discriminacao = (discriminacaoEditada?.trim() || textoDiscriminacao(modelo, os, cliente)).slice(0, 2000);
  const limite = padrao === "nacional" ? 1000 : 2000;
  if (discriminacao.length < 10) pendencias.push("Escreva a discriminação do serviço");
  if (discriminacao.length > limite) pendencias.push(`A discriminação passa de ${limite} caracteres`);
  if (ambiente === "homologacao") avisos.push("Ambiente de TESTE (homologação): a nota não tem valor fiscal e não fatura a OS");

  const servico = {
    os_numero: os.numero, equipamento: os.equipamento, numero_serie: os.numero_serie, defeito: os.defeito_relatado, solucao: os.solucao,
    valor_mao_obra: maoObra, valor_pecas: pecas, incluir_pecas: incluirPecas,
    item_lista_servico: cfg?.item_lista_servico ?? null, codigo_tributacao_nacional: cfg?.codigo_tributacao_nacional ?? null,
    codigo_tributario_municipio: cfg?.codigo_tributario_municipio ?? null, codigo_nbs: cfg?.codigo_nbs ?? null, codigo_cnae: cfg?.codigo_cnae ?? null,
    aliquota_iss: aliquota, natureza_operacao: cfg?.natureza_operacao ?? null, regime_especial_tributacao: cfg?.regime_especial_tributacao ?? null,
    optante_simples_nacional: !!cfg?.optante_simples_nacional, codigo_municipio: municipioPrestador,
    ibs_cbs_cst: cfg?.ibs_cbs_cst ?? null, ibs_cbs_class_trib: cfg?.ibs_cbs_class_trib ?? null,
  };

  const endereco = tomador ? [[tomador.logradouro, tomador.numero].filter(Boolean).join(", "), tomador.complemento, tomador.bairro,
    [tomador.municipio, tomador.uf].filter(Boolean).join("/"), tomador.cep && `CEP ${tomador.cep}`].filter(Boolean).join(" · ") : "";
  return {
    os, unidade, cfg, cliente, padrao, ambiente, cnpj, im, municipioPrestador, tomador, servico, valor, valorIss, aliquota, discriminacao,
    previa: {
      pendencias, avisos, ambiente, padrao,
      tomador: { nome: tomador?.nome ?? "—", documento: doc, email, endereco, municipio: tomador ? [tomador.municipio, tomador.uf].filter(Boolean).join("/") || null : null },
      valor_servicos: valor, valor_pecas: pecas, incluir_pecas: incluirPecas, aliquota_iss: aliquota, valor_iss: valorIss,
      iss_retido: !!cfg?.iss_retido, discriminacao,
    },
  };
}

export function payloadMunicipal(m: Montagem) {
  const t = m.tomador!;
  const cfg = m.cfg ?? {};
  return limpo({
    data_emissao: agoraBR(),
    natureza_operacao: String(cfg.natureza_operacao ?? 1),
    regime_especial_tributacao: cfg.regime_especial_tributacao != null ? String(cfg.regime_especial_tributacao) : null,
    optante_simples_nacional: !!cfg.optante_simples_nacional,
    prestador: { cnpj: m.cnpj, inscricao_municipal: m.im, codigo_municipio: m.municipioPrestador },
    tomador: {
      [t.tipo === "PJ" ? "cnpj" : "cpf"]: t.documento, razao_social: t.nome.slice(0, 115), email: t.email, telefone: t.telefone,
      inscricao_municipal: t.tipo === "PJ" ? t.inscricao_municipal : null,
      endereco: t.codigo_municipio ? {
        logradouro: t.logradouro, numero: t.numero || "S/N", complemento: t.complemento, bairro: t.bairro,
        codigo_municipio: t.codigo_municipio, uf: t.uf, cep: t.cep,
      } : null,
    },
    servico: {
      valor_servicos: m.valor, iss_retido: !!cfg.iss_retido, aliquota: m.aliquota,
      valor_iss_retido: cfg.iss_retido ? m.valorIss : null,
      item_lista_servico: cfg.item_lista_servico, codigo_tributario_municipio: cfg.codigo_tributario_municipio,
      codigo_cnae: cfg.codigo_cnae, codigo_nbs: cfg.codigo_nbs, discriminacao: m.discriminacao, codigo_municipio: m.municipioPrestador,
    },
  } as Linha);
}

export function payloadNacional(m: Montagem, dps: { serie: number; numero: number }) {
  const t = m.tomador!;
  const cfg = m.cfg ?? {};
  const ibge = (v: string | null | undefined) => (v ? Number(v) : null);
  return limpo({
    data_emissao: agoraBR(),
    data_competencia: agoraBR().slice(0, 10),
    serie_dps: Number(dps.serie), numero_dps: Number(dps.numero), emitente_dps: 1,
    codigo_municipio_emissora: ibge(m.municipioPrestador),
    cnpj_prestador: m.cnpj, inscricao_municipal_prestador: m.im,
    codigo_opcao_simples_nacional: cfg.optante_simples_nacional ? 3 : 1,
    regime_especial_tributacao: Number(cfg.regime_especial_tributacao ?? 0),
    [t.tipo === "PJ" ? "cnpj_tomador" : "cpf_tomador"]: t.documento,
    razao_social_tomador: t.nome, email_tomador: t.email, telefone_tomador: t.telefone,
    inscricao_municipal_tomador: t.tipo === "PJ" ? t.inscricao_municipal : null,
    ...(t.codigo_municipio ? {
      codigo_municipio_tomador: ibge(t.codigo_municipio), cep_tomador: t.cep, logradouro_tomador: t.logradouro,
      numero_tomador: t.numero || "S/N", complemento_tomador: t.complemento, bairro_tomador: t.bairro,
    } : {}),
    codigo_municipio_prestacao: ibge(m.municipioPrestador),
    codigo_tributacao_nacional_iss: cfg.codigo_tributacao_nacional,
    codigo_tributacao_municipal_iss: cfg.codigo_tributario_municipio,
    codigo_nbs: cfg.codigo_nbs,
    descricao_servico: m.discriminacao,
    valor_servico: m.valor,
    tributacao_iss: 1,
    tipo_retencao_iss: cfg.iss_retido ? 2 : 1,
    finalidade_emissao: 0,
    consumidor_final: cfg.consumidor_final ? 1 : 0,
    codigo_indicador_operacao: cfg.codigo_indicador_operacao,
    ibs_cbs_situacao_tributaria: cfg.ibs_cbs_cst ?? "000",
    ibs_cbs_classificacao_tributaria: cfg.ibs_cbs_class_trib ?? "000001",
  } as Linha);
}

/** Emite a NFS-e da OS: grava a referência (e a DPS reservada) antes de chamar a Focus. */
export async function emitirNfse(db: Db, osId: string, o: { discriminacao?: string | null; substitui_id?: string | null; usuario: string }) {
  const m = await montarNfse(db, osId, o.discriminacao);
  if (m.previa.pendencias.length) throw new HttpError(422, `Antes de emitir: ${m.previa.pendencias.join("; ")}`);
  if (o.substitui_id) {
    const { data: ant } = await db.from("nfse").select("id, os_id, status").eq("id", o.substitui_id).maybeSingle();
    if (!ant || ant.os_id !== osId || ant.status !== "rejeitada") throw new HttpError(400, "A nota corrigida precisa ser uma tentativa rejeitada desta OS");
  }
  let dps: { serie: number; numero: number } | null = null;
  if (m.padrao === "nacional") {
    const { data, error } = await db.rpc("nfse_reservar_dps", { p_unidade: m.unidade.id, p_producao: m.ambiente === "producao" });
    if (error) throw new HttpError(500, `Não foi possível reservar o número da DPS: ${error.message}`);
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha?.numero) throw new HttpError(400, "Configuração da NFS-e não encontrada para esta unidade");
    dps = { serie: Number(linha.serie), numero: Number(linha.numero) };
  }
  const payload = m.padrao === "nacional" ? payloadNacional(m, dps!) : payloadMunicipal(m);
  const { count } = await db.from("nfse").select("id", { count: "exact", head: true }).eq("os_id", osId);
  // referência única por tentativa (o sufixo aleatório evita colidir com testes antigos na mesma conta da Focus)
  const referencia = `nfse-os-${m.os.numero}-${(count ?? 0) + 1}-${crypto.randomUUID().slice(0, 6)}`;
  const { data: n, error } = await db.from("nfse").insert({
    referencia, unidade_id: m.unidade.id, os_id: osId, cliente_id: m.os.cliente_id ?? null, substitui_id: o.substitui_id ?? null,
    status: "pendente", ambiente: m.ambiente, padrao: m.padrao, valor_servicos: m.valor, aliquota_iss: m.aliquota, valor_iss: m.valorIss,
    iss_retido: !!m.cfg?.iss_retido, discriminacao: m.discriminacao, tomador: m.tomador, servico: { ...m.servico, serie_dps: dps?.serie ?? null, numero_dps: dps?.numero ?? null },
    payload, serie_dps: dps?.serie ?? null, numero_dps: dps?.numero ?? null, solicitado_por: o.usuario,
  }).select("*").single();
  if (error) {
    if (error.code === "23505" && /nfse_os_viva/.test(error.message)) throw new HttpError(409, "Esta OS já tem uma NFS-e em andamento ou autorizada");
    throw new HttpError(500, `Não foi possível gravar a NFS-e: ${error.message}`);
  }
  return await enviar(db, n as Nfse, "envio", o.usuario);
}
