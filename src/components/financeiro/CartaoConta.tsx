// Cartão de uma conta (a pagar ou a receber) no celular: quem é, valor e vencimento em destaque, faixa colorida
// pela situação (vencida, vence logo, em dia, paga) e as ações em ícones coloridos, como os atalhos da tela inicial.
import type { ReactNode } from "react";
import { EtiquetaUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje } from "@/lib/format";

const DIA = 86_400_000;

/** Quanto falta (ou passou) do vencimento, em palavras, com a cor do texto e da faixa do cartão. */
export function prazoConta(status: string, vencimento: string, dia = hoje()) {
  if (status === "pago") return { texto: "paga", cor: "text-emerald-700", faixa: "border-l-emerald-500" };
  if (status === "cancelado") return { texto: "cancelada", cor: "text-slate-500", faixa: "border-l-slate-300" };
  const d = Math.round((Date.parse(vencimento) - Date.parse(dia)) / DIA);
  if (d < 0) return { texto: `venceu há ${-d} ${d === -1 ? "dia" : "dias"}`, cor: "text-red-700", faixa: "border-l-red-500" };
  if (d === 0) return { texto: "vence hoje", cor: "text-amber-700", faixa: "border-l-amber-500" };
  if (d <= 7) return { texto: d === 1 ? "vence amanhã" : `vence em ${d} dias`, cor: "text-amber-700", faixa: "border-l-amber-500" };
  return { texto: `vence em ${d} dias`, cor: "text-slate-600", faixa: "border-l-sky-500" };
}

export function CartaoConta({ titulo, descricao, detalhe, unidadeId, valor, vencimento, status, pagoEm, situacao, marcar, marcado, acoes }: {
  titulo: ReactNode; descricao?: ReactNode; detalhe?: ReactNode; unidadeId?: string | null;
  valor: number; vencimento: string; status: string; pagoEm?: string | null;
  situacao?: ReactNode; marcar?: ReactNode; marcado?: boolean; acoes?: ReactNode;
}) {
  const p = prazoConta(status, vencimento);
  const pago = status === "pago" && !!pagoEm;
  return (
    <li className={`overflow-hidden rounded-2xl border border-l-4 border-slate-200 bg-surface shadow-card ${p.faixa} ${marcado ? "ring-2 ring-brand" : ""}`}>
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          {marcar}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-[15px] font-bold leading-snug text-fg">{titulo}</p>
              <EtiquetaUnidade id={unidadeId} />
            </div>
            {descricao && <p className="mt-0.5 break-words text-sm text-slate-600">{descricao}</p>}
            {detalhe && <div className="mt-0.5 break-words text-xs text-slate-500">{detalhe}</div>}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Valor</span>
            <span className="num block text-lg font-bold text-fg [overflow-wrap:anywhere]">{brl(valor)}</span>
          </div>
          <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2 text-right">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{pago ? "Paga em" : "Vencimento"}</span>
            <span className="num block text-lg font-bold text-fg">{dataBR(pago ? pagoEm! : vencimento)}</span>
            <span className={`block text-xs font-semibold ${p.cor}`}>{pago ? `vencia ${dataBR(vencimento)}` : p.texto}</span>
          </div>
        </div>
        {situacao && <div className="mt-2.5 flex flex-wrap items-center gap-1.5">{situacao}</div>}
      </div>
      {acoes && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(3.6rem,1fr))] gap-1 border-t border-slate-200 bg-slate-50 px-1.5 py-2">{acoes}</div>
      )}
    </li>
  );
}

/** Lista de cartões (só no celular; no computador continua a tabela). */
export function ListaContas({ vazia, children }: { vazia: boolean; children: ReactNode }) {
  return (
    <div className="md:hidden">
      {vazia
        ? <p className="rounded-2xl border border-slate-200 bg-surface p-8 text-center text-sm text-slate-500">Nenhuma conta neste filtro.</p>
        : <ul className="space-y-3">{children}</ul>}
    </div>
  );
}
