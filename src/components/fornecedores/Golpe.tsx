import { Ban, ShieldAlert } from "lucide-react";
import { dataBR } from "@/lib/format";

type ComBloqueio = { bloqueado?: boolean | null; bloqueio_motivo?: string | null; bloqueado_em?: string | null; bloqueado_por_nome?: string | null };

/** Selo vermelho "Golpe · não pagar" ao lado do nome do fornecedor. */
export function SeloGolpe({ f, className = "" }: { f?: ComBloqueio | null; className?: string }) {
  if (!f?.bloqueado) return null;
  return (
    <span title={f.bloqueio_motivo ?? "Fornecedor bloqueado: não pagar"}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-solido-vermelho px-1.5 py-0.5 text-2xs font-bold text-white ${className}`}>
      <Ban size={11} aria-hidden /> Golpe · não pagar
    </span>
  );
}

/** Aviso grande (formulário da conta a pagar, ficha): o que acontece com as contas desse fornecedor. */
export function AvisoGolpe({ f }: { f?: ComBloqueio | null }) {
  if (!f?.bloqueado) return null;
  return (
    <div role="alert" className="flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
      <ShieldAlert size={20} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <b>Fornecedor marcado como golpe: não pagar.</b>
        {f.bloqueio_motivo && <span className="block">{f.bloqueio_motivo}</span>}
        <span className="mt-1 block text-xs text-red-700">
          A conta entra como <b>Não pagar</b> e o ERP não deixa aprovar, agendar nem dar baixa. Se chegou boleto, pode cancelar a conta.
        </span>
      </div>
    </div>
  );
}

/**
 * Campo do cadastro: marcar como golpe (motivo obrigatório). Tirar o bloqueio é só do administrador
 * (o banco também confere).
 */
export function CampoBloqueio({ row, setCampo, admin }: { row: ComBloqueio & { id?: string }; setCampo: (nome: string, v: any) => void; admin: boolean }) {
  const ligado = !!row.bloqueado;
  // já estava bloqueado quando abriu (o banco grava quem e quando)
  const salvo = !!row.bloqueado_em;
  const travado = salvo && !admin;
  return (
    <div className={`rounded-xl border p-3 ${ligado ? "border-red-300 bg-red-50" : "border-slate-200 bg-surface"}`}>
      <label className={`flex items-start gap-2 text-sm ${travado ? "cursor-not-allowed" : "cursor-pointer"}`}>
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={ligado} disabled={travado}
          onChange={(e) => setCampo("bloqueado", e.target.checked)} />
        <span className="min-w-0 leading-tight">
          <b className={ligado ? "text-red-800" : "text-fg"}>Golpe ou fraude: bloquear todos os pagamentos</b>
          <span className="block text-xs text-slate-600">
            Para boleto falso que chega todo mês (cobranças de “informações tributárias”, “cadastro nacional”, listas e guias).
            Toda conta deste fornecedor entra como <b>Não pagar</b> e o ERP não deixa aprovar nem dar baixa.
          </span>
        </span>
      </label>
      {ligado && (
        <div className="mt-3 space-y-1.5">
          <label className="block text-xs font-semibold text-red-800" htmlFor="bloqueio_motivo">Motivo (aparece em todas as contas dele)</label>
          <input id="bloqueio_motivo" className="input" required minLength={3} value={row.bloqueio_motivo ?? ""}
            placeholder="Ex.: Golpe: boleto falso que chega todo mês" onChange={(e) => setCampo("bloqueio_motivo", e.target.value)} />
          {salvo && (
            <p className="text-xs text-red-700">
              Bloqueado{row.bloqueado_por_nome ? ` por ${row.bloqueado_por_nome}` : ""} em {dataBR(row.bloqueado_em!.slice(0, 10))}.
              {travado ? " Só o administrador tira o bloqueio." : " Desmarque para tirar o bloqueio (fica na auditoria)."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
