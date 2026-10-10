// Geração de PDFs (orçamento/pedido e ordem de serviço) no próprio navegador.
// jsPDF é carregado só quando um PDF é gerado, para não pesar na abertura do sistema.
import type { Cliente, Config, Item, ItemChecklist } from "./types";
import type { Unidade } from "./unidade";
import { brl, dataBR, docFormat } from "./format";
import { formatarTelefone } from "./mascaras";
import {
  AVISOS, cepFmt, codigoTransporte, codigoVolume, medidasTxt, pesoDoVolume, pesoTxt, volumeVazio,
  type AvisoId, type EtiquetaDados, type ModeloEtiqueta,
} from "./etiquetaDados";
import logoPdf from "@/assets/logo-pdf.jpg";

let logoCache: Promise<string | null> | null = null;
/** Logo em data URL para o jsPDF (carregada uma vez). */
function logoDataUrl() {
  logoCache ??= fetch(logoPdf).then((r) => r.blob()).then((b) => new Promise<string>((ok) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result as string);
    fr.readAsDataURL(b);
  })).catch(() => null);
  return logoCache;
}

const NAVY: [number, number, number] = [7, 13, 24];
const hexRgb = (h?: string | null): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h ?? "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};
const AZUL: [number, number, number] = [214, 153, 72];
const CINZA: [number, number, number] = [100, 116, 139];

// A fonte padrão do PDF (Helvetica) só tem o alfabeto latino: setas, emojis e símbolos fora dele
// saem como lixo. Troca pelo equivalente mais próximo e tira o resto.
const TROCAS: Record<string, string> = {
  "→": "->", "←": "<-", "⇒": "=>", "≥": ">=", "≤": "<=", "≠": "<>", "✓": "v", "✔": "v", "✗": "x", "✘": "x",
  "−": "-", "‐": "-", "‑": "-", "′": "'", "″": '"', "⁄": "/", "∅": "Ø", "Ω": "ohm", "µ": "µ", "²": "²", "³": "³",
};
// Windows-1252: o que a fonte padrão consegue desenhar além do latino básico
const EXTRA_1252 = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function textoPdf(t: string): string {
  return t.normalize("NFC").replace(/[\s\S]/gu, (c) => {
    const n = c.codePointAt(0)!;
    if (n === 10 || n === 9 || (n >= 32 && n <= 126) || (n >= 160 && n <= 255) || EXTRA_1252.includes(c)) return c;
    return TROCAS[c] ?? (/\p{Zs}/u.test(c) ? " " : "");
  });
}

async function novoDoc() {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import("jspdf"), import("jspdf-autotable"), logoDataUrl()]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  // todo texto passa pela troca de caracteres (textos, quebras de linha e células das tabelas)
  const texto = doc.text.bind(doc);
  (doc as any).text = (t: string | string[], ...resto: unknown[]) => (texto as any)(Array.isArray(t) ? t.map(textoPdf) : textoPdf(String(t)), ...resto);
  const quebra = doc.splitTextToSize.bind(doc);
  // a tabela manda várias linhas de uma vez (lista): cada linha é tratada separada
  (doc as any).splitTextToSize = (t: string | string[], ...resto: unknown[]) =>
    (quebra as any)(Array.isArray(t) ? t.map((x) => textoPdf(String(x ?? ""))) : textoPdf(String(t ?? "")), ...resto);
  const tabela = ((d: any, o: any) => autoTable(d, {
    ...o,
    didParseCell: (c: any) => { c.cell.text = (c.cell.text ?? []).map((x: string) => textoPdf(String(x))); o.didParseCell?.(c); },
  })) as typeof autoTable;
  return { doc, autoTable: tabela, logo };
}

/** Dados da empresa no PDF: os da unidade do documento (CNPJ, endereço e contato de SC ou SP). */
export function comUnidade(cfg: Config, u?: Unidade | null): Config {
  if (!u) return cfg;
  const endereco = [[u.logradouro, u.numero].filter(Boolean).join(", "), u.complemento, u.bairro, u.cep && `CEP ${String(u.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2")}`]
    .filter(Boolean).join(" - ");
  return {
    ...cfg,
    razao_social: u.razao_social || cfg.razao_social,
    cnpj: u.cnpj || cfg.cnpj,
    inscricao_estadual: u.inscricao_estadual || cfg.inscricao_estadual,
    endereco: endereco || cfg.endereco,
    municipio: u.municipio || cfg.municipio,
    uf: u.uf || cfg.uf,
    telefone: u.telefone || cfg.telefone,
    whatsapp: u.whatsapp || cfg.whatsapp,
    email: u.email || cfg.email,
  };
}

type Doc = Awaited<ReturnType<typeof novoDoc>>["doc"];

function cabecalho(doc: Doc, cfg: Config, titulo: string, numero: string, logo?: string | null) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, w, 30, "F");
  if (logo) {
    doc.addImage(logo, "JPEG", 13, 6, 18, 18);
  } else {
    doc.setFillColor(...AZUL);
    doc.roundedRect(14, 8, 14, 14, 2, 2, "F");
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(cfg.nome_fantasia || cfg.razao_social, 34, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const linha1 = [cfg.razao_social, cfg.cnpj && `CNPJ ${docFormat(cfg.cnpj)}`, cfg.inscricao_estadual && `IE ${cfg.inscricao_estadual}`].filter(Boolean).join("  ·  ");
  const linha2 = [cfg.endereco, cfg.municipio && `${cfg.municipio}/${cfg.uf ?? ""}`].filter(Boolean).join(" - ");
  const mesmoNumero = (cfg.whatsapp ?? "").replace(/\D/g, "") === (cfg.telefone ?? "").replace(/\D/g, "");
  const linha3 = [cfg.whatsapp && `WhatsApp ${formatarTelefone(cfg.whatsapp)}`, cfg.telefone && !mesmoNumero && formatarTelefone(cfg.telefone), cfg.email]
    .filter(Boolean).join("  ·  ");
  // até onde o texto da empresa pode ir sem encostar no título (alinhado à direita)
  const tamTitulo = titulo.length > 20 ? 10.5 : 12;
  doc.setFont("helvetica", "bold"); doc.setFontSize(tamTitulo);
  const larguraTitulo = Math.max(doc.getTextWidth(titulo), 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8);
  const max = w - 14 - larguraTitulo - 6 - 34;
  // linha comprida: primeiro diminui a letra (até 6,5); só então corta com reticências
  const escrever = (t: string, y: number) => {
    let tam = 8;
    doc.setFontSize(tam);
    while (doc.getTextWidth(t) > max && tam > 6) { tam -= 0.25; doc.setFontSize(tam); }
    let s = t;
    if (doc.getTextWidth(s) > max) {
      while (s.length > 4 && doc.getTextWidth(`${s}…`) > max) s = s.slice(0, -1);
      s = `${s.trimEnd()}…`;
    }
    doc.text(s, 34, y);
    doc.setFontSize(8);
  };
  escrever(linha1, 19);
  if (linha2) escrever(linha2, 23);
  if (linha3) escrever(linha3, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(tamTitulo);
  doc.text(titulo, w - 14, 14, { align: "right" });
  doc.setFontSize(10);
  doc.text(numero, w - 14, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, w - 14, 26, { align: "right" });
  doc.setTextColor(30, 41, 59);
}

function blocoCliente(doc: Doc, c: Cliente | undefined, y: number) {
  if (!c) return y;
  const w = doc.internal.pageSize.getWidth();
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, w - 28, 22, 2, 2, "S");
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA);
  doc.text("CLIENTE", 18, y + 5);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(c.nome, 18, y + 10.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const end = [c.logradouro && `${c.logradouro}, ${c.numero ?? "s/n"}`, c.bairro, c.municipio && `${c.municipio}/${c.uf ?? ""}`, c.cep && `CEP ${c.cep}`]
    .filter(Boolean).join(" - ");
  doc.text([c.cpf_cnpj ? `CPF/CNPJ ${docFormat(c.cpf_cnpj)}` : "", c.whatsapp ? `WhatsApp ${c.whatsapp}` : ""].filter(Boolean).join("   ·   "), 18, y + 15);
  if (end) doc.text(end, 18, y + 19);
  return y + 28;
}

function rodape(doc: Doc) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text(`Página ${i} de ${total}`, w - 14, h - 8, { align: "right" });
  }
}

const LIMITE_Y = 280; // abaixo disso fica o "Página x de y"

function paragrafo(doc: Doc, titulo: string, texto: string, y: number) {
  const w = doc.internal.pageSize.getWidth();
  if (y > 260) { doc.addPage(); y = 20; }
  if (titulo) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(titulo, 14, y);
    y += 5;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const linhas: string[] = doc.splitTextToSize(texto, w - 28);
  for (const l of linhas) {
    if (y > LIMITE_Y) { doc.addPage(); y = 20; doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(51, 65, 85); }
    doc.text(l, 14, y);
    y += 4;
  }
  return y + 3;
}

// ---------------------------------------------------------------------
// Orçamento / pedido
// ---------------------------------------------------------------------
export async function pdfOrcamento(p: {
  numero?: number; status?: string; cliente?: Cliente; itens: Item[]; desconto: number; frete: number;
  forma_pagamento: string; parcelas: number; observacoes?: string | null; vendedor?: string | null;
  garantias: Record<string, number>; // produto_id -> meses (só máquinas)
  validade?: string | null;
}, cfg: Config) {
  const { doc, autoTable, logo } = await novoDoc();
  const ehOrcamento = !p.status || p.status === "orcamento";
  // Layout da proposta (Configurações → Proposta comercial)
  const cor = hexRgb(cfg.proposta_cor) ?? NAVY;
  cabecalho(doc, cfg, ehOrcamento ? (cfg.proposta_titulo || "Proposta comercial").toUpperCase() : "PEDIDO DE VENDA", p.numero ? `Nº ${p.numero}` : "Rascunho", logo);
  if (ehOrcamento) { doc.setFillColor(...cor); doc.rect(0, 30, doc.internal.pageSize.getWidth(), 1.6, "F"); }
  let y = blocoCliente(doc, p.cliente, 36);
  if (ehOrcamento && cfg.proposta_apresentacao) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(51, 65, 85);
    y = paragrafo(doc, "", cfg.proposta_apresentacao, y) + 1;
  }

  const subtotal = p.itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const total = Math.max(subtotal - Number(p.desconto || 0) + Number(p.frete || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [["Item", "Qtd", "Unitário", "Total"]],
    body: p.itens.map((i) => [
      i.descricao + (p.garantias[i.produto_id] ? `\nGarantia de ${p.garantias[i.produto_id]} meses` : "") + (i.numero_serie ? `\nNº de série: ${i.numero_serie}` : ""),
      String(i.quantidade), brl(i.valor_unitario), brl(i.quantidade * i.valor_unitario),
    ]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: ehOrcamento ? cor : NAVY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: { 1: { halign: "center", cellWidth: 16 }, 2: { halign: "right", cellWidth: 32 }, 3: { halign: "right", cellWidth: 34 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  if (y > 255) { doc.addPage(); y = 20; }

  const w = doc.internal.pageSize.getWidth();
  const linhaTotal = (rotulo: string, valor: string, forte = false) => {
    doc.setFont("helvetica", forte ? "bold" : "normal");
    doc.setFontSize(forte ? 12 : 9);
    doc.setTextColor(forte ? 15 : 71, forte ? 23 : 85, forte ? 42 : 105);
    doc.text(rotulo, w - 60, y);
    doc.text(valor, w - 14, y, { align: "right" });
    y += forte ? 7 : 5;
  };
  linhaTotal("Subtotal", brl(subtotal));
  if (Number(p.desconto)) linhaTotal("Desconto", `- ${brl(p.desconto)}`);
  if (Number(p.frete)) linhaTotal("Frete", brl(p.frete));
  y += 1;
  linhaTotal("TOTAL", brl(total), true);
  y += 4;

  const formas: Record<string, string> = { boleto: "Boleto bancário", pix: "Pix", cartao: "Cartão", transferencia: "Transferência", dinheiro: "Dinheiro" };
  const condicao = `${formas[p.forma_pagamento] ?? p.forma_pagamento}${p.parcelas > 1 ? ` em ${p.parcelas}x de ${brl(total / p.parcelas)}` : " à vista"}.`;
  y = paragrafo(doc, "Condições de pagamento", condicao, y);
  if (ehOrcamento) y = paragrafo(doc, "Validade", p.validade
    ? `Proposta válida até ${dataBR(p.validade)}. Preços sujeitos a disponibilidade de estoque.`
    : `Esta proposta é válida por ${cfg.validade_orcamento_dias} dias a partir da data de emissão. Preços sujeitos a disponibilidade de estoque.`, y);
  if (ehOrcamento && cfg.proposta_condicoes) y = paragrafo(doc, "Condições", cfg.proposta_condicoes, y);
  if (Object.keys(p.garantias).length) y = paragrafo(doc, "Garantia", cfg.termo_garantia, y);
  if (p.observacoes) y = paragrafo(doc, "Observações", p.observacoes, y);
  if (p.vendedor) y = paragrafo(doc, "Atendimento", `${p.vendedor}${cfg.whatsapp ? ` - WhatsApp ${cfg.whatsapp}` : ""}`, y);
  if (ehOrcamento && cfg.proposta_rodape) paragrafo(doc, "", cfg.proposta_rodape, y);

  rodape(doc);
  return doc.output("blob");
}

// ---------------------------------------------------------------------
// Ordem de serviço (comprovante de entrada ou laudo/entrega)
// ---------------------------------------------------------------------
export async function pdfOS(o: {
  numero?: number; tipo: "entrada" | "laudo"; cliente?: Cliente; equipamento: string; numero_serie?: string | null;
  defeito_relatado: string; diagnostico?: string | null; solucao?: string | null; checklist: ItemChecklist[];
  itens: Item[]; valor_mao_obra: number; em_garantia: boolean; garantia_ate?: string | null; data_entrada?: string;
  previsao?: string | null; tecnico?: string | null; assinatura?: string | null; recebido_por?: string | null;
}, cfg: Config) {
  const { doc, autoTable, logo } = await novoDoc();
  const w = doc.internal.pageSize.getWidth();
  cabecalho(doc, cfg, o.tipo === "entrada" ? "COMPROVANTE DE ENTRADA" : "LAUDO TÉCNICO / ENTREGA", o.numero ? `OS Nº ${o.numero}` : "OS", logo);
  let y = blocoCliente(doc, o.cliente, 36);

  autoTable(doc, {
    startY: y,
    body: [
      ["Equipamento", o.equipamento],
      ["Nº de série", o.numero_serie || "-"],
      ["Garantia", o.em_garantia ? `Em garantia${o.garantia_ate ? ` até ${dataBR(o.garantia_ate)}` : ""} - serviço sem custo` : "Fora da garantia"],
      ["Entrada", dataBR(o.data_entrada) + (o.previsao ? `   ·   Previsão de entrega: ${dataBR(o.previsao)}` : "")],
      ...(o.tecnico ? [["Técnico", o.tecnico]] : []),
      ["Defeito relatado", o.defeito_relatado],
      ...(o.tipo === "laudo" && o.diagnostico ? [["Diagnóstico", o.diagnostico]] : []),
      ...(o.tipo === "laudo" && o.solucao ? [["Serviço executado", o.solucao]] : []),
    ],
    styles: { fontSize: 9, cellPadding: 1.7, textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38, textColor: [71, 85, 105] } },
    theme: "plain",
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  if (o.checklist.length) {
    autoTable(doc, {
      startY: y,
      head: [["Checklist de recebimento", "Situação", "Observação"]],
      body: o.checklist.map((c) => [c.item, c.ok ? "OK" : "Atenção", c.obs ?? ""]),
      styles: { fontSize: 8.5, cellPadding: 1.5 },
      headStyles: { fillColor: NAVY, textColor: 255 },
      columnStyles: { 1: { cellWidth: 22, halign: "center" } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  if (o.tipo === "laudo" && (o.itens.length || o.valor_mao_obra)) {
    autoTable(doc, {
      startY: y,
      head: [["Peças e serviços", "Qtd", "Unitário", "Total"]],
      body: [
        ...o.itens.map((i) => [i.descricao, String(i.quantidade), brl(i.valor_unitario), brl(i.quantidade * i.valor_unitario)]),
        ...(o.valor_mao_obra ? [["Mão de obra", "1", brl(o.valor_mao_obra), brl(o.valor_mao_obra)]] : []),
      ],
      foot: [["", "", "Total", o.em_garantia ? "Garantia (R$ 0,00)" : brl(o.itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0) + Number(o.valor_mao_obra || 0))]],
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: 255 },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
      columnStyles: { 1: { halign: "center", cellWidth: 14 }, 2: { halign: "right", cellWidth: 30 }, 3: { halign: "right", cellWidth: 34 } },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  y = paragrafo(doc, "Condições", o.tipo === "entrada"
    ? "O orçamento do conserto será enviado pelo WhatsApp antes de qualquer serviço. Equipamentos não retirados em até 90 dias após o aviso de conclusão poderão ser cobrados por armazenagem."
    : `Garantia do serviço executado: 90 dias para as peças trocadas e a mão de obra. ${cfg.termo_garantia}`, y);

  if (y > 250) { doc.addPage(); y = 20; }
  y += 4;
  if (o.assinatura) {
    try { doc.addImage(o.assinatura, "PNG", 14, y, 60, 22); } catch { /* assinatura inválida: segue sem imagem */ }
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(14, y + 24, 84, y + 24);
  doc.line(w - 84, y + 24, w - 14, y + 24);
  doc.setFontSize(8);
  doc.setTextColor(...CINZA);
  doc.text(o.recebido_por ? `Cliente: ${o.recebido_por}` : "Assinatura do cliente", 14, y + 28);
  doc.text(cfg.nome_fantasia || cfg.razao_social, w - 14, y + 28, { align: "right" });

  rodape(doc);
  return doc.output("blob");
}

// ---------------------------------------------------------------------
// Pedido de compra / solicitação de cotação ao fornecedor
// ---------------------------------------------------------------------
export async function pdfPedidoCompra(pc: {
  numero?: number; status: string; fornecedor?: { nome: string; cnpj: string | null } | null;
  itens: { descricao: string; quantidade: number; custo_unitario: number; unidade?: string }[];
  frete: number; previsao_entrega?: string | null; condicao_pagamento?: string | null; observacoes?: string | null;
}, cfg: Config) {
  const { doc, autoTable, logo } = await novoDoc();
  const cotacao = pc.status === "cotacao";
  cabecalho(doc, cfg, cotacao ? "SOLICITAÇÃO DE COTAÇÃO" : "PEDIDO DE COMPRA", pc.numero ? `Nº ${pc.numero}` : "Rascunho", logo);
  let y = 38;
  const w = doc.internal.pageSize.getWidth();
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, w - 28, 14, 2, 2, "S");
  doc.setFontSize(7.5); doc.setTextColor(...CINZA); doc.text("FORNECEDOR", 18, y + 5);
  doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
  doc.text(`${pc.fornecedor?.nome ?? "A definir"}${pc.fornecedor?.cnpj ? `  ·  CNPJ ${docFormat(pc.fornecedor.cnpj)}` : ""}`, 18, y + 10.5);
  doc.setFont("helvetica", "normal");
  y += 20;

  autoTable(doc, {
    startY: y,
    head: [cotacao ? ["Item", "Qtd", "Preço unitário", "Total"] : ["Item", "Qtd", "Custo unitário", "Total"]],
    body: pc.itens.map((i) => [i.descricao, `${i.quantidade} ${i.unidade ?? ""}`.trim(),
      cotacao && !i.custo_unitario ? "" : brl(i.custo_unitario), cotacao && !i.custo_unitario ? "" : brl(i.quantidade * i.custo_unitario)]),
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59], minCellHeight: cotacao ? 9 : 0 },
    headStyles: { fillColor: NAVY, textColor: 255 },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: { 1: { halign: "center", cellWidth: 22 }, 2: { halign: "right", cellWidth: 32 }, 3: { halign: "right", cellWidth: 32 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;
  if (y > 260) { doc.addPage(); y = 20; }
  if (!cotacao) {
    const total = pc.itens.reduce((s, i) => s + i.quantidade * i.custo_unitario, 0) + Number(pc.frete || 0);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(`Total${pc.frete ? ` (com frete de ${brl(pc.frete)})` : ""}: ${brl(total)}`, w - 14, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 8;
  }
  if (cotacao) y = paragrafo(doc, "Pedimos", "Por favor, informe preço unitário, prazo de entrega, condição de pagamento e valor do frete até o nosso endereço.", y);
  if (pc.previsao_entrega) y = paragrafo(doc, "Entrega desejada", dataBR(pc.previsao_entrega), y);
  if (pc.condicao_pagamento) y = paragrafo(doc, "Condição de pagamento", pc.condicao_pagamento, y);
  if (pc.observacoes) y = paragrafo(doc, "Observações", pc.observacoes, y);
  paragrafo(doc, "Entregar em", [cfg.razao_social, cfg.endereco, cfg.municipio && `${cfg.municipio}/${cfg.uf ?? ""}`].filter(Boolean).join(" - "), y);
  rodape(doc);
  return doc.output("blob");
}

// ---------------------------------------------------------------------
// Relatório do financeiro (contas a receber ou a pagar) para imprimir
// ---------------------------------------------------------------------
export async function pdfFinanceiro(r: {
  titulo: string; filtros: string; terceiro: string;
  linhas: { vencimento: string; descricao: string; terceiro: string; situacao: string; pagamento: string | null; valor: number; pago: number | null }[];
}, cfg: Config) {
  const { doc, autoTable, logo } = await novoDoc();
  cabecalho(doc, cfg, r.titulo.toUpperCase(), `${r.linhas.length} conta(s)`, logo);
  doc.setFontSize(8.5);
  doc.setTextColor(...CINZA);
  doc.text(r.filtros, 14, 37);

  const soma = (f: (l: (typeof r.linhas)[number]) => boolean) => r.linhas.filter(f).reduce((s, l) => s + Number(l.valor), 0);
  const ROTULO: Record<string, string> = { aberto: "Em aberto", vencido: "Vencida", pago: "Paga", cancelado: "Cancelada" };
  autoTable(doc, {
    startY: 41,
    head: [["Vencimento", "Descrição", r.terceiro, "Situação", "Pago em", "Valor"]],
    body: r.linhas.map((l) => [dataBR(l.vencimento), l.descricao, l.terceiro, ROTULO[l.situacao] ?? l.situacao,
      l.pagamento ? dataBR(l.pagamento) : "", brl(l.pago ?? l.valor)]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8, textColor: [30, 41, 59] },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: { 0: { cellWidth: 20 }, 3: { cellWidth: 19 }, 4: { cellWidth: 19 }, 5: { halign: "right", cellWidth: 27 } },
    didParseCell: (d: any) => { if (d.section === "body" && d.column.index === 3 && d.cell.raw === "Vencida") d.cell.styles.textColor = [200, 30, 30]; },
    margin: { left: 14, right: 14 },
  });
  let y = (doc as any).lastAutoTable.finalY + 7;
  if (y > 255) { doc.addPage(); y = 20; }
  const w = doc.internal.pageSize.getWidth();
  const total = (rotulo: string, valor: number, forte = false) => {
    doc.setFont("helvetica", forte ? "bold" : "normal");
    doc.setFontSize(forte ? 11 : 9);
    doc.setTextColor(30, 41, 59);
    doc.text(rotulo, w - 75, y);
    doc.text(brl(valor), w - 14, y, { align: "right" });
    y += forte ? 7 : 5;
  };
  total("Em aberto (a vencer)", soma((l) => l.situacao === "aberto"));
  total("Vencidas", soma((l) => l.situacao === "vencido"));
  total("Pagas", r.linhas.filter((l) => l.situacao === "pago").reduce((s, l) => s + Number(l.pago ?? l.valor), 0));
  total("TOTAL", soma((l) => l.situacao !== "cancelado"), true);
  rodape(doc);
  return doc.output("blob");
}

// ---------------------------------------------------------------------
// Relatório de comissões
// ---------------------------------------------------------------------
export async function pdfComissoes(r: {
  filtros: string;
  linhas: { data: string; vendedor: string; pedido: number | null; cliente: string; descricao: string; base: number; percentual: number; valor: number; status: string }[];
}, cfg: Config) {
  const { doc, autoTable, logo } = await novoDoc();
  cabecalho(doc, cfg, "COMISSÕES", `${r.linhas.length} lançamento(s)`, logo);
  doc.setFontSize(8.5); doc.setTextColor(...CINZA); doc.text(r.filtros, 14, 37);
  autoTable(doc, {
    startY: 41,
    head: [["Data", "Vendedor", "Pedido / cliente", "Base", "%", "Comissão", "Situação"]],
    body: r.linhas.map((l) => [dataBR(l.data), l.vendedor, `${l.pedido ? `#${l.pedido} ` : ""}${l.cliente}\n${l.descricao}`, brl(l.base),
      `${l.percentual.toLocaleString("pt-BR")}%`, brl(l.valor), l.status]),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8, textColor: [30, 41, 59] },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: { 0: { cellWidth: 19 }, 3: { halign: "right", cellWidth: 24 }, 4: { halign: "right", cellWidth: 12 }, 5: { halign: "right", cellWidth: 24 }, 6: { cellWidth: 18 } },
    margin: { left: 14, right: 14 },
  });
  let y = (doc as any).lastAutoTable.finalY + 7;
  if (y > LIMITE_Y - 6) { doc.addPage(); y = 20; }
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
  doc.text("TOTAL", w - 75, y);
  doc.text(brl(r.linhas.filter((l) => l.status !== "cancelada").reduce((s, l) => s + l.valor, 0)), w - 14, y, { align: "right" });
  rodape(doc);
  return doc.output("blob");
}

// ---------------------------------------------------------------------
// Etiquetas de transporte (endereçamento, uma por volume) e de volume (identificação: nº grande, conteúdo,
// peso, medidas e avisos de manuseio). 10 x 15 cm ou 10 x 10 cm (térmica) ou A4 com guia de corte.
// ---------------------------------------------------------------------

/** Código de barras CODE128 como imagem (gerado no navegador). */
async function codigoBarras(texto: string) {
  const { default: JsBarcode } = await import("jsbarcode");
  const c = document.createElement("canvas");
  JsBarcode(c, texto, { format: "CODE128", displayValue: false, margin: 0, height: 80, width: 2, background: "#ffffff", lineColor: "#000000" });
  return { png: c.toDataURL("image/png"), modulos: c.width / 2 };
}

type Barras = Map<string, Awaited<ReturnType<typeof codigoBarras>> | null>;
async function barraDe(barras: Barras, texto: string) {
  if (!barras.has(texto)) barras.set(texto, await codigoBarras(texto).catch(() => null));
  return barras.get(texto) ?? null;
}

/** Desenha o código centralizado: largura proporcional ao tamanho do código (curto não estica a etiqueta toda). */
function desenharBarra(doc: Doc, b: { png: string; modulos: number }, xCentro: number, y: number, largMax: number, altura: number) {
  const bw = Math.min(largMax, Math.max(45, b.modulos * 0.42));
  doc.addImage(b.png, "PNG", xCentro - bw / 2, y, bw, altura);
}

const corta = (doc: Doc, s: string, larg: number) => (s ? String(doc.splitTextToSize(s, larg)[0] ?? "") : "");
const altLinha = (pt: number) => pt * 1.15 * 0.3528;

/** Avisos de manuseio em tarjas pretas (quebra em linhas). Devolve a altura ocupada. */
function avisosLinhas(doc: Doc, ids: AvisoId[], larg: number) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  const linhas: { t: string; w: number }[][] = [];
  let atual: { t: string; w: number }[] = [], usado = 0;
  for (const id of ids) {
    const t = AVISOS.find((a) => a.id === id)?.texto;
    if (!t) continue;
    const w = doc.getTextWidth(t) + 3;
    if (atual.length && usado + w > larg) { linhas.push(atual); atual = []; usado = 0; }
    atual.push({ t, w }); usado += w + 1.5;
  }
  if (atual.length) linhas.push(atual);
  return { linhas, altura: linhas.length ? linhas.length * 5 + (linhas.length - 1) * 1.2 : 0 };
}
function desenharAvisos(doc: Doc, l: ReturnType<typeof avisosLinhas>, x: number, y: number) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  l.linhas.forEach((linha, k) => {
    let xx = x;
    const yy = y + k * 6.2;
    for (const a of linha) {
      doc.setFillColor(0, 0, 0); doc.roundedRect(xx, yy, a.w, 5, 0.8, 0.8, "F");
      doc.setTextColor(255, 255, 255); doc.text(a.t, xx + 1.5, yy + 3.55);
      xx += a.w + 1.5;
    }
  });
  doc.setTextColor(0, 0, 0);
}

const docTipo = (d: string) => `${d.length === 14 ? "CNPJ" : "CPF"} ${docFormat(d)}`;

async function etiquetaTransporte(doc: Doc, d: EtiquetaDados, i: number, x0: number, y0: number, W: number, H: number,
  m: ModeloEtiqueta, logo: string | null, barras: Barras) {
  const X = (mm: number) => x0 + mm, Y = (mm: number) => y0 + mm;
  const total = d.volumes.length;
  doc.setTextColor(0, 0, 0); doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);

  // Remetente
  const r = d.remetente;
  let xr = 4;
  if (logo) { doc.addImage(logo, "JPEG", X(3.5), Y(3.5), 13, 13); xr = 19.5; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.text("REMETENTE", X(xr), Y(5.2));
  doc.setFontSize(8); doc.text(corta(doc, r.nome, W - xr - 4), X(xr), Y(9));
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  [
    [r.endereco, r.bairro].filter(Boolean).join(" - "),
    [r.municipio && `${r.municipio}/${r.uf}`, r.cep && `CEP ${cepFmt(r.cep)}`].filter(Boolean).join("   "),
    [m.mostrar_cnpj && r.documento && docTipo(r.documento), m.mostrar_telefone && r.telefone && `Tel. ${r.telefone}`].filter(Boolean).join("  ·  "),
  ].filter(Boolean).forEach((l, k) => doc.text(corta(doc, l, W - xr - 4), X(xr), Y(12.6 + k * 3.4)));
  doc.line(X(3), Y(22), X(W - 3), Y(22));

  // Destinatário
  const c = d.destinatario;
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.text("DESTINATÁRIO", X(4), Y(26.5));
  const fNome = m.destinatario_grande ? 15 : 13;
  doc.setFontSize(fNome);
  const nomeL = doc.splitTextToSize(c.nome || "—", W - 8).slice(0, 2);
  let y = 32.5;
  doc.text(nomeL, X(4), Y(y)); y += nomeL.length * altLinha(fNome);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (c.ac) { doc.text(corta(doc, `A/C ${c.ac}`, W - 8), X(4), Y(y)); y += altLinha(9) + 0.3; }
  doc.setFontSize(10);
  const end = [`${c.logradouro}${c.logradouro ? (c.numero ? `, ${c.numero}` : ", s/n") : ""}`, c.complemento].filter(Boolean).join(" - ");
  if (end) { const l = doc.splitTextToSize(end, W - 8).slice(0, 2); doc.text(l, X(4), Y(y)); y += l.length * altLinha(10); }
  const bairro = [c.bairro, c.referencia && `Ref.: ${c.referencia}`].filter(Boolean).join(" · ");
  if (bairro) doc.text(corta(doc, bairro, W - 8), X(4), Y(y));
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(corta(doc, [c.municipio, c.uf].filter(Boolean).join("/"), W - 8), X(4), Y(64));
  doc.text(`CEP ${cepFmt(c.cep)}`, X(4), Y(70.5));
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (m.mostrar_telefone && c.telefone) doc.text(`Tel. ${c.telefone}`, X(W - 4), Y(70.5), { align: "right" });
  doc.line(X(3), Y(74), X(W - 3), Y(74));

  // Pedido, nota e volume
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
  doc.text("PEDIDO", X(4), Y(78.5)); doc.text("NF-E", X(36), Y(78.5)); doc.text("VOLUME", X(70), Y(78.5));
  doc.setFontSize(16);
  doc.text(d.pedido ? `#${d.pedido}` : "—", X(4), Y(86));
  doc.text(d.nota.numero ? `${d.nota.numero}${d.nota.serie ? `/${d.nota.serie}` : ""}` : "—", X(36), Y(86));
  doc.text(`${i + 1}/${total}`, X(70), Y(86));

  // Transporte, rastreio, peso e medidas do volume, observação
  let yi = 91.5;
  const info = (t: string, negrito = false) => {
    if (!t) return;
    doc.setFont("helvetica", negrito ? "bold" : "normal"); doc.setFontSize(8.5);
    doc.text(corta(doc, t, W - 8), X(4), Y(yi)); yi += 4.1;
  };
  info([d.transportadora && `Transp.: ${d.transportadora}`, d.cte && `CT-e ${d.cte}`].filter(Boolean).join("   "));
  if (d.rastreio) info(`Rastreio: ${d.rastreio}`, true);
  const pv = pesoDoVolume(d, i), med = medidasTxt(d.volumes[i] ?? volumeVazio());
  info([
    m.mostrar_peso && pv && `Peso: ${pesoTxt(pv)}`, m.mostrar_medidas && med && `Medidas: ${med}`,
    m.mostrar_peso && total > 1 && d.peso_total_kg && `Total: ${pesoTxt(d.peso_total_kg)}`,
  ].filter(Boolean).join("   "));
  if (d.observacao) info(d.observacao);

  const av = avisosLinhas(doc, d.avisos, W - 8);
  const yAv = yi - 1.6;
  if (av.altura) desenharAvisos(doc, av, X(4), Y(yAv));
  const topo = (av.altura ? yAv + av.altura : yi - 3) + 2;

  // Rodapé e código de barras
  let base = H - 2;
  if (m.rodape) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(60, 60, 60);
    doc.text(corta(doc, m.rodape, W - 6), X(W / 2), Y(H - 1.8), { align: "center" });
    doc.setTextColor(0, 0, 0);
    base = H - 4.6;
  }
  const cod = codigoTransporte(d, m);
  const b = cod ? await barraDe(barras, cod.valor) : null;
  if (cod && b) {
    const yTxt = base - 3.2;
    const fundo = yTxt - 3.3;
    const alt = Math.min(22, fundo - topo);
    if (alt >= 7) {
      desenharBarra(doc, b, X(W / 2), Y(fundo - alt), W - 10, alt);
      doc.setFont("helvetica", "normal"); doc.setFontSize(cod.valor.length > 30 ? 7 : 9);
      doc.text(cod.valor.length === 44 ? cod.valor.replace(/(\d{4})/g, "$1 ").trim() : cod.valor, X(W / 2), Y(yTxt), { align: "center" });
      doc.setFontSize(6); doc.setTextColor(100, 100, 100);
      doc.text(cod.rotulo, X(W / 2), Y(base), { align: "center" });
      doc.setTextColor(0, 0, 0);
    }
  }
}

async function etiquetaVolume(doc: Doc, d: EtiquetaDados, i: number, x0: number, y0: number, W: number, H: number,
  m: ModeloEtiqueta, barras: Barras) {
  const X = (mm: number) => x0 + mm, Y = (mm: number) => y0 + mm;
  const g = H >= 140;
  const total = d.volumes.length, vol = d.volumes[i] ?? volumeVazio();
  doc.setTextColor(0, 0, 0); doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);

  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("VOLUME", X(W / 2), Y(6), { align: "center" });
  const yNum = g ? 30 : 22.5;
  doc.setFontSize(g ? 64 : 46); doc.text(`${i + 1}/${total}`, X(W / 2), Y(yNum), { align: "center" });
  let y = yNum + 4;
  doc.line(X(3), Y(y), X(W - 3), Y(y));

  // Pedido, NF-e e peso
  const pv = pesoDoVolume(d, i);
  const cols: [string, string][] = [["PEDIDO", d.pedido ? `#${d.pedido}` : "—"], ["NF-E", d.nota.numero ? `${d.nota.numero}${d.nota.serie ? `/${d.nota.serie}` : ""}` : "—"]];
  if (m.mostrar_peso) cols.push(["PESO", pv ? pesoTxt(pv) : "—"]);
  const cw = (W - 8) / cols.length;
  doc.setFontSize(6.5); cols.forEach(([rot], k) => doc.text(rot, X(4 + k * cw), Y(y + 4)));
  doc.setFontSize(g ? 14 : 12); cols.forEach(([, t], k) => doc.text(corta(doc, t, cw - 2), X(4 + k * cw), Y(y + (g ? 10.5 : 9.5))));
  y += g ? 14 : 12.5;
  doc.line(X(3), Y(y), X(W - 3), Y(y));

  // Destino
  const c = d.destinatario;
  doc.setFontSize(6.5); doc.text("DESTINO", X(4), Y(y + 4));
  doc.setFontSize(g ? 12 : 10.5); doc.text(corta(doc, c.nome || "—", W - 8), X(4), Y(y + (g ? 9.5 : 8.5)));
  doc.setFont("helvetica", "normal"); doc.setFontSize(g ? 10.5 : 9.5);
  doc.text(corta(doc, [[c.municipio, c.uf].filter(Boolean).join("/"), c.cep && `CEP ${cepFmt(c.cep)}`].filter(Boolean).join("   "), W - 8), X(4), Y(y + (g ? 14.5 : 12.8)));
  y += g ? 18 : 15.5;
  doc.line(X(3), Y(y), X(W - 3), Y(y));

  // Embaixo: código do volume (para conferir na saída) e avisos
  const cod = codigoVolume(d, i + 1, total);
  const bh = g ? 16 : 10;
  const yTxt = H - 2.5, yBar = yTxt - 3 - bh;
  const b = await barraDe(barras, cod);
  if (b) desenharBarra(doc, b, X(W / 2), Y(yBar), W - 16, bh);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(cod, X(W / 2), Y(yTxt), { align: "center" });
  const av = avisosLinhas(doc, d.avisos, W - 8);
  const yAv = yBar - 2 - av.altura;
  if (av.altura) desenharAvisos(doc, av, X(4), Y(yAv));
  const limite = (av.altura ? yAv : yBar) - 1.5;

  // Meio: conteúdo e medidas
  const med = m.mostrar_medidas ? medidasTxt(vol) : "";
  const fC = g ? 10.5 : 9.5, lh = altLinha(fC);
  if (m.mostrar_conteudo && vol.descricao) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.text("CONTEÚDO", X(4), Y(y + 4));
    doc.setFont("helvetica", "normal"); doc.setFontSize(fC);
    const y1 = y + 8.3;
    const cabem = Math.max(1, Math.floor((limite - y1 - (med ? lh : 0)) / lh) + 1);
    const linhas = doc.splitTextToSize(vol.descricao, W - 8).slice(0, cabem);
    doc.text(linhas, X(4), Y(y1));
    y = y1 + linhas.length * lh;
  } else y += 5;
  if (med) { doc.setFont("helvetica", "bold"); doc.setFontSize(fC); doc.text(corta(doc, `Medidas: ${med}`, W - 8), X(4), Y(Math.min(y, limite))); }
}

type FormatoFolha = { pagina: "a4" | [number, number]; w: number; h: number; slots: [number, number][] };
const FOLHAS: Record<string, FormatoFolha> = {
  "10x15": { pagina: [100, 150], w: 100, h: 150, slots: [[0, 0]] },
  "10x10": { pagina: [100, 100], w: 100, h: 100, slots: [[0, 0]] },
  "a4-transporte": { pagina: "a4", w: 100, h: 143, slots: [[5, 5], [105, 5], [5, 150], [105, 150]] },
  "a4-volume": { pagina: "a4", w: 100, h: 95, slots: [[5, 5], [105, 5], [5, 100], [105, 100], [5, 195], [105, 195]] },
};

/**
 * PDF das etiquetas. Cada volume ganha a sua etiqueta de transporte e/ou de volume (conforme o modelo).
 * Na mesma bobina (10x15 nas duas), as duas de cada caixa saem em seguida; em formatos diferentes, cada tipo sai junto.
 * `soVolume` limita a um volume (pré-visualização do editor).
 */
export async function pdfEtiquetas(lista: EtiquetaDados[], m: ModeloEtiqueta, soVolume?: number) {
  const [{ jsPDF }, logo] = await Promise.all([import("jspdf"), m.mostrar_logo ? logoDataUrl() : Promise.resolve(null)]);
  const quer = (t: "transporte" | "volume") => m.imprimir === "ambas" || m.imprimir === t;
  const fT = m.formato_transporte === "a4" ? "a4-transporte" : "10x15";
  const fV = m.formato_volume === "a4" ? "a4-volume" : m.formato_volume;
  const juntas = quer("transporte") && quer("volume") && fT === fV;
  const paginas: { tipo: "transporte" | "volume"; d: EtiquetaDados; i: number }[] = [];
  const idx = (d: EtiquetaDados) => (soVolume != null ? [Math.min(soVolume, d.volumes.length - 1)] : d.volumes.map((_, i) => i)).filter((i) => i >= 0);
  for (const d of lista) for (const i of idx(d)) {
    if (quer("transporte")) paginas.push({ tipo: "transporte", d, i });
    if (juntas) paginas.push({ tipo: "volume", d, i });
  }
  if (quer("volume") && !juntas) for (const d of lista) for (const i of idx(d)) paginas.push({ tipo: "volume", d, i });

  const barras: Barras = new Map();
  let doc: Doc | null = null, atual = "", slot = 0;
  for (const p of paginas) {
    const chave = p.tipo === "transporte" ? fT : fV;
    const F = FOLHAS[chave];
    if (!doc) doc = new jsPDF({ unit: "mm", format: F.pagina }) as unknown as Doc;
    else if (chave !== atual || slot >= F.slots.length) { doc.addPage(F.pagina); slot = 0; }
    atual = chave;
    const [x0, y0] = F.slots[slot++];
    if (F.slots.length > 1) { doc.setDrawColor(170, 170, 170); doc.setLineWidth(0.15); doc.rect(x0, y0, F.w, F.h); }
    if (p.tipo === "transporte") await etiquetaTransporte(doc, p.d, p.i, x0, y0, F.w, F.h, m, logo, barras);
    else await etiquetaVolume(doc, p.d, p.i, x0, y0, F.w, F.h, m, barras);
  }
  doc ??= new jsPDF({ unit: "mm", format: [100, 150] }) as unknown as Doc;
  return { blob: doc.output("blob") as Blob, paginas: paginas.length };
}

// ---------------------------------------------------------------------
// Recibo (A4 com duas vias: a de quem paga e a de quem recebe, com linha de corte)
// ---------------------------------------------------------------------
export type ReciboPdf = {
  numero: number; tipo: "recebimento" | "pagamento";
  pagador_nome: string; pagador_doc: string | null; recebedor_nome: string; recebedor_doc: string | null;
  valor: number; referente: string; forma_pagamento: string | null; data_pagamento: string; cidade: string | null;
  observacoes: string | null; cancelado_em?: string | null; cancelado_motivo?: string | null;
  emitente: { nome: string; razao_social?: string | null; cnpj?: string | null; endereco?: string | null; contato?: string | null };
};

export async function pdfRecibo(r: ReciboPdf, vias: 1 | 2 = 2) {
  const [{ doc, logo }, { valorPorExtenso, dataPorExtenso }] = await Promise.all([novoDoc(), import("./extenso")]);
  const w = doc.internal.pageSize.getWidth();
  const metade = doc.internal.pageSize.getHeight() / 2;
  const numero = `Nº ${String(r.numero).padStart(6, "0")}`;
  const plural = (d: string | null) => String(d ?? "").replace(/\D/g, "").length === 14;   // empresa assina no plural
  const nos = plural(r.recebedor_doc) || (r.tipo === "recebimento" && !r.recebedor_doc);
  const docTxt = (d: string | null) => (d ? `${String(d).replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF"} ${docFormat(d)}` : "");

  const via = (y0: number, rotuloVia: string) => {
    // faixa do emitente
    doc.setFillColor(...NAVY);
    doc.rect(0, y0, w, 24, "F");
    if (logo) doc.addImage(logo, "JPEG", 12, y0 + 4, 16, 16);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(r.emitente.nome, 32, y0 + 9.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    const larg = w - 32 - 50;   // não encosta no "RECIBO Nº"
    const linhaCab = (t: string | null | undefined, yy: number) => { if (t) doc.text(doc.splitTextToSize(t, larg)[0], 32, yy); };
    linhaCab([r.emitente.razao_social, r.emitente.cnpj && `CNPJ ${docFormat(r.emitente.cnpj)}`].filter(Boolean).join("  ·  "), y0 + 14);
    linhaCab(r.emitente.endereco, y0 + 17.8);
    linhaCab(r.emitente.contato, y0 + 21.6);
    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text("RECIBO", w - 12, y0 + 12, { align: "right" });
    doc.setFontSize(10);
    doc.setTextColor(...AZUL);
    doc.text(numero, w - 12, y0 + 19, { align: "right" });

    // tipo, via e o valor em destaque
    let y = y0 + 31;
    doc.setTextColor(...CINZA);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text((r.tipo === "recebimento" ? "RECIBO DE RECEBIMENTO" : "RECIBO DE PAGAMENTO") + `   ·   ${rotuloVia.toUpperCase()}`, 12, y + 3);
    doc.setFillColor(...AZUL);
    doc.roundedRect(w - 72, y - 3, 60, 15, 2.5, 2.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7); doc.text("VALOR", w - 68, y + 1.5);
    doc.setFontSize(15); doc.text(brl(r.valor), w - 15, y + 8.5, { align: "right" });

    // quadro: de quem, quanto (por extenso) e referente a quê
    y += 16;
    const extenso = valorPorExtenso(r.valor);
    const textos: [string, string, number][] = [
      [nos ? "RECEBEMOS DE" : "RECEBI DE", [r.pagador_nome, docTxt(r.pagador_doc)].filter(Boolean).join("   ·   "), 10.5],
      ["A IMPORTÂNCIA DE", `${brl(r.valor)} (${extenso})`, 10],
      ["REFERENTE A", r.referente, 10],
    ];
    // altura do quadro pelo que vai dentro (cada texto até 2 linhas)
    const linhasDe = (t: string, tam: number) => { doc.setFontSize(tam); doc.setFont("helvetica", "bold"); return Math.min(2, doc.splitTextToSize(t, w - 34).length); };
    const altura = 6 + textos.reduce((s2, [, t, tam]) => s2 + 5 + linhasDe(t, tam) * tam * 0.42 + 2.5, 0);
    doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252);
    doc.roundedRect(12, y, w - 24, altura, 2.5, 2.5, "FD");
    const campo = (rotulo: string, texto: string, yy: number, tam = 10.5) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...CINZA);
      doc.text(rotulo, 17, yy);
      doc.setFont("helvetica", "bold"); doc.setFontSize(tam); doc.setTextColor(15, 23, 42);
      const linhas = doc.splitTextToSize(texto, w - 34).slice(0, 2);
      doc.text(linhas, 17, yy + 5);
      return yy + 5 + linhas.length * (tam * 0.42);
    };
    let yy = y + 6;
    for (const [k, [rot, txt, tam]] of textos.entries()) yy = campo(rot, txt, k ? yy + 2.5 : yy, tam);

    // detalhes do pagamento
    y += altura + 6;
    doc.setFontSize(8.5); doc.setFont("helvetica", "normal"); doc.setTextColor(51, 65, 85);
    const det = [r.forma_pagamento && `Forma de pagamento: ${r.forma_pagamento}`, `Data do pagamento: ${dataBR(r.data_pagamento)}`].filter(Boolean).join("      ");
    doc.text(det, 12, y);
    if (r.observacoes) { doc.text(doc.splitTextToSize(`Obs.: ${r.observacoes}`, w - 24).slice(0, 1), 12, y + 4.5); }
    y += r.observacoes ? 10 : 6;
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(`Para maior clareza, ${nos ? "firmamos" : "firmo"} o presente recibo, dando plena, geral e irrevogável quitação do valor acima.`, w - 24), 12, y);

    // local, data e assinatura
    y += 10;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(15, 23, 42);
    doc.text(`${r.cidade ? `${r.cidade}, ` : ""}${dataPorExtenso(r.data_pagamento)}.`, w - 12, y, { align: "right" });
    y = Math.max(y + 16, y0 + metade - 26);
    doc.setDrawColor(100, 116, 139); doc.setLineWidth(0.3);
    doc.line(w / 2 - 45, y, w / 2 + 45, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(r.recebedor_nome, w / 2, y + 4.5, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...CINZA);
    if (r.recebedor_doc) doc.text(docTxt(r.recebedor_doc), w / 2, y + 8.5, { align: "center" });

    // rodapé da via
    doc.setFontSize(6.5);
    doc.text(`Recibo ${numero} · emitido pelo ERP Line em ${new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · ${rotuloVia}`, 12, y0 + metade - 5);

    if (r.cancelado_em) {
      doc.saveGraphicsState?.();
      doc.setTextColor(220, 38, 38); doc.setFont("helvetica", "bold"); doc.setFontSize(46);
      doc.text("CANCELADO", w / 2, y0 + metade / 2 + 12, { align: "center", angle: 18 });
      doc.setFontSize(9);
      if (r.cancelado_motivo) doc.text(`Motivo: ${r.cancelado_motivo}`, w / 2, y0 + metade / 2 + 26, { align: "center" });
      doc.restoreGraphicsState?.();
    }
    doc.setTextColor(30, 41, 59); doc.setLineWidth(0.2);
  };

  via(0, vias === 2 ? "1ª via · quem pagou" : "via única");
  if (vias === 2) {
    // linha de corte
    doc.setDrawColor(148, 163, 184);
    (doc as any).setLineDashPattern?.([2, 1.5], 0);
    doc.line(8, metade, w - 8, metade);
    (doc as any).setLineDashPattern?.([], 0);
    doc.setFontSize(6.5); doc.setTextColor(...CINZA);
    doc.text("recorte aqui", w / 2, metade - 1.2, { align: "center" });
    via(metade, "2ª via · quem recebeu");
  }
  return doc.output("blob");
}

// ---------------------------------------------------------------------
// Ficha cadastral assinada (comprovante da assinatura eletrônica)
// ---------------------------------------------------------------------
export type FichaAssinadaPdf = {
  canal: "link" | "presencial"; termo: string; dados: Record<string, any> | null; nome: string | null; cpf: string | null;
  assinatura_png: string | null; ip: string | null; user_agent: string | null; assinado_em: string | null; hash: string | null;
  alteracoes: Record<string, { antes: string | null; depois: string | null }> | null;
};

/** CPF de quem assinou com o meio à mostra: ***.456.789-** */
export const cpfMascarado = (cpf: string | null | undefined) => {
  const d = String(cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "";
};

/** Navegador e sistema em poucas palavras ("Chrome no Android"). */
export function navegadorCurto(ua: string | null | undefined) {
  const s = String(ua ?? "");
  if (!s) return "";
  const nav = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "";
  const so = /Android/.test(s) ? "Android" : /iPhone|iPad/.test(s) ? "iPhone/iPad" : /Windows/.test(s) ? "Windows" : /Mac OS X/.test(s) ? "Mac" : /Linux/.test(s) ? "Linux" : "";
  return [nav, so].filter(Boolean).join(" no ") || s.slice(0, 60);
}

export async function pdfFichaCadastral(a: FichaAssinadaPdf, cfg: Config, rotulos: Record<string, string>) {
  const { doc, autoTable, logo } = await novoDoc();
  const w = doc.internal.pageSize.getWidth();
  const d = a.dados ?? {};
  cabecalho(doc, cfg, "FICHA CADASTRAL", d.codigo ? `Cliente nº ${d.codigo}` : "Cliente", logo);
  const tel = (v: string | null | undefined) => (v ? formatarTelefone(v) : "");
  const endereco = (p = "") => [[d[`${p}logradouro`], d[`${p}numero`]].filter(Boolean).join(", "), d[`${p}complemento`], d[`${p}bairro`],
    d[`${p}municipio`] && `${d[`${p}municipio`]}/${d[`${p}uf`] ?? ""}`, d[`${p}cep`] && `CEP ${cepFmt(d[`${p}cep`])}`].filter(Boolean).join(" - ");
  const pj = d.tipo_pessoa === "PJ";
  const linhas: [string, string][] = [
    [pj ? "Razão social" : "Nome", d.nome ?? ""],
    ["Nome fantasia", d.nome_fantasia ?? ""],
    [pj ? "CNPJ" : "CPF", d.cpf_cnpj ? docFormat(d.cpf_cnpj) : ""],
    ["Inscrição estadual", d.inscricao_estadual ?? ""],
    ["Inscrição municipal", d.inscricao_municipal ?? ""],
    [pj ? "Data de abertura" : "Data de nascimento", d.data_nascimento ? dataBR(d.data_nascimento) : ""],
    ["WhatsApp", tel(d.whatsapp)],
    ["Telefone", [tel(d.telefone), tel(d.telefone_adicional)].filter(Boolean).join("  ·  ")],
    ["E-mail", d.email ?? ""],
    ["E-mail para nota fiscal", d.email_nfe ?? ""],
    ["Site", d.website ?? ""],
    ["Endereço", endereco()],
    ["Endereço de cobrança", d.cobranca_diferente ? endereco("cobranca_") : ""],
  ];
  autoTable(doc, {
    startY: 36,
    head: [["Dados do cliente", ""]],
    body: linhas.filter(([, v]) => v),
    styles: { fontSize: 9, cellPadding: 1.6, textColor: [30, 41, 59] },
    headStyles: { fillColor: NAVY, textColor: 255 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 46, textColor: [71, 85, 105] } },
    theme: "striped",
    margin: { left: 14, right: 14 },
  });
  let y = (doc as any).lastAutoTable.finalY + 5;
  const pessoas: any[] = Array.isArray(d.pessoas) ? d.pessoas : [];
  if (pessoas.length) {
    autoTable(doc, {
      startY: y,
      head: [["Pessoas de contato", "Setor", "E-mail", "Telefone"]],
      body: pessoas.map((p) => [p.nome, p.setor ?? "", p.email ?? "", [tel(p.telefone), p.ramal && `ramal ${p.ramal}`].filter(Boolean).join(" ")]),
      styles: { fontSize: 8.5, cellPadding: 1.5 },
      headStyles: { fillColor: NAVY, textColor: 255 },
      margin: { left: 14, right: 14 },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }
  y = paragrafo(doc, "Declaração", a.termo, y + 1);

  // assinatura
  if (y > 222) { doc.addPage(); y = 20; }
  if (a.assinatura_png) {
    try { doc.addImage(a.assinatura_png, "PNG", 14, y, 70, 26); } catch { /* desenho inválido: segue sem imagem */ }
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(14, y + 27, 94, y + 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(a.nome ?? "", 14, y + 31.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...CINZA);
  doc.text([cpfMascarado(a.cpf) && `CPF ${cpfMascarado(a.cpf)}`, "Assinatura eletrônica"].filter(Boolean).join("  ·  "), 14, y + 35.5);

  // registro da assinatura (prova)
  const x = 104, larg = w - 14 - x;
  const quando = a.assinado_em ? new Date(a.assinado_em) : null;
  const registro: [string, string][] = [
    ["Assinado em", quando ? `${quando.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} às ${quando.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)` : ""],
    ["Forma", a.canal === "presencial" ? "Presencial, no aparelho da empresa" : "Pelo link enviado ao cliente"],
    ["Endereço IP", a.ip ?? "não registrado"],
    ["Navegador", navegadorCurto(a.user_agent)],
  ].filter(([, v]) => v) as [string, string][];
  const hashLinhas = (a.hash ?? "").match(/.{1,32}/g) ?? [];
  const altura = 8 + registro.length * 4.2 + 5 + hashLinhas.length * 3.8 + 2;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(x, y - 2, larg, altura, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("REGISTRO DA ASSINATURA ELETRÔNICA", x + 3, y + 3);
  let yy = y + 7.5;
  doc.setFontSize(7.5);
  for (const [k, v] of registro) {
    doc.setFont("helvetica", "bold"); doc.setTextColor(71, 85, 105); doc.text(k, x + 3, yy);
    doc.setFont("helvetica", "normal"); doc.setTextColor(30, 41, 59); doc.text(corta(doc, v, larg - 30), x + 27, yy);
    yy += 4.2;
  }
  doc.setFont("helvetica", "bold"); doc.setTextColor(71, 85, 105); doc.text("Código de verificação (SHA-256)", x + 3, yy + 0.5);
  doc.setFont("courier", "normal"); doc.setFontSize(7.5); doc.setTextColor(30, 41, 59);
  hashLinhas.forEach((l, i) => doc.text(l.replace(/(.{4})/g, "$1 ").trim(), x + 3, yy + 4.3 + i * 3.8));
  doc.setFont("helvetica", "normal");
  y = Math.max(y + 40, y - 2 + altura + 6);

  const alt = Object.entries(a.alteracoes ?? {});
  if (alt.length) {
    y = paragrafo(doc, "Dados atualizados pelo cliente ao assinar",
      alt.map(([k, v]) => `${rotulos[k] ?? k}: ${v.antes || "(vazio)"} -> ${v.depois || "(vazio)"}`).join("\n"), y);
  }
  paragrafo(doc, "", "Este documento foi assinado eletronicamente. O código de verificação é calculado sobre o termo, os dados da ficha, o nome, o CPF, o desenho da assinatura, o IP, o navegador e a data/hora: qualquer alteração posterior gera um código diferente.", y);
  rodape(doc);
  return doc.output("blob");
}
