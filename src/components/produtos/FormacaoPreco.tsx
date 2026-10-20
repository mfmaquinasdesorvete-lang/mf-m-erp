import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Calculator, Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui";
import { brl, pl } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { useConfig } from "@/lib/useConfig";
import { usePerfil } from "@/lib/auth";
import { configPreco, despesasPct, margemLiquida, MEIOS_PRECO, precoNoMeio, precoSugerido, type ConfigPreco } from "@/lib/precificacao";
import type { Categoria } from "@/components/CategoriasProdutos";

type Sugestao = {
  id: string; produto_id: string; status: "pendente" | "aprovada" | "recusada" | "substituida"; origem: "custo" | "revisao";
  custo_anterior: number | null; custo_novo: number; preco_atual: number; preco_sugerido: number; margem_alvo: number;
  preco_aprovado: number | null; decidido_em: string | null; created_at: string;
  produto: { descricao: string; sku: string | null; unidade: string | null; preco_venda: number; preco_custo: number } | null;
};

const SELECT = "id, produto_id, status, origem, custo_anterior, custo_novo, preco_atual, preco_sugerido, margem_alvo, preco_aprovado, decidido_em, created_at, produto:produtos(descricao, sku, unidade, preco_venda, preco_custo)";
const pct = (v: number | null | undefined) => (v == null ? "—" : `${String(Math.round(Number(v) * 10) / 10).replace(".", ",")}%`);
/** "1.250,90", "285,72", "285.72" ou "1.250" (milhar) → número */
const numero = (t: string) => {
  const s = String(t).trim().replace(/\s|R\$/g, "");
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s);
};

/** Quantas sugestões de preço esperam aprovação (para o aviso e o número na aba). */
export function usePrecosPendentes() {
  return useQuery({
    queryKey: ["preco_sugestoes", "pendentes-contagem"],
    queryFn: async () => {
      const { data, error } = await supabase.from("preco_sugestoes").select("id").eq("status", "pendente");
      if (error) return 0;   // sem acesso (ex.: técnico) ou tabela ainda não criada
      return data?.length ?? 0;
    },
  });
}

/** Formação de preço: aprovar os preços sugeridos quando o custo muda, e as regras de margem. */
export function FormacaoPreco({ categorias, podeAprovar }: { categorias: Categoria[]; podeAprovar: boolean }) {
  const { papel } = usePerfil();
  const invalidar = useInvalidate();
  const { data: cfgBruta } = useConfig();
  const cfg = useMemo(() => configPreco(cfgBruta?.precificacao), [cfgBruta]);
  const { data: sugestoes = [], isLoading } = useQuery({
    queryKey: ["preco_sugestoes", "lista"],
    queryFn: async () => {
      const [p, d] = await Promise.all([
        supabase.from("preco_sugestoes").select(SELECT).eq("status", "pendente").order("created_at", { ascending: false }),
        supabase.from("preco_sugestoes").select(SELECT).in("status", ["aprovada", "recusada"]).order("decidido_em", { ascending: false }).limit(15),
      ]);
      if (p.error) throw p.error;
      return [...(p.data ?? []), ...(d.data ?? [])] as unknown as Sugestao[];
    },
  });
  const pendentes = sugestoes.filter((s) => s.status === "pendente");
  const decididas = sugestoes.filter((s) => s.status !== "pendente");
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(false);
  const precoDe = (s: Sugestao) => (precos[s.id] != null && precos[s.id] !== "" ? numero(precos[s.id]) : Number(s.preco_sugerido));

  async function decidir(ids: string[], aprovar: boolean) {
    if (!ids.length) return;
    setOcupado(true);
    try {
      const lista = pendentes.filter((s) => ids.includes(s.id));
      const { data, error } = await supabase.rpc("decidir_precos", {
        p_ids: lista.map((s) => s.id), p_aprovar: aprovar, p_precos: aprovar ? lista.map(precoDe) : null,
      });
      if (error) throw error;
      notify(aprovar ? `${data} ${pl(data, "preço", "preços")} ${pl(data, "aprovado", "aprovados")} e já valendo` : `${data} ${pl(data, "sugestão recusada", "sugestões recusadas")}: o preço não mudou`);
      setMarcados(new Set());
      invalidar("preco_sugestoes", "produtos");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  async function revisarTodos() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("gerar_sugestoes_preco");
      if (error) throw error;
      notify(data ? `${data} ${pl(data, "produto", "produtos")} com o preço abaixo da margem desejada` : "Todos os preços estão dentro da margem desejada");
      invalidar("preco_sugestoes");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const todosMarcados = pendentes.length > 0 && pendentes.every((s) => marcados.has(s.id));
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold">Preços para revisar {pendentes.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{pendentes.length}</span>}</h2>
            <p className="text-xs text-slate-500 sm:text-sm">Quando o custo muda (nota do fornecedor, compra ou produção), o ERP calcula o preço pela margem desejada. Nada muda sem a sua aprovação.</p>
          </div>
          {podeAprovar && (
            <Button variant="secondary" onClick={revisarTodos} disabled={ocupado}><RefreshCw size={16} /> Revisar todos os preços</Button>
          )}
        </div>

        {pendentes.length > 0 && podeAprovar && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={todosMarcados} onChange={() => setMarcados(todosMarcados ? new Set() : new Set(pendentes.map((s) => s.id)))} />
              Marcar todos
            </label>
            {marcados.size > 0 && <>
              <Button onClick={() => decidir([...marcados], true)} disabled={ocupado}><Check size={16} /> Aprovar {marcados.size}</Button>
              <Button variant="ghost" onClick={() => decidir([...marcados], false)} disabled={ocupado}><X size={16} /> Recusar {marcados.size}</Button>
            </>}
          </div>
        )}

        {isLoading ? <p className="py-6 text-center text-sm text-slate-500">Carregando…</p>
          : !pendentes.length ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Nenhum preço para revisar.</p>
          : (
          <ul className="mt-3 space-y-2">
            {pendentes.map((s) => {
              const novo = precoDe(s);
              const subiu = s.custo_anterior != null && Number(s.custo_novo) > Number(s.custo_anterior);
              const desceu = s.custo_anterior != null && Number(s.custo_novo) < Number(s.custo_anterior);
              const margemAtual = margemLiquida(Number(s.preco_atual), Number(s.custo_novo), cfg);
              const margemNova = margemLiquida(novo, Number(s.custo_novo), cfg);
              return (
                <li key={s.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    {podeAprovar && <input type="checkbox" className="mt-1" aria-label={`Marcar ${s.produto?.descricao ?? ""}`} checked={marcados.has(s.id)}
                      onChange={() => setMarcados((m) => { const n = new Set(m); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug [overflow-wrap:anywhere]">{s.produto?.descricao ?? "Produto"}</p>
                      <p className="text-xs text-slate-500">{[s.produto?.sku, s.origem === "revisao" ? "revisão geral" : "o custo mudou", new Date(s.created_at).toLocaleDateString("pt-BR")].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <dt className="text-2xs font-semibold uppercase text-slate-500">Custo</dt>
                      <dd className="font-bold tabular-nums">
                        {s.custo_anterior != null && <span className="mr-1 text-xs font-normal text-slate-400 line-through">{brl(s.custo_anterior)}</span>}
                        <span className={subiu ? "text-red-600" : desceu ? "text-emerald-700" : ""}>{brl(s.custo_novo)}</span>
                        {subiu && <ArrowUp size={13} className="ml-0.5 inline text-red-600" />}{desceu && <ArrowDown size={13} className="ml-0.5 inline text-emerald-700" />}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <dt className="text-2xs font-semibold uppercase text-slate-500">Preço hoje</dt>
                      <dd className="font-bold tabular-nums">{Number(s.preco_atual) > 0 ? brl(s.preco_atual) : "sem preço"}</dd>
                      <dd className={`text-2xs ${margemAtual != null && margemAtual < 0 ? "font-semibold text-red-600" : "text-slate-500"}`}>margem {pct(margemAtual)}</dd>
                    </div>
                    <div className="col-span-2 rounded-lg bg-amber-50 px-2 py-1.5">
                      <dt className="text-2xs font-semibold uppercase text-amber-800">Preço novo (margem desejada {pct(s.margem_alvo)})</dt>
                      <dd className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">R$</span>
                        <input className="input h-9 w-28 py-1 font-bold tabular-nums" inputMode="decimal" aria-label="Preço novo"
                          disabled={!podeAprovar} value={precos[s.id] ?? String(Number(s.preco_sugerido).toFixed(2)).replace(".", ",")}
                          onChange={(e) => setPrecos((p) => ({ ...p, [s.id]: e.target.value }))} />
                        <span className="text-2xs text-slate-600">margem {pct(margemNova)}</span>
                      </dd>
                    </div>
                  </dl>
                  {podeAprovar && (
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <Button variant="ghost" onClick={() => decidir([s.id], false)} disabled={ocupado}><X size={16} /> Manter o preço</Button>
                      <Button className="whitespace-nowrap" onClick={() => decidir([s.id], true)} disabled={ocupado || !(novo > 0)}><Check size={16} /> Aprovar {novo > 0 ? brl(novo) : ""}</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <RegrasPreco cfg={cfg} podeEditar={papel === "admin"} />
      <MargemCategorias categorias={categorias} cfg={cfg} podeEditar={podeAprovar} />

      {decididas.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-surface p-3 sm:p-4">
          <h2 className="mb-2 text-base font-bold">Últimas decisões</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {decididas.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                <span className="min-w-0 [overflow-wrap:anywhere]">{s.produto?.descricao}</span>
                <span className={`text-xs font-semibold ${s.status === "aprovada" ? "text-emerald-700" : "text-slate-500"}`}>
                  {s.status === "aprovada" ? `aprovado ${brl(s.preco_aprovado)}` : `mantido ${brl(s.preco_atual)}`}
                  {s.decidido_em && ` · ${new Date(s.decidido_em).toLocaleDateString("pt-BR")}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const TIPOS: [string, string][] = [["maquina", "Máquinas"], ["peca", "Peças de reposição"], ["acessorio", "Acessórios"]];
const DESPESAS: [keyof ConfigPreco, string][] = [["impostos_pct", "Impostos sobre a venda"], ["taxa_pct", "Taxa já embutida no preço"], ["comissao_pct", "Comissão"], ["frete_pct", "Frete por conta da MF"]];

/** Regras: margem por tipo, despesas que saem do preço, arredondamento e tolerância. */
function RegrasPreco({ cfg, podeEditar }: { cfg: ConfigPreco; podeEditar: boolean }) {
  const invalidar = useInvalidate();
  const [form, setForm] = useState<ConfigPreco>(cfg);
  useEffect(() => setForm(cfg), [cfg]);
  const [salvando, setSalvando] = useState(false);
  const exemplo = precoSugerido(100, form.margens.peca ?? form.margem_padrao, form);
  const alterado = JSON.stringify(form) !== JSON.stringify(cfg);
  const campo = (valor: number, mudar: (v: number) => void, rotulo: string) => (
    <CampoPct key={rotulo} rotulo={rotulo} valor={valor} onValor={mudar} disabled={!podeEditar} />
  );
  async function salvar() {
    setSalvando(true);
    try {
      if (form.margens.peca + despesasPct(form) >= 95 || form.margens.maquina + despesasPct(form) >= 95) throw new Error("margem + despesas não pode chegar a 95%");
      const { error } = await supabase.from("configuracoes").update({ precificacao: form }).eq("id", 1);
      if (error) throw error;
      notify("Regras de preço salvas. Use \"Revisar todos os preços\" para conferir os produtos com as regras novas.");
      invalidar("configuracoes");
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-surface p-3 sm:p-4">
      <h2 className="flex items-center gap-2 text-base font-bold"><Calculator size={18} /> Regras do preço</h2>
      <p className="mb-3 text-xs text-slate-500 sm:text-sm">
        Preço = custo ÷ (1 − (margem + despesas) ÷ 100). A margem é o que sobra depois das despesas. A do produto vale mais que a da categoria, e a da categoria mais que a do tipo.
        {!podeEditar && " Só o administrador altera as regras."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Margem desejada por tipo</h3>
          <div className="flex flex-wrap gap-3">
            {TIPOS.map(([k, rot]) => campo(form.margens[k] ?? form.margem_padrao, (v) => setForm((f) => ({ ...f, margens: { ...f.margens, [k]: v } })), rot))}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Despesas que saem do preço <span className="font-normal text-slate-500">(confirme com o contador)</span></h3>
          <div className="flex flex-wrap gap-3">
            {DESPESAS.map(([k, rot]) => campo(Number(form[k]), (v) => setForm((f) => ({ ...f, [k]: v })), rot))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Arredondar o preço</span>
          <select className="input" disabled={!podeEditar} value={form.arredondar} onChange={(e) => setForm((f) => ({ ...f, arredondar: e.target.value as ConfigPreco["arredondar"] }))}>
            <option value="centavos">Nos centavos (R$ 285,72)</option>
            <option value="inteiro">Para o real de cima (R$ 286,00)</option>
            <option value="final90">Terminar em ,90 (R$ 285,90)</option>
          </select>
        </label>
        <div className="space-y-2">
          {campo(form.tolerancia_pct, (v) => setForm((f) => ({ ...f, tolerancia_pct: v })), "Avisar quando o preço ficar abaixo do sugerido mais de")}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" disabled={!podeEditar} checked={form.sugerir_reducao} onChange={(e) => setForm((f) => ({ ...f, sugerir_reducao: e.target.checked }))} />
            Também sugerir baixar o preço quando o custo cair
          </label>
        </div>
      </div>
      <TaxasPorMeio form={form} setForm={setForm} podeEditar={podeEditar} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-sm text-slate-600">Exemplo (peça): custo {brl(100)} → preço <b>{exemplo ? brl(exemplo) : "margem + despesas alta demais"}</b></p>
        {podeEditar && <Button onClick={salvar} disabled={!alterado || salvando}>Salvar regras</Button>}
      </div>
    </section>
  );
}

/** Mediana da taxa real da InfinitePay (venda − depósito) nas vendas ligadas aos depósitos, para preencher o link. */
function useTaxaInfinitePay() {
  const { data: lancs = [] } = useRows<{ valor: number; descricao: string | null; conta_receber_id: string | null }>("extrato_lancamentos",
    { select: "valor, descricao, conta_receber_id", order: "data", key: ["taxa-infinitepay"] });
  const { data: vendas = [] } = useRows<{ id: string; valor: number }>("contas_receber", { select: "id, valor", order: "vencimento", key: ["taxa-infinitepay"] });
  return useMemo(() => {
    const valor = new Map(vendas.map((v) => [v.id, Number(v.valor)]));
    const taxas = lancs.filter((l) => Number(l.valor) > 0 && l.conta_receber_id && /dep[óo]sito infinitepay/i.test(l.descricao ?? ""))
      .map((l) => { const v = valor.get(l.conta_receber_id!) ?? 0; return v > Number(l.valor) ? (v - Number(l.valor)) / v * 100 : null; })
      .filter((t): t is number => t != null).sort((a, b) => a - b);
    return taxas.length ? { mediana: Math.round(taxas[Math.floor(taxas.length / 2)] * 100) / 100, n: taxas.length } : null;
  }, [lancs, vendas]);
}

/** Taxa de cada forma de pagamento e quanto o preço fica em cada uma, para a MF receber o mesmo líquido. */
function TaxasPorMeio({ form, setForm, podeEditar }: { form: ConfigPreco; setForm: (f: (c: ConfigPreco) => ConfigPreco) => void; podeEditar: boolean }) {
  const medida = useTaxaInfinitePay();
  const exemplos: [string, number | null][] = [
    ["Peça (custo R$ 100)", precoSugerido(100, form.margens.peca ?? form.margem_padrao, form)],
    ["Máquina (custo R$ 10.000)", precoSugerido(10000, form.margens.maquina ?? form.margem_padrao, form)],
  ];
  const pctTxt = (v: number) => `${String(v).replace(".", ",")}%`;
  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <h3 className="text-sm font-semibold">Taxa por forma de pagamento</h3>
      <p className="mb-2 text-xs text-slate-500">
        Cada forma tem a sua taxa (a maquininha cobra uma, o link outra). O preço do cadastro já cobre a taxa embutida ({pctTxt(form.taxa_pct)});
        nas formas com taxa maior, o preço sobe só o necessário para a MF receber o mesmo.
      </p>
      <div className="flex flex-wrap gap-3">
        {MEIOS_PRECO.map((m) => (
          <CampoPct key={m.id} rotulo={m.rotulo} valor={form.taxas_meio[m.id]} disabled={!podeEditar}
            onValor={(v) => setForm((f) => ({ ...f, taxas_meio: { ...f.taxas_meio, [m.id]: v } }))} />
        ))}
      </div>
      {medida && (
        <p className="mt-2 text-xs text-slate-600">
          Nos extratos, a InfinitePay descontou em média <b>{pctTxt(medida.mediana)}</b> por venda ({medida.n} {pl(medida.n, "venda", "vendas")}, já com parcelamento e antecipação).
          {podeEditar && form.taxas_meio.link !== medida.mediana && (
            <button type="button" className="ml-1 font-semibold text-brand underline" onClick={() => setForm((f) => ({ ...f, taxas_meio: { ...f.taxas_meio, link: medida.mediana } }))}>Usar no link</button>
          )}
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead><tr className="text-left text-2xs uppercase text-slate-500">
            <th className="py-1 pr-2 font-semibold">Exemplo</th>
            {MEIOS_PRECO.map((m) => <th key={m.id} className="py-1 pr-2 text-right font-semibold">{m.rotulo.replace("Maquininha · ", "")}</th>)}
          </tr></thead>
          <tbody>
            {exemplos.map(([rot, base]) => (
              <tr key={rot} className="border-t border-slate-100">
                <td className="py-1.5 pr-2 text-slate-600">{rot}</td>
                {MEIOS_PRECO.map((m) => <td key={m.id} className="num py-1.5 pr-2 text-right font-semibold">{base ? brl(precoNoMeio(base, m.id, form)) : "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Campo de porcentagem que aceita vírgula enquanto digita ("3," → 3,5). */
function CampoPct({ rotulo, valor, onValor, disabled }: { rotulo: string; valor: number; onValor: (v: number) => void; disabled: boolean }) {
  const [texto, setTexto] = useState(String(valor).replace(".", ","));
  useEffect(() => { setTexto((t) => (numero(t) === valor ? t : String(valor).replace(".", ","))); }, [valor]);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{rotulo}</span>
      <span className="flex items-center gap-1">
        <input className="input w-24" inputMode="decimal" disabled={disabled} value={texto}
          onChange={(e) => { setTexto(e.target.value); const v = numero(e.target.value); onValor(Number.isFinite(v) ? v : 0); }} />
        <span className="text-sm text-slate-500">%</span>
      </span>
    </label>
  );
}

/** Margem por categoria (vazio = usa a do tipo). */
function MargemCategorias({ categorias, cfg, podeEditar }: { categorias: Categoria[]; cfg: ConfigPreco; podeEditar: boolean }) {
  const invalidar = useInvalidate();
  const [aberto, setAberto] = useState(false);
  const ativas = categorias.filter((c) => c.ativo);
  const comMargem = ativas.filter((c) => c.margem_desejada != null).length;
  async function salvar(c: Categoria, texto: string) {
    const v = texto.trim() === "" ? null : numero(texto);
    if (v != null && (!Number.isFinite(v) || v < 0 || v + despesasPct(cfg) >= 95)) { notify("Margem inválida", "erro"); return; }
    if ((c.margem_desejada ?? null) === v) return;
    const { error } = await supabase.from("categorias_produto").update({ margem_desejada: v }).eq("id", c.id);
    if (error) notifyError(error); else { notify(v == null ? `${c.nome}: usa a margem do tipo` : `${c.nome}: margem de ${pct(v)}`); invalidar("categorias_produto"); }
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-surface p-3 sm:p-4">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setAberto((a) => !a)}>
        <span>
          <span className="block text-base font-bold">Margem por categoria</span>
          <span className="text-xs text-slate-500 sm:text-sm">{comMargem ? `${comMargem} ${pl(comMargem, "categoria", "categorias")} com margem própria` : "Todas usam a margem do tipo"} · toque para {aberto ? "fechar" : "abrir"}</span>
        </span>
      </button>
      {aberto && (
        <ul className="mt-3 divide-y divide-slate-100">
          {ativas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{c.nome}</span>
              <span className="flex shrink-0 items-center gap-1">
                <input className="input h-9 w-20 py-1" inputMode="decimal" placeholder="tipo" disabled={!podeEditar} aria-label={`Margem de ${c.nome}`}
                  defaultValue={c.margem_desejada != null ? String(c.margem_desejada).replace(".", ",") : ""}
                  onBlur={(e) => salvar(c, e.target.value)} />
                <span className="text-sm text-slate-500">%</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
