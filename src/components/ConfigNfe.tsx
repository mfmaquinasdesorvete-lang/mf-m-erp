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
import { cbenefObrigatorio } from "../../supabase/functions/_shared/nfe-conferencia";
import { OPCOES_ICMS_TRANSFERENCIA } from "../../supabase/functions/_shared/nfe-transferencia";

type Aba = "geral" | "icms" | "ipi" | "pis" | "ibs" | "transf";

const CAMPOS_UNIDADE = [
  "serie_nfe", "natureza_operacao", "cfop_venda_producao", "cfop_venda_revenda", "informacoes_complementares",
  "icms_cst", "icms_aliquota_interna", "icms_reducao_base", "difal_ativo",
  "ipi_cst", "ipi_cst_aliquota_zero", "ipi_enquadramento",
  "pis_cst", "pis_aliquota", "cofins_cst", "cofins_aliquota", "pis_cofins_exclui_icms",
  "ibs_cbs_cst", "ibs_cbs_class_trib",
  "transf_icms_cst", "transf_pis_cofins_cst", "transf_destacar_ipi", "transf_ibs_cbs_cst", "transf_ibs_cbs_class_trib",
  "transf_cbenef", "transf_ipi_base",
] as const;
/** Colunas novas (migração da transferência): só vão no salvar se o banco já tem a coluna. */
const CAMPOS_NOVOS = ["transf_cbenef", "transf_ipi_base"];
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
      row.transf_cbenef = String(row.transf_cbenef ?? "").trim().toUpperCase() || null;
      row.transf_ipi_base = row.transf_ipi_base || "custo";
      if (row.transf_cbenef && !/^[A-Z0-9]{8,10}$/.test(row.transf_cbenef)) throw new Error("Código de benefício (cBenef) da transferência: 8 a 10 letras e números, sem espaços (ex.: o que o contador passar).");
      for (const k of CAMPOS_NOVOS) if (!(k in unidade)) delete row[k];
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
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              NF-e quando esta unidade <b>envia</b> mercadoria para a outra. O valor é o custo (LC 87/1996, art. 13, § 4º: no que foi comprado, a
              entrada mais recente; no que foi fabricado, matéria-prima, material secundário, mão de obra e embalagem).
              As opções abaixo são escolhas da empresa: <b>confirme com o contador</b> antes de mudar.
            </p>

            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold">ICMS</legend>
              <div className="space-y-2">
                {[...OPCOES_ICMS_TRANSFERENCIA, ...(u.transf_icms_cst && !OPCOES_ICMS_TRANSFERENCIA.some((o) => o.cst === u.transf_icms_cst)
                  ? [{ cst: String(u.transf_icms_cst), rotulo: `${u.transf_icms_cst} · ${descricaoCodigo(CST_ICMS, u.transf_icms_cst) || "CST gravado"}`, ajuda: "CST fora das opções da transferência: confira com o contador." }] : [])].map((o) => (
                  <label key={o.cst} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${u.transf_icms_cst === o.cst ? "border-brand bg-surface" : "border-slate-200"}`}>
                    <input type="radio" className="mt-1 h-4 w-4 shrink-0" name="transf_icms_cst" checked={u.transf_icms_cst === o.cst} disabled={bloqueado}
                      onChange={() => setU({ ...u, transf_icms_cst: o.cst })} />
                    <span><span className="text-sm font-semibold">{o.rotulo}</span><span className="block text-xs text-slate-600">{o.ajuda}</span></span>
                  </label>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Field label="Código de benefício fiscal da transferência (cBenef)" className="sm:col-span-2">
                  <input className="input uppercase" maxLength={10} value={u.transf_cbenef ?? ""} onChange={set("transf_cbenef")}
                    placeholder="Peça o código ao contador" disabled={bloqueado || u.transf_icms_cst === "00"} />
                </Field>
                <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-2">
                  Vai na nota quando o ICMS sai sem destaque (CST 40, 41, 50). Com CST 00 não vai. Uma regra de tributação de transferência com cBenef vale por cima deste.
                </p>
              </div>
              {cbenefObrigatorio(unidade.uf, u.transf_icms_cst) && !String(u.transf_cbenef ?? "").trim() && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  Com o CST {u.transf_icms_cst}, a SEFAZ de {unidade.uf} recusa a nota sem o cBenef. Informe o código que o contador indicar ou escolha destacar o ICMS (CST 00).
                  Enquanto isso, o ERP não envia a nota de transferência (para não perder o número).
                </p>
              )}
            </fieldset>

            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold">IPI (só no que esta unidade fabrica)</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div className="sm:col-span-4">{chk("transf_destacar_ipi", "Destacar o IPI ao transferir máquina ou peça fabricada aqui")}</div>
                <Field label="Base do IPI na transferência" className="sm:col-span-2">
                  <select className="input" value={u.transf_ipi_base || "custo"} onChange={set("transf_ipi_base")} disabled={bloqueado || !u.transf_destacar_ipi}>
                    <option value="custo">Custo (o valor da nota)</option>
                    <option value="preco_venda">Preço de venda do cadastro</option>
                  </select>
                </Field>
                <p className="text-xs text-slate-600 sm:col-span-4">
                  A filial que revende o que a matriz fabrica é equiparada a industrial (RIPI, Decreto 7.212/2010, art. 9º, III), salvo se só vende no varejo:
                  aí o IPI destacado na transferência vira crédito na filial, que destaca de novo na venda. Na transferência, o IPI tem valor mínimo: o preço de
                  atacado da praça (RIPI, art. 195, I); o custo pode ficar abaixo. Sem destacar, a nota sai sem o IPI: só com o fundamento que o contador indicar
                  (ex.: suspensão, por uma regra de tributação com o CST e o enquadramento). <b>Confirme com o contador.</b>
                </p>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold">PIS/COFINS e IBS/CBS</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {codigo("transf_pis_cofins_cst", "PIS/COFINS: situação tributária (CST)", CST_PIS_COFINS, "sm:col-span-2")}
                <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-2">
                  Transferência não é receita nem compra: sem PIS/COFINS na saída e sem crédito na entrada (Leis 10.637/2002 e 10.833/2003). Padrão: 08 (sem incidência).
                </p>
                {codigo("transf_ibs_cbs_cst", "IBS/CBS: situação tributária (CST)", CST_IBS_CBS, "sm:col-span-2")}
                {classTrib("transf_ibs_cbs_class_trib", "IBS/CBS: classificação (cClassTrib)")}
                <div />
                <p className="text-xs text-slate-500 sm:col-span-4">Transferência entre estabelecimentos do mesmo CNPJ base não tem IBS/CBS (LC 214/2025, art. 6º, II): sai só o código 410 / 410002.</p>
              </div>
            </fieldset>

            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p className="mb-1 font-semibold text-slate-700">CFOP (sai sozinho)</p>
              <ul className="list-disc space-y-0.5 pl-4">
                <li><b>5151/6151</b>: produção desta unidade (máquina, ou item marcado na ficha técnica como fabricado aqui ou com etapa em terceiro). Só em unidade que fabrica.</li>
                <li><b>5152/6152</b>: o que foi comprado pronto (peças, acessórios, máquina usada comprada).</li>
                <li><b>5155/6155 e 5156/6156</b>: quando a mercadoria vai direto do fornecedor ou da fábrica para a outra unidade, sem passar por aqui. Use uma regra de tributação com o CFOP de saída.</li>
                <li><b>5552/6552</b> (bem do ativo) e <b>5557/6557</b> (material de uso e consumo): também por regra de tributação.</li>
                <li>Na unidade que recebe, a entrada é pelo uso: <b>1152/2152</b> para revender (a filial) e <b>1151/2151</b> para industrializar (insumo na fábrica).</li>
              </ul>
            </div>
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
