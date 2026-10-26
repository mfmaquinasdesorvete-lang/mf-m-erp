// Importar a planilha de CT-e (CSV) que o site da transportadora deixa baixar: mostra o que vai entrar antes de gravar
// (importar_ctes). Usada na aba CT-e de Fretes e envios.
import { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { brl, dataBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { lerPlanilhaCtes, type LinhaCte } from "@/lib/cte";
import type { Transportadora } from "@/lib/types";
import { nomeTransportadora } from "@/components/fretes/CteResumo";

type Arquivo = { nome: string; linhas: LinhaCte[]; erros: string[] };

/** Lê o CSV (UTF-8 ou o padrão do Windows) e mostra o que vai entrar antes de gravar. */
export function ImportarCtes({ transportadoras, usadas, onClose }: { transportadoras: Transportadora[]; usadas: string[]; onClose: () => void }) {
  const invalidar = useInvalidate();
  const opcoes = transportadoras.filter((t) => t.ativo !== false && (!t.tipo || t.tipo === "transportadora"));
  const [transp, setTransp] = useState(usadas[0] ?? "");
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [gravando, setGravando] = useState(false);
  const linhas = arquivos.flatMap((a) => a.linhas);
  const datas = linhas.map((l) => l.emissao).sort();

  async function ler(files: FileList | null) {
    const lidos: Arquivo[] = [];
    for (const f of Array.from(files ?? [])) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let texto: string;
      try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { texto = new TextDecoder("windows-1252").decode(bytes); }
      lidos.push({ nome: f.name, ...lerPlanilhaCtes(texto) });
    }
    setArquivos(lidos);
  }

  async function gravar() {
    if (!transp) return notifyError(new Error("escolha a transportadora"));
    setGravando(true);
    const total = { novos: 0, atualizados: 0, ignorados: 0 };
    try {
      for (const a of arquivos.filter((x) => x.linhas.length)) {
        const { data, error } = await supabase.rpc("importar_ctes", { p_transportadora: transp, p_linhas: a.linhas, p_arquivo: a.nome });
        if (error) throw error;
        const r = data as typeof total;
        total.novos += r.novos; total.atualizados += r.atualizados; total.ignorados += r.ignorados;
      }
      notify(`${total.novos} CT-e novos${total.atualizados ? `, ${total.atualizados} atualizados (entrega)` : ""}${total.ignorados ? `, ${total.ignorados} ignorados` : ""}`);
      invalidar("ctes");
      onClose();
    } catch (e) { notifyError(e); } finally { setGravando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Importar CT-e da transportadora">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">No site da transportadora, baixe o relatório de CT-e do período em CSV (colunas Documento, Tipo, Nota Fiscal, CNPJ Dest…).
          Pode mandar vários meses de uma vez e repetir um mês: o CT-e que já está no ERP só atualiza a entrega.</p>
        <Field label="Transportadora">
          <select className="input" value={transp} onChange={(e) => setTransp(e.target.value)}>
            <option value="">Escolha…</option>
            {opcoes.map((t) => <option key={t.id} value={t.id}>{nomeTransportadora(t)}{t.municipio ? ` · ${t.municipio}/${t.uf ?? ""}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Planilhas (CSV)">
          <input className="input" type="file" accept=".csv,text/csv" multiple onChange={(e) => ler(e.target.files)} />
        </Field>
        {arquivos.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {arquivos.map((a) => (
              <li key={a.nome} className="p-3">
                <span className="flex flex-wrap items-center gap-2"><FileSpreadsheet size={15} className="text-slate-500" /><span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">{a.nome}</span>
                  <span>{a.linhas.length} CT-e · {brl(a.linhas.reduce((s, l) => s + l.valor, 0))}</span></span>
                {a.erros.map((e) => <span key={e} className="mt-1 block text-xs text-amber-700">{e}</span>)}
              </li>
            ))}
          </ul>
        )}
        {linhas.length > 0 && <p className="text-sm">Vão entrar <b>{linhas.length} CT-e</b> de {dataBR(datas[0])} a {dataBR(datas[datas.length - 1])}. O ERP vê quem é a MF em cada um
          (compra, venda ou transferência), quem paga o frete e liga à nota.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={gravar} disabled={!linhas.length || !transp || gravando}><Upload size={16} /> {gravando ? "Importando…" : `Importar ${linhas.length || ""} CT-e`}</Button>
        </div>
      </div>
    </Modal>
  );
}
