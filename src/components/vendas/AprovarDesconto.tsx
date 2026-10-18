// Desconto acima do máximo: um administrador escolhe o nome e digita a senha de aprovação (não a de entrar no ERP).
// O banco confere a senha, registra quem pediu e quem aprovou, e bloqueia por 15 minutos depois de 5 erros.
import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { notifyError } from "@/lib/notify";
import { pctTexto, rotuloRegra } from "@/lib/descontos";
import { pl } from "@/lib/format";

export type DescontoAprovado = { percentual: number; aprovado_por: string };

export function AprovarDesconto({ percentual, maximo, contexto, pedidoId, canal, forma, onAprovado, onClose }: {
  percentual: number; maximo: number; contexto: "pdv" | "pedido"; pedidoId?: string; canal: string; forma: string | null;
  onAprovado: (r: DescontoAprovado) => void; onClose: () => void;
}) {
  const [aprovadores, setAprovadores] = useState<{ user_id: string; nome: string }[] | null>(null);
  const [aprovador, setAprovador] = useState("");
  const [senha, setSenha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    supabase.rpc("aprovadores_desconto").then(({ data, error }) => {
      if (error) { notifyError(error); setAprovadores([]); return; }
      const l = (data ?? []) as { user_id: string; nome: string }[];
      setAprovadores(l);
      if (l.length) setAprovador(l[0].user_id);
    });
  }, []);

  async function aprovar(e: FormEvent) {
    e.preventDefault();
    if (!aprovador || !senha) return;
    setOcupado(true); setErro("");
    try {
      const { data, error } = await supabase.rpc("aprovar_desconto", {
        p_aprovador: aprovador, p_senha: senha, p_percentual: Math.round(percentual * 100) / 100, p_contexto: contexto,
        p_pedido: pedidoId ?? null, p_canal: canal, p_forma: forma, p_motivo: motivo.trim() || null,
      });
      if (error) throw error;
      const r = data as { ok: boolean; erro?: string; restantes?: number; percentual?: number; aprovado_por?: string };
      if (!r?.ok) {
        setSenha("");
        setErro(`${r?.erro ?? "Não aprovado"}${r?.restantes !== undefined && r.restantes < 4 ? ` (mais ${r.restantes} ${pl(r.restantes, "tentativa", "tentativas")} antes de bloquear por 15 minutos)` : ""}`);
        return;
      }
      onAprovado({ percentual: Number(r.percentual ?? percentual), aprovado_por: r.aprovado_por ?? "" });
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <Modal open onClose={onClose} title="Aprovar desconto">
      <form onSubmit={aprovar} className="space-y-4 text-sm">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Desconto de <b>{pctTexto(percentual)}</b>: o máximo para {rotuloRegra(canal, forma)} é <b>{pctTexto(maximo)}</b>.
          Um administrador precisa aprovar com a senha de aprovação.
        </p>
        {aprovadores === null ? <p className="text-sm text-slate-500">Carregando…</p> : !aprovadores.length ? (
          <p className="text-sm text-slate-700">
            Nenhum administrador criou a senha de aprovação ainda. Cada administrador cria a sua em Configurações → Descontos.
          </p>
        ) : (<>
          <Field label="Administrador">
            <select className="input" value={aprovador} onChange={(e) => setAprovador(e.target.value)}>
              {aprovadores.map((a) => <option key={a.user_id} value={a.user_id}>{a.nome}</option>)}
            </select>
          </Field>
          <Field label="Senha de aprovação">
            <input className="input" type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus required />
          </Field>
          <Field label="Motivo (opcional)">
            <input className="input" value={motivo} maxLength={300} placeholder="Ex.: cliente antigo, compra de 3 máquinas" onChange={(e) => setMotivo(e.target.value)} />
          </Field>
          {erro && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700" role="alert">{erro}</p>}
        </>)}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          {!!aprovadores?.length && <Button disabled={ocupado || !senha}><ShieldCheck size={16} /> {ocupado ? "Conferindo…" : "Aprovar"}</Button>}
        </div>
      </form>
    </Modal>
  );
}
