// Notas fiscais → Configurações da NF-e: o que cada unidade põe na nota (natureza, CFOP, ICMS, IPI, PIS/COFINS,
// IBS/CBS da Reforma Tributária e transferência). Exceções por estado, NCM ou produto ficam em Regras de tributação.
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Settings2 } from "lucide-react";
import { Button, Card, Field, Tabs } from "./ui";
import { useInvalidate } from "@/lib/data";
import { useConfig } from "@/lib/useConfig";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade } from "@/lib/unidade";
import { CLASS_TRIB, CST_IBS_CBS, CST_ICMS, CST_IPI, CST_PIS_COFINS, descricaoCodigo, type Codigo } from "@/lib/codigosFiscais";

type Aba = "geral" | "icms" | "ipi" | "pis" | "ibs" | "transf";

const CAMPOS_UNIDADE = [
  "serie_nfe", "natureza_operacao", "cfop_venda_producao", "cfop_venda_revenda", "informacoes_complementares",
  "icms_cst", "icms_aliquota_interna", "icms_reducao_base", "difal_ativo",
  "ipi_cst", "ipi_cst_aliquota_zero", "ipi_enquadramento",
  "pis_cst", "pis_aliquota", "cofins_cst", "cofins_aliquota", "pis_cofins_exclui_icms",
  "ibs_cbs_cst", "ibs_cbs_class_trib",
  "transf_icms_cst", "transf_pis_cofins_cst", "transf_destacar_ipi", "transf_ibs_cbs_cst", "transf_ibs_cbs_class_trib",
] as const;
const NUMEROS_UNIDADE = ["serie_nfe", "icms_aliquota_interna", "icms_reducao_base", "pis_aliquota", "cofins_aliquota"];
const CAMPOS_CONFIG = ["ibs_cbs_ativo", "cbs_aliquota", "ibs_uf_aliquota", "ibs_mun_aliquota"] as const;
const NUMEROS_CONFIG = ["cbs_aliquota", "ibs_uf_aliquota", "ibs_mun_aliquota"];

const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const pegar = (o: Record<string, any> | undefined, campos: readonly string[], numeros: string[]) =>
  Object.fromEntries(campos.map((k) => [k, numeros.includes(k) && o?.[k] != null ? String(Number(o[k])) : o?.[k] ?? ""]));

/** Lista de códigos com descrição; mantém um código fora da lista se já estiver gravado. */
export function SelectCodigo({ lista, value, onChange, vazio, disabled }: {
  lista: Codigo[]; value: string | null | undefined; onChange: (v: string) => void; vazio?: string; disabled?: boolean;
}) {
  const v = String(value ?? "");
  const fora = v && !lista.some(([c]) => c === v);
  return (
    <select className="input" value={v} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {vazio !== undefined && <option value="">{vazio}</option>}
      {fora && <option value={v}>{v}</option>}
      {lista.map(([c, d]) => <option key={c} value={c}>{c} - {d}</option>)}
    </select>
  );
}

export function ConfigNfe({ podeEditar, irParaRegras }: { podeEditar: boolean; irParaRegras: () => void }) {
  const { unidades, padrao } = useUnidade();
  const { data: config } = useConfig();
  const invalidar = useInvalidate();
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [aba, setAba] = useState<Aba>("geral");
  const [u, setU] = useState<Record<string, any>>({});
  const [c, setC] = useState<Record<string, any>>({});
  const [salvando, setSalvando] = useState(false);

  const id = unidadeId || padrao || unidades[0]?.id || "";
  const unidade = unidades.find((x) => x.id === id);
  useEffect(() => { if (unidade) setU(pegar(unidade, CAMPOS_UNIDADE, NUMEROS_UNIDADE)); }, [unidade]);
  useEffect(() => { if (config) setC(pegar(config, CAMPOS_CONFIG, NUMEROS_CONFIG)); }, [config]);

  const bloqueado = !podeEditar;
  const set = (k: string) => (e: { target: { value: string } }) => setU({ ...u, [k]: e.target.value });
  const campo = (k: string, label: string, cls = "", ph = "") => (
    <Field label={label} className={cls}><input className="input" value={u[k] ?? ""} onChange={set(k)} placeholder={ph} disabled={bloqueado} /></Field>
  );
  const codigo = (k: string, label: string, lista: Codigo[], cls = "") => (
    <Field label={label} className={cls}><SelectCodigo lista={lista} value={u[k]} onChange={(v) => setU({ ...u, [k]: v })} disabled={bloqueado} /></Field>
  );
  const chk = (k: string, label: string, o = u, setO = setU) => (
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={!!o[k]} disabled={bloqueado} onChange={(e) => setO({ ...o, [k]: e.target.checked })} /> <span>{label}</span></label>
  );
  const classTrib = (k: string, label: string) => (
    <Field label={label}>
      <input className="input" list="nfe-class-trib" inputMode="numeric" maxLength={6} value={u[k] ?? ""} onChange={set(k)} disabled={bloqueado} />
      {descricaoCodigo(CLASS_TRIB, u[k]) && <span className="mt-1 block text-xs text-slate-500">{descricaoCodigo(CLASS_TRIB, u[k])}</span>}
    </Field>
  );

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!unidade) return;
    setSalvando(true);
    try {
      const row: Record<string, any> = { ...u };
      for (const k of NUMEROS_UNIDADE) row[k] = num(row[k]);
      row.informacoes_complementares = String(row.informacoes_complementares ?? "").trim() || null;
      const { error } = await supabase.from("unidades").update(row).eq("id", unidade.id);
      if (error) throw error;
      const cfg: Record<string, any> = { ...c, ibs_cbs_ativo: !!c.ibs_cbs_ativo };
      for (const k of NUMEROS_CONFIG) cfg[k] = num(cfg[k]);
      const r = await supabase.from("configuracoes").update(cfg).eq("id", 1);
      if (r.error) throw r.error;
      notify(`Configurações da NF-e salvas (${unidade.nome})`);
      invalidar("unidades", "configuracoes");
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  if (!unidade) return <p className="text-sm text-slate-500">Cadastre as unidades em Configurações → Unidades.</p>;

  return (
    <form onSubmit={salvar} className="space-y-4">
      <datalist id="nfe-class-trib">{CLASS_TRIB.map(([k, d]) => <option key={k} value={k}>{d}</option>)}</datalist>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="flex items-center gap-2 font-semibold"><Settings2 size={18} className="text-brand" /> Padrão da NF-e de venda</h2>
          <p className="text-sm text-slate-600">
            Vale para toda nota desta unidade. Para uma exceção (um estado, um NCM, um tipo de produto), crie uma regra de tributação.
            {!podeEditar && <b> Só o administrador altera.</b>}
          </p>
        </div>
        {unidades.length > 1 && (
          <Field label="Unidade (CNPJ)" className="w-full sm:w-64">
            <select className="input" value={id} onChange={(e) => setUnidadeId(e.target.value)}>
              {unidades.map((x) => <option key={x.id} value={x.id}>{x.nome}{x.uf ? ` (${x.uf})` : ""}</option>)}
            </select>
          </Field>
        )}
      </div>

      <Tabs value={aba} onChange={setAba} options={[
        { value: "geral", label: "Geral" }, { value: "icms", label: "ICMS" }, { value: "ipi", label: "IPI" },
        { value: "pis", label: "PIS / COFINS" }, { value: "ibs", label: "IBS / CBS" }, { value: "transf", label: "Transferência" },
      ]} />

      <Card className="p-4">
        {aba === "geral" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {campo("natureza_operacao", "Natureza da operação", "sm:col-span-2", "Venda de mercadoria")}
            {campo("serie_nfe", "Série da NF-e")}
            <div />
            {campo("cfop_venda_producao", "CFOP venda do que a unidade fabrica", "", "5101")}
            {campo("cfop_venda_revenda", "CFOP revenda (peças, máquinas da outra unidade)", "", "5102")}
            <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-2">Para outro estado o CFOP 5 vira 6 sozinho (5101 → 6101).</p>
            <Field label="Texto fixo nas informações complementares (sai em toda nota desta unidade)" className="sm:col-span-4">
              <textarea className="input" rows={3} value={u.informacoes_complementares ?? ""} onChange={set("informacoes_complementares")} disabled={bloqueado}
                placeholder="Ex.: Empresa optante pelo lucro real. Garantia de 12 meses contra defeitos de fabricação." />
            </Field>
          </div>
        )}

        {aba === "icms" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {codigo("icms_cst", "Situação tributária (CST)", CST_ICMS, "sm:col-span-2")}
            {campo("icms_aliquota_interna", "Alíquota dentro do estado (%)")}
            {campo("icms_reducao_base", "Redução da base de cálculo (%)", "", "0")}
            <div className="sm:col-span-4">{chk("difal_ativo", "Calcular DIFAL na venda para consumidor final (sem IE) de outro estado")}</div>
            <p className="text-xs text-slate-500 sm:col-span-4">
              Para outro estado a alíquota sai sozinha: 12% (S/SE) ou 7% (N, NE, CO e ES); 4% para produto com conteúdo importado.
              A redução da base só entra com CST 20 ou 70.
            </p>
          </div>
        )}

        {aba === "ipi" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {codigo("ipi_cst", "Situação tributária (CST) do que a unidade fabrica", CST_IPI, "sm:col-span-2")}
            {codigo("ipi_cst_aliquota_zero", "CST quando a TIPI do produto é 0%", CST_IPI, "sm:col-span-2")}
            {campo("ipi_enquadramento", "Código de enquadramento", "", "999")}
            <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-3">
              A alíquota vem do cadastro de cada produto (TIPI do NCM). Só sai IPI no que esta unidade fabrica; peça revendida vai sem IPI.
              999 = tributação normal.
            </p>
          </div>
        )}

        {aba === "pis" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {codigo("pis_cst", "PIS: situação tributária (CST)", CST_PIS_COFINS, "sm:col-span-3")}
            {campo("pis_aliquota", "PIS (%)", "", "1,65")}
            {codigo("cofins_cst", "COFINS: situação tributária (CST)", CST_PIS_COFINS, "sm:col-span-3")}
            {campo("cofins_aliquota", "COFINS (%)", "", "7,6")}
            <div className="sm:col-span-4">{chk("pis_cofins_exclui_icms", "Excluir o ICMS da base do PIS/COFINS (Tema 69 do STF)")}</div>
            <p className="text-xs text-slate-500 sm:col-span-4">Lucro real (não cumulativo): PIS 1,65% e COFINS 7,6%.</p>
          </div>
        )}

        {aba === "ibs" && (
          <div className="space-y-4">
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
              Reforma Tributária: desde 2026 a SEFAZ exige o grupo <b>IBS/CBS</b> em cada item da NF-e (sem ele a nota é rejeitada com
              "IBS/CBS não informado"). Em 2026 é ano de teste: o valor sai destacado na nota, mas não é recolhido.
            </p>
            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold">Alíquotas (valem para as duas unidades)</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-4">{chk("ibs_cbs_ativo", "Informar IBS e CBS nas NF-e", c, setC)}</div>
                {([["cbs_aliquota", "CBS federal (%)"], ["ibs_uf_aliquota", "IBS estadual (%)"], ["ibs_mun_aliquota", "IBS municipal (%)"]] as const).map(([k, l]) => (
                  <Field key={k} label={l}><input className="input" value={c[k] ?? ""} onChange={(e) => setC({ ...c, [k]: e.target.value })} disabled={bloqueado || !c.ibs_cbs_ativo} /></Field>
                ))}
                <p className="self-end pb-2 text-xs text-slate-500">2026: CBS 0,9%, IBS estadual 0,1% e municipal 0%.</p>
              </div>
            </fieldset>
            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold">Venda ({unidade.nome})</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {codigo("ibs_cbs_cst", "Situação tributária (CST IBS/CBS)", CST_IBS_CBS, "sm:col-span-2")}
                {classTrib("ibs_cbs_class_trib", "Classificação tributária (cClassTrib)")}
                <p className="self-end pb-2 text-xs text-slate-500">
                  Base = valor do item menos ICMS, PIS e COFINS.
                </p>
              </div>
            </fieldset>
          </div>
        )}

        {aba === "transf" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <p className="text-sm text-slate-600 sm:col-span-4">
              NF-e quando esta unidade <b>envia</b> mercadoria para a outra (CFOP 5151/6151 para o que fabrica, 5152/6152 para o resto, valor pelo custo).
            </p>
            {codigo("transf_icms_cst", "ICMS: situação tributária (CST)", CST_ICMS, "sm:col-span-2")}
            {codigo("transf_pis_cofins_cst", "PIS/COFINS: situação tributária (CST)", CST_PIS_COFINS, "sm:col-span-2")}
            {codigo("transf_ibs_cbs_cst", "IBS/CBS: situação tributária (CST)", CST_IBS_CBS, "sm:col-span-2")}
            {classTrib("transf_ibs_cbs_class_trib", "IBS/CBS: classificação (cClassTrib)")}
            <div />
            <div className="sm:col-span-4">{chk("transf_destacar_ipi", "Destacar IPI ao transferir máquina fabricada aqui")}</div>
            <p className="text-xs text-slate-500 sm:col-span-4">Transferência entre estabelecimentos do mesmo CNPJ base não tem IBS/CBS (LC 214/2025, art. 6º, II): sai só o código 410 / 410002.</p>
          </div>
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="max-w-2xl text-sm text-slate-600">
          <b>Exceções:</b> CST, CFOP ou redução diferentes por estado de destino, NCM, tipo de produto ou cliente
          (ex.: CST 20 com redução para máquinas NCM 8418.69 em SC; CST 00 para MG, PR, RJ, RS e SP).
        </p>
        <Button type="button" variant="secondary" onClick={irParaRegras}>Regras de tributação <ArrowRight size={15} /></Button>
      </Card>

      {podeEditar && (
        <div className="flex justify-end">
          <Button disabled={salvando}>{salvando ? "Salvando…" : "Salvar configurações"}</Button>
        </div>
      )}
    </form>
  );
}
