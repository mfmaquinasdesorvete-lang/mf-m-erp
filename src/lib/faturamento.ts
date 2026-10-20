// Faturamento sem desperdício: o que impede um pedido de virar NF-e (para emitir em lote só os que estão prontos),
// o que fazer em cada rejeição da SEFAZ (em português, sem depender do contador) e os números do faturamento
// (acerto de primeira, tempo do pedido até a nota, retrabalho). Arquivo puro (testado).
import { problemaIeDestinatario } from "../../supabase/functions/_shared/nfe-ajustes";

const digitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

type ClienteFat = {
  nome?: string | null; cpf_cnpj?: string | null; inscricao_estadual?: string | null; contribuinte_icms?: number | null; tipo_pessoa?: string | null;
  logradouro?: string | null; numero?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null; cep?: string | null;
};
export type PedidoFat = {
  id: string; numero: number; status: string; id_externo?: string | null; nf_outra_numero?: string | null;
  cliente?: ClienteFat | null; itens?: { produto_id: string; descricao: string; quantidade: number }[] | null;
  notas?: { status: string; ambiente?: string | null }[] | null;
};

/** Nota que já vale (ou está indo) para a SEFAZ: o pedido não pode ganhar outra. */
const notaAtiva = (n: { status: string; ambiente?: string | null }) => n.ambiente !== "homologacao" && ["autorizada", "processando", "contingencia"].includes(n.status);

/** O que impede de emitir a NF-e deste pedido sem ninguém conferir (vazio = pronto para o lote).
 *  Mesmas travas da função de emissão, vistas antes, para não gastar envio com recusa certa. */
export function pendenciasFaturar(p: PedidoFat, ncmDoProduto: (id: string) => string | null | undefined): string[] {
  const f: string[] = [];
  const temNota = (p.notas ?? []).some(notaAtiva);
  if (temNota) f.push("já tem NF-e");
  else if (!["aprovado", "entregue"].includes(p.status)) f.push(p.status === "faturado" ? "já faturado" : "venda não aprovada");
  if (p.nf_outra_numero) f.push("NF feita por outra empresa");
  if (String(p.id_externo ?? "").startsWith("tiny:")) f.push("veio do Tiny (nota feita lá)");
  const c = p.cliente;
  if (!c) f.push("sem cliente");
  else {
    const doc = digitos(c.cpf_cnpj);
    const cad = [
      !c.nome && "nome", ![11, 14].includes(doc.length) && "CPF/CNPJ", !c.logradouro && "endereço", !c.numero && "número",
      !c.bairro && "bairro", !c.municipio && "cidade", !c.uf && "UF", digitos(c.cep).length !== 8 && "CEP",
    ].filter(Boolean);
    if (cad.length) f.push(`cadastro do cliente sem ${cad.join(", ")}`);
    const ie = problemaIeDestinatario(c.cpf_cnpj, c.inscricao_estadual, c.tipo_pessoa === "PJ" && Number(c.contribuinte_icms) === 1);
    if (ie) f.push("inscrição estadual do cliente a conferir");
  }
  const itens = p.itens ?? [];
  if (!itens.length) f.push("sem itens");
  const semNcm = itens.filter((i) => digitos(ncmDoProduto(i.produto_id)).length !== 8);
  if (semNcm.length) f.push(`sem NCM: ${semNcm.map((i) => i.descricao).slice(0, 2).join(", ")}${semNcm.length > 2 ? "…" : ""}`);
  return f;
}

// ---------- rejeições da SEFAZ ----------

export type GuiaRejeicao = { titulo: string; porque: string; fazer: string[] };

/** As rejeições mais comuns, pelo texto que a SEFAZ devolve (sem acento, maiúsculas variam). A primeira que bate vale. */
const GUIAS: [RegExp, GuiaRejeicao][] = [
  [/nao habilitado a operar|nao habilitado.*uf|irregularidade fiscal do destinatario|uso denegado/, {
    titulo: "Cliente com a inscrição estadual baixada ou suspensa",
    porque: "Para a SEFAZ do estado do cliente, a IE dele não está ativa. Nota com IE inativa como contribuinte é recusada.",
    fazer: ["Abra o cadastro do cliente e toque na lupa ao lado de Inscrição estadual para conferir no SINTEGRA.",
      "Se a IE estiver baixada, apague a IE e marque o cliente como Não contribuinte (a nota sai com DIFAL, se for o caso).",
      "Se a IE estiver ativa no SINTEGRA, peça ao cliente o comprovante e fale com o contador antes de emitir de novo."],
  }],
  [/ie do destinatario (invalida|nao vinculada|nao cadastrada)|inscricao estadual do destinatario|ie do destinatario nao informada|indicador de ie/, {
    titulo: "Inscrição estadual do cliente errada",
    porque: "A IE não confere com o CNPJ ou com o dígito do estado, ou o cliente está como contribuinte sem IE.",
    fazer: ["No cadastro do cliente, toque na lupa ao lado de Inscrição estadual (busca no SINTEGRA).",
      "Sem IE: marque Não contribuinte. Isento: escreva ISENTO e marque Contribuinte isento.",
      "Volte na nota e toque em Emitir de novo."],
  }],
  [/beneficio fiscal|cbenef/, {
    titulo: "Falta o código de benefício fiscal (cBenef)",
    porque: "Em SC e em outros estados, ICMS sem destaque (CST 40, 41, 50, 51, 90…) exige o código do benefício.",
    fazer: ["Em Notas fiscais → Regras de tributação, abra a regra da operação e preencha o cBenef (o contador informa o código).",
      "Na transferência, preencha em Configurações da NF-e → unidade → cBenef da transferência.",
      "Emita de novo."],
  }],
  [/ibs|cbs/, {
    titulo: "Faltam os campos da Reforma (IBS/CBS)",
    porque: "A partir de 2026 a nota precisa trazer o grupo IBS/CBS (mesmo com alíquota de teste).",
    fazer: ["Em Notas fiscais → Configurações da NF-e, confira se a Reforma tributária está ligada para a unidade.",
      "Confira se o produto tem NCM e a classificação tributária (cClassTrib) preenchidos.", "Emita de novo."],
  }],
  [/ncm (inexistente|invalido)|codigo ncm/, {
    titulo: "NCM do produto não existe",
    porque: "O NCM foi digitado errado ou foi extinto na tabela da Receita.",
    fazer: ["Abra o produto e use o Sugestor de NCM (ficha do produto) ou copie o NCM da nota de compra do fornecedor.", "Emita de novo."],
  }],
  [/duplicidade/, {
    titulo: "Nota já enviada (duplicidade)",
    porque: "A SEFAZ já recebeu uma nota com o mesmo número. Em geral a primeira foi autorizada e a resposta se perdeu.",
    fazer: ["Abra a nota e toque em Consultar na SEFAZ: se ela estiver autorizada, o ERP atualiza sozinho.",
      "Não emita outra nota para o mesmo pedido antes de consultar."],
  }],
  [/cfop.*(interestadual|uf)|uf.*cfop|cfop de operacao/, {
    titulo: "CFOP não combina com o estado do cliente",
    porque: "CFOP 5.xxx é para o mesmo estado; 6.xxx para outro estado. O endereço do cliente e o CFOP não batem.",
    fazer: ["Confira a UF no cadastro do cliente (e o endereço de entrega, se houver).",
      "Em Regras de tributação, confira se a operação tem CFOP para dentro e para fora do estado.", "Emita de novo."],
  }],
  [/municipio|\bcep\b/, {
    titulo: "Cidade ou CEP do cliente não confere",
    porque: "A cidade, a UF e o CEP do cadastro não formam um endereço válido para a SEFAZ.",
    fazer: ["No cadastro do cliente, apague o CEP e digite de novo (o endereço é preenchido pelos Correios).", "Emita de novo."],
  }],
  [/total.*(difere|nao confere)|somatorio|valor total/, {
    titulo: "Totais da nota não fecham",
    porque: "A soma dos itens, do desconto e do frete não bate com o total informado.",
    fazer: ["Abra o pedido e confira desconto e frete (sem valores negativos).",
      "Na tela Conferir a NF-e, confira o valor de cada item antes de emitir.", "Se continuar, mande o número da nota para o suporte do ERP."],
  }],
  [/certificado|assinatura/, {
    titulo: "Problema com o certificado digital",
    porque: "O certificado A1 da unidade venceu ou não está cadastrado na Focus.",
    fazer: ["Veja em Configurações → Chaves e certificados a validade do certificado.",
      "Se venceu, renove com a certificadora e envie o arquivo novo pelo painel da Focus (nunca mande a senha por mensagem)."],
  }],
  [/emitente|ie do emitente/, {
    titulo: "Dados da empresa (emitente) com problema",
    porque: "A IE ou o CNPJ da unidade que emite não está ativo na SEFAZ.",
    fazer: ["Confira os dados da unidade em Configurações da NF-e.", "Fale com o contador: pode ser pendência da empresa na SEFAZ."],
  }],
  [/data de emissao|horario|data.*atrasad|data.*posterior/, {
    titulo: "Data da nota fora do prazo",
    porque: "A data ou a hora de emissão estão muito antes ou depois do horário da SEFAZ.",
    fazer: ["Emita de novo: o ERP usa a data e a hora do momento do envio."],
  }],
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Guia da rejeição pelo texto da SEFAZ (null quando não reconhece: aí vale a mensagem original). */
export function guiaRejeicao(mensagem: string | null | undefined): GuiaRejeicao | null {
  const m = semAcento(String(mensagem ?? ""));
  if (!m.trim()) return null;
  for (const [re, g] of GUIAS) if (re.test(m)) return g;
  return null;
}

// ---------- indicadores ----------

export type NotaFat = {
  status: string; origem?: string | null; ambiente?: string | null; tentativas?: number | null;
  historico_envios?: { mensagem?: string | null }[] | null; mensagem?: string | null; created_at: string;
  pedido_aprovado_em?: string | null;
};

const mediana = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Números do faturamento feito pelo ERP (notas de teste e importadas do Tiny ficam de fora). */
export function indicadoresFaturamento(notas: NotaFat[], cartasCorrecao: number) {
  const nossas = notas.filter((n) => (n.origem ?? "erp") === "erp" && n.ambiente !== "homologacao");
  const envios = nossas.reduce((s, n) => s + Math.max(1, Number(n.tentativas) || 1), 0);
  const recusasAntigas = nossas.reduce((s, n) => s + (n.historico_envios?.length ?? 0), 0);
  const emErro = nossas.filter((n) => n.status === "erro");
  const recusas = recusasAntigas + emErro.length;
  const deu = nossas.filter((n) => ["autorizada", "cancelada"].includes(n.status));
  const primeira = deu.filter((n) => (Number(n.tentativas) || 1) <= 1 && !(n.historico_envios?.length)).length;
  const horas = deu.filter((n) => n.pedido_aprovado_em)
    .map((n) => (new Date(n.created_at).getTime() - new Date(n.pedido_aprovado_em!).getTime()) / 36e5).filter((h) => h >= 0);
  // motivos: os da nota em erro e os que ficaram no histórico de reenvios
  const motivos = new Map<string, { n: number; dica: string | null }>();
  for (const n of nossas) {
    for (const m of [...(n.historico_envios ?? []).map((h) => h.mensagem), ...(n.status === "erro" ? [n.mensagem] : [])]) {
      if (!m) continue;
      const g = guiaRejeicao(m);
      const k = g?.titulo ?? m.replace(/^rejei[cç][aã]o:\s*/i, "");
      motivos.set(k, { n: (motivos.get(k)?.n ?? 0) + 1, dica: g?.fazer[0] ?? null });
    }
  }
  return {
    envios, autorizadas: deu.length, recusas, emErroAgora: emErro.length,
    acertoPrimeira: envios ? Math.round((1 - recusas / envios) * 100) : null,
    primeiraTentativa: primeira,
    horasAteNota: mediana(horas),
    canceladas: nossas.filter((n) => n.status === "cancelada").length,
    cartasCorrecao,
    motivos: [...motivos.entries()].map(([motivo, v]) => ({ motivo, ...v })).sort((a, b) => b.n - a.n),
  };
}

/** "3 h", "2 dias" */
export function textoHoras(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} dias`;
}
