// Garçom (erp.myfrost.ai/sorveteria/garcom): comanda eletrônica no celular. Escolhe a comanda, lança na cozinha e pede a conta ao caixa.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Receipt, Send, Trash2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { MontarItem } from "@/components/sorveteria/MontarItem";
import { brl } from "@/lib/format";
import { notify } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { comAtivo, irParaProducao, registrarCliente } from "@/lib/sorveteriaAcoes";
import { caixaAberto, definirAtivo, novoId, pedidoAtivo, salvarPedido, totalPedido, usarLoja, useSorveteria, type ItemPedido, type ProdutoMenu } from "@/lib/sorveteria";

export default function SorveteriaGarcom() {
  const { nome: operador } = usePerfil();
  const { padrao } = useUnidade();
  usarLoja(padrao ?? "padrao");
  const { estado, mudar } = useSorveteria();
  const [cat, setCat] = useState(""), [busca, setBusca] = useState("");
  const [montando, setMontando] = useState<ProdutoMenu | null>(null);
  useEffect(() => {
    const raiz = document.documentElement, antes = raiz.dataset.modulo;
    raiz.dataset.modulo = "vendas";
    return () => { raiz.dataset.modulo = antes ?? ""; };
  }, []);

  const p = pedidoAtivo(estado), mesa = p?.canal === "mesa" ? p.mesa : null;
  const abertas = estado.pedidos.filter((x) => x.situacao === "aberto" && x.canal === "mesa" && x.itens.length);
  const produtos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return estado.produtos.filter((x) => x.ativo && (!cat || x.categoria_id === cat) && (!q || x.nome.toLowerCase().includes(q)));
  }, [estado.produtos, cat, busca]);

  function abrirMesa(n: string) {
    if (!caixaAberto(estado)) return notify("Caixa fechado: peça para abrir no PDV.", "erro");
    const ex = abertas.find((x) => x.mesa === n);
    if (ex) return definirAtivo(ex.id);
    definirAtivo(null);
    mudar((e) => { const [e2, novo] = comAtivo(e, operador); return salvarPedido(e2, { ...novo, canal: "mesa", mesa: n }); });
  }
  function voltar() {
    if (p && !p.itens.length) mudar((e) => ({ ...e, pedidos: e.pedidos.filter((x) => x.id !== p.id) }));
    definirAtivo(null);
  }
  function adicionar(item: ItemPedido) {
    mudar((e) => { const [e2, ped] = comAtivo(e, operador); return salvarPedido(e2, { ...ped, itens: [...ped.itens, item] }); });
  }
  function escolher(x: ProdutoMenu) {
    if (x.esgotado) return;
    if (x.sabores > 0 || x.grupos.length > 0 || x.tipo === "peso") return setMontando(x);
    adicionar({ id: novoId(), produto_id: x.id, nome: x.nome, qtd: 1, unit: x.preco, sabores: [], complementos: [], saborIds: [], complementoIds: [] });
  }
  function lancar() {
    if (!p) return;
    mudar((e) => { const [e2, ped] = irParaProducao(registrarCliente(e, p), p); return salvarPedido(e2, ped); });
    notify(`Comanda ${p.mesa} enviada para a cozinha.`); definirAtivo(null);
  }
  const novos = !!p && p.itens.some((i) => !p.enviados?.includes(i.id));

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-surface px-3 py-2.5">
        <Link to="/sorveteria" className="rounded-lg p-2 hover:bg-slate-100" aria-label="Voltar ao PDV"><ArrowLeft size={18} aria-hidden /></Link>
        <h1 className="flex-1 text-base font-extrabold">🍽 Garçom</h1>
        {mesa && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Comanda {mesa}</span>}
      </header>

      {!mesa ? (
        <main className="p-4">
          <p className="mb-3 text-sm text-slate-600">Escolha a comanda da mesa.{!caixaAberto(estado) && <b className="ml-1 text-red-600">Caixa fechado: peça para abrir no PDV.</b>}</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {Array.from({ length: estado.loja.comandas }, (_, k) => String(k + 1)).map((n) => {
              const o = abertas.find((x) => x.mesa === n);
              return (
                <button key={n} type="button" onClick={() => abrirMesa(n)} className={`flex min-h-[5.5rem] flex-col items-center justify-center rounded-2xl border-2 ${o ? "border-amber-400 bg-amber-50 text-amber-950" : "border-slate-200"}`}>
                  <b className="text-2xl">{n}</b><span className="num text-xs">{o ? brl(totalPedido(o, estado.loja.gorjetaPct)) : "livre"}</span>
                </button>
              );
            })}
          </div>
        </main>
      ) : (
        <main className="space-y-3 p-3 pb-28">
          <input className="input" type="search" placeholder="Buscar produto" aria-label="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="flex gap-2 overflow-x-auto" role="tablist">
            {[{ id: "", nome: "Todos", emoji: "✨" }, ...estado.categorias].map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${cat === c.id ? "border-modulo bg-modulo text-white" : "border-slate-200 bg-surface"}`}>{c.emoji} {c.nome}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {produtos.map((x) => (
              <button key={x.id} type="button" disabled={x.esgotado} onClick={() => escolher(x)} className="flex min-h-[6rem] flex-col justify-between rounded-2xl border border-slate-200 bg-surface p-3 text-left shadow-card disabled:opacity-45">
                <span className="text-2xl" aria-hidden>{estado.categorias.find((c) => c.id === x.categoria_id)?.emoji}</span>
                <span><b className="block text-sm leading-tight">{x.nome}</b><span className="num text-sm text-slate-500">{x.esgotado ? "Em falta" : brl(x.preco)}</span></span>
              </button>
            ))}
          </div>
          <Card className="p-3">
            <h2 className="mb-2 text-sm font-bold">Comanda {mesa} · {brl(p ? totalPedido(p, estado.loja.gorjetaPct) : 0)}</h2>
            {p?.itens.map((i) => {
              const enviado = p.enviados?.includes(i.id);
              return (
                <div key={i.id} className="flex items-center gap-2 py-1 text-sm">
                  <span className="min-w-0 flex-1">{i.pesoG != null ? `${i.pesoG} g ` : `${i.qtd}× `}{i.nome} <span className="text-xs text-slate-500">{[i.sabores.join(", "), i.complementos.map((c) => c.nome).join(", ")].filter(Boolean).join(" · ")}</span>{enviado && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-bold">enviado</span>}</span>
                  <button type="button" aria-label={`Remover ${i.nome}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    onClick={() => enviado ? notify("Item já enviado: peça ao caixa para cancelar.", "erro") : mudar((e) => salvarPedido(e, { ...p, itens: p.itens.filter((x) => x.id !== i.id) }))}><Trash2 size={16} aria-hidden /></button>
                </div>
              );
            })}
            {!p?.itens.length && <p className="text-sm text-slate-500">Sem itens.</p>}
          </Card>
          <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-slate-200 bg-surface p-3">
            <Button type="button" variant="secondary" onClick={voltar}>← Comandas</Button>
            <Button type="button" variant="secondary" disabled={!!p?.pediuConta} onClick={() => p && mudar((e) => salvarPedido(e, { ...p, pediuConta: true }))}><Receipt size={16} aria-hidden /> {p?.pediuConta ? "Conta pedida" : "Pedir conta"}</Button>
            <Button type="button" className="flex-1" disabled={!novos} onClick={lancar}><Send size={16} aria-hidden /> Lançar na cozinha</Button>
          </div>
        </main>
      )}
      {montando && <MontarItem produto={montando} estado={estado} onConfirmar={(i) => { adicionar(i); setMontando(null); }} onClose={() => setMontando(null)} />}
    </div>
  );
}
