// Peso e medidas dos produtos, para a cotação de frete (loja e cotação rápida): lista dos produtos ativos com o que
// falta, edição na linha e "aplicar aos marcados" (a mesma embalagem e o mesmo peso para vários, ex.: uma categoria).
// Sem peso e sem medidas (do produto ou da embalagem), o produto fica "frete sob consulta".
import { useMemo, useState } from "react";
import { Check, Package } from "lucide-react";
import { Button } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { lerValor } from "@/lib/auditoriaBusca";
import { confirmar } from "@/components/Dialogos";

type ProdutoMedidas = {
  id: string; descricao: string; sku: string | null; categoria: string | null; no_catalogo: boolean | null;
  peso_kg: number | null; largura_cm: number | null; altura_cm: number | null; profundidade_cm: number | null; embalagem_id: string | null;
};
type Embalagem = { id: string; descricao: string; largura_cm: number | null; altura_cm: number | null; comprimento_cm: number | null; peso_kg: number | null; ativo: boolean };
type Campos = { peso_kg: string; largura_cm: string; altura_cm: string; profundidade_cm: string; embalagem_id: string };

const temMedidas = (p: ProdutoMedidas) => !!p.embalagem_id || (Number(p.largura_cm) > 0 && Number(p.altura_cm) > 0 && Number(p.profundidade_cm) > 0);
export const completoParaFrete = (p: ProdutoMedidas) => Number(p.peso_kg) > 0 && temMedidas(p);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const txt = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
const num = (s: string) => { const v = lerValor(s); return v != null && v > 0 ? v : null; };

export function PesoMedidas({ podeEditar }: { podeEditar: boolean }) {
  const invalidar = useInvalidate();
  const { data: produtos = [] } = useRows<ProdutoMedidas>("produtos", {
    select: "id, descricao, sku, categoria, no_catalogo, peso_kg, largura_cm, altura_cm, profundidade_cm, embalagem_id", order: "descricao", ascending: true,
    key: ["peso-medidas"], filtro: (q) => q.eq("ativo", true),
  });
  const { data: embalagens = [] } = useRows<Embalagem>("embalagens", { order: "descricao", ascending: true, filtro: (q) => q.eq("ativo", true) });
  const [filtro, setFiltro] = useState<"faltando" | "loja" | "todos">("faltando");
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [edit, setEdit] = useState<Record<string, Campos>>({});
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState({ embalagem_id: "", peso_kg: "" });
  const [salvando, setSalvando] = useState(false);

  const categorias = useMemo(() => [...new Set(produtos.map((p) => p.categoria).filter(Boolean) as string[])].sort(), [produtos]);
  const lista = useMemo(() => {
    const t = semAcento(busca.trim());
    return produtos.filter((p) => (filtro === "todos" || (filtro === "faltando" ? !completoParaFrete(p) : !!p.no_catalogo))
      && (!categoria || p.categoria === categoria) && (!t || semAcento(`${p.descricao} ${p.sku ?? ""}`).includes(t)));
  }, [produtos, filtro, categoria, busca]);
  const faltando = useMemo(() => produtos.filter((p) => !completoParaFrete(p)).length, [produtos]);

  const campos = (p: ProdutoMedidas): Campos => edit[p.id] ?? { peso_kg: txt(p.peso_kg), largura_cm: txt(p.largura_cm), altura_cm: txt(p.altura_cm), profundidade_cm: txt(p.profundidade_cm), embalagem_id: p.embalagem_id ?? "" };
  const mudar = (p: ProdutoMedidas, k: keyof Campos, v: string) => setEdit((x) => ({ ...x, [p.id]: { ...campos(p), [k]: v } }));

  async function salvarLinha(p: ProdutoMedidas) {
    const c = campos(p);
    if (salvando) return;
    setSalvando(true);
    try {
      // só o que mudou (regra do cadastro de produtos); peso da peça embalada, em kg
      const novo: Record<string, number | string | null> = {
        peso_kg: num(c.peso_kg), largura_cm: num(c.largura_cm), altura_cm: num(c.altura_cm), profundidade_cm: num(c.profundidade_cm), embalagem_id: c.embalagem_id || null,
      };
      const mud = Object.fromEntries(Object.entries(novo).filter(([k, v]) => v !== (p[k as keyof ProdutoMedidas] ?? null)));
      if (!Object.keys(mud).length) { setEdit((x) => { const y = { ...x }; delete y[p.id]; return y; }); return; }
      const { error } = await supabase.from("produtos").update(mud).eq("id", p.id);
      if (error) throw error;
      setEdit((x) => { const y = { ...x }; delete y[p.id]; return y; });
      notify("Salvo");
      invalidar("produtos");
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  async function aplicarLote() {
    const ids = [...marcados];
    const peso = num(lote.peso_kg);
    if (!ids.length) return notify("Marque os produtos", "erro");
    if (!lote.embalagem_id && !peso) return notify("Escolha a embalagem ou o peso para aplicar", "erro");
    const emb = embalagens.find((e) => e.id === lote.embalagem_id);
    const oQue = [emb ? `embalagem "${emb.descricao}"` : null, peso ? `peso ${txt(peso)} kg` : null].filter(Boolean).join(" e ");
    if (!(await confirmar(`Aplicar ${oQue} em ${ids.length} produto(s)? O que já estava nesses campos é trocado.`, { ok: "Aplicar" }))) return;
    setSalvando(true);
    try {
      const mud: Record<string, unknown> = {};
      if (lote.embalagem_id) mud.embalagem_id = lote.embalagem_id;
      if (peso) mud.peso_kg = peso;
      const { error } = await supabase.from("produtos").update(mud).in("id", ids);
      if (error) throw error;
      notify(`${ids.length} produto(s) atualizados`);
      setMarcados(new Set());
      invalidar("produtos");
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  const marcar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosMarcados = lista.length > 0 && lista.every((p) => marcados.has(p.id));
  const input = (p: ProdutoMedidas, k: keyof Campos, rotulo: string) => (
    <input className="input w-20 px-2 py-1 text-sm" inputMode="decimal" value={campos(p)[k]} onChange={(e) => mudar(p, k, e.target.value)} aria-label={`${rotulo} de ${p.descricao}`} disabled={!podeEditar} />
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600"><Package size={15} className="mr-1 inline" aria-hidden />
        A cotação de frete usa o <b>peso da peça embalada</b> (kg, ex.: 0,350) e as <b>medidas da embalagem</b> (cm). Faltam em <b>{faltando}</b> de {produtos.length} produtos ativos.</p>
      <div className="flex flex-wrap items-end gap-2">
        <select className="input w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Quais produtos">
          <option value="faltando">Faltando peso ou medidas</option><option value="loja">Produtos da loja</option><option value="todos">Todos os ativos</option>
        </select>
        <select className="input w-auto" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="input min-w-40 flex-1" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" aria-label="Buscar produto" />
      </div>

      {podeEditar && marcados.size > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-cartao bg-slate-50 p-3">
          <span className="text-sm font-semibold">{marcados.size} marcado(s): aplicar</span>
          <select className="input w-auto" value={lote.embalagem_id} onChange={(e) => setLote({ ...lote, embalagem_id: e.target.value })} aria-label="Embalagem para os marcados">
            <option value="">— embalagem —</option>{embalagens.map((e) => <option key={e.id} value={e.id}>{e.descricao}{e.largura_cm ? ` (${e.largura_cm}×${e.altura_cm}×${e.comprimento_cm} cm)` : ""}</option>)}
          </select>
          <input className="input w-28" inputMode="decimal" value={lote.peso_kg} onChange={(e) => setLote({ ...lote, peso_kg: e.target.value })} placeholder="peso kg" aria-label="Peso para os marcados" />
          <Button type="button" onClick={aplicarLote} disabled={salvando} carregando={salvando}>Aplicar</Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              {podeEditar && <th className="py-1"><input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(lista.map((p) => p.id)))} aria-label="Marcar todos da lista" /></th>}
              <th>Produto</th><th title="Peso da peça embalada, como vai no envio">Peso embalado (kg)</th><th>Larg.</th><th>Alt.</th><th>Prof. (cm)</th><th>Embalagem</th><th />
            </tr>
          </thead>
          <tbody>
            {lista.slice(0, 200).map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                {podeEditar && <td className="py-1"><input type="checkbox" checked={marcados.has(p.id)} onChange={() => marcar(p.id)} aria-label={`Marcar ${p.descricao}`} /></td>}
                <td className="max-w-64 py-1"><span className="block truncate">{p.descricao}</span><span className="text-2xs text-slate-400">{[p.sku, p.categoria].filter(Boolean).join(" · ")}</span></td>
                <td>{input(p, "peso_kg", "Peso")}</td>
                <td>{input(p, "largura_cm", "Largura")}</td>
                <td>{input(p, "altura_cm", "Altura")}</td>
                <td>{input(p, "profundidade_cm", "Profundidade")}</td>
                <td>
                  <select className="input w-40 px-2 py-1 text-sm" value={campos(p).embalagem_id} onChange={(e) => mudar(p, "embalagem_id", e.target.value)} aria-label={`Embalagem de ${p.descricao}`} disabled={!podeEditar}>
                    <option value="">—</option>{embalagens.map((e) => <option key={e.id} value={e.id}>{e.descricao}</option>)}
                  </select>
                </td>
                <td>{podeEditar && edit[p.id] && <Button type="button" tamanho="mini" onClick={() => salvarLinha(p)} disabled={salvando} aria-label={`Salvar ${p.descricao}`}><Check size={13} /> Salvar</Button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length > 200 && <p className="mt-2 text-xs text-slate-500">Mostrando 200 de {lista.length}: use a busca ou a categoria.</p>}
        {!lista.length && <p className="py-8 text-center text-sm text-slate-500">{filtro === "faltando" ? "Todos os produtos já têm peso e medidas." : "Nenhum produto."}</p>}
      </div>
    </div>
  );
}
