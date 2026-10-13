// PDV da sorveteria (erp.myfrost.ai/sorveteria): tela própria, feita para toque e teclado.
// Balcão, comanda, delivery e retirada; sabores e complementos; self-service por peso; fila de produção;
// caixa com sangria e fechamento; relatório. Veja src/lib/sorveteria.ts para as regras e onde os dados ficam.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, BarChart3, Bike, ChefHat, ClipboardList, DollarSign, Globe, IceCreamCone, Minus, Package, Pencil, Plus, Printer, Receipt, Search, Send, Star, Store, Trash2, Wallet,
} from "lucide-react";
import { Button, Card, Field, Modal } from "@/components/ui";
import { MontarItem } from "@/components/sorveteria/MontarItem";
import { Cobranca } from "@/components/sorveteria/Cobranca";
import { Producao } from "@/components/sorveteria/Producao";
import { CaixaTela } from "@/components/sorveteria/CaixaTela";
import { CardapioTela } from "@/components/sorveteria/CardapioTela";
import { Relatorio } from "@/components/sorveteria/Relatorio";
import { PedidosOnline, useOnline } from "@/components/sorveteria/PedidosOnline";
import { Entregas } from "@/components/sorveteria/Entregas";
import { Clientes } from "@/components/sorveteria/Clientes";
import { Estoque } from "@/components/sorveteria/Estoque";
import { Financeiro } from "@/components/sorveteria/Financeiro";
import { pedidoDoOnline, publicarCardapio, slugValido, cardapioPublicavel, type PedidoOnline } from "@/lib/sorveteriaOnline";
import { brl, digitos } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { useUnidade } from "@/lib/unidade";
import { imprimirCupom } from "@/lib/sorveteriaCupom";
import {
  CANAIS, caixaAberto, clientePorTel, cupomValida, descontoPedido, definirAtivo, gorjetaPedido, insumosBaixos, novoId, pedidoAtivo, qtdItens, r2, salvarPedido, subtotalPedido,
  totalItem, totalPedido, usarLoja, useSorveteria, type Canal, type Cliente, type Estado, type ItemPedido, type Pagamento, type Pedido, type ProdutoMenu,
} from "@/lib/sorveteria";
import { comAtivo, irParaProducao, pagarPedido, registrarCliente, validarPedido } from "@/lib/sorveteriaAcoes";

type Aba = "vender" | "comandas" | "producao" | "online" | "entregas" | "clientes" | "estoque" | "financeiro" | "caixa" | "cardapio" | "relatorio";
const ABAS: { id: Aba; rotulo: string; icone: typeof Store }[] = [
  { id: "vender", rotulo: "Vender", icone: IceCreamCone }, { id: "comandas", rotulo: "Comandas", icone: ClipboardList },
  { id: "producao", rotulo: "Produção", icone: ChefHat }, { id: "online", rotulo: "Online", icone: Globe }, { id: "entregas", rotulo: "Entregas", icone: Bike },
  { id: "clientes", rotulo: "Clientes", icone: Star }, { id: "estoque", rotulo: "Estoque", icone: Package }, { id: "financeiro", rotulo: "Financeiro", icone: DollarSign }, { id: "caixa", rotulo: "Caixa", icone: Wallet },
  { id: "cardapio", rotulo: "Cardápio", icone: Store }, { id: "relatorio", rotulo: "Relatório", icone: BarChart3 },
];
const CLIENTE_VAZIO: Cliente = { nome: "", telefone: "", endereco: "", bairro: "", referencia: "" };
const precisaMontar = (p: ProdutoMenu) => p.sabores > 0 || p.grupos.length > 0 || p.tipo === "peso";
const num = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) ? v : 0; };

export default function Sorveteria() {
  const { nome: operador } = usePerfil();
  const { padrao } = useUnidade();
  usarLoja(padrao ?? "padrao");
  const { estado, mudar } = useSorveteria();
  const [aba, setAba] = useState<Aba>("vender");
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [montando, setMontando] = useState<{ produto: ProdutoMenu; item?: ItemPedido } | null>(null);
  const [cobrando, setCobrando] = useState<Pedido | null>(null);
  const [escolhendoMesa, setEscolhendoMesa] = useState(false);
  const [concluido, setConcluido] = useState<{ pedido: Pedido; troco: number } | null>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  const caixa = caixaAberto(estado);
  const online = useOnline(estado.loja.slug ?? "");
  const ativo = pedidoAtivo(estado);
  const pct = estado.loja.gorjetaPct;

  // tela própria: cor da área e título da aba
  useEffect(() => {
    const raiz = document.documentElement, antes = raiz.dataset.modulo, titulo = document.title;
    raiz.dataset.modulo = "vendas"; document.title = "PDV Sorveteria · ERP Line";
    return () => { raiz.dataset.modulo = antes ?? ""; document.title = titulo; };
  }, []);

  const produtos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return estado.produtos.filter((p) => p.ativo && (!categoria || p.categoria_id === categoria) && (!q || p.nome.toLowerCase().includes(q)));
  }, [estado.produtos, categoria, busca]);

  // ---------------------------------------------------------------- ações do pedido
  const mexer = (f: (p: Pedido) => Pedido) => mudar((e) => { const [e2, p] = comAtivo(e, operador); return salvarPedido(e2, f(p)); });

  function adicionar(item: ItemPedido) {
    mexer((p) => {
      const simples = !item.sabores.length && !item.complementos.length && !item.obs && item.pesoG == null;
      const igual = simples && p.itens.find((i) => i.produto_id === item.produto_id && !i.sabores.length && !i.complementos.length && !i.obs && i.pesoG == null && !p.enviados?.includes(i.id));
      return { ...p, itens: igual ? p.itens.map((i) => i === igual ? { ...i, qtd: i.qtd + item.qtd } : i) : [...p.itens, item] };
    });
  }
  function escolherProduto(prod: ProdutoMenu) {
    if (!caixa) return notify("Abra o caixa para vender.", "erro");
    if (prod.esgotado) return notify(`${prod.nome} está em falta.`, "erro");
    if (precisaMontar(prod)) return setMontando({ produto: prod });
    adicionar({ id: novoId(), produto_id: prod.id, nome: prod.nome, qtd: 1, unit: prod.preco, sabores: [], complementos: [], saborIds: [], complementoIds: [] });
  }
  function salvarMontado(item: ItemPedido) {
    if (montando?.item) mexer((p) => ({ ...p, itens: p.itens.map((i) => i.id === item.id ? item : i) }));
    else adicionar(item);
    setMontando(null);
  }
  const alterarQtd = (id: string, d: number) => mexer((p) => ({ ...p, itens: p.itens.map((i) => i.id === id ? { ...i, qtd: Math.max(1, i.qtd + d) } : i) }));
  const removerItem = (id: string) => mexer((p) => ({ ...p, itens: p.itens.filter((i) => i.id !== id) }));
  function trocarCanal(canal: Canal) {
    mexer((p) => ({ ...p, canal, gorjeta: canal === "mesa" ? p.gorjeta : false, taxaEntrega: canal === "delivery" ? p.taxaEntrega : 0, mesa: canal === "mesa" ? p.mesa : undefined,
      cliente: canal === "delivery" || canal === "retirada" ? p.cliente ?? { ...CLIENTE_VAZIO } : p.cliente }));
    if (canal === "mesa" && !ativo?.mesa) setEscolhendoMesa(true);
  }
  const alterarCliente = (c: Partial<Cliente>) => mexer((p) => ({ ...p, cliente: { ...(p.cliente ?? CLIENTE_VAZIO), ...c } }));

  /** Ao digitar o telefone de quem já pediu, traz o cadastro do cliente (CRM). */
  function telefoneDigitado(tel: string) {
    const antigo = clientePorTel(estado, tel);
    mexer((p) => {
      const c = p.cliente ?? CLIENTE_VAZIO;
      if (antigo && !c.nome && !c.endereco) {
        const taxa = estado.loja.bairros.find((b) => b.nome === antigo.bairro)?.taxa;
        return { ...p, resgate: false, cliente: { nome: antigo.nome, telefone: tel, endereco: antigo.end, bairro: antigo.bairro, referencia: antigo.ref }, taxaEntrega: p.canal === "delivery" ? (taxa ?? p.taxaEntrega) : p.taxaEntrega };
      }
      return { ...p, resgate: false, cliente: { ...c, telefone: tel, ...(antigo && p.canal !== "delivery" && p.canal !== "retirada" ? { nome: antigo.nome } : {}) } };
    });
  }
  function aplicarCupom(cod: string) {
    if (!cod.trim()) return mexer((p) => ({ ...p, cupom: null }));
    const p = comAtivo(estado, operador)[1];
    const r = cupomValida(estado, cod, subtotalPedido(p));
    if ("erro" in r) return notify(r.erro, "erro");
    mexer((x) => ({ ...x, cupom: r.c.cod })); notify("Cupom aplicado.");
  }
  function escolherBairro(nome: string) {
    const b = estado.loja.bairros.find((x) => x.nome === nome);
    mexer((p) => ({ ...p, cliente: { ...(p.cliente ?? CLIENTE_VAZIO), bairro: nome }, taxaEntrega: b ? b.taxa : p.taxaEntrega }));
  }

  function escolherMesa(numero: string) {
    setEscolhendoMesa(false);
    mudar((e) => {
      const [e2, p] = comAtivo(e, operador);
      const existente = e2.pedidos.find((x) => x.id !== p.id && x.situacao === "aberto" && x.canal === "mesa" && x.mesa === numero);
      if (!existente) return salvarPedido(e2, { ...p, canal: "mesa", mesa: numero });
      // comanda já aberta: o que estava no carrinho vai para ela
      const unida = { ...existente, itens: [...existente.itens, ...p.itens] };
      definirAtivo(unida.id);
      return salvarPedido({ ...e2, pedidos: e2.pedidos.filter((x) => x.id !== p.id) }, unida);
    });
  }

  // ---------------------------------------------------------------- produção e cobrança
  function lancarComanda() {
    if (!ativo) return;
    const erro = validarPedido(estado, ativo); if (erro) return notify(erro, "erro");
    if (!ativo.itens.some((i) => !ativo.enviados?.includes(i.id))) return notify("Não há itens novos para enviar.", "erro");
    mudar((e) => { const [e2, p] = irParaProducao(registrarCliente(e, ativo), ativo); return salvarPedido(e2, p); });
    definirAtivo(null);
    notify(`Comanda ${ativo.mesa} enviada para a produção.`);
  }
  function cobrar() {
    if (!ativo) return;
    const erro = validarPedido(estado, ativo); if (erro) return notify(erro, "erro");
    setCobrando(ativo);
  }
  function naEntrega() {
    if (!cobrando) return;
    const base = cobrando;
    mudar((e) => { const [e2, p] = irParaProducao(registrarCliente(e, base), { ...base, pagarNaEntrega: true }); return salvarPedido(e2, p); });
    if (pedidoAtivo(estado)?.id === base.id) definirAtivo(null);
    notify("Pedido enviado. Cobrar quando entregar.");
    setCobrando(null);
  }
  function confirmarPagamento(pagamentos: Pagamento[], troco: number) {
    if (!cobrando) return;
    const base = cobrando;
    let final!: Pedido;
    mudar((e) => { const [e2, p] = pagarPedido(e, base, pagamentos, troco); final = p; return e2; });
    if (pedidoAtivo(estado)?.id === base.id) definirAtivo(null);
    setCobrando(null);
    if (estado.loja.imprimirAuto) imprimirCupom(final, estado.loja);
    setConcluido({ pedido: final, troco });
  }
  function descartar() {
    if (!ativo) return;
    if (ativo.itens.length && !window.confirm("Descartar este pedido?")) return;
    mudar((e) => ({ ...e, pedidos: e.pedidos.filter((p) => p.id !== ativo.id || !!p.numero) }));
    definirAtivo(null);
  }

  // cardápio online: republica sozinho quando algo muda (sabor em falta, preço, loja aberta/fechada)
  const retrato = estado.loja.slug && slugValido(estado.loja.slug) ? JSON.stringify([cardapioPublicavel(estado), estado.loja.nome, estado.loja.telefone, estado.loja.online, estado.loja.pedidoMinimo]) : "";
  useEffect(() => {
    if (!retrato) return;
    const t = setTimeout(() => publicarCardapio(estado).catch((e) => notifyError(e)), 1500);
    return () => clearTimeout(t);
  }, [retrato]); // eslint-disable-line react-hooks/exhaustive-deps

  function aceitarOnline(o: PedidoOnline) {
    mudar((e) => {
      if (e.pedidos.some((x) => x.id === o.id)) return e;
      const base = pedidoDoOnline(o, operador, caixaAberto(e)?.id);
      const [e2, p] = irParaProducao(registrarCliente(e, base), base);
      return salvarPedido(e2, p);
    });
    notify(`Pedido online ${o.codigo} enviado para a produção.`);
  }

  // atalhos: F2 cobra, / busca
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (aba !== "vender" || montando || cobrando || escolhendoMesa || concluido) return;
      if (ev.key === "F2") { ev.preventDefault(); cobrar(); }
      else if (ev.key === "/" && document.activeElement?.tagName !== "INPUT") { ev.preventDefault(); campoBusca.current?.focus(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const naFila = estado.pedidos.filter((p) => p.situacao !== "cancelado" && (p.producao === "novo" || p.producao === "preparando")).length;
  const comandasAbertas = estado.pedidos.filter((p) => p.situacao === "aberto" && p.canal === "mesa" && p.itens.length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-5">
          <Link to="/" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"><ArrowLeft size={16} aria-hidden /> ERP</Link>
          <h1 className="flex items-center gap-2 text-base font-extrabold"><IceCreamCone size={20} className="text-modulo-texto" aria-hidden /> {estado.loja.nome}</h1>
          <nav className="order-last flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto sm:flex-1" aria-label="Telas do PDV">
            {ABAS.map(({ id, rotulo, icone: I }) => (
              <button key={id} type="button" aria-current={aba === id ? "page" : undefined} onClick={() => setAba(id)}
                className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${aba === id ? "bg-modulo text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <I size={16} aria-hidden /> {rotulo}
                {id === "producao" && naFila > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] text-white">{naFila}</span>}
                {id === "online" && online.novos > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] text-white">{online.novos}</span>}
                {id === "estoque" && insumosBaixos(estado).length > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] text-white">!</span>}
                {id === "comandas" && comandasAbertas.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] text-white">{comandasAbertas.length}</span>}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-600">
            {[["garcom", "Garçom"], ["totem", "Totem"], ["painel", "Painel TV"]].map(([r, t]) => <a key={r} href={`/sorveteria/${r}`} target="_blank" rel="noreferrer" className="rounded-lg px-2 py-1.5 hover:bg-slate-100">{t} ↗</a>)}
          </div>
          <button type="button" onClick={() => setAba("caixa")} className={`rounded-full px-3 py-1 text-xs font-bold ${caixa ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
            {caixa ? "Caixa aberto" : "Caixa fechado"}
          </button>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-5">
        {aba === "vender" && (
          <div className="grid items-start gap-4 lg:grid-cols-[1fr_25rem]">
            <section aria-label="Cardápio" className="min-w-0 space-y-3">
              {!caixa && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  O caixa está fechado. <Button type="button" className="!py-1" onClick={() => setAba("caixa")}>Abrir caixa</Button>
                </div>
              )}
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                <input ref={campoBusca} className="input pl-9" placeholder="Buscar produto ( / )" aria-label="Buscar produto" value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && produtos[0]) { escolherProduto(produtos[0]); setBusca(""); } }} />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorias">
                {[{ id: "", nome: "Todos", emoji: "✨" }, ...estado.categorias].map((c) => (
                  <button key={c.id} type="button" role="tab" aria-selected={categoria === c.id} onClick={() => setCategoria(c.id)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${categoria === c.id ? "border-modulo bg-modulo text-white" : "border-slate-200 bg-surface hover:border-modulo"}`}>{c.emoji} {c.nome}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {produtos.map((p) => (
                  <button key={p.id} type="button" onClick={() => escolherProduto(p)} disabled={p.esgotado}
                    className="flex min-h-[7rem] flex-col justify-between rounded-2xl border border-slate-200 bg-surface p-3 text-left shadow-card transition hover:border-modulo hover:shadow-pop active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45">
                    <span className="text-2xl" aria-hidden>{estado.categorias.find((c) => c.id === p.categoria_id)?.emoji}</span>
                    <span>
                      <span className="block text-sm font-bold leading-tight">{p.nome}</span>
                      <span className="num block text-sm text-slate-500">{p.esgotado ? <b className="text-red-600">Em falta</b> : p.tipo === "peso" ? `${brl(p.preco)} / kg` : brl(p.preco)}</span>
                    </span>
                  </button>
                ))}
                {produtos.length === 0 && <p className="col-span-full p-8 text-center text-sm text-slate-500">Nenhum produto. Cadastre em <button type="button" className="font-semibold underline" onClick={() => setAba("cardapio")}>Cardápio</button>.</p>}
              </div>
            </section>

            <Carrinho
              estado={estado} pedido={ativo} onCanal={trocarCanal} onMesa={() => setEscolhendoMesa(true)}
              onQtd={alterarQtd} onRemover={removerItem} onEditar={(i) => { const prod = estado.produtos.find((x) => x.id === i.produto_id); if (prod) setMontando({ produto: prod, item: i }); }}
              onCampo={(p) => mexer((x) => ({ ...x, ...p }))} onCliente={alterarCliente} onTelefone={telefoneDigitado} onBairro={escolherBairro}
              onLancar={lancarComanda} onCobrar={cobrar} onDescartar={descartar} pct={pct} onCupom={aplicarCupom}
            />
          </div>
        )}

        {aba === "comandas" && (
          <Comandas estado={estado} aoAbrir={(p) => { definirAtivo(p.id); setAba("vender"); }}
            aoNova={(n) => { definirAtivo(null); mudar((e) => { const [e2, p] = comAtivo(e, operador); return salvarPedido(e2, { ...p, canal: "mesa", mesa: n }); }); setAba("vender"); }}
            aoCobrar={(p) => { definirAtivo(p.id); setCobrando(p); }}
            aoDescartar={(p) => { if (window.confirm("Descartar este pedido do totem?")) mudar((e) => ({ ...e, pedidos: e.pedidos.filter((x) => x.id !== p.id) })); }} />
        )}
        {aba === "entregas" && <Entregas estado={estado} mudar={mudar} />}
        {aba === "clientes" && <Clientes estado={estado} mudar={mudar} />}
        {aba === "estoque" && <Estoque estado={estado} mudar={mudar} />}
        {aba === "financeiro" && <Financeiro estado={estado} mudar={mudar} />}
        {aba === "online" && <PedidosOnline estado={estado} online={online} onAceitar={aceitarOnline} />}
        {aba === "producao" && <Producao estado={estado} mudar={mudar} onReceber={(p) => setCobrando(p)} />}
        {aba === "caixa" && <CaixaTela estado={estado} mudar={mudar} operador={operador} />}
        {aba === "cardapio" && <CardapioTela estado={estado} mudar={mudar} />}
        {aba === "relatorio" && <Relatorio estado={estado} mudar={mudar} />}
      </main>

      {montando && <MontarItem key={montando.item?.id ?? montando.produto.id} produto={montando.produto} estado={estado} inicial={montando.item} onConfirmar={salvarMontado} onClose={() => setMontando(null)} />}
      {cobrando && <Cobranca pedido={cobrando} estado={estado} onClose={() => setCobrando(null)} onConfirmar={confirmarPagamento}
        onNaEntrega={cobrando.canal === "delivery" && !cobrando.pagarNaEntrega ? naEntrega : undefined} />}

      <Modal open={escolhendoMesa} onClose={() => setEscolhendoMesa(false)} title="Qual comanda?">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {Array.from({ length: estado.loja.comandas }, (_, k) => String(k + 1)).map((n) => {
            const ocupada = comandasAbertas.some((p) => p.mesa === n);
            return (
              <button key={n} type="button" onClick={() => escolherMesa(n)}
                className={`rounded-xl border py-3 text-lg font-bold ${ocupada ? "border-amber-400 bg-amber-50 text-amber-900" : "border-slate-200 hover:border-modulo"}`}>{n}</button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">Em amarelo: comanda aberta. Escolher uma delas soma o carrinho a ela.</p>
      </Modal>

      <Modal open={!!concluido} onClose={() => setConcluido(null)} title="Venda concluída">
        {concluido && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-slate-600">Pedido <b>#{concluido.pedido.numero}</b> · {brl(totalPedido(concluido.pedido, pct))}{!!concluido.pedido.pontosGanhos && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">+{concluido.pedido.pontosGanhos} pts</span>}</p>
            {concluido.troco > 0 && <p className="rounded-2xl bg-emerald-50 p-4 text-emerald-800"><span className="block text-sm font-semibold">Troco</span><b className="num text-4xl">{brl(concluido.troco)}</b></p>}
            <div className="flex justify-center gap-2">
              <Button type="button" variant="secondary" onClick={() => imprimirCupom(concluido.pedido, estado.loja)}><Printer size={16} aria-hidden /> Imprimir</Button>
              <Button type="button" autoFocus onClick={() => setConcluido(null)}>Novo pedido</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------- carrinho
function Carrinho({ estado, pedido, pct, onCanal, onMesa, onQtd, onRemover, onEditar, onCampo, onCliente, onTelefone, onBairro, onLancar, onCobrar, onDescartar, onCupom }: {
  estado: Estado; pedido: Pedido | null; pct: number;
  onCanal: (c: Canal) => void; onMesa: () => void; onQtd: (id: string, d: number) => void; onRemover: (id: string) => void; onEditar: (i: ItemPedido) => void;
  onCampo: (p: Partial<Pedido>) => void; onCliente: (c: Partial<Cliente>) => void; onTelefone: (t: string) => void; onBairro: (b: string) => void;
  onLancar: () => void; onCobrar: () => void; onDescartar: () => void; onCupom: (cod: string) => void;
}) {
  const canal = pedido?.canal ?? "balcao";
  const itens = pedido?.itens ?? [];
  const total = pedido ? totalPedido(pedido, pct) : 0;
  const cli = pedido?.cliente ?? CLIENTE_VAZIO;
  const novosNaComanda = pedido ? itens.some((i) => !pedido.enviados?.includes(i.id)) : false;

  return (
    <Card className="flex flex-col p-0 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)]">
      <div className="grid grid-cols-5 gap-1 border-b border-slate-100 p-1.5" role="group" aria-label="Tipo de pedido">
        {CANAIS.map((c) => (
          <button key={c.id} type="button" aria-pressed={canal === c.id} onClick={() => onCanal(c.id)}
            className={`rounded-lg py-2 text-[11px] font-bold ${canal === c.id ? "bg-modulo text-white" : "text-slate-600 hover:bg-slate-100"}`}>{c.rotulo}</button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {canal === "mesa" && (
          <button type="button" onClick={onMesa} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:border-modulo">
            <span className="text-sm text-slate-500">Comanda</span><b className="text-lg">{pedido?.mesa ?? "Escolher"}</b>
          </button>
        )}
        {(canal === "delivery" || canal === "retirada") && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Telefone"><input className="input" inputMode="tel" value={cli.telefone} onChange={(e) => onTelefone(e.target.value)} /></Field>
            <Field label="Nome"><input className="input" value={cli.nome} onChange={(e) => onCliente({ nome: e.target.value })} /></Field>
            {canal === "delivery" && (
              <>
                <Field label="Bairro" className="col-span-2">
                  <select className="input" value={cli.bairro} onChange={(e) => onBairro(e.target.value)}>
                    <option value="">Outro / sem taxa cadastrada</option>
                    {estado.loja.bairros.filter((b) => b.nome).map((b) => <option key={b.nome} value={b.nome}>{b.nome} · {brl(b.taxa)}</option>)}
                  </select>
                </Field>
                <Field label="Endereço" className="col-span-2"><input className="input" value={cli.endereco} onChange={(e) => onCliente({ endereco: e.target.value })} /></Field>
                <Field label="Referência"><input className="input" value={cli.referencia} onChange={(e) => onCliente({ referencia: e.target.value })} /></Field>
                <Field label="Taxa de entrega (R$)"><input className="input text-right" inputMode="decimal" value={pedido?.taxaEntrega ? String(pedido.taxaEntrega).replace(".", ",") : ""} placeholder="0"
                  onChange={(e) => onCampo({ taxaEntrega: r2(num(e.target.value.replace(/[^\d,.]/g, ""))) })} /></Field>
              </>
            )}
          </div>
        )}

        {canal === "mkt" && <Field label="Origem do pedido"><input className="input" placeholder="iFood, Rappi, 99Food…" value={pedido?.origem ?? ""} onChange={(e) => onCampo({ origem: e.target.value })} /></Field>}
        {(canal === "balcao" || canal === "mesa") && <Field label="Cliente (telefone) · fidelidade"><input className="input" inputMode="tel" placeholder="Opcional" value={cli.telefone} onChange={(e) => onTelefone(e.target.value)} /></Field>}
        {(() => {
          const c = pedido?.cliente?.telefone ? clientePorTel(estado, pedido.cliente.telefone) : undefined;
          if (!c || !estado.loja.fid.ativo || !pedido) return null;
          return (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
              <span className="flex-1">⭐ <b>{c.nome}</b> · {c.pontos} pts</span>
              {c.pontos >= estado.loja.fid.resgatePts && <Button type="button" variant="secondary" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => onCampo({ resgate: !pedido.resgate })}>{pedido.resgate ? "Cancelar resgate" : `Resgatar (− ${brl(estado.loja.fid.resgateR)})`}</Button>}
            </div>
          );
        })()}
        {itens.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Toque nos produtos para montar o pedido.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {itens.map((i) => {
              const enviado = pedido?.enviados?.includes(i.id);
              return (
                <li key={i.id} className="py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <b className="text-sm">{i.pesoG != null ? `${i.nome} · ${i.pesoG} g` : i.nome}</b>{enviado && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-500">ENVIADO</span>}
                      {i.sabores.length > 0 && <p className="text-xs text-slate-600">{i.sabores.join(", ")}</p>}
                      {i.complementos.length > 0 && <p className="text-xs text-slate-500">+ {i.complementos.map((c) => c.nome).join(", ")}</p>}
                      {i.obs && <p className="text-xs font-semibold text-amber-800">Obs: {i.obs}</p>}
                    </div>
                    <b className="num text-sm">{brl(totalItem(i))}</b>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    {i.pesoG == null && (
                      <>
                        <button type="button" aria-label={`Menos ${i.nome}`} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50" onClick={() => onQtd(i.id, -1)}><Minus size={14} aria-hidden /></button>
                        <b className="w-7 text-center text-sm">{i.qtd}</b>
                        <button type="button" aria-label={`Mais ${i.nome}`} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50" onClick={() => onQtd(i.id, 1)}><Plus size={14} aria-hidden /></button>
                      </>
                    )}
                    <span className="flex-1" />
                    {(i.sabores.length > 0 || i.complementos.length > 0 || i.pesoG != null || i.obs) && (
                      <button type="button" aria-label={`Editar ${i.nome}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => onEditar(i)}><Pencil size={15} aria-hidden /></button>
                    )}
                    <button type="button" aria-label={`Remover ${i.nome}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={() => onRemover(i.id)}><Trash2 size={15} aria-hidden /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 p-3">
        <dl className="num space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal ({pedido ? qtdItens(pedido) : 0})</dt><dd>{brl(pedido ? subtotalPedido(pedido) : 0)}</dd></div>
          <CupomCampo valor={pedido?.cupom ?? ""} onAplicar={onCupom} />
          <div className="flex items-center justify-between gap-2">
            <dt>Desconto</dt>
            <dd className="relative">
              <input className="input w-20 py-1 pr-6 text-right" inputMode="decimal" aria-label="Desconto em %" placeholder="0" value={pedido?.descontoPct ? String(pedido.descontoPct).replace(".", ",") : ""}
                onChange={(e) => onCampo({ descontoPct: Math.min(100, Math.max(0, num(e.target.value.replace(/[^\d,.]/g, "")))) })} />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500" aria-hidden>%</span>
            </dd>
          </div>
          {pedido && descontoPedido(pedido) > 0 && <div className="flex justify-between text-xs text-slate-500"><dt>desconto aplicado{pedido.cupom ? ` (cupom ${pedido.cupom})` : ""}{pedido.resgate ? " (pontos)" : ""}</dt><dd>− {brl(descontoPedido(pedido))}</dd></div>}
          {canal === "delivery" && pedido && pedido.taxaEntrega > 0 && <div className="flex justify-between"><dt>Taxa de entrega</dt><dd>{brl(pedido.taxaEntrega)}</dd></div>}
          {canal === "mesa" && (
            <div className="flex items-center justify-between">
              <dt><label className="flex items-center gap-1.5"><input type="checkbox" checked={!!pedido?.gorjeta} onChange={(e) => onCampo({ gorjeta: e.target.checked })} /> Serviço {pct}%</label></dt>
              <dd>{pedido?.gorjeta ? brl(gorjetaPedido(pedido, pct)) : "—"}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2"><dt className="font-bold">Total</dt><dd className="text-3xl font-extrabold">{brl(total)}</dd></div>
        </dl>
        <div className="flex gap-2">
          {canal === "mesa" && <Button type="button" variant="secondary" className="flex-1 !py-3" disabled={!novosNaComanda} onClick={onLancar}><Send size={16} aria-hidden /> Lançar</Button>}
          <Button type="button" className="flex-[2] !py-3 text-base" disabled={itens.length === 0} onClick={onCobrar}><Receipt size={18} aria-hidden /> Cobrar <kbd className="ml-1 rounded bg-white/25 px-1 text-[10px]">F2</kbd></Button>
        </div>
        {pedido && !pedido.numero && itens.length > 0 && <button type="button" className="w-full text-xs font-semibold text-slate-500 hover:text-red-600" onClick={onDescartar}>Descartar pedido</button>}
      </div>
    </Card>
  );
}

function CupomCampo({ valor, onAplicar }: { valor: string; onAplicar: (cod: string) => void }) {
  const [txt, setTxt] = useState(valor);
  useEffect(() => setTxt(valor), [valor]);
  return (
    <div className="flex items-center justify-between gap-2">
      <dt>Cupom</dt>
      <dd className="flex gap-1">
        <input className="input w-28 py-1 uppercase" placeholder="CÓDIGO" aria-label="Cupom" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAplicar(txt); }} />
        <Button type="button" variant="secondary" className="!min-h-0 !px-2 !py-1 text-xs" onClick={() => onAplicar(txt)}>Aplicar</Button>
      </dd>
    </div>
  );
}

// ------------------------------------------------------------------- comandas
function Comandas({ estado, aoAbrir, aoNova, aoCobrar, aoDescartar }: { estado: Estado; aoAbrir: (p: Pedido) => void; aoNova: (n: string) => void; aoCobrar: (p: Pedido) => void; aoDescartar: (p: Pedido) => void }) {
  const abertas = estado.pedidos.filter((p) => p.situacao === "aberto" && p.canal === "mesa" && p.itens.length > 0);
  const [, tic] = useState(0);
  useEffect(() => { const t = setInterval(() => tic((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  const totem = estado.pedidos.filter((p) => p.situacao === "aberto" && p.totem);
  return (
    <div className="space-y-5">
    {totem.length > 0 && (
      <section aria-label="Totem">
        <h2 className="mb-2 text-sm font-bold">🖥 Totem: aguardando pagamento</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {totem.map((p) => (
            <div key={p.id} className="flex min-h-[6.5rem] flex-col justify-between rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-amber-950">
              <div><span className="text-xs">Senha</span><b className="block text-3xl">{p.numero}</b><span className="num text-sm font-bold">{brl(totalPedido(p, estado.loja.gorjetaPct))}</span></div>
              <div className="mt-2 flex gap-1">
                <button type="button" onClick={() => aoCobrar(p)} className="flex-1 rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-white hover:bg-amber-600">Cobrar</button>
                <button type="button" aria-label={`Descartar senha ${p.numero}`} onClick={() => aoDescartar(p)} className="rounded-lg px-2 text-xs font-bold hover:bg-amber-100">✕</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    )}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: estado.loja.comandas }, (_, k) => String(k + 1)).map((n) => {
        const p = abertas.find((x) => x.mesa === n);
        if (!p) {
          return <button key={n} type="button" onClick={() => aoNova(n)} className="flex min-h-[6.5rem] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-modulo hover:text-modulo-texto"><b className="text-3xl">{n}</b><span className="text-xs">livre</span></button>;
        }
        const min = Math.floor((Date.now() - new Date(p.criadoEm).getTime()) / 60000);
        return (
          <div key={n} className="flex min-h-[6.5rem] flex-col justify-between rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-amber-950">
            <button type="button" onClick={() => aoAbrir(p)} className="text-left">
              <b className="text-3xl">{n}</b>
              <span className="num block text-sm font-bold">{brl(totalPedido(p, estado.loja.gorjetaPct))}</span>
              <span className="block text-xs">{qtdItens(p)} itens · {min} min</span>
              {p.pediuConta && <span className="mt-1 inline-block rounded-full bg-red-600 px-2 text-[10px] font-bold text-white">pediu a conta</span>}
            </button>
            <button type="button" onClick={() => aoCobrar(p)} className="mt-2 rounded-lg bg-amber-500 py-1.5 text-xs font-bold text-white hover:bg-amber-600">Fechar conta</button>
          </div>
        );
      })}
    </div>
    </div>
  );
}
