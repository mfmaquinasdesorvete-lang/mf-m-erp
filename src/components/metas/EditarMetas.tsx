// Cadastro das metas do mês (administrador ou financeiro): empresa, cada vendedor, cada região e cada estado,
// na unidade escolhida no painel (ou de todas juntas). Grava tudo de uma vez (metas_salvar) e copia as metas do mês
// anterior com % de aumento (metas_copiar). Em branco = sem meta (a que existia sai).
import { useMemo, useState, type ReactNode } from "react";
import { Copy, Save } from "lucide-react";
import { Button, Field, Modal, Tabs, nomeMes } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade } from "@/lib/unidade";
import { brl, pl } from "@/lib/format";
import { chaveRegiao, chaveUf, lerNumero, NOME_UF, numeroCampo, ORDEM_REGIOES, REGIOES, somarMeses, type TipoMeta } from "@/lib/metas";
import type { Vendedor } from "@/lib/types";

type MetaCadastro = {
  id: string; mes: string; tipo: TipoMeta; vendedor_id: string | null; regiao: string | null; unidade_id: string | null;
  meta_valor: number; meta_maquinas: number | null; meta_margem: number | null; observacao: string | null; ativo: boolean;
};
type Campos = { valor: string; maquinas: string; margem: string; obs: string };
type Alvo = { chave: string; tipo: TipoMeta; vendedor_id?: string; regiao?: string; rotulo: string; detalhe?: string };

const VAZIO: Campos = { valor: "", maquinas: "", margem: "", obs: "" };
const chaveDa = (m: Pick<MetaCadastro, "tipo" | "vendedor_id" | "regiao">) => (m.tipo === "vendedor" ? m.vendedor_id! : m.tipo === "regiao" ? m.regiao! : "empresa");

export function EditarMetas({ mes, unidadeId, referencia, onClose }: {
  mes: string; unidadeId: string | null; referencia: Map<string, number>; onClose: () => void;
}) {
  const { nome: nomeUnidade } = useUnidade();
  const invalidar = useInvalidate();
  const [aba, setAba] = useState<"vendedores" | "regioes">("vendedores");
  const [rascunho, setRascunho] = useState<Record<string, Partial<Campos>>>({});
  const [aumento, setAumento] = useState("0");
  const [ocupado, setOcupado] = useState(false);
  const { data: vendedores = [] } = useRows<Vendedor>("vendedores", { order: "nome", ascending: true });
  // todas as metas ativas do mês (todas as unidades): a cópia avisa se já há alguma
  const { data: doMes = [], isLoading } = useRows<MetaCadastro>("metas_vendas", {
    order: "criado_em", key: [mes], filtro: (q) => q.eq("mes", `${mes}-01`).eq("ativo", true),
  });
  const mesAnterior = somarMeses(mes, -1);

  const originais = useMemo(() => {
    const m = new Map<string, Campos>();
    for (const x of doMes.filter((x) => (x.unidade_id ?? null) === unidadeId)) {
      m.set(chaveDa(x), { valor: numeroCampo(Number(x.meta_valor) || null), maquinas: numeroCampo(x.meta_maquinas), margem: numeroCampo(x.meta_margem == null ? null : Number(x.meta_margem)), obs: x.observacao ?? "" });
    }
    return m;
  }, [doMes, unidadeId]);

  const alvosVendedores: Alvo[] = useMemo(() => [
    { chave: "empresa", tipo: "empresa", rotulo: "Empresa (meta geral)", detalhe: "Sem ela, o painel soma as metas dos vendedores" },
    ...vendedores.filter((v) => v.ativo || originais.has(v.id)).map((v): Alvo => ({
      chave: v.id, tipo: "vendedor", vendedor_id: v.id, rotulo: `${v.nome}${v.tipo === "representante" ? " (representante)" : ""}${v.ativo ? "" : " (inativo)"}`,
    })),
  ], [vendedores, originais]);

  const valor = (a: Alvo): Campos => ({ ...(originais.get(a.chave) ?? VAZIO), ...rascunho[a.chave] });
  const mudar = (chave: string, campo: keyof Campos, v: string) => setRascunho((r) => ({ ...r, [chave]: { ...r[chave], [campo]: v } }));
  const mudou = (a: Alvo) => {
    const o = originais.get(a.chave) ?? VAZIO, n = valor(a);
    return (["valor", "maquinas", "margem", "obs"] as const).some((k) => (o[k] ?? "").trim() !== (n[k] ?? "").trim());
  };
  const todosAlvos = (): Alvo[] => [
    ...alvosVendedores,
    ...ORDEM_REGIOES.flatMap((r) => [
      { chave: chaveRegiao(r), tipo: "regiao" as const, regiao: chaveRegiao(r), rotulo: `Região ${r}` },
      ...REGIOES[r].map((uf) => ({ chave: chaveUf(uf), tipo: "regiao" as const, regiao: chaveUf(uf), rotulo: `${NOME_UF[uf]} (${uf})` })),
    ]),
  ];
  const alterados = todosAlvos().filter(mudou);

  async function salvar() {
    const linhas: Record<string, unknown>[] = [];
    for (const a of alterados) {
      const c = valor(a);
      const meta = lerNumero(c.valor), maquinas = lerNumero(c.maquinas), margem = lerNumero(c.margem);
      if (Number.isNaN(meta) || (meta ?? 0) < 0) return notifyError(new Error(`${a.rotulo}: a meta em R$ não é um número válido`));
      if (Number.isNaN(maquinas) || (maquinas ?? 0) < 0 || (maquinas != null && !Number.isInteger(maquinas))) return notifyError(new Error(`${a.rotulo}: a meta de máquinas precisa ser um número inteiro`));
      if (Number.isNaN(margem) || (margem != null && (margem < -100 || margem > 100))) return notifyError(new Error(`${a.rotulo}: a margem vai de −100% a 100%`));
      linhas.push({
        tipo: a.tipo, vendedor_id: a.vendedor_id ?? null, regiao: a.regiao ?? null,
        meta_valor: meta, meta_maquinas: maquinas, meta_margem: margem, observacao: c.obs.trim() || null,
      });
    }
    if (!linhas.length) return onClose();
    setOcupado(true);
    const { data, error } = await supabase.rpc("metas_salvar", { p_mes: `${mes}-01`, p_unidade: unidadeId, p_linhas: linhas });
    setOcupado(false);
    if (error) return notifyError(error);
    notify(`Metas salvas (${data ?? linhas.length} ${pl(Number(data ?? linhas.length), "alteração", "alterações")}).`);
    invalidar("metas_vendas", "metas_apuracao");
    onClose();
  }

  async function copiar() {
    const pct = lerNumero(aumento) ?? 0;
    if (Number.isNaN(pct) || pct < -90 || pct > 500) return notifyError(new Error("o aumento vai de −90% a 500%"));
    const sinal = pct ? ` com ${pct > 0 ? "+" : ""}${pct.toLocaleString("pt-BR")}%` : "";
    let substituir = false;
    if (doMes.length || alterados.length) {
      const ok = await confirmar(
        `${doMes.length ? `Já há ${doMes.length} ${pl(doMes.length, "meta", "metas")} em ${nomeMes(mes)}. Trocar pelas de ${nomeMes(mesAnterior)}${sinal}?` : `Copiar as metas de ${nomeMes(mesAnterior)}${sinal}?`}`
        + `${alterados.length ? " O que foi digitado nesta janela e não foi salvo se perde." : ""}`,
        { titulo: "Copiar do mês anterior", ok: doMes.length ? "Trocar" : "Copiar" });
      if (!ok) return;
      substituir = doMes.length > 0;
    }
    setOcupado(true);
    const { data, error } = await supabase.rpc("metas_copiar", { p_de: `${mesAnterior}-01`, p_para: `${mes}-01`, p_aumento: pct, p_substituir: substituir });
    setOcupado(false);
    if (error) return notifyError(error);
    const n = Number(data ?? 0);
    if (!n) return notify(`Nenhuma meta em ${nomeMes(mesAnterior)} para copiar.`, "erro");
    notify(`${n} ${pl(n, "meta copiada", "metas copiadas")} de ${nomeMes(mesAnterior)}${sinal}.`);
    setRascunho({});
    invalidar("metas_vendas", "metas_apuracao");
  }

  const linha = (a: Alvo, destaque = false) => (
    <LinhaMeta key={a.chave} alvo={a} campos={valor(a)} alterada={mudou(a)} destaque={destaque}
      referencia={referencia.get(a.chave)} mesAnterior={mesAnterior} onChange={(k, v) => mudar(a.chave, k, v)} />
  );

  return (
    <Modal open onClose={onClose} wide title={`Metas de ${nomeMes(mes)} · ${unidadeId ? nomeUnidade(unidadeId) : "todas as unidades"}`}>
      <p className="mb-3 text-sm text-slate-600">
        Meta em R$ de faturamento; máquinas e margem mínima são opcionais. Deixe em branco para não ter meta.
        {unidadeId ? " Estas metas valem só para esta unidade." : " Estas metas valem para as unidades juntas; sem elas, o painel soma as metas de cada unidade."}
      </p>
      <Tabs value={aba} onChange={setAba} options={[{ value: "vendedores", label: "Empresa e vendedores" }, { value: "regioes", label: "Regiões e estados" }]} />
      {isLoading ? <p className="py-6 text-sm text-slate-500">Carregando as metas…</p> : aba === "vendedores" ? (
        <Lista>{alvosVendedores.map((a) => linha(a, a.tipo === "empresa"))}</Lista>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">A meta da região vale para a região inteira. Sem ela, a região soma as metas dos estados.</p>
          {ORDEM_REGIOES.map((r) => {
            const ufs = REGIOES[r].map((uf): Alvo => ({ chave: chaveUf(uf), tipo: "regiao", regiao: chaveUf(uf), rotulo: `${NOME_UF[uf]} (${uf})` }));
            const aberta = ufs.some((u) => originais.has(u.chave) || rascunho[u.chave]);
            return (
              <section key={r} className="rounded-xl border border-slate-200 px-3">
                <Lista>{linha({ chave: chaveRegiao(r), tipo: "regiao", regiao: chaveRegiao(r), rotulo: `Região ${r}`, detalhe: REGIOES[r].join(", ") }, true)}</Lista>
                <details open={aberta} className="border-t border-slate-100 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-modulo-texto">Metas por estado ({ufs.filter((u) => originais.has(u.chave)).length} de {ufs.length})</summary>
                  <Lista>{ufs.map((u) => linha(u))}</Lista>
                </details>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Aumento sobre o mês anterior (%)" className="w-44">
            <input className="input" inputMode="decimal" value={aumento} onChange={(e) => setAumento(e.target.value.replace(/[^\d,.-]/g, "").slice(0, 7))} />
          </Field>
          <Button type="button" variant="secondary" onClick={copiar} disabled={ocupado}><Copy size={16} /> Copiar do mês anterior</Button>
          <p className="w-full text-xs text-slate-500">Copia as metas de {nomeMes(mesAnterior)} de todas as unidades (vendedor inativo fica de fora).</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={ocupado || isLoading}>
            <Save size={16} /> {ocupado ? "Salvando…" : alterados.length ? `Salvar (${alterados.length})` : "Salvar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Lista({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="hidden gap-2 border-b border-slate-100 pb-1.5 pt-1 text-2xs font-semibold uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(0,1.5fr)_8.5rem_5.5rem_6rem_minmax(0,1.3fr)]">
        <span>Quem</span><span>Meta (R$)</span><span>Máquinas</span><span>Margem mín. %</span><span>Observação</span>
      </div>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </div>
  );
}

function LinhaMeta({ alvo, campos, alterada, destaque, referencia, mesAnterior, onChange }: {
  alvo: Alvo; campos: Campos; alterada: boolean; destaque: boolean; referencia?: number; mesAnterior: string;
  onChange: (campo: keyof Campos, v: string) => void;
}) {
  const rotulo = (t: string) => <span className="mb-1 block text-2xs font-semibold text-slate-500 md:sr-only">{t}</span>;
  const numero = (campo: keyof Campos, max: number) => (e: { target: { value: string } }) => onChange(campo, e.target.value.replace(/[^\d,.-]/g, "").slice(0, max));
  return (
    <li className={`grid grid-cols-4 gap-2 py-2.5 md:grid-cols-[minmax(0,1.5fr)_8.5rem_5.5rem_6rem_minmax(0,1.3fr)] md:items-center ${alterada ? "bg-amber-50/60" : ""}`}>
      <div className="col-span-4 min-w-0 md:col-span-1">
        <div className={`truncate text-sm ${destaque ? "font-bold" : "font-semibold"} text-fg`}>{alvo.rotulo}{alterada && <span className="ml-1.5 text-xs font-normal text-amber-700">(alterada)</span>}</div>
        {(alvo.detalhe || referencia != null) && (
          <div className="truncate text-xs text-slate-500">
            {alvo.detalhe}{alvo.detalhe && referencia != null ? " · " : ""}{referencia != null && `vendeu ${brl(referencia)} em ${nomeMes(mesAnterior)}`}
          </div>
        )}
      </div>
      <label className="col-span-2 min-w-0 md:col-span-1">{rotulo("Meta (R$)")}
        <input className="input" inputMode="decimal" placeholder="R$" aria-label={`Meta em R$: ${alvo.rotulo}`} value={campos.valor} onChange={numero("valor", 16)} />
      </label>
      <label className="min-w-0">{rotulo("Máquinas")}
        <input className="input" inputMode="numeric" placeholder="—" aria-label={`Meta de máquinas: ${alvo.rotulo}`} value={campos.maquinas} onChange={numero("maquinas", 5)} />
      </label>
      <label className="min-w-0">{rotulo("Margem mín. %")}
        <input className="input" inputMode="decimal" placeholder="—" aria-label={`Margem mínima em %: ${alvo.rotulo}`} value={campos.margem} onChange={numero("margem", 6)} />
      </label>
      <label className="col-span-4 min-w-0 md:col-span-1">{rotulo("Observação")}
        <input className="input" maxLength={500} aria-label={`Observação: ${alvo.rotulo}`} value={campos.obs} onChange={(e) => onChange("obs", e.target.value)} />
      </label>
    </li>
  );
}
