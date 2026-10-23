// Troca do Tiny pelo ERP: o plano por fases (prazo, quem faz, feito) e o andamento medido no próprio ERP
// (notas emitidas aqui x no Tiny, vendas, pessoas que entraram, banco conferido, estoque contado, cadastros incompletos).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Circle, ClipboardCheck, FileText, Landmark, PackageSearch, ShoppingCart, Users, Upload } from "lucide-react";
import { Button, Card, PageHeader, Stat } from "@/components/ui";
import { ler, useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { rotuloPapel } from "@/lib/permissoes";
import { useVisivel } from "@/lib/menu";

type Etapa = {
  id: string; fase: number; ordem: number; titulo: string; detalhe: string | null; prazo: string | null; responsavel: string | null;
  indicador: string | null; feito_em: string | null; feito_nome: string | null; observacao: string | null;
};

type Indicadores = {
  usuarios: { nome: string; papel: string; ultimo_login: string | null }[];
  notas_erp_14d: number; notas_tiny_14d: number; notas_tiny_ultima: string | null; notas_erp_ultima: string | null;
  pedidos_7d: number; pedidos_30d: number; contas_7d: number; extrato_30d: number; extrato_conciliado_30d: number;
  os_30d: number; op_30d: number; estoque_itens: number; estoque_contados_60d: number;
  pecas_sem_custo: number; insumos_sem_custo: number; sem_ncm: number;
  clientes_sem_doc: number; clientes_sem_telefone: number; clientes_sem_uf: number; fornecedores_sem_cnpj: number;
};

const FASES: Record<number, { titulo: string; quando: string }> = {
  1: { titulo: "Arrumar a casa", quando: "cadastros, estoque, pessoas e impostos certos antes de virar" },
  2: { titulo: "Vendas, notas e financeiro só no ERP", quando: "o Tiny fica só para consulta" },
  3: { titulo: "Fábrica e assistência", quando: "compras, produção, estoque SC/SP e OS" },
  4: { titulo: "Desligar o Tiny", quando: "histórico guardado e assinatura cancelada" },
};

/** Onde resolver cada indicador. */
const LINK: Record<string, string> = {
  usuarios: "/usuarios", estoque_contado: "/estoque", custos: "/produtos/pecas", ncm: "/estoque", clientes: "/clientes",
  fornecedores: "/fornecedores", pedidos: "/pedidos", notas_erp: "/notas", contas: "/financeiro", extrato: "/conciliacao",
  producao: "/producao", os: "/assistencia",
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O que o ERP mede para a etapa: texto do andamento e se já está cumprida. */
export function andamento(ind: string | null, d: Indicadores | undefined): { texto: string; ok: boolean } | null {
  if (!ind || !d) return null;
  switch (ind) {
    case "usuarios": {
      const entraram = d.usuarios.filter((u) => u.ultimo_login).length;
      const faltam = d.usuarios.filter((u) => !u.ultimo_login).map((u) => `${u.nome} (${rotuloPapel(u.papel)})`);
      return { ok: entraram === d.usuarios.length, texto: `${entraram} de ${d.usuarios.length} já entraram${faltam.length ? ` · falta: ${faltam.join(", ")}` : ""}` };
    }
    case "estoque_contado":
      return { ok: pct(d.estoque_contados_60d, d.estoque_itens) >= 95, texto: `${d.estoque_contados_60d} de ${d.estoque_itens} itens contados nos últimos 60 dias (${pct(d.estoque_contados_60d, d.estoque_itens)}%)` };
    case "custos":
      return { ok: d.pecas_sem_custo + d.insumos_sem_custo === 0, texto: d.pecas_sem_custo + d.insumos_sem_custo === 0 ? "todos com custo" : `sem custo: ${plural(d.pecas_sem_custo, "peça", "peças")} e ${plural(d.insumos_sem_custo, "insumo", "insumos")}` };
    case "ncm":
      return { ok: d.sem_ncm === 0, texto: d.sem_ncm ? `${plural(d.sem_ncm, "produto", "produtos")} sem NCM` : "todos com NCM" };
    case "clientes": {
      const ok = d.clientes_sem_doc + d.clientes_sem_telefone + d.clientes_sem_uf === 0;
      return { ok, texto: ok ? "todos completos" : `sem CPF/CNPJ: ${d.clientes_sem_doc} · sem telefone: ${d.clientes_sem_telefone} · sem estado: ${d.clientes_sem_uf}` };
    }
    case "fornecedores":
      return { ok: d.fornecedores_sem_cnpj === 0, texto: d.fornecedores_sem_cnpj ? `${plural(d.fornecedores_sem_cnpj, "fornecedor", "fornecedores")} sem CNPJ` : "todos com CNPJ" };
    case "pedidos":
      return { ok: d.pedidos_7d > 0, texto: `${plural(d.pedidos_7d, "venda", "vendas")} no ERP nos últimos 7 dias` };
    case "notas_erp":
      return { ok: d.notas_erp_14d > 0 && d.notas_tiny_14d === 0, texto: `últimos 14 dias: ${d.notas_erp_14d} pelo ERP · ${d.notas_tiny_14d} pelo Tiny${d.notas_tiny_ultima ? ` (última do Tiny em ${dataBR(d.notas_tiny_ultima)})` : ""}` };
    case "contas":
      return { ok: d.contas_7d > 0, texto: `${plural(d.contas_7d, "conta lançada", "contas lançadas")} nos últimos 7 dias` };
    case "extrato":
      return { ok: d.extrato_30d > 0 && pct(d.extrato_conciliado_30d, d.extrato_30d) >= 90, texto: d.extrato_30d ? `${d.extrato_conciliado_30d} de ${d.extrato_30d} lançamentos do banco conferidos (30 dias)` : "nenhum extrato do banco nos últimos 30 dias" };
    case "producao":
      return { ok: d.op_30d > 0, texto: `${plural(d.op_30d, "ordem de produção", "ordens de produção")} nos últimos 30 dias` };
    case "os":
      return { ok: d.os_30d > 0, texto: `${plural(d.os_30d, "OS aberta", "OS abertas")} nos últimos 30 dias` };
    default:
      return null;
  }
}

export default function Implantacao() {
  const vis = useVisivel();
  const { tem, papel } = usePerfil();
  const podeMarcar = tem("financeiro");
  const admin = papel === "admin";
  const invalidar = useInvalidate();
  const { data: etapas = [], isLoading } = useRows<Etapa>("implantacao_etapas", { order: "fase", ascending: true });
  const { data: ind } = useQuery({
    queryKey: ["implantacao_etapas", "indicadores"],
    queryFn: async () => (await ler(supabase.rpc("implantacao_indicadores"))) as Indicadores,
  });
  const [editando, setEditando] = useState(false);
  const fases = useMemo(() => {
    const m = new Map<number, Etapa[]>();
    for (const e of [...etapas].sort((a, b) => a.fase - b.fase || a.ordem - b.ordem)) m.set(e.fase, [...(m.get(e.fase) ?? []), e]);
    return [...m.entries()];
  }, [etapas]);
  const feitas = etapas.filter((e) => e.feito_em).length;
  const proxima = [...etapas].sort((a, b) => a.fase - b.fase || a.ordem - b.ordem).find((e) => !e.feito_em);

  async function gravar(e: Etapa, patch: Partial<Etapa>, ok?: string) {
    const { error } = await supabase.from("implantacao_etapas").update(patch).eq("id", e.id);
    if (error) return notifyError(error);
    if (ok) notify(ok);
    invalidar("implantacao_etapas");
  }

  const entraram = ind ? ind.usuarios.filter((u) => u.ultimo_login).length : 0;
  const notasTotal = ind ? ind.notas_erp_14d + ind.notas_tiny_14d : 0;

  return (
    <div>
      <PageHeader title="Troca do Tiny"
        subtitle="O plano por fases, quem faz e até quando. Os números abaixo são medidos no próprio ERP e atualizam sozinhos."
        actions={<>
          {/* o que vem do Tiny (planilhas, XML, contas) entra por aqui */}
          {vis.ve("importar", "/importar") && <Link to="/importar" className="inline-flex min-h-toque items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:min-h-0"><Upload size={16} aria-hidden /> Importar dados</Link>}
          {admin && <Button variant={editando ? "primary" : "secondary"} onClick={() => setEditando(!editando)}>{editando ? "Pronto" : "Mudar prazos e responsáveis"}</Button>}
        </>} />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Notas pelo ERP (14 dias)" icon={FileText} tom={ind && ind.notas_tiny_14d === 0 && ind.notas_erp_14d > 0 ? "bom" : "atencao"}
          valor={ind ? (notasTotal ? `${pct(ind.notas_erp_14d, notasTotal)}%` : "—") : "…"}
          sub={ind ? `${ind.notas_erp_14d} pelo ERP · ${ind.notas_tiny_14d} pelo Tiny` : undefined} />
        <Stat label="Vendas no ERP (7 dias)" icon={ShoppingCart} tom={ind?.pedidos_7d ? "bom" : "atencao"}
          valor={ind ? String(ind.pedidos_7d) : "…"} sub={ind ? `${ind.pedidos_30d} nos últimos 30 dias` : undefined} />
        <Stat label="Pessoas que já entraram" icon={Users} tom={ind && entraram === ind.usuarios.length ? "bom" : "atencao"}
          valor={ind ? `${entraram} de ${ind.usuarios.length}` : "…"}
          sub={ind ? ind.usuarios.filter((u) => !u.ultimo_login).map((u) => u.nome.split(" ")[0]).join(", ") || "todos" : undefined} />
        <Stat label="Banco conferido (30 dias)" icon={Landmark} tom={ind && ind.extrato_30d && pct(ind.extrato_conciliado_30d, ind.extrato_30d) >= 90 ? "bom" : "atencao"}
          valor={ind ? (ind.extrato_30d ? `${pct(ind.extrato_conciliado_30d, ind.extrato_30d)}%` : "—") : "…"}
          sub={ind ? `${ind.extrato_conciliado_30d} de ${ind.extrato_30d} lançamentos` : undefined} />
      </div>

      <Card className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <ClipboardCheck size={20} className="shrink-0 text-modulo-texto" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{feitas} de {etapas.length} etapas feitas</p>
          {proxima && <p className="text-sm text-slate-600">Próxima: <b>{proxima.titulo}</b>{proxima.prazo ? ` · até ${dataBR(proxima.prazo)}` : ""}{proxima.responsavel ? ` · ${proxima.responsavel}` : ""}</p>}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 sm:w-48" role="progressbar" aria-valuenow={pct(feitas, etapas.length)} aria-valuemin={0} aria-valuemax={100} aria-label="Etapas feitas">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct(feitas, etapas.length)}%` }} />
        </div>
      </Card>

      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      <div className="space-y-5">
        {fases.map(([fase, lista]) => {
          const f = FASES[fase] ?? { titulo: `Fase ${fase}`, quando: "" };
          const prontas = lista.filter((e) => e.feito_em).length;
          return (
            <section key={fase} aria-labelledby={`fase-${fase}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`fase-${fase}`} className="text-base font-bold text-fg">
                  <span className="mr-2 rounded-md bg-modulo/15 px-2 py-0.5 text-xs font-bold text-modulo-texto">Fase {fase}</span>{f.titulo}
                </h2>
                <span className="text-xs text-slate-500">{f.quando} · {prontas} de {lista.length} feitas</span>
              </div>
              <Card>
                <ul className="divide-y divide-slate-100">
                  {lista.map((e) => {
                    const a = andamento(e.indicador, ind);
                    const atrasada = !e.feito_em && e.prazo && e.prazo < hoje();
                    return (
                      <li key={e.id} className="flex gap-3 p-3 sm:p-4">
                        <button type="button" disabled={!podeMarcar}
                          aria-label={e.feito_em ? `Desmarcar: ${e.titulo}` : `Marcar como feito: ${e.titulo}`} aria-pressed={!!e.feito_em}
                          onClick={() => gravar(e, { feito_em: e.feito_em ? null : new Date().toISOString() }, e.feito_em ? "Etapa reaberta" : "Etapa marcada como feita")}
                          className={`mt-0.5 shrink-0 rounded-full ${e.feito_em ? "text-emerald-600" : "text-slate-400 hover:text-slate-600"} disabled:cursor-default`}>
                          {e.feito_em ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold ${e.feito_em ? "text-slate-500 line-through" : "text-fg"}`}>{e.titulo}</p>
                          {e.detalhe && <p className="text-sm text-slate-600">{e.detalhe}</p>}
                          {a && (
                            <p className={`mt-1 inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium [overflow-wrap:anywhere] ${a.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                              <PackageSearch size={13} className="shrink-0" aria-hidden /> {a.texto}
                              {LINK[e.indicador!] && <Link to={LINK[e.indicador!]} className="ml-1 inline-flex shrink-0 items-center font-semibold underline">abrir <ChevronRight size={12} aria-hidden /></Link>}
                            </p>
                          )}
                          {editando ? (
                            <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr]">
                              <input type="date" className="input" aria-label={`Prazo de ${e.titulo}`} defaultValue={e.prazo ?? ""}
                                onBlur={(ev) => ev.target.value !== (e.prazo ?? "") && gravar(e, { prazo: ev.target.value || null }, "Prazo alterado")} />
                              <input className="input" aria-label={`Responsável por ${e.titulo}`} placeholder="Responsável" defaultValue={e.responsavel ?? ""}
                                onBlur={(ev) => ev.target.value.trim() !== (e.responsavel ?? "") && gravar(e, { responsavel: ev.target.value.trim() || null }, "Responsável alterado")} />
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-slate-500">
                              {e.prazo && <span className={atrasada ? "font-semibold text-red-700" : ""}>{atrasada ? "Atrasada · " : ""}até {dataBR(e.prazo)}</span>}
                              {e.responsavel && <> · {e.responsavel}</>}
                              {e.feito_em && <> · feito em {dataBR(e.feito_em)}{e.feito_nome ? ` por ${e.feito_nome}` : ""}</>}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}
