// Financeiro → Plano de contas: as categorias agrupadas pela linha do DRE em que entram (na ordem do resultado),
// com quanto cada uma movimentou; avisa das categorias usadas nas contas que não estão no plano. Em "Editar":
// mudar a linha do DRE, fixa ou variável (margem de contribuição e ponto de equilíbrio), desativar/reativar e criar categoria. Ao lado, os centros de custo (fábrica, loja,
// assistência…) usados para dividir os lançamentos.
import { useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Check, Pencil, Plus } from "lucide-react";
import { Button, Card, Field } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { brl, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { mesesAte, norm, ORDEM_DRE, rotuloCategoria, type GrupoDre, type LancDre } from "@/lib/dre";
import { GRUPOS, useCategorias, useCentros, type Categoria } from "./CategoriaRateio";
import { comportamentoDe } from "@/lib/dreNotas";
import { CATEGORIAS_SUGERIDAS, resumoLucroReal, ROTULO_CREDITO, ROTULO_DEDUCAO, tratamentoLucroReal } from "@/lib/planoLucroReal";

const COR_SINAL = { "+": "bg-emerald-100 text-emerald-800", "−": "bg-red-100 text-red-800", "±": "bg-amber-100 text-amber-800", fora: "bg-slate-100 text-slate-600" };
const tipoDe = (l: LancDre) => (l.tipo === "receber" ? "receita" : "despesa");
type Uso = { n: number; total: number };

export function PlanoContas({ lancamentos = [] }: { lancamentos?: LancDre[] }) {
  const { pode } = usePerfil();
  const podeEditar = pode("editar_financeiro");
  const { data: cats = [] } = useCategorias();
  const { data: centros = [] } = useCentros();
  const invalidate = useInvalidate();
  const [editando, setEditando] = useState(false);
  const [nova, setNova] = useState<{ nome: string; tipo: "receita" | "despesa"; grupo: GrupoDre }>({ nome: "", tipo: "despesa", grupo: "despesa_operacional" });
  const [centro, setCentro] = useState({ nome: "", descricao: "" });
  const campoNova = useRef<HTMLInputElement>(null);
  const desde = mesesAte(hoje(), 12)[0];

  // movimento de cada categoria nos últimos 12 meses (com as contas já lançadas para a frente)
  const { uso, semCadastro, semCategoria } = useMemo(() => {
    const uso = new Map<string, Uso & { nome: string; tipo: "receita" | "despesa" }>();
    const semCategoria = { receita: 0, despesa: 0 };
    for (const l of lancamentos) {
      if (l.status === "cancelado" || (l.competencia ?? l.vencimento ?? "").slice(0, 7) < desde) continue;
      const tipo = tipoDe(l);
      if (!norm(l.categoria)) { semCategoria[tipo]++; continue; }
      const k = `${tipo}|${norm(l.categoria)}`;
      const u = uso.get(k) ?? { n: 0, total: 0, nome: l.categoria!.trim(), tipo };
      u.n++; u.total += Number(l.valor) || 0;
      uso.set(k, u);
    }
    const cadastradas = new Set(cats.map((c) => `${c.tipo}|${norm(c.nome)}`));
    const semCadastro = [...uso.entries()].filter(([k]) => !cadastradas.has(k)).map(([, u]) => u).sort((a, b) => b.total - a.total);
    return { uso, semCadastro, semCategoria };
  }, [lancamentos, cats, desde]);

  async function salvarCategoria(c: Partial<Categoria> & { id?: string }) {
    const { id, ...row } = c;
    const { error } = id ? await supabase.from("categorias_financeiras").update(row).eq("id", id) : await supabase.from("categorias_financeiras").insert(row);
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("já existe uma categoria com esse nome") : error);
    invalidate("categorias_financeiras");
    return true;
  }
  async function criarCategoria(e: FormEvent) {
    e.preventDefault();
    if (await salvarCategoria({ nome: nova.nome.trim(), tipo: nova.tipo, grupo: nova.grupo, ordem: 100 })) {
      notify("Categoria criada"); setNova({ ...nova, nome: "" });
    }
  }
  function cadastrar(u: { nome: string; tipo: "receita" | "despesa" }) {
    setNova({ nome: u.nome, tipo: u.tipo, grupo: u.tipo === "receita" ? "receita" : "despesa_operacional" });
    setEditando(true);
    setTimeout(() => { campoNova.current?.scrollIntoView({ block: "center", behavior: "smooth" }); campoNova.current?.focus(); }, 50);
  }
  async function criarCentro(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("centros_custo").insert({ nome: centro.nome.trim(), descricao: centro.descricao.trim() || null });
    if (error) return notifyError(/duplicate|unique/i.test(error.message) ? new Error("já existe um centro de custo com esse nome") : error);
    notify("Centro de custo criado"); setCentro({ nome: "", descricao: "" }); invalidate("centros_custo");
  }
  async function ativarCentro(id: string, ativo: boolean) {
    const { error } = await supabase.from("centros_custo").update({ ativo }).eq("id", id);
    if (error) return notifyError(error);
    invalidate("centros_custo");
  }

  const ordenar = (a: Categoria, b: Categoria) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR");
  const desativadas = cats.filter((c) => !c.ativo).sort(ordenar);
  const linhaCategoria = (c: Categoria, ambos: boolean) => (
    <LinhaCategoria key={c.id} c={c} ambos={ambos} editando={editando} uso={uso.get(`${c.tipo}|${norm(c.nome)}`)}
      onGrupo={(grupo) => salvarCategoria({ id: c.id, grupo }).then((ok) => ok && notify("Linha do DRE alterada"))}
      onComportamento={(comportamento) => salvarCategoria({ id: c.id, comportamento }).then((ok) => ok && notify(comportamento ? `Marcada como ${comportamento === "fixa" ? "fixa" : "variável"}` : "Volta para a sugestão do ERP"))}
      onAtivo={(ativo) => salvarCategoria({ id: c.id, ativo }).then((ok) => ok && notify(ativo ? "Categoria reativada" : "Categoria desativada"))} />
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {(semCadastro.length > 0 || semCategoria.receita + semCategoria.despesa > 0) && (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" >
            <h3 className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} aria-hidden /> Contas com categoria fora do plano</h3>
            <p className="mb-2 text-amber-800">No DRE elas entram como receita bruta (a receber) ou despesa operacional (a pagar). Cadastre para escolher a linha certa.</p>
            <ul className="space-y-1">
              {semCadastro.map((u) => (
                <li key={`${u.tipo}|${u.nome}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <b>{rotuloCategoria(u.nome)}</b>
                  <span className="text-xs">({u.tipo}) · {u.n} conta{u.n > 1 ? "s" : ""} · {brl(u.total)}</span>
                  {podeEditar && <button type="button" className="link-acao ml-auto text-xs" onClick={() => cadastrar(u)}>Cadastrar</button>}
                </li>
              ))}
              {semCategoria.receita > 0 && <li>{semCategoria.receita} conta{semCategoria.receita > 1 ? "s" : ""} a receber sem categoria</li>}
              {semCategoria.despesa > 0 && <li>{semCategoria.despesa} conta{semCategoria.despesa > 1 ? "s" : ""} a pagar sem categoria</li>}
            </ul>
          </Card>
        )}

        <LucroRealResumo cats={cats} uso={uso} podeEditar={podeEditar}
          criar={(nome, grupo) => salvarCategoria({ nome, tipo: "despesa", grupo, ordem: 100 }).then((ok) => ok && notify(`Categoria "${nome}" criada`))} />

        <Card className="p-4">
          <div className="mb-1 flex items-start justify-between gap-2">
            <h2 className="font-bold">Categorias (plano de contas)</h2>
            {podeEditar && (
              <Button type="button" variant={editando ? "primary" : "secondary"} className="shrink-0" onClick={() => setEditando(!editando)} aria-pressed={editando}>
                {editando ? <><Check size={16} aria-hidden /> Concluir</> : <><Pencil size={16} aria-hidden /> Editar</>}
              </Button>
            )}
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Na ordem do DRE: cada categoria entra na linha em que está. Ao lado, quanto ela movimentou nos últimos 12 meses (com as contas já lançadas para a frente).
            {editando && " Categoria não muda de nome, para não perder o histórico: desative a antiga e crie outra."}
          </p>

          <div className="space-y-4">
            {ORDEM_DRE.map((o) => {
              const lista = cats.filter((c) => c.ativo && c.grupo === o.grupo).sort(ordenar);
              const ambos = GRUPOS.find((g) => g.value === o.grupo)?.tipo === "ambos";
              return (
                <section key={o.grupo} aria-labelledby={`dre-${o.grupo}`}>
                  <div className="flex items-center gap-2">
                    <span className={`min-w-7 rounded-md px-1.5 py-0.5 text-center text-xs font-bold ${COR_SINAL[o.sinal]}`} aria-hidden>{o.sinal}</span>
                    <h3 id={`dre-${o.grupo}`} className="font-semibold">{o.rotulo}</h3>
                    <span className="text-xs text-slate-500">{lista.length || ""}</span>
                  </div>
                  <p className="mb-1 pl-9 text-xs text-slate-500">{o.dica}</p>
                  {lista.length > 0 ? (
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 sm:ml-9">{lista.map((c) => linhaCategoria(c, ambos))}</ul>
                  ) : <p className="pl-9 text-xs italic text-slate-400">Nenhuma categoria nesta linha.</p>}
                </section>
              );
            })}
          </div>

          {desativadas.length > 0 && (
            <details className="mt-4 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-semibold text-slate-600">Desativadas ({desativadas.length})</summary>
              <ul className="mt-1 divide-y divide-slate-100">{desativadas.map((c) => linhaCategoria(c, true))}</ul>
            </details>
          )}

          {podeEditar && (
            <form onSubmit={criarCategoria} className="mt-4 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(10rem,1fr)_8rem_15rem_auto] sm:items-end">
              <Field label="Nova categoria"><input ref={campoNova} className="input" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} required minLength={2} maxLength={60} placeholder="Ex.: Combustível" /></Field>
              <Field label="Tipo">
                <select className="input" value={nova.tipo} onChange={(e) => { const t = e.target.value as "receita" | "despesa"; setNova({ ...nova, tipo: t, grupo: t === "receita" ? "receita" : "despesa_operacional" }); }}>
                  <option value="despesa">Despesa</option><option value="receita">Receita</option>
                </select>
              </Field>
              <Field label="Linha do DRE">
                <select className="input" value={nova.grupo} onChange={(e) => setNova({ ...nova, grupo: e.target.value as GrupoDre })}>
                  {GRUPOS.filter((g) => g.tipo === nova.tipo || g.tipo === "ambos").map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </Field>
              <Button><Plus size={16} aria-hidden /> Criar</Button>
            </form>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-1 font-bold">Centros de custo</h2>
        <p className="mb-3 text-sm text-slate-600">Separe receitas e despesas por área (fábrica, loja, assistência, filial). Um lançamento pode ser dividido entre vários centros.</p>
        {!centros.length ? <p className="text-sm text-slate-500">Nenhum centro de custo ainda.</p> : (
          <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {centros.map((c) => (
              <li key={c.id} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${c.ativo ? "" : "opacity-90"}`}>
                <span className="min-w-0"><b>{c.nome}</b>{c.descricao && <span className="block text-xs text-slate-500">{c.descricao}</span>}</span>
                {podeEditar && <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" className="h-4 w-4" checked={c.ativo} onChange={(e) => ativarCentro(c.id, e.target.checked)} /> Ativo</label>}
              </li>
            ))}
          </ul>
        )}
        {podeEditar && (
          <form onSubmit={criarCentro} className="space-y-2 border-t border-slate-100 pt-3">
            <Field label="Novo centro de custo"><input className="input" value={centro.nome} onChange={(e) => setCentro({ ...centro, nome: e.target.value })} required minLength={2} maxLength={60} placeholder="Ex.: Fábrica" /></Field>
            <Field label="Descrição (opcional)"><input className="input" value={centro.descricao} onChange={(e) => setCentro({ ...centro, descricao: e.target.value })} /></Field>
            <Button><Plus size={16} aria-hidden /> Criar centro</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

/** Uma categoria: nome e movimento; em "Editar", a linha do DRE e ativa/desativada. */
function LinhaCategoria({ c, ambos, editando, uso, onGrupo, onAtivo, onComportamento }: {
  c: Categoria; ambos: boolean; editando: boolean; uso?: Uso; onGrupo: (g: GrupoDre) => void; onAtivo: (ativo: boolean) => void;
  onComportamento: (v: "fixa" | "variavel" | null) => void;
}) {
  const nome = rotuloCategoria(c.nome);
  const despesa = c.tipo === "despesa" && !["investimento", "retirada", "transferencia"].includes(c.grupo);
  const comp = comportamentoDe(c.grupo, c.nome, c.comportamento);
  const chipComp = despesa && (
    <span className={`ml-1.5 rounded px-1.5 py-0.5 text-2xs font-semibold ${comp.valor === "fixa" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900"} ${comp.sugerido ? "opacity-90" : ""}`}
      title={comp.sugerido ? "Sugestão do ERP (pelo grupo e pelo nome); troque em Editar" : "Marcada no plano de contas"}>
      {comp.valor === "fixa" ? "fixa" : "variável"}{comp.sugerido ? "*" : ""}
    </span>
  );
  const etiqueta = ambos && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-2xs font-normal text-slate-600">{c.tipo}</span>;
  if (!editando) {
    return (
      <li className={`flex items-center gap-3 px-3 py-2 text-sm ${c.ativo ? "" : "opacity-90"}`}>
        <span className="min-w-0 flex-1 font-medium">{nome}{etiqueta}{chipComp}<ChipLucroReal nome={c.nome} grupo={c.grupo} /></span>
        <span className="shrink-0 text-right text-xs text-slate-500">
          {uso ? <><span className="num block font-semibold text-slate-700">{brl(uso.total)}</span>{uso.n} conta{uso.n > 1 ? "s" : ""}</> : "sem uso"}
        </span>
      </li>
    );
  }
  return (
    <li className={`space-y-2 px-3 py-2 text-sm sm:flex sm:items-center sm:gap-3 sm:space-y-0 ${c.ativo ? "" : "opacity-90"}`}>
      <span className="block min-w-0 font-medium sm:flex-1">{nome}{etiqueta}</span>
      <div className="flex items-center gap-3">
        <select className="input min-w-0 flex-1 py-1.5 sm:w-60 sm:flex-none" value={c.grupo} aria-label={`Linha do DRE de ${nome}`} onChange={(e) => onGrupo(e.target.value as GrupoDre)}>
          {GRUPOS.filter((g) => g.tipo === c.tipo || g.tipo === "ambos").map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        {despesa && (
          <select className="input w-36 shrink-0 py-1.5" value={c.comportamento ?? ""} aria-label={`Fixa ou variável: ${nome}`}
            onChange={(e) => onComportamento((e.target.value || null) as "fixa" | "variavel" | null)}>
            <option value="">Sugestão ({comportamentoDe(c.grupo, c.nome).valor === "fixa" ? "fixa" : "variável"})</option>
            <option value="fixa">Fixa</option>
            <option value="variavel">Variável</option>
          </select>
        )}
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" className="h-4 w-4" checked={c.ativo} onChange={(e) => onAtivo(e.target.checked)} /> Ativa
        </label>
      </div>
    </li>
  );
}

const COR_DEDUCAO = { sim: "bg-emerald-100 text-emerald-800", parcial: "bg-amber-100 text-amber-900", nao: "bg-red-100 text-red-800", fora: "bg-slate-100 text-slate-600" };

/** Como a categoria entra no Lucro Real (toque/passe o mouse para ver a base legal). */
function ChipLucroReal({ nome, grupo }: { nome: string; grupo: string }) {
  if (grupo === "receita" || grupo === "receita_financeira") return null;
  const t = tratamentoLucroReal(nome, grupo);
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle" title={t.nota}>
      <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${COR_DEDUCAO[t.deducao]}`}>{grupo === "deducao" ? "dedução da receita" : ROTULO_DEDUCAO[t.deducao]}</span>
      {t.credito !== "nao" && <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${t.credito === "sim" ? "bg-violet-100 text-violet-800" : "bg-violet-50 text-violet-700"}`}>{ROTULO_CREDITO[t.credito]}</span>}
    </span>
  );
}

/** Resumo do plano no Lucro Real: quanto abate o IRPJ/CSLL, o que não abate e a base de crédito de PIS/COFINS; e as categorias que faltam. */
function LucroRealResumo({ cats, uso, podeEditar, criar }: {
  cats: Categoria[]; uso: Map<string, Uso & { nome: string; tipo: "receita" | "despesa" }>; podeEditar: boolean;
  criar: (nome: string, grupo: GrupoDre) => Promise<unknown>;
}) {
  const r = resumoLucroReal(cats, (nome, tipo) => uso.get(`${tipo}|${norm(nome)}`)?.total ?? 0);
  const existentes = new Set(cats.map((c) => norm(c.nome)));
  const faltam = CATEGORIAS_SUGERIDAS.filter((c) => !existentes.has(norm(c.nome)));
  const blocos: [string, number, string, string][] = [
    ["Abate o IR/CSLL", r.abate, "text-emerald-700", "despesas dedutíveis (12 meses)"],
    ["Abate em parte", r.parcial, "text-amber-700", "juros/multas, veículos, alimentação: separar o que não abate"],
    ["Não abate", r.naoAbate, "text-red-700", "o contador soma de volta no LALUR"],
    ["Base de crédito PIS/COFINS", r.credito, "text-violet-700", `≈ ${brl(r.credito * 0.0925)} de crédito (9,25%)${r.creditoTalvez ? ` + até ${brl(r.creditoTalvez * 0.0925)} se for da produção` : ""}`],
  ];
  return (
    <Card className="p-4">
      <h2 className="font-bold">Lucro Real <span className="text-sm font-normal text-slate-500">· como cada categoria entra no imposto</span></h2>
      <p className="mb-3 text-xs text-slate-500">Estimativa pelo nome da categoria, com a base legal em cada etiqueta (toque para ver). A apuração oficial é do contador.</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {blocos.map(([rot, v, cor, sub]) => (
          <div key={rot} className="rounded-xl border border-slate-200 p-3">
            <p className="text-2xs font-semibold uppercase text-slate-500">{rot}</p>
            <p className={`num text-lg font-bold ${cor}`}>{brl(v)}</p>
            <p className="text-2xs text-slate-500">{sub}</p>
          </div>
        ))}
      </div>
      {faltam.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <h3 className="mb-1 text-sm font-semibold">Categorias que faltam e mudam o imposto</h3>
          <ul className="space-y-1 text-sm">
            {faltam.map((c) => (
              <li key={c.nome} className="flex flex-wrap items-center gap-x-2">
                <b>{rotuloCategoria(c.nome)}</b><span className="text-xs text-slate-500">{c.porque}</span>
                {podeEditar && <button type="button" className="link-acao ml-auto text-xs" onClick={() => criar(c.nome, c.grupo)}>Criar</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
