// Extrato bancário (OFX) que chega na caixa de e-mail do ERP.
// Importa sozinho só quando dá para confiar no arquivo:
//   1. o número da conta no OFX bate com uma (e só uma) conta bancária cadastrada;
//   2. o remetente está na lista "remetentes autorizados" dessa conta (endereço ou domínio);
//   3. o e-mail tem assinatura DKIM válida do domínio do remetente (conferida aqui, com a chave pública
//      publicada no DNS do domínio): sem ela qualquer um poderia mandar um extrato falso "em nome" do banco.
// Faltando algo, o anexo fica "aguardando": o financeiro recebe um aviso e importa com um clique na caixa de e-mail.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { Buffer } from "node:buffer";
import { dkimVerify } from "npm:mailauth@4.13.3/lib/dkim/verify.js";
import { decodificarExtrato, ehTextoOfx, type ExtratoEmail, lerOfx } from "./extrato-ofx.ts";

export type { ExtratoEmail };

export type AnexoOfx = { indice: number; nome: string; conteudo: Uint8Array };

const TAMANHO_MAXIMO = 3_000_000;
const LINHAS_MAXIMO = 5_000;

/** Anexo é um extrato OFX? (pela extensão ou pelo cabeçalho do arquivo) */
export function ehExtratoOfx(nome: string, conteudo: Uint8Array) {
  if (!conteudo?.length || conteudo.length > TAMANHO_MAXIMO) return false;
  if (/\.(ofx|qfx)$/i.test(nome)) return true;
  return ehTextoOfx(new TextDecoder("latin1").decode(conteudo.slice(0, 2000)));
}

const digitos = (s?: string | null) => String(s ?? "").replace(/\D/g, "");

/** O remetente está na lista da conta? Item com @ no meio é o endereço exato; sem @ (ou "@dominio") vale o domínio e os subdomínios. */
export function remetenteAutorizado(lista: string[] | null | undefined, email: string) {
  const e = email.trim().toLowerCase();
  const dominio = e.split("@")[1] ?? "";
  if (!dominio) return false;
  return (lista ?? []).some((item) => {
    const x = item.trim().toLowerCase();
    if (!x) return false;
    if (x.includes("@") && !x.startsWith("@")) return x === e;
    const d = x.replace(/^@/, "");
    return dominio === d || dominio.endsWith("." + d);
  });
}

/** Consulta DNS (TXT) para a chave DKIM: pelo runtime ou, se ele não tiver DNS, pelo DNS do Google (HTTPS). */
export type ResolverDns = (nome: string, tipo: string) => Promise<string[][]>;

async function resolverDns(nome: string, tipo: string): Promise<string[][]> {
  if (tipo !== "TXT") throw Object.assign(new Error(`consulta ${tipo} não usada`), { code: "ENOTFOUND" });
  try {
    return await Deno.resolveDns(nome, "TXT");
  } catch { /* sem DNS no runtime: tenta pelo DNS do Google */ }
  const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(nome)}&type=TXT`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw Object.assign(new Error(`DNS respondeu ${r.status}`), { code: "ETIMEOUT" });
  const j = await r.json();
  const respostas = (j.Answer ?? []).filter((a: { type: number }) => a.type === 16);
  if (j.Status === 3 || !respostas.length) throw Object.assign(new Error("registro não encontrado"), { code: j.Status === 3 ? "ENOTFOUND" : "ENODATA" });
  // o TXT pode vir em pedaços entre aspas ("v=DKIM1; p=MII..." "resto"): junta
  return respostas.map((a: { data: string }) => {
    const d = String(a.data);
    return [d.startsWith('"') ? [...d.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("") : d];
  });
}

const alinhado = (dominio: string, assinante?: string) => {
  const d = String(assinante ?? "").toLowerCase();
  return !!d && (dominio === d || dominio.endsWith("." + d) || d.endsWith("." + dominio));
};

type ResultadoDkim = { signingDomain?: string; status?: { result?: string; comment?: string; underSized?: number | boolean } };

/** Confere a assinatura DKIM do e-mail inteiro (como chegou do servidor) contra o domínio do remetente. */
export async function assinaturaDoRemetente(fonte: Uint8Array, deEmail: string, resolver: ResolverDns = resolverDns): Promise<{ ok: boolean; motivo: string }> {
  const dominio = deEmail.split("@")[1]?.trim().toLowerCase() ?? "";
  if (!dominio) return { ok: false, motivo: "o e-mail não tem remetente" };
  let resultados: ResultadoDkim[];
  try {
    resultados = (await dkimVerify(Buffer.from(fonte), { resolver })).results ?? [];
  } catch (e) {
    return { ok: false, motivo: `não deu para conferir a assinatura do e-mail (${(e as Error).message})` };
  }
  // assinatura que cobre só parte do corpo (l=) não vale: daria para acrescentar um anexo depois dela
  const validas = resultados.filter((x) => x.status?.result === "pass" && !x.status?.underSized);
  const doRemetente = validas.find((x) => alinhado(dominio, x.signingDomain));
  if (doRemetente) return { ok: true, motivo: `assinatura de ${doRemetente.signingDomain} conferida` };
  if (validas.length) return { ok: false, motivo: `o e-mail foi assinado por ${validas[0].signingDomain}, não por ${dominio}` };
  return { ok: false, motivo: `o e-mail não tem assinatura válida de ${dominio}` };
}

/** Lê os OFX anexos de um e-mail novo e importa os que passam nas conferências. Devolve o que aconteceu com cada um. */
export async function processarExtratos(db: SupabaseClient, emailId: string, fonte: Uint8Array, deEmail: string, anexos: AnexoOfx[], resolver: ResolverDns = resolverDns) {
  const { data: contas } = await db.from("contas_bancarias").select("id, nome, numero, extrato_remetentes").eq("ativo", true);
  let assinatura: Promise<{ ok: boolean; motivo: string }> | null = null;
  const saida: ExtratoEmail[] = [];
  const amanha = new Date(Date.now() + 27 * 3600_000).toISOString().slice(0, 10); // folga para o fuso de Brasília

  for (const a of anexos) {
    const base = { indice: a.indice, nome: a.nome };
    try {
      const ofx = lerOfx(decodificarExtrato(a.conteudo));
      if (!ofx.linhas.length) { saida.push({ ...base, status: "erro", motivo: "o arquivo não tem lançamentos" }); continue; }
      const datas = ofx.linhas.map((l) => l.data).sort();
      const periodo: [string, string] = [datas[0], datas[datas.length - 1]];
      const n = digitos(ofx.conta);
      const candidatas = n ? (contas ?? []).filter((c) => { const m = digitos(c.numero); return m && (n.endsWith(m) || m.endsWith(n)); }) : [];
      const conta = candidatas.length === 1 ? candidatas[0] : null;
      const aguardar = (motivo: string) => saida.push({ ...base, status: "aguardando", motivo, periodo, conta_id: conta?.id ?? null, conta: conta?.nome ?? null });

      if (!conta) {
        aguardar(!n ? "o arquivo não traz o número da conta"
          : candidatas.length > 1 ? `o número da conta do arquivo (final ${n.slice(-4)}) serve para mais de uma conta cadastrada`
          : `nenhuma conta bancária cadastrada com o número de final ${n.slice(-4)} (Bancos e conciliação → editar a conta → campo Conta)`);
        continue;
      }
      if (!remetenteAutorizado(conta.extrato_remetentes, deEmail)) {
        aguardar(`${deEmail || "o remetente"} não está nos remetentes autorizados de ${conta.nome}`);
        continue;
      }
      if (periodo[1] > amanha) { aguardar("o arquivo tem lançamentos com data no futuro"); continue; }
      if (ofx.linhas.length > LINHAS_MAXIMO) { aguardar(`o arquivo tem ${ofx.linhas.length} lançamentos (mais que ${LINHAS_MAXIMO})`); continue; }
      assinatura ??= assinaturaDoRemetente(fonte, deEmail, resolver);
      const ass = await assinatura;
      if (!ass.ok) { aguardar(ass.motivo); continue; }

      const { data, error } = await db.rpc("importar_extrato_email", {
        p_conta: conta.id, p_email: emailId, p_arquivo: a.nome, p_linhas: ofx.linhas, p_saldo_final: ofx.saldoFinal, p_saldo_data: ofx.saldoData,
      });
      if (error) throw new Error(error.message);
      saida.push({ ...base, status: "importado", motivo: ass.motivo, conta_id: conta.id, conta: conta.nome, periodo, novas: data.novas, repetidas: data.repetidas, conciliadas: data.conciliadas });
    } catch (e) {
      saida.push({ ...base, status: "erro", motivo: String((e as Error).message ?? e).slice(0, 200) });
    }
  }

  const conferir = saida.filter((x) => x.status !== "importado");
  if (conferir.length) {
    await db.rpc("notificar", {
      p_tipo: "pagamento", p_titulo: "Extrato recebido por e-mail: confira e importe",
      p_texto: conferir.map((x) => `${x.nome}: ${x.motivo}`).join(" · ").slice(0, 300), p_link: "/email", p_papeis: ["financeiro"],
    });
  }
  return saida;
}
