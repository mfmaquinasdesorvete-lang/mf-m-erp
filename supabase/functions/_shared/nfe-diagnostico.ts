// Diagnóstico da emissão de NF-e: o que o ERP leu dos secrets, se a Focus aceita o token de cada CNPJ
// (sem emitir nada), o cadastro fiscal das unidades, a numeração e as últimas tentativas.
// Nunca devolve o valor de um token: só o nome do secret e se ele existe.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { onlyDigits } from "./supabase.ts";
import { ambienteParaMensagem, focus, focusProducao, recebidasDisponiveis, secretDoToken } from "./focusnfe.ts";

export type ItemDiagnostico = { grupo: string; titulo: string; nivel: "ok" | "info" | "alerta" | "erro"; detalhe: string; acao?: string };

const SECRETS = ["FOCUS_NFE_ENV", "FOCUS_NFE_TOKEN", "FOCUS_NFE_TOKEN_PRODUCAO", "FOCUS_NFE_TOKEN_SP", "FOCUS_NFE_TOKEN_PRODUCAO_SP"];
const tem = (n: string) => !!(Deno.env.get(n) ?? "").trim();

/** Chama a Focus e resume a resposta (sem token na mensagem). */
async function testar(caminho: string, codigo: string | null, recebidas = false) {
  try {
    const res = await focus(caminho, { signal: AbortSignal.timeout(15_000) }, codigo, recebidas ? { recebidas: true } : {});
    const corpo = await res.json().catch(() => ({}));
    return { status: res.status, mensagem: String(corpo?.mensagem ?? corpo?.codigo ?? "").slice(0, 300) };
  } catch (e) {
    return { status: 0, mensagem: (e as Error).message };
  }
}

export async function diagnosticoNfe(db: SupabaseClient): Promise<{ ambiente: string; itens: ItemDiagnostico[] }> {
  const itens: ItemDiagnostico[] = [];
  const add = (i: ItemDiagnostico) => itens.push(i);
  const prod = focusProducao();
  const bruto = Deno.env.get("FOCUS_NFE_ENV");

  // 1. Ambiente (o valor só aparece se for o nome de um ambiente: um token colado ali não é mostrado)
  const pareceToken = bruto !== undefined && /token colado/.test(ambienteParaMensagem());
  add({
    grupo: "Ambiente", titulo: "FOCUS_NFE_ENV",
    nivel: prod ? "ok" : "erro",
    detalhe: bruto === undefined
      ? "O secret FOCUS_NFE_ENV não existe neste projeto do Supabase. Sem ele o ERP emite em HOMOLOGAÇÃO: a nota é autorizada, mas sem valor fiscal (aparece \"teste\")."
      : prod ? `Produção (valor cadastrado: ${ambienteParaMensagem()}). As notas saem com valor fiscal.`
        : `O ERP leu ${ambienteParaMensagem()} e por isso está emitindo em HOMOLOGAÇÃO: a nota é autorizada, mas sem valor fiscal.`,
    acao: prod ? undefined : (pareceToken ? "O token foi colado no secret errado. " : "") +
      "No Supabase (Edge Functions → Secrets), deixe FOCUS_NFE_ENV com a palavra producao (sem aspas) e coloque o Token de Produção da Focus em FOCUS_NFE_TOKEN_PRODUCAO. Depois rode o diagnóstico de novo.",
  });
  add({
    grupo: "Ambiente", titulo: "Secrets cadastrados",
    nivel: "info",
    detalhe: SECRETS.map((n) => `${n}: ${tem(n) ? "cadastrado" : "não cadastrado"}`).join(" · "),
  });

  // 2. Unidades: cadastro fiscal e token aceito pela Focus
  const { data: unidades } = await db.from("unidades").select("*").eq("ativo", true).order("codigo");
  const { data: cfg } = await db.from("configuracoes").select("ibs_cbs_ativo, cbs_aliquota, ibs_uf_aliquota, presenca_comprador").eq("id", 1).maybeSingle();
  for (const u of unidades ?? []) {
    const nome = `${u.nome} (${u.codigo})`;
    const cnpj = onlyDigits(u.cnpj);
    const faltas = [
      cnpj.length !== 14 && "CNPJ", !u.inscricao_estadual && "inscrição estadual", !u.uf && "UF", !u.logradouro && "logradouro",
      !u.municipio && "município", onlyDigits(u.cep).length !== 8 && "CEP", !u.natureza_operacao && "natureza da operação",
      !u.cfop_venda_revenda && "CFOP de revenda", !u.icms_cst && "CST do ICMS", !u.pis_cst && "CST do PIS", !u.cofins_cst && "CST do COFINS",
      cfg?.ibs_cbs_ativo !== false && !u.ibs_cbs_cst && "CST do IBS/CBS",
    ].filter(Boolean);
    add({
      grupo: nome, titulo: "Cadastro fiscal da unidade", nivel: faltas.length ? "erro" : "ok",
      detalhe: faltas.length ? `Falta: ${faltas.join(", ")}.` : `CNPJ ${cnpj}, IE ${u.inscricao_estadual}, ${u.uf}; ICMS CST ${u.icms_cst} (${u.icms_aliquota_interna}%), PIS/COFINS CST ${u.pis_cst}/${u.cofins_cst}, IBS/CBS CST ${u.ibs_cbs_cst ?? "—"}; ` +
        (u.fabrica ? "marcada como fábrica (máquina vendida sai com CFOP 5101/6101 e IPI)." : "revenda (CFOP 5102/6102, sem IPI)."),
      acao: faltas.length ? "Preencha em Configurações → Unidades e Notas fiscais → Configurações da NF-e." : undefined,
    });
    if (cnpj.length !== 14) continue;

    const secret = secretDoToken(u.codigo);
    if (!secret) {
      add({ grupo: nome, titulo: `Token da Focus (${prod ? "produção" : "homologação"})`, nivel: "erro",
        detalhe: "Nenhum token cadastrado para esta unidade.",
        acao: `Cadastre no Supabase o secret ${u.codigo === "SC" ? "FOCUS_NFE_TOKEN" : `FOCUS_NFE_TOKEN_${u.codigo}`} com o token ${prod ? "de produção" : "de homologação"} desta empresa na Focus (aba Tokens).` });
    } else {
      const r = await testar(`/v2/nfe/diagnostico-erp-${Date.now()}?completa=0`, u.codigo);
      const ok = r.status === 404;
      add({
        grupo: nome, titulo: `Token da Focus (${prod ? "produção" : "homologação"}) · ${secret}`,
        nivel: ok ? "ok" : r.status === 401 || r.status === 403 ? "erro" : "alerta",
        detalhe: ok ? "A Focus aceitou o token neste ambiente."
          : r.status === 401 || r.status === 403 ? `A Focus recusou o token (${r.status}: ${r.mensagem || "sem mensagem"}).`
            : `Resposta inesperada da Focus (${r.status || "sem conexão"}: ${r.mensagem}).`,
        acao: ok ? undefined : r.status === 401 || r.status === 403
          ? `No painel da Focus, empresa ${cnpj} → Tokens: copie o Token ${prod ? "de Produção" : "de Homologação"} e cole no secret ${secret} do Supabase.`
          : "Tente de novo em alguns minutos; se continuar, verifique o status da Focus.",
      });
    }

    // notas de fornecedores (produção): o token precisa estar autorizado para este CNPJ
    if (recebidasDisponiveis()) {
      const sec = secretDoToken(u.codigo, { recebidas: true });
      const r = await testar(`/v2/nfes_recebidas?cnpj=${cnpj}&versao=999999999999`, u.codigo, true);
      const ok = r.status === 200;
      add({
        grupo: nome, titulo: `NF-e de fornecedores (produção) · ${sec ?? "sem token"}`,
        nivel: ok ? "ok" : "erro",
        detalhe: ok ? "A Focus libera a busca das notas emitidas contra este CNPJ." : `A Focus recusou (${r.status || "sem conexão"}: ${r.mensagem || "sem mensagem"}).`,
        acao: ok ? undefined : /cnpj/i.test(r.mensagem) ? `O token é de outra empresa: cadastre o token de produção desta unidade como FOCUS_NFE_TOKEN_PRODUCAO_${u.codigo}.`
          : "Confira se o token é o de Produção e se a empresa tem a Manifestação do Destinatário (MDe) habilitada na Focus.",
      });
    }

    // numeração: o próximo número na Focus continua a última nota real (inclui as importadas do Tiny)
    const { data: ultima } = await db.from("notas_fiscais").select("numero, serie, created_at, origem")
      .eq("unidade_id", u.id).neq("ambiente", "homologacao").in("status", ["autorizada", "cancelada", "denegada"]).not("numero", "is", null)
      .order("created_at", { ascending: false }).limit(50);
    const maior = (ultima ?? []).filter((n: any) => String(n.serie ?? "1") === "1").map((n: any) => Number(n.numero)).filter(Number.isFinite).sort((a, b) => b - a)[0];
    add({
      grupo: nome, titulo: "Numeração (série 1)", nivel: "info",
      detalhe: maior ? `A última nota real desta unidade é a ${maior}. Na Focus (Documentos fiscais → Produção), o próximo número deve ser ${maior + 1}.`
        : "Nenhuma nota real desta unidade no ERP: confira na Focus o próximo número de produção (deve continuar a numeração do sistema anterior).",
    });
  }

  // 3. Reforma tributária
  add({
    grupo: "Configurações da NF-e", titulo: "Grupo IBS/CBS (Reforma)", nivel: cfg?.ibs_cbs_ativo === false ? "alerta" : "ok",
    detalhe: cfg?.ibs_cbs_ativo === false ? "Desligado: a SEFAZ rejeita a nota sem o grupo IBS/CBS (rejeição 1115) para quem é do regime normal."
      : `Ligado (CBS ${cfg?.cbs_aliquota ?? 0.9}%, IBS ${cfg?.ibs_uf_aliquota ?? 0.1}%).`,
  });

  // 4. Últimas tentativas
  const { data: notas } = await db.from("notas_fiscais").select("referencia, status, ambiente, numero, mensagem, created_at")
    .eq("origem", "erp").is("excluida_em", null).order("created_at", { ascending: false }).limit(5);
  for (const n of notas ?? []) {
    add({
      grupo: "Últimas emissões", titulo: `${n.referencia} · ${new Date(n.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      nivel: n.status === "erro" ? "erro" : n.ambiente === "homologacao" ? "alerta" : n.status === "autorizada" ? "ok" : "info",
      detalhe: `${n.ambiente === "homologacao" ? "HOMOLOGAÇÃO (teste, sem valor fiscal)" : "Produção"} · ${n.status}${n.numero ? ` · nº ${n.numero}` : ""}${n.mensagem ? ` · ${n.mensagem}` : ""}`,
    });
  }
  return { ambiente: prod ? "producao" : "homologacao", itens };
}
