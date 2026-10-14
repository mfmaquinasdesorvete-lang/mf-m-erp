// Produtos → Kits do Tiny: lê as planilhas "composição de fabricados e kits" do Tiny, mostra kit por kit o que foi
// achado no cadastro e grava só os kits marcados (o que já tem componentes no ERP fica como está).
import { useMemo, useState } from "react";
import { Boxes, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notifyError } from "@/lib/notify";
import { lerComposicaoTiny, paraGravar, planejarKits, SITUACAO_KIT, type KitPlano, type LinhaComposicao, type ProdutoKitTiny } from "@/lib/kitsTiny";
import type { KitComponente } from "@/lib/types";

type Resultado = { kits: number; componentes: number; ja_tinham: string[]; ignorados: number };
const COMO = { codigo: "", sku: "pelo SKU", descricao: "pela descrição" } as const;
const marcavel = (k: KitPlano) => ["pronto", "faltam_itens", "proprio_item"].includes(k.situacao) && k.itens.length > 0;

export function ImportarKitsTiny({ onClose }: { onClose: () => void }) {
  const { data: produtos = [] } = useRows<ProdutoKitTiny>("produtos", { select: "id, descricao, sku, id_externo, codigos_alternativos, kit, ativo", order: "descricao", ascending: true });
  const { data: existentes = [] } = useRows<KitComponente>("kit_componentes", { order: "kit_id" });
  const invalidar = useInvalidate();
  const [linhas, setLinhas] = useState<LinhaComposicao[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const planos = useMemo(() => (linhas ? planejarKits(linhas, produtos, existentes) : []), [linhas, produtos, existentes]);
  const contar = (s: KitPlano["situacao"]) => planos.filter((k) => k.situacao === s).length;

  async function abrir(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setOcupado("ler");
    try {
      const l = await lerComposicaoTiny([...arquivos]);
      setLinhas(l);
      // já vem marcado o que está completo; "falta item" e "conferir" ficam para a pessoa decidir
      setMarcados(new Set(planejarKits(l, produtos, existentes).filter((k) => k.situacao === "pronto").map((k) => k.tinyId)));
    } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }

  async function gravar() {
    const kits = paraGravar(planos.filter((k) => marcados.has(k.tinyId) && marcavel(k)));
    if (!kits.length) return;
    setOcupado("gravar");
    try {
      const { data, error } = await supabase.rpc("importar_kits_tiny", { p_kits: kits });
      if (error) throw error;
      setResultado(data as Resultado);
      invalidar("kit_componentes", "produtos");
    } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }

  if (resultado) {
    return (
      <Modal open onClose={onClose} title="Kits do Tiny">
        <div className="space-y-3 text-[15px]">
          <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={20} aria-hidden /> {resultado.kits} kit(s) com {resultado.componentes} componente(s) gravados.</p>
          {resultado.ja_tinham.length > 0 && <p className="text-sm text-slate-600">Já tinham componentes (ficaram como estavam): {resultado.ja_tinham.join(", ")}.</p>}
          <p className="text-sm text-slate-600">Ao vender um kit, o estoque sai das peças dele. Kit dentro de kit (ex.: Mecânica Dupla) sai pelas peças do kit de dentro.
            Para mudar, use o botão <Boxes size={14} className="inline" aria-hidden /> Componentes na linha do kit.</p>
          <div className="flex justify-end"><Button type="button" onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
    );
  }

  const aGravar = planos.filter((k) => marcados.has(k.tinyId) && marcavel(k));
  return (
    <Modal open onClose={onClose} title="Kits do Tiny (composição)" wide>
      <div className="space-y-4 text-[15px]">
        <p className="text-sm text-slate-600">
          No Tiny: <b>Produtos → Kits e fabricados → Exportar composição</b>. Pode escolher várias planilhas de uma vez.
          Cada componente é achado pelo código do Tiny, depois pelo SKU e por último pela descrição. Nada é apagado:
          kit que já tem componentes no ERP fica como está.
        </p>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-700 hover:border-brand">
          <FileSpreadsheet size={18} aria-hidden /> {ocupado === "ler" ? "Lendo…" : linhas ? "Trocar planilhas" : "Escolher planilhas (.xls, .xlsx ou .csv)"}
          <input type="file" className="sr-only" multiple accept=".xls,.xlsx,.csv" onChange={(e) => abrir(e.target.files)} />
        </label>

        {linhas && (<>
          <p className="text-sm text-slate-700">
            {linhas.length} linha(s), {planos.length} composição(ões): <b>{contar("pronto")} pronto(s)</b>
            {contar("faltam_itens") > 0 && <>, {contar("faltam_itens")} com item que falta no cadastro</>}
            {contar("proprio_item") > 0 && <>, {contar("proprio_item")} para conferir</>}
            {contar("ja_tem") > 0 && <>, {contar("ja_tem")} já com componentes</>}
            {contar("fabricado") > 0 && <>, {contar("fabricado")} máquina(s) (ficha técnica em Produção)</>}
            {contar("fora_do_erp") > 0 && <>, {contar("fora_do_erp")} fora do ERP (versões antigas no Tiny)</>}.
          </p>
          <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
            {planos.map((k) => {
              const s = SITUACAO_KIT[k.situacao];
              const pode = marcavel(k);
              return (
                <li key={k.tinyId} className="p-3">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={!pode} checked={pode && marcados.has(k.tinyId)}
                      aria-label={`Gravar ${k.produto?.descricao ?? k.descricaoTiny}`}
                      onChange={(e) => { const n = new Set(marcados); if (e.target.checked) n.add(k.tinyId); else n.delete(k.tinyId); setMarcados(n); }} />
                    <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-fg">{k.produto?.descricao ?? k.descricaoTiny}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cor}`} title={s.ajuda}>{s.rotulo}</span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {k.produto?.sku ? `${k.produto.sku} · ` : ""}{k.itens.length} componente(s){k.faltando.length ? ` · ${k.faltando.length} fora do cadastro` : ""}
                        {k.proprio ? ` · o próprio kit aparece ${k.proprio}× na composição (fica de fora)` : ""}
                        {(k.itens.length > 0 || k.faltando.length > 0) && <> · <button type="button" className="font-semibold text-brand hover:underline" aria-expanded={aberto === k.tinyId}
                          onClick={() => setAberto(aberto === k.tinyId ? null : k.tinyId)}>{aberto === k.tinyId ? "fechar" : "ver"}</button></>}
                      </p>
                      {aberto === k.tinyId && (
                        <ul className="mt-2 space-y-0.5 text-sm">
                          {k.itens.map((i) => <li key={i.componente_id}>{i.quantidade}× {i.descricao}{COMO[i.como] && <span className="text-xs text-amber-700"> (achado {COMO[i.como]})</span>}</li>)}
                          {k.faltando.map((f, j) => <li key={j} className="text-red-700">{f.quantidade}× {f.descricao}{f.sku ? ` (${f.sku})` : ""}: não está no cadastro</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="button" disabled={!aGravar.length || !!ocupado} onClick={gravar}>
              <Boxes size={16} aria-hidden /> {ocupado === "gravar" ? "Gravando…" : `Gravar ${aGravar.length} kit(s)`}
            </Button>
          </div>
        </>)}
      </div>
    </Modal>
  );
}
