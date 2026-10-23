// Linhas de produtos (como no Tiny): agrupam produtos e definem a comissão da linha.
// Comissão "fixa" (um % para a linha), "conforme descontos" (faixas: desconto até X% → comissão Y%) ou
// "sem % próprio" (a linha só agrupa; vale a categoria ou o vendedor). Linha não se apaga: desativa.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Modal, Table } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { pl } from "@/lib/format";
import { textoComissaoLinha, type FaixaDesconto, type LinhaProduto } from "@/lib/comissao";

const numero = (v: unknown) => Number(String(v ?? "").replace(",", "."));
const pct = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export function LinhasProduto() {
  const { data: linhas = [], isLoading } = useRows<LinhaProduto>("linhas_produto", { order: "nome", ascending: true });
  const { data: produtos = [] } = useRows<{ id: string; linha_id: string | null }>("produtos", { select: "id, linha_id", key: ["linhas"] });
  const [editando, setEditando] = useState<Partial<LinhaProduto> | null>(null);
  const [busca, setBusca] = useState("");
  const qtd = (id: string) => produtos.filter((p) => p.linha_id === id).length;
  const lista = linhas.filter((l) => !busca.trim() || l.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      <Card className="p-4 text-sm text-slate-700">
        <p className="mb-1 font-semibold">Linhas de produtos: a comissão de um grupo de produtos de uma vez</p>
        <p className="text-slate-600">Ligue os produtos à linha no cadastro do produto (ou marque vários na lista de produtos e use <b>Definir linha</b>).
          Na venda, cada item usa a comissão da sua linha. Ordem: % do vendedor na categoria → <b>linha</b> → % da categoria → % geral do vendedor.
          O % digitado no pedido vale acima de tudo. Comissões já lançadas não mudam.</p>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input className="input w-full sm:w-72" placeholder="Pesquisa…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Pesquisar linha" />
        <Button onClick={() => setEditando({ comissao_tipo: "fixa", comissao_percentual: 0, comissao_faixas: [], ativo: true })}><Plus size={16} /> Nova linha</Button>
      </div>
      <Table empty={!isLoading && !lista.length}
        head={<><th className="th">Descrição</th><th className="th">Comissionamento</th><th className="th text-right">Produtos</th><th className="th" /></>}>
        {lista.map((l) => (
          <tr key={l.id} className={l.ativo ? "" : "opacity-60"}>
            <td className="td font-semibold">{l.nome}{!l.ativo && <span className="ml-2 text-xs font-normal text-slate-500">(inativa)</span>}</td>
            <td className="td text-sm">{textoComissaoLinha(l)}</td>
            <td className="td text-right"><Link to="/estoque" className="text-brand hover:underline" title="Na lista de produtos, filtre por Linha">{qtd(l.id)} {pl(qtd(l.id), "produto", "produtos")}</Link></td>
            <td className="td text-right"><Button variant="secondary" onClick={() => setEditando(l)}><Pencil size={15} /> Editar</Button></td>
          </tr>
        ))}
      </Table>
      {editando && <LinhaModal linha={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

function LinhaModal({ linha, onClose }: { linha: Partial<LinhaProduto>; onClose: () => void }) {
  const [l, setL] = useState(linha);
  const [aliquota, setAliquota] = useState(pct(Number(linha.comissao_percentual ?? 0)));
  const [faixas, setFaixas] = useState<{ ate: string; pct: string }[]>(() =>
    (linha.comissao_faixas?.length ? linha.comissao_faixas : [{ desconto_ate: 0, percentual: 0 }])
      .map((f: FaixaDesconto) => ({ ate: pct(Number(f.desconto_ate)), pct: pct(Number(f.percentual)) })));
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidate();
  const tipo = l.comissao_tipo ?? "fixa";

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const nome = String(l.nome ?? "").trim();
    if (!nome) return notifyError(new Error("Informe a descrição da linha"));
    const fx = faixas.filter((f) => f.ate.trim() !== "" && f.pct.trim() !== "").map((f) => ({ desconto_ate: numero(f.ate), percentual: numero(f.pct) }));
    const ruim = [numero(aliquota), ...fx.flatMap((f) => [f.desconto_ate, f.percentual])].some((n) => !(n >= 0) || n > 100);
    if (ruim) return notifyError(new Error("Os % precisam ficar entre 0 e 100"));
    if (tipo === "desconto" && !fx.length) return notifyError(new Error("Preencha ao menos uma faixa de desconto"));
    const row = {
      nome, comissao_tipo: tipo, comissao_percentual: tipo === "fixa" ? numero(aliquota) : 0,
      comissao_faixas: tipo === "desconto" ? fx.sort((a, b) => a.desconto_ate - b.desconto_ate) : [], ativo: l.ativo ?? true,
      updated_at: new Date().toISOString(),
    };
    setSalvando(true);
    const { error } = l.id ? await supabase.from("linhas_produto").update(row).eq("id", l.id) : await supabase.from("linhas_produto").insert(row);
    setSalvando(false);
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("Já existe uma linha com esse nome") : error);
    notify("Linha salva");
    invalidar("linhas_produto");
    onClose();
  }

  const opcao = (v: LinhaProduto["comissao_tipo"], rotulo: string, ajuda: string) => (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 text-sm hover:bg-slate-50">
      <input type="radio" name="tipo" className="mt-1 h-4 w-4" checked={tipo === v} onChange={() => setL({ ...l, comissao_tipo: v })} />
      <span><b className="text-fg">{rotulo}</b><span className="block text-xs text-slate-500">{ajuda}</span></span>
    </label>
  );

  return (
    <Modal open onClose={onClose} title={l.id ? "Linha de produtos" : "Nova linha de produtos"}>
      <form onSubmit={salvar} className="space-y-4">
        <Field label="Descrição"><input className="input" value={l.nome ?? ""} onChange={(e) => setL({ ...l, nome: e.target.value })} required autoFocus placeholder="Ex.: Máquinas Franquia" /></Field>
        <div>
          <div className="mb-1 text-sm font-bold text-fg">Comissionamento</div>
          {opcao("fixa", "Comissão com alíquota fixa", "Todo item desta linha paga o mesmo %.")}
          {opcao("desconto", "Comissão com alíquota conforme descontos", "Quanto maior o desconto dado no item, menor a comissão.")}
          {opcao("herda", "Sem % próprio", "A linha só agrupa; vale o % da categoria ou do vendedor.")}
        </div>
        {tipo === "fixa" && (
          <Field label="Alíquota de comissão (%)" className="max-w-[200px]">
            <input className="input" inputMode="decimal" value={aliquota} onChange={(e) => setAliquota(e.target.value.replace(/[^\d,.]/g, ""))} />
          </Field>
        )}
        {tipo === "desconto" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Desconto do item contra o preço de lista (ou da tabela de preço do pedido), já com o desconto do pedido. Acima da última faixa vale a última.</p>
            {faixas.map((f, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label={i ? "Desconto até (%)" : "Desconto até (%) — 0 = sem desconto"} className="w-40">
                  <input className="input" inputMode="decimal" value={f.ate} onChange={(e) => setFaixas(faixas.map((x, k) => k === i ? { ...x, ate: e.target.value.replace(/[^\d,.]/g, "") } : x))} />
                </Field>
                <Field label="Comissão (%)" className="w-32">
                  <input className="input" inputMode="decimal" value={f.pct} onChange={(e) => setFaixas(faixas.map((x, k) => k === i ? { ...x, pct: e.target.value.replace(/[^\d,.]/g, "") } : x))} />
                </Field>
                {faixas.length > 1 && (
                  <button type="button" aria-label="Tirar faixa" className="botao-icone mb-1 p-2" onClick={() => setFaixas(faixas.filter((_, k) => k !== i))}><Trash2 size={16} /></button>
                )}
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={() => setFaixas([...faixas, { ate: "", pct: "" }])}><Plus size={15} /> Faixa</Button>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={l.ativo ?? true} onChange={(e) => setL({ ...l, ativo: e.target.checked })} /> Linha ativa</label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Liga vários produtos a uma linha de uma vez (ação "Definir linha" da lista de produtos). */
export function DefinirLinha({ ids, onFim }: { ids: string[]; onFim: (mensagem: string) => void }) {
  const { data: linhas = [] } = useRows<LinhaProduto>("linhas_produto", { order: "nome", ascending: true });
  const [linha, setLinha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const invalidar = useInvalidate();
  async function aplicar() {
    setOcupado(true);
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from("produtos").update({ linha_id: linha || null }).in("id", ids.slice(i, i + 200));
        if (error) throw error;
      }
      invalidar("produtos");
      const nome = linhas.find((x) => x.id === linha)?.nome;
      onFim(`${ids.length} ${pl(ids.length, "produto", "produtos")} ${nome ? `na linha ${nome}` : "sem linha"}`);
    } catch (e) { notifyError(e); setOcupado(false); }
  }
  return (
    <Modal open onClose={() => onFim("Nada mudou")} title="Definir linha de produtos">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">{ids.length} {pl(ids.length, "produto marcado", "produtos marcados")}. A comissão de cada item vendido passa a seguir a linha.</p>
        <Field label="Linha">
          <select className="input" value={linha} onChange={(e) => setLinha(e.target.value)} autoFocus>
            <option value="">Sem linha (tirar da linha)</option>
            {linhas.filter((x) => x.ativo).map((x) => <option key={x.id} value={x.id}>{x.nome} · {textoComissaoLinha(x)}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onFim("Nada mudou")}>Cancelar</Button>
          <Button onClick={aplicar} disabled={ocupado}>{ocupado ? "Aplicando…" : "Aplicar"}</Button>
        </div>
      </div>
    </Modal>
  );
}
