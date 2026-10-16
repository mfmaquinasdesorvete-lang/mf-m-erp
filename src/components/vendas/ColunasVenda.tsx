// Peças das colunas da lista de vendas: forma de pagamento e de envio em ícone, situação do pagamento,
// miniatura do produto e os sinais do que já foi feito. As regras ficam em src/lib/vendasLista.ts.
import {
  Banknote, Barcode, Bike, Car, CircleDollarSign, CreditCard, Diamond, FileText, Landmark, Link2, Minus, Package, PackageCheck,
  Plane, Repeat, Store, Truck, type LucideIcon,
} from "lucide-react";
import { ROTULO_PAGAMENTO, type Envio, type MeioPagamento, type Pagamento, type SituacaoPagamento, type TipoEnvio } from "@/lib/vendasLista";

const ICONE_MEIO: Record<MeioPagamento, [LucideIcon, string]> = {
  pix: [Diamond, "text-teal-600"], boleto: [Barcode, "text-slate-700"], cartao: [CreditCard, "text-violet-600"],
  dinheiro: [Banknote, "text-emerald-600"], transferencia: [Landmark, "text-sky-700"], link: [Link2, "text-sky-600"],
  debito_automatico: [Repeat, "text-slate-600"], cheque: [FileText, "text-slate-600"], outro: [CircleDollarSign, "text-slate-600"],
};

/** Ícone da forma de pagamento (o nome aparece ao passar o mouse e para o leitor de tela). */
export function IconeMeio({ meio, rotulo, comTexto = false }: { meio: { meio: MeioPagamento; rotulo: string } | null; rotulo?: string; comTexto?: boolean }) {
  if (!meio) return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-dashed border-slate-300 text-slate-400" title="Forma de pagamento não informada"><Minus size={14} aria-hidden /><span className="sr-only">Forma de pagamento não informada</span></span>;
  const [Icone, cor] = ICONE_MEIO[meio.meio];
  const texto = rotulo ?? meio.rotulo;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5" title={texto}>
      <span className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-surface"><Icone size={16} className={cor} aria-hidden /></span>
      {comTexto ? <span className="text-xs font-medium text-slate-600">{texto}</span> : <span className="sr-only">{texto}</span>}
    </span>
  );
}

export const COR_PAGAMENTO: Record<SituacaoPagamento, string> = {
  recebido: "bg-emerald-100 text-emerald-800",
  parcial: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  vencido: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
  a_receber: "bg-sky-100 text-sky-800",
  sem_conta: "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200",
};
const DICA_PAGAMENTO: Record<SituacaoPagamento, string> = {
  recebido: "Todas as contas a receber desta venda estão pagas.",
  parcial: "Parte já foi recebida; o resto ainda não venceu.",
  vencido: "Tem conta a receber vencida e não paga.",
  a_receber: "Conta a receber lançada, ainda no prazo.",
  sem_conta: "Esta venda não tem conta a receber no ERP. Marque as vendas e use \"Lançar contas\" para lançar (já recebidas ou em aberto).",
};

/** Situação do pagamento: a etiqueta colorida e, embaixo, a data ou o valor. */
export function EtiquetaPagamento({ pg, compacta = false }: { pg: Pagamento | null; compacta?: boolean }) {
  if (!pg) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="inline-flex flex-col items-start" title={DICA_PAGAMENTO[pg.situacao]}>
      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${COR_PAGAMENTO[pg.situacao]}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{pg.texto}
      </span>
      {!compacta && pg.sub && <span className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500">{pg.sub}</span>}
      <span className="sr-only">{ROTULO_PAGAMENTO[pg.situacao]}</span>
    </span>
  );
}

const ICONE_ENVIO: Record<TipoEnvio, [LucideIcon, string]> = {
  transportadora: [Truck, "text-blue-700"], aerea: [Plane, "text-sky-700"], correios: [Package, "text-amber-600"], agencia: [Package, "text-amber-600"],
  plataforma: [PackageCheck, "text-orange-600"], aplicativo: [Bike, "text-fuchsia-600"], autonomo: [Car, "text-slate-700"], proprio: [Car, "text-slate-700"],
  retira: [Store, "text-emerald-700"], outro: [Truck, "text-slate-600"], sem_frete: [Store, "text-emerald-700"],
  a_definir: [Truck, "text-slate-400"], nao_informado: [Minus, "text-slate-400"],
};

/** Forma de envio em ícone, com o nome, o rastreio (link quando a transportadora tem a página) e a entrega. */
export function IconeEnvio({ envio, compacto = false }: { envio: Envio; compacto?: boolean }) {
  const [Icone, cor] = ICONE_ENVIO[envio.tipo];
  const apagado = envio.tipo === "nao_informado" || envio.tipo === "a_definir";
  return (
    <span className="inline-flex min-w-0 items-start gap-1.5" title={envio.tipo === "nao_informado" ? "A forma de envio não veio na planilha do Tiny" : envio.rotulo}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border ${apagado ? "border-dashed border-slate-300" : "border-slate-200 bg-surface"}`}><Icone size={16} className={cor} aria-hidden /></span>
      <span className="min-w-0 leading-tight">
        <span className={`block text-xs font-semibold ${apagado ? "text-slate-400" : "text-fg"}`}>{envio.rotulo}</span>
        {!compacto && envio.rastreio && (envio.link
          ? <a href={envio.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="num block break-all text-[11px] font-medium text-brand underline-offset-2 hover:underline" title="Abrir o rastreio">{envio.rastreio}</a>
          : <span className="num block break-all text-[11px] text-slate-500" title="Código de rastreio">{envio.rastreio}</span>)}
        {!compacto && envio.andamento && <span className={`block text-[11px] ${envio.entregue ? "font-semibold text-emerald-700" : "text-slate-500"}`}>{envio.andamento}</span>}
      </span>
    </span>
  );
}

/** Sinais do que já foi feito: E estoque baixado, C contas lançadas, N NF-e autorizada, P proposta enviada. */
export function SinaisVenda({ s }: { s: { estoque: boolean; contas: boolean; nfe: boolean; proposta: boolean } }) {
  const itens: [string, boolean, string][] = [
    ["E", s.estoque, s.estoque ? "Estoque baixado" : "Estoque ainda não baixado"],
    ["C", s.contas, s.contas ? "Contas a receber lançadas" : "Sem contas a receber"],
    ["N", s.nfe, s.nfe ? "NF-e autorizada" : "Sem NF-e autorizada"],
    ["P", s.proposta, s.proposta ? "Proposta enviada ao cliente" : "Proposta não enviada pelo ERP"],
  ];
  return (
    <span className="inline-flex gap-0.5">
      {itens.map(([l, ok, dica]) => (
        <span key={l} title={dica} className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${ok ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-300"}`}>
          {l}<span className="sr-only">: {dica}</span>
        </span>
      ))}
    </span>
  );
}

/** Foto do primeiro produto da venda com foto, e "+N" quando há mais itens. */
export function MiniaturaVenda({ url, nItens, descricao }: { url: string | null; nItens: number; descricao?: string | null }) {
  return (
    <span className="relative inline-block h-10 w-10 shrink-0" title={descricao ?? undefined}>
      {url
        ? <img src={url} alt="" loading="lazy" className="h-10 w-10 rounded-md border border-slate-200 bg-white object-contain" />
        : <span className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-300"><Package size={18} aria-hidden /></span>}
      {nItens > 1 && <span className="num absolute -bottom-1 -right-1 rounded-full bg-slate-700 px-1 text-[10px] font-bold leading-4 text-white">+{nItens - 1}</span>}
    </span>
  );
}
