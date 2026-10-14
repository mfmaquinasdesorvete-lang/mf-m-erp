// Produtos → Auditoria → Códigos EAN: o que está errado no código de barras (inventado, repetido, inválido), o código
// certo que veio na nota do fornecedor, "Sem GTIN" para o que não tem, e os códigos novos pela faixa da empresa na GS1.
// O código trocado vai para "Códigos alternativos": a busca continua achando etiquetas antigas.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, CheckCircle2, CircleAlert, FileSpreadsheet, Lightbulb, Search, Sparkles, XCircle } from "lucide-react";
import { Button, Card, Modal } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { dataBR, pl } from "@/lib/format";
import { baixarPlanilha } from "@/lib/exportar";
import { useConfig } from "@/lib/useConfig";
import {
  analisarGtin, capacidadeFaixa, contextoEan, ehProprio, origemEan, prefixoGs1Valido, problemasEan, proximosGtins, situacaoEan, soDigitos,
  erroCodigoNovo, type ProdutoEan, type SituacaoEan,
} from "@/lib/gtin";
import type { Produto } from "@/lib/types";

type Sugestao = { produto_id: string; ean: string; fornecedor: string | null; codigo_fornecedor: string | null; descricao_nota: string | null; ultima_nota: string | null; notas: number };
type P = ProdutoEan & Produto;
type Acao = { tipo: "sem_gtin" | "gerar"; itens: { p: P; novo: string | null }[] };

const TIPO: Record<string, string> = { maquina: "Máquina", peca: "Peça", acessorio: "Acessório", insumo: "Insumo/componente" };
const FILTROS: { id: SituacaoEan | "todos"; rotulo: string; tom: string }[] = [
  { id: "corrigir", rotulo: "Para corrigir", tom: "text-red-700" },
  { id: "sem_codigo", rotulo: "Sem código", tom: "text-amber-700" },
  { id: "certo", rotulo: "Parecem certos", tom: "text-emerald-700" },
  { id: "sem_gtin", rotulo: "Sem GTIN", tom: "text-slate-600" },
  { id: "todos", rotulo: "Todos", tom: "text-slate-600" },
];

/** Guarda o código antigo nos alternativos (sem repetir), para a busca achar etiquetas já impressas. */
function comAlternativo(p: P, antigo?: string | null) {
  const atual = String(p.codigos_alternativos ?? "").split(/[,;\n|]+/).map((x) => x.trim()).filter(Boolean);
  const d = soDigitos(antigo);
  if (!d || atual.includes(d)) return p.codigos_alternativos ?? null;
  return [...atual, d].join(", ");
}

async function gravar(mudancas: { id: string; dados: Record<string, unknown> }[]) {
  for (let i = 0; i < mudancas.length; i += 8) {
    const res = await Promise.all(mudancas.slice(i, i + 8).map((m) => supabase.from("produtos").update(m.dados).eq("id", m.id)));
    const erro = res.find((r) => r.error)?.error;
    if (erro) throw erro;
  }
}

export function CodigosEan({ produtos, podeEditar, onAbrir }: { produtos: Produto[]; podeEditar: boolean; onAbrir: (p: Produto) => void }) {
  const invalidar = useInvalidate();
  const qc = useQueryClient();
  const { data: cfg } = useConfig();
  const prefixo = soDigitos((cfg as { gs1_prefixo?: string | null } | undefined)?.gs1_prefixo) || null;
  const [filtro, setFiltro] = useState<SituacaoEan | "todos">("corrigir");
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [acao, setAcao] = useState<Acao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [limite, setLimite] = useState(100);

  const { data: sugestoes = [] } = useQuery({
    queryKey: ["produtos", "eans_das_notas"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("eans_das_notas");
      if (error) return [] as Sugestao[];   // sem acesso às notas: só não sugere
      return (data ?? []) as Sugestao[];
    },
  });

  const todos = produtos as P[];
  const ctx = useMemo(() => contextoEan(todos, prefixo), [todos, prefixo]);
  const linhas = useMemo(() => todos.filter((p) => p.ativo !== false && !p.unificado_em).map((p) => {
    const atual = soDigitos(p.codigo_barras);
    const sug = sugestoes.filter((s) => s.produto_id === p.id && s.ean !== atual && !erroCodigoNovo(p, s.ean, ctx)
      && !problemasEan({ ...p, codigo_barras: s.ean, gtin_isento: false }, ctx).length);
    // o fornecedor manda outro código na nota: o do cadastro provavelmente está errado
    const probs = [...problemasEan(p, ctx), ...(atual && sug.length ? [{ nivel: "alerta" as const, texto: "na nota do fornecedor o código é outro (abaixo): confira qual é o certo" }] : [])];
    return { p, sit: atual && sug.length ? "corrigir" as const : situacaoEan(p, ctx), probs, sug, proprio: ehProprio(p, ctx.marca) };
  }), [todos, sugestoes, ctx]);
  const conta = (s: SituacaoEan | "todos") => (s === "todos" ? linhas.length : linhas.filter((l) => l.sit === s).length);
  const termo = busca.trim().toLowerCase();
  const visiveis = linhas
    .filter((l) => (filtro === "todos" || l.sit === filtro) && (!termo || [l.p.descricao, l.p.sku, l.p.codigo_barras, l.p.marca].some((x) => String(x ?? "").toLowerCase().includes(termo))))
    .sort((a, b) => b.sug.length - a.sug.length || Number(b.probs.some((x) => x.nivel === "erro")) - Number(a.probs.some((x) => x.nivel === "erro")) || a.p.descricao.localeCompare(b.p.descricao));
  const usados = useMemo(() => todos.flatMap((p) => [p.codigo_barras, ...String(p.codigos_alternativos ?? "").split(/[,;\n|]+/)]).map((x) => soDigitos(x)).filter(Boolean), [todos]);
  const daFaixa = prefixo ? new Set(usados.filter((u) => u.replace(/^0/, "").startsWith(prefixo))).size : 0;

  async function salvarCodigo(p: P, codigo: string) {
    const erro = erroCodigoNovo(p, codigo, ctx);
    if (erro) return notify(`Não salvou: ${erro}`, "erro");
    setOcupado(true);
    try {
      const d = soDigitos(codigo);
      const antigo = soDigitos(p.codigo_barras);
      await gravar([{ id: p.id, dados: { codigo_barras: d, gtin_isento: false, codigos_alternativos: antigo && antigo !== d ? comAlternativo(p, antigo) : p.codigos_alternativos ?? null } }]);
      notify(`Código de "${p.descricao}" salvo: ${d}`);
      setAberto(null); setRascunho("");
      invalidar("produtos");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  function preparar(tipo: Acao["tipo"], ids: string[]) {
    const ps = linhas.filter((l) => ids.includes(l.p.id)).map((l) => l.p);
    if (!ps.length) return;
    if (tipo === "gerar") {
      if (!prefixo) return notify("Cadastre primeiro a faixa da empresa na GS1 (logo acima)", "erro");
      const novos = proximosGtins(prefixo, usados, ps.length);
      if (novos.length < ps.length) return notify("A faixa da GS1 não tem códigos livres para todos", "erro");
      setAcao({ tipo, itens: ps.map((p, i) => ({ p, novo: novos[i] })) });
    } else setAcao({ tipo, itens: ps.map((p) => ({ p, novo: null })) });
  }

  async function confirmar() {
    if (!acao) return;
    setOcupado(true);
    try {
      await gravar(acao.itens.map(({ p, novo }) => ({
        id: p.id,
        dados: { codigo_barras: novo, gtin_isento: !novo, codigos_alternativos: comAlternativo(p, p.codigo_barras) },
      })));
      notify(acao.tipo === "gerar" ? `${acao.itens.length} ${pl(acao.itens.length, "código", "códigos")} da faixa GS1 ${pl(acao.itens.length, "gravado", "gravados")}. Falta cadastrar cada um no site da GS1 (CNP): baixe a planilha.` : `${acao.itens.length} ${pl(acao.itens.length, "produto", "produtos")} ${pl(acao.itens.length, "marcado", "marcados")} "Sem GTIN"`);
      setAcao(null); setSel(new Set());
      invalidar("produtos");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  async function salvarPrefixo(valor: string) {
    const d = soDigitos(valor);
    if (d && !prefixoGs1Valido(d)) return notify("A faixa da GS1 Brasil começa com 789 ou 790 e tem de 7 a 10 dígitos (está na carta/painel da GS1)", "erro");
    try {
      const { error } = await supabase.from("configuracoes").update({ gs1_prefixo: d || null, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      notify(d ? `Faixa GS1 ${d} salva` : "Faixa GS1 apagada");
      qc.invalidateQueries({ queryKey: ["configuracoes"] });
    } catch (e) { notifyError(e); }
  }

  function planilhaGs1() {
    const meus = linhas.filter((l) => prefixo && soDigitos(l.p.codigo_barras).replace(/^0/, "").startsWith(prefixo));
    if (!meus.length) return notify("Nenhum produto com código da faixa da empresa ainda", "erro");
    baixarPlanilha("produtos-para-gs1", [{ nome: "Produtos GS1", linhas: meus.map(({ p }) => ({
      GTIN: soDigitos(p.codigo_barras), Descrição: p.descricao, Marca: p.marca ?? "", Modelo: p.modelo ?? "", NCM: p.ncm ?? "", SKU: p.sku ?? "",
      Unidade: p.unidade ?? "", Categoria: p.categoria ?? "", "Peso bruto (kg)": Number(p.peso_kg) || "", "Altura (cm)": Number(p.altura_cm) || "",
      "Largura (cm)": Number(p.largura_cm) || "", "Profundidade (cm)": Number(p.profundidade_cm) || "",
    })) }]).catch(notifyError);
  }

  function planilhaTudo() {
    baixarPlanilha("codigos-ean", [{ nome: "Códigos EAN", linhas: linhas.map(({ p, sit, probs, sug }) => ({
      SKU: p.sku ?? "", Produto: p.descricao, Tipo: TIPO[p.tipo ?? ""] ?? p.tipo ?? "", Marca: p.marca ?? "", "Código atual": p.gtin_isento ? "SEM GTIN" : soDigitos(p.codigo_barras),
      Origem: origemEan(p.codigo_barras), Situação: FILTROS.find((f) => f.id === sit)?.rotulo ?? sit, Problemas: probs.map((x) => x.texto).join("; "),
      "Sugestão (nota do fornecedor)": sug.map((s) => `${s.ean} (${s.fornecedor ?? "fornecedor"})`).join("; "),
    })) }]).catch(notifyError);
  }

  const idsVisiveis = visiveis.map((l) => l.p.id);
  const todosMarcados = idsVisiveis.length > 0 && idsVisiveis.every((id) => sel.has(id));
  const marcar = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" onClick={() => { setFiltro(f.id); setLimite(100); }} aria-pressed={filtro === f.id}
            className={`rounded-xl border-2 bg-surface p-2.5 text-left transition ${filtro === f.id ? "border-brand shadow-pop" : "border-slate-200"}`}>
            <span className="block text-xs font-semibold text-slate-500">{f.rotulo}</span>
            <span className={`num block text-2xl font-bold ${f.tom}`}>{conta(f.id)}</span>
          </button>
        ))}
      </div>

      <FaixaGs1 prefixo={prefixo} usados={daFaixa} podeEditar={podeEditar} onSalvar={salvarPrefixo} onPlanilha={planilhaGs1} />
      <Dicas />

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto, SKU ou código" aria-label="Buscar produto, SKU ou código" />
        </label>
        <Button variant="secondary" onClick={planilhaTudo}><FileSpreadsheet size={15} /> Planilha</Button>
      </div>

      {podeEditar && visiveis.length > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-surface/95 p-2 text-sm shadow-card backdrop-blur md:top-2">
          <label className="flex items-center gap-2 px-1 font-semibold text-slate-600">
            <input type="checkbox" className="h-5 w-5" checked={todosMarcados} onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...idsVisiveis]) : new Set([...sel].filter((id) => !idsVisiveis.includes(id))))} />
            {sel.size ? `${sel.size} ${pl(sel.size, "selecionado", "selecionados")}` : "Selecionar todos da lista"}
          </label>
          {sel.size > 0 && (
            <span className="ml-auto flex flex-wrap gap-2">
              <Button variant="secondary" disabled={ocupado} onClick={() => preparar("sem_gtin", [...sel])}>Marcar "Sem GTIN"</Button>
              <Button disabled={ocupado || !prefixo} title={prefixo ? undefined : "Cadastre a faixa da GS1 primeiro"} onClick={() => preparar("gerar", [...sel])}><Sparkles size={15} /> Gerar da faixa GS1</Button>
              <Button variant="ghost" onClick={() => setSel(new Set())}>Limpar</Button>
            </span>
          )}
        </div>
      )}

      {!visiveis.length && <Card className="p-6 text-center text-sm text-slate-500">{filtro === "corrigir" ? "Nenhum código para corrigir." : "Nada nesta lista."}</Card>}
      <ul className="space-y-2">
        {visiveis.slice(0, limite).map(({ p, sit, probs, sug, proprio }) => {
          const atual = soDigitos(p.codigo_barras);
          const editando = aberto === p.id;
          const previa = editando && rascunho ? (erroCodigoNovo(p, rascunho, ctx) ?? `${analisarGtin(rascunho).formato} · ${origemEan(rascunho)}`) : "";
          const okPrevia = editando && !!rascunho && !erroCodigoNovo(p, rascunho, ctx);
          return (
            <li key={p.id}>
              <Card className={`p-3 ${probs.some((x) => x.nivel === "erro") ? "border-l-4 border-l-red-400" : probs.length ? "border-l-4 border-l-amber-400" : ""}`}>
                <div className="flex items-start gap-2.5">
                  {podeEditar && <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={sel.has(p.id)} onChange={(e) => marcar(p.id, e.target.checked)} aria-label={`Selecionar ${p.descricao}`} />}
                  <div className="min-w-0 flex-1">
                    <button type="button" className="text-left font-semibold text-fg hover:underline" onClick={() => onAbrir(p)}>{p.descricao}</button>
                    <div className="text-xs text-slate-500">{[p.sku, TIPO[p.tipo ?? ""] ?? p.tipo, p.marca, proprio ? "marca própria" : null].filter(Boolean).join(" · ")}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <Barcode size={16} className="shrink-0 text-slate-400" aria-hidden />
                      {atual ? <span className="num font-mono font-semibold text-fg">{atual}</span> : <span className="text-slate-500">{p.gtin_isento ? "Sem GTIN" : "sem código"}</span>}
                      {atual && <span className="text-xs text-slate-500">{origemEan(atual) || analisarGtin(atual).formato}</span>}
                      {sit === "certo" && <CheckCircle2 size={16} className="text-emerald-600" aria-label="parece certo" />}
                    </div>
                    {probs.map((x) => (
                      <p key={x.texto} className={`mt-1 flex items-start gap-1.5 text-xs ${x.nivel === "erro" ? "text-red-700" : "text-amber-800"}`}>
                        {x.nivel === "erro" ? <XCircle size={14} className="mt-px shrink-0" aria-hidden /> : <CircleAlert size={14} className="mt-px shrink-0" aria-hidden />}{x.texto}
                      </p>
                    ))}
                    {sug.map((s) => (
                      <div key={s.ean + s.codigo_fornecedor} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-900">
                        <span className="min-w-0 flex-1">
                          Na nota de <b>{s.fornecedor ?? "fornecedor"}</b> ({s.notas} nota{s.notas === 1 ? "" : "s"}{s.ultima_nota ? `, última em ${dataBR(s.ultima_nota)}` : ""}):{" "}
                          <span className="num font-mono font-bold">{s.ean}</span> · {origemEan(s.ean)}
                          {s.descricao_nota && <span className="block text-emerald-800/80">“{s.descricao_nota}”</span>}
                        </span>
                        {podeEditar && <Button variant="secondary" disabled={ocupado} onClick={() => salvarCodigo(p, s.ean)}>Usar este</Button>}
                      </div>
                    ))}
                    {editando && (
                      <form className="mt-2 flex flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); salvarCodigo(p, rascunho); }}>
                        <span className="min-w-0 flex-1">
                          <input className="input font-mono" inputMode="numeric" autoFocus value={rascunho} onChange={(e) => setRascunho(e.target.value)}
                            placeholder="Digite ou passe o leitor no código da caixa" aria-label={`Novo código de ${p.descricao}`} />
                          {previa && <span className={`mt-1 block text-xs ${okPrevia ? "text-emerald-700" : "text-red-700"}`}>{okPrevia ? "✓ " : ""}{previa}</span>}
                        </span>
                        <Button disabled={ocupado || !okPrevia}>Salvar</Button>
                        <Button type="button" variant="ghost" onClick={() => { setAberto(null); setRascunho(""); }}>Cancelar</Button>
                      </form>
                    )}
                    {podeEditar && !editando && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                        <button type="button" className="text-brand hover:underline" onClick={() => { setAberto(p.id); setRascunho(""); }}>{atual ? "Trocar código" : "Informar código"}</button>
                        {!p.gtin_isento && <button type="button" className="text-slate-600 hover:underline" onClick={() => preparar("sem_gtin", [p.id])}>Sem GTIN</button>}
                        {prefixo && proprio && !atual.replace(/^0/, "").startsWith(prefixo) && <button type="button" className="text-slate-600 hover:underline" onClick={() => preparar("gerar", [p.id])}>Gerar da faixa GS1</button>}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      {visiveis.length > limite && <div className="text-center"><Button variant="secondary" onClick={() => setLimite((n) => n + 100)}>Mostrar mais ({visiveis.length - limite})</Button></div>}

      <Modal open={!!acao} onClose={() => setAcao(null)} title={acao?.tipo === "gerar" ? "Gerar códigos da faixa GS1" : "Marcar \"Sem GTIN\""} wide>
        {acao && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">
              {acao.tipo === "gerar"
                ? <>Cada produto recebe o próximo código livre da faixa <b className="num">{prefixo}</b>, com o dígito verificador certo. Depois, cadastre cada código no site da GS1 (Cadastro Nacional de Produtos): use a planilha "Produtos para a GS1".</>
                : <>Fica sem código de barras e a NF-e sai com "SEM GTIN" (permitido para produto sem código). Use para produto próprio enquanto não tiver código da GS1, e para peça sem código do fabricante.</>}
              {" "}O código atual vai para "Códigos alternativos": a busca continua achando etiquetas antigas.
            </p>
            <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {acao.itens.map(({ p, novo }) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">{p.descricao}{p.sku ? <span className="text-xs text-slate-500"> · {p.sku}</span> : null}</span>
                  <span className="num font-mono text-xs"><s className="text-slate-400">{soDigitos(p.codigo_barras) || "—"}</s> → <b className="text-fg">{novo ?? "SEM GTIN"}</b></span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAcao(null)}>Cancelar</Button>
              <Button disabled={ocupado} onClick={confirmar}>{ocupado ? "Gravando…" : `Confirmar (${acao.itens.length})`}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** A faixa da empresa na GS1 Brasil: com ela o ERP gera os códigos dos produtos próprios. */
function FaixaGs1({ prefixo, usados, podeEditar, onSalvar, onPlanilha }: { prefixo: string | null; usados: number; podeEditar: boolean; onSalvar: (v: string) => void; onPlanilha: () => void }) {
  const [editar, setEditar] = useState(false);
  const [valor, setValor] = useState(prefixo ?? "");
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0ea5e9] to-[#2563eb] text-white" aria-hidden><Barcode size={20} /></span>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold text-fg">Faixa da empresa na GS1 Brasil</div>
          {prefixo && !editar
            ? <p className="text-slate-600">Prefixo <b className="num font-mono">{prefixo}</b> · cabem <b className="num">{capacidadeFaixa(prefixo).toLocaleString("pt-BR")}</b> códigos · <b className="num">{usados}</b> já {pl(usados, "usado", "usados")}. Os produtos próprios selecionados ganham o próximo código livre.</p>
            : <p className="text-slate-600">O código de barras de produto que a empresa fabrica só vale se vier da GS1 Brasil (associação paga, por faixa de faturamento). Com a filiação, a GS1 dá um prefixo (789… ou 790…): cadastre aqui e o ERP gera os códigos em sequência, sem repetir.</p>}
        </div>
        {podeEditar && !editar && <Button variant="secondary" onClick={() => { setValor(prefixo ?? ""); setEditar(true); }}>{prefixo ? "Alterar" : "Cadastrar prefixo"}</Button>}
        {prefixo && !editar && <Button variant="secondary" onClick={onPlanilha}><FileSpreadsheet size={15} /> Produtos para a GS1</Button>}
      </div>
      {editar && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); onSalvar(valor); setEditar(false); }}>
          <label className="block min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Prefixo da empresa (está no painel da GS1)</span>
            <input className="input font-mono" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 7891234" autoFocus />
          </label>
          <Button>Salvar</Button>
          <Button type="button" variant="ghost" onClick={() => setEditar(false)}>Cancelar</Button>
        </form>
      )}
    </Card>
  );
}

function Dicas() {
  return (
    <Card className="p-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-semibold text-fg sm:p-4 [&::-webkit-details-marker]:hidden">
          <Lightbulb size={17} className="text-amber-500" aria-hidden /> Como acertar os códigos (dicas)
          <span className="ml-auto text-slate-400 transition group-open:rotate-180" aria-hidden>▾</span>
        </summary>
        <ol className="list-decimal space-y-2 px-4 pb-4 pl-9 text-sm text-slate-600 sm:px-5 sm:pl-10">
          <li><b>Nunca invente código.</b> O EAN é registrado: o prefixo diz de quem é (789 e 790 = empresas do Brasil). Código inventado pode ser de outra empresa, e o marketplace bloqueia o anúncio.</li>
          <li><b>Peça comprada pronta</b> (motor, compressor, válvula, filtro): use o código do fabricante, que está na caixa ou na NF-e do fornecedor. Quando o ERP acha o código nas notas, ele aparece em verde para usar com um toque.</li>
          <li><b>Produto que a empresa fabrica ou monta</b> (máquinas, kits, peças exclusivas): o código certo vem da GS1 Brasil. Depois da filiação, cadastre o prefixo acima, gere os códigos aqui e registre cada um no Cadastro Nacional de Produtos da GS1, com o mesmo NCM do ERP (a SEFAZ confere código e NCM).</li>
          <li><b>Enquanto não tiver o código da GS1</b>: marque "Sem GTIN". A NF-e sai com "SEM GTIN", que é permitido; código falso na nota pode ser rejeitado.</li>
          <li><b>Um código para cada produto</b> (e para cada voltagem, cor ou modelo). Kit tem o seu próprio. Caixa com várias unidades pode ter um GTIN-14.</li>
          <li><b>Código não se reaproveita</b>: produto que saiu de linha leva o código junto. O ERP nunca gera um código já usado.</li>
          <li><b>Etiqueta interna</b> (prateleira, conferência): use o SKU. A expedição já confere pelo SKU, sem precisar de EAN.</li>
        </ol>
      </details>
    </Card>
  );
}

/** No formulário do produto: o que o código de barras digitado é (válido, país, repetido) antes de salvar. */
export function ConferenciaEan({ row, produtos }: { row: Record<string, any>; produtos: Produto[] }) {
  const { data: cfg } = useConfig();
  const ctx = useMemo(() => contextoEan(produtos as P[], (cfg as { gs1_prefixo?: string | null } | undefined)?.gs1_prefixo), [produtos, cfg]);
  const d = soDigitos(row.codigo_barras);
  if (!d) return <span className="text-xs text-slate-500">{row.gtin_isento ? "Sem GTIN: a NF-e sai com \"SEM GTIN\"." : "Sem código: use o da caixa do fabricante, gere pela faixa GS1 (Auditoria → Códigos EAN) ou marque \"Sem GTIN\"."}</span>;
  const erro = erroCodigoNovo({ id: row.id ?? "" }, d, ctx);
  const alertas = erro ? [] : problemasEan({ ...(row as P), id: row.id ?? "", codigo_barras: d }, ctx).filter((x) => x.nivel === "alerta");
  if (erro) return <span className="flex items-start gap-1.5 text-xs text-red-700"><XCircle size={14} className="mt-px shrink-0" aria-hidden />{erro}</span>;
  return (
    <span className="block text-xs">
      <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={14} aria-hidden />{analisarGtin(d).formato} · {origemEan(d)}</span>
      {alertas.map((x) => <span key={x.texto} className="mt-1 flex items-start gap-1.5 text-amber-800"><CircleAlert size={14} className="mt-px shrink-0" aria-hidden />{x.texto}</span>)}
    </span>
  );
}
