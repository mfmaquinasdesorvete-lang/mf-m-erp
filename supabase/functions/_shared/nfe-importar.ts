// NF-e emitidas em outro sistema (ex.: Tiny) importadas pelo XML: entram na lista de emitidas e o XML fica
// guardado para o pacote do contador. Não mexem em estoque nem financeiro e não avisam o cliente
// (isso já foi feito no sistema anterior). O XML do cancelamento marca a nota como cancelada.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.86.0";
import { onlyDigits } from "./supabase.ts";
import { lerEvento, lerNotaEmitida } from "./nfe-xml.ts";
import { unidadePorCnpj } from "./nfe-recebidas.ts";

export type ResultadoImportacao = {
  situacao: "importada" | "atualizada" | "cancelada" | "ignorada" | "erro";
  numero?: string;
  mensagem?: string;
};

const ehEvento = (xml: string) => /<procEventoNFe[\s>]/.test(xml) || (/<evento[\s>]/.test(xml) && !xml.includes("<infNFe"));

export async function importarXmlEmitida(db: SupabaseClient, xml: string): Promise<ResultadoImportacao> {
  try {
    if (ehEvento(xml)) return await importarEvento(db, xml);
    if (!xml.includes("<infNFe")) return { situacao: "ignorada", mensagem: "não é XML de NF-e" };

    const nota = lerNotaEmitida(xml);
    const unidadeId = await unidadePorCnpj(db, nota.emitente_cnpj);
    if (!unidadeId) {
      const paraNos = await unidadePorCnpj(db, nota.destinatario_cnpj);
      return { situacao: "ignorada", numero: nota.numero, mensagem: paraNos ? "nota de fornecedor: importe em NF-e recebidas" : `emitente ${nota.emitente_cnpj} não é uma unidade da MF` };
    }
    if (nota.situacao === "sem_protocolo") return { situacao: "ignorada", numero: nota.numero, mensagem: "XML sem a autorização da SEFAZ (sem protocolo)" };

    const { data: existente } = await db.from("notas_fiscais").select("id, origem, status").eq("chave", nota.chave).maybeSingle();
    if (existente && existente.origem !== "importada") return { situacao: "ignorada", numero: nota.numero, mensagem: "emitida pelo ERP (já está na lista)" };

    const doc = onlyDigits(nota.destinatario_doc);
    const { data: clientes } = doc ? await db.from("clientes").select("id").eq("cpf_cnpj", doc).limit(1) : { data: [] as { id: string }[] };
    const { data: salva, error } = await db.from("notas_fiscais").upsert({
      referencia: `importada-${nota.chave}`,
      origem: "importada",
      unidade_id: unidadeId,
      status: existente?.status === "cancelada" || nota.situacao === "cancelada" ? "cancelada" : "autorizada",
      numero: nota.numero,
      serie: nota.serie,
      chave: nota.chave,
      valor_total: nota.valor_total,
      // a data da lista e do fechamento do contador é a da emissão
      created_at: nota.data_emissao ?? new Date().toISOString(),
      destinatario_nome: nota.destinatario_nome || null,
      destinatario_doc: doc || null,
      cliente_id: clientes?.[0]?.id ?? null,
      mensagem: "Importada do sistema anterior",
      payload: { importada: true, natureza_operacao: nota.natureza, uf_destinatario: nota.destinatario_uf, items: nota.items },
    }, { onConflict: "referencia" }).select("id").single();
    if (error || !salva) return { situacao: "erro", numero: nota.numero, mensagem: error?.message ?? "não gravou" };

    const { error: e2 } = await db.from("notas_fiscais_xml").upsert({ nota_id: salva.id, xml }, { onConflict: "nota_id" });
    if (e2) return { situacao: "erro", numero: nota.numero, mensagem: e2.message };
    return { situacao: existente ? "atualizada" : "importada", numero: nota.numero };
  } catch (e) {
    return { situacao: "erro", mensagem: (e as Error).message };
  }
}

async function importarEvento(db: SupabaseClient, xml: string): Promise<ResultadoImportacao> {
  const ev = lerEvento(xml);
  if (!ev) return { situacao: "ignorada", mensagem: "evento sem chave da nota" };
  if (ev.tipo !== "110111") return { situacao: "ignorada", mensagem: ev.tipo === "110110" ? "carta de correção (não é importada)" : `evento ${ev.tipo} (não é importado)` };
  if (!ev.registrado) return { situacao: "ignorada", mensagem: "cancelamento não registrado na SEFAZ" };

  const { data: nota } = await db.from("notas_fiscais").select("id, numero, origem").eq("chave", ev.chave).maybeSingle();
  if (!nota) return { situacao: "ignorada", mensagem: "cancelamento de uma nota que não está no ERP: importe o XML da nota junto" };
  if (nota.origem !== "importada") return { situacao: "ignorada", numero: nota.numero, mensagem: "nota emitida pelo ERP: o cancelamento vem da Focus" };
  await db.from("notas_fiscais").update({ status: "cancelada", mensagem: "Cancelada (importada do sistema anterior)" }).eq("id", nota.id);
  await db.from("notas_fiscais_xml").update({ xml_cancelamento: xml }).eq("nota_id", nota.id);
  return { situacao: "cancelada", numero: nota.numero };
}
