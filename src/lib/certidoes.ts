// Certidões da MF (Painel do contador → Certidões): quais a empresa precisa ter em dia, a última de cada uma e quando vence.
// Federal (Receita e PGFN) e trabalhista (CNDT) valem para o CNPJ todo; estadual, municipal e FGTS (CRF) são de cada unidade.
// Só a MF: as das outras empresas do grupo ficam no painel pessoal. A validade é a escrita na certidão.

export type TipoCertidao = "federal" | "estadual" | "municipal" | "fgts" | "trabalhista" | "outra";
export type SituacaoCertidao = "negativa" | "positiva_efeito_negativa" | "positiva";
export type Certidao = {
  id: string; unidade_id: string | null; tipo: TipoCertidao; situacao: SituacaoCertidao;
  emitida_em: string; validade: string; codigo?: string | null; observacao?: string | null; excluida_em?: string | null;
};
export type UnidadeCertidao = { id: string; nome: string; codigo?: string | null; uf?: string | null; ativo?: boolean | null };

export const TIPOS_CERTIDAO: Record<TipoCertidao, { rotulo: string; daUnidade: boolean; dias: number | null; onde: string; link?: string }> = {
  federal: { rotulo: "Federal (Receita e PGFN)", daUnidade: false, dias: 180, onde: "Site da Receita Federal (vale para a matriz e as filiais)",
    link: "https://servicos.receitafederal.gov.br/servico/certidoes/" },
  trabalhista: { rotulo: "Trabalhista (CNDT)", daUnidade: false, dias: 180, onde: "Site do TST (vale para o CNPJ todo)", link: "https://cndt-certidao.tst.jus.br/" },
  fgts: { rotulo: "FGTS (CRF)", daUnidade: true, dias: 30, onde: "Site da Caixa, pelo CNPJ da unidade",
    link: "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf" },
  estadual: { rotulo: "Estadual (ICMS)", daUnidade: true, dias: null, onde: "SEF/SC ou SEFAZ-SP, conforme a unidade" },
  municipal: { rotulo: "Municipal", daUnidade: true, dias: null, onde: "Prefeitura da cidade da unidade" },
  outra: { rotulo: "Outra", daUnidade: false, dias: null, onde: "" },
};

export const ROTULO_SITUACAO_CERTIDAO: Record<SituacaoCertidao, string> = {
  negativa: "Negativa (sem débitos)", positiva_efeito_negativa: "Positiva com efeitos de negativa", positiva: "Positiva (com débitos)",
};

export type Prazo = "falta" | "vencida" | "vence_logo" | "valida";
/** Dias de antecedência do aviso. */
export const AVISO_DIAS = 15;

const somar = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Validade sugerida pela emissão (só onde o prazo é fixo na lei): federal e CNDT 180 dias, CRF 30 dias. */
export const validadeSugerida = (tipo: TipoCertidao, emitida: string) => (TIPOS_CERTIDAO[tipo].dias && emitida ? somar(emitida, TIPOS_CERTIDAO[tipo].dias!) : "");

export function prazoDe(c: Certidao | undefined, hoje: string): Prazo {
  if (!c) return "falta";
  if (c.validade < hoje) return "vencida";
  return c.validade <= somar(hoje, AVISO_DIAS) ? "vence_logo" : "valida";
}

export const diasAte = (dia: string, hoje: string) => Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);

export type LinhaCertidao = { chave: string; tipo: TipoCertidao; unidade: UnidadeCertidao | null; atual?: Certidao; prazo: Prazo; historico: Certidao[] };

/** Uma linha por certidão que a MF precisa ter (as do CNPJ todo e as de cada unidade ativa), com a mais nova e o prazo. */
export function quadroCertidoes(certidoes: Certidao[], unidades: UnidadeCertidao[], hoje: string): LinhaCertidao[] {
  const ativas = certidoes.filter((c) => !c.excluida_em).sort((a, b) => b.validade.localeCompare(a.validade) || b.emitida_em.localeCompare(a.emitida_em));
  const linhas: LinhaCertidao[] = [];
  const montar = (tipo: TipoCertidao, unidade: UnidadeCertidao | null) => {
    const historico = ativas.filter((c) => c.tipo === tipo && (unidade ? c.unidade_id === unidade.id : !c.unidade_id));
    linhas.push({ chave: `${tipo}-${unidade?.id ?? "cnpj"}`, tipo, unidade, atual: historico[0], prazo: prazoDe(historico[0], hoje), historico });
  };
  const doCnpj: TipoCertidao[] = ["federal", "trabalhista"], daUnidade: TipoCertidao[] = ["estadual", "municipal", "fgts"];
  doCnpj.forEach((t) => montar(t, null));
  unidades.filter((u) => u.ativo !== false).forEach((u) => daUnidade.forEach((t) => montar(t, u)));
  // "outra" só aparece quando foi cadastrada
  const outras = new Set(ativas.filter((c) => c.tipo === "outra").map((c) => c.unidade_id ?? ""));
  outras.forEach((uid) => montar("outra", unidades.find((u) => u.id === uid) ?? null));
  return linhas;
}

/** O que precisa de atenção agora: vencidas, vencendo em até 15 dias ou positivas (com débito). Faltar não avisa (pode ser só não cadastrada). */
export const certidoesUrgentes = (linhas: LinhaCertidao[]) =>
  linhas.filter((l) => l.prazo === "vencida" || l.prazo === "vence_logo" || l.atual?.situacao === "positiva");
