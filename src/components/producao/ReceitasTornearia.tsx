// Tornearia → Peças (receita): cada peça usinada (marcador "Tornearia") com o que vai nela, separada da ficha técnica
// das máquinas. Por peça: os insumos (barra, chapa, peça comprada) e quanto vai de cada um — a barra redonda por kg
// pode ser posta pelo comprimento em mm —, o fornecedor e o preço de cada insumo, quem faz ou vende a peça pronta,
// o desenho técnico e o custo calculado (com "Usar este custo" quando o cadastro está diferente).
// A receita fica em produto_componentes (a mesma ligação que a OP usa para separar o material da peça).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, ClipboardList, Cog, FileImage, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Button, Carregando, ErroLista, Field, Stat, Vazio, chip } from "@/components/ui";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { DocumentosMaquina } from "@/components/produtos/GaleriaProduto";
import { useMarcadores } from "@/components/nfe/Marcadores";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { SELECT_LISTA_PRODUTOS } from "@/lib/produtosLista";
import { brl, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { custoReceita, diametroDoNome, ehBarraPorKg, mmDaBarra } from "@/lib/tornearia";
import { textoUso, type UsoMaterial } from "@/lib/material";
import { CalculoMaterial, temCalculo } from "@/components/producao/CalculoMaterial";
import type { Produto } from "@/lib/types";

type Linha = { id: string; produto_id: string; componente_id: string; quantidade: number; ordem: number | null; uso?: unknown };
type Fornecimento = { produto_id: string; preco: number | null; preferido: boolean | null; fornecedor: { nome: string } | null };
type Filtro = "todas" | "sem_receita" | "sem_desenho";

const qtd = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

export function ReceitasTornearia() {
  const { pode } = usePerfil();
  const editavel = pode("editar_produtos") || pode("editar_producao");
  const invalidar = useInvalidate();
  const prods = useRows<Produto>("produtos", { select: SELECT_LISTA_PRODUTOS, order: "descricao", ascending: true });
  const linhasQ = useRows<Linha>("produto_componentes", { select: "id, produto_id, componente_id, quantidade, ordem, uso", order: "produto_id", key: ["receitas"] });
  const { data: fornecimentos = [] } = useRows<Fornecimento>("fornecimentos", { select: "produto_id, preco, preferido, fornecedor:fornecedores(nome)", order: "produto_id", key: ["tornearia"] });
  const { data: desenhos = [] } = useRows<{ produto_id: string }>("produtos_midia", { select: "produto_id", order: "produto_id", key: ["desenhos"], filtro: (q) => q.eq("tipo", "desenho").eq("ativo", true) });
  const { data: marcadores = [] } = useMarcadores();
  const idTornearia = marcadores.find((m) => m.ativo !== false && m.nome.trim().toLowerCase() === "tornearia")?.id;

  const produtos = prods.data ?? [];
  const linhas = linhasQ.data ?? [];
  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const pecas = useMemo(() => produtos.filter((p) => p.ativo && !p.unificado_em && !!idTornearia && (p.marcadores ?? []).includes(idTornearia)), [produtos, idTornearia]);
  const receitaDe = useMemo(() => {
    const m = new Map<string, Linha[]>();
    for (const l of linhas) m.set(l.produto_id, [...(m.get(l.produto_id) ?? []), l]);
    return m;
  }, [linhas]);
  const fornDe = useMemo(() => {
    const m = new Map<string, Fornecimento[]>();
    for (const f of fornecimentos) m.set(f.produto_id, [...(m.get(f.produto_id) ?? []), f]);
    for (const l of m.values()) l.sort((a, b) => Number(!!b.preferido) - Number(!!a.preferido));
    return m;
  }, [fornecimentos]);
  const nDesenhos = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of desenhos) m.set(d.produto_id, (m.get(d.produto_id) ?? 0) + 1);
    return m;
  }, [desenhos]);

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [aberta, setAberta] = useState<string | null>(null);
  const semReceita = pecas.filter((p) => !receitaDe.has(p.id)).length;
  const semDesenho = pecas.filter((p) => !nDesenhos.get(p.id)).length;
  const termo = busca.trim().toLowerCase();
  const lista = pecas.filter((p) => (filtro === "todas" || (filtro === "sem_receita" ? !receitaDe.has(p.id) : !nDesenhos.get(p.id)))
    && (!termo || `${p.sku ?? ""} ${p.descricao}`.toLowerCase().includes(termo)));

  if (prods.error || linhasQ.error) return <ErroLista erro={prods.error ?? linhasQ.error} onTentar={() => { prods.refetch(); linhasQ.refetch(); }} />;
  if (prods.isLoading || linhasQ.isLoading) return <Carregando />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        A receita de cada peça usinada: o que vai nela, de quem se compra, o desenho e quanto custa. Fica separada da ficha técnica das máquinas.
      </p>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Peças" valor={pecas.length} icon={Cog} onClick={() => setFiltro("todas")} />
        <Stat label="Sem receita" valor={semReceita} tom={semReceita ? "atencao" : "bom"} icon={ClipboardList} onClick={() => setFiltro("sem_receita")} />
        <Stat label="Sem desenho" valor={semDesenho} tom={semDesenho ? "atencao" : "bom"} icon={FileImage} onClick={() => setFiltro("sem_desenho")} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Buscar peça</span>
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome ou SKU" />
        </label>
        <div className="faixa-chips" role="group" aria-label="Mostrar">
          {([["todas", "Todas"], ["sem_receita", "Sem receita"], ["sem_desenho", "Sem desenho"]] as const).map(([v, r]) => (
            <button key={v} type="button" className={chip(filtro === v)} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{r}</button>
          ))}
        </div>
      </div>

      {!idTornearia ? (
        <Vazio titulo="Falta o marcador Tornearia." texto='Crie o marcador "Tornearia" e ponha nas peças usinadas para elas aparecerem aqui.' />
      ) : !lista.length ? (
        <Vazio titulo={pecas.length ? "Nenhuma peça com esse filtro." : "Nenhuma peça com o marcador Tornearia."}
          texto={pecas.length ? "Troque o filtro ou a busca." : "Ponha o marcador \"Tornearia\" nas peças usinadas, na aba Produtos."}
          acao={pecas.length ? <Button variant="secondary" tamanho="mini" onClick={() => { setFiltro("todas"); setBusca(""); }}>Mostrar todas</Button> : undefined} />
      ) : (
        <ul className="space-y-2">
          {lista.map((p) => {
            const rec = receitaDe.get(p.id) ?? [];
            const calc = custoReceita(rec, (id) => porId.get(id)?.preco_custo);
            const quem = fornDe.get(p.id)?.[0];
            const aberto = aberta === p.id;
            return (
              <li key={p.id} className="cartao">
                <button type="button" className="linha-clicavel flex items-start gap-2 p-3" aria-expanded={aberto} onClick={() => setAberta(aberto ? null : p.id)}>
                  {aberto ? <ChevronDown size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden /> : <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-fg">{p.descricao}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                      <span className="num">{p.sku}</span>
                      {rec.length ? <span>{rec.length} {pl(rec.length, "insumo", "insumos")}</span> : <span className="font-semibold text-amber-800">sem receita</span>}
                      <span className={nDesenhos.get(p.id) ? "" : "font-semibold text-amber-800"}>{nDesenhos.get(p.id) ? `${nDesenhos.get(p.id)} ${pl(nDesenhos.get(p.id), "desenho", "desenhos")}` : "sem desenho"}</span>
                      {quem && <span>pronta: {quem.fornecedor?.nome ?? "fornecedor"}{quem.preco ? ` ${brl(quem.preco)}` : ""}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-slate-600">
                    <span className="block">custo</span>
                    <span className="num block text-sm font-bold text-fg">{brl(rec.length ? calc.total : p.preco_custo)}</span>
                  </span>
                </button>
                {aberto && (
                  <DetalhePeca peca={p} linhas={rec} porId={porId} produtos={produtos} fornDe={fornDe} editavel={editavel}
                    aoMudar={() => invalidar("produto_componentes", "produtos")} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DetalhePeca({ peca, linhas, porId, produtos, fornDe, editavel, aoMudar }: {
  peca: Produto; linhas: Linha[]; porId: Map<string, Produto>; produtos: Produto[]; fornDe: Map<string, Fornecimento[]>; editavel: boolean; aoMudar: () => void;
}) {
  const [novo, setNovo] = useState<Produto | null>(null);
  const [valor, setValor] = useState("");
  const [direto, setDireto] = useState(false); // material com cálculo: pôr a quantidade direto, sem medir
  const [gravando, setGravando] = useState(false);
  const calc = custoReceita(linhas, (id) => porId.get(id)?.preco_custo);
  const custoCadastro = Number(peca.preco_custo ?? 0);
  const diferente = linhas.length > 0 && calc.semCusto.length === 0 && Math.abs(calc.total - custoCadastro) >= 0.01;
  // insumos que podem entrar: o que não é máquina nem serviço, e não a própria peça
  const opcoes = useMemo(() => produtos.filter((p) => p.ativo && !p.unificado_em && p.id !== peca.id && p.tipo !== "maquina" && p.tipo !== "servico"
    && !linhas.some((l) => l.componente_id === p.id)), [produtos, peca.id, linhas]);
  const calcula = !!novo && temCalculo(novo) && !direto;
  const quantidade = numero(valor) > 0 ? numero(valor) : 0;

  async function incluir(q = quantidade, uso: UsoMaterial | null = null) {
    if (!novo || !(q > 0)) return notify("Escolha o insumo e diga quanto vai na peça.", "erro");
    setGravando(true);
    try {
      const { error } = await supabase.from("produto_componentes").insert({ produto_id: peca.id, componente_id: novo.id, quantidade: q, uso, ordem: linhas.length });
      if (error) throw error;
      notify(`${novo.descricao} entrou na receita`);
      setNovo(null); setValor("");
      aoMudar();
    } catch (e) { notifyError(e); } finally { setGravando(false); }
  }
  async function tirar(l: Linha) {
    if (!(await confirmar(`Tirar ${porId.get(l.componente_id)?.descricao ?? "este insumo"} da receita?`))) return;
    const { error } = await supabase.from("produto_componentes").delete().eq("id", l.id);
    if (error) return notifyError(error);
    notify("Insumo tirado da receita");
    aoMudar();
  }
  async function usarCusto() {
    if (!(await confirmar(`Gravar ${brl(calc.total)} como custo de ${peca.descricao}? (hoje: ${brl(custoCadastro)})`))) return;
    setGravando(true);
    const { error } = await supabase.from("produtos").update({ preco_custo: calc.total, motivo_alteracao: "Custo pela receita da tornearia" }).eq("id", peca.id);
    setGravando(false);
    if (error) return notifyError(error);
    notify("Custo da peça atualizado");
    aoMudar();
  }

  return (
    <div className="space-y-4 border-t border-slate-100 p-3">
      <section aria-label="Receita">
        <h3 className="mb-1.5 text-sm font-semibold text-fg">O que vai na peça</h3>
        {!linhas.length ? (
          <p className="text-sm text-slate-500">Nenhum insumo ainda. {editavel ? "Inclua a barra ou a chapa e quanto vai em cada peça." : ""}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {linhas.map((l) => {
              const ins = porId.get(l.componente_id);
              const f = fornDe.get(l.componente_id)?.[0];
              const d = ins && ehBarraPorKg(ins) ? diametroDoNome(ins.descricao) : null;
              const comoMede = ins && l.uso ? textoUso(ins, l.uso) : "";
              const custo = Number(ins?.preco_custo ?? 0);
              return (
                <li key={l.id} className="flex items-start gap-2 p-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-fg">{ins?.descricao ?? "Insumo apagado"}</span>
                    <span className="block text-xs text-slate-600">
                      <span className="num">{qtd(l.quantidade)} {ins?.unidade ?? ""}</span>{comoMede ? ` (${comoMede})` : d ? ` (≈ ${mmDaBarra(d, Number(l.quantidade))} mm)` : ""}
                      {" · "}{custo > 0 ? `${brl(custo)}/${ins?.unidade ?? "un"}` : <span className="font-semibold text-amber-800">insumo sem custo</span>}
                      {" · "}{f ? `${f.fornecedor?.nome ?? "fornecedor"}${f.preco ? ` ${brl(f.preco)}` : ""}` : "sem fornecedor"}
                    </span>
                  </span>
                  <span className="num shrink-0 font-semibold">{brl(custo * Number(l.quantidade))}</span>
                  {editavel && <Button variant="ghost" tamanho="mini" onClick={() => tirar(l)} aria-label={`Tirar ${ins?.descricao ?? "insumo"}`}><Trash2 size={14} aria-hidden /></Button>}
                </li>
              );
            })}
          </ul>
        )}
        {editavel && (
          <div className="mt-2 space-y-2">
            <Field label="Insumo">
              {novo
                ? <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-medium">{novo.descricao}</span>
                    <Button variant="ghost" tamanho="mini" onClick={() => { setNovo(null); setValor(""); }}>Trocar</Button></div>
                : <ProdutoBusca produtos={opcoes} onEscolher={(p) => { setNovo(p); setDireto(false); setValor(""); }} placeholder="Barra, tubo, chapa ou peça comprada" listaAoFocar={false} />}
            </Field>
            {calcula ? <>
              {/* barra, tubo ou chapa: mede a peça e o ERP conta o aproveitamento */}
              <CalculoMaterial material={novo!} onUsar={(q, uso) => incluir(q, uso)} rotuloUsar="Incluir na receita" ocupado={gravando} />
              <button type="button" className="link-discreto text-xs" onClick={() => setDireto(true)}>Pôr a quantidade direto ({novo!.unidade ?? "un"})</button>
            </> : novo && (
              <div className="flex flex-wrap items-end gap-2">
                <Field label={`Quanto vai em cada peça (${novo.unidade ?? "un"})`}>
                  <input className="input w-full sm:w-40" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") incluir(); }} />
                </Field>
                <Button variant="secondary" onClick={() => incluir()} carregando={gravando} disabled={!(quantidade > 0)}><Plus size={15} aria-hidden /> Incluir</Button>
                {temCalculo(novo) && <button type="button" className="link-acao text-xs" onClick={() => setDireto(false)}>Calcular pelo tamanho da peça</button>}
              </div>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-sm">
          <span>
            Custo dos insumos: <b className="num">{brl(calc.total)}</b>
            <span className="text-slate-600"> · no cadastro: <span className="num">{brl(custoCadastro)}</span></span>
            {calc.semCusto.length > 0 && <span className="ml-1 inline-flex items-center gap-1 text-amber-800"><AlertTriangle size={13} aria-hidden /> {calc.semCusto.length} {pl(calc.semCusto.length, "insumo sem custo", "insumos sem custo")}</span>}
          </span>
          {editavel && diferente && <Button tamanho="mini" variant="secondary" onClick={usarCusto} carregando={gravando}>Usar este custo</Button>}
        </div>
      </section>

      <section aria-label="Quem faz ou vende pronta">
        <h3 className="mb-1.5 text-sm font-semibold text-fg">Quem faz ou vende pronta</h3>
        {(fornDe.get(peca.id) ?? []).length ? (
          <ul className="flex flex-wrap gap-1.5">
            {(fornDe.get(peca.id) ?? []).map((f, i) => (
              <li key={i}><Badge value={`${f.fornecedor?.nome ?? "Fornecedor"}${f.preco ? ` · ${brl(f.preco)}` : ""}${f.preferido ? " · preferido" : ""}`} /></li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">Feita só aqui (nenhum fornecedor da peça pronta).</p>}
      </section>

      <section aria-label="Desenho técnico">
        <h3 className="mb-1.5 text-sm font-semibold text-fg">Desenho técnico</h3>
        <DocumentosMaquina produtoId={peca.id} podeEditar={editavel} tipos={["desenho"]} />
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to="/producao?aba=producao&op=tornearia" className="link-acao text-sm">Pedir produção (OP da tornearia)</Link>
        <Link to={`/produtos/tornearia?editar=${peca.id}`} className="link-discreto text-sm">Abrir o cadastro</Link>
      </div>
    </div>
  );
}
