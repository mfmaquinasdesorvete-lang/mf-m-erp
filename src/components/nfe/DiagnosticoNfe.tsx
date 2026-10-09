// Notas fiscais → Configurações da NF-e → Diagnóstico: confere de uma vez o ambiente (produção x teste), se a Focus
// aceita o token de cada CNPJ, o cadastro fiscal das unidades, a numeração e as últimas emissões, e diz o que corrigir.
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Stethoscope, XCircle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { callFunction } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";

type Item = { grupo: string; titulo: string; nivel: "ok" | "info" | "alerta" | "erro"; detalhe: string; acao?: string };
const ICONE = {
  ok: { Icon: CheckCircle2, cor: "text-emerald-600", rotulo: "ok" }, info: { Icon: Info, cor: "text-sky-600", rotulo: "informação" },
  alerta: { Icon: AlertTriangle, cor: "text-amber-600", rotulo: "atenção" }, erro: { Icon: XCircle, cor: "text-red-600", rotulo: "corrigir" },
};

export function DiagnosticoNfe() {
  const [res, setRes] = useState<{ ambiente: string; itens: Item[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function rodar() {
    setOcupado(true);
    try {
      setRes(await callFunction("nfe-consultar", { acao: "diagnostico" }));
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  const grupos = res ? [...new Set(res.itens.map((i) => i.grupo))] : [];
  const erros = res?.itens.filter((i) => i.nivel === "erro").length ?? 0;
  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[14rem] flex-1">
          <h2 className="flex items-center gap-2 font-semibold"><Stethoscope size={18} className="text-brand" /> Diagnóstico da emissão</h2>
          <p className="text-sm text-slate-600">Confere o ambiente (produção ou teste), se a Focus aceita o token de cada CNPJ, o cadastro fiscal, a numeração e as últimas notas. Não emite nada.</p>
        </div>
        <Button type="button" variant="secondary" onClick={rodar} disabled={ocupado}><Stethoscope size={16} /> {ocupado ? "Conferindo…" : res ? "Conferir de novo" : "Rodar diagnóstico"}</Button>
      </div>
      {res && (
        <div className="mt-4 space-y-4">
          <div className={`rounded-lg p-3 text-sm font-semibold ${res.ambiente === "producao" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
            {res.ambiente === "producao" ? "Emitindo em PRODUÇÃO: as notas saem com valor fiscal." : "Emitindo em HOMOLOGAÇÃO: as notas são autorizadas só como teste, sem valor fiscal."}
            {erros > 0 && ` ${erros} ponto(s) para corrigir abaixo.`}
          </div>
          {grupos.map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-xs font-semibold uppercase text-slate-500">{g}</div>
              <ul className="space-y-2">
                {res.itens.filter((i) => i.grupo === g).map((i, k) => {
                  const { Icon, cor, rotulo } = ICONE[i.nivel];
                  return (
                    <li key={k} className="flex gap-2 text-sm">
                      <Icon size={17} className={`mt-0.5 shrink-0 ${cor}`} aria-label={rotulo} />
                      <div>
                        <b className="text-fg">{i.titulo}</b> <span className="text-slate-600">{i.detalhe}</span>
                        {i.acao && <div className="mt-0.5 text-amber-800">O que fazer: {i.acao}</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
