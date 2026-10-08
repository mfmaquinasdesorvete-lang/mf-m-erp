// Exportar dados para Excel (.xlsx). A biblioteca de planilhas só é baixada quando alguém exporta.
export type Aba = { nome: string; linhas: Record<string, unknown>[] };

export async function baixarPlanilha(arquivo: string, abas: Aba[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const a of abas) {
    const ws = XLSX.utils.json_to_sheet(a.linhas.length ? a.linhas : [{ "(vazio)": "" }]);
    // largura das colunas pelo maior conteúdo (limite 60)
    const cols = Object.keys(a.linhas[0] ?? {});
    ws["!cols"] = cols.map((c) => ({ wch: Math.min(60, Math.max(c.length, ...a.linhas.map((l) => String(l[c] ?? "").length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, a.nome.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  }
  const dados = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const url = URL.createObjectURL(new Blob([dados], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${arquivo}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Data ISO (aaaa-mm-dd...) vira data de verdade na planilha; o resto passa como está. */
export function celula(v: unknown): unknown {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) {
    const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
    return Number.isNaN(d.getTime()) ? v : d;
  }
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (v && typeof v === "object") return JSON.stringify(v);
  return v ?? "";
}

/** Backup: todas as tabelas principais numa planilha só (uma aba por tabela). */
export const TABELAS_BACKUP: [string, string][] = [
  ["clientes", "Clientes"], ["contatos_cliente", "Contatos de clientes"], ["fornecedores", "Fornecedores"], ["transportadoras", "Transportadoras"],
  ["produtos", "Produtos"], ["produto_componentes", "Ficha técnica"], ["produto_fornecedor", "Código do fornecedor"],
  ["estoque_unidade", "Estoque por unidade"], ["estoque_movimentos", "Movimentos de estoque"],
  ["pedidos", "Pedidos"], ["pedido_itens", "Itens dos pedidos"], ["ordens_servico", "Ordens de serviço"], ["os_itens", "Itens das OS"],
  ["equipamentos", "Máquinas vendidas"], ["contas_receber", "Contas a receber"], ["contas_pagar", "Contas a pagar"],
  ["notas_fiscais", "NF-e emitidas"], ["nfe_recebidas", "NF-e recebidas"], ["ordens_producao", "Ordens de produção"],
  ["pedidos_compra", "Pedidos de compra"], ["pedido_compra_itens", "Itens de compra"], ["transferencias", "Transferências"],
  ["transferencia_itens", "Itens de transferência"], ["unidades", "Unidades"],
];

export async function exportarTudo(ler: (tabela: string, de: number, ate: number) => Promise<Record<string, unknown>[]>, progresso?: (t: string) => void) {
  const abas: Aba[] = [];
  for (const [tabela, nome] of TABELAS_BACKUP) {
    progresso?.(nome);
    const linhas: Record<string, unknown>[] = [];
    for (let de = 0; ; de += 1000) {
      const lote = await ler(tabela, de, de + 999);
      linhas.push(...lote);
      if (lote.length < 1000) break;
    }
    abas.push({ nome, linhas: linhas.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== "xml").map(([k, v]) => {
      const c = celula(v);
      return [k, typeof c === "string" && c.length > 32000 ? c.slice(0, 32000) : c];
    }))) });
  }
  await baixarPlanilha("backup-erp-line", abas);
}
