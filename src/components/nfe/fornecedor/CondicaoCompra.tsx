// "À vista / A prazo (dias)" na entrada da nota de fornecedor (pedido de 25/10, vindo do PRD). A formação de preço usa
// o custo à vista: só a compra à vista (ou no cartão) atualiza o custo do produto; a compra a prazo entra no estoque e
// fica no histórico de custos, sem mudar o custo. Já vem preenchido pelo XML quando ele diz; o escolhido vale mais.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Field } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";

export type Condicao = { condicao_pagamento: "a_vista" | "a_prazo" | null; prazo_dias: number | null; pelo_xml: string; vale: string; atualiza_custo: boolean };

export function useCondicaoCompra(nfeId: string) {
  return useQuery({
    queryKey: ["nfe_recebidas", "condicao", nfeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("nfe_condicao", { p_nfe: nfeId });
      if (error) throw error;
      return data as Condicao | null;
    },
  });
}

/** Sem condição escolhida nem lida do XML: a entrada pede a escolha antes de confirmar. */
export const faltaCondicao = (c: Condicao | null | undefined) => !!c && !c.condicao_pagamento && c.vale === "não informado";

export function CondicaoCompra({ nfeId, podeEditar }: { nfeId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const { data: c } = useCondicaoCompra(nfeId);
  const [prazo, setPrazo] = useState("");
  useEffect(() => { setPrazo(c?.prazo_dias != null ? String(c.prazo_dias) : ""); }, [c?.prazo_dias]);
  if (!c) return null;
  // o que aparece escolhido: o gravado; senão o que o XML diz
  const doXml = c.pelo_xml.startsWith("a prazo") ? "a_prazo" : c.pelo_xml === "à vista" || c.pelo_xml === "cartão de crédito" ? "a_vista" : "";
  const atual = c.condicao_pagamento ?? doXml;
  const prazoXml = Number(c.pelo_xml.match(/\((\d+) dias\)/)?.[1] ?? "") || null;

  async function salvar(condicao: string, dias: string) {
    const { error } = await supabase.rpc("nfe_condicao_salvar", {
      p_nfe: nfeId, p_condicao: condicao || null, p_prazo: condicao === "a_prazo" && dias.trim() ? Number(dias) : null,
    });
    if (error) return notifyError(error);
    qc.invalidateQueries({ queryKey: ["nfe_recebidas", "condicao", nfeId] });
  }

  return (
    <Field label="Condição de pagamento">
      <div className="flex gap-2">
        <select className="input" value={atual} disabled={!podeEditar} aria-label="À vista ou a prazo"
          onChange={(e) => salvar(e.target.value, e.target.value === "a_prazo" ? prazo || String(prazoXml ?? "") : "")}>
          <option value="">Escolha…</option>
          <option value="a_vista">À vista</option>
          <option value="a_prazo">A prazo</option>
        </select>
        {atual === "a_prazo" && (
          <input className="input w-24" inputMode="numeric" placeholder="dias" aria-label="Prazo em dias" value={prazo || (c.condicao_pagamento ? "" : String(prazoXml ?? ""))}
            disabled={!podeEditar} onChange={(e) => setPrazo(e.target.value.replace(/\D/g, ""))} onBlur={() => salvar("a_prazo", prazo)} />
        )}
      </div>
      <span className={`mt-1 block text-xs ${c.atualiza_custo ? "text-slate-500" : "text-amber-800"}`}>
        {!c.condicao_pagamento && c.pelo_xml !== "não informado" && `Pelo XML: ${c.pelo_xml}. `}
        {c.atualiza_custo ? "Atualiza o custo do produto."
          : atual === "a_prazo" ? "Compra a prazo: entra no estoque e fica no histórico, mas não muda o custo (a formação de preço usa o custo à vista)."
          : "O XML não diz: escolha à vista ou a prazo antes de confirmar."}
      </span>
    </Field>
  );
}
