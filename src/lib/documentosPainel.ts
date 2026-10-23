// Contas da tela Documentos: os documentos da empresa por tipo, as contas pagas que ainda não têm o comprovante
// anexado e as contas vencidas ainda em aberto (prazo passado: confirmar se foi paga).

export type TipoDocEmpresa = "contrato" | "certificado" | "extrato" | "outro";
export const TIPOS_DOC_EMPRESA: { id: TipoDocEmpresa; rotulo: string; dica: string }[] = [
  { id: "contrato", rotulo: "Contratos e alterações", dica: "Contrato social, alterações contratuais, alvarás e certidões" },
  { id: "certificado", rotulo: "Certificados digitais", dica: "Arquivos .pfx e .p12 (A1) para emitir notas" },
  { id: "extrato", rotulo: "Extratos dos bancos", dica: "Arquivos .ofx, .ofc e .csv importados" },
  { id: "outro", rotulo: "Outros documentos", dica: "O resto: fotos, planilhas, PDFs" },
];

const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Tipo pelo nome do arquivo (extensão primeiro; depois as palavras do nome). */
export function tipoDocEmpresa(nome: string): TipoDocEmpresa {
  const n = sem(nome);
  if (/\.(pfx|p12)$/.test(n)) return "certificado";
  if (/\.(ofx|ofc)$/.test(n) || /\bextrato\b/.test(n)) return "extrato";
  if (/contrat|alteracao|social|alvara|certidao|cnpj|estatuto|procuracao|abertura/.test(n)) return "contrato";
  return "outro";
}

export type ContaDoc = { id: string; descricao: string | null; valor: number | string; vencimento: string; status: string; data_pagamento: string | null };

/** Conta de imposto ou guia (DAS, DARF, DARE/ICMS, GNRE, INSS/FGTS, ISS, parcelamentos): a tela Documentos só mostra essas;
 *  as de fornecedores ficam em Financeiro → Contas a pagar. Vale a categoria ou, sem ela, a descrição. */
export function ehContaDeImposto(c: { categoria?: string | null; descricao?: string | null }): boolean {
  if (/imposto|tribut|parcelamento|inss|fgts/.test(sem(c.categoria ?? ""))) return true;
  return /\b(darf|dare|gnre|icms|inss|fgts|iss|issqn|irpj|csll|pis|cofins|dctf|das( do)? simples|simples nacional|parcelamento|pgfn|receita federal|sefaz|esocial)\b/.test(sem(c.descricao ?? ""));
}

const menosDias = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

/** Pagas nos últimos `dias` dias sem nenhum arquivo anexado na conta (a mais recente primeiro). */
export function pagasSemComprovante<T extends ContaDoc>(contas: T[], comAnexo: Set<string>, hoje: string, dias = 60): T[] {
  const desde = menosDias(hoje, dias);
  return contas.filter((c) => c.status === "pago" && (c.data_pagamento ?? c.vencimento) >= desde && !comAnexo.has(c.id))
    .sort((a, b) => (b.data_pagamento ?? b.vencimento).localeCompare(a.data_pagamento ?? a.vencimento));
}

/** Vencidas e ainda em aberto: confirmar se foram pagas (a mais antiga primeiro). */
export function prazosParaConfirmar<T extends ContaDoc>(contas: T[], hoje: string): T[] {
  return contas.filter((c) => c.status === "aberto" && c.vencimento < hoje).sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}
