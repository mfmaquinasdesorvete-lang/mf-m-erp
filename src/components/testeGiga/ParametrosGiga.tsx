// Parâmetros do Teste do giga: limites da continuidade do aterramento e da tensão suportável, com padrão geral e
// limite próprio por modelo (campo vazio no modelo = vale o geral). Só o administrador grava. A revisão do
// formulário REG-006 muda em Configurações → Orçamentos e garantia → Textos dos documentos.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Info, Plus, Save, Undo2 } from "lucide-react";
import { Button, Field, Section } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import {
  CAMPOS_PARAMETRO, fmtNum, lerNumero, parametrosDoModelo, REG006, type CampoParametro, type ParametroCadastro,
} from "@/lib/testeGiga";
import { CHAVES_GIGA, salvarParametrosGiga } from "@/lib/testeGigaDados";
import type { ContextoGiga } from "./tipos";

type Valores = Record<CampoParametro | "observacao", string>;
const valoresDe = (p?: ParametroCadastro | null): Valores => ({
  ...Object.fromEntries(CAMPOS_PARAMETRO.map(({ campo }) => [campo, p?.[campo] != null ? fmtNum(p[campo]) : ""])) as Record<CampoParametro, string>,
  observacao: p?.observacao ?? "",
});
/** Muda quando o banco devolve outros valores: o formulário recomeça com eles. */
const chaveDe = (p?: ParametroCadastro | null) => JSON.stringify(valoresDe(p));

export function ParametrosGiga({ ctx, admin, revisao }: { ctx: ContextoGiga; admin: boolean; revisao: string }) {
  const geral = ctx.parametros.find((p) => !p.produto_id && p.ativo !== false) ?? null;
  const proprios = ctx.parametros.filter((p) => p.produto_id && p.ativo !== false);
  const [novos, setNovos] = useState<string[]>([]);
  const modelos = useMemo(() => [...new Set([...proprios.map((p) => p.produto_id!), ...novos])], [proprios, novos]);
  const semLimite = ctx.maquinas.filter((m) => !modelos.includes(m.id));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Os limites são da empresa: <b>confirme cada valor com o responsável técnico</b>. Os ensaios de segurança elétrica de aparelhos seguem a
          família IEC/NBR 60335. O ERP só compara a medida com o limite cadastrado e sugere aprovado ou reprovado; quem marca é o operador.
          Os números apagados nos campos são só exemplos.{!admin && " Só o administrador muda os limites."}
        </span>
      </p>

      <Section title="Padrão geral (todos os modelos)">
        <FormLimites key={chaveDe(geral)} produtoId={null} atual={geral} podeEditar={admin} />
      </Section>

      <Section title="Limite próprio por modelo" actions={admin && semLimite.length > 0 ? (
        <select className="input w-auto max-w-full" value="" aria-label="Adicionar limite de um modelo"
          onChange={(e) => e.target.value && setNovos((n) => [...n, e.target.value])}>
          <option value="">+ Adicionar modelo…</option>
          {semLimite.map((m) => <option key={m.id} value={m.id}>{ctx.nomeMaquina(m.id)}</option>)}
        </select>
      ) : undefined}>
        {!modelos.length ? (
          <p className="py-4 text-center text-sm text-slate-500">Nenhum modelo com limite próprio: todos usam o padrão geral.</p>
        ) : (
          <div className="space-y-4">
            {modelos.map((id) => (
              <div key={id} className="rounded-xl border border-slate-200 p-3">
                <h3 className="mb-2 text-sm font-bold text-fg">{ctx.nomeMaquina(id)}</h3>
                <FormLimites key={chaveDe(proprios.find((p) => p.produto_id === id))} produtoId={id} atual={proprios.find((p) => p.produto_id === id) ?? null} geral={parametrosDoModelo(ctx.parametros, null).valores}
                  podeEditar={admin} onDescartar={() => setNovos((n) => n.filter((x) => x !== id))} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Formulário REG-006">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Título</dt><dd className="font-semibold text-fg">{REG006.titulo}</dd></div>
          <div><dt className="text-xs text-slate-500">Código</dt><dd className="font-semibold text-fg">{REG006.codigo}</dd></div>
          <div><dt className="text-xs text-slate-500">Revisão</dt><dd className="font-semibold text-fg">{revisao}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">
          A revisão sai no cabeçalho do PDF. Para mudar: {admin
            ? <Link to="/configuracoes/orcamentos" className="link-acao">Configurações → Orçamentos e garantia → Textos dos documentos</Link>
            : "Configurações → Orçamentos e garantia → Textos dos documentos (administrador)"}.
        </p>
      </Section>
    </div>
  );
}

/** Os cinco limites de um modelo (ou do padrão geral) e a observação. */
function FormLimites({ produtoId, atual, geral, podeEditar, onDescartar }: {
  produtoId: string | null; atual: ParametroCadastro | null; geral?: Record<CampoParametro, number | null>; podeEditar: boolean; onDescartar?: () => void;
}) {
  const invalidar = useInvalidate();
  const [v, setV] = useState<Valores>(() => valoresDe(atual));
  const [salvando, setSalvando] = useState(false);
  const inicial = valoresDe(atual);
  const mudou = (Object.keys(v) as (keyof Valores)[]).some((k) => v[k].trim() !== inicial[k].trim());
  const invalidos = CAMPOS_PARAMETRO.filter(({ campo }) => Number.isNaN(lerNumero(v[campo])));

  async function salvar(vazio = false) {
    if (!vazio && invalidos.length) return notifyError(new Error(`Número inválido em: ${invalidos.map((c) => c.rotulo.toLowerCase()).join(", ")}`));
    setSalvando(true);
    try {
      const dados = vazio ? {} : {
        ...Object.fromEntries(CAMPOS_PARAMETRO.map(({ campo }) => [campo, lerNumero(v[campo])])),
        observacao: v.observacao.trim() || null,
      };
      await salvarParametrosGiga(produtoId, dados);
      notify(vazio ? "O modelo volta a usar o padrão geral" : "Limites salvos");
      if (vazio) { setV(valoresDe(null)); onDescartar?.(); }
      invalidar(...CHAVES_GIGA);
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }

  const grupo = (teste: "aterramento" | "tensao", titulo: string) => (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CAMPOS_PARAMETRO.filter((c) => c.teste === teste).map((c) => (
          <Field key={c.campo} label={`${c.rotulo} (${c.unidade})`}>
            <input className={`input num ${Number.isNaN(lerNumero(v[c.campo])) ? "!border-red-400" : ""}`} inputMode="decimal" value={v[c.campo]} disabled={!podeEditar}
              placeholder={geral?.[c.campo] != null ? `geral: ${fmtNum(geral[c.campo])}` : `ex.: ${c.tipico}`}
              onChange={(e) => setV((x) => ({ ...x, [c.campo]: e.target.value }))} />
          </Field>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-3">
      {grupo("aterramento", "Continuidade do aterramento")}
      {grupo("tensao", "Tensão suportável")}
      <Field label="Observação (ex.: de onde vem o limite, quem confirmou)">
        <input className="input" value={v.observacao} maxLength={500} disabled={!podeEditar} onChange={(e) => setV((x) => ({ ...x, observacao: e.target.value }))} />
      </Field>
      {produtoId && <p className="text-xs text-slate-500">Campo vazio no modelo usa o padrão geral.</p>}
      {podeEditar && (
        <div className="flex flex-wrap justify-end gap-2">
          {produtoId && (atual ? <Button variant="ghost" disabled={salvando} onClick={() => salvar(true)}><Undo2 size={15} /> Usar só o padrão geral</Button>
            : <Button variant="ghost" disabled={salvando} onClick={onDescartar}>Descartar</Button>)}
          <Button disabled={salvando || (!mudou && !!atual)} onClick={() => salvar()}>{atual ? <Save size={15} /> : <Plus size={15} />} {salvando ? "Salvando…" : "Salvar limites"}</Button>
        </div>
      )}
    </div>
  );
}
