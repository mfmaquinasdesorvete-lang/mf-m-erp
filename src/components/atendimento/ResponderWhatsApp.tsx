// "Responder no WhatsApp" (Ficha 360 do cliente): as três perguntas que mais chegam no WhatsApp Business viram
// mensagem pronta — nota fiscal (DANFE e XML), rastreio do pedido e preço e estoque da peça. A pessoa escolhe,
// confere o texto (dá para mudar) e toca em "Abrir no WhatsApp"; o envio é dela. Mensagens em lib/respostasWhatsapp.
// "Escrever com IA": a pessoa diz o que quer falar e a função ia-texto escreve com os pedidos, contas e OS do cliente.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, FileText, Loader2, MessageCircle, Package, Sparkles, TriangleAlert, Truck } from "lucide-react";
import { Button, chip, CLASSE_BOTAO, Field, Modal, TOM_ACAO, Tabs } from "@/components/ui";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { callFunction, supabase } from "@/lib/supabase";
import { useRows } from "@/lib/data";
import { brl, dataBR, whatsappLink } from "@/lib/format";
import { notify } from "@/lib/notify";
import { linkRastreio } from "@/lib/transportadoras";
import { mensagemNota, mensagemPeca, mensagemRastreio, type EnvioResposta, type NotaResposta } from "@/lib/respostasWhatsapp";

export type ClienteResposta = {
  id: string; nome: string; nome_fantasia?: string | null; whatsapp?: string | null; telefone?: string | null;
  portal_link?: string | null; portal_token?: string | null; tipo_pessoa?: string | null;
};
type Aba = "nota" | "rastreio" | "peca" | "ia";
type Tom = "cordial" | "curto" | "formal";
const IDEIAS = ["Cobrar a parcela em aberto", "Avisar que a máquina ficou pronta", "Agradecer a compra", "Responder a mensagem dele", "Lembrar da manutenção preventiva"];
type Nota = NotaResposta & { id: string };
type Pedido = EnvioResposta & { id: string; status: string };
type Produto = {
  id: string; descricao: string; sku: string | null; codigo_fabricante: string | null; modelo: string | null; marca: string | null;
  preco_venda: number | null; estoque_atual: number | null; sob_encomenda: boolean | null; prazo_reposicao_dias: number | null; kit: boolean | null;
};

export function ResponderWhatsApp({ cliente: c, onClose, escrever }: { cliente: ClienteResposta; onClose: () => void; escrever?: string }) {
  // "escrever": já abre no "Escrever com IA" com o que falar (vem da ação preparada pela IA)
  const [aba, setAba] = useState<Aba>(escrever ? "ia" : "nota");
  const [texto, setTexto] = useState("");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [pedidoIA, setPedidoIA] = useState(escrever ?? "");
  const [msgCliente, setMsgCliente] = useState("");
  const [tom, setTom] = useState<Tom>("cordial");
  const [escrevendo, setEscrevendo] = useState(false);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  // "Olá, Maria!" só para pessoa física; empresa recebe "Olá!" (o primeiro nome da razão social não é de ninguém)
  const contato = c.tipo_pessoa === "PF" || c.tipo_pessoa === "fisica" ? c.nome : null;
  const fone = c.whatsapp || c.telefone;
  const area = c.portal_token ? `${window.location.origin}/cliente/${c.portal_link || c.portal_token}` : null;

  const notas = useQuery({
    queryKey: ["responder", "notas", c.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("notas_fiscais").select("id, numero, serie, chave, valor_total, danfe_url, xml_url, created_at")
        .eq("cliente_id", c.id).eq("status", "autorizada").is("excluida_em", null).order("created_at", { ascending: false }).limit(15);
      if (error) throw error;
      return (data ?? []).map((n: any) => ({ id: n.id, numero: n.numero, serie: n.serie, data: n.created_at, valor: n.valor_total ? Number(n.valor_total) : null, chave: n.chave, danfe_url: n.danfe_url, xml_url: n.xml_url })) as Nota[];
    },
  });
  const pedidos = useQuery({
    queryKey: ["responder", "pedidos", c.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pedidos").select("id, numero, status, codigo_rastreio, enviado_em, transportadora:transportadoras(nome, nome_fantasia, rastreio_url)")
        .eq("cliente_id", c.id).in("status", ["aprovado", "faturado", "entregue"]).is("excluida_em", null).order("created_at", { ascending: false }).limit(15);
      if (error) throw error;
      return (data ?? []).map((p: any) => {
        const t = Array.isArray(p.transportadora) ? p.transportadora[0] : p.transportadora;
        const codigo = p.codigo_rastreio?.trim() || null;
        return {
          id: p.id, status: p.status, pedido: p.numero, enviado_em: p.enviado_em, transportadora: t ? (t.nome_fantasia || t.nome) : null,
          codigo, link: codigo ? linkRastreio(t?.rastreio_url, { codigo }) : null,
        };
      }) as Pedido[];
    },
  });
  const { data: produtos = [] } = useRows<Produto>("produtos", {
    select: "id, descricao, sku, codigo_fabricante, modelo, marca, preco_venda, estoque_atual, sob_encomenda, prazo_reposicao_dias, kit",
    order: "descricao", ascending: true, key: ["responder"], filtro: (q) => q.eq("ativo", true),
  });
  const { data: porUnidade = [] } = useQuery({
    queryKey: ["responder", "estoque", escolhido],
    enabled: aba === "peca" && !!escolhido,
    queryFn: async () => {
      const { data } = await supabase.from("estoque_unidade").select("quantidade, unidade:unidades(codigo, nome)").eq("produto_id", escolhido!);
      return (data ?? []).map((r: any) => ({ unidade: (Array.isArray(r.unidade) ? r.unidade[0] : r.unidade)?.codigo ?? "—", qtd: Number(r.quantidade) || 0 }));
    },
  });

  function trocarAba(a: Aba) { setAba(a); setTexto(""); setEscolhido(null); setAvisos([]); setErroIA(null); }
  async function escreverIA() {
    if (escrevendo || pedidoIA.trim().length < 4) return;
    setEscrevendo(true); setErroIA(null);
    try {
      const r = await callFunction<{ texto: string; avisos: string[] }>("ia-texto", { cliente_id: c.id, pedido: pedidoIA.trim(), mensagem_cliente: msgCliente.trim() || null, tom });
      setTexto(r.texto); setAvisos(r.avisos);
    } catch (e) { setErroIA((e as Error).message); }
    finally { setEscrevendo(false); }
  }
  function escolherPeca(p: Produto, unidades = porUnidade) {
    setEscolhido(p.id);
    setTexto(mensagemPeca(contato, {
      descricao: p.descricao, codigo: p.sku || p.codigo_fabricante, preco: p.preco_venda ? Number(p.preco_venda) : null,
      estoque: Math.max(0, Number(p.estoque_atual) || 0), porUnidade: unidades, sobEncomenda: p.sob_encomenda, prazoDias: p.prazo_reposicao_dias,
    }, area));
  }
  // estoque por unidade chega depois de escolher: refaz a mensagem com SC/SP
  const peca = useMemo(() => produtos.find((p) => p.id === escolhido) ?? null, [produtos, escolhido]);
  useEffect(() => { if (aba === "peca" && peca && porUnidade.length) escolherPeca(peca, porUnidade); }, [porUnidade]); // eslint-disable-line react-hooks/exhaustive-deps

  const linha = (ativo: boolean) => `flex items-start gap-2 border px-3 py-2 text-sm ${ativo ? "border-brand bg-brand/5" : "border-slate-200"}`;

  return (
    <Modal open onClose={onClose} title={`Responder no WhatsApp · ${c.nome_fantasia?.trim() || c.nome}`}>
      <div className="space-y-4">
        <Tabs value={aba} onChange={trocarAba} options={[
          { value: "nota", label: "Nota fiscal" }, { value: "rastreio", label: "Rastreio" }, { value: "peca", label: "Preço e estoque" },
          { value: "ia", label: "Escrever com IA" },
        ]} />

        {aba === "nota" && (
          notas.isLoading ? <p className="text-sm text-slate-500">Carregando as notas…</p>
            : !notas.data?.length ? <p className="text-sm text-slate-500">Nenhuma nota autorizada para este cliente.</p>
            : (
              <ul className="max-h-60 space-y-1.5 overflow-y-auto">
                {notas.data.map((n) => (
                  <li key={n.id}>
                    <button type="button" className={`linha-clicavel ${linha(escolhido === n.id)}`} onClick={() => { setEscolhido(n.id); setTexto(mensagemNota(contato, n, area)); }}>
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <span><b className="text-fg">NF {n.numero}</b> · {dataBR(n.data)}{n.valor ? ` · ${brl(n.valor)}` : ""}
                        <span className="block text-xs text-slate-500">{n.danfe_url ? "com DANFE e XML" : "sem arquivo: vai a chave de acesso"}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )
        )}

        {aba === "rastreio" && (
          pedidos.isLoading ? <p className="text-sm text-slate-500">Carregando os pedidos…</p>
            : !pedidos.data?.length ? <p className="text-sm text-slate-500">Nenhum pedido aprovado para este cliente.</p>
            : (
              <ul className="max-h-60 space-y-1.5 overflow-y-auto">
                {pedidos.data.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={`linha-clicavel ${linha(escolhido === p.id)}`} onClick={() => { setEscolhido(p.id); setTexto(mensagemRastreio(contato, p, area)); }}>
                      <Truck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <span><b className="text-fg">Pedido {p.pedido}</b>{p.enviado_em ? ` · saiu ${dataBR(p.enviado_em)}` : " · ainda não saiu"}
                        <span className="block text-xs text-slate-500">{[p.transportadora, p.codigo ? `rastreio ${p.codigo}` : "sem código de rastreio"].filter(Boolean).join(" · ")}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )
        )}

        {aba === "peca" && (
          <Field label="Qual peça?">
            <ProdutoBusca produtos={produtos} onEscolher={(p) => escolherPeca(p, [])} placeholder="Nome, código ou modelo da peça"
              detalhe={(p) => <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" />{p.preco_venda ? brl(Number(p.preco_venda)) : "sem preço"} · {Math.max(0, Number(p.estoque_atual) || 0)} em estoque</span>} />
          </Field>
        )}

        {aba === "ia" && (
          <div className="space-y-3">
            <Field label="O que você quer falar?">
              <textarea className="input min-h-[70px]" value={pedidoIA} onChange={(e) => setPedidoIA(e.target.value)} maxLength={1000}
                placeholder="Ex.: avisar que a peça chega na quinta e que dá para pagar no Pix" />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {IDEIAS.map((i) => <button key={i} type="button" className={chip(pedidoIA === i)} onClick={() => setPedidoIA(i)}>{i}</button>)}
            </div>
            <Field label="Mensagem do cliente (se tiver, cole aqui)">
              <textarea className="input min-h-[60px]" value={msgCliente} onChange={(e) => setMsgCliente(e.target.value)} maxLength={3000} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              {(["cordial", "curto", "formal"] as Tom[]).map((t) => (
                <button key={t} type="button" className={chip(tom === t)} onClick={() => setTom(t)}>{t === "cordial" ? "Cordial" : t === "curto" ? "Curto" : "Formal"}</button>
              ))}
              <Button className="ml-auto" onClick={escreverIA} disabled={escrevendo || pedidoIA.trim().length < 4}>
                {escrevendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {escrevendo ? "Escrevendo…" : texto ? "Escrever de novo" : "Escrever"}
              </Button>
            </div>
            <p className="text-xs text-slate-500">A IA usa os pedidos, as contas em aberto e as OS deste cliente. Confira antes de mandar.</p>
            {erroIA && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{erroIA}</p>}
            {avisos.map((a) => <p key={a} className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {a}</p>)}
          </div>
        )}

        {texto && (
          <>
            <Field label="Mensagem (dá para mudar antes de mandar)">
              <textarea className="input min-h-[150px]" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </Field>
            {!fone && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Este cliente não tem WhatsApp no cadastro: copie a mensagem e cole na conversa.</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(texto).then(() => notify("Mensagem copiada"))}><Copy className="h-4 w-4" /> Copiar</Button>
              {fone && (
                <a href={whatsappLink(fone, texto)} target="_blank" rel="noreferrer"
                  className={`${CLASSE_BOTAO} ${TOM_ACAO.enviar}`}>
                  <MessageCircle className="h-4 w-4" /> Abrir no WhatsApp
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
