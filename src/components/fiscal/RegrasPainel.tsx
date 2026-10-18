// Notas fiscais → Regras de tributação: as partes que explicam (como funciona, termos, cada regra em palavras com
// um exemplo em reais, o teste "e se eu vender…" e os modelos prontos com a base legal). A gravação continua no
// formulário da regra (FiscalAvancado.tsx). Tudo aqui é estimativa: a apuração e a decisão final são do contador.
import { useMemo, useState } from "react";
import { BookOpen, Calculator, ChevronDown, CircleHelp, FileCheck2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field } from "@/components/ui";
import { brl } from "@/lib/format";
import { useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { GLOSSARIO, MODELOS_REGRA, exemploRegra, oQueMuda, quandoVale, simularVenda, type ModeloRegra } from "@/lib/regrasTributacao";
import type { RegraTributaria } from "../../../supabase/functions/_shared/nfe-impostos";
import { EsquemaProcesso } from "@/components/sobre/Guardanapo";

const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ");
const pct = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")}%`;

/** Como o ERP escolhe o imposto de cada nota, em 3 passos e no desenho. */
export function ComoFuncionaRegras() {
  const [desenho, setDesenho] = useState(false);
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-base font-bold text-fg"><CircleHelp size={18} className="text-modulo" aria-hidden /> Como funciona</h3>
      <ol className="mt-3 grid gap-3 md:grid-cols-3">
        {[
          ["1", "Padrão da unidade", "Toda nota começa com o que está em Configurações da NF-e da unidade (SC ou SP): CST, alíquota interna, PIS/COFINS, IPI e DIFAL."],
          ["2", "A primeira regra que combina", "O ERP olha as regras da menor ordem para a maior e usa a primeira ativa que combina com a nota: unidade, venda ou transferência, estado, tipo de cliente, tipo de produto, origem e NCM."],
          ["3", "Troca só o que foi preenchido", "A regra troca só os campos preenchidos (ex.: CST 20 e a redução); o resto continua o padrão. Sem regra que combine, vale o padrão."],
        ].map(([n, t, d]) => (
          <li key={n} className="flex gap-3 rounded-xl bg-slate-50 p-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-modulo-escuro text-sm font-bold text-white" aria-hidden>{n}</span>
            <span className="min-w-0"><span className="block text-sm font-bold text-fg">{t}</span><span className="block text-xs leading-snug text-slate-600">{d}</span></span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => setDesenho((v) => !v)} aria-expanded={desenho}
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-modulo-escuro hover:underline">
        <ChevronDown size={16} className={`transition ${desenho ? "rotate-180" : ""}`} aria-hidden /> {desenho ? "Esconder o desenho" : "Ver em desenho"}
      </button>
      {desenho && <div className="mt-3"><EsquemaProcesso id="imposto-nota" /></div>}
    </Card>
  );
}

/** Os termos da tela explicados (CST, cBenef, redução, DIFAL…). */
export function GlossarioFiscal() {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-bold text-fg">
        <BookOpen size={18} className="text-modulo" aria-hidden /> Entenda os termos
        <span className="text-sm font-normal text-slate-500">· {GLOSSARIO.length} explicações</span>
        <ChevronDown size={16} className="ml-auto transition group-open:rotate-180" aria-hidden />
      </summary>
      <dl className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
        {GLOSSARIO.map((g) => (
          <div key={g.termo} className="min-w-0">
            <dt className="text-sm font-bold text-fg">{g.termo}</dt>
            <dd className="text-xs leading-snug text-slate-600">{g.texto}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Uma regra em cartão: quando vale, o que muda e um exemplo em reais. */
export function CartaoRegra({ r, nomeUnidade, podeEditar, onEditar, onApagar }: {
  r: RegraTributaria & { id?: string }; nomeUnidade: (id: string) => string; podeEditar: boolean; onEditar: () => void; onApagar: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const exemplo = exemploRegra(r);
  const muda = oQueMuda(r);
  return (
    <li className={`min-w-0 rounded-2xl border border-slate-200 bg-surface p-4 shadow-card ${r.ativo === false ? "opacity-75" : ""}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 min-w-10 shrink-0 place-items-center rounded-xl bg-modulo/15 px-2 text-sm font-bold text-modulo-escuro" title="Ordem: a menor vale primeiro">{r.prioridade}</span>
        <div className="min-w-0 flex-1 basis-60">
          <h3 className="text-base font-bold leading-snug text-fg">{r.nome} {r.ativo === false && <Badge value="inativo" />}</h3>
          <p className="mt-0.5 text-xs text-slate-600"><b className="text-slate-700">Quando vale:</b> {quandoVale(r, nomeUnidade)}</p>
        </div>
        {podeEditar && (
          <span className="flex shrink-0 gap-1">
            <Button variant="secondary" onClick={onEditar}><Pencil size={15} /> Editar</Button>
            <Button variant="ghost" className="!text-red-600" aria-label={`Apagar a regra ${r.nome}`} onClick={onApagar}><Trash2 size={15} /></Button>
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-1 text-xs leading-snug text-fg">
        {(aberta ? muda : muda.slice(0, 3)).map((t) => <li key={t} className="flex gap-2"><FileCheck2 size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden /><span>{t}</span></li>)}
      </ul>
      {(muda.length > 3 || exemplo.length > 0) && (
        <button type="button" onClick={() => setAberta((v) => !v)} aria-expanded={aberta} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-modulo-escuro hover:underline">
          <ChevronDown size={16} className={`transition ${aberta ? "rotate-180" : ""}`} aria-hidden /> {aberta ? "Mostrar menos" : exemplo.length ? "Ver tudo e o exemplo em reais" : "Ver tudo"}
        </button>
      )}
      {aberta && exemplo.length > 0 && (
        <div className="mt-3 min-w-0 overflow-x-auto rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">Exemplo: venda de {brl(10000)} (a alíquota depende do estado do cliente)</p>
          <table className="w-full min-w-[30rem] text-right text-xs">
            <thead className="text-xs text-slate-500"><tr><th className="py-1 text-left font-semibold">Alíquota</th><th className="font-semibold">Redução</th><th className="font-semibold">Base</th><th className="font-semibold">ICMS</th><th className="font-semibold">Sem a regra</th><th className="font-semibold">Carga</th></tr></thead>
            <tbody>
              {exemplo.map((x) => (
                <tr key={x.aliquota} className="border-t border-slate-200">
                  <td className="py-1 text-left font-semibold">{pct(x.aliquota)}</td><td>{pct(x.reducao)}</td><td>{brl(x.base)}</td>
                  <td className="font-semibold text-emerald-700">{brl(x.icms)}</td><td className="text-slate-500">{brl(x.semRegra)}</td><td className="font-semibold">{pct(x.carga)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.icms_desonerar && <p className="mt-2 text-xs text-slate-600">A diferença ("Sem a regra" − "ICMS") vai no campo ICMS desonerado da nota.</p>}
        </div>
      )}
    </li>
  );
}

/** "E se eu vender…": escolhe a venda e o ERP mostra a regra que vale e o ICMS estimado. */
export function TesteVenda({ regras }: { regras: (RegraTributaria & { id?: string })[] }) {
  const { unidades } = useUnidade();
  const { data: ufsIcms = [] } = useRows<{ uf: string; aliquota_interna: number }>("icms_uf", { order: "uf", ascending: true });
  const [f, setF] = useState({ unidade: unidades.find((u) => u.matriz)?.id ?? unidades[0]?.id ?? "", operacao: "venda", uf: "PR", contribuinte: "sim", tipo: "maquina", ncm: "84186910", importada: "nao", valor: "10000" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const un = unidades.find((u) => u.id === f.unidade) as (typeof unidades)[number] & { difal_ativo?: boolean } | undefined;
  const res = useMemo(() => !un?.uf ? null : simularVenda(regras, {
    unidade: { id: un.id, uf: un.uf, icms_cst: un.icms_cst, icms_aliquota_interna: un.icms_aliquota_interna, icms_reducao_base: un.icms_reducao_base, difal_ativo: un.difal_ativo },
    operacao: f.operacao as "venda", ufDestino: f.uf, contribuinte: f.contribuinte === "sim", tipo: f.tipo, ncm: f.ncm, importada: f.importada === "sim",
    valor: Number(f.valor.replace(/\./g, "").replace(",", ".")) || 0, aliquotasUf: Object.fromEntries(ufsIcms.map((x) => [x.uf, Number(x.aliquota_interna)])),
  }), [regras, un, f, ufsIcms]);
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-base font-bold text-fg"><Calculator size={18} className="text-modulo" aria-hidden /> E se eu vender…</h3>
      <p className="text-sm text-slate-600">Escolha a venda e veja qual regra vale e quanto fica o ICMS. É só um teste: nada é gravado e nenhuma nota é emitida.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Unidade"><select className="input" value={f.unidade} onChange={set("unidade")}>{unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.uf ? ` (${u.uf})` : ""}</option>)}</select></Field>
        <Field label="Operação"><select className="input" value={f.operacao} onChange={set("operacao")}><option value="venda">Venda</option><option value="transferencia">Transferência</option><option value="remessa">Remessa (conserto, garantia…)</option></select></Field>
        <Field label="Estado do cliente"><select className="input" value={f.uf} onChange={set("uf")}>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Cliente tem IE?"><select className="input" value={f.contribuinte} onChange={set("contribuinte")}><option value="sim">Sim (contribuinte)</option><option value="nao">Não (consumidor final)</option></select></Field>
        <Field label="Produto"><select className="input" value={f.tipo} onChange={set("tipo")}><option value="maquina">Máquina</option><option value="peca">Peça</option><option value="acessorio">Acessório</option><option value="insumo">Insumo</option></select></Field>
        <Field label="NCM"><input className="input" inputMode="numeric" value={f.ncm} onChange={set("ncm")} /></Field>
        <Field label="Importado?"><select className="input" value={f.importada} onChange={set("importada")}><option value="nao">Não (nacional)</option><option value="sim">Sim (origem 1, 2, 3 ou 8)</option></select></Field>
        <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={f.valor} onChange={set("valor")} /></Field>
      </div>
      {res && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <div className={`rounded-xl p-3 text-sm ${res.regra ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>
            <div className="text-xs font-bold uppercase tracking-wide">Regra que vale</div>
            <div className="mt-0.5 text-base font-bold">{res.regra ? res.regra.nome : "Nenhuma: vale o padrão da unidade"}</div>
            <div className="mt-1 text-xs">{res.interestadual ? "Venda para outro estado" : "Venda dentro do estado"} · CST {res.cst}{res.cbenef ? ` · cBenef ${res.cbenef}` : ""}{!res.ipiDestacado ? " · sem IPI destacado" : ""}</div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {[
              ["Alíquota", pct(res.aliquota)], ["Redução da base", pct(res.reducao)], ["Base do ICMS", brl(res.base)],
              ["ICMS na nota", brl(res.icms)], ["Carga sobre o valor", pct(res.carga)],
              ...(res.desonerado ? [["ICMS desonerado", brl(res.desonerado)]] : []),
              ...(res.difal != null ? [["DIFAL estimado (guia)", brl(res.difal)]] : []),
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 p-2"><dt className="text-2xs font-semibold uppercase text-slate-500">{k}</dt><dd className="font-bold text-fg">{v}</dd></div>
            ))}
          </dl>
          {res.avisos.length > 0 && <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 lg:col-span-2">{res.avisos.map((a) => <li key={a}>• {a}</li>)}</ul>}
          <p className="text-xs text-slate-500 lg:col-span-2">Estimativa do ICMS do item. A nota de verdade usa também o cadastro do produto (NCM, origem, IPI) e as Configurações da NF-e. Confirmar com o contador.</p>
        </div>
      )}
    </Card>
  );
}

/** Modelos prontos com a explicação e a base legal: abrem o formulário preenchido para conferir e salvar. */
export function ModelosRegra({ existentes, podeEditar, onUsar }: { existentes: string[]; podeEditar: boolean; onUsar: (m: ModeloRegra) => void }) {
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-base font-bold text-fg"><Sparkles size={18} className="text-modulo" aria-hidden /> Modelos prontos</h3>
      <p className="text-sm text-slate-600">Regras comuns para a MF, com o que fazem e a base legal. "Usar" abre o formulário já preenchido: nada é salvo antes de você conferir e clicar em Salvar. <b>Confirme cada uma com o contador.</b></p>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {MODELOS_REGRA.map((m) => {
          const ja = existentes.some((n) => n.trim().toLowerCase() === String(m.regra.nome ?? "").trim().toLowerCase());
          return (
            <li key={m.id} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-slate-200 p-3">
              <div className="flex items-start gap-2"><span className="min-w-0 flex-1 text-sm font-bold text-fg">{m.titulo}</span>{ja && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-2xs font-bold text-emerald-800">já cadastrada</span>}</div>
              <p className="text-xs leading-snug text-slate-600">{m.paraQue}</p>
              <p className="text-xs leading-snug text-slate-500"><b>Base legal:</b> {m.base}</p>
              {podeEditar && <div className="mt-auto pt-1"><Button type="button" variant="secondary" onClick={() => onUsar(m)}>{ja ? "Usar de novo" : "Usar este modelo"}</Button></div>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
