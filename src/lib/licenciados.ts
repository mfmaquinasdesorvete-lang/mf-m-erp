// Carteira My Frost Sorveterias · Licenciados: as lojas licenciadas e o que cada uma pagou. Só o dono vê (no banco,
// public.licenciados_lojas e licenciados_pagamentos, cada linha de quem a criou). MF ≠ My Frost: nada daqui entra no
// DRE, na conciliação ou nos painéis da MF. Os pagamentos vêm das entradas altas dos extratos pessoais e das vendas
// altas no cartão das InfinitePay (sugestões que a pessoa confere e liga à loja) ou são lançados à mão.
import { daEmpresa, type ContaPessoal, type Empresa, type LancPessoal } from "./pessoal";

export type SituacaoLoja = "negociando" | "implantacao" | "ativa" | "fechando" | "pausada" | "encerrada";
export type ModeloLoja = "quiosque" | "loja" | "loja_cafeteria";
export type SituacaoContrato = "sem" | "negociando" | "assinado" | "rescindido";
export type Loja = {
  id: string; nome: string; cidade: string | null; uf: string | null; responsavel: string | null; documento: string | null; telefone: string | null;
  nomes_extrato: string[] | null; cliente_id: string | null; situacao: SituacaoLoja; inicio: string | null; valor_combinado: number | null;
  mensalidade: number | null; cor: string | null; observacoes: string | null; ordem: number;
  /** ficha da unidade (My Frost Sorveterias): modelo, endereço, contato e contrato */
  modelo?: ModeloLoja | null; endereco?: string | null; cep?: string | null; email?: string | null; email_institucional?: string | null;
  contrato?: SituacaoContrato | null; contrato_assinado_em?: string | null; contrato_vence_em?: string | null; contrato_obs?: string | null;
};
export type CategoriaCusto = "maquinas" | "insumos" | "pdv" | "moveis" | "montagem" | "suporte" | "uniformes" | "comunicacao" | "inauguracao" | "frete" | "viagem" | "outros";
export type CustoLoja = { id: string; loja_id: string; data: string; categoria: CategoriaCusto; descricao: string | null; valor: number; observacao: string | null; anulado: boolean };
export type SituacaoMaquina = "na_loja" | "manutencao" | "devolvida" | "baixada";
export type MaquinaLoja = { id: string; loja_id: string; descricao: string; numero_serie: string | null; data_compra: string | null; valor: number | null; situacao: SituacaoMaquina; observacao: string | null };
export type ArquivoLoja = { id: string; loja_id: string; tipo: "contrato" | "ficha" | "documento" | "foto" | "outro"; nome: string; caminho: string; tamanho: number | null; mime: string | null; criado_em: string };

export const MODELOS_LOJA: { id: ModeloLoja; nome: string }[] = [{ id: "quiosque", nome: "Quiosque" }, { id: "loja", nome: "Loja" }, { id: "loja_cafeteria", nome: "Loja com cafeteria" }];
export const CONTRATOS: { id: SituacaoContrato; nome: string; cor: string }[] = [
  { id: "sem", nome: "Sem contrato", cor: "#b91c1c" }, { id: "negociando", nome: "Contrato em conversa", cor: "#b45309" },
  { id: "assinado", nome: "Contrato assinado", cor: "#047857" }, { id: "rescindido", nome: "Contrato encerrado", cor: "#475569" },
];
/** O que a My Frost entrega para montar a unidade (a lista "por Nós" do material das unidades) + frete, viagem e outros. */
export const CATEGORIAS_CUSTO: { id: CategoriaCusto; nome: string }[] = [
  { id: "maquinas", nome: "Máquinas" }, { id: "moveis", nome: "Móveis / quiosque" }, { id: "insumos", nome: "Insumos (bases e caldas)" },
  { id: "pdv", nome: "Sistema PDV e CMV" }, { id: "montagem", nome: "Montagem e implantação" }, { id: "uniformes", nome: "Uniformes" },
  { id: "comunicacao", nome: "Comunicação (cardápio e PDV)" }, { id: "inauguracao", nome: "Inauguração" }, { id: "suporte", nome: "Suporte" },
  { id: "frete", nome: "Frete" }, { id: "viagem", nome: "Viagem" }, { id: "outros", nome: "Outros" },
];
export const SITUACOES_MAQUINA: { id: SituacaoMaquina; nome: string }[] = [
  { id: "na_loja", nome: "Na loja" }, { id: "manutencao", nome: "Em manutenção" }, { id: "devolvida", nome: "Devolvida" }, { id: "baixada", nome: "Baixada" },
];
export const nomeModelo = (m: string | null | undefined) => MODELOS_LOJA.find((x) => x.id === m)?.nome ?? null;
export const nomeContrato = (c: string | null | undefined) => CONTRATOS.find((x) => x.id === (c ?? "sem"))?.nome ?? "Sem contrato";
export const nomeCategoria = (c: string) => CATEGORIAS_CUSTO.find((x) => x.id === c)?.nome ?? c;

/** "13184420" → "13184-420" */
export const cepBR = (c: string | null | undefined) => (c && /^\d{8}$/.test(c) ? `${c.slice(0, 5)}-${c.slice(5)}` : c ?? "");
/** Endereço completo numa linha (rua, cidade/UF e CEP) e o link do mapa. */
export function enderecoCompleto(l: Pick<Loja, "endereco" | "cidade" | "uf" | "cep">) {
  return [l.endereco, [l.cidade, l.uf].filter(Boolean).join("/"), l.cep && `CEP ${cepBR(l.cep)}`].filter(Boolean).join(" – ");
}
export const linkMapa = (l: Pick<Loja, "endereco" | "cidade" | "uf" | "cep">) =>
  l.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto(l))}` : null;

/** O que falta na ficha da unidade (para completar). */
export function faltaNaFicha(l: Loja): string[] {
  return [
    !l.endereco && "endereço", !l.documento && "CPF/CNPJ", !l.telefone && "telefone", !l.inicio && "data de abertura",
    (l.contrato ?? "sem") === "sem" && "contrato",
  ].filter(Boolean) as string[];
}

/** Custos de montar, máquinas e recebido de uma unidade: quanto investiu, quanto voltou e o saldo. */
export function resumoUnidade(lojaId: string, custos: CustoLoja[], maquinas: MaquinaLoja[], pagamentos: PagamentoLoja[]) {
  const c = custos.filter((x) => x.loja_id === lojaId && !x.anulado);
  const m = maquinas.filter((x) => x.loja_id === lojaId);
  const p = pagamentos.filter((x) => x.loja_id === lojaId && valePagamento(x));
  const custo = Math.round(c.reduce((t, x) => t + Number(x.valor), 0) * 100) / 100;
  const recebido = Math.round(p.reduce((t, x) => t + Number(x.valor) - Number(x.taxa ?? 0), 0) * 100) / 100;
  const porCategoria = CATEGORIAS_CUSTO.map((k) => ({ ...k, valor: Math.round(c.filter((x) => x.categoria === k.id).reduce((t, x) => t + Number(x.valor), 0) * 100) / 100 }))
    .filter((k) => k.valor > 0);
  return { custo, recebido, saldo: Math.round((recebido - custo) * 100) / 100, maquinas: m.filter((x) => x.situacao === "na_loja" || x.situacao === "manutencao").length, porCategoria };
}
export type TipoPagamento = "licenca" | "mensalidade" | "royalties" | "maquina" | "insumos" | "marketing" | "outro";
export type FormaPagamento = "pix" | "cartao" | "ted" | "boleto" | "dinheiro" | "outro";
export type OrigemPagamento = "manual" | "pessoal" | "infinitepay";
export type PagamentoLoja = {
  id: string; loja_id: string | null; data: string; valor: number; taxa: number; tipo: TipoPagamento; forma: FormaPagamento;
  origem: OrigemPagamento; origem_id: string | null; onde: string | null; descricao: string | null; observacao: string | null;
  descartado: boolean; anulado: boolean;
};

export const SITUACOES_LOJA: { id: SituacaoLoja; nome: string; cor: string }[] = [
  { id: "negociando", nome: "Negociando", cor: "#b45309" }, { id: "implantacao", nome: "Em implantação", cor: "#0284c7" },
  { id: "ativa", nome: "Ativa", cor: "#047857" }, { id: "fechando", nome: "Vai fechar", cor: "#c2410c" }, { id: "pausada", nome: "Pausada", cor: "#7c3aed" },
  { id: "encerrada", nome: "Encerrada", cor: "#475569" },
];
export const TIPOS_PAGAMENTO: { id: TipoPagamento; nome: string }[] = [
  { id: "licenca", nome: "Licença" }, { id: "mensalidade", nome: "Mensalidade" }, { id: "royalties", nome: "Royalties" },
  { id: "maquina", nome: "Máquina" }, { id: "insumos", nome: "Insumos" }, { id: "marketing", nome: "Marketing" }, { id: "outro", nome: "Outro" },
];
export const FORMAS_PAGAMENTO: { id: FormaPagamento; nome: string }[] = [
  { id: "pix", nome: "Pix" }, { id: "cartao", nome: "Cartão" }, { id: "ted", nome: "TED" }, { id: "boleto", nome: "Boleto" },
  { id: "dinheiro", nome: "Dinheiro" }, { id: "outro", nome: "Outro" },
];
export const nomeSituacao = (s: string) => SITUACOES_LOJA.find((x) => x.id === s)?.nome ?? s;
export const nomeTipo = (t: string) => TIPOS_PAGAMENTO.find((x) => x.id === t)?.nome ?? t;
export const nomeForma = (f: string) => FORMAS_PAGAMENTO.find((x) => x.id === f)?.nome ?? f;
/** Cores das lojas (fundo forte, letra branca: iguais nos dois temas); a primeira é o rosa da My Frost. */
export const CORES_LOJA: Record<string, string> = {
  rosa: "#c2185b", turquesa: "#0e7490", violeta: "#7c3aed", verde: "#047857", laranja: "#c2410c", azul: "#1d4ed8", ambar: "#b45309", grafite: "#475569",
};
export const corDaLoja = (c: string | null | undefined) => CORES_LOJA[c ?? ""] ?? CORES_LOJA.rosa;

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
// letras e números separados ("DANILO08 09" → "DANILO 08 09"), sem acento, em maiúsculas
const textoAlto = (s: unknown) => ` ${String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
  .replace(/([A-Z])(\d)/g, "$1 $2").replace(/[^A-Z0-9]+/g, " ").trim()} `;

/**
 * Quem pagou, pelo texto do extrato: o Itaú corta o nome em 7 letras e cola a data ("PIX TRANSF FULANO 08/09"),
 * o Nubank escreve "Transferência recebida pelo Pix - NOME - documento - banco" e a InfinitePay "Pix NOME · Recebido".
 */
export function nomeNoExtrato(descricao: string | null | undefined): string {
  const d = String(descricao ?? "").replace(/\s+/g, " ").trim();
  const itau = d.match(/^pix transf (.+?) ?\d{2}[/ ]\d{2}$/i);
  if (itau) return itau[1].trim();
  const nubank = d.match(/recebida pelo pix - (.+?) - /i);
  if (nubank) return nubank[1].trim();
  const infinite = d.match(/^pix (.+?) · recebido/i);
  if (infinite) return infinite[1].trim();
  if (/infinitepay|licenciamento/i.test(d)) return "";
  return d.replace(/\d[\d./-]*/g, " ").replace(/\b(pix|ted|doc|transf\w*|recebid\w*|credito|deposito)\b/gi, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 4).join(" ");
}

/** A loja que o texto do extrato cita (pelos nomes no extrato e pelo nome da loja); a do termo mais longo vence. */
export function lojaDoTexto(texto: string, lojas: Loja[]): Loja | undefined {
  const d = textoAlto(texto);
  let melhor: { loja: Loja; tam: number } | undefined;
  for (const l of lojas) {
    for (const termo of [...(l.nomes_extrato ?? []), l.nome]) {
      const t = textoAlto(termo).trim();
      if (t.replace(/ /g, "").length < 3) continue;
      if (d.includes(` ${t} `) && (!melhor || t.length > melhor.tam)) melhor = { loja: l, tam: t.length };
    }
  }
  return melhor?.loja;
}

/** Uma entrada de dinheiro que pode ser pagamento de loja: do extrato pessoal ou da venda no cartão da InfinitePay. */
export type Entrada = {
  origem: "pessoal" | "infinitepay"; origem_id: string; data: string; valor: number; taxa: number; forma: FormaPagamento;
  onde: string; descricao: string; nome: string;
};

// textos que não são pagamento de loja: desbloqueio, estorno, rendimento, resgate, salário e pró-labore
const NAO_E_PAGAMENTO = /desblo|estorno|devolu|rendiment|resgate|aplicac|\brend\b|pro.?labore|salario/i;
const CATEGORIAS_FORA = new Set(["Salário e pró-labore", "Investimentos", "Cartão (fatura)"]);

/**
 * Pix da MF, das empresas ligadas ou dos sócios: pelo nome inteiro ou pelo CNPJ (como no painel pessoal) e também pelo
 * nome cortado do Itaú ("SOFT PR", "MF MAQU"), que é o começo do nome cadastrado.
 */
export function deEmpresaOuSocio(descricao: string | null | undefined, e: Empresa): boolean {
  if (daEmpresa(descricao, e)) return true;
  const corte = textoAlto(nomeNoExtrato(descricao)).trim();
  if (corte.replace(/ /g, "").length < 4) return false;
  return e.nomes.some((n) => textoAlto(n).trim().startsWith(corte));
}

/**
 * Entradas altas dos extratos pessoais: a partir do mínimo, realizadas, fora dos cartões, sem o que veio da MF, das
 * empresas ligadas ou dos sócios (pró-labore, lucros) e sem o que só passou entre as suas contas.
 */
export function entradasPessoais(lancs: LancPessoal[], contas: ContaPessoal[], o: { empresas: Empresa; entreContas: Set<string>; minimo: number }): Entrada[] {
  const conta = new Map(contas.map((c) => [c.id, c]));
  return lancs.filter((l) => !l.anulado && l.situacao === "realizado" && Number(l.valor) >= o.minimo && conta.get(l.conta_id)?.tipo !== "cartao"
    && !o.entreContas.has(l.id) && !deEmpresaOuSocio(l.descricao, o.empresas) && !NAO_E_PAGAMENTO.test(sem(l.descricao)) && !CATEGORIAS_FORA.has(l.categoria ?? ""))
    .map((l) => ({
      origem: "pessoal", origem_id: l.id, data: l.data, valor: r2(Number(l.valor)), taxa: 0, forma: /\bted\b/i.test(l.descricao) ? "ted" : "pix",
      onde: conta.get(l.conta_id)?.nome ?? "Conta pessoal", descricao: l.descricao, nome: nomeNoExtrato(l.descricao),
    }));
}

export type ContaBancaria = { id: string; nome: string; banco: string | null };
export type ReceberCartao = {
  id: string; descricao: string | null; valor: number; valor_pago: number | null; data_pagamento: string | null; vencimento: string;
  forma_pagamento: string | null; conta_bancaria_id: string | null; pedido_id: string | null; os_id?: string | null; status: string;
};
export type ExtratoLinha = { id: string; conta_bancaria_id: string; valor: number; conta_receber_id: string | null };

/**
 * Vendas altas no cartão das InfinitePay que não são vendas da MF (sem pedido nem OS): o licenciamento recebido por
 * conta de terceiros. A taxa é a diferença entre a venda e o que caiu no extrato ligado a ela.
 */
export function entradasCartao(receber: ReceberCartao[], extrato: ExtratoLinha[], contas: ContaBancaria[], minimo: number): Entrada[] {
  const infinite = new Map(contas.filter((c) => /infinit/i.test(`${c.banco ?? ""} ${c.nome}`)).map((c) => [c.id, c]));
  const caiu = new Map<string, number>();
  for (const e of extrato) if (e.conta_receber_id) caiu.set(e.conta_receber_id, (caiu.get(e.conta_receber_id) ?? 0) + Number(e.valor));
  return receber.filter((r) => r.forma_pagamento === "cartao" && r.status === "pago" && !!r.conta_bancaria_id && infinite.has(r.conta_bancaria_id)
    && !r.pedido_id && !r.os_id && Number(r.valor_pago ?? r.valor) >= minimo)
    .map((r) => {
      const bruto = r2(Number(r.valor_pago ?? r.valor));
      const liquido = caiu.get(r.id);
      return {
        origem: "infinitepay", origem_id: r.id, data: r.data_pagamento ?? r.vencimento, valor: bruto,
        taxa: liquido != null && liquido < bruto ? r2(bruto - liquido) : 0, forma: "cartao",
        onde: infinite.get(r.conta_bancaria_id!)?.nome ?? "InfinitePay", descricao: r.descricao ?? "Venda no cartão", nome: "",
      };
    });
}

export type Sugestao = Entrada & { resta: number; taxaResta: number; loja?: Loja };
const chave = (origem: string, id: string | null) => `${origem}:${id ?? ""}`;

/**
 * O que ainda falta conferir: cada entrada menos o que já foi ligado a lojas (dá para dividir uma entrada entre duas
 * lojas) e sem as marcadas como "não é de loja". A loja sugerida vem do texto do extrato.
 */
export function sugestoes(entradas: Entrada[], pagamentos: PagamentoLoja[], lojas: Loja[]): Sugestao[] {
  const ligado = new Map<string, { valor: number; taxa: number }>();
  const fora = new Set<string>();
  for (const p of pagamentos) {
    if (p.anulado || p.origem === "manual") continue;
    const k = chave(p.origem, p.origem_id);
    if (p.descartado) { fora.add(k); continue; }
    const a = ligado.get(k) ?? { valor: 0, taxa: 0 };
    ligado.set(k, { valor: a.valor + Number(p.valor), taxa: a.taxa + Number(p.taxa) });
  }
  return entradas.flatMap((e) => {
    const k = chave(e.origem, e.origem_id);
    if (fora.has(k)) return [];
    const ja = ligado.get(k) ?? { valor: 0, taxa: 0 };
    const resta = r2(e.valor - ja.valor);
    if (resta < 0.01) return [];
    return [{ ...e, resta, taxaResta: Math.max(0, r2(e.taxa - ja.taxa)), loja: lojaDoTexto(`${e.descricao} ${e.nome}`, lojas) }];
  }).sort((a, b) => b.data.localeCompare(a.data) || b.valor - a.valor);
}

/** Pagamento que vale: ligado a uma loja, nem anulado nem "não é de loja". */
export const valePagamento = (p: PagamentoLoja) => !p.anulado && !p.descartado && !!p.loja_id;

export type ResumoLoja = {
  loja: Loja; total: number; taxas: number; qtd: number; noPeriodo: number; qtdPeriodo: number; primeiro: string | null; ultimo: string | null;
  falta: number | null; pct: number | null; diasSemPagar: number | null;
};
const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/** Por loja: o total pago desde o começo, o do período, as taxas, o primeiro e o último pagamento e quanto falta do combinado. */
export function resumoLojas(lojas: Loja[], pagamentos: PagamentoLoja[], f: { de: string; ate: string }, hoje: string): ResumoLoja[] {
  return lojas.map((loja) => {
    const ps = pagamentos.filter((p) => valePagamento(p) && p.loja_id === loja.id);
    const total = r2(ps.reduce((t, p) => t + Number(p.valor), 0));
    const doPeriodo = ps.filter((p) => p.data >= f.de && p.data <= f.ate);
    const datas = ps.map((p) => p.data).sort();
    const comb = Number(loja.valor_combinado) || 0;
    return {
      loja, total, taxas: r2(ps.reduce((t, p) => t + Number(p.taxa), 0)), qtd: ps.length,
      noPeriodo: r2(doPeriodo.reduce((t, p) => t + Number(p.valor), 0)), qtdPeriodo: doPeriodo.length,
      primeiro: datas[0] ?? null, ultimo: datas[datas.length - 1] ?? null,
      falta: comb > 0 ? Math.max(0, r2(comb - total)) : null, pct: comb > 0 ? Math.min(100, Math.round((total / comb) * 100)) : null,
      diasSemPagar: datas.length ? dias(datas[datas.length - 1], hoje) : null,
    };
  });
}

/** Recebido mês a mês (bruto e taxas), nos n meses até o mês informado. */
export function serieMensalLojas(pagamentos: PagamentoLoja[], ateMes: string, n = 12) {
  const [a, m] = ateMes.split("-").map(Number);
  const meses = Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - k), 1));
    return d.toISOString().slice(0, 7);
  });
  return meses.map((mes) => {
    const ps = pagamentos.filter((p) => valePagamento(p) && p.data.startsWith(mes));
    return { mes, valor: r2(ps.reduce((t, p) => t + Number(p.valor), 0)), taxas: r2(ps.reduce((t, p) => t + Number(p.taxa), 0)) };
  });
}

export type PeriodoLic = "12m" | "ano" | "anterior" | "tudo";
export const PERIODOS_LIC: { id: PeriodoLic; rotulo: string }[] = [
  { id: "12m", rotulo: "12 meses" }, { id: "ano", rotulo: "Este ano" }, { id: "anterior", rotulo: "Ano passado" }, { id: "tudo", rotulo: "Tudo" },
];
export function faixaLic(id: PeriodoLic, hoje: string): { de: string; ate: string } {
  const ano = Number(hoje.slice(0, 4));
  if (id === "ano") return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
  if (id === "anterior") return { de: `${ano - 1}-01-01`, ate: `${ano - 1}-12-31` };
  if (id === "tudo") return { de: "2000-01-01", ate: "2100-12-31" };
  const [a, m] = hoje.split("-").map(Number);
  return { de: new Date(Date.UTC(a, m - 12, 1)).toISOString().slice(0, 10), ate: hoje };
}

/** Termo para guardar na loja ao ligar uma entrada: o nome como o extrato escreve (sem repetir). */
export function nomesComTermo(nomes: string[] | null | undefined, termo: string): string[] {
  const t = termo.trim();
  const atual = nomes ?? [];
  if (t.replace(/\W/g, "").length < 3 || atual.some((n) => textoAlto(n) === textoAlto(t))) return atual;
  return [...atual, t].slice(0, 20);
}
