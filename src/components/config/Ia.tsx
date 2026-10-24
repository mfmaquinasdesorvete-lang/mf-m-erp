// Configurações → Inteligência artificial: o interruptor que desliga todas as IAs do ERP na hora (incidente) e o
// registro de cada uso da IA (quem, quando, qual IA, o que pediu e se deu certo). Requisitos da pesquisa da Lynn.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { useConfig } from "@/lib/useConfig";
import { dataHoraBR } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { Bloco, CabecalhoSecao, secaoPorId } from "./comum";

type Registro = { id: number; criado_em: string; user_nome: string | null; funcao: string; acao: string; resumo: string | null; modelo: string | null; ok: boolean; erro: string | null };
const NOME_IA: Record<string, string> = { "ia-produto": "Produtos e notas", "ia-voz": "Anotar por voz", "ia-busca": "Perguntar à IA" };

export function ConfigIa() {
  const s = secaoPorId("ia")!;
  const qc = useQueryClient();
  const { data: cfg } = useConfig();
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const ligada = cfg?.ia_ligada !== false;
  const chave = useQuery({ queryKey: ["ia", "situacao"], queryFn: () => callFunction<{ configurada: boolean }>("ia-produto", { acao: "situacao" }), retry: false });
  const { data: registros = [], isLoading } = useQuery({
    queryKey: ["ia_registros"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ia_registros").select("*").order("criado_em", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Registro[];
    },
  });

  async function alternar() {
    setSalvando(true);
    const { error } = await supabase.rpc("ia_ligar", { p_ligada: !ligada, p_motivo: ligada ? motivo : null });
    setSalvando(false);
    if (error) { notifyError(error); return; }
    setMotivo("");
    qc.invalidateQueries({ queryKey: ["configuracoes"] });
    notify(ligada ? "IA desligada: nenhuma IA do ERP responde até ligar de novo" : "IA ligada");
  }

  return (
    <div className="max-w-4xl space-y-5">
      <CabecalhoSecao s={s} />
      <Bloco titulo="IA do ERP" descricao="Em caso de problema (resposta estranha, suspeita de vazamento), desligue aqui: todas as IAs do ERP param na hora, para todos. O resto do ERP continua funcionando; o Anotar por voz passa a anotar escrevendo.">
        <div className={`mb-3 rounded-xl border p-3 text-sm ${ligada ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {ligada
            ? <><b>Ligada.</b> {chave.data ? (chave.data.configurada ? "A chave da IA está cadastrada." : "Falta cadastrar a chave ANTHROPIC_API_KEY no Supabase.") : ""}</>
            : <><b>Desligada</b> por {cfg?.ia_desligada_por ?? "—"} em {dataHoraBR(cfg?.ia_desligada_em)}{cfg?.ia_desligada_motivo ? ` · ${cfg.ia_desligada_motivo}` : ""}</>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ligada && <input aria-label="Motivo para desligar" className="input min-w-0 flex-1 basis-60" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo para desligar (obrigatório)" />}
          <Button tom={ligada ? "perigo" : undefined} onClick={alternar} disabled={salvando || (ligada && !motivo.trim())}>
            {ligada ? <><PowerOff className="h-4 w-4" /> Desligar a IA</> : <><Power className="h-4 w-4" /> Ligar a IA</>}
          </Button>
        </div>
      </Bloco>

      <Bloco titulo="Registro de uso da IA" descricao="Cada vez que alguém usa uma IA do ERP fica registrado: quem, quando, qual IA, o que pediu e se deu certo (os últimos 200).">
        {isLoading ? <p className="text-sm text-slate-500">Carregando…</p>
          : !registros.length ? <p className="text-sm text-slate-500">Nenhum uso registrado ainda.</p>
          : (
            <ul className="divide-y divide-slate-100 text-sm">
              {registros.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-0.5 py-2">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{r.ok ? "ok" : "erro"}</span>
                  <span className="min-w-0 flex-1 basis-64">
                    <b className="text-fg">{NOME_IA[r.funcao] ?? r.funcao}</b> · {r.user_nome ?? "—"} · <span className="text-slate-500">{dataHoraBR(r.criado_em)}</span>
                    {r.resumo && <span className="block text-slate-600">{r.resumo}</span>}
                    {r.erro && <span className="block text-xs text-rose-700">{r.erro}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </Bloco>
    </div>
  );
}
