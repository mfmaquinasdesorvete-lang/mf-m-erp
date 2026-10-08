// Geração de PDFs (orçamento/pedido e ordem de serviço) no próprio navegador.
// jsPDF é carregado só quando um PDF é gerado, para não pesar na abertura do sistema.
import type { Cliente, Config, Item, ItemChecklist } from "./types";
import { brl, dataBR, docFormat } from "./format";
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

async function novoDoc() {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import("jspdf"), import("jspdf-autotable"), logoDataUrl()]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  return { doc, autoTable, logo };
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
  const linha1 = [cfg.razao_social, cfg.cnpj && `CNPJ ${cfg.cnpj}`].filter(Boolean).join("  ·  ");
  const linha2 = [cfg.endereco, cfg.municipio && `${cfg.municipio}/${cfg.uf ?? ""}`].filter(Boolean).join(" - ");
  const linha3 = [cfg.whatsapp && `WhatsApp ${cfg.whatsapp}`, cfg.telefone, cfg.email].filter(Boolean).join("  ·  ");
  doc.text(linha1, 34, 19);
  if (linha2) doc.text(linha2, 34, 23);
  if (linha3) doc.text(linha3, 34, 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
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

function paragrafo(doc: Doc, titulo: string, texto: string, y: number) {
  const w = doc.internal.pageSize.getWidth();
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(titulo, 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const linhas = doc.splitTextToSize(texto, w - 28);
  doc.text(linhas, 14, y + 5);
  return y + 7 + linhas.length * 4;
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
    const linhas = doc.splitTextToSize(cfg.proposta_apresentacao, doc.internal.pageSize.getWidth() - 28);
    doc.text(linhas, 14, y);
    y += linhas.length * 4 + 4;
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
    styles: { fontSize: 9, cellPadding: 2.2, textColor: [30, 41, 59] },
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
      styles: { fontSize: 8.5, cellPadding: 2 },
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

  if (y > 240) { doc.addPage(); y = 20; }
  y += 6;
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
  const y = (doc as any).lastAutoTable.finalY + 7;
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30, 41, 59);
  doc.text("TOTAL", w - 75, y);
  doc.text(brl(r.linhas.filter((l) => l.status !== "cancelada").reduce((s, l) => s + l.valor, 0)), w - 14, y, { align: "right" });
  rodape(doc);
  return doc.output("blob");
}

// ---------------------------------------------------------------------
// Etiquetas de envio e volume (uma por volume): 10 x 15 cm (térmica) ou A4 com 4 por folha
// ---------------------------------------------------------------------
export type EnvioEtiqueta = {
  numero: number; cliente: Cliente; volumes: number; peso?: number | null;
  nota?: { numero: string | null; serie: string | null; chave: string | null } | null;
  transportadora?: string | null; rastreio?: string | null;
  remetente?: { nome: string; logradouro?: string | null; numero?: string | null; bairro?: string | null; municipio?: string | null; uf?: string | null; cep?: string | null; cnpj?: string | null; telefone?: string | null } | null;
};

/** Código de barras CODE128 como imagem (gerado no navegador). */
async function codigoBarras(texto: string) {
  const { default: JsBarcode } = await import("jsbarcode");
  const c = document.createElement("canvas");
  JsBarcode(c, texto, { format: "CODE128", displayValue: false, margin: 0, height: 80, width: 2, background: "#ffffff", lineColor: "#000000" });
  return { png: c.toDataURL("image/png"), proporcao: c.width / c.height };
}

const cepFmt = (c?: string | null) => (c ?? "").replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2");

export async function pdfEtiquetasEnvio(envios: EnvioEtiqueta[], cfg: Config, formato: "10x15" | "a4" = "10x15") {
  const { jsPDF } = await import("jspdf");
  const a4 = formato === "a4";
  const doc = new jsPDF({ unit: "mm", format: a4 ? "a4" : [100, 150] });
  const W = 100, H = a4 ? 143 : 150;
  const posA4 = [[5, 5], [105, 5], [5, 150], [105, 150]];
  const barras = new Map<string, Awaited<ReturnType<typeof codigoBarras>>>();
  let n = 0;

  for (const e of envios) {
    const cod = e.nota?.chave && /^\d{44}$/.test(e.nota.chave) ? e.nota.chave : `PED${e.numero}`;
    if (!barras.has(cod)) barras.set(cod, await codigoBarras(cod));
    const vol = Math.max(1, Number(e.volumes) || 1);
    for (let v = 1; v <= vol; v++, n++) {
      if (n > 0 && (!a4 || n % 4 === 0)) doc.addPage(a4 ? "a4" : [100, 150]);
      const [x0, y0] = a4 ? posA4[n % 4] : [0, 0];
      const X = (mm: number) => x0 + mm, Y = (mm: number) => y0 + mm;
      doc.setDrawColor(0); doc.setLineWidth(0.3);
      if (a4) doc.rect(x0, y0, W, H);
      doc.setTextColor(0, 0, 0);
      // Remetente
      const r = e.remetente;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("REMETENTE", X(4), Y(5));
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text([
        (r?.nome ?? cfg.razao_social).slice(0, 55),
        r ? [`${r.logradouro ?? ""}${r.numero ? `, ${r.numero}` : ""}`, r.bairro].filter(Boolean).join(" - ").slice(0, 60) : (cfg.endereco ?? "").slice(0, 60),
        r ? `${r.municipio ?? ""}/${r.uf ?? ""}  CEP ${cepFmt(r.cep)}` : `${cfg.municipio ?? ""}/${cfg.uf ?? ""}`,
      ], X(4), Y(9));
      doc.line(X(3), Y(21), X(W - 3), Y(21));
      // Destinatário
      const c = e.cliente;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("DESTINATÁRIO", X(4), Y(26));
      doc.setFontSize(13); doc.text(doc.splitTextToSize(c.nome, W - 8).slice(0, 2), X(4), Y(32));
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(doc.splitTextToSize(`${c.logradouro ?? ""}, ${c.numero ?? "s/n"}${c.complemento ? ` - ${c.complemento}` : ""}`, W - 8).slice(0, 2), X(4), Y(44));
      if (c.bairro) doc.text(c.bairro.slice(0, 45), X(4), Y(53));
      doc.setFont("helvetica", "bold"); doc.setFontSize(14);
      doc.text(`${c.municipio ?? ""}/${c.uf ?? ""}`.slice(0, 32), X(4), Y(61));
      doc.text(`CEP ${cepFmt(c.cep)}`, X(4), Y(68));
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      if (c.whatsapp || c.telefone) doc.text(`Tel. ${c.whatsapp || c.telefone}`, X(W - 4), Y(68), { align: "right" });
      doc.line(X(3), Y(72), X(W - 3), Y(72));
      // Pedido, nota e volume
      doc.setFontSize(7); doc.setFont("helvetica", "bold");
      doc.text("PEDIDO", X(4), Y(77)); doc.text("NF-E", X(34), Y(77)); doc.text("VOLUME", X(68), Y(77));
      doc.setFontSize(17);
      doc.text(`#${e.numero}`, X(4), Y(85));
      doc.text(e.nota?.numero ? `${e.nota.numero}${e.nota.serie ? `/${e.nota.serie}` : ""}` : "—", X(34), Y(85));
      doc.text(`${v}/${vol}`, X(68), Y(85));
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      const linha = [e.transportadora && `Transp.: ${e.transportadora}`, e.peso ? `Peso total: ${Number(e.peso).toLocaleString("pt-BR")} kg` : ""].filter(Boolean).join("   ");
      if (linha) doc.text(linha.slice(0, 60), X(4), Y(92));
      if (e.rastreio) { doc.setFont("helvetica", "bold"); doc.text(`Rastreio: ${e.rastreio}`, X(4), Y(97)); doc.setFont("helvetica", "normal"); }
      // Código de barras (chave da NF-e ou nº do pedido)
      const b = barras.get(cod)!;
      const bw = W - 10, bh = Math.min(26, bw / b.proporcao);
      doc.addImage(b.png, "PNG", X(5), Y(H - bh - 13), bw, bh);
      doc.setFontSize(cod.length > 30 ? 7 : 9);
      doc.text(cod.length === 44 ? cod.replace(/(\d{4})/g, "$1 ").trim() : cod, X(W / 2), Y(H - 8), { align: "center" });
      doc.setFontSize(6); doc.setTextColor(100);
      doc.text(cod.length === 44 ? "Chave de acesso da NF-e" : "Pedido", X(W / 2), Y(H - 4.5), { align: "center" });
    }
  }
  return doc.output("blob");
}
