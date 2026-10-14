import { dataBR, hoje, somarDias } from "./format";

export type SituacaoGarantia = "em_garantia" | "vence_logo" | "fora_garantia";

/** Em garantia, vencendo nos próximos 30 dias, ou fora da garantia. */
export function situacaoGarantia(garantiaAte: string | null | undefined): SituacaoGarantia {
  if (!garantiaAte || garantiaAte < hoje()) return "fora_garantia";
  return garantiaAte <= somarDias(30) ? "vence_logo" : "em_garantia";
}

export type SituacaoPreventiva = "atrasada" | "proxima" | "em_dia" | "sem_data";

/** Preventiva atrasada, nos próximos 30 dias, ou em dia. */
export function situacaoPreventiva(data: string | null | undefined): SituacaoPreventiva {
  if (!data) return "sem_data";
  if (data < hoje()) return "atrasada";
  return data <= somarDias(30) ? "proxima" : "em_dia";
}

export const diasAte = (data: string) =>
  Math.round((new Date(data + "T12:00:00").getTime() - new Date(hoje() + "T12:00:00").getTime()) / 864e5);

/** "vendida em 10/05/2023" ou, para a base da My Frost (empresa anterior), "vendida pela My Frost em …". */
export function textoVenda(e: { data_venda: string | null; origem?: string | null }) {
  if (e.origem) return `vendida pela ${e.origem}${e.data_venda ? ` em ${dataBR(e.data_venda)}` : " (data não informada)"}`;
  return `vendida em ${dataBR(e.data_venda)}`;
}

/** Aviso da OS de máquina vendida por outra empresa: não é a mesma empresa; a MF responde pelo serviço e pelas peças
 *  que fornecer. O texto vem de Configurações → Orçamentos e garantia ({empresa} = quem vendeu, {mf} = a MF). */
export const AVISO_OUTRA_EMPRESA_PADRAO = "Esta máquina foi vendida pela {empresa}, que é uma empresa diferente da {mf}. A {mf} não responde pelas obrigações da {empresa} (garantia de fábrica, pedidos, cobranças ou contratos dela). A {mf} responde pelo serviço que executar e pelas peças que fornecer nesta ordem de serviço, conforme a garantia do reparo informada e a legislação aplicável.";
/** Condições da garantia do reparo quando a OS não traz outras (máquina de outra empresa: não vale o termo da máquina nova). */
export const CONDICOES_REPARO_PADRAO = "Cobre as peças trocadas e a mão de obra deste conserto. Não cobre as outras peças da máquina, mau uso, quedas, ligação em tensão errada, falta de limpeza ou de manutenção preventiva, nem peças de desgaste natural (vedações, correias, bicos).";

export function avisoOutraEmpresa(empresa: string, cfg?: { aviso_outra_empresa?: string | null; nome_fantasia?: string | null; razao_social?: string } | null) {
  const mf = cfg?.nome_fantasia || cfg?.razao_social || "MF Máquinas";
  return (cfg?.aviso_outra_empresa || AVISO_OUTRA_EMPRESA_PADRAO).replace(/\{empresa\}/g, empresa).replace(/\{mf\}/g, mf);
}

/** O que falta na OS de máquina de outra empresa para concluir (o banco confere a mesma coisa). */
export function faltaParaConcluirOutraEmpresa(o: {
  equipamento?: string | null; numero_serie?: string | null; condicao_entrada?: string | null; diagnostico?: string | null;
  solucao?: string | null; em_garantia?: boolean | null; orcamento_aprovado_em?: string | null; orcamento_aprovado_por?: string | null;
}) {
  const vazio = (v?: string | null) => !String(v ?? "").trim();
  return [
    vazio(o.equipamento) && "identificação da máquina",
    vazio(o.numero_serie) && 'nº de série (ou "sem plaqueta")',
    vazio(o.condicao_entrada) && "condição de entrada",
    vazio(o.diagnostico) && "diagnóstico",
    vazio(o.solucao) && "serviço executado",
    !o.em_garantia && (vazio(o.orcamento_aprovado_em) || vazio(o.orcamento_aprovado_por)) && "orçamento aprovado (data e por quem)",
  ].filter(Boolean) as string[];
}
