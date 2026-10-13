// Autoatendimento (erp.myfrost.ai/sorveteria/totem): o cliente monta o pedido sozinho, recebe uma senha e paga no caixa.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";
import { MontarItem } from "@/components/sorveteria/MontarItem";
import { brl } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useUnidade } from "@/lib/unidade";
import { caixaAberto, novoId, novoPedido, numerar, r2, salvarPedido, totalItem, usarLoja, useSorveteria, type ItemPedido, type ProdutoMenu } from "@/lib/sorveteria";

export default function SorveteriaTotem() {
  const { padrao } = useUnidade();
  usarLoja(padrao ?? "padrao");
  const { estado, mudar } = useSorveteria();
  const [cart, setCart] = useState<ItemPedido[]>([]);
  const [cat, setCat] = useState("");
  const [senha, setSenha] = useState<number | null>(null);
  const [montando, setMontando] = useState<ProdutoMenu | null>(null);
  useEffect(() => {
    const raiz = document.documentElement, antes = raiz.dataset.modulo;
    raiz.dataset.modulo = "vendas";
    return () => { raiz.dataset.modulo = antes ?? ""; };
  }, []);
  useEffect(() => { if (senha == null) return; const t = setTimeout(() => setSenha(null), 9000); return () => clearTimeout(t); }, [senha]);

  const produtos = estado.produtos.filter((p) => p.ativo && p.tipo === "unidade" && (!cat || p.categoria_id === cat));
  const sub = r2(cart.reduce((s, i) => s + totalItem(i), 0)), qtd = cart.reduce((s, i) => s + i.qtd, 0);

  function escolher(p: ProdutoMenu) {
    if (p.esgotado) return;
    if (p.sabores > 0 || p.grupos.length > 0) return setMontando(p);
    setCart((c) => [...c, { id: novoId(), produto_id: p.id, nome: p.nome, qtd: 1, unit: p.preco, sabores: [], complementos: [], saborIds: [], complementoIds: [] }]);
  }
  function finalizar() {
    if (!caixaAberto(estado)) return notify("Caixa fechado. Chame um atendente.", "erro");
    let numero = 0;
    mudar((e) => { const [e2, p] = numerar(e, { ...novoPedido(e, "Totem"), itens: cart, totem: true }); numero = p.numero; return salvarPedido(e2, p); });
    setCart([]); setSenha(numero);
  }

  if (senha != null) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas p-6 text-center text-fg">
        <div><div className="text-6xl">🎉</div><h1 className="mt-2 text-3xl font-extrabold">Pedido registrado!</h1><p className="mt-4 text-slate-500">Sua senha</p>
          <p className="text-[8rem] font-extrabold leading-none text-modulo-texto">{senha}</p><p className="mt-4 text-xl">Pague no caixa informando a senha.<br />Chamaremos quando estiver pronto.</p></div>
      </div>
    );
  }
  return (
    <div className="mx-auto min-h-screen max-w-5xl bg-canvas p-4 pb-32 text-fg">
      <header className="mb-3 flex items-center gap-3"><Link to="/sorveteria" className="rounded-lg p-2 hover:bg-slate-100" aria-label="Voltar ao PDV"><ArrowLeft aria-hidden /></Link><h1 className="flex-1 text-3xl font-extrabold">🍨 {estado.loja.nome}</h1><span className="text-slate-500">Toque para pedir</span></header>
      <div className="mb-3 flex gap-2 overflow-x-auto" role="tablist">
        {[{ id: "", nome: "Tudo", emoji: "✨" }, ...estado.categorias].map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)} className={`shrink-0 rounded-full border px-5 py-3 text-lg font-semibold ${cat === c.id ? "border-modulo bg-modulo text-white" : "border-slate-200 bg-surface"}`}>{c.emoji} {c.nome}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {produtos.map((p) => (
          <button key={p.id} type="button" disabled={p.esgotado} onClick={() => escolher(p)} className="flex min-h-[9rem] flex-col justify-between rounded-2xl border border-slate-200 bg-surface p-4 text-left shadow-card active:scale-[0.98] disabled:opacity-45">
            <span className="text-5xl" aria-hidden>{estado.categorias.find((c) => c.id === p.categoria_id)?.emoji}</span>
            <span><b className="block text-lg leading-tight">{p.nome}</b><span className="num text-lg">{p.esgotado ? "Em falta" : brl(p.preco)}</span></span>
          </button>
        ))}
      </div>
      {qtd > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-surface p-3">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="flex-1"><b>{qtd} {qtd === 1 ? "item" : "itens"}</b> <span className="num text-2xl font-extrabold">{brl(sub)}</span></div>
            <Button type="button" variant="secondary" className="!min-h-[56px] text-lg" onClick={() => setCart([])}>Limpar</Button>
            <Button type="button" className="!min-h-[56px] text-lg" onClick={finalizar}>Finalizar pedido</Button>
          </div>
        </div>
      )}
      {montando && <MontarItem produto={montando} estado={estado} onConfirmar={(i) => { setCart((c) => [...c, i]); setMontando(null); }} onClose={() => setMontando(null)} />}
    </div>
  );
}
