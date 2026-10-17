// Notas fiscais → NFS-e (serviços): todas as notas de serviço e a configuração fiscal de cada unidade (CNPJ/município).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, FileUp, FlaskConical, Info, Save, Settings2 } from "lucide-react";
import { Button, Field, Table, Tabs } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { useUnidade, EtiquetaUnidade } from "@/lib/unidade";
import { brl, dataBR, docFormat } from "@/lib/format";
import { NATUREZAS_NFSE, NFSE_EM_ANDAMENTO, REGIMES_NFSE, type Nfse, type NfseConfig } from "@/lib/nfse";
import { ChipNfse } from "./NfseOS";
import { ImportarNfse, ListaNfseImportadas } from "./NfseImportadas";

const FILTROS: { value: string; label: string; teste: (n: Nfse) => boolean }[] = [
  { value: "todas", label: "Todas", teste: () => true },
  { value: "andamento", label: "Em andamento", teste: (n) => NFSE_EM_ANDAMENTO.includes(n.status) },
  { value: "autorizadas", label: "Autorizadas", teste: (n) => n.status === "autorizada" && n.ambiente === "producao" },
  { value: "problemas", label: "Rejeitadas", teste: (n) => n.status === "rejeitada" },
  { value: "canceladas", label: "Canceladas", teste: (n) => n.status === "cancelada" },
  { value: "teste", label: "Teste", teste: (n) => n.ambiente === "homologacao" },
];

export function NfsePainel() {
  const { pode, tem } = usePerfil();
  const [aba, setAba] = useState<"notas" | "tomadas" | "config">("notas");
  const [importar, setImportar] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Tabs value={aba} onChange={setAba} options={[
          { value: "notas", label: "Emitidas" },
          { value: "tomadas", label: "Recebidas (tomadas)" },
          { value: "config", label: "Configuração por unidade" },
        ]} />
        {aba !== "config" && tem("financeiro") && (
          <Button variant="secondary" onClick={() => setImportar(true)}><FileUp size={16} /> Importar notas</Button>
        )}
      </div>
      {aba === "notas" ? <><ListaNfse /><ListaNfseImportadas tipo="emitida" /></>
        : aba === "tomadas" ? <ListaNfseImportadas tipo="tomada" />
        : <ConfigNfse podeEditar={pode("configurar_nfse")} />}
      {importar && <ImportarNfse onClose={() => setImportar(false)} />}
    </div>
  );
}

function ListaNfse() {
  const { filtrar } = useUnidade();
  const [filtro, setFiltro] = useState("todas");
  const { data: notas = [], isLoading } = useQuery({
    queryKey: ["nfse", "todas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nfse").select("*, os:ordens_servico!nfse_os_id_fkey(numero)").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as (Nfse & { os: { numero: number } | null })[];
    },
    refetchInterval: (q) => ((q.state.data as Nfse[] | undefined)?.some((n) => NFSE_EM_ANDAMENTO.includes(n.status)) ? 8000 : false),
  });
  const f = FILTROS.find((x) => x.value === filtro)!;
  const lista = filtrar(notas).filter(f.teste);
  const contagem = useMemo(() => Object.fromEntries(FILTROS.map((x) => [x.value, filtrar(notas).filter(x.teste).length])), [notas, filtrar]);

  return (
    <div>
      <p className="mb-3 flex gap-2 text-sm text-slate-600">
        <Info size={16} className="mt-0.5 shrink-0 text-slate-400" />
        A NFS-e é emitida na ordem de serviço (Assistência → OS → Nota de serviço). A OS só fica faturada quando a prefeitura autoriza.
        Notas feitas fora do ERP (Tiny, portal da prefeitura, Emissor Nacional) entram pelo botão Importar notas, com o XML ou o relatório do Tiny.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTROS.map((x) => (
          <button key={x.value} type="button" onClick={() => setFiltro(x.value)} aria-pressed={filtro === x.value}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtro === x.value ? "border-brand bg-brand-light text-fg" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {x.label} <span className="text-slate-400">{contagem[x.value] ?? 0}</span>
          </button>
        ))}
      </div>
      <Table empty={!isLoading && !lista.length} head={<>
        <th className="th">Data</th><th className="th">OS</th><th className="th">Tomador</th><th className="th text-right">Valor</th><th className="th">Situação</th><th className="th" />
      </>}>
        {lista.map((n) => (
          <tr key={n.id} className="tr">
            <td className="td whitespace-nowrap" data-label="Data">{dataBR(n.solicitado_em)}<EtiquetaUnidade id={n.unidade_id} /></td>
            <td className="td" data-label="OS">{n.os?.numero ? `#${n.os.numero}` : "—"}</td>
            <td className="td" data-label="Tomador">
              <div className="font-medium">{n.tomador?.nome ?? "—"}</div>
              <div className="text-xs text-slate-500">{docFormat(n.tomador?.documento)}</div>
              {n.status === "rejeitada" && n.mensagem && <div className="mt-0.5 text-xs text-red-700">{n.mensagem}</div>}
            </td>
            <td className="td text-right whitespace-nowrap" data-label="Valor">{brl(n.valor_servicos)}{n.valor_iss != null && <div className="text-xs text-slate-500">ISS {brl(n.valor_iss)}</div>}</td>
            <td className="td" data-label="Situação"><ChipNfse n={n} />{n.ambiente === "homologacao" && <FlaskConical size={12} className="ml-1 inline text-amber-600" aria-label="teste" />}</td>
            <td className="td" data-label="">
              {n.url_danfse && <a className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline" href={n.url_danfse} target="_blank" rel="noreferrer"><FileText size={14} /> PDF</a>}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

const VAZIA = (unidade_id: string): NfseConfig => ({
  unidade_id, ativo: false, padrao: "nacional", codigo_municipio: null, item_lista_servico: "14.01", codigo_tributacao_nacional: null,
  codigo_tributario_municipio: null, codigo_nbs: null, codigo_cnae: null, aliquota_iss: null, iss_retido: false, optante_simples_nacional: false,
  regime_especial_tributacao: null, natureza_operacao: null, incluir_pecas: false,
  discriminacao_modelo: "Serviço de assistência técnica — OS nº {os}. Equipamento: {equipamento}. Serviço realizado: {solucao}",
  enviar_email_tomador: true, observacoes: null,
  serie_dps: 1, proximo_numero_dps: 1, ibs_cbs_cst: "000", ibs_cbs_class_trib: "000001", codigo_indicador_operacao: null, consumidor_final: false,
});

function ConfigNfse({ podeEditar }: { podeEditar: boolean }) {
  const { unidades } = useUnidade();
  const { data: configs = [] } = useRows<NfseConfig>("nfse_config", { order: "unidade_id", ascending: true });
  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <Info size={18} className="mt-0.5 shrink-0" />
        <p>
          Cada CNPJ/município tem regras próprias: <b>revise estes campos com o contador</b> antes de ativar. Confirme também, no painel da Focus,
          se o município usa a <b>NFS-e Nacional</b> ou o sistema da prefeitura. O token da Focus fica só no servidor (secrets do Supabase).
        </p>
      </div>
      {unidades.filter((u) => u.ativo).map((u) => (
        <FormConfig key={u.id} unidadeNome={`${u.nome}${(u as any).cnpj ? ` · ${docFormat((u as any).cnpj)}` : ""}`}
          inicial={configs.find((c) => c.unidade_id === u.id) ?? VAZIA(u.id)} podeEditar={podeEditar} />
      ))}
    </div>
  );
}

function FormConfig({ inicial, unidadeNome, podeEditar }: { inicial: NfseConfig; unidadeNome: string; podeEditar: boolean }) {
  const [c, setC] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidate();
  const set = <K extends keyof NfseConfig>(k: K, v: NfseConfig[K]) => setC((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof NfseConfig, rotulo: string, ajuda?: string, ph?: string) => (
    <Field label={rotulo}>
      <input className="input" disabled={!podeEditar} value={(c[k] as string | null) ?? ""} placeholder={ph}
        onChange={(e) => set(k, (e.target.value.trim() ? e.target.value : null) as never)} />
      {ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
    </Field>
  );

  async function salvar() {
    setSalvando(true);
    try {
      const { error } = await supabase.from("nfse_config").upsert({
        ...c, aliquota_iss: c.aliquota_iss == null || (c.aliquota_iss as unknown) === "" ? null : Number(String(c.aliquota_iss).replace(",", ".")),
        ibs_cbs_cst: c.ibs_cbs_cst || "000", ibs_cbs_class_trib: c.ibs_cbs_class_trib || "000001",
      }, { onConflict: "unidade_id" });
      if (error) throw error;
      invalidar("nfse_config");
      notify("Configuração da NFS-e salva");
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold"><Settings2 size={17} className="text-brand" /> {unidadeNome}</h3>
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4" checked={c.ativo} disabled={!podeEditar} onChange={(e) => set("ativo", e.target.checked)} />
          Emitir NFS-e por esta unidade
        </label>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Padrão">
          <select className="input" disabled={!podeEditar} value={c.padrao} onChange={(e) => set("padrao", e.target.value as NfseConfig["padrao"])}>
            <option value="nacional">NFS-e Nacional (gov.br)</option>
            <option value="municipal">Sistema da prefeitura</option>
          </select>
        </Field>
        {txt("codigo_municipio", "Código IBGE do município", "7 números (ex.: São José/SC = 4216602)")}
        <Field label="Alíquota do ISS (%)">
          <input className="input" inputMode="decimal" disabled={!podeEditar} value={c.aliquota_iss ?? ""} placeholder="ex.: 2"
            onChange={(e) => set("aliquota_iss", (e.target.value as unknown as number) || null)} />
        </Field>
        {txt("item_lista_servico", "Item da lista de serviços (LC 116)", "Conserto e manutenção de máquinas: 14.01", "14.01")}
        {c.padrao === "nacional"
          ? txt("codigo_tributacao_nacional", "Código de tributação nacional", "6 números, conforme o contador (ex.: 140101)")
          : txt("codigo_tributario_municipio", "Código do serviço na prefeitura", "Conforme a lista do município")}
        {txt("codigo_cnae", "CNAE do serviço", "Opcional em alguns municípios")}
        {c.padrao === "nacional" && txt("codigo_nbs", "Código NBS", "Se o município/contador pedir")}
        <Field label="Regime especial de tributação">
          <select className="input" disabled={!podeEditar} value={c.regime_especial_tributacao ?? ""}
            onChange={(e) => set("regime_especial_tributacao", e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">{c.padrao === "nacional" ? "0 · Nenhum (padrão)" : "Nenhum"}</option>
            {REGIMES_NFSE[c.padrao].filter((r) => !(c.padrao === "nacional" && r.valor === 0)).map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
          </select>
        </Field>
        {c.padrao === "municipal" && (
          <Field label="Natureza da operação">
            <select className="input" disabled={!podeEditar} value={c.natureza_operacao ?? ""}
              onChange={(e) => set("natureza_operacao", e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">1 · Tributação no município (padrão)</option>
              {NATUREZAS_NFSE.slice(1).map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
            </select>
          </Field>
        )}
      </div>
      {c.padrao === "nacional" && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3">
          <h4 className="mb-2 text-sm font-semibold">Numeração da DPS e Reforma tributária</h4>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Série da DPS">
              <input className="input" inputMode="numeric" disabled={!podeEditar} value={c.serie_dps}
                onChange={(e) => set("serie_dps", Math.min(49999, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))} />
            </Field>
            <Field label="Próximo número (produção)">
              <input className="input" inputMode="numeric" disabled={!podeEditar} value={c.proximo_numero_dps}
                onChange={(e) => set("proximo_numero_dps", Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1))} />
            </Field>
            {txt("ibs_cbs_cst", "CST do IBS/CBS", "3 números (ex.: 000)", "000")}
            {txt("ibs_cbs_class_trib", "Classificação tributária (cClassTrib)", "6 números (ex.: 000001)", "000001")}
            {txt("codigo_indicador_operacao", "Indicador da operação (cIndOp)", "6 números, se o contador pedir")}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            O ERP numera cada DPS e nunca repete um número já usado. Se esta empresa já emitiu NFS-e Nacional por outro sistema (ex.: Tiny),
            use uma série diferente ou continue a partir do último número de lá.
          </p>
          <label className="mt-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" disabled={!podeEditar} checked={c.consumidor_final} onChange={(e) => set("consumidor_final", e.target.checked)} /> Serviço para uso/consumo pessoal do cliente (consumidor final)</label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4" disabled={!podeEditar} checked={c.iss_retido} onChange={(e) => set("iss_retido", e.target.checked)} /> ISS retido pelo tomador</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4" disabled={!podeEditar} checked={c.optante_simples_nacional} onChange={(e) => set("optante_simples_nacional", e.target.checked)} /> Optante do Simples Nacional</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4" disabled={!podeEditar} checked={c.incluir_pecas} onChange={(e) => set("incluir_pecas", e.target.checked)} /> Incluir as peças no valor da NFS-e</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4" disabled={!podeEditar} checked={c.enviar_email_tomador} onChange={(e) => set("enviar_email_tomador", e.target.checked)} /> Mandar a nota por e-mail ao cliente</label>
      </div>
      <Field label="Texto da discriminação" className="mt-3">
        <textarea className="input" rows={2} disabled={!podeEditar} value={c.discriminacao_modelo} onChange={(e) => set("discriminacao_modelo", e.target.value)} />
        <span className="mt-1 block text-xs text-slate-500">Use {"{os}"}, {"{equipamento}"}, {"{serie}"}, {"{defeito}"}, {"{solucao}"} e {"{cliente}"}. Dá para ajustar o texto de cada nota antes de enviar.</span>
      </Field>
      {podeEditar && <div className="mt-3"><Button type="button" disabled={salvando} onClick={salvar}><Save size={16} /> {salvando ? "Salvando…" : "Salvar"}</Button></div>}
    </section>
  );
}
