// Cardápio online da sorveteria (/cardapio/<loja>), sem login: o cliente monta o pedido, escolhe entrega ou
// retirada e acompanha pelo código. O banco (sorv_pedir) confere sabores, complementos, taxa e preço.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, IceCreamCone, MapPin, MessageCircle, Minus, Plus, ShoppingBag, Trash2, XCircle } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { MontarItem } from "@/components/sorveteria/MontarItem";
import { supabase } from "@/lib/supabase";
import { brl, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { estadoInicial, r2, totalItem, type ItemPedido, type ProdutoMenu } from "@/lib/sorveteria";
import type { EnvioOnline, LojaPublica } from "@/lib/sorveteriaOnline";

const PAGAMENTOS = [["pix", "Pix"], ["dinheiro", "Dinheiro"], ["credito", "Cartão de crédito"], ["debito", "Cartão de débito"], ["vale", "Vale-refeição"]] as const;
const CLIENTE = { nome: "", telefone: "", endereco: "", bairro: "", referencia: "" };
const guardado = (slug: string) => { try { return localStorage.getItem(`cardapio:${slug}:codigo`); } catch { return null; } };

export default function CardapioPublico() {
  const slug = useLocation().pathname.split("/")[2] ?? "";
  const { data: loja, isLoading } = useQuery({
    queryKey: ["cardapio-publico", slug], retry: false, refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sorv_cardapio", { p_slug: slug });
      if (error) throw error;
      return data as LojaPublica | null;
    },
  });
  const [codigo, setCodigo] = useState<string | null>(() => guardado(slug));
  useEffect(() => {
    const raiz = document.documentElement, antes = raiz.dataset.modulo, titulo = document.title;
    raiz.dataset.modulo = "vendas"; document.title = loja ? `${loja.nome} · Cardápio` : "Cardápio";
    return () => { raiz.dataset.modulo = antes ?? ""; document.title = titulo; };
  }, [loja?.nome]);

  if (isLoading) return <p className="p-10 text-center text-slate-500">Carregando o cardápio…</p>;
  if (!loja) return <p className="p-10 text-center text-slate-600">Cardápio não encontrado. Confira o link com a sorveteria.</p>;
  if (codigo) return <Acompanhar slug={slug} loja={loja} codigo={codigo} aoNovo={() => { try { localStorage.removeItem(`cardapio:${slug}:codigo`); } catch { /* sem armazenamento */ } setCodigo(null); }} />;
  return <Cardapio slug={slug} loja={loja} aoEnviar={(c) => { try { localStorage.setItem(`cardapio:${slug}:codigo`, c); } catch { /* sem armazenamento */ } setCodigo(c); }} />;
}

function Cardapio({ slug, loja, aoEnviar }: { slug: string; loja: LojaPublica; aoEnviar: (codigo: string) => void }) {
  const c = loja.cardapio;
  // o seletor de sabores do PDV serve aqui: ele só precisa de sabores, grupos e produtos
  const estado = useMemo(() => ({ ...estadoInicial(), categorias: c.categorias, sabores: c.sabores, grupos: c.grupos, produtos: c.produtos }), [c]);
  const [categoria, setCategoria] = useState("");
  const [montando, setMontando] = useState<ProdutoMenu | null>(null);
  const [itens, setItens] = useState<ItemPedido[]>([]);
  const [carrinho, setCarrinho] = useState(false);

  const produtos = c.produtos.filter((p) => !categoria || p.categoria_id === categoria);
  const subtotal = r2(itens.reduce((s, i) => s + totalItem(i), 0));
  const qtd = itens.reduce((s, i) => s + i.qtd, 0);

  function adicionar(item: ItemPedido) { setItens((l) => [...l, item]); setMontando(null); }
  function escolher(p: ProdutoMenu) {
    if (!loja.aberta) return notify("A loja está fechada no momento.", "erro");
    if (p.esgotado) return;
    if (p.sabores > 0 || p.grupos.length > 0) return setMontando(p);
    adicionar({ id: Math.random().toString(36).slice(2), produto_id: p.id, nome: p.nome, qtd: 1, unit: p.preco, sabores: [], complementos: [], saborIds: [], complementoIds: [] });
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-canvas pb-28 text-fg">
      <header className="bg-modulo-escuro px-4 py-5 text-white">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><IceCreamCone aria-hidden /> {loja.nome}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm opacity-90">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${loja.aberta ? "bg-emerald-400/30" : "bg-red-400/40"}`}>{loja.aberta ? "Aberto agora" : "Fechado no momento"}</span>
          {loja.pedido_minimo > 0 && <span>Pedido mínimo {brl(loja.pedido_minimo)}</span>}
        </p>
      </header>

      <nav className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-slate-200 bg-surface px-4 py-3" aria-label="Categorias">
        {[{ id: "", nome: "Tudo", emoji: "✨" }, ...c.categorias.filter((x) => c.produtos.some((p) => p.categoria_id === x.id))].map((x) => (
          <button key={x.id} type="button" aria-pressed={categoria === x.id} onClick={() => setCategoria(x.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${categoria === x.id ? "border-modulo bg-modulo text-white" : "border-slate-200"}`}>{x.emoji} {x.nome}</button>
        ))}
      </nav>

      <ul className="space-y-2 p-4">
        {produtos.map((p) => (
          <li key={p.id}>
            <button type="button" disabled={p.esgotado} onClick={() => escolher(p)}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-3 text-left shadow-card active:scale-[0.99] disabled:opacity-45">
              <span className="text-3xl" aria-hidden>{c.categorias.find((x) => x.id === p.categoria_id)?.emoji}</span>
              <span className="min-w-0 flex-1">
                <b className="block">{p.nome}</b>
                <span className="text-sm text-slate-500">{p.esgotado ? <b className="text-red-600">Em falta</b> : p.sabores > 0 ? `${p.sabores} ${p.sabores === 1 ? "sabor" : "sabores"} à sua escolha` : " "}</span>
              </span>
              <b className="num">{brl(p.preco)}</b>
              <Plus size={18} className="text-modulo-texto" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      {qtd > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-surface p-3">
          <Button type="button" className="mx-auto flex w-full max-w-2xl !py-3.5 text-base" onClick={() => setCarrinho(true)}>
            <ShoppingBag size={18} aria-hidden /> Ver pedido · {qtd} {qtd === 1 ? "item" : "itens"} · {brl(subtotal)}
          </Button>
        </div>
      )}

      {montando && <MontarItem produto={montando} estado={estado} onConfirmar={adicionar} onClose={() => setMontando(null)} />}
      {carrinho && <Fechar slug={slug} loja={loja} itens={itens} subtotal={subtotal} onItens={setItens} onClose={() => setCarrinho(false)} onEnviado={aoEnviar} />}
    </div>
  );
}

function Fechar({ slug, loja, itens, subtotal, onItens, onClose, onEnviado }: {
  slug: string; loja: LojaPublica; itens: ItemPedido[]; subtotal: number; onItens: (f: (l: ItemPedido[]) => ItemPedido[]) => void; onClose: () => void; onEnviado: (codigo: string) => void;
}) {
  const bairros = loja.cardapio.loja.bairros;
  const [canal, setCanal] = useState<"delivery" | "retirada">("delivery");
  const [cli, setCli] = useState(CLIENTE);
  const [pag, setPag] = useState("pix");
  const [troco, setTroco] = useState("");
  const [obs, setObs] = useState("");
  const [cupom, setCupom] = useState("");
  const [enviando, setEnviando] = useState(false);
  const taxa = canal === "delivery" ? bairros.find((b) => b.nome === cli.bairro)?.taxa ?? 0 : 0;
  const falta = loja.pedido_minimo - subtotal;

  const mudarQtd = (id: string, d: number) => onItens((l) => l.map((i) => i.id === id ? { ...i, qtd: Math.max(1, i.qtd + d) } : i));
  async function enviar() {
    setEnviando(true);
    try {
      const corpo: EnvioOnline = {
        canal, pagamento: pag, observacoes: obs, cliente: cli, cupom: cupom.trim() || undefined,
        troco_para: pag === "dinheiro" && troco ? Number(troco.replace(",", ".")) || null : null,
        itens: itens.map((i) => ({ produto_id: i.produto_id, qtd: i.qtd, sabores: i.saborIds ?? [], complementos: i.complementoIds ?? [], obs: i.obs })),
      };
      const { data, error } = await supabase.rpc("sorv_pedir", { p_slug: slug, p: corpo });
      if (error) throw error;
      onEnviado((data as { codigo: string }).codigo);
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Seu pedido">
      <div className="space-y-4">
        {itens.length === 0 ? <p className="text-sm text-slate-500">Seu pedido está vazio.</p> : (
          <ul className="divide-y divide-slate-100">
            {itens.map((i) => (
              <li key={i.id} className="py-2.5">
                <div className="flex justify-between gap-2"><b className="text-sm">{i.nome}</b><b className="num text-sm">{brl(totalItem(i))}</b></div>
                {i.sabores.length > 0 && <p className="text-xs text-slate-600">{i.sabores.join(", ")}</p>}
                {i.complementos.length > 0 && <p className="text-xs text-slate-500">+ {i.complementos.map((x) => x.nome).join(", ")}</p>}
                <div className="mt-1 flex items-center gap-1">
                  <button type="button" aria-label={`Menos ${i.nome}`} className="rounded-lg border border-slate-200 p-1.5" onClick={() => mudarQtd(i.id, -1)}><Minus size={14} aria-hidden /></button>
                  <b className="w-7 text-center text-sm">{i.qtd}</b>
                  <button type="button" aria-label={`Mais ${i.nome}`} className="rounded-lg border border-slate-200 p-1.5" onClick={() => mudarQtd(i.id, 1)}><Plus size={14} aria-hidden /></button>
                  <span className="flex-1" />
                  <button type="button" aria-label={`Remover ${i.nome}`} className="rounded-lg p-1.5 text-slate-500" onClick={() => { onItens((l) => l.filter((x) => x.id !== i.id)); if (itens.length === 1) onClose(); }}><Trash2 size={15} aria-hidden /></button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Como receber">
          {([["delivery", "Entrega"], ["retirada", "Retirar na loja"]] as const).map(([id, r]) => (
            <button key={id} type="button" aria-pressed={canal === id} onClick={() => setCanal(id)} className={`rounded-lg py-2 text-sm font-bold ${canal === id ? "bg-modulo text-white" : ""}`}>{r}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Seu nome"><input className="input" autoComplete="name" value={cli.nome} onChange={(e) => setCli({ ...cli, nome: e.target.value })} /></Field>
          <Field label="WhatsApp com DDD"><input className="input" inputMode="tel" autoComplete="tel" value={cli.telefone} onChange={(e) => setCli({ ...cli, telefone: e.target.value })} /></Field>
          {canal === "delivery" && (
            <>
              {bairros.length > 0 && (
                <Field label="Bairro" className="col-span-2">
                  <select className="input" value={cli.bairro} onChange={(e) => setCli({ ...cli, bairro: e.target.value })}>
                    <option value="">Escolha o bairro</option>
                    {bairros.map((b) => <option key={b.nome} value={b.nome}>{b.nome} · entrega {brl(b.taxa)}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Endereço (rua e número)" className="col-span-2"><input className="input" autoComplete="street-address" value={cli.endereco} onChange={(e) => setCli({ ...cli, endereco: e.target.value })} /></Field>
              <Field label="Complemento / referência" className="col-span-2"><input className="input" value={cli.referencia} onChange={(e) => setCli({ ...cli, referencia: e.target.value })} /></Field>
            </>
          )}
        </div>

        <Field label={canal === "delivery" ? "Pagar na entrega com" : "Pagar na retirada com"}>
          <select className="input" value={pag} onChange={(e) => setPag(e.target.value)}>{PAGAMENTOS.map(([id, r]) => <option key={id} value={id}>{r}</option>)}</select>
        </Field>
        {pag === "dinheiro" && <Field label="Troco para quanto? (opcional)"><input className="input" inputMode="decimal" placeholder="Ex.: 50" value={troco} onChange={(e) => setTroco(e.target.value.replace(/[^\d,.]/g, ""))} /></Field>}
        {pag === "pix" && <p className="text-xs text-slate-500">A loja envia a chave Pix pelo WhatsApp ou mostra o QR na entrega.</p>}
        <Field label="Alguma observação?"><input className="input" maxLength={200} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        <Field label="Cupom de desconto (opcional)"><input className="input uppercase" value={cupom} onChange={(e) => setCupom(e.target.value)} /></Field>

        <dl className="num space-y-1 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between"><dt>Itens</dt><dd>{brl(subtotal)}</dd></div>
          {canal === "delivery" && <div className="flex justify-between"><dt>Entrega</dt><dd>{cli.bairro || !bairros.length ? brl(taxa) : "escolha o bairro"}</dd></div>}
          <div className="flex justify-between text-xl font-extrabold"><dt>Total</dt><dd>{brl(subtotal + taxa)}</dd></div>
        </dl>
        {falta > 0 && <p className="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">Faltam {brl(falta)} para o pedido mínimo.</p>}
        <Button type="button" className="w-full !py-3.5 text-base" disabled={enviando || !itens.length || falta > 0 || !loja.aberta} onClick={enviar}>{enviando ? "Enviando…" : "Enviar pedido"}</Button>
      </div>
    </Modal>
  );
}

function Acompanhar({ slug, loja, codigo, aoNovo }: { slug: string; loja: LojaPublica; codigo: string; aoNovo: () => void }) {
  const { data } = useQuery({
    queryKey: ["cardapio-status", slug, codigo], refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sorv_acompanhar", { p_slug: slug, p_codigo: codigo });
      if (error) throw error;
      return data as { status: "novo" | "aceito" | "recusado"; motivo: string | null; total: number; canal: string } | null;
    },
  });
  const st = data?.status ?? "novo";
  const Icone = st === "aceito" ? CheckCircle2 : st === "recusado" ? XCircle : Clock;
  const cor = st === "aceito" ? "text-emerald-600" : st === "recusado" ? "text-red-600" : "text-amber-600";
  return (
    <div className="mx-auto min-h-screen max-w-md space-y-5 bg-canvas p-6 text-center text-fg">
      <h1 className="flex items-center justify-center gap-2 text-xl font-extrabold"><IceCreamCone aria-hidden /> {loja.nome}</h1>
      <Icone size={56} className={`mx-auto ${cor}`} aria-hidden />
      <div>
        <p className="text-sm text-slate-500">Seu pedido</p>
        <p className="text-4xl font-extrabold tracking-widest">{codigo}</p>
      </div>
      <p className="text-lg font-bold" aria-live="polite">
        {st === "novo" && "Aguardando a sorveteria confirmar…"}
        {st === "aceito" && (data?.canal === "delivery" ? "Pedido confirmado! Já estamos preparando." : "Pedido confirmado! Chamamos quando estiver pronto.")}
        {st === "recusado" && "A sorveteria não pôde aceitar o pedido."}
      </p>
      {st === "recusado" && data?.motivo && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{data.motivo}</p>}
      {data && <p className="num text-sm text-slate-600">Total {brl(data.total)}</p>}
      {data?.canal === "delivery" && st === "aceito" && <p className="flex items-center justify-center gap-1 text-sm text-slate-500"><MapPin size={14} aria-hidden /> Entrega no endereço informado</p>}
      <div className="flex flex-col gap-2">
        {loja.whatsapp && <a className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold" target="_blank" rel="noreferrer"
          href={whatsappLink(loja.whatsapp, `Olá! Fiz o pedido ${codigo} pelo cardápio online.`)}><MessageCircle size={16} aria-hidden /> Falar com a sorveteria</a>}
        <Button type="button" variant="secondary" onClick={aoNovo}>Fazer outro pedido</Button>
      </div>
    </div>
  );
}
