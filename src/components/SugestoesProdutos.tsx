// Produtos → Qualidade do cadastro → Correções sugeridas: o que o ERP achou nas notas de fornecedor, ordens de compra,
// preços dos fornecedores, fichas técnicas e regras (e a análise feita à parte). Aplicar grava no cadastro com o motivo
// "Correção sugerida (fonte)"; ignorar não deixa a sugestão voltar. "Só conferir" não traz valor: abre o cadastro.
import { useMemo, useState } from "react";
import { ArrowRight, Check, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { Button, Card } from "./ui";
import { confirmar } from "./Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { pl } from "@/lib/format";
import { aplicavel, CAMPOS, CONFIANCAS, mostrarValor, NOME_CAMPO, NOME_FONTE, pedeContador, valorAtual, type CampoSugestao, type Confianca, type Sugestao } from "@/lib/sugestoesProdutos";
import type { Produto } from "@/lib/types";

const PAGINA = 80;
const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const COR_CAMPO = Object.fromEntries(CAMPOS.map((c) => [c.id, c.cor])) as Record<CampoSugestao, string>;
const CONF = Object.fromEntries(CONFIANCAS.map((c) => [c.id, c])) as Record<Confianca, (typeof CONFIANCAS)[number]>;

export function SugestoesProdutos({ produtos, onAbrir, podeCorrigir }: { produtos: Produto[]; onAbrir: (p: Produto) => void; podeCorrigir: boolean }) {
  const invalidar = useInvalidate();
  const { data: todas = [], isLoading, error } = useRows<Sugestao>("produto_sugestoes", { order: "criado_em", ascending: false });
  const [campo, setCampo] = useState<CampoSugestao | "">("");
  const [conf, setConf] = useState<Confianca | "">("");
  const [busca, setBusca] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [limite, setLimite] = useState(PAGINA);
  const [ocupado, setOcupado] = useState(false);

  const porId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const pendentes = useMemo(() => todas.filter((s) => s.situacao === "pendente" && porId.has(s.produto_id)), [todas, porId]);
  const visiveis = pendentes.filter((s) => (!campo || s.campo === campo) && (!conf || s.confianca === conf)
    && (!busca.trim() || [porId.get(s.produto_id)?.descricao, porId.get(s.produto_id)?.sku, s.valor, s.detalhe].some((x) => sem(x).includes(sem(busca.trim())))));
  const altas = visiveis.filter((s) => s.confianca === "alta" && aplicavel(s));
  const escolhidas = visiveis.filter((s) => marcadas.has(s.id));
  const decididas = todas.filter((s) => s.situacao === "aplicada").length;

  const conta = (f: (s: Sugestao) => boolean) => pendentes.filter(f).length;
  const marcar = (id: string) => setMarcadas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function rodar(fn: () => PromiseLike<{ data: any; error: unknown }>, ok: (d: any) => string) { // eslint-disable-line @typescript-eslint/no-explicit-any
    setOcupado(true);
    try {
      const { data, error } = await fn();
      if (error) throw error;
      notify(ok(data));
      setMarcadas(new Set());
      invalidar("produto_sugestoes", "produtos");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }
  async function aplicar(lista: Sugestao[]) {
    const ids = lista.filter(aplicavel).map((s) => s.id);
    if (!ids.length) return;
    const ncm = lista.filter((s) => aplicavel(s) && pedeContador(s)).length;
    if (ids.length > 1 && !(await confirmar(
      `Aplicar ${ids.length} ${pl(ids.length, "correção", "correções")} no cadastro? Cada mudança fica no histórico do produto com o motivo "Correção sugerida".`
      + (ncm ? ` ${ncm} ${pl(ncm, "é", "são")} de NCM sem confiança alta: confirme com o contador antes de emitir nota com ${pl(ncm, "ele", "eles")}.` : ""),
      { titulo: "Aplicar correções", ok: "Aplicar" }))) return;
    await rodar(() => supabase.rpc("aplicar_sugestoes_produtos", { p_ids: ids }), (r: { aplicadas: number; puladas: number } | null) =>
      `${r?.aplicadas ?? 0} ${pl(r?.aplicadas ?? 0, "correção aplicada", "correções aplicadas")}${r?.puladas ? ` · ${r.puladas} ${pl(r.puladas, "pulada", "puladas")} (o cadastro já tinha valor)` : ""}`);
  }
  async function ignorar(lista: Sugestao[]) {
    if (!lista.length) return;
    if (lista.length > 1 && !(await confirmar(`Ignorar ${lista.length} ${pl(lista.length, "sugestão", "sugestões")}? Elas não voltam na próxima procura.`, { titulo: "Ignorar sugestões", ok: "Ignorar" }))) return;
    await rodar(() => supabase.rpc("ignorar_sugestoes_produtos", { p_ids: lista.map((s) => s.id) }), (n: number | null) => `${n ?? 0} ${pl(n ?? 0, "sugestão ignorada", "sugestões ignoradas")}`);
  }
  const procurar = () => rodar(() => supabase.rpc("gerar_sugestoes_produtos"), (r: { novas?: number; vencidas?: number } | null) =>
    `${r?.novas ?? 0} ${pl(r?.novas ?? 0, "sugestão nova", "sugestões novas")}${r?.vencidas ? ` · ${r.vencidas} já ${pl(r.vencidas, "estava corrigida", "estavam corrigidas")}` : ""}`);

  const chip = (ativo: boolean, cor: string) => `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${ativo ? `${cor} ring-2` : "bg-surface text-slate-700 ring-slate-200 hover:ring-slate-300"}`;

  if (error) return <Card className="border-red-300 bg-red-50 p-3 text-sm text-red-800">Não consegui ler as correções sugeridas: {(error as Error).message}</Card>;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-sky-50 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><Sparkles size={20} aria-hidden /></span>
        <div className="min-w-[14rem] flex-1">
          <div className="font-bold text-fg">Correções sugeridas</div>
          <p className="text-sm text-slate-600">
            {isLoading ? "Carregando…" : pendentes.length
              ? <><b>{pendentes.length}</b> {pl(pendentes.length, "sugestão", "sugestões")} para {new Set(pendentes.map((s) => s.produto_id)).size} produtos, achadas nas notas de fornecedor, compras, fichas técnicas e na análise do cadastro.</>
              : "Nenhuma sugestão pendente."}
            {decididas > 0 && <> {decididas} já {pl(decididas, "aplicada", "aplicadas")}.</>} O ERP procura de novo todo dia de manhã.
          </p>
        </div>
        {podeCorrigir && <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={procurar} disabled={ocupado}><RefreshCw size={16} className={ocupado ? "animate-spin" : ""} /> Procurar de novo</Button>
          {altas.length > 0 && <Button onClick={() => aplicar(altas)} disabled={ocupado}><Check size={16} /> Aplicar as {altas.length} de confiança alta</Button>}
        </div>}
      </div>

      {pendentes.length > 0 && <div className="space-y-2 border-b border-slate-100 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Campo">
          <button type="button" aria-pressed={!campo} onClick={() => { setCampo(""); setLimite(PAGINA); }} className={chip(!campo, "bg-brand text-white ring-brand")}>Todos <span className="text-xs opacity-80">{pendentes.length}</span></button>
          {CAMPOS.map((c) => {
            const n = conta((s) => s.campo === c.id);
            return n > 0 && <button key={c.id} type="button" aria-pressed={campo === c.id} onClick={() => { setCampo(campo === c.id ? "" : c.id); setLimite(PAGINA); }} className={chip(campo === c.id, c.cor)}>{c.nome} <span className="text-xs opacity-70">{n}</span></button>;
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confiança">
          {CONFIANCAS.map((c) => {
            const n = conta((s) => s.confianca === c.id && (!campo || s.campo === campo));
            return n > 0 && <button key={c.id} type="button" aria-pressed={conf === c.id} onClick={() => { setConf(conf === c.id ? "" : c.id); setLimite(PAGINA); }} className={chip(conf === c.id, c.cor)}>
              <span className={`h-2.5 w-2.5 rounded-full ${c.ponto}`} aria-hidden />{c.nome} <span className="text-xs opacity-70">{n}</span></button>;
          })}
          <label className="relative ml-auto w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input w-full pl-8" value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(PAGINA); }} placeholder="Buscar produto ou valor" aria-label="Buscar sugestão" />
          </label>
        </div>
        {(campo === "ncm" || (!campo && pendentes.some((s) => s.campo === "ncm"))) && (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">
            NCM: a sugestão vem do NCM que o fornecedor usou ou da análise da peça. As de confiança média ou baixa são para <b>confirmar com o contador</b> antes de emitir nota.
            "Só conferir" são peças com o NCM da máquina inteira (8418.69): abra o cadastro e escolha o NCM da peça.
          </p>
        )}
      </div>}

      {podeCorrigir && escolhidas.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-violet-200 bg-violet-50 px-4 py-2 text-sm">
          <b>{escolhidas.length}</b> {pl(escolhidas.length, "escolhida", "escolhidas")}
          <Button onClick={() => aplicar(escolhidas)} disabled={ocupado || !escolhidas.some(aplicavel)}><Check size={16} /> Aplicar</Button>
          <Button variant="secondary" onClick={() => ignorar(escolhidas)} disabled={ocupado}><X size={16} /> Ignorar</Button>
          <button type="button" className="ml-auto text-sm font-semibold text-slate-600 hover:underline" onClick={() => setMarcadas(new Set())}>Limpar</button>
        </div>
      )}

      {visiveis.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {podeCorrigir && (
            <li className="flex items-center gap-2 px-4 py-1.5 text-xs text-slate-500">
              <input type="checkbox" aria-label="Escolher todas as visíveis" checked={visiveis.slice(0, limite).every((s) => marcadas.has(s.id))}
                onChange={(e) => setMarcadas(e.target.checked ? new Set(visiveis.slice(0, limite).map((s) => s.id)) : new Set())} />
              Escolher {Math.min(limite, visiveis.length)} {pl(Math.min(limite, visiveis.length), "visível", "visíveis")}
            </li>
          )}
          {visiveis.slice(0, limite).map((s) => {
            const p = porId.get(s.produto_id)!;
            const atual = valorAtual(s.campo, p);
            const c = CONF[s.confianca];
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
                {podeCorrigir && <input type="checkbox" className="mt-1" aria-label={`Escolher ${p.descricao}`} checked={marcadas.has(s.id)} onChange={() => marcar(s.id)} />}
                <div className="min-w-0 flex-1 basis-64">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${COR_CAMPO[s.campo]}`}>{NOME_CAMPO[s.campo]}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${c.cor}`}><span className={`h-2 w-2 rounded-full ${c.ponto}`} aria-hidden />{c.nome}</span>
                    {pedeContador(s) && aplicavel(s) && <span className="text-xs font-semibold text-violet-700">confirmar com o contador</span>}
                  </div>
                  <button type="button" onClick={() => onAbrir(p)} className="mt-1 block text-left text-sm font-semibold text-fg hover:underline [overflow-wrap:anywhere]">{p.descricao}</button>
                  <div className="text-xs text-slate-500">{[p.sku || "sem SKU", NOME_FONTE[s.fonte] ?? s.fonte].join(" · ")}{s.detalhe ? ` · ${s.detalhe}` : ""}</div>
                </div>
                <div className="flex min-w-0 basis-56 flex-wrap items-center gap-1.5 text-sm">
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 line-through decoration-slate-400 [overflow-wrap:anywhere]" title="hoje no cadastro">{mostrarValor(s.campo, atual)}</span>
                  <ArrowRight size={15} className="shrink-0 text-slate-400" aria-hidden />
                  <span className={`rounded-md px-2 py-1 font-semibold [overflow-wrap:anywhere] ${aplicavel(s) ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>{aplicavel(s) ? mostrarValor(s.campo, s.valor) : "conferir no cadastro"}</span>
                </div>
                {podeCorrigir && (
                  <div className="flex shrink-0 gap-1.5">
                    {aplicavel(s)
                      ? <Button onClick={() => aplicar([s])} disabled={ocupado} aria-label={`Aplicar em ${p.descricao}`}><Check size={15} /> Aplicar</Button>
                      : <Button variant="secondary" onClick={() => onAbrir(p)}>Abrir cadastro</Button>}
                    <Button variant="secondary" onClick={() => ignorar([s])} disabled={ocupado} aria-label={`Ignorar em ${p.descricao}`}><X size={15} /></Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {visiveis.length > limite && (
        <div className="border-t border-slate-100 p-3 text-center">
          <Button variant="secondary" onClick={() => setLimite((l) => l + PAGINA)}>Mostrar mais {Math.min(PAGINA, visiveis.length - limite)} (de {visiveis.length - limite})</Button>
        </div>
      )}
      {pendentes.length > 0 && !visiveis.length && <p className="p-4 text-sm text-slate-500">Nada com esses filtros.</p>}
    </Card>
  );
}
