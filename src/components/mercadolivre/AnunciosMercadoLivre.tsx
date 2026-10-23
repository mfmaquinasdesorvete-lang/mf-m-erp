// Anúncios do Mercado Livre: cada anúncio com o produto ligado, estoque e preço no ERP x último enviado, situação
// (em dia, na fila, aguardando aprovação, erro…), exceções (não mandar estoque ou preço), aprovar preço travado,
// ligar a um produto e buscar os anúncios da conta. No celular a tabela vira cartões.
import { useMemo, useState, type ReactNode } from "react";
import { Download, ExternalLink, Link2, Loader2, Pause, Play, Send } from "lucide-react";
import { Button, Card, Modal, Table, chip } from "@/components/ui";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { confirmar } from "@/components/Dialogos";
import { usePerfil } from "@/lib/auth";
import { useInvalidate, useRows } from "@/lib/data";
import { pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import type { ProdutoBuscavel } from "@/lib/buscaProduto";
import { corSituacao, linkAnuncio, nomeSituacao, quantidadeNoTitulo, reais, SITUACOES, textoResumoEnvio, type AnuncioComPlano, type ContaML, type Situacao } from "@/lib/mlAnuncios";
import { aprovarPreco, buscarAnunciosML, ligarComKit, mudarExcecao, mudarSituacaoAnuncios, sincronizarAgora } from "@/lib/useMercadoLivre";

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const POR_PAGINA = 100;
// o que pede atenção primeiro
const ORDEM: Situacao[] = ["aguardando", "erro", "sem_produto", "a_enviar", "na_fila", "em_dia", "desligado"];

export const quando = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

const Fraco = ({ children }: { children: ReactNode }) => <span className="text-xs text-slate-500">{children}</span>;

export function SituacaoChip({ s }: { s: Situacao }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${corSituacao(s)}`}>{nomeSituacao(s)}</span>;
}

/** Estoque: o que vai (ERP) e o último enviado. */
export function CelulaEstoque({ a }: { a: AnuncioComPlano }) {
  if (!a.produto_id) return <Fraco>—</Fraco>;
  if (a.enviar_estoque === false) return <Fraco>não manda (exceção)</Fraco>;
  if (a.logistica === "fulfillment") return <Fraco>Full: o estoque fica com o Mercado Livre</Fraco>;
  if (a.plano.estoque === null) return <Fraco>envio desligado</Fraco>;
  return (
    <span className="block">
      <b className="num text-fg">{a.plano.estoque}</b> <Fraco>pelo ERP{a.kit ? " (peças do kit)" : ""}</Fraco>
      <span className="num block text-xs text-slate-500">
        último enviado: {a.ultimo_estoque ?? "—"}{a.estoque_enviado_em ? ` em ${quando(a.estoque_enviado_em)}` : ""}
        {a.ultimo_estoque == null && a.estoque_ml != null ? ` · no anúncio: ${a.estoque_ml}` : ""}
      </span>
    </span>
  );
}

/** Preço: o que vai (ERP), o último enviado, a trava ou o erro. */
export function CelulaPreco({ a }: { a: AnuncioComPlano }) {
  if (!a.produto_id) return <Fraco>—</Fraco>;
  if (a.enviar_preco === false) return <Fraco>não manda (exceção)</Fraco>;
  const anterior = a.ultimo_preco != null
    ? `último enviado: ${reais(Number(a.ultimo_preco))}${a.preco_enviado_em ? ` em ${quando(a.preco_enviado_em)}` : ""}`
    : a.preco_ml != null ? `no anúncio: ${reais(Number(a.preco_ml))}` : "último enviado: —";
  if (a.plano.erro) return <span className="block"><span className="text-xs font-semibold text-red-700">{a.plano.erro}</span><span className="num block text-xs text-slate-500">{anterior}</span></span>;
  if (a.plano.preco === null) return <Fraco>envio desligado</Fraco>;
  if (a.plano.travado) {
    const t = a.plano.travado;
    return (
      <span className="block">
        <b className="num text-purple-700">{reais(t.para)}</b> <Fraco>pelo ERP</Fraco>
        <span className="num block text-xs font-semibold text-purple-700">{reais(t.de)} → {reais(t.para)} ({t.para > t.de ? "+" : "−"}{t.variacao.toLocaleString("pt-BR")}%)</span>
      </span>
    );
  }
  return (
    <span className="block">
      <b className="num text-fg">{reais(a.plano.preco)}</b> <Fraco>pelo ERP</Fraco>
      <span className="num block text-xs text-slate-500">{anterior}</span>
    </span>
  );
}

/** Explicação curta da situação. */
export function detalheSituacao(a: AnuncioComPlano) {
  switch (a.situacao) {
    case "sem_produto": return "ligue a um produto do ERP para mandar estoque e preço";
    case "desligado": return a.enviar_estoque === false && a.enviar_preco === false
      ? "exceção: o ERP não mexe neste anúncio" : "ligue o envio na aba \"Envio de estoque e preço\"";
    case "aguardando": return a.plano.travado ? `mudança de ${a.plano.travado.variacao.toLocaleString("pt-BR")}% no preço: aprove para enviar` : "";
    case "erro": {
      // o erro do preço já aparece na coluna do preço: aqui só o que fazer e os outros erros (do Mercado Livre)
      const outros = (a.erro ?? "").split(" · ").filter((x) => x && x !== a.plano.erro).join(" · ");
      return [a.plano.erro ? "o preço não vai: confira o preço de venda e o custo do produto" : "", outros].filter(Boolean).join(" · ");
    }
    case "na_fila": return `${a.fila_motivo ?? "na fila"}${a.erro ? ` · última tentativa: ${a.erro}` : ""}`;
    case "a_enviar": return "diferente do último envio: vai na próxima conferência ou em \"Sincronizar agora\"";
    default: return [a.plano.aviso, a.conferido_em ? `conferido em ${quando(a.conferido_em)}` : ""].filter(Boolean).join(" · ");
  }
}

export function AnunciosMercadoLivre({ conta, anuncios, carregando, erro, podeMudar }: {
  conta: ContaML | null; anuncios: AnuncioComPlano[]; carregando: boolean; erro: Error | null; podeMudar: boolean;
}) {
  const { tem } = usePerfil();
  const podeLigar = tem("vendas");
  const podeBuscar = tem("vendas", "financeiro", "marketplace");
  const podePausar = !!conta && tem("financeiro", "marketplace");
  // marcar vários anúncios (pelo MLB: as variações vão juntas) para pausar ou reativar de uma vez
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [situacaoML, setSituacaoML] = useState<"" | "active" | "paused">("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Situacao | "">("");
  const [limite, setLimite] = useState(POR_PAGINA);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ligando, setLigando] = useState<AnuncioComPlano | null>(null);
  const invalidar = useInvalidate();
  const envioLigado = !!conta && (!!conta.enviar_estoque || !!conta.enviar_preco);

  const contagem = useMemo(() => {
    const m = new Map<Situacao, number>();
    for (const a of anuncios) m.set(a.situacao, (m.get(a.situacao) ?? 0) + 1);
    return m;
  }, [anuncios]);
  const lista = useMemo(() => {
    const termo = sem(busca.trim());
    return anuncios
      .filter((a) => (!filtro || a.situacao === filtro)
        && (!situacaoML || (situacaoML === "paused" ? a.status_ml === "paused" : a.status_ml !== "paused" && a.status_ml !== "closed"))
        && (!termo || [a.titulo, a.ml_item_id, a.variation_id, a.sku, a.produto, a.produto_sku].some((x) => sem(x).includes(termo))))
      .sort((x, y) => ORDEM.indexOf(x.situacao) - ORDEM.indexOf(y.situacao) || sem(x.titulo).localeCompare(sem(y.titulo)));
  }, [anuncios, filtro, busca, situacaoML]);
  const visiveis = lista.slice(0, limite);
  const todosMarcados = visiveis.length > 0 && visiveis.every((a) => marcados.has(a.ml_item_id));
  const marcar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarTodos = () => setMarcados(todosMarcados ? new Set() : new Set(visiveis.map((a) => a.ml_item_id)));

  async function mudarSituacao(status: "paused" | "active") {
    const ids = [...marcados];
    const verbo = status === "paused" ? "Pausar" : "Reativar";
    if (!ids.length || !(await confirmar(`${verbo} ${ids.length} ${pl(ids.length, "anúncio", "anúncios")} no Mercado Livre?`,
      { titulo: `${verbo} anúncios`, ok: verbo }))) return;
    setOcupado("situacao");
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const { resultado: r } = await mudarSituacaoAnuncios(ids.slice(i, i + 200), status);
        const feito = status === "paused" ? pl(r.mudados, "pausado", "pausados") : pl(r.mudados, "reativado", "reativados");
        notify(`${r.mudados} ${pl(r.mudados, "anúncio", "anúncios")} ${feito}${r.erros.length ? `. ${r.erros.length} não: ${r.erros.slice(0, 3).map((x) => `${x.id} (${x.erro})`).join("; ")}` : ""}.`, r.erros.length ? "erro" : undefined);
      }
      setMarcados(new Set());
    } catch (e) { notifyError(e); } finally {
      setOcupado(null);
      invalidar("ml_anuncios");
    }
  }

  async function buscar() {
    setOcupado("buscar");
    try {
      const { resultado: r } = await buscarAnunciosML();
      notify(`${r.anuncios} ${pl(r.anuncios, "anúncio lido", "anúncios lidos")}: ${r.novos} ${pl(r.novos, "novo", "novos")}, ${r.ligados} ${pl(r.ligados, "ligado", "ligados")} pelo SKU`
        + `${r.sem_produto ? `. ${r.sem_produto} sem produto: ligue na lista` : ""}${r.mais ? ". A conta tem mais de 1000 anúncios: vieram os primeiros" : ""}.`);
    } catch (e) { notifyError(e); } finally {
      setOcupado(null);
      invalidar("ml_anuncios");
    }
  }
  async function excecao(a: AnuncioComPlano, campo: "estoque" | "preco", enviar: boolean) {
    setOcupado(a.anuncio_id);
    try { await mudarExcecao(a.anuncio_id, campo, enviar); } catch (e) { notifyError(e); } finally {
      setOcupado(null);
      invalidar("ml_anuncios");
    }
  }
  async function enviarAgora(ids: string[], aviso?: string) {
    const r = await sincronizarAgora(ids);
    if (r.erro) notify(`${aviso ? `${aviso} ` : ""}Ficou na fila: vai em até 5 minutos (${r.erro}).`, "erro");
    else notify(`${aviso ? `${aviso} ` : ""}${textoResumoEnvio(r.resultado)}`);
  }
  async function aprovar(a: AnuncioComPlano) {
    const t = a.plano.travado;
    if (!t) return;
    if (!(await confirmar(`Mandar o preço ${reais(t.para)} para "${a.titulo ?? a.ml_item_id}"? Hoje está ${reais(t.de)} (mudança de ${t.variacao.toLocaleString("pt-BR")}%).`,
      { titulo: "Aprovar mudança de preço", ok: "Aprovar e enviar" }))) return;
    setOcupado(a.anuncio_id);
    try {
      await aprovarPreco(a.anuncio_id, t.para);
      await enviarAgora([a.anuncio_id], "Preço aprovado.");
    } catch (e) { notifyError(e); } finally {
      setOcupado(null);
      invalidar("ml_anuncios");
    }
  }
  async function enviarUm(a: AnuncioComPlano) {
    setOcupado(a.anuncio_id);
    try { await enviarAgora([a.anuncio_id]); } catch (e) { notifyError(e); } finally {
      setOcupado(null);
      invalidar("ml_anuncios");
    }
  }

  if (erro && !anuncios.length) {
    return <Card className="p-6 text-sm text-red-700">Não deu para ler os anúncios: {erro.message}</Card>;
  }

  return (
    <div className="space-y-3">
      {/* a mesma barra das outras listas: busca, e ativos/pausados no botão Filtros; os chips da situação logo abaixo */}
      <BarraFiltros busca={busca} onBusca={(v) => { setBusca(v); setLimite(POR_PAGINA); }} placeholder="Buscar: título, MLB, SKU ou produto"
        filtros={<label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">No Mercado Livre</span>
          <select className="input w-auto" value={situacaoML} onChange={(e) => setSituacaoML(e.target.value as typeof situacaoML)}>
            <option value="">Ativos e pausados</option><option value="active">Só ativos</option><option value="paused">Só pausados</option>
          </select></label>}
        nFiltros={(situacaoML ? 1 : 0) + (filtro ? 1 : 0)} onLimpar={() => { setBusca(""); setSituacaoML(""); setFiltro(""); setLimite(POR_PAGINA); }}
        direita={conta && podeBuscar && (
          <Button variant="secondary" onClick={buscar} disabled={ocupado === "buscar"} title="Traz os anúncios ativos e pausados da conta e liga pelo SKU">
            {ocupado === "buscar" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Buscar anúncios
          </Button>
        )} />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar pela situação">
        <button type="button" aria-pressed={!filtro} onClick={() => setFiltro("")}
          className={chip(!filtro, "border-transparent bg-modulo-escuro text-white")}>
          Todos <span className="num">{anuncios.length}</span>
        </button>
        {SITUACOES.filter((s) => contagem.get(s.id)).map((s) => (
          <button key={s.id} type="button" aria-pressed={filtro === s.id} onClick={() => setFiltro(filtro === s.id ? "" : s.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${filtro === s.id ? "ring-2 ring-modulo" : "ring-transparent"} ${s.cor}`}>
            {s.nome} <span className="num">{contagem.get(s.id)}</span>
          </button>
        ))}
      </div>

      {!carregando && !anuncios.length ? (
        <Card className="p-6 text-center text-sm text-slate-600">
          {conta
            ? <>Nenhum anúncio ainda. Clique em <b>Buscar anúncios</b> para trazer os anúncios da conta: os que têm o mesmo SKU de um produto do ERP já vêm ligados.</>
            : <>Nenhum anúncio ainda. Conecte a conta do Mercado Livre (aba <b>Conta</b>) e depois use <b>Buscar anúncios</b>.</>}
        </Card>
      ) : (
        <>
          {podePausar && marcados.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-modulo/30 bg-modulo/5 p-2.5 text-sm">
              <b className="text-fg">{marcados.size} {pl(marcados.size, "anúncio marcado", "anúncios marcados")}</b>
              <Button variant="secondary" disabled={ocupado === "situacao"} onClick={() => mudarSituacao("paused")}>{ocupado === "situacao" ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />} Pausar</Button>
              <Button variant="secondary" disabled={ocupado === "situacao"} onClick={() => mudarSituacao("active")}><Play size={14} /> Reativar</Button>
              <Button variant="ghost" onClick={() => setMarcados(new Set())}>Limpar</Button>
            </div>
          )}
          <Table empty={!carregando && !lista.length} head={<>
            {podePausar && <th className="th w-8"><input type="checkbox" className="h-4 w-4" aria-label="Marcar todos os anúncios da tela" checked={todosMarcados} onChange={marcarTodos} /></th>}
            <th className="th">Anúncio</th><th className="th">Produto no ERP</th><th className="th">Estoque</th><th className="th">Preço</th><th className="th">Situação</th><th className="th" />
          </>}>
            {visiveis.map((a) => {
              const parado = ocupado === a.anuncio_id;
              return (
                <tr key={a.anuncio_id}>
                  {podePausar && <td className="td" data-label="Marcar"><input type="checkbox" className="h-4 w-4" aria-label={`Marcar ${a.titulo ?? a.ml_item_id}`} checked={marcados.has(a.ml_item_id)} onChange={() => marcar(a.ml_item_id)} /></td>}
                  <td className="td">
                    <a href={linkAnuncio(a.ml_item_id)} target="_blank" rel="noreferrer" className="font-semibold text-fg hover:text-brand hover:underline">
                      {a.titulo || a.ml_item_id} <ExternalLink size={12} className="inline" aria-label="abre no Mercado Livre" />
                    </a>
                    <span className="num block text-xs text-slate-500">
                      {a.ml_item_id}{a.variation_id ? ` · variação ${a.variation_id}` : ""}{a.sku ? ` · SKU ${a.sku}` : ""}
                      {a.status_ml === "paused" ? " · pausado" : a.status_ml === "closed" ? " · encerrado" : ""}
                    </span>
                  </td>
                  <td className="td">
                    {a.produto_id ? (
                      <span className="block">
                        <span className="font-semibold text-fg">{a.produto}</span>{a.kit ? <Fraco> (kit)</Fraco> : null}
                        <span className="num block text-xs text-slate-500">{a.produto_sku ? `SKU ${a.produto_sku}` : "sem SKU"}{a.produto_ativo === false ? " · inativo" : ""}</span>
                      </span>
                    ) : podeLigar ? (
                      <Button variant="secondary" onClick={() => setLigando(a)}><Link2 size={14} /> Ligar a um produto</Button>
                    ) : <Fraco>sem produto (vendas liga)</Fraco>}
                  </td>
                  <td className="td"><CelulaEstoque a={a} /></td>
                  <td className="td"><CelulaPreco a={a} /></td>
                  <td className="td">
                    <SituacaoChip s={a.situacao} />
                    {detalheSituacao(a) && <span className={`mt-0.5 block text-xs ${a.situacao === "erro" ? "text-red-700" : "text-slate-500"}`}>{detalheSituacao(a)}</span>}
                  </td>
                  <td className="td">
                    {podeMudar && a.produto_id && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700" title="Desmarque para o ERP não mexer no estoque deste anúncio">
                          <input type="checkbox" className="h-4 w-4" checked={a.enviar_estoque !== false} disabled={parado} onChange={(e) => excecao(a, "estoque", e.target.checked)} /> Manda estoque
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700" title="Desmarque para o ERP não mexer no preço deste anúncio">
                          <input type="checkbox" className="h-4 w-4" checked={a.enviar_preco !== false} disabled={parado} onChange={(e) => excecao(a, "preco", e.target.checked)} /> Manda preço
                        </label>
                        {a.plano.travado && (
                          <Button disabled={parado} onClick={() => aprovar(a)}>Aprovar {reais(a.plano.travado.para)}</Button>
                        )}
                        {envioLigado && !a.plano.travado && a.situacao !== "desligado" && (
                          <Button variant="ghost" disabled={parado} onClick={() => enviarUm(a)} title="Manda agora estoque e preço deste anúncio">
                            {parado ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar agora
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
          {lista.length > limite && (
            <div className="text-center">
              <Button variant="secondary" onClick={() => setLimite((n) => n + POR_PAGINA)}>Mostrar mais ({lista.length - limite} {pl(lista.length - limite, "falta", "faltam")})</Button>
            </div>
          )}
        </>
      )}

      {ligando && <LigarProduto anuncio={ligando} onClose={() => setLigando(null)} onPronto={() => { setLigando(null); invalidar("ml_anuncios", "ml_contas"); }} />}
    </div>
  );
}

type ProdutoLigar = ProdutoBuscavel & { kit: boolean | null; ativo: boolean };
/** O que o "Ligar" precisa do anúncio (vem da lista de anúncios ou da venda parada). */
export type AnuncioLigar = Pick<AnuncioComPlano, "anuncio_id" | "ml_item_id" | "variation_id" | "titulo" | "sku">;

export function LigarProduto({ anuncio, onClose, onPronto }: { anuncio: AnuncioLigar; onClose: () => void; onPronto: () => void }) {
  const { data: produtos = [], isLoading } = useRows<ProdutoLigar>("produtos", {
    select: "id, descricao, sku, codigo_barras, modelo, marca, codigo_fabricante, kit, ativo", order: "descricao", ascending: true,
  });
  const ativos = useMemo(() => produtos.filter((p) => p.ativo), [produtos]);
  const [ligando, setLigando] = useState(false);
  const [qtd, setQtd] = useState(String(quantidadeNoTitulo(anuncio.titulo)));
  const n = Math.max(1, Math.min(500, Math.round(Number(qtd)) || 1));
  async function escolher(p: ProdutoLigar) {
    setLigando(true);
    try {
      const r = await ligarComKit(anuncio.anuncio_id, p.id, n);
      const k = Number(r?.importadas) || 0;
      notify(`Anúncio ligado a ${n > 1 ? `${n} × ` : ""}${p.descricao}${r?.kit_criado ? " (kit)" : ""}.${k ? ` ${k} ${pl(k, "venda parada entrou", "vendas paradas entraram")} no ERP.` : ""}`);
      onPronto();
    } catch (e) { notifyError(e); setLigando(false); }
  }
  return (
    <Modal open onClose={onClose} title="Ligar o anúncio a um produto">
      <p className="mb-1 text-sm font-semibold text-fg">{anuncio.titulo ?? anuncio.ml_item_id}</p>
      <p className="num mb-3 text-xs text-slate-500">{anuncio.ml_item_id}{anuncio.variation_id ? ` · variação ${anuncio.variation_id}` : ""}{anuncio.sku ? ` · SKU no anúncio: ${anuncio.sku}` : ""}</p>
      <label className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm ring-1 ring-slate-200">
        <span>Cada venda deste anúncio leva</span>
        <input className="input num !w-20" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))} aria-label="Unidades por venda" />
        <span>{n > 1 ? "unidades do produto: o ERP cria o kit e dá baixa certa no estoque." : "unidade do produto."}</span>
      </label>
      {isLoading || ligando ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> {ligando ? "Ligando…" : "Carregando os produtos…"}</p>
        : <ProdutoBusca produtos={ativos} onEscolher={escolher} placeholder={n > 1 ? "Produto avulso (1 unidade): nome, SKU ou código…" : "Produto do ERP: nome, SKU ou código…"} />}
      <p className="mt-3 text-xs text-slate-500">Dica: com o mesmo SKU no cadastro do produto e no anúncio, o ERP liga sozinho ao buscar os anúncios. As vendas que esperavam por este anúncio entram na hora.</p>
    </Modal>
  );
}
