// Painel pessoal (pela carteira no fim do menu, só para o administrador): as contas pessoais do dono — banco, cartão,
// investimento —, separadas da empresa. Nada daqui entra no DRE, na conciliação, nos painéis da empresa nem no pacote
// do contador; no banco, cada linha é de quem a criou e só essa pessoa lê. Nada é apagado: lançamento errado é anulado.
import { useMemo, useState, type FormEvent } from "react";
import { ArrowDownCircle, ArrowUpCircle, CalendarClock, Check, CreditCard, FileUp, Landmark, Lock, Pencil, Plus, Search, Undo2, Wallet } from "lucide-react";
import { Button, CampoMes, Card, Field, MaisAcoes, Modal, nomeMes, PageHeader, Stat } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { lerExtrato } from "@/lib/extrato";
import { lerExtratoPdf } from "@/lib/extratoPdf";
import { numeroBR } from "@/lib/fichaCadastral";
import {
  CATEGORIAS, CORES_CONTA, NOME_TIPO_CONTA, TIPOS_CONTA, categoriaDe, proximos, resumoMes, saldoConta,
  type ContaPessoal, type LancPessoal, type TipoConta,
} from "@/lib/pessoal";

const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const corDe = (c: string | undefined) => CORES_CONTA[c ?? ""] ?? CORES_CONTA.sky;
const CORES_BARRA = ["#0284c7", "#7c3aed", "#047857", "#c2410c", "#be185d", "#b45309", "#0f766e", "#475569"];

export default function Pessoal() {
  const invalidar = useInvalidate();
  const { data: contas = [], isLoading } = useRows<ContaPessoal>("pessoal_contas", { order: "ordem", ascending: true });
  const { data: lancs = [] } = useRows<LancPessoal>("pessoal_lancamentos", { order: "data", ascending: false });
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [conta, setConta] = useState("");
  const [busca, setBusca] = useState("");
  const [editConta, setEditConta] = useState<Partial<ContaPessoal> | null>(null);
  const [editLanc, setEditLanc] = useState<Partial<LancPessoal> | null>(null);
  const [importar, setImportar] = useState(false);

  const ativas = contas.filter((c) => c.ativa);
  const nomeConta = (id: string) => contas.find((c) => c.id === id);
  const saldos = useMemo(() => new Map(contas.map((c) => [c.id, saldoConta(c, lancs)])), [contas, lancs]);
  const disponivel = ativas.filter((c) => c.tipo !== "cartao").reduce((t, c) => t + (saldos.get(c.id) ?? 0), 0);
  const cartoes = ativas.filter((c) => c.tipo === "cartao").reduce((t, c) => t + (saldos.get(c.id) ?? 0), 0);
  const resumo = useMemo(() => resumoMes(lancs.filter((l) => !conta || l.conta_id === conta), mes), [lancs, mes, conta]);
  const prox = useMemo(() => proximos(lancs, hoje()).filter((l) => l.data <= somar(hoje(), 30)), [lancs]);
  const lista = lancs.filter((l) => l.data.startsWith(mes) && (!conta || l.conta_id === conta)
    && (!busca.trim() || [l.descricao, l.categoria].some((x) => sem(x).includes(sem(busca.trim())))));
  const maiorCat = Math.max(1, ...resumo.categorias.map((c) => c.valor));

  async function gravar(tabela: "pessoal_contas" | "pessoal_lancamentos", linha: Record<string, unknown>, ok: string) {
    const { id, ...resto } = linha;
    const { error } = id ? await supabase.from(tabela).update(resto).eq("id", id as string) : await supabase.from(tabela).insert(resto);
    if (error) { notifyError(error); return false; }
    notify(ok);
    invalidar("pessoal_contas", "pessoal_lancamentos");
    return true;
  }
  const anular = (l: LancPessoal) => gravar("pessoal_lancamentos", { id: l.id, anulado: !l.anulado }, l.anulado ? "Lançamento de volta" : "Lançamento anulado");
  const pagar = (l: LancPessoal) => gravar("pessoal_lancamentos", { id: l.id, situacao: "realizado", data: l.data > hoje() ? hoje() : l.data }, "Marcado como pago");

  return (
    <div>
      <PageHeader title="Painel pessoal" subtitle="Suas contas pessoais, separadas da empresa"
        actions={<>
          <MaisAcoes>
            <Button variant="secondary" onClick={() => setEditConta({ tipo: "corrente", cor: Object.keys(CORES_CONTA)[contas.length % 8], saldo_inicial: 0, saldo_inicial_em: hoje(), ativa: true, ordem: contas.length })}><Landmark size={16} /> Nova conta</Button>
            <Button variant="secondary" onClick={() => setImportar(true)} disabled={!ativas.length}><FileUp size={16} /> Importar extrato (OFX, CSV ou PDF)</Button>
          </MaisAcoes>
          <Button onClick={() => setEditLanc({ conta_id: conta || ativas[0]?.id, data: hoje(), situacao: "realizado", valor: undefined })} disabled={!ativas.length}><Plus size={16} /> Lançar</Button>
        </>} />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-900">
        <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>Só você vê este painel. Nada daqui entra no DRE, na conciliação, nos painéis da empresa nem no que vai para o contador. Não precisa de senha do banco: só o nome da conta e o saldo.</span>
      </div>

      {!isLoading && !contas.length ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#7c3aed] text-white"><Wallet size={28} aria-hidden /></span>
          <h2 className="text-lg font-bold text-fg">Cadastre as suas contas</h2>
          <p className="max-w-md text-sm text-slate-600">Conta corrente, poupança, cartão ou investimento: o nome, o banco e o saldo de hoje. Depois é lançar ou importar o extrato do banco.</p>
          <Button onClick={() => setEditConta({ tipo: "corrente", cor: "sky", saldo_inicial: 0, saldo_inicial_em: hoje(), ativa: true, ordem: 0 })}><Plus size={16} /> Primeira conta</Button>
        </Card>
      ) : <>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Disponível nas contas" valor={brl(disponivel)} icon={Wallet} tom={disponivel < 0 ? "critico" : "bom"} sub={`${ativas.filter((c) => c.tipo !== "cartao").length} ${pl(ativas.length, "conta", "contas")}`} />
          <Stat label="Cartões (fatura em aberto)" valor={brl(-cartoes)} icon={CreditCard} tom={cartoes < 0 ? "atencao" : "neutro"} sub={`${ativas.filter((c) => c.tipo === "cartao").length} ${pl(ativas.filter((c) => c.tipo === "cartao").length, "cartão", "cartões")}`} />
          <Stat label={`Entrou · ${nomeMes(mes)}`} valor={brl(resumo.entrou)} icon={ArrowUpCircle} tom="info" sub="sem transferências entre as suas contas" />
          <Stat label={`Saiu · ${nomeMes(mes)}`} valor={brl(resumo.saiu)} icon={ArrowDownCircle} tom={resumo.saiu > resumo.entrou ? "atencao" : "neutro"}
            sub={resumo.entrou ? `${Math.round((resumo.saiu / resumo.entrou) * 100)}% do que entrou` : undefined} />
        </div>

        {/* as contas, cada uma com a sua cor */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {contas.map((c) => {
            const r = resumoMes(lancs.filter((l) => l.conta_id === c.id), mes);
            const saldo = saldos.get(c.id) ?? 0;
            return (
              <div key={c.id} className={`overflow-hidden rounded-2xl text-white shadow-card ${c.ativa ? "" : "opacity-60"}`} style={{ background: `linear-gradient(135deg, ${corDe(c.cor)}, #0f172a)` }}>
                <button type="button" onClick={() => setConta(conta === c.id ? "" : c.id)} aria-pressed={conta === c.id}
                  className={`block w-full p-4 text-left ${conta === c.id ? "ring-4 ring-inset ring-white/60" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-bold">{c.nome}</div>
                      <div className="truncate text-xs opacity-80">{[NOME_TIPO_CONTA[c.tipo], c.banco].filter(Boolean).join(" · ")}{!c.ativa && " · encerrada"}</div>
                    </div>
                    {c.tipo === "cartao" ? <CreditCard size={20} className="shrink-0 opacity-80" aria-hidden /> : <Landmark size={20} className="shrink-0 opacity-80" aria-hidden />}
                  </div>
                  <div className="num mt-3 text-2xl font-bold">{brl(c.tipo === "cartao" ? -saldo : saldo)}</div>
                  <div className="text-xs opacity-80">{c.tipo === "cartao" ? `fatura em aberto${c.limite ? ` · limite ${brl(c.limite)}` : ""}` : "saldo de hoje"}</div>
                  <div className="mt-2 flex gap-3 text-xs"><span>▲ {brl(r.entrou)}</span><span>▼ {brl(r.saiu)}</span></div>
                </button>
                <div className="flex border-t border-white/20 text-xs font-semibold">
                  <button type="button" className="flex-1 py-2 hover:bg-white/10" onClick={() => setEditLanc({ conta_id: c.id, data: hoje(), situacao: "realizado" })}>Lançar</button>
                  <button type="button" className="flex-1 border-l border-white/20 py-2 hover:bg-white/10" onClick={() => setEditConta(c)}>Editar</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-fg">Para onde foi o dinheiro</h2>
              <CampoMes value={mes} onChange={(v) => setMes(v || hoje().slice(0, 7))} rotulo="Mês" />
            </div>
            {!resumo.categorias.length ? <p className="text-sm text-slate-500">Nenhuma saída em {nomeMes(mes)}.</p> : (
              <ul className="space-y-2">
                {resumo.categorias.map((c, i) => (
                  <li key={c.nome}>
                    <div className="flex justify-between gap-2 text-sm"><span className="font-semibold text-fg">{c.nome}</span><span className="num">{brl(c.valor)}</span></div>
                    <div className="mt-1 h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (c.valor / maiorCat) * 100)}%`, background: CORES_BARRA[i % CORES_BARRA.length] }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-fg"><CalendarClock size={18} aria-hidden /> Próximos 30 dias <span className="text-sm font-normal text-slate-500">· previstos</span></h2>
            {!prox.length ? <p className="text-sm text-slate-500">Nada previsto. Lance as contas a pagar e a receber como "previsto" para elas aparecerem aqui.</p> : (
              <ul className="divide-y divide-slate-100">
                {prox.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="w-14 shrink-0 text-xs font-semibold text-slate-500">{dataBR(l.data).slice(0, 5)}</span>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corDe(nomeConta(l.conta_id)?.cor) }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-fg">{l.descricao}</span>
                    <span className={`num shrink-0 font-semibold ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</span>
                    <button type="button" onClick={() => pagar(l)} className="shrink-0 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100" title="Já foi pago ou recebido">
                      <Check size={13} className="inline" aria-hidden /> Feito
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-bold text-fg">Lançamentos <span className="text-sm font-normal text-slate-500">· {nomeMes(mes)}{conta ? ` · ${nomeConta(conta)?.nome}` : ""} · {lista.length}</span></h2>
          <label className="relative w-full sm:w-64">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input w-full pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar lançamento" aria-label="Buscar lançamento" />
          </label>
          {conta && <button type="button" className="text-sm font-semibold text-brand hover:underline" onClick={() => setConta("")}>Todas as contas</button>}
        </div>
        <Card className="overflow-hidden">
          {!lista.length ? <p className="p-4 text-sm text-slate-500">Nenhum lançamento.</p> : (
            <ul className="divide-y divide-slate-100">
              {lista.slice(0, 300).map((l) => {
                const c = nomeConta(l.conta_id);
                return (
                  <li key={l.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm ${l.anulado ? "opacity-50" : ""}`}>
                    <span className="w-12 shrink-0 text-xs font-semibold text-slate-500">{dataBR(l.data).slice(0, 5)}</span>
                    <span className="min-w-0 flex-1 basis-48">
                      <span className={`block truncate font-semibold text-fg ${l.anulado ? "line-through" : ""}`}>{l.descricao}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: corDe(c?.cor) }} aria-hidden />{c?.nome ?? "—"}</span>
                        {l.categoria && <span className="rounded bg-slate-100 px-1.5">{l.categoria}</span>}
                        {l.situacao === "previsto" && <span className="rounded bg-amber-100 px-1.5 text-amber-800">previsto</span>}
                        {l.anulado && <span className="rounded bg-slate-200 px-1.5">anulado</span>}
                      </span>
                    </span>
                    <span className={`num shrink-0 font-bold ${l.valor < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(l.valor)}</span>
                    <span className="flex shrink-0 gap-1">
                      <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => setEditLanc(l)} aria-label={`Editar ${l.descricao}`}><Pencil size={15} /></button>
                      <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={() => anular(l)}
                        aria-label={l.anulado ? `Trazer de volta ${l.descricao}` : `Anular ${l.descricao}`} title={l.anulado ? "Trazer de volta" : "Anular (não conta no saldo)"}>{l.anulado ? <Undo2 size={15} /> : <span className="text-base leading-none">⊘</span>}</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </>}

      {editConta && <ContaModal conta={editConta} onClose={() => setEditConta(null)} onGravar={async (c) => (await gravar("pessoal_contas", c, c.id ? "Conta alterada" : "Conta criada")) && setEditConta(null)} />}
      {editLanc && <LancModal lanc={editLanc} contas={ativas} onClose={() => setEditLanc(null)} onGravar={async (l) => (await gravar("pessoal_lancamentos", l, l.id ? "Lançamento alterado" : "Lançado")) && setEditLanc(null)} />}
      {importar && <ImportarModal contas={ativas} onClose={() => setImportar(false)} onFeito={() => { invalidar("pessoal_lancamentos"); setImportar(false); }} />}
    </div>
  );
}

function somar(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function ContaModal({ conta, onClose, onGravar }: { conta: Partial<ContaPessoal>; onClose: () => void; onGravar: (c: Record<string, unknown>) => void }) {
  const [c, setC] = useState({ ...conta, saldo_txt: conta.saldo_inicial != null ? String(conta.saldo_inicial).replace(".", ",") : "0", limite_txt: conta.limite != null ? String(conta.limite).replace(".", ",") : "" });
  const set = (k: string, v: unknown) => setC((x) => ({ ...x, [k]: v }));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    onGravar({
      id: conta.id, nome: String(c.nome ?? "").trim(), tipo: c.tipo, banco: String(c.banco ?? "").trim() || null, cor: c.cor,
      saldo_inicial: numeroBR(c.saldo_txt) ?? 0, saldo_inicial_em: c.saldo_inicial_em, limite: c.tipo === "cartao" ? numeroBR(c.limite_txt) : null,
      ativa: c.ativa !== false, ordem: c.ordem ?? 0,
    });
  };
  return (
    <Modal open onClose={onClose} title={conta.id ? "Editar conta" : "Nova conta pessoal"}>
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome (como você chama a conta)"><input className="input" value={c.nome ?? ""} onChange={(e) => set("nome", e.target.value)} required minLength={2} maxLength={60} placeholder="Ex.: Nubank pessoal" autoFocus /></Field>
          <Field label="Banco"><input className="input" value={c.banco ?? ""} onChange={(e) => set("banco", e.target.value)} maxLength={60} placeholder="Ex.: Nubank, Itaú, Inter" /></Field>
          <Field label="Tipo">
            <select className="input" value={c.tipo} onChange={(e) => set("tipo", e.target.value as TipoConta)}>{TIPOS_CONTA.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
          </Field>
          <Field label={c.tipo === "cartao" ? "Fatura em aberto hoje (R$)" : "Saldo de hoje (R$)"}><input className="input" inputMode="decimal" value={c.saldo_txt} onChange={(e) => set("saldo_txt", e.target.value)} placeholder="0,00" /></Field>
          <Field label="Saldo na data de"><input className="input" type="date" value={c.saldo_inicial_em ?? hoje()} onChange={(e) => set("saldo_inicial_em", e.target.value)} required /></Field>
          {c.tipo === "cartao" && <Field label="Limite do cartão (R$)"><input className="input" inputMode="decimal" value={c.limite_txt} onChange={(e) => set("limite_txt", e.target.value)} placeholder="opcional" /></Field>}
        </div>
        {c.tipo === "cartao" && <p className="text-xs text-slate-500">No cartão, informe a fatura como número positivo; as compras entram como saída e o pagamento da fatura como entrada no cartão.</p>}
        <Field label="Cor">
          <div className="flex flex-wrap gap-2">
            {Object.entries(CORES_CONTA).map(([nome, hex]) => (
              <button key={nome} type="button" onClick={() => set("cor", nome)} aria-label={`Cor ${nome}`} aria-pressed={c.cor === nome}
                className={`h-8 w-8 rounded-full ${c.cor === nome ? "ring-4 ring-brand/50" : ""}`} style={{ background: hex }} />
            ))}
          </div>
        </Field>
        {conta.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.ativa === false} onChange={(e) => set("ativa", !e.target.checked)} /> Conta encerrada (fica no histórico)</label>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}

function LancModal({ lanc, contas, onClose, onGravar }: { lanc: Partial<LancPessoal>; contas: ContaPessoal[]; onClose: () => void; onGravar: (l: Record<string, unknown>) => void }) {
  const [l, setL] = useState({ ...lanc, sentido: (lanc.valor ?? -1) < 0 ? "saida" : "entrada", valor_txt: lanc.valor != null ? String(Math.abs(lanc.valor)).replace(".", ",") : "" });
  const set = (k: string, v: unknown) => setL((x) => ({ ...x, [k]: v }));
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const v = numeroBR(l.valor_txt);
    if (!v) return notifyError(new Error("Informe o valor"));
    const descricao = String(l.descricao ?? "").trim();
    onGravar({
      id: lanc.id, conta_id: l.conta_id, data: l.data, descricao, valor: l.sentido === "saida" ? -Math.abs(v) : Math.abs(v),
      categoria: l.categoria || categoriaDe(descricao), situacao: l.situacao ?? "realizado",
    });
  };
  return (
    <Modal open onClose={onClose} title={lanc.id ? "Editar lançamento" : "Lançar"}>
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Entrada ou saída">
          {([["saida", "Saída (gastei)", "bg-solido-vermelho"], ["entrada", "Entrada (recebi)", "bg-solido-verde"]] as const).map(([v, nome, cor]) => (
            <button key={v} type="button" aria-pressed={l.sentido === v} onClick={() => set("sentido", v)}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold ${l.sentido === v ? `${cor} text-white` : "bg-slate-100 text-slate-600"}`}>{nome}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Descrição" className="sm:col-span-2"><input className="input" value={l.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} required maxLength={200} autoFocus placeholder="Ex.: Mercado, aluguel, pró-labore" /></Field>
          <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={l.valor_txt} onChange={(e) => set("valor_txt", e.target.value)} required placeholder="0,00" /></Field>
          <Field label="Data"><input className="input" type="date" value={l.data ?? hoje()} onChange={(e) => set("data", e.target.value)} required /></Field>
          <Field label="Conta">
            <select className="input" value={l.conta_id ?? ""} onChange={(e) => set("conta_id", e.target.value)} required>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </Field>
          <Field label="Categoria">
            <select className="input" value={l.categoria ?? ""} onChange={(e) => set("categoria", e.target.value)}>
              <option value="">Automática ({categoriaDe(l.descricao)})</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.situacao === "previsto"} onChange={(e) => set("situacao", e.target.checked ? "previsto" : "realizado")} /> Ainda vai acontecer (previsto: não mexe no saldo até marcar como feito)</label>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
      </form>
    </Modal>
  );
}

function ImportarModal({ contas, onClose, onFeito }: { contas: ContaPessoal[]; onClose: () => void; onFeito: () => void }) {
  const [conta, setConta] = useState(contas[0]?.id ?? "");
  const [linhas, setLinhas] = useState<{ data: string; valor: number; descricao: string; identificador: string }[] | null>(null);
  const [nome, setNome] = useState("");
  const [gravando, setGravando] = useState(false);
  const [pdf, setPdf] = useState<{ ignoradas: number } | null>(null);
  async function ler(f: File | undefined) {
    if (!f) return;
    try {
      setNome(f.name);
      // PDF (Itaú e outros que só entregam assim): lido aqui no navegador, o arquivo não sai do aparelho
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        const r = await lerExtratoPdf(f);
        setPdf({ ignoradas: r.ignoradas });
        setLinhas(r.linhas);
        return;
      }
      setPdf(null);
      const r = await lerExtrato(f);
      setLinhas(r.linhas.filter((x) => x.valor && x.data).map((x) => ({ data: x.data, valor: x.valor, descricao: x.descricao || "Lançamento do extrato", identificador: x.identificador })));
    } catch (e) { notifyError(e); }
  }
  async function gravar() {
    if (!linhas?.length || !conta) return;
    setGravando(true);
    const novas = linhas.map((x) => ({ conta_id: conta, data: x.data, descricao: x.descricao.slice(0, 200), valor: x.valor, categoria: categoriaDe(x.descricao), situacao: "realizado", identificador: x.identificador.slice(0, 200) }));
    const { error } = await supabase.from("pessoal_lancamentos").upsert(novas, { onConflict: "conta_id,identificador", ignoreDuplicates: true });
    setGravando(false);
    if (error) return notifyError(error);
    notify(`Extrato importado: ${novas.length} ${pl(novas.length, "linha lida", "linhas lidas")} (as que já existiam não entram de novo)`);
    onFeito();
  }
  const entradas = (linhas ?? []).filter((x) => x.valor > 0).reduce((t, x) => t + x.valor, 0);
  const saidas = -(linhas ?? []).filter((x) => x.valor < 0).reduce((t, x) => t + x.valor, 0);
  return (
    <Modal open onClose={onClose} title="Importar extrato pessoal">
      <div className="space-y-3">
        <Field label="Conta"><select className="input" value={conta} onChange={(e) => setConta(e.target.value)}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
        <Field label="Arquivo do banco (OFX, CSV ou PDF)"><input type="file" accept=".ofx,.csv,.txt,.pdf,application/pdf" className="input" onChange={(e) => ler(e.target.files?.[0])} /></Field>
        {linhas && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <b>{nome}</b>: {linhas.length} {pl(linhas.length, "lançamento", "lançamentos")} · entradas {brl(entradas)} · saídas {brl(saidas)}.
            <div className="mt-1 text-xs text-slate-500">A categoria vem do texto de cada linha; dá para trocar depois. Importar o mesmo extrato de novo não repete nada.</div>
          </div>
        )}
        {linhas && pdf && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <b>Extrato em PDF:</b> confira as primeiras linhas antes de importar{pdf.ignoradas ? ` (${pdf.ignoradas} linhas de saldo e totais ficaram de fora)` : ""}.
            {linhas.length === 0 && <span className="block">Nenhum lançamento reconhecido: o PDF pode ser de outro modelo. Use o OFX do banco, se houver.</span>}
            <ul className="mt-2 max-h-48 divide-y divide-amber-200 overflow-y-auto text-xs">
              {linhas.slice(0, 30).map((x) => (
                <li key={x.identificador} className="flex gap-2 py-1"><span className="num shrink-0">{dataBR(x.data)}</span><span className="min-w-0 flex-1 truncate">{x.descricao}</span>
                  <span className={`num shrink-0 font-semibold ${x.valor < 0 ? "text-red-700" : "text-emerald-700"}`}>{brl(x.valor)}</span></li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={gravar} disabled={!linhas?.length || gravando}>{gravando ? "Importando…" : "Importar"}</Button></div>
      </div>
    </Modal>
  );
}
