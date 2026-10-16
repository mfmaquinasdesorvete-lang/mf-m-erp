// Calendário de obrigações do Lucro Real: o que vence em cada mês — federais da empresa (centralizadas na matriz)
// e estaduais e municipais de cada unidade —, com o prazo da lei ajustado para dia útil.
// Feriados: os nacionais, mais Carnaval, Sexta-feira Santa, Corpus Christi e 31/12 (sem expediente bancário).
// Feriados estaduais e municipais não entram. Os prazos estaduais e municipais dependem da unidade e ficam
// ajustáveis pelo contador ("Ajustar prazos"). Tudo aqui é para conferir com o contador.

export type Ajuste = "antecipa" | "prorroga";
export type Periodicidade = "mensal" | "trimestral" | "anual";
export type Esfera = "federal" | "estadual" | "municipal";
export type TipoObrigacao = "guia" | "declaracao";

/** Ajustes do contador (configuracoes.calendario_fiscal). */
export type ConfigUnidade = { icms_dia?: number | null; efd_dia?: number | null; ipi?: boolean; iss?: boolean; iss_dia?: number | null };
export type ConfigCalendario = {
  irpj?: "anual" | "trimestral"; folha?: boolean; unidades?: Record<string, ConfigUnidade>;
  /** AAAA-MM: acompanhar a partir deste mês (o que venceu antes fica de fora, já cuidado pelo contador) */
  inicio?: string | null;
};
export type UnidadeCal = { id: string; nome: string; codigo?: string | null; uf?: string | null; matriz?: boolean; assistencia?: boolean };

// ---------------------------------------------------------------------------------------------------------------
// Datas (sempre AAAA-MM-DD, sem fuso)

const dois = (n: number) => String(n).padStart(2, "0");
export const iso = (ano: number, mes: number, dia: number) => {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;
};
const somarDias = (dia: string, n: number) => { const [a, m, d] = dia.split("-").map(Number); return iso(a, m, d + n); };
const diaDaSemana = (dia: string) => { const [a, m, d] = dia.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
export const somarMes = (ano: number, mes: number, k: number) => { const t = ano * 12 + (mes - 1) + k; return { ano: Math.floor(t / 12), mes: (t % 12) + 1 }; };

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

const cacheFeriados = new Map<number, Map<string, string>>();
/** Feriados nacionais e dias sem expediente bancário do ano (data → nome). */
export function feriados(ano: number) {
  const pronto = cacheFeriados.get(ano);
  if (pronto) return pronto;
  const p = pascoa(ano);
  const f = new Map<string, string>([
    [iso(ano, 1, 1), "Confraternização Universal"], [somarDias(p, -48), "Carnaval"], [somarDias(p, -47), "Carnaval"],
    [somarDias(p, -2), "Sexta-feira Santa"], [iso(ano, 4, 21), "Tiradentes"], [iso(ano, 5, 1), "Dia do Trabalho"],
    [somarDias(p, 60), "Corpus Christi"], [iso(ano, 9, 7), "Independência"], [iso(ano, 10, 12), "Nossa Senhora Aparecida"],
    [iso(ano, 11, 2), "Finados"], [iso(ano, 11, 15), "Proclamação da República"], [iso(ano, 11, 20), "Consciência Negra"],
    [iso(ano, 12, 25), "Natal"], [iso(ano, 12, 31), "Sem expediente bancário"],
  ]);
  cacheFeriados.set(ano, f);
  return f;
}

export const diaUtil = (dia: string) => { const s = diaDaSemana(dia); return s !== 0 && s !== 6 && !feriados(Number(dia.slice(0, 4))).has(dia); };

/** Dia útil mais próximo: para trás (antecipa) ou para frente (prorroga). */
export function ajustar(dia: string, modo: Ajuste) {
  let d = dia;
  while (!diaUtil(d)) d = somarDias(d, modo === "antecipa" ? -1 : 1);
  return d;
}
export const ultimoDiaUtil = (ano: number, mes: number) => ajustar(iso(ano, mes, ultimoDia(ano, mes)), "antecipa");
export function nesimoDiaUtil(ano: number, mes: number, n: number) {
  let d = iso(ano, mes, 1), conta = 0;
  for (;;) { if (diaUtil(d) && ++conta === n) return d; d = somarDias(d, 1); }
}
/** Dia fixo do mês (o 31 vira o último dia em mês mais curto), ajustado para dia útil. */
export const diaDoMes = (ano: number, mes: number, dia: number, modo: Ajuste) => ajustar(iso(ano, mes, Math.min(dia, ultimoDia(ano, mes))), modo);

// ---------------------------------------------------------------------------------------------------------------
// Regras

export type Competencia = { chave: string; ano: number; mes?: number; tri?: number };
type Ctx = { cfg: ConfigCalendario; unidade: UnidadeCal | null; cu: ConfigUnidade };

export type Regra = {
  chave: string; nome: string; tipo: TipoObrigacao; esfera: Esfera; escopo: "empresa" | "unidade"; periodicidade: Periodicidade;
  /** prazo em palavras */
  quando: (c: Ctx) => string;
  base: (c: Ctx) => string;
  dica?: string;
  /** prazo que muda com frequência ou depende do estado/município: conferir com o contador */
  conferir?: boolean;
  aplica?: (c: Ctx) => boolean;
  /** vencimento (AAAA-MM-DD) ou null quando o dia ainda não foi definido */
  prazo: (comp: Competencia, c: Ctx) => string | null;
};

const seguinte = (c: Competencia) => somarMes(c.ano, c.mes!, 1);
const dia = (n: number, modo: Ajuste) => (c: Competencia) => { const m = seguinte(c); return diaDoMes(m.ano, m.mes, n, modo); };
const comFolha = (c: Ctx) => c.cfg.folha !== false;
const texto = (s: string) => () => s;

export const REGRAS: Regra[] = [
  // ----- federais, da empresa (CNPJ raiz, centralizadas na matriz) -----
  {
    chave: "esocial", nome: "eSocial: folha do mês", tipo: "declaracao", esfera: "federal", escopo: "empresa", periodicidade: "mensal",
    quando: texto("dia 15 do mês seguinte (antecipa se não for dia útil)"), base: texto("Manual de Orientação do eSocial (eventos periódicos)"),
    dica: "Remunerações e pagamentos do mês (S-1200 a S-1299). É a base do INSS, do IRRF e do FGTS.", aplica: comFolha, prazo: dia(15, "antecipa"),
  },
  {
    chave: "reinf", nome: "EFD-Reinf", tipo: "declaracao", esfera: "federal", escopo: "empresa", periodicidade: "mensal",
    quando: texto("dia 15 do mês seguinte (prorroga para o próximo dia útil)"), base: texto("IN RFB 2.043/2021, com a redação da IN RFB 2.163/2023"),
    dica: "Retenções em serviços tomados e pagamentos a terceiros (R-2010, R-4000…). Mês sem movimento: informar uma vez.", conferir: true,
    prazo: dia(15, "prorroga"),
  },
  {
    chave: "inss_irrf_folha", nome: "INSS e IRRF da folha (DARF da DCTFWeb)", tipo: "guia", esfera: "federal", escopo: "empresa", periodicidade: "mensal",
    quando: texto("dia 20 do mês seguinte (antecipa se não for dia útil)"), base: texto("Lei 8.212/1991, art. 30, I, b; Lei 11.196/2005, art. 70, I, d"),
    aplica: comFolha, prazo: dia(20, "antecipa"),
  },
  {
    chave: "fgts", nome: "FGTS Digital", tipo: "guia", esfera: "federal", escopo: "empresa", periodicidade: "mensal",
    quando: texto("dia 20 do mês seguinte (antecipa se não for dia útil)"), base: texto("Lei 8.036/1990, art. 15, com a redação da Lei 14.438/2022"),
    aplica: comFolha, prazo: dia(20, "antecipa"),
  },
  {
    chave: "retencoes", nome: "IRRF e PIS/COFINS/CSLL retidos de serviços tomados", tipo: "guia", esfera: "federal", escopo: "empresa", periodicidade: "mensal",
    quando: texto("dia 20 do mês seguinte (antecipa se não for dia útil)"), base: texto("Lei 10.833/2003, art. 35; Lei 11.196/2005, art. 70, I, d"),
    dica: "Só quando houve retenção no mês (serviços de empresas, autônomos, aluguel…).", prazo: dia(20, "antecipa"),
  },
  {
    chave: "pis_cofins", nome: "PIS e COFINS (não cumulativo)", tipo: "guia", esfera: "federal", escopo: "empresa", periodicidade: "mensal",
    quando: texto("dia 25 do mês seguinte (antecipa se não for dia útil)"), base: texto("Lei 10.637/2002, art. 10; Lei 10.833/2003, art. 11"),
    dica: "Apuração da empresa toda (matriz e filial juntas), com os créditos das entradas.", prazo: dia(25, "antecipa"),
  },
  {
    chave: "irpj_csll_estimativa", nome: "IRPJ e CSLL por estimativa mensal", tipo: "guia", esfera: "federal", escopo: "empresa", periodicidade: "mensal",
    quando: texto("último dia útil do mês seguinte"), base: texto("Lei 9.430/1996, arts. 2º e 6º"),
    dica: "Lucro Real anual. Pode ser reduzida ou suspensa pelo balancete de suspensão ou redução.",
    aplica: (c) => (c.cfg.irpj ?? "anual") === "anual", prazo: (c) => { const m = seguinte(c); return ultimoDiaUtil(m.ano, m.mes); },
  },
  {
    chave: "dctfweb", nome: "DCTFWeb (com o MIT)", tipo: "declaracao", esfera: "federal", escopo: "empresa", periodicidade: "mensal",
    quando: texto("último dia útil do mês seguinte"), base: texto("IN RFB 2.237/2024, com a redação da IN RFB 2.248/2025"),
    dica: "Declara os tributos federais do mês (INSS, IRRF, PIS, COFINS, IPI, IRPJ e CSLL). O MIT substituiu a DCTF desde janeiro de 2025.",
    prazo: (c) => { const m = seguinte(c); return ultimoDiaUtil(m.ano, m.mes); },
  },
  {
    chave: "efd_contribuicoes", nome: "EFD-Contribuições", tipo: "declaracao", esfera: "federal", escopo: "empresa", periodicidade: "mensal",
    quando: texto("10º dia útil do segundo mês seguinte"), base: texto("IN RFB 1.252/2012, art. 7º"),
    dica: "Escrituração do PIS e da COFINS (débitos e créditos), da matriz e da filial no mesmo arquivo.",
    prazo: (c) => { const m = somarMes(c.ano, c.mes!, 2); return nesimoDiaUtil(m.ano, m.mes, 10); },
  },
  {
    chave: "irpj_csll_trimestral", nome: "IRPJ e CSLL do trimestre (quota única ou 1ª quota)", tipo: "guia", esfera: "federal", escopo: "empresa", periodicidade: "trimestral",
    quando: texto("último dia útil do mês seguinte ao fim do trimestre"), base: texto("Lei 9.430/1996, arts. 1º e 5º"),
    dica: "Pode ser pago em até 3 quotas mensais (a 2ª e a 3ª com juros Selic), nos últimos dias úteis dos dois meses seguintes.",
    aplica: (c) => c.cfg.irpj === "trimestral", prazo: (c) => { const m = somarMes(c.ano, c.tri! * 3, 1); return ultimoDiaUtil(m.ano, m.mes); },
  },

  // ----- de cada unidade (estabelecimento) -----
  {
    chave: "ipi", nome: "IPI", tipo: "guia", esfera: "federal", escopo: "unidade", periodicidade: "mensal",
    quando: texto("dia 25 do mês seguinte (antecipa se não for dia útil)"), base: texto("Lei 8.383/1991, art. 52, I, a (redação da Lei 11.933/2009)"),
    dica: "Apuração por estabelecimento. A filial que revende o que a matriz fabrica é equiparada a industrial (RIPI, art. 9º, III): confirmar com o contador.",
    aplica: (c) => c.cu.ipi !== false, prazo: dia(25, "antecipa"),
  },
  {
    chave: "icms", nome: "ICMS", tipo: "guia", esfera: "estadual", escopo: "unidade", periodicidade: "mensal",
    quando: (c) => c.cu.icms_dia ? `dia ${c.cu.icms_dia} do mês seguinte (antecipa se não for dia útil)` : "dia ainda não definido: ajuste em \"Ajustar prazos\"",
    base: (c) => c.unidade?.uf === "SC" ? "RICMS/SC, art. 60 (o § 4º amplia o prazo para quem entrega a EFD em dia)"
      : c.unidade?.uf === "SP" ? "RICMS/SP, Anexo IV: o prazo depende do código de recolhimento (CPR) do CNAE principal"
      : "Regulamento do ICMS do estado",
    dica: "ICMS próprio do mês, já com os créditos. DIFAL e ICMS-ST de outro estado sem inscrição lá são pagos a cada nota, antes da saída.",
    conferir: true, prazo: (comp, c) => (c.cu.icms_dia ? dia(c.cu.icms_dia, "antecipa")(comp) : null),
  },
  {
    chave: "efd_icms_ipi", nome: "EFD ICMS/IPI (SPED Fiscal)", tipo: "declaracao", esfera: "estadual", escopo: "unidade", periodicidade: "mensal",
    quando: (c) => c.cu.efd_dia ? `dia ${c.cu.efd_dia} do mês seguinte (antecipa se não for dia útil)` : "dia ainda não definido: ajuste em \"Ajustar prazos\"",
    base: (c) => c.unidade?.uf === "SC" ? "Legislação de SC: dia 20 do mês seguinte (substitui a DIME)"
      : c.unidade?.uf === "SP" ? "Portaria CAT 147/2009, art. 10" : "Legislação do estado (Ajuste SINIEF 02/2009)",
    dica: "Livros fiscais de entrada, saída, apuração do ICMS e do IPI e inventário (em fevereiro).",
    conferir: true, prazo: (comp, c) => (c.cu.efd_dia ? dia(c.cu.efd_dia, "antecipa")(comp) : null),
  },
  {
    chave: "iss", nome: "ISS (serviços prestados e retidos)", tipo: "guia", esfera: "municipal", escopo: "unidade", periodicidade: "mensal",
    quando: (c) => c.cu.iss_dia ? `dia ${c.cu.iss_dia} do mês seguinte (antecipa se não for dia útil)` : "dia ainda não definido: ajuste em \"Ajustar prazos\"",
    base: texto("Lei Complementar 116/2003 e a lei do município"), dica: "NFS-e das ordens de serviço e ISS retido de serviços tomados.",
    conferir: true, aplica: (c) => c.cu.iss === true, prazo: (comp, c) => (c.cu.iss_dia ? dia(c.cu.iss_dia, "antecipa")(comp) : null),
  },

  // ----- anuais, da empresa -----
  {
    chave: "informe_rendimentos", nome: "Comprovantes de rendimentos (funcionários e prestadores)", tipo: "declaracao", esfera: "federal", escopo: "empresa", periodicidade: "anual",
    quando: texto("último dia útil de fevereiro do ano seguinte"), base: texto("Legislação do IR na fonte (comprovante anual de rendimentos e de retenções)"),
    aplica: comFolha, prazo: (c) => ultimoDiaUtil(c.ano + 1, 2),
  },
  {
    chave: "irpj_csll_ajuste", nome: "IRPJ e CSLL: saldo do ajuste anual", tipo: "guia", esfera: "federal", escopo: "empresa", periodicidade: "anual",
    quando: texto("último dia útil de março do ano seguinte"), base: texto("Lei 9.430/1996, art. 6º, § 1º"),
    aplica: (c) => (c.cfg.irpj ?? "anual") === "anual", prazo: (c) => ultimoDiaUtil(c.ano + 1, 3),
  },
  {
    chave: "ecd", nome: "ECD (Escrituração Contábil Digital)", tipo: "declaracao", esfera: "federal", escopo: "empresa", periodicidade: "anual",
    quando: texto("último dia útil de junho do ano seguinte"), base: texto("IN RFB 2.003/2021, art. 5º"), prazo: (c) => ultimoDiaUtil(c.ano + 1, 6),
  },
  {
    chave: "ecf", nome: "ECF (com o LALUR e o LACS)", tipo: "declaracao", esfera: "federal", escopo: "empresa", periodicidade: "anual",
    quando: texto("último dia útil de julho do ano seguinte"), base: texto("IN RFB 2.004/2021, art. 3º"), prazo: (c) => ultimoDiaUtil(c.ano + 1, 7),
  },
  {
    chave: "inss_13", nome: "INSS e IRRF do 13º salário (DCTFWeb anual)", tipo: "guia", esfera: "federal", escopo: "empresa", periodicidade: "anual",
    quando: texto("20 de dezembro (antecipa se não for dia útil)"), base: texto("Lei 8.620/1993, art. 7º, § 2º"),
    dica: "A DCTFWeb do 13º é entregue junto. A 2ª parcela do 13º é paga aos funcionários até o mesmo dia 20.", conferir: true,
    aplica: comFolha, prazo: (c) => diaDoMes(c.ano, 12, 20, "antecipa"),
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Ocorrências do período

/** Ajustes por unidade, com o padrão do estado onde não foi ajustado (SC: ICMS dia 10 e EFD dia 20; SP: EFD dia 20). */
export function configDaUnidade(cfg: ConfigCalendario, u: UnidadeCal): ConfigUnidade {
  const padrao: ConfigUnidade = u.uf === "SC" ? { icms_dia: 10, efd_dia: 20 } : u.uf === "SP" ? { icms_dia: null, efd_dia: 20 } : {};
  return { ipi: true, iss: !!u.assistencia, iss_dia: null, ...padrao, ...(cfg.unidades?.[u.id] ?? {}) };
}

export type Ocorrencia = {
  id: string; regra: Regra; competencia: string; unidade: UnidadeCal | null;
  /** AAAA-MM-DD; null = dia ainda não definido (fica no mês seguinte à competência) */
  vencimento: string | null; mesReferencia: string; quando: string; base: string;
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function rotuloCompetencia(comp: string) {
  const m = /^(\d{4})(?:-(\d{2})|-T([1-4]))?$/.exec(comp);
  if (!m) return comp;
  if (m[2]) return `${MESES[Number(m[2]) - 1]}/${m[1]}`;
  if (m[3]) return `${m[3]}º tri/${m[1]}`;
  return `ano ${m[1]}`;
}

function competencias(p: Periodicidade, de: string, ate: string): Competencia[] {
  const [a0, m0] = de.split("-").map(Number), [a1, m1] = ate.split("-").map(Number);
  const out: Competencia[] = [];
  if (p === "anual") { for (let a = a0 - 2; a <= a1; a++) out.push({ chave: String(a), ano: a }); return out; }
  // até 14 meses antes: EFD-Contribuições e IRPJ trimestral vencem 2 a 4 meses depois da competência
  for (let t = a0 * 12 + m0 - 1 - 14; t <= a1 * 12 + m1 - 1; t++) {
    const ano = Math.floor(t / 12), mes = (t % 12) + 1;
    if (p === "mensal") out.push({ chave: `${ano}-${dois(mes)}`, ano, mes });
    else if (mes % 3 === 0) out.push({ chave: `${ano}-T${mes / 3}`, ano, tri: mes / 3 });
  }
  return out;
}

/** Obrigações que vencem entre de e ate (AAAA-MM-DD), da empresa e de cada unidade ativa. */
export function ocorrenciasNoPeriodo(de: string, ate: string, unidades: UnidadeCal[], cfg: ConfigCalendario): Ocorrencia[] {
  const matriz = unidades.find((u) => u.matriz) ?? unidades[0] ?? null;
  const out: Ocorrencia[] = [];
  for (const regra of REGRAS) {
    const alvos = regra.escopo === "empresa" ? [null] : unidades;
    for (const unidade of alvos) {
      const ctx: Ctx = { cfg, unidade: unidade ?? matriz, cu: unidade ? configDaUnidade(cfg, unidade) : {} };
      if (regra.aplica && !regra.aplica(ctx)) continue;
      for (const comp of competencias(regra.periodicidade, de, ate)) {
        const venc = regra.prazo(comp, ctx);
        // sem dia definido: aparece no mês seguinte ao fim da competência
        const fim = comp.mes ?? (comp.tri ? comp.tri * 3 : 12);
        const ref = somarMes(comp.ano, fim, 1);
        const mesReferencia = `${ref.ano}-${dois(ref.mes)}`;
        if (venc ? venc < de || venc > ate : mesReferencia < de.slice(0, 7) || mesReferencia > ate.slice(0, 7)) continue;
        if (cfg.inicio && (venc ? venc.slice(0, 7) : mesReferencia) < cfg.inicio) continue;
        out.push({
          id: `${regra.chave}|${comp.chave}|${unidade?.id ?? "empresa"}`, regra, competencia: comp.chave, unidade, vencimento: venc, mesReferencia,
          quando: regra.quando(ctx), base: regra.base(ctx),
        });
      }
    }
  }
  return out.sort((a, b) => (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999") || a.regra.nome.localeCompare(b.regra.nome));
}

// ---------------------------------------------------------------------------------------------------------------
// Situação

export type RegistroObrigacao = {
  chave: string; competencia: string; unidade_id: string | null; situacao: "feito" | "nao_se_aplica" | "pendente";
  feito_em: string | null; valor: number | null; recibo: string | null; observacao: string | null; registrado_nome: string | null; atualizado_em?: string;
};
export type Situacao = "feito" | "nao_se_aplica" | "atrasada" | "hoje" | "proxima" | "futura" | "sem_data";

export const chaveRegistro = (chave: string, competencia: string, unidadeId: string | null) => `${chave}|${competencia}|${unidadeId ?? "empresa"}`;

/** Situação da obrigação hoje: feita ou não se aplica (marcadas), atrasada, vence hoje, nos próximos 7 dias ou depois. */
export function situacaoDe(o: Ocorrencia, reg: RegistroObrigacao | undefined, hoje: string): Situacao {
  if (reg?.situacao === "feito") return "feito";
  if (reg?.situacao === "nao_se_aplica") return "nao_se_aplica";
  if (!o.vencimento) return "sem_data";
  if (o.vencimento < hoje) return "atrasada";
  if (o.vencimento === hoje) return "hoje";
  return o.vencimento <= somarDias(hoje, 7) ? "proxima" : "futura";
}

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  feito: "feito", nao_se_aplica: "não se aplica", atrasada: "atrasada", hoje: "vence hoje", proxima: "nos próximos 7 dias", futura: "a vencer", sem_data: "sem data",
};
