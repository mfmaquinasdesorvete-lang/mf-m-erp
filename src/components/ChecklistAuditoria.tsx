// Auditoria → Checklist do mês: cada área com as perguntas da auditoria financeira, respondidas por competência.
// Ao lado de cada pergunta, os alertas automáticos ligados a ela ajudam a escolher a amostra; o item só fica
// "conforme" depois de conferir documento e extrato. "Não conforme" vira exceção (responsável, prazo, evidência).
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Download } from "lucide-react";
import { Button, CampoMes, Card, chip } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";
import { dataBR, hoje } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import { baixarPlanilha } from "@/lib/exportar";
import { TIPOS, type TipoExcecao } from "@/lib/auditoria";
import { CHECKLIST, ITENS_CHECKLIST, SITUACOES, type ItemChecklist, type SituacaoItem } from "@/lib/checklistAuditoria";
import type { DadosExcecoes } from "@/pages/Auditoria";

type Resposta = {
  id?: string; competencia: string; item: string; situacao: SituacaoItem; observacao: string | null;
  revisado_nome?: string | null; updated_at?: string;
};
const ROTULO: Record<SituacaoItem, string> = { pendente: "A conferir", ok: "Conforme", nao_conforme: "Não conforme", na: "Não se aplica" };

export function ChecklistAuditoria({ dados, verExcecoes }: { dados: DadosExcecoes; verExcecoes: (t: TipoExcecao) => void }) {
  const { tem } = usePerfil();
  const podeEditar = tem("financeiro", "contador");
  const [comp, setComp] = useState(hoje().slice(0, 7));
  const { data: respostas = [] } = useRows<Resposta>("auditoria_checklist", { order: "item", ascending: true });
  const invalidar = useInvalidate();
  const doMes = respostas.filter((r) => r.competencia === comp);
  const resp = (id: string) => doMes.find((r) => r.item === id);
  const conferidos = ITENS_CHECKLIST.filter((i) => (resp(i.id)?.situacao ?? "pendente") !== "pendente").length;
  const naoConformes = ITENS_CHECKLIST.filter((i) => resp(i.id)?.situacao === "nao_conforme").length;
  // áreas recolhidas (eram 47 perguntas numa parede só): abre a primeira que ainda tem item a conferir
  const [abertas, setAbertas] = useState<Set<string> | null>(null);
  const primeiraPendente = CHECKLIST.find((s) => s.itens.some((i) => (resp(i.id)?.situacao ?? "pendente") === "pendente"))?.id;
  const estaAberta = (id: string) => (abertas ? abertas.has(id) : id === primeiraPendente);
  const alternarArea = (id: string) => setAbertas((a) => {
    const n = new Set(a ?? (primeiraPendente ? [primeiraPendente] : []));
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  async function salvar(item: ItemChecklist, mudanca: { situacao?: SituacaoItem; observacao?: string }) {
    const atual = resp(item.id);
    const situacao = mudanca.situacao ?? atual?.situacao ?? "pendente";
    const observacao = (mudanca.observacao ?? atual?.observacao ?? "").trim() || null;
    const { error } = await supabase.from("auditoria_checklist").upsert({ competencia: comp, item: item.id, situacao, observacao }, { onConflict: "competencia,item" });
    if (error) return notifyError(error);
    if (situacao === "nao_conforme") {
      // vira exceção para tratar; se já existe, não mexe na tratativa
      const { error: e2 } = await supabase.from("auditoria_excecoes").upsert(
        { chave: `checklist:${comp}:${item.id}`, tipo: "checklist", titulo: item.texto, observacao },
        { onConflict: "chave", ignoreDuplicates: true });
      if (e2) notifyError(e2);
    }
    invalidar("auditoria_checklist", "auditoria_excecoes");
  }

  function exportar() {
    baixarPlanilha(`checklist-auditoria-${comp}`, [{ nome: `Checklist ${comp}`, linhas: CHECKLIST.flatMap((s) => s.itens.map((i) => {
      const r = resp(i.id);
      return {
        Área: s.titulo, Pergunta: i.texto, Situação: ROTULO[r?.situacao ?? "pendente"], Evidência: r?.observacao ?? "",
        "Conferido por": r?.revisado_nome ?? "", Em: r?.updated_at ? dataBR(r.updated_at) : "",
        "Alertas automáticos em aberto": (i.alertas ?? []).map((t) => `${TIPOS[t].rotulo}: ${dados.abertasPorTipo(t)}`).join("; "),
      };
    })) }]).catch(notifyError);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">Competência
          <CampoMes value={comp} onChange={(v) => v && setComp(v)} rotulo="Competência" />
        </div>
        <div className="min-w-[12rem] flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(conferidos / ITENS_CHECKLIST.length) * 100}%` }} /></div>
          <p className="mt-1 text-xs text-slate-500">
            {conferidos} de {ITENS_CHECKLIST.length} conferidos{naoConformes ? <> · <b className="text-red-600">{naoConformes} {naoConformes === 1 ? "não conforme" : "não conformes"}</b> (estão em Exceções)</> : null}
          </p>
        </div>
        <Button variant="secondary" onClick={exportar}><Download size={16} /> Exportar</Button>
      </div>
      {!podeEditar && <p className="text-sm text-slate-500">Só o financeiro, o administrador e o contador respondem o checklist.</p>}

      {CHECKLIST.map((s) => {
        const feitos = s.itens.filter((i) => (resp(i.id)?.situacao ?? "pendente") !== "pendente").length;
        return (
          <Card key={s.id} className="p-4">
            <button type="button" aria-expanded={estaAberta(s.id)} onClick={() => alternarArea(s.id)} className="flex w-full items-center justify-between gap-2 text-left">
              <h2 className="font-semibold">{s.titulo}</h2>
              <span className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${feitos === s.itens.length ? "text-emerald-600" : "text-slate-500"}`}>{feitos === s.itens.length ? "✓ " : ""}{feitos}/{s.itens.length}</span>
                <ChevronDown size={16} className={`text-slate-400 transition ${estaAberta(s.id) ? "rotate-180" : ""}`} aria-hidden />
              </span>
            </button>
            {estaAberta(s.id) && <>
            <ul className="mt-1">
              {s.itens.map((i) => {
                const r = resp(i.id);
                const alertas = (i.alertas ?? []).map((t) => ({ t, n: dados.abertasPorTipo(t) }));
                return (
                  <li key={i.id} className="border-t border-slate-100 py-3 first:border-t-0">
                    <div className="flex flex-wrap items-start gap-2">
                      <p className="min-w-0 flex-1 basis-64 text-sm text-fg">{i.texto}</p>
                      <div className="flex flex-wrap gap-1" role="group" aria-label="Situação">
                        {SITUACOES.map((o) => (
                          <button key={o.valor} type="button" disabled={!podeEditar} aria-pressed={r?.situacao === o.valor}
                            onClick={() => salvar(i, { situacao: r?.situacao === o.valor ? "pendente" : o.valor })}
                            className={`${chip(r?.situacao === o.valor, `border-transparent ${o.classe}`)} disabled:opacity-60`}>
                            {o.rotulo}
                          </button>
                        ))}
                      </div>
                    </div>
                    {alertas.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {alertas.some((a) => a.n) ? alertas.filter((a) => a.n).map((a) => (
                          <Button key={a.t} type="button" tamanho="mini" tom="logistica" onClick={() => verExcecoes(a.t)} title={TIPOS[a.t].criterio}>
                            <AlertTriangle size={12} /> {a.n} {TIPOS[a.t].rotulo.toLowerCase()}
                          </Button>
                        )) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={12} /> sem alertas automáticos em aberto</span>
                        )}
                      </div>
                    )}
                    {/* evidência só depois de responder (ou se já tem texto): menos campos vazios na tela */}
                    {((r?.situacao ?? "pendente") !== "pendente" || r?.observacao) && <textarea key={`${comp}-${i.id}-${r?.updated_at ?? ""}`} className="input mt-2 text-sm" rows={1} disabled={!podeEditar}
                      defaultValue={r?.observacao ?? ""} placeholder="Evidência: o que foi conferido (amostra, documento, extrato)"
                      onBlur={(e) => e.target.value.trim() !== (r?.observacao ?? "") && salvar(i, { observacao: e.target.value })} />}
                    {r?.revisado_nome && r.situacao !== "pendente" && (
                      <p className="mt-1 text-xs text-slate-500">{ROTULO[r.situacao]} · {r.revisado_nome}{r.updated_at ? ` em ${dataBR(r.updated_at)}` : ""}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600"><b>Teste útil:</b> {s.teste}</p>
            </>}
          </Card>
        );
      })}
      <p className="text-xs text-slate-500">
        Os alertas ajudam a escolher as amostras, mas não substituem a conferência dos documentos e do extrato. Em cada exceção registre critério,
        evidência, impacto, responsável e prazo, separando erro confirmado de indício ainda em investigação.
      </p>
    </div>
  );
}
