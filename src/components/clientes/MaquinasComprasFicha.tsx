// Ficha 360 → "Máquinas e compras": tudo o que o cliente comprou, da MF e da My Frost (empresa anterior), num lugar só:
// máquinas, notas fiscais (valor e chave de 44 dígitos para consultar), pedidos e propostas (valor e condição de
// pagamento) e as OS. Os dados da My Frost vêm com a tarja pedida pela usuária (ok do advogado, 24/10).
// As notas da My Frost chegam pela função notas_my_frost_do_cliente (a tabela continua só da conta master).
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Info, ShoppingCart, Snowflake, Wrench, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui";
import { DEMO, supabase } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";
import { SeloEmpresa, SeloSituacao } from "@/components/vendas/PropostasTiny";
import { SeloTipoNota } from "@/components/clientes/NotasMyFrost";
import type { PropostaTiny } from "@/lib/propostasTiny";
import { BlocoFicha, type CorBloco } from "@/components/clientes/BlocoFicha";
import { EtiquetaMaquina } from "@/components/clientes/MaquinasCliente";

type NotaMyFrost = { id: string; numero: string; data: string | null; valor: number | null; natureza: string | null; chave: string | null; situacao: string };

export const TARJA_MY_FROST = "Dados fornecidos pela My Frost para fins de manutenção e atendimento ao cliente.";

const Origem = ({ myFrost }: { myFrost: boolean }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${myFrost ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
    {myFrost ? "My Frost" : "MF"}
  </span>
);

const Chave = ({ chave }: { chave: string | null }) =>
  chave ? <div className="select-all font-mono text-2xs text-slate-500 [overflow-wrap:anywhere]" title="Chave de acesso: copie para consultar a nota na Receita">{chave}</div> : null;

// Máquina da My Frost ligada à proposta e à nota que a venderam (ligação feita pelo nome do cliente, o modelo e a data,
// porque o backup dos XML não existe mais): valor negociado, valor que saiu na nota e a chave, e como foi ligada.
function VendaDaMaquina({ e, proposta, nota }: { e: any; proposta?: PropostaTiny; nota?: NotaMyFrost }) {
  if (!e.ligacao_venda) return null;
  return (
    <div className="w-full rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {e.valor_negociado != null && <span>Negociado: <b className="text-fg">{brl(Number(e.valor_negociado))}</b>{proposta ? ` (proposta #${proposta.numero ?? "—"}, ${dataBR(proposta.data)})` : ""}</span>}
        {nota && <span>Na nota: <b className="text-fg">{brl(Number(nota.valor ?? 0))}</b> (NF {nota.numero}, {dataBR(nota.data)})</span>}
      </div>
      {nota && <Chave chave={nota.chave} />}
      <div className="text-2xs text-slate-400">Ligação {e.ligacao_venda}</div>
    </div>
  );
}

function Secao({ titulo, n, icone, cor, children }: { titulo: string; n: number; icone: LucideIcon; cor: CorBloco; children: ReactNode }) {
  return (
    <BlocoFicha titulo={titulo} n={n} icone={icone} cor={cor}>
      {n ? children : <p className="text-sm text-slate-500">Nada registrado.</p>}
    </BlocoFicha>
  );
}

export function MaquinasComprasFicha({ clienteId, equipamentos, notas, pedidos, propostasTiny, oss, soMaquinasENotas }: {
  clienteId: string; equipamentos: any[]; notas: any[]; pedidos: any[]; propostasTiny: PropostaTiny[]; oss: any[];
  /** na Ficha 360 os pedidos ficam na aba Compras e as OS na Assistência: aqui só máquinas e notas */
  soMaquinasENotas?: boolean;
}) {
  const { data: notasMyFrost = [] } = useQuery({
    queryKey: ["notas_my_frost_do_cliente", clienteId],
    enabled: !DEMO,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("notas_my_frost_do_cliente", { p_cliente: clienteId });
      if (error) throw error;
      return (data ?? []) as NotaMyFrost[];
    },
  });

  const temMyFrost = notasMyFrost.length > 0 || equipamentos.some((e) => e.origem) || propostasTiny.some((p) => p.empresa === "my_frost");
  const notasMf = notas.filter((n) => n.status !== "cancelada");
  const vendas = pedidos.filter((p) => !["orcamento", "cancelado"].includes(p.status));
  const listaNotas = [
    ...notasMf.map((n) => ({ id: n.id, myFrost: false, data: n.created_at as string, numero: String(n.numero ?? "—"), valor: Number(n.valor_total ?? 0), natureza: null as string | null, chave: n.chave as string | null, cancelada: false })),
    ...notasMyFrost.map((n) => ({ id: n.id, myFrost: true, data: n.data ?? "", numero: n.numero, valor: Number(n.valor ?? 0), natureza: n.natureza, chave: n.chave, cancelada: n.situacao === "cancelada" })),
  ].sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));

  return (
    <div className="space-y-3">
      {temMyFrost && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden /> {TARJA_MY_FROST}
        </p>
      )}

      <Secao titulo="Máquinas" n={equipamentos.length} icone={Snowflake} cor="azul">
        <ul className="divide-y divide-slate-100 text-sm">
          {equipamentos.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
              <EtiquetaMaquina m={e} tamanho="grande" />
              <Origem myFrost={!!e.origem} />
              <span className="min-w-0 text-slate-600 [overflow-wrap:anywhere]">{e.descricao}</span>
              {e.numero_serie && <span className="text-xs text-slate-500">série {e.numero_serie}</span>}
              <span className="ml-auto whitespace-nowrap text-slate-500">{e.data_venda ? `venda ${dataBR(e.data_venda)}` : "data da venda não registrada"}</span>
              <VendaDaMaquina e={e} proposta={propostasTiny.find((p) => p.id === e.proposta_tiny_id)} nota={notasMyFrost.find((n) => n.id === e.nota_legado_id)} />
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo="Notas fiscais" n={listaNotas.length} icone={FileText} cor="roxo">
        <p className="mb-1.5 text-xs text-slate-500">O valor é o que saiu na nota. A chave de 44 dígitos serve para consultar a nota no site da Receita.</p>
        <ul className="divide-y divide-slate-100 text-sm">
          {listaNotas.map((n) => (
            <li key={`${n.myFrost}-${n.id}`} className={`py-1.5 ${n.cancelada ? "text-slate-400" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Origem myFrost={n.myFrost} />
                <span className="whitespace-nowrap text-slate-500">{dataBR(n.data)}</span>
                <span className="whitespace-nowrap">NF <b>{n.numero}</b></span>
                {n.myFrost && <SeloTipoNota natureza={n.natureza} />}
                {n.cancelada && <span className="text-xs font-semibold">cancelada</span>}
                <span className={`ml-auto whitespace-nowrap font-semibold ${n.cancelada ? "line-through" : ""}`}>{brl(n.valor)}</span>
              </div>
              <Chave chave={n.chave} />
            </li>
          ))}
        </ul>
      </Secao>

      {!soMaquinasENotas && (<>
      <Secao titulo="Pedidos e propostas" n={vendas.length + propostasTiny.length} icone={ShoppingCart} cor="verde">
        <p className="mb-1.5 text-xs text-slate-500">Valor negociado e condição de pagamento, quando foram registrados.</p>
        <ul className="divide-y divide-slate-100 text-sm">
          {vendas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
              <Origem myFrost={false} /> <span className="font-semibold">Pedido #{p.numero}</span>
              <span className="text-slate-500">{dataBR(p.aprovado_em ?? p.created_at)}</span> <Badge value={p.status} />
              {(p.forma_pagamento || p.parcelas) && <span className="text-slate-600">{[p.forma_pagamento, p.parcelas > 1 ? `${p.parcelas}x` : null].filter(Boolean).join(" · ")}</span>}
              <span className="ml-auto whitespace-nowrap font-semibold">{brl(p.valor_total)}</span>
            </li>
          ))}
          {propostasTiny.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
              <SeloEmpresa e={p.empresa} /> <span className="font-semibold">Proposta #{p.numero ?? "—"}</span>
              <span className="text-slate-500">{dataBR(p.data)}</span> <SeloSituacao s={p.situacao} />
              <span className="min-w-0 text-slate-600 [overflow-wrap:anywhere]">{p.itens.map((i) => i.descricao).join(" · ")}</span>
              <span className="ml-auto whitespace-nowrap font-semibold">{p.total != null ? brl(p.total) : "—"}</span>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao titulo="Ordens de serviço" n={oss.length} icone={Wrench} cor="laranja">
        <ul className="divide-y divide-slate-100 text-sm">
          {oss.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
              <span className="font-semibold">OS #{o.numero}</span> <span className="text-slate-500">{dataBR(o.data_entrada)}</span> <Badge value={o.status} />
              <span className="min-w-0 text-slate-600 [overflow-wrap:anywhere]">{[o.equipamento, o.numero_serie && `série ${o.numero_serie}`, o.defeito_relatado].filter(Boolean).join(" · ")}</span>
              {o.valor_total != null && <span className="ml-auto whitespace-nowrap font-semibold">{brl(o.valor_total)}</span>}
            </li>
          ))}
        </ul>
      </Secao>
      </>)}
    </div>
  );
}
