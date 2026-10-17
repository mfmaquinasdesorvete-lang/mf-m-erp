// Nota emitida → GNRE: quando a NF-e para outro estado tem DIFAL, FCP ou ICMS-ST, mostra a guia que o banco lançou
// (valores, vencimento, situação e a conta a pagar), o atalho para o portal da GNRE e o campo do código de barras.
// Nota autorizada antes da regra (ou de UF que estava como inscrita): botão "Lançar GNRE" para o financeiro.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Landmark, Receipt } from "lucide-react";
import { Button } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { useInvalidate } from "@/lib/data";
import { codigoGnre, PORTAL_GNRE, situacaoGnre, valoresGnre, type GuiaGnre } from "@/lib/gnre";

type NotaGnre = { id: string; numero: string | null; status: string; origem?: string; ambiente?: string; finalidade?: string; tipo_operacao?: string; payload?: any };

export function GnreNota({ nota: n, podeFin }: { nota: NotaGnre; podeFin: boolean }) {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const v = valoresGnre(n.payload?.items);
  const { data: guia, isLoading } = useQuery({
    queryKey: ["gnre_guias", n.id],
    enabled: v.total > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("gnre_guias")
        .select("*, conta:contas_pagar!gnre_guias_conta_fk(id, status, data_pagamento)").eq("nota_fiscal_id", n.id).maybeSingle();
      if (error) throw error;
      return data as GuiaGnre | null;
    },
  });
  if (v.total <= 0 || isLoading) return null;

  const uf = String(n.payload?.uf_destinatario ?? "").toUpperCase();
  const partes = [v.difal && `DIFAL ${brl(v.difal)}`, v.fcp && `FCP ${brl(v.fcp)}`, v.st && `ICMS-ST ${brl(v.st)}`].filter(Boolean).join(" · ");
  const podeLancar = podeFin && !guia && n.status === "autorizada" && n.origem !== "importada" && n.ambiente !== "homologacao"
    && (n.finalidade ?? "normal") !== "devolucao" && (n.tipo_operacao ?? "saida") === "saida";

  async function lancar() {
    if (!(await confirmar(`Lançar a conta a pagar "GNRE – NF ${n.numero ?? "?"} – ${uf}" de ${brl(v.total)}, vencendo no próximo dia útil?`, { ok: "Lançar GNRE" }))) return;
    setOcupado(true);
    const { error } = await supabase.rpc("gnre_lancar_nota", { p_nota: n.id });
    setOcupado(false);
    if (error) return notifyError(error);
    notify("GNRE lançada em Contas a pagar");
    invalidate("gnre_guias", "contas_pagar", "contas_pagar_origem");
  }

  async function salvarCodigo() {
    const c = codigoGnre(codigo);
    if (!c.ok) return notifyError(new Error(c.erro));
    setOcupado(true);
    const { error } = await supabase.rpc("gnre_informar_guia", { p_id: guia!.id, p_codigo: c.codigo });
    setOcupado(false);
    if (error) return notifyError(error);
    setCodigo("");
    notify("Código da guia gravado na conta a pagar");
    invalidate("gnre_guias", "contas_pagar");
  }

  const sit = guia ? situacaoGnre(guia) : null;
  return (
    <section className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-sm" aria-label="GNRE">
      <div className="flex flex-wrap items-center gap-2">
        <Landmark size={16} className="text-rose-700" aria-hidden />
        <b className="text-fg">GNRE para {uf || "outro estado"}</b>
        <span className="font-semibold text-fg">{brl(guia?.valor_total ?? v.total)}</span>
        {sit && <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${sit.cor}`}>{sit.rotulo}</span>}
        {guia && <span className="text-xs text-slate-600">vence {dataBR(guia.vencimento)}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-600">{partes}. {sit ? sit.dica : "Ainda sem conta a pagar lançada para esta guia."} Regra do imposto: confirmar com o contador.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a href={PORTAL_GNRE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-white">
          <ExternalLink size={13} aria-hidden /> Portal da GNRE
        </a>
        {guia?.conta_pagar_id && (
          <Button type="button" variant="ghost" onClick={() => navigate("/financeiro?aba=pagar", { state: { aba: "pagar", destaque: { ids: [guia.conta_pagar_id], titulo: `GNRE da NF ${n.numero ?? ""}`, origem: "Nota fiscal" } } })}>
            <Receipt size={14} /> Ver a conta a pagar
          </Button>
        )}
        {podeLancar && <Button type="button" variant="secondary" disabled={ocupado} onClick={lancar}>{ocupado ? "Lançando…" : "Lançar GNRE"}</Button>}
      </div>
      {guia && podeFin && sit && (sit.codigo === "a_gerar" || sit.codigo === "vencida" || sit.codigo === "gerada") && (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); salvarCodigo(); }}>
          <label className="sr-only" htmlFor={`gnre-${guia.id}`}>Código de barras da guia</label>
          <input id={`gnre-${guia.id}`} className="input min-w-0 flex-1 basis-64 font-mono text-xs" inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)}
            placeholder={guia.codigo_barras ? `gravado: …${guia.codigo_barras.slice(-8)} (colar outro para trocar)` : "Colar o código de barras da guia (44 ou 48 números)"} />
          <Button type="submit" variant="secondary" disabled={ocupado || !codigo.trim()}>{ocupado ? "Gravando…" : "Gravar código"}</Button>
        </form>
      )}
    </section>
  );
}
