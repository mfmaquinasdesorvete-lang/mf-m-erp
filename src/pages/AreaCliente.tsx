// Página do cliente (/cliente/<código>), sem login, com o nome dele no alto e quatro abas: Contas (em aberto com o
// Pix copia e cola e o QR Code de cada uma, a segunda via em PDF e os últimos pagamentos), Máquinas (garantia,
// preventiva e o link da página de cada uma com manuais e dicas), Manutenções (as OS) e Compras (peças e máquinas,
// com o rastreio), Notas fiscais (NF-e e NFS-e da MF com o DANFE) e Meus dados, com um Início que resume tudo e
// "Imprimir tudo". O código do link é secreto: nunca o CNPJ/CPF, que qualquer um poderia adivinhar.
// A página é sempre clara (o tema escuro do ERP não vale aqui) e com texto forte, para ler bem no celular.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import qrcode from "qrcode-generator";
import { BookOpen, CalendarClock, Check, ChevronRight, Copy, CreditCard, FileText, Home, Loader2, MessageCircle, Package, Printer, ShieldCheck, Truck, UserRound, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { DEMO, callFunction, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, hoje, whatsappLink, pl } from "@/lib/format";
import { pixCopiaECola } from "@/lib/cobranca";
import { urlFotoProduto } from "@/lib/catalogo";
import logo from "@/assets/logo.webp";

type Aberta = { id: string; descricao: string; valor: number; vencimento: string; forma: string | null; pagamento: string | null; pix_chave: string | null; pix_nome: string | null; pix_cidade: string | null; link?: boolean };
type Area = {
  cliente: string; empresa: { nome: string; whatsapp: string | null; telefone: string | null; email: string | null };
  abertas: Aberta[]; pagas: { descricao: string; valor: number; data_pagamento: string | null }[];
  maquinas?: Maquina[]; manutencoes?: Manutencao[]; compras?: Compra[]; notas?: Nota[]; propostas?: Proposta[]; dados?: Dados;
};
type Nota = { tipo: string; numero?: string | number; serie?: string; data: string; valor?: number; chave?: string; danfe?: string; devolucao?: boolean };
type Proposta = { numero?: string | number; data?: string; situacao?: string; valor?: number };
type Dados = { nome?: string; fantasia?: string; documento?: string; ie?: string; endereco?: string; telefone?: string; whatsapp?: string; email?: string; cliente_desde?: string };
type Maquina = { token: string; descricao: string; modelo?: string; numero_serie?: string; data_venda?: string; garantia_ate?: string; proxima_preventiva?: string; usada?: boolean; foto?: string; manuais?: number };
type Manutencao = { numero: number; equipamento?: string; numero_serie?: string; status: string; data_entrada?: string; previsao?: string; concluida_em?: string; entregue_em?: string; em_garantia?: boolean; defeito?: string; solucao?: string; valor?: number };
type Compra = { numero: number; data: string; status: string; valor: number; rastreio?: string; enviado_em?: string; transportadora?: string; itens?: { descricao: string; quantidade: number }[] };
type Aba = "inicio" | "contas" | "maquinas" | "manutencoes" | "compras" | "notas" | "dados";
const SITUACAO_OS: Record<string, string> = { aberta: "Recebida", em_diagnostico: "Em análise", aguardando_aprovacao: "Esperando sua aprovação", aguardando_peca: "Esperando peças", em_reparo: "Em conserto", concluida: "Pronta para retirar", entregue: "Entregue" };
const SITUACAO_PEDIDO: Record<string, string> = { aprovado: "Em separação", faturado: "Faturado", entregue: "Entregue" };

export default function AreaCliente() {
  const codigo = decodeURIComponent(useLocation().pathname.split("/")[2] ?? "");
  // link antigo: o código comprido (uuid); link novo: nome-do-cliente-código
  const antigo = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codigo);
  const { data: a, isLoading } = useQuery({
    queryKey: ["area_cliente", codigo],
    queryFn: async () => {
      const { data, error } = antigo ? await supabase.rpc("area_cliente", { p_token: codigo }) : await supabase.rpc("area_cliente_link", { p_link: codigo });
      if (error) throw error;
      return data as (Area & { token?: string }) | null;
    },
    retry: false,
  });
  const [escolhida, setAba] = useState<Aba | null>(null);
  // "Imprimir tudo": mostra todas as seções juntas, abre a impressão e volta
  const [tudo, setTudo] = useState(false);
  useEffect(() => {
    if (!tudo) return;
    const volta = () => setTudo(false);
    window.addEventListener("afterprint", volta);
    const t = setTimeout(() => window.print(), 150);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", volta); };
  }, [tudo]);
  if (isLoading) return <Tela><p className="py-24 text-center text-slate-500">Carregando…</p></Tela>;
  if (!a) return <Tela><p className="py-24 text-center text-slate-600">Link não encontrado. Peça um link novo para a MF Máquinas.</p></Tela>;
  const token = antigo ? codigo : a.token ?? "";
  const dia = hoje();
  const total = a.abertas.reduce((s, c) => s + Number(c.valor), 0);
  const zap = a.empresa.whatsapp || a.empresa.telefone;
  const abas: { id: Aba; nome: string; icone: LucideIcon; n: number }[] = [
    { id: "inicio", nome: "Início", icone: Home, n: 0 },
    { id: "contas", nome: "Contas", icone: Wallet, n: a.abertas.length },
    { id: "maquinas", nome: "Máquinas", icone: Package, n: a.maquinas?.length ?? 0 },
    { id: "manutencoes", nome: "Manutenções", icone: Wrench, n: a.manutencoes?.length ?? 0 },
    { id: "compras", nome: "Compras e peças", icone: Truck, n: a.compras?.length ?? 0 },
    { id: "notas", nome: "Notas fiscais", icone: FileText, n: a.notas?.length ?? 0 },
    { id: "dados", nome: "Meus dados", icone: UserRound, n: 0 },
  ];
  // conta em aberto abre direto nas contas; senão o Início com tudo resumido
  const aba: Aba = escolhida ?? (a.abertas.length ? "contas" : "inicio");
  const ve = (x: Aba) => tudo || aba === x;
  const titulo = (x: Aba) => tudo && <h2 className="px-5 pt-6 text-lg font-bold text-slate-900">{abas.find((b) => b.id === x)?.nome}</h2>;

  return (
    <Tela>
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl print:max-w-none print:rounded-none print:shadow-none">
        <header className="flex items-center gap-4 bg-[#0B1F3A] px-6 py-5 text-white">
          <img src={logo} alt="" className="h-12 w-12 rounded-xl bg-white/10" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Área do cliente · {a.empresa.nome}</div>
            <div className="break-words text-xl font-bold">{a.cliente}</div>
            {a.dados?.cliente_desde && <div className="text-xs opacity-80">Cliente desde {dataBR(a.dados.cliente_desde)}</div>}
          </div>
          <button type="button" onClick={() => setTudo(true)} className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold text-white hover:bg-white/25 sm:inline-flex print:hidden">
            <Printer size={16} aria-hidden /> Imprimir tudo
          </button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-300 bg-slate-50 px-3 print:hidden" aria-label="Seções">
          {abas.map((x) => (
            <button key={x.id} type="button" onClick={() => setAba(x.id)} aria-current={aba === x.id ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-[3px] px-3 py-3 text-sm font-bold ${aba === x.id ? "border-[#066d8c] text-[#05506a]" : "border-transparent text-slate-700 hover:text-slate-950"}`}>
              <x.icone size={16} aria-hidden /> {x.nome}{x.n > 0 && <span className="rounded-full bg-[#0B1F3A] px-1.5 text-xs text-white">{x.n}</span>}
            </button>
          ))}
        </nav>
        {ve("inicio") && !tudo && <Inicio a={a} total={total} ir={setAba} imprimir={() => setTudo(true)} />}
        {ve("dados") && <>{titulo("dados")}<MeusDados d={a.dados} empresa={a.empresa} /></>}
        {ve("maquinas") && <>{titulo("maquinas")}<Maquinas lista={a.maquinas ?? []} zap={zap} cliente={a.cliente} /></>}
        {ve("manutencoes") && <>{titulo("manutencoes")}<Manutencoes lista={a.manutencoes ?? []} /></>}
        {ve("compras") && <>{titulo("compras")}<Compras lista={a.compras ?? []} /></>}
        {ve("notas") && <>{titulo("notas")}<Notas lista={a.notas ?? []} propostas={a.propostas ?? []} /></>}
        {ve("contas") && <>{titulo("contas")}<div className="space-y-5 px-5 py-6 text-sm text-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-700">Em aberto</div>
              <div className={`text-3xl font-bold ${total > 0 ? "text-red-700" : "text-emerald-700"}`}>{brl(total)}</div>
              <div className="text-sm text-slate-700">{a.abertas.length ? `${a.abertas.length} ${pl(a.abertas.length, "conta", "contas")}` : "Nada em aberto. Obrigado!"}</div>
            </div>
            <div className="flex gap-2 print:hidden">
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[#066d8c] px-3 py-2 text-sm font-bold text-[#05506a] hover:bg-sky-50"><Printer size={16} /> Segunda via (PDF)</button>
              {zap && <a href={whatsappLink(zap, `Olá! Sou ${a.cliente} e quero falar sobre as minhas contas.`)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-solido-verde px-3 py-2 text-sm font-semibold text-white hover:opacity-90"><MessageCircle size={16} /> Falar</a>}
            </div>
          </div>

          {a.abertas.map((c) => <Conta key={c.id} c={c} dia={dia} token={token} />)}

          {a.pagas.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">Pagamentos feitos · {a.pagas.length}</h2>
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-300 px-3 text-sm">
                {a.pagas.map((p, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2.5"><span className="min-w-0 text-slate-900">{p.descricao}<span className="block text-xs font-semibold text-emerald-700">pago em {dataBR(p.data_pagamento)}</span></span><b className="whitespace-nowrap text-slate-900">{brl(p.valor)}</b></li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-slate-700">Pagou e ainda aparece aqui? O pagamento pode levar até 2 dias úteis para ser identificado. {a.empresa.email && `Dúvidas: ${a.empresa.email}.`}</p>
        </div></>}
      </div>
    </Tela>
  );
}

const Vazio = ({ texto }: { texto: string }) => <p className="px-5 py-12 text-center text-sm text-slate-700">{texto}</p>;

function Inicio({ a, total, ir, imprimir }: { a: Area; total: number; ir: (x: Aba) => void; imprimir: () => void }) {
  const dia = hoje();
  const naGarantia = (a.maquinas ?? []).filter((m) => m.garantia_ate && m.garantia_ate >= dia).length;
  const osAbertas = (a.manutencoes ?? []).filter((o) => o.status !== "entregue").length;
  const comprado = (a.compras ?? []).reduce((s, p) => s + Number(p.valor ?? 0), 0);
  const cartoes: { aba: Aba; icone: LucideIcon; titulo: string; valor: string; detalhe: string; cor: string }[] = [
    { aba: "contas", icone: Wallet, titulo: "Em aberto", valor: brl(total), detalhe: a.abertas.length ? `${a.abertas.length} ${pl(a.abertas.length, "conta", "contas")} para pagar` : "Tudo pago. Obrigado!", cor: total > 0 ? "bg-red-50 text-red-800 border-red-200" : "bg-emerald-50 text-emerald-800 border-emerald-200" },
    { aba: "maquinas", icone: Package, titulo: "Máquinas", valor: String(a.maquinas?.length ?? 0), detalhe: naGarantia ? `${naGarantia} na garantia` : "manuais e dicas de uso", cor: "bg-sky-50 text-sky-900 border-sky-200" },
    { aba: "manutencoes", icone: Wrench, titulo: "Manutenções", valor: String(a.manutencoes?.length ?? 0), detalhe: osAbertas ? `${osAbertas} em andamento` : "nenhuma em andamento", cor: "bg-amber-50 text-amber-900 border-amber-200" },
    { aba: "compras", icone: Truck, titulo: "Compras e peças", valor: String(a.compras?.length ?? 0), detalhe: comprado ? `${brl(comprado)} no total` : "nenhuma ainda", cor: "bg-violet-50 text-violet-900 border-violet-200" },
    { aba: "notas", icone: FileText, titulo: "Notas fiscais", valor: String(a.notas?.length ?? 0), detalhe: "DANFE para baixar", cor: "bg-slate-50 text-slate-900 border-slate-300" },
    { aba: "dados", icone: UserRound, titulo: "Meus dados", valor: a.dados?.documento ?? "—", detalhe: a.dados?.endereco ? "endereço e contatos" : "cadastro", cor: "bg-slate-50 text-slate-900 border-slate-300" },
  ];
  return (
    <div className="space-y-4 px-5 py-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cartoes.map((c) => (
          <button key={c.aba} type="button" onClick={() => ir(c.aba)} className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition hover:shadow-md ${c.cor}`}>
            <c.icone size={26} className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold uppercase tracking-wide">{c.titulo}</span>
              <span className="block truncate text-xl font-extrabold text-slate-950">{c.valor}</span>
              <span className="block text-xs font-semibold">{c.detalhe}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 opacity-60" aria-hidden />
          </button>
        ))}
      </div>
      <button type="button" onClick={imprimir} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] px-4 py-3 font-semibold text-white sm:hidden">
        <Printer size={18} aria-hidden /> Imprimir tudo (PDF)
      </button>
    </div>
  );
}

function MeusDados({ d, empresa }: { d?: Dados; empresa: Area["empresa"] }) {
  if (!d) return <Vazio texto="Cadastro não encontrado." />;
  const linhas: [string, string | undefined][] = [
    ["Nome / razão social", d.nome], ["Nome fantasia", d.fantasia], ["CPF / CNPJ", d.documento], ["Inscrição estadual", d.ie],
    ["Endereço", d.endereco], ["Telefone", d.telefone], ["WhatsApp", d.whatsapp], ["E-mail", d.email],
    ["Cliente desde", d.cliente_desde && dataBR(d.cliente_desde)],
  ];
  return (
    <div className="space-y-3 px-5 py-6 text-sm">
      <dl className="divide-y divide-slate-200 rounded-xl border border-slate-300">
        {linhas.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[170px_1fr]">
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-600">{k}</dt>
            <dd className="break-words font-medium text-slate-950">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-700">Algum dado errado ou mudou de endereço? Avise a {empresa.nome}{empresa.email ? ` (${empresa.email})` : ""} para atualizarmos.</p>
    </div>
  );
}

function Notas({ lista, propostas }: { lista: Nota[]; propostas: Proposta[] }) {
  if (!lista.length && !propostas.length) return <Vazio texto="Nenhuma nota fiscal ainda." />;
  return (
    <div className="space-y-5 px-5 py-6 text-sm">
      {lista.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-300">
          {lista.map((n, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <FileText size={20} className="shrink-0 text-[#066d8c]" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-950">{n.tipo} nº {n.numero ?? "—"}{n.serie ? `/${n.serie}` : ""}{n.devolucao && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">devolução</span>}</div>
                <div className="text-xs font-medium text-slate-700">Emitida em {dataBR(n.data)}</div>
                {n.chave && <div className="mt-0.5 select-all break-all font-mono text-[11px] text-slate-600">{n.chave}</div>}
              </div>
              {n.valor != null && <b className="whitespace-nowrap text-slate-950">{brl(Number(n.valor))}</b>}
              {n.danfe && <a href={n.danfe} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#066d8c] px-3 py-1.5 text-xs font-bold text-white print:hidden">DANFE</a>}
            </li>
          ))}
        </ul>
      )}
      {propostas.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">Propostas · {propostas.length}</h3>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-300">
            {propostas.map((p, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
                <span className="text-slate-950">Proposta {p.numero ?? ""}<span className="block text-xs text-slate-700">{[p.data && dataBR(p.data), p.situacao].filter(Boolean).join(" · ")}</span></span>
                {p.valor != null && <b className="text-slate-950">{brl(Number(p.valor))}</b>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Maquinas({ lista, zap, cliente }: { lista: Maquina[]; zap: string | null; cliente: string }) {
  const dia = hoje();
  if (!lista.length) return <Vazio texto="Nenhuma máquina registrada no seu nome ainda." />;
  return (
    <ul className="space-y-3 px-5 py-6 text-sm text-slate-900">
      {lista.map((m) => {
        const garantia = m.garantia_ate && m.garantia_ate >= dia;
        return (
          <li key={m.token} className="flex flex-col gap-3 rounded-xl border border-slate-300 p-4 sm:flex-row">
            {m.foto && <img src={urlFotoProduto(m.foto)} alt="" className="h-28 w-full rounded-lg object-contain sm:w-28" />}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="font-semibold text-slate-900">{m.descricao}{m.usada && <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs font-normal">usada</span>}</div>
              <div className="text-xs font-medium text-slate-700">{[m.modelo && `Modelo ${m.modelo}`, m.numero_serie && `Série ${m.numero_serie}`, m.data_venda && `Comprada em ${dataBR(m.data_venda)}`].filter(Boolean).join(" · ")}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {m.garantia_ate && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${garantia ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}><ShieldCheck size={13} aria-hidden /> {garantia ? `Na garantia até ${dataBR(m.garantia_ate)}` : `Garantia até ${dataBR(m.garantia_ate)}`}</span>}
                {m.proxima_preventiva && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${m.proxima_preventiva < dia ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"}`}><CalendarClock size={13} aria-hidden /> Preventiva {m.proxima_preventiva < dia ? "atrasada desde" : "em"} {dataBR(m.proxima_preventiva)}</span>}
              </div>
              <div className="flex flex-wrap gap-2 pt-1 print:hidden">
                <a href={`/maquina/${m.token}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#066d8c] px-3 py-2 text-sm font-semibold text-white"><BookOpen size={15} aria-hidden /> Manuais e dicas{m.manuais ? ` (${m.manuais})` : ""}</a>
                {zap && <a href={whatsappLink(zap, `Olá! Sou ${cliente} e preciso de assistência na máquina ${m.descricao}${m.numero_serie ? ` (série ${m.numero_serie})` : ""}.`)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><Wrench size={15} aria-hidden /> Pedir assistência</a>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Manutencoes({ lista }: { lista: Manutencao[] }) {
  if (!lista.length) return <Vazio texto="Nenhuma manutenção registrada." />;
  return (
    <ul className="space-y-3 px-5 py-6 text-sm text-slate-900">
      {lista.map((o) => (
        <li key={o.numero} className="rounded-xl border border-slate-300 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">OS #{o.numero}{o.equipamento ? ` · ${o.equipamento}` : ""}</div>
              <div className="text-xs font-medium text-slate-700">{[o.data_entrada && `Entrou em ${dataBR(o.data_entrada)}`, o.entregue_em ? `entregue em ${dataBR(o.entregue_em)}` : o.previsao && `previsão ${dataBR(o.previsao)}`, o.em_garantia && "na garantia"].filter(Boolean).join(" · ")}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.status === "entregue" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`}>{SITUACAO_OS[o.status] ?? o.status}</span>
          </div>
          {o.defeito && <p className="mt-2 text-sm"><b>Problema:</b> {o.defeito}</p>}
          {o.solucao && <p className="mt-1 text-sm"><b>O que foi feito:</b> {o.solucao}</p>}
          {Number(o.valor) > 0 && <p className="mt-1 text-sm text-slate-600">Valor: <b>{brl(Number(o.valor))}</b></p>}
        </li>
      ))}
    </ul>
  );
}

function Compras({ lista }: { lista: Compra[] }) {
  if (!lista.length) return <Vazio texto="Nenhuma compra registrada." />;
  return (
    <ul className="space-y-3 px-5 py-6 text-sm text-slate-900">
      {lista.map((p) => (
        <li key={p.numero} className="rounded-xl border border-slate-300 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-slate-900">Pedido #{p.numero} · {dataBR(p.data)}</div>
              <div className="text-xs font-semibold text-slate-700">{SITUACAO_PEDIDO[p.status] ?? p.status}{p.enviado_em ? ` · enviado em ${dataBR(p.enviado_em)}` : ""}</div>
            </div>
            <b className="whitespace-nowrap text-slate-950">{brl(Number(p.valor))}</b>
          </div>
          {!!p.itens?.length && (
            <ul className="mt-2 space-y-0.5 text-sm text-slate-900">
              {p.itens.map((i, k) => <li key={k} className="break-words">{Number(i.quantidade)}× {i.descricao}</li>)}
            </ul>
          )}
          {p.rastreio && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs">
              <Truck size={14} aria-hidden /> Rastreio{p.transportadora ? ` (${p.transportadora})` : ""}: <b className="select-all break-all">{p.rastreio}</b>
              <button type="button" className="font-semibold text-[#066d8c] print:hidden" onClick={() => navigator.clipboard.writeText(p.rastreio!).then(() => notify("Código copiado"), () => undefined)}>copiar</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Conta({ c, dia, token }: { c: Aberta; dia: string; token: string }) {
  const [copiado, setCopiado] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  // cartão (ou Pix) pela InfinitePay: o ERP cria o link na hora e a conta é baixada quando o pagamento cai
  async function pagarLink() {
    setAbrindo(true);
    try {
      const { url } = await callFunction<{ url: string }>("infinitepay", { acao: "pagar_conta", token, conta_id: c.id });
      if (DEMO) { notify(`Prévia: aqui abriria a página de pagamento da InfinitePay (${url})`); setAbrindo(false); return; }
      window.location.assign(url);
    } catch (e) {
      notifyError(e);
      setAbrindo(false);
    }
  }
  const pix = useMemo(() => (c.pix_chave ? pixCopiaECola({ chave: c.pix_chave, nome: c.pix_nome ?? "", cidade: c.pix_cidade ?? "", valor: Number(c.valor), txid: `MF${c.id.replace(/-/g, "").slice(0, 20)}` }) : null), [c]);
  const qr = useMemo(() => {
    if (!pix) return null;
    const q = qrcode(0, "M");
    q.addData(pix);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [pix]);
  const vencida = c.vencimento < dia;
  return (
    <div className="break-inside-avoid rounded-xl border border-slate-300 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-900">{c.descricao}</div>
          <div className={`text-sm ${vencida ? "font-semibold text-red-700" : "text-slate-700"}`}>{vencida ? `Venceu em ${dataBR(c.vencimento)}` : c.vencimento === dia ? "Vence hoje" : `Vence em ${dataBR(c.vencimento)}`}</div>
        </div>
        <div className="text-xl font-bold text-slate-900">{brl(c.valor)}</div>
      </div>
      {pix ? (
        <div className="mt-3 grid items-center gap-4 sm:grid-cols-[150px_1fr]">
          <div className="mx-auto w-[150px]" aria-label="QR Code do Pix" dangerouslySetInnerHTML={{ __html: qr ?? "" }} />
          <div className="min-w-0">
            <div className="mb-1 text-xs font-semibold text-slate-700">Pix copia e cola (o valor já vem preenchido)</div>
            <div className="break-all rounded-lg bg-slate-100 p-2 font-mono text-xs text-slate-800">{pix}</div>
            <button type="button" onClick={() => navigator.clipboard.writeText(pix).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2500); })}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#066d8c] px-3 py-2 text-sm font-semibold text-white print:hidden">
              {copiado ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar código Pix</>}
            </button>
          </div>
        </div>
      ) : null}
      {c.link && (
        <button type="button" onClick={pagarLink} disabled={abrindo}
          className="mt-3 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-lg bg-[#0B1F3A] px-4 py-2 font-semibold text-white disabled:opacity-70 sm:w-auto print:hidden">
          {abrindo ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />} Pagar com cartão (até 12x) ou Pix
        </button>
      )}
      {c.pagamento && <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700"><b>Como pagar:</b> {c.pagamento}</p>}
    </div>
  );
}

function Tela({ children }: { children: React.ReactNode }) {
  // página do cliente: sempre clara, independente do tema escolhido no ERP
  useEffect(() => {
    const raiz = document.documentElement;
    const antes = raiz.dataset.theme;
    // "publica" faz o aplicarTema (preferências do usuário logado, que chegam depois) manter o claro aqui
    raiz.dataset.publica = "1";
    raiz.dataset.theme = "light";
    return () => { delete raiz.dataset.publica; if (antes) raiz.dataset.theme = antes; };
  }, []);
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6 print:bg-white print:p-0" style={{ colorScheme: "light" }}>
      {DEMO && <button type="button" onClick={() => navigate("/financeiro")} className="mx-auto mb-3 block rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white print:hidden">← Prévia: voltar ao ERP</button>}
      {children}
    </div>
  );
}
