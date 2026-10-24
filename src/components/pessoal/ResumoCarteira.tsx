// Resumo da carteira (no alto da aba Dinheiro do painel pessoal), para entender de relance: quanto entrou, saiu e
// sobrou; o encontro de contas com cada empresa (o que foi e voltou, as contas da empresa pagas por você e o saldo);
// o que pode ser da empresa e falta decidir; as contas pessoais pagas por tipo; e o passo a passo para o contador.
import { useState } from "react";
import {
  ArrowDownCircle, ArrowLeftRight, ArrowRight, ArrowUpCircle, Building2, CheckCircle2, ChevronDown, Download, FileWarning, HelpCircle,
  Paperclip, PiggyBank, Receipt, Scale, Wallet, type LucideIcon,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { brl, dataBR, pl } from "@/lib/format";
import { NOME_TIPO_ENCONTRO, type SaldoEmpresa, type TipoEncontro } from "@/lib/encontroContas";
import type { ResultadoCard } from "@/lib/pessoalCards";

type Visual = (id: string) => { icone: LucideIcon; cor: string };
const COR_TIPO: Record<TipoEncontro, string> = { enviou: "#7c3aed", pagou: "#c2410c", recebeu: "#0284c7", prolabore: "#047857" };

/** Um número grande do alto, em cartão de cor lisa (fundo forte e texto branco: igual nos dois temas). */
function Grande({ rotulo, valor, sub, icone: Icone, cor }: { rotulo: string; valor: number; sub?: string; icone: LucideIcon; cor: string }) {
  return (
    <div className="min-w-0 rounded-2xl p-3 text-white shadow-card sm:p-4" style={{ background: cor }}>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold opacity-90"><span className="min-w-0 leading-tight">{rotulo}</span><Icone size={18} aria-hidden className="shrink-0" /></div>
      <div className="num mt-1 break-words text-lg font-bold leading-tight tracking-tight sm:text-2xl">{brl(valor)}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug opacity-85">{sub}</div>}
    </div>
  );
}

function Linha({ tipo, valor, sinal }: { tipo: TipoEncontro; valor: number; sinal: "+" | "−" | "" }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_TIPO[tipo] }} aria-hidden />
      <span className="min-w-0 flex-1 text-slate-700">{NOME_TIPO_ENCONTRO[tipo]}</span>
      <span className={`num shrink-0 font-semibold ${valor ? "text-fg" : "text-slate-400"}`}>{sinal && valor ? `${sinal} ` : ""}{brl(valor)}</span>
    </div>
  );
}

function CartaoEmpresa({ s, onVerComprovante }: { s: SaldoEmpresa; onVerComprovante: (c: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const total = Math.max(1, s.enviou + s.pagou + s.recebeu);
  const frase = Math.abs(s.saldo) < 0.01 ? "Tudo acertado no período"
    : s.saldo > 0 ? "A empresa deve a você" : "Você recebeu a mais da empresa";
  const tom = Math.abs(s.saldo) < 0.01 ? "text-emerald-700" : s.saldo > 0 ? "text-violet-700" : "text-sky-700";
  return (
    <div className="cartao flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fixo-violet-600 text-white"><Building2 size={18} aria-hidden /></span>
        <div className="min-w-0 flex-1 basis-40">
          <div className="font-bold leading-tight text-fg">{s.nome}</div>
          <div className={`text-xs font-semibold ${tom}`}>{frase}</div>
        </div>
        <div className={`num ml-auto shrink-0 text-right text-xl font-bold ${tom}`}>{brl(Math.abs(s.saldo))}</div>
      </div>
      {/* barra: o que foi para a empresa (roxo e laranja) e o que voltou (azul) */}
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {(["enviou", "pagou", "recebeu"] as const).map((t) => s[t] > 0 && <span key={t} style={{ width: `${(s[t] / total) * 100}%`, background: COR_TIPO[t] }} />)}
      </div>
      <div className="space-y-1.5">
        <Linha tipo="enviou" valor={s.enviou} sinal="+" />
        <Linha tipo="pagou" valor={s.pagou} sinal="+" />
        <Linha tipo="recebeu" valor={s.recebeu} sinal="−" />
        <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5 text-sm font-bold">
          <Scale size={14} className="shrink-0 text-slate-500" aria-hidden />
          <span className="min-w-0 flex-1 text-fg">Saldo</span>
          <span className={`num shrink-0 ${tom}`}>{brl(s.saldo)}</span>
        </div>
        {s.prolabore > 0 && <div className="text-xs text-slate-500">À parte: <b className="num">{brl(s.prolabore)}</b> de pró-labore (não abate o saldo).</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{s.itens.length} {pl(s.itens.length, "lançamento", "lançamentos")}</span>
        {s.semComprovante > 0
          ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800"><FileWarning size={12} aria-hidden /> {s.semComprovante} sem comprovante</span>
          : <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800"><CheckCircle2 size={12} aria-hidden /> todos com comprovante</span>}
        <button type="button" className="link-acao ml-auto inline-flex items-center gap-1" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
          {aberto ? "Esconder" : "Ver um por um"} <ChevronDown size={14} className={aberto ? "rotate-180" : ""} aria-hidden />
        </button>
      </div>
      {aberto && (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
          {s.itens.map((i) => (
            <li key={i.lanc.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_TIPO[i.tipo] }} title={NOME_TIPO_ENCONTRO[i.tipo]} aria-hidden />
              <span className="w-16 shrink-0 text-slate-500">{dataBR(i.lanc.data)}</span>
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate font-semibold text-fg">{i.lanc.descricao}</span>
                <span className="text-2xs text-slate-500">{NOME_TIPO_ENCONTRO[i.tipo]}</span>
              </span>
              {i.lanc.comprovante
                ? <button type="button" className="botao-icone h-7 w-7" onClick={() => onVerComprovante(i.lanc.comprovante!)} aria-label={`Ver o comprovante de ${i.lanc.descricao}`}><Paperclip size={13} /></button>
                : i.tipo !== "prolabore" && <span className="shrink-0 rounded bg-amber-100 px-1 text-2xs font-semibold text-amber-800">sem comprovante</span>}
              <span className="num ml-auto shrink-0 font-bold text-fg">{brl(i.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PASSOS = [
  { titulo: "Confira cada lançamento", texto: "Abra cada empresa em \"Ver um por um\" e confira se é mesmo dela. Anexe o comprovante que faltar (Editar → comprovante)." },
  { titulo: "Decida o que pode ser da empresa", texto: "Imposto, pedágio, anúncio, compras: toque no card e use \"Lançar na MF\" nos que forem da empresa. O resto fica como gasto pessoal." },
  { titulo: "Baixe a planilha", texto: "O botão \"Baixar para o contador\" leva o saldo de cada empresa, os lançamentos um por um e as contas pessoais." },
  { titulo: "O contador dá o nome certo", texto: "Para cada saldo ele confirma se é aporte, empréstimo (mútuo), reembolso, pró-labore ou lucros, e como lançar na contabilidade." },
];

export function ResumoCarteira({ rotulo, entrou, saiu, resultado, disponivel, cartoes, encontro, grupos, visual, onAbrirCard, onBaixar, onVerComprovante }: {
  rotulo: string; entrou: number; saiu: number; resultado: number; disponivel: number; cartoes: number;
  encontro: SaldoEmpresa[];
  /** os cards do período, já separados: os que podem ser da empresa e os pessoais */
  grupos: { talvez: ResultadoCard[]; pessoais: ResultadoCard[] };
  visual: Visual; onAbrirCard: (id: string) => void; onBaixar: () => void; onVerComprovante: (c: string) => void;
}) {
  const devem = encontro.reduce((t, s) => t + s.saldo, 0);
  const talvezTotal = grupos.talvez.reduce((t, g) => t + g.saiu, 0);
  const pessoalTotal = grupos.pessoais.reduce((t, g) => t + g.saiu, 0);
  const maiorPessoal = Math.max(1, ...grupos.pessoais.map((g) => g.saiu));
  return (
    <div className="mb-4 space-y-4">
      {/* 1. os números do período */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Grande rotulo="Disponível hoje" valor={disponivel} icone={Wallet} cor="#0f766e" sub={cartoes ? `cartões em aberto: ${brl(-cartoes)}` : "nas contas, sem os cartões"} />
        <Grande rotulo="Entrou no período" valor={entrou} icone={ArrowUpCircle} cor="#047857" sub={rotulo} />
        <Grande rotulo="Saiu no período" valor={saiu} icone={ArrowDownCircle} cor="#b91c1c" sub={entrou ? `${Math.round((saiu / entrou) * 100)}% do que entrou` : rotulo} />
        <Grande rotulo={resultado >= 0 ? "Sobrou no período" : "Faltou no período"} valor={resultado} icone={PiggyBank} cor={resultado >= 0 ? "#1d4ed8" : "#c2410c"} sub={resultado >= 0 ? "entrou mais do que saiu" : "saiu mais do que entrou"} />
      </div>

      {/* 2. o encontro de contas com as empresas */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-fixo-violet-600 text-white"><ArrowLeftRight size={22} aria-hidden /></span>
          <div className="mr-auto min-w-0 flex-1 basis-64">
            <h2 className="text-lg font-bold text-fg">Você e as suas empresas</h2>
            <p className="text-sm text-slate-600">O que foi da sua conta para cada empresa, as contas dela que você pagou e o que ela devolveu. No fim, quanto cada uma deve a você.</p>
          </div>
          <Button onClick={onBaixar}><Download size={16} /> Baixar para o contador</Button>
        </div>
        {!encontro.length ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Nenhuma transferência com as empresas neste período. Os Pix e TED com a MF e as empresas cadastradas em Entre contas e sócios aparecem aqui sozinhos; as contas da empresa pagas por você entram pelas Regras dos cards.</p>
        ) : <>
          {encontro.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900">
              <Scale size={16} className="shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">Somando as {encontro.length} empresas: <b className="num">{brl(Math.abs(devem))}</b> {devem >= 0 ? "a receber delas" : "recebidos a mais delas"} no período.</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {encontro.map((s) => <CartaoEmpresa key={s.id} s={s} onVerComprovante={onVerComprovante} />)}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <ArrowRight size={12} aria-hidden /> Saldo = você mandou + contas da empresa pagas por você − a empresa mandou para você. Aporte, empréstimo (mútuo), reembolso ou lucros: o contador confirma.
          </p>
        </>}
      </Card>

      {/* 3. o que falta decidir e as contas pessoais */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0 p-4">
          <h2 className="flex items-center gap-2 font-bold text-fg"><HelpCircle size={18} className="text-amber-600" aria-hidden /> Pode ser da empresa: você decide</h2>
          <p className="mb-3 text-xs text-slate-500">Pagos pela sua conta no período ({brl(talvezTotal)}). Toque para ver um por um e usar "Lançar na MF" nos que forem da empresa.</p>
          {!grupos.talvez.length ? <p className="text-sm text-slate-500">Nada para decidir neste período.</p> : (
            <ul className="space-y-2">
              {grupos.talvez.map((g) => {
                const { icone: Icone, cor } = visual(g.id);
                return (
                  <li key={g.id}>
                    <button type="button" onClick={() => onAbrirCard(g.id)} className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-left hover:shadow-card">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white" style={{ background: cor }}><Icone size={16} aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-fg">{g.nome}</span>
                        <span className="text-2xs text-slate-600">{g.qtd} {pl(g.qtd, "lançamento", "lançamentos")} · conferir</span>
                      </span>
                      <span className="num shrink-0 font-bold text-fg">{brl(g.saiu)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="min-w-0 p-4">
          <h2 className="flex items-center gap-2 font-bold text-fg"><Receipt size={18} className="text-sky-700" aria-hidden /> Suas contas pessoais pagas</h2>
          <p className="mb-3 text-xs text-slate-500">{brl(pessoalTotal)} no período, por tipo. Estes ficam com você (não vão para a empresa); os marcados com IR o contador usa na sua declaração.</p>
          {!grupos.pessoais.length ? <p className="text-sm text-slate-500">Nenhuma conta pessoal reconhecida no período.</p> : (
            <ul className="space-y-2">
              {grupos.pessoais.map((g) => {
                const { icone: Icone, cor } = visual(g.id);
                const ir = /\bIR\b|declaração/.test(`${g.nota ?? ""} ${g.aviso ?? ""}`);
                return (
                  <li key={g.id}>
                    <button type="button" onClick={() => onAbrirCard(g.id)} className="block w-full text-left" title={g.nota ?? g.aviso ?? g.dica}>
                      <span className="flex items-center gap-2 text-sm">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white" style={{ background: cor }}><Icone size={14} aria-hidden /></span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-fg">{g.nome}</span>
                        {ir && <span className="shrink-0 rounded bg-sky-100 px-1.5 text-2xs font-bold text-sky-800">IR</span>}
                        <span className="num shrink-0 font-semibold text-fg">{brl(g.saiu)}</span>
                      </span>
                      <span className="ml-9 mt-1 block h-1.5 rounded-full bg-slate-100"><span className="block h-1.5 rounded-full" style={{ width: `${Math.max(3, (g.saiu / maiorPessoal) * 100)}%`, background: cor }} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* 4. como fazer com o contador */}
      <Card className="p-4">
        <h2 className="mb-3 font-bold text-fg">Como vamos acertar com o contador</h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="flex gap-3 rounded-xl bg-slate-50 p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
              <span className="min-w-0"><span className="block text-sm font-bold text-fg">{p.titulo}</span><span className="text-xs text-slate-600">{p.texto}</span></span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
