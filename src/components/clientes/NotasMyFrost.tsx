// Notas fiscais da My Frost (empresa anterior) de um cliente: número, data, tipo e o valor da nota (o valor oficial,
// para saber por quanto ele comprou). A lista completa fica na Retaguarda → My Frost (só a conta master); na Ficha 360
// a equipe vê as do cliente pela função notas_my_frost_do_cliente (aba Máquinas e compras, com a tarja da My Frost).
import { brl, dataBR } from "@/lib/format";
import { tipoDaNota } from "@/lib/notasMyFrost";

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
