// Notas fiscais da My Frost (empresa anterior) de um cliente: número, data, tipo e o valor da nota (o valor oficial,
// para saber por quanto ele comprou). Ficam à parte das vendas da MF. Usado na ficha do cliente e na proposta.
import { brl, dataBR } from "@/lib/format";
import { atendimentosMyFrost, tipoDaNota } from "@/lib/notasMyFrost";

export type NotaLegado = { id: string; numero: string; data: string | null; valor: number | null; natureza: string | null };

const COR_TIPO: Record<string, string> = {
  Venda: "bg-emerald-100 text-emerald-800", Devolução: "bg-red-100 text-red-800", Estorno: "bg-red-100 text-red-800",
  Garantia: "bg-sky-100 text-sky-800", Conserto: "bg-sky-100 text-sky-800", "Retorno de conserto": "bg-sky-100 text-sky-800",
};

export function SeloTipoNota({ natureza }: { natureza: string | null }) {
  const t = tipoDaNota(natureza);
  return <span title={natureza ?? undefined} className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${COR_TIPO[t] ?? "bg-slate-100 text-slate-700"}`}>{t}</span>;
}

export function ListaNotasMyFrost({ notas }: { notas: NotaLegado[] }) {
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {notas.map((n) => (
        <li key={n.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
          <span className="whitespace-nowrap text-slate-500">{dataBR(n.data)}</span>
          <span className="whitespace-nowrap">NF <b>{n.numero}</b></span>
          <SeloTipoNota natureza={n.natureza} />
          <span className="ml-auto whitespace-nowrap font-semibold" title="Valor da nota fiscal emitida pela My Frost">{n.valor == null ? "—" : brl(n.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Atendimentos de assistência da My Frost (empresa anterior) pelas notas de conserto, retorno e garantia, por ano. */
export function AtendimentosMyFrost({ notas }: { notas: NotaLegado[] }) {
  const a = atendimentosMyFrost(notas);
  if (!a.lista.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">Atendimentos da My Frost (empresa anterior) · {a.lista.length}</h3>
      <p className="mb-2 text-xs text-slate-500">
        Pelas notas de conserto, retorno e garantia da My Frost{a.primeiro ? `, de ${dataBR(a.primeiro)}` : ""}{a.ultimo ? ` a ${dataBR(a.ultimo)}` : ""}. A My Frost não usava OS no sistema: a nota é o registro do atendimento.
      </p>
      <div className="space-y-2">
        {a.porAno.map(([ano, lista]) => (
          <div key={ano} className="rounded-lg border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
              <span>{ano}</span><span>{lista.length} {lista.length === 1 ? "atendimento" : "atendimentos"}</span>
            </div>
            <ul className="divide-y divide-slate-100 px-3 text-sm">
              {lista.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
                  <span className="whitespace-nowrap text-slate-500">{dataBR(n.data)}</span>
                  <SeloTipoNota natureza={n.natureza} />
                  <span className="whitespace-nowrap text-slate-600">NF {n.numero}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
