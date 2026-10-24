// Fretes → Tabelas de frete: as tabelas negociadas com as transportadoras sem API (São Miguel e outras). Cada tabela
// tem o que vale para todos os destinos (cubagem, % da nota, GRIS, pedágio, taxa, mínimo, ICMS) e os destinos, que
// entram pela planilha modelo. A cotação rápida e a loja calculam por elas (functions/frete-cotar); o simulador daqui
// faz a mesma conta (_shared/frete-tabela.ts) para conferir com a tabela da transportadora.
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Download, Plus, Save, Upload } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { ler, useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { lerValor } from "@/lib/auditoriaBusca";
import { abrirPlanilha } from "@/lib/planilha";
import { baixarPlanilha } from "@/lib/exportar";
import type { Transportadora } from "@/lib/types";
import { COLUNAS_MODELO, cotarPelaTabela, destinosDaPlanilha, type DestinoTabela, type TabelaFrete } from "../../../supabase/functions/_shared/frete-tabela";

type Linha = TabelaFrete & {
  transportadora_id: string; unidade_id: string | null; vigencia_inicio: string | null; vigencia_fim: string | null; ativo: boolean; observacoes: string | null;
  frete_tabela_destinos: { count: number }[];
};

const CAMPOS: [keyof TabelaFrete, string, string?][] = [
  ["ad_valorem_pct", "Frete-valor (% da nota)"], ["gris_pct", "GRIS (% da nota)"], ["gris_minimo", "GRIS mínimo (R$)"],
  ["pedagio_valor", "Pedágio (R$ por fração)"], ["pedagio_fracao_kg", "Fração do pedágio (kg)", "geralmente 100 kg"],
  ["taxa_despacho", "Taxa por CT-e (R$)", "despacho, TAS, emissão"], ["frete_minimo", "Frete mínimo (R$)"],
  ["fator_cubagem", "Cubagem (kg por m³)", "300 no rodoviário"], ["icms_interno_pct", "ICMS dentro do estado (%)"],
];
const txt = (v: unknown) => (v == null || v === "" ? "" : String(v).replace(".", ","));

function situacao(t: Linha) {
  const dia = hoje();
  if (!t.ativo) return { texto: "Desligada", cor: "text-slate-500" };
  if (t.vigencia_fim && t.vigencia_fim < dia) return { texto: "Vencida", cor: "text-red-700" };
  if (t.vigencia_inicio && t.vigencia_inicio > dia) return { texto: "Ainda não vale", cor: "text-amber-700" };
  return { texto: "Em uso", cor: "text-emerald-700" };
}

export function FreteTabelas({ transportadoras, podeEditar }: { transportadoras: Transportadora[]; podeEditar: boolean }) {
  const { data: tabelas = [] } = useRows<Linha>("frete_tabelas", { select: "*, frete_tabela_destinos(count)", order: "nome", ascending: true });
  const [aberta, setAberta] = useState<Linha | "nova" | null>(null);
  const nomeTransp = useMemo(() => new Map(transportadoras.map((t) => [t.id, t.nome_fantasia || t.nome])), [transportadoras]);

  const modelo = () => baixarPlanilha("modelo-tabela-de-frete", [{ nome: "Destinos", linhas: [
    Object.fromEntries(COLUNAS_MODELO.map((c) => [c, ({ UF: "RS", Cidade: "Caxias do Sul", "Prazo (dias úteis)": 2, "até 10 kg": 45.9, "até 20 kg": 58.4, "até 30 kg": 70.2, "até 50 kg": 92.5, "até 100 kg": 150, "Excedente R$/kg": 1.35 } as Record<string, unknown>)[c] ?? ""])),
    Object.fromEntries(COLUNAS_MODELO.map((c) => [c, ({ UF: "RS", "CEP inicial": "90000000", "CEP final": "91999999", "Prazo (dias úteis)": 1, "Frete R$/kg": 1.9, "Frete mínimo": 65 } as Record<string, unknown>)[c] ?? ""])),
    Object.fromEntries(COLUNAS_MODELO.map((c) => [c, ({ UF: "PR", "Prazo (dias úteis)": 3, "até 10 kg": 52, "até 30 kg": 80, "Excedente R$/kg": 1.6, "Taxa da cidade": "" } as Record<string, unknown>)[c] ?? ""])),
  ] }]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Tabelas negociadas das transportadoras sem API (como a São Miguel). A cotação rápida e a loja calculam por elas.
        Os destinos entram pela planilha modelo: uma linha por estado, cidade ou faixa de CEP, com as faixas de peso.</p>
      <div className="flex flex-wrap gap-2">
        {podeEditar && <Button type="button" onClick={() => setAberta("nova")}><Plus size={15} /> Nova tabela</Button>}
        <Button type="button" variant="secondary" onClick={modelo}><Download size={15} /> Baixar planilha modelo</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Transportadora</th><th>Tabela</th><th>Vigência</th><th className="text-right">Destinos</th><th>Situação</th></tr></thead>
          <tbody>
            {tabelas.map((t) => {
              const s = situacao(t);
              return (
                <tr key={t.id} className="linha-clicavel border-t border-slate-100" onClick={() => setAberta(t)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberta(t); } }}>
                  <td className="py-1.5">{nomeTransp.get(t.transportadora_id) ?? "—"}</td><td>{t.nome}</td>
                  <td className="text-slate-600">{[t.vigencia_inicio, t.vigencia_fim].map((d) => (d ? dataBR(d) : "…")).join(" a ")}</td>
                  <td className="num text-right">{t.frete_tabela_destinos?.[0]?.count ?? 0}</td><td className={`font-semibold ${s.cor}`}>{s.texto}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!tabelas.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma tabela ainda. Peça a tabela atualizada a cada transportadora e cadastre aqui.</p>}
      </div>
      {aberta && <TabelaEditor tabela={aberta === "nova" ? null : aberta} transportadoras={transportadoras} podeEditar={podeEditar} onClose={() => setAberta(null)} />}
    </div>
  );
}

function TabelaEditor({ tabela, transportadoras, podeEditar, onClose }: { tabela: Linha | null; transportadoras: Transportadora[]; podeEditar: boolean; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [id, setId] = useState(tabela?.id ?? null);
  const [f, setF] = useState<Record<string, string | boolean>>(() => ({
    transportadora_id: tabela?.transportadora_id ?? "", nome: tabela?.nome ?? "", vigencia_inicio: tabela?.vigencia_inicio ?? "", vigencia_fim: tabela?.vigencia_fim ?? "",
    ativo: tabela?.ativo ?? true, icms_por_fora: tabela?.icms_por_fora ?? false, observacoes: tabela?.observacoes ?? "",
    ...Object.fromEntries(CAMPOS.map(([k]) => [k, txt(tabela?.[k] ?? (k === "fator_cubagem" ? 300 : k === "pedagio_fracao_kg" ? 100 : k === "icms_interno_pct" ? 17 : ""))])),
  }));
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const opcoes = useMemo(() => transportadoras.filter((t) => t.ativo && !t.matriz_id).sort((a, b) => (a.nome_fantasia || a.nome).localeCompare(b.nome_fantasia || b.nome)), [transportadoras]);

  const { data: destinos = [] } = useQuery({
    queryKey: ["frete_tabela_destinos", id], enabled: !!id,
    queryFn: async () => ((await ler(supabase.from("frete_tabela_destinos").select("*").eq("tabela_id", id!).order("uf").limit(20000))) ?? []) as DestinoTabela[],
  });
  const porUf = useMemo(() => { const m = new Map<string, number>(); for (const d of destinos) m.set(d.uf, (m.get(d.uf) ?? 0) + 1); return [...m.entries()]; }, [destinos]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSujo(true);
    setF((x) => ({ ...x, [k]: e.target instanceof HTMLInputElement && e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  };
  const num = (k: string) => lerValor(String(f[k] ?? "")) ?? 0;

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    if (!f.transportadora_id || !String(f.nome).trim()) return notify("Escolha a transportadora e dê um nome à tabela (ex.: São Miguel 2026)", "erro");
    if (f.vigencia_inicio && f.vigencia_fim && f.vigencia_fim < f.vigencia_inicio) return notify("A vigência termina antes de começar", "erro");
    const dados = {
      transportadora_id: f.transportadora_id, nome: String(f.nome).trim(), vigencia_inicio: f.vigencia_inicio || null, vigencia_fim: f.vigencia_fim || null,
      ativo: f.ativo === true, icms_por_fora: f.icms_por_fora === true, observacoes: String(f.observacoes ?? "").trim() || null,
      ...Object.fromEntries(CAMPOS.map(([k]) => [k, num(k)])), fator_cubagem: num("fator_cubagem") || 300, pedagio_fracao_kg: num("pedagio_fracao_kg") || 100,
      updated_at: new Date().toISOString(),
    };
    setSalvando(true);
    try {
      if (id) { const { error } = await supabase.from("frete_tabelas").update(dados).eq("id", id); if (error) throw error; }
      else { const { data, error } = await supabase.from("frete_tabelas").insert(dados).select("id").single(); if (error) throw error; setId(data.id); }
      setSujo(false);
      notify("Tabela salva");
      invalidar("frete_tabelas");
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  async function importar(file: File | undefined) {
    if (!file || !id) return;
    try {
      const XLSX = await import("xlsx");
      const wb = await abrirPlanilha(XLSX, file);
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const { destinos: novos, erros } = destinosDaPlanilha(linhas);
      if (!novos.length) return notify(erros.length ? `Nenhum destino lido. ${erros.slice(0, 3).join("; ")}` : "Planilha vazia", "erro");
      const aviso = erros.length ? ` ${erros.length} linha(s) ficam de fora (${erros.slice(0, 3).join("; ")}${erros.length > 3 ? "…" : ""}).` : "";
      if (!(await confirmar(`Trocar os ${destinos.length} destinos desta tabela pelos ${novos.length} da planilha?${aviso}`, { ok: "Trocar destinos" }))) return;
      setSalvando(true);
      const { error: e1 } = await supabase.from("frete_tabela_destinos").delete().eq("tabela_id", id);
      if (e1) throw e1;
      for (let i = 0; i < novos.length; i += 500) {
        const { error } = await supabase.from("frete_tabela_destinos").insert(novos.slice(i, i + 500).map((d) => ({ ...d, tabela_id: id })));
        if (error) throw error;
      }
      notify(`${novos.length} destinos gravados`);
      invalidar("frete_tabela_destinos", "frete_tabelas");
    } catch (err) { notifyError(err); } finally { setSalvando(false); if (arquivo.current) arquivo.current.value = ""; }
  }

  return (
    <Modal open onClose={onClose} title={tabela ? `Tabela: ${tabela.nome}` : "Nova tabela de frete"} wide sujo={sujo}>
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Transportadora" obrigatorio>
            <select className="input" value={String(f.transportadora_id)} onChange={set("transportadora_id")} disabled={!podeEditar}>
              <option value="">Escolha</option>{opcoes.map((t) => <option key={t.id} value={t.id}>{t.nome_fantasia || t.nome}</option>)}
            </select>
          </Field>
          <Field label="Nome da tabela" obrigatorio><input className="input" value={String(f.nome)} onChange={set("nome")} placeholder="ex.: São Miguel 2026 saindo de SC" disabled={!podeEditar} /></Field>
          <Field label="Vale a partir de"><input className="input" type="date" value={String(f.vigencia_inicio)} onChange={set("vigencia_inicio")} disabled={!podeEditar} /></Field>
          <Field label="Vale até" dica="vazio = até chegar a próxima"><input className="input" type="date" value={String(f.vigencia_fim)} onChange={set("vigencia_fim")} disabled={!podeEditar} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {CAMPOS.map(([k, label, dica]) => <Field key={k} label={label} dica={dica}><input className="input" inputMode="decimal" value={String(f[k] ?? "")} onChange={set(k)} disabled={!podeEditar} /></Field>)}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.icms_por_fora === true} onChange={set("icms_por_fora")} disabled={!podeEditar} /> Valores sem ICMS (somar o ICMS por fora)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.ativo === true} onChange={set("ativo")} disabled={!podeEditar} /> Usar na cotação</label>
        </div>
        <Field label="Observações"><textarea className="input" rows={2} value={String(f.observacoes ?? "")} onChange={set("observacoes")} disabled={!podeEditar} /></Field>
        {podeEditar && <Button type="submit" carregando={salvando}><Save size={15} /> Salvar tabela</Button>}
      </form>

      {id && (
        <section className="mt-5 space-y-2 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-bold text-fg">Destinos ({destinos.length})</h3>
          {porUf.length > 0 && <p className="text-xs text-slate-600">{porUf.map(([uf, q]) => `${uf}: ${q}`).join(" · ")}</p>}
          {podeEditar && (
            <>
              <input ref={arquivo} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => importar(e.target.files?.[0])} />
              <Button type="button" variant="secondary" onClick={() => arquivo.current?.click()} carregando={salvando}><Upload size={15} /> Importar planilha de destinos</Button>
              <p className="text-xs text-slate-500">Use a planilha modelo. Importar troca todos os destinos desta tabela.</p>
            </>
          )}
          {destinos.length > 0 && <Simulador tabela={{ ...(tabela ?? ({} as Linha)), ...Object.fromEntries(CAMPOS.map(([k]) => [k, num(k)])), icms_por_fora: f.icms_por_fora === true, fator_cubagem: num("fator_cubagem") || 300, pedagio_fracao_kg: num("pedagio_fracao_kg") || 100 } as TabelaFrete} destinos={destinos} />}
        </section>
      )}
    </Modal>
  );
}

function Simulador({ tabela, destinos }: { tabela: TabelaFrete; destinos: DestinoTabela[] }) {
  const [s, setS] = useState({ uf: "", cidade: "", cep: "", peso: "", nf: "", origem: "SC" });
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, [k]: e.target.value }));
  const r = useMemo(() => {
    const peso = lerValor(s.peso) ?? 0;
    if (!s.uf || !(peso > 0)) return null;
    return cotarPelaTabela(tabela, destinos, { volumes: [], peso_kg: peso, valor_nf: lerValor(s.nf) ?? 0 },
      { cep: s.cep.replace(/\D/g, ""), cidade: s.cidade || null, uf: s.uf.toUpperCase() }, s.origem.toUpperCase());
  }, [s, tabela, destinos]);
  return (
    <div className="rounded-cartao bg-slate-50 p-3">
      <p className="mb-2 flex items-center gap-1 text-sm font-semibold"><Calculator size={15} aria-hidden /> Conferir com a tabela da transportadora</p>
      <div className="grid gap-2 sm:grid-cols-6">
        <Field label="UF"><input className="input" value={s.uf} onChange={set("uf")} maxLength={2} /></Field>
        <Field label="Cidade" className="sm:col-span-2"><input className="input" value={s.cidade} onChange={set("cidade")} /></Field>
        <Field label="CEP"><input className="input" inputMode="numeric" value={s.cep} onChange={set("cep")} /></Field>
        <Field label="Peso taxado (kg)"><input className="input" inputMode="decimal" value={s.peso} onChange={set("peso")} /></Field>
        <Field label="Valor da nota"><input className="input" inputMode="decimal" value={s.nf} onChange={set("nf")} /></Field>
      </div>
      {r ? (
        <p className="mt-2 text-sm"><b>{brl(r.valor)}</b>{r.prazo != null ? ` · ${r.prazo} dias úteis` : ""}
          <span className="text-slate-500"> (frete peso {brl(r.detalhe.frete_peso)}, frete-valor {brl(r.detalhe.ad_valorem)}, GRIS {brl(r.detalhe.gris)}, pedágio {brl(r.detalhe.pedagio)}, taxas {brl(r.detalhe.taxas)}{r.detalhe.icms ? `, ICMS ${brl(r.detalhe.icms)}` : ""})</span></p>
      ) : s.uf && s.peso ? <p className="mt-2 text-sm text-amber-800">Sem preço na tabela para esse destino e peso.</p> : null}
    </div>
  );
}
