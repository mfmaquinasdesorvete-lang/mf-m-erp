// Teste do giga → Calibração: os equipamentos de medição do registro REG-005 (giga, validadores, paquímetros) com o
// último certificado e a próxima calibração. Vencida fica em vermelho e entra nos avisos de vencimento. Só o
// administrador cadastra e registra calibração nova; o histórico das datas antigas fica na auditoria.
import { useState, type FormEvent } from "react";
import { CalendarCheck, Gauge, Pencil, Plus } from "lucide-react";
import { Button, Field, Modal, Section } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import {
  AVISO_DIAS, FREQUENCIAS, diasParaCalibrar, ordenarInstrumentos, proximaCalibracao, rotuloFrequencia, situacaoCalibracao,
  type Instrumento, type SituacaoCalibracao,
} from "@/lib/calibracao";

const COR: Record<SituacaoCalibracao, { borda: string; selo: string }> = {
  vencida: { borda: "border-red-300", selo: "bg-red-100 text-red-900 ring-red-300" },
  perto: { borda: "border-amber-300", selo: "bg-amber-100 text-amber-900 ring-amber-300" },
  ok: { borda: "border-slate-200", selo: "bg-emerald-100 text-emerald-900 ring-emerald-300" },
  sem_data: { borda: "border-slate-200", selo: "bg-slate-100 text-slate-800 ring-slate-300" },
};
const textoSituacao = (dias: number | null) => dias == null ? "sem data"
  : dias < 0 ? `vencida há ${-dias} ${pl(-dias, "dia", "dias")}` : dias === 0 ? "vence hoje" : `vence em ${dias} ${pl(dias, "dia", "dias")}`;

type Form = { id?: string; codigo: string; instrumento: string; marca: string; setor: string; frequencia_meses: string; certificado: string;
  calibrado_em: string; laboratorio: string; observacoes: string };
const VAZIO: Form = { codigo: "", instrumento: "", marca: "", setor: "", frequencia_meses: "12", certificado: "", calibrado_em: "", laboratorio: "", observacoes: "" };
const formDe = (i: Instrumento): Form => ({ id: i.id, codigo: i.codigo, instrumento: i.instrumento, marca: i.marca ?? "", setor: i.setor ?? "",
  frequencia_meses: String(i.frequencia_meses), certificado: i.certificado ?? "", calibrado_em: i.calibrado_em ?? "", laboratorio: i.laboratorio ?? "", observacoes: i.observacoes ?? "" });

export function CalibracaoGiga({ admin }: { admin: boolean }) {
  const { data: todos = [], isLoading } = useRows<Instrumento>("instrumentos_medicao", { order: "codigo", ascending: true });
  const [form, setForm] = useState<Form | null>(null);
  const [calibrar, setCalibrar] = useState<Instrumento | null>(null);
  const hoje = new Date().toISOString().slice(0, 10);
  const lista = ordenarInstrumentos(todos.filter((i) => i.ativo !== false));
  const vencidas = lista.filter((i) => situacaoCalibracao(i, hoje) === "vencida").length;
  const perto = lista.filter((i) => situacaoCalibracao(i, hoje) === "perto").length;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <p className={`rounded-xl border p-3 text-sm ${vencidas ? "border-red-200 bg-red-50 text-red-900" : perto ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`} role="status">
        {isLoading ? "Carregando…" : vencidas
          ? <><b>{vencidas} {pl(vencidas, "instrumento com calibração vencida", "instrumentos com calibração vencida")}.</b> Medida feita com instrumento vencido não vale para a auditoria: calibre ou tire de uso.</>
          : perto ? <><b>{perto} {pl(perto, "calibração vence", "calibrações vencem")} nos próximos {AVISO_DIAS} dias.</b> Agende com o laboratório.</>
          : "Todas as calibrações em dia."}
      </p>

      <Section title={`Equipamentos de medição (REG-005)${lista.length ? ` · ${lista.length}` : ""}`}
        actions={admin ? <Button variant="secondary" onClick={() => setForm(VAZIO)}><Plus size={16} /> Cadastrar</Button> : undefined}>
        {!lista.length && !isLoading ? <p className="py-6 text-center text-sm text-slate-500">Nenhum instrumento cadastrado.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {lista.map((i) => {
              const sit = situacaoCalibracao(i, hoje);
              return (
                <li key={i.id} className={`flex flex-col gap-2 rounded-xl border p-3 ${COR[sit].borda}`}>
                  <div className="flex items-start gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-modulo/10 text-modulo-texto"><Gauge size={17} aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold leading-tight text-fg">{i.instrumento}</div>
                      <div className="text-xs text-slate-600">{i.codigo}{i.marca ? ` · ${i.marca}` : ""}{i.setor ? ` · ${i.setor}` : ""}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${COR[sit].selo}`}>{textoSituacao(diasParaCalibrar(i, hoje))}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-slate-500">Última calibração</dt><dd className="text-right text-fg">{i.calibrado_em ? dataBR(i.calibrado_em) : "—"}</dd>
                    <dt className="text-slate-500">Próxima</dt><dd className="text-right font-semibold text-fg">{i.proxima_em ? dataBR(i.proxima_em) : "—"}</dd>
                    <dt className="text-slate-500">Frequência</dt><dd className="text-right text-fg">{rotuloFrequencia(i.frequencia_meses)}</dd>
                    <dt className="text-slate-500">Certificado</dt><dd className="truncate text-right text-fg">{i.certificado ?? "—"}</dd>
                    <dt className="text-slate-500">Laboratório</dt><dd className="truncate text-right text-fg">{i.laboratorio ?? "—"}</dd>
                  </dl>
                  {i.observacoes && <p className="text-xs text-slate-600">{i.observacoes}</p>}
                  {admin && (
                    <div className="mt-auto flex gap-1.5">
                      <Button variant={sit === "ok" ? "secondary" : "primary"} onClick={() => setCalibrar(i)}><CalendarCheck size={14} /> Registrar calibração</Button>
                      <Button variant="ghost" aria-label={`Editar ${i.instrumento} ${i.codigo}`} onClick={() => setForm(formDe(i))}><Pencil size={14} /></Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <p className="text-xs text-slate-500">A próxima calibração também aparece em Sobre → Monitor → Chaves e certificados, com aviso {AVISO_DIAS} dias antes.{!admin && " Só o administrador registra calibração."}</p>

      {form && <InstrumentoModal inicial={form} onClose={() => setForm(null)} />}
      {calibrar && <CalibrarModal item={calibrar} onClose={() => setCalibrar(null)} />}
    </div>
  );
}

function InstrumentoModal({ inicial, onClose }: { inicial: Form; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [f, setF] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const meses = Number(f.frequencia_meses) || 12;

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const linha = {
        codigo: f.codigo.trim(), instrumento: f.instrumento.trim(), marca: f.marca.trim() || null, setor: f.setor.trim() || null, frequencia_meses: meses,
        certificado: f.certificado.trim() || null, calibrado_em: f.calibrado_em || null, laboratorio: f.laboratorio.trim() || null, observacoes: f.observacoes.trim() || null,
        proxima_em: f.calibrado_em ? proximaCalibracao(f.calibrado_em, meses) : null,
      };
      const { error } = f.id ? await supabase.from("instrumentos_medicao").update(linha).eq("id", f.id) : await supabase.from("instrumentos_medicao").insert(linha);
      if (error) throw error;
      invalidar("instrumentos_medicao");
      notify(f.id ? "Instrumento atualizado" : "Instrumento cadastrado");
      onClose();
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  };

  return (
    <Modal open onClose={onClose} title={f.id ? "Editar instrumento" : "Cadastrar instrumento"}>
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código"><input className="input" value={f.codigo} onChange={(e) => set("codigo", e.target.value)} required maxLength={40} placeholder="ex.: GT-01" /></Field>
          <Field label="Instrumento"><input className="input" value={f.instrumento} onChange={(e) => set("instrumento", e.target.value)} required minLength={2} maxLength={120} placeholder="ex.: Paquímetro digital" /></Field>
          <Field label="Marca"><input className="input" value={f.marca} onChange={(e) => set("marca", e.target.value)} maxLength={80} /></Field>
          <Field label="Setor"><input className="input" value={f.setor} onChange={(e) => set("setor", e.target.value)} maxLength={80} placeholder="ex.: Testes, Produção" /></Field>
          <Field label="Frequência da calibração">
            <select className="input" value={f.frequencia_meses} onChange={(e) => set("frequencia_meses", e.target.value)}>
              {FREQUENCIAS.map((q) => <option key={q.meses} value={q.meses}>{q.rotulo}</option>)}
              {!FREQUENCIAS.some((q) => q.meses === meses) && <option value={meses}>{rotuloFrequencia(meses)}</option>}
            </select>
          </Field>
          <Field label="Laboratório"><input className="input" value={f.laboratorio} onChange={(e) => set("laboratorio", e.target.value)} maxLength={120} /></Field>
          <Field label="Última calibração"><input className="input" type="date" value={f.calibrado_em} onChange={(e) => set("calibrado_em", e.target.value)} /></Field>
          <Field label="Certificado"><input className="input" value={f.certificado} onChange={(e) => set("certificado", e.target.value)} maxLength={80} /></Field>
          <Field label="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} maxLength={1000} /></Field>
        </div>
        {f.calibrado_em && <p className="text-sm text-slate-600">Próxima calibração: <b>{dataBR(proximaCalibracao(f.calibrado_em, meses))}</b></p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Calibrou: a mesma linha ganha data, certificado e laboratório novos (o anterior fica na auditoria). */
function CalibrarModal({ item, onClose }: { item: Instrumento; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [certificado, setCertificado] = useState("");
  const [laboratorio, setLaboratorio] = useState(item.laboratorio ?? "");
  const [salvando, setSalvando] = useState(false);
  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (item.calibrado_em && data <= item.calibrado_em) return notify("A data precisa ser depois da última calibração.", "erro");
    setSalvando(true);
    try {
      const { error } = await supabase.from("instrumentos_medicao").update({
        calibrado_em: data, certificado: certificado.trim() || null, laboratorio: laboratorio.trim() || null, proxima_em: proximaCalibracao(data, item.frequencia_meses),
      }).eq("id", item.id);
      if (error) throw error;
      invalidar("instrumentos_medicao");
      notify("Calibração registrada");
      onClose();
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Calibração: ${item.instrumento} (${item.codigo})`}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="text-sm text-slate-600">{item.calibrado_em ? `Última em ${dataBR(item.calibrado_em)}` : "Sem calibração registrada"} · {rotuloFrequencia(item.frequencia_meses).toLowerCase()}.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data da calibração"><input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required /></Field>
          <Field label="Número do certificado"><input className="input" value={certificado} onChange={(e) => setCertificado(e.target.value)} required maxLength={80} /></Field>
          <Field label="Laboratório" className="sm:col-span-2"><input className="input" value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} maxLength={120} /></Field>
        </div>
        {data && <p className="text-sm text-slate-600">Próxima calibração: <b>{dataBR(proximaCalibracao(data, item.frequencia_meses))}</b></p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvando}><CalendarCheck size={14} /> {salvando ? "Salvando…" : "Registrar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
