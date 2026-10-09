// Unidade em que se está trabalhando: Matriz SC, Filial SP ou todas (só para ver).
// Novos documentos (pedido, OS, conta, compra...) vão para a unidade escolhida.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRows } from "./data";
import { supabase } from "./supabase";

export type Unidade = {
  id: string; codigo: string; nome: string; matriz: boolean; ativo: boolean; fabrica: boolean; assistencia: boolean;
  razao_social: string | null; cnpj: string | null; inscricao_estadual: string | null; inscricao_municipal: string | null;
  logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null;
  municipio: string | null; uf: string | null; cep: string | null; telefone: string | null; whatsapp: string | null; email: string | null;
  instrucoes_pagamento: string | null; pix_chave?: string | null; pix_nome?: string | null; pix_cidade?: string | null;
  serie_nfe: number; natureza_operacao: string; cfop_venda_producao: string; cfop_venda_revenda: string;
  icms_cst: string; icms_aliquota_interna: number; icms_reducao_base: number;
  pis_cst: string; pis_aliquota: number; cofins_cst: string; cofins_aliquota: number; pis_cofins_exclui_icms: boolean;
  ipi_cst: string; ipi_enquadramento: string; difal_ativo: boolean;
  transf_icms_cst: string; transf_pis_cofins_cst: string; transf_destacar_ipi: boolean;
  ipi_cst_aliquota_zero?: string; ibs_cbs_cst?: string; ibs_cbs_class_trib?: string;
  transf_ibs_cbs_cst?: string; transf_ibs_cbs_class_trib?: string; informacoes_complementares?: string | null;
};

type Ctx = {
  unidades: Unidade[];
  /** null = todas */
  atual: string | null;
  setAtual: (id: string | null) => void;
  /** unidade usada para novos documentos */
  padrao: string | null;
  nome: (id: string | null | undefined) => string;
  codigo: (id: string | null | undefined) => string;
  filtrar: <T,>(lista: T[]) => T[];
};

const UnidadeCtx = createContext<Ctx | null>(null);
const CHAVE = "mf-erp-unidade";

export function UnidadeProvider({ inicial, children }: { inicial: string | null; children: ReactNode }) {
  const { data: todas = [] } = useRows<Unidade>("unidades", { order: "codigo", ascending: true });
  const unidades = todas.filter((u) => u.ativo);
  const qc = useQueryClient();
  const [atual, setAtualState] = useState<string | null>(() => {
    try { const v = localStorage.getItem(CHAVE); if (v) return v === "todas" ? null : v; } catch { /* sem armazenamento */ }
    return inicial;
  });
  const [ultima, setUltima] = useState<string | null>(atual ?? inicial);

  // unidade salva que não existe mais (ou primeira carga): cai para a padrão
  useEffect(() => {
    if (atual && unidades.length && !unidades.some((u) => u.id === atual)) setAtualState(null);
  }, [atual, unidades]);

  const setAtual = (id: string | null) => {
    setAtualState(id);
    try { localStorage.setItem(CHAVE, id ?? "todas"); } catch { /* sem armazenamento */ }
    if (id) {
      setUltima(id);
      supabase.rpc("definir_minha_unidade", { p_unidade: id }).then(() => qc.invalidateQueries({ queryKey: ["usuarios_erp"] }));
    }
  };

  const valor = useMemo<Ctx>(() => {
    const matriz = unidades.find((u) => u.matriz)?.id ?? unidades[0]?.id ?? null;
    const por = (id: string | null | undefined) => unidades.find((u) => u.id === id) ?? todas.find((u) => u.id === id);
    return {
      unidades, atual, setAtual,
      padrao: atual ?? ultima ?? matriz,
      nome: (id) => por(id)?.nome ?? "—",
      codigo: (id) => por(id)?.codigo ?? "",
      filtrar: <T,>(lista: T[]) => (atual ? lista.filter((r) => { const u = (r as { unidade_id?: string | null }).unidade_id; return !u || u === atual; }) : lista),
    };
  }, [unidades, todas, atual, ultima]); // eslint-disable-line react-hooks/exhaustive-deps

  return <UnidadeCtx.Provider value={valor}>{children}</UnidadeCtx.Provider>;
}

export function useUnidade() {
  const c = useContext(UnidadeCtx);
  if (!c) throw new Error("useUnidade fora do UnidadeProvider");
  return c;
}

/** Etiqueta curta da unidade (SC / SP), para listas. */
export function EtiquetaUnidade({ id }: { id: string | null | undefined }) {
  const { codigo, unidades } = useUnidade();
  if (unidades.length < 2 || !id) return null;
  return <span className="ml-1.5 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 align-middle text-[11px] font-bold tracking-wide text-slate-600">{codigo(id)}</span>;
}

/** Campo "Unidade" para formulários de criação. */
export function CampoUnidade({ value, onChange, disabled, label = "Unidade (CNPJ que emite)" }: {
  value: string | null | undefined; onChange: (id: string) => void; disabled?: boolean; label?: string;
}) {
  const { unidades } = useUnidade();
  if (unidades.length < 2) return null;
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <select className="input" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} required>
        {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.uf ? ` (${u.uf})` : ""}</option>)}
      </select>
    </label>
  );
}
