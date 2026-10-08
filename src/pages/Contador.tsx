// Painel do contador: fechamento mensal por unidade, com o pacote de XML e planilhas,
// envio automático, mês travado depois de fechado e conversa com o financeiro.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Download, Lock, LockOpen, Mail, MessageSquare, Send } from "lucide-react";
import { Badge, Button, Card, PageHeader, Section } from "@/components/ui";
import { Anexos } from "@/components/Anexos";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { callFunction, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, docFormat } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { buracosNumeracao } from "@/lib/compliance";

type Fechamento = { id: string; unidade_id: string; competencia: string; status: string; enviado_em: string | null; fechado_em: string | null; arquivo_caminho: string | null; observacoes: string | null };
type Nota = { id: string; unidade_id: string | null; status: string; numero: string | null; serie: string | null; valor_total: number; created_at: string; payload?: { items?: Record<string, any>[] } | null };
type Recebida = { id: string; unidade_id: string | null; valor_total: number; data_emissao: string | null; manifestacao: string | null; situacao: string | null; emitente_nome: string; itens?: { cfop?: string; valor_total?: number }[] | null };
type Conta = { unidade_id: string | null; status: string; valor: number; valor_pago: number | null; data_pagamento: string | null };
type Msg = { id: string; unidade_id: string | null; competencia: string; autor: string; autor_nome: string | null; texto: string; resolvida: boolean; created_at: string };

const mesAnterior = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
const noMes = (d: string | null | undefined, comp: string) => !!d && d.slice(0, 7) === comp;
const nomeMes = (comp: string) => { const t = new Date(`${comp}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); };

export default function Contador() {
  const { unidades } = useUnidade();
  const { papel } = usePerfil();
  const { data: cfg } = useConfig();
  const [comp, setComp] = useState(mesAnterior());
  const [unid, setUnid] = useState<string>("");
  useEffect(() => { if (!unid && unidades.length) setUnid(unidades.find((u) => u.matriz)?.id ?? unidades[0].id); }, [unidades, unid]);
  const contador = papel === "contador";

  return (
    <div>
      <PageHeader title="Painel do contador" subtitle={contador
        ? "Tudo o que você precisa para o fechamento: notas, XML, planilhas e conversa com o financeiro da MF."
        : `Fechamento mensal com o contador${cfg?.contador_nome ? ` (${cfg.contador_nome})` : ""}. ${cfg?.contador_envio_auto ? `Envio automático todo dia ${cfg.contador_envio_dia}.` : "Envio automático desligado (Configurações → Contador)."}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="month" aria-label="Competência" className="input w-auto" value={comp} max={new Date().toISOString().slice(0, 7)} onChange={(e) => e.target.value && setComp(e.target.value)} />
        <div className="flex gap-1.5">
          {unidades.map((u) => (
            <button key={u.id} type="button" onClick={() => setUnid(u.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${unid === u.id ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600"}`}>{u.nome}</button>
          ))}
        </div>
      </div>
      {unid && <Competencia key={`${unid}-${comp}`} unidadeId={unid} comp={comp} contador={contador} />}
    </div>
  );
}

function Competencia({ unidadeId, comp, contador }: { unidadeId: string; comp: string; contador: boolean }) {
  const { nome, unidades } = useUnidade();
  const { papel, nome: meuNome } = usePerfil();
  const invalidar = useInvalidate();
  const { data: fechamentos = [] } = useRows<Fechamento>("fechamentos", {});
  const { data: notasTodas = [] } = useRows<Nota & { ambiente?: string }>("notas_fiscais", { select: "id, unidade_id, status, numero, serie, valor_total, created_at, payload, ambiente" });
  const notas = notasTodas.filter((n) => n.ambiente !== "homologacao"); // nota de teste não vai para o contador
  const { data: recebidas = [] } = useRows<Recebida>("nfe_recebidas", { select: "id, unidade_id, valor_total, data_emissao, manifestacao, situacao, emitente_nome, itens" });
  const { data: cartas = [] } = useRows<{ nota_id: string; status: string; created_at: string }>("nfe_cartas_correcao", {});
  const { data: inut = [] } = useRows<{ unidade_id: string; status: string; created_at: string }>("nfe_inutilizacoes", {});
  const { data: receber = [] } = useRows<Conta>("contas_receber", { select: "unidade_id, status, valor, valor_pago, data_pagamento" });
  const { data: pagar = [] } = useRows<Conta>("contas_pagar", { select: "unidade_id, status, valor, valor_pago, data_pagamento" });
  const [ocupado, setOcupado] = useState("");
  const f = fechamentos.find((x) => x.unidade_id === unidadeId && x.competencia === comp);
  const unidade = unidades.find((u) => u.id === unidadeId);
  const terminou = comp < new Date().toISOString().slice(0, 7);

  const r = useMemo(() => {
    const doMes = notas.filter((n) => n.unidade_id === unidadeId && noMes(n.created_at, comp));
    const aut = doMes.filter((n) => n.status === "autorizada");
    const rec = recebidas.filter((n) => n.unidade_id === unidadeId && noMes(n.data_emissao, comp));
    const idsNotas = new Set(notas.filter((n) => n.unidade_id === unidadeId).map((n) => n.id));
    const soma = (l: { valor_total: number }[]) => l.reduce((s, n) => s + Number(n.valor_total), 0);
    const pago = (l: Conta[]) => l.filter((c) => c.unidade_id === unidadeId && c.status === "pago" && noMes(c.data_pagamento, comp)).reduce((s, c) => s + Number(c.valor_pago ?? c.valor), 0);
    const saidas = new Map<string, { valor: number; icms: number; ipi: number; pis: number; cofins: number }>();
    for (const n of aut) for (const i of n.payload?.items ?? []) {
      const x = saidas.get(i.cfop) ?? { valor: 0, icms: 0, ipi: 0, pis: 0, cofins: 0 };
      x.valor += Number(i.valor_bruto ?? 0); x.icms += Number(i.icms_valor ?? 0); x.ipi += Number(i.ipi_valor ?? 0); x.pis += Number(i.pis_valor ?? 0); x.cofins += Number(i.cofins_valor ?? 0);
      saidas.set(i.cfop, x);
    }
    const entradas = new Map<string, number>();
    for (const n of rec) for (const i of n.itens ?? []) entradas.set(i.cfop ?? "—", (entradas.get(i.cfop ?? "—") ?? 0) + Number(i.valor_total ?? 0));
    const pend: string[] = [];
    const problema = doMes.filter((n) => ["erro", "contingencia", "processando"].includes(n.status));
    if (problema.length) pend.push(`${problema.length} NF-e emitida(s) com erro, em processamento ou na contingência`);
    const semManif = rec.filter((n) => n.situacao !== "cancelada" && !["confirmacao", "desconhecimento", "nao_realizada"].includes(n.manifestacao ?? ""));
    if (semManif.length) pend.push(`${semManif.length} nota(s) de fornecedor sem manifestação conclusiva`);
    const buracos = buracosNumeracao(notas.filter((n) => n.unidade_id === unidadeId && n.status !== "erro" && n.created_at.slice(0, 7) <= comp));
    if (buracos.length) pend.push(`Números de NF-e pulados: ${buracos.flatMap((b) => b.faltando).slice(0, 10).join(", ")} (inutilizar)`);
    return {
      emitidas: aut.length, valorEmitidas: soma(aut), canceladas: doMes.filter((n) => n.status === "cancelada").length,
      recebidas: rec.length, valorRecebidas: soma(rec),
      cartas: cartas.filter((c) => idsNotas.has(c.nota_id) && c.status === "autorizada" && noMes(c.created_at, comp)).length,
      inutilizacoes: inut.filter((i) => i.unidade_id === unidadeId && i.status === "autorizada" && noMes(i.created_at, comp)).length,
      recebimentos: pago(receber), pagamentos: pago(pagar), saidas: [...saidas.entries()].sort(), entradas: [...entradas.entries()].sort(), pend,
    };
  }, [notas, recebidas, cartas, inut, receber, pagar, unidadeId, comp]);

  async function pacote(enviar: boolean) {
    setOcupado(enviar ? "enviar" : "baixar");
    try {
      const res = await callFunction<{ url: string | null; arquivos: number; faltando: string[]; enviado: boolean }>("contador-pacote", { acao: "gerar", competencia: comp, unidade_id: unidadeId, enviar_email: enviar });
      if (res.url) window.open(res.url, "_blank", "noopener");
      notify(`${enviar ? "Enviado ao contador. " : ""}Pacote com ${res.arquivos} arquivo(s)${res.faltando.length ? `; ${res.faltando.length} XML não encontrado(s) (lista no LEIA-ME)` : ""}`);
      invalidar("fechamentos");
    } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }
  async function fechar() {
    const obs = prompt("Observação do fechamento (opcional):", "");
    if (obs === null) return;
    const { error } = await supabase.rpc("fechar_competencia", { p_unidade: unidadeId, p_competencia: comp, p_observacoes: obs || null });
    if (error) return notifyError(error);
    notify("Mês fechado: pagamentos e recebimentos deste mês ficam travados"); invalidar("fechamentos");
  }
  async function reabrir() {
    if (!confirm("Reabrir o mês? O contador é avisado.")) return;
    const { error } = await supabase.rpc("reabrir_competencia", { p_unidade: unidadeId, p_competencia: comp });
    if (error) return notifyError(error);
    notify("Mês reaberto"); invalidar("fechamentos");
  }

  const status = f?.status ?? "aberto";
  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-fg">{nomeMes(comp)} · {nome(unidadeId)}</h2>
          <Badge value={status === "fechado" ? "concluido" : status === "enviado" ? "enviado" : "aberto"} />
          <span className="text-sm text-slate-500">
            {status === "fechado" ? `fechado em ${dataBR(f?.fechado_em)}` : status === "enviado" ? `pacote enviado em ${dataBR(f?.enviado_em)}` : "ainda não enviado"}
            {unidade?.cnpj ? ` · CNPJ ${docFormat(unidade.cnpj)}` : ""}
          </span>
        </div>
        {f?.observacoes && <p className="mb-3 rounded-lg bg-slate-50 p-2 text-sm text-slate-700">“{f.observacoes}”</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {[["NF-e emitidas", r.emitidas], ["Valor emitido", brl(r.valorEmitidas)], ["Canceladas", r.canceladas], ["NF-e recebidas", r.recebidas],
            ["Valor recebido em notas", brl(r.valorRecebidas)], ["CC-e / inutilizações", `${r.cartas} / ${r.inutilizacoes}`], ["Recebimentos", brl(r.recebimentos)], ["Pagamentos", brl(r.pagamentos)]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl border border-slate-200 p-2.5"><div className="text-xs text-slate-500">{l}</div><div className="num font-bold text-fg">{v}</div></div>
          ))}
        </div>
        <div className="mt-3">
          {r.pend.length ? (
            <ul className="space-y-1 text-sm">{r.pend.map((p) => <li key={p} className="flex gap-2 text-amber-800"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />{p}</li>)}</ul>
          ) : <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={16} /> Sem pendências fiscais neste mês.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => pacote(false)} disabled={!!ocupado}><Download size={16} /> {ocupado === "baixar" ? "Montando o pacote…" : "Baixar pacote (XML + planilhas)"}</Button>
          {!contador && <Button variant="secondary" onClick={() => pacote(true)} disabled={!!ocupado}><Mail size={16} /> {ocupado === "enviar" ? "Enviando…" : "Enviar ao contador por e-mail"}</Button>}
          {(contador || papel === "admin") && status !== "fechado" && terminou && <Button variant="secondary" onClick={fechar}><Lock size={16} /> Fechar o mês</Button>}
          {papel === "admin" && status === "fechado" && <Button variant="ghost" onClick={reabrir}><LockOpen size={16} /> Reabrir</Button>}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          O pacote traz os XML das NF-e emitidas, canceladas e recebidas, cartas de correção e inutilizações, e planilhas de saídas e entradas por CFOP,
          notas, recebimentos e pagamentos. Com o mês fechado, pagamentos e recebimentos daquele mês não podem mais ser alterados.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Saídas por CFOP (NF-e autorizadas)">
          <TabelaCfop linhas={r.saidas.map(([c, x]) => [c, x.valor, x.icms, x.ipi, x.pis + x.cofins])} cab={["CFOP", "Valor", "ICMS", "IPI", "PIS + COFINS"]} />
        </Section>
        <Section title="Entradas por CFOP do fornecedor">
          <TabelaCfop linhas={r.entradas.map(([c, v]) => [c, v])} cab={["CFOP", "Valor dos produtos"]} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Conversa com o financeiro"><Mensagens unidadeId={unidadeId} comp={comp} meuNome={meuNome} /></Section>
        <Section title="Documentos do fechamento (guias, balancete, apurações)"><DocsFechamento unidadeId={unidadeId} comp={comp} id={f?.id} /></Section>
      </div>
    </div>
  );
}

function TabelaCfop({ linhas, cab }: { linhas: (string | number)[][]; cab: string[] }) {
  if (!linhas.length) return <p className="text-sm text-slate-500">Nada neste mês.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr>{cab.map((c, i) => <th key={c} className={`th ${i ? "text-right" : "pl-0"}`}>{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l) => <tr key={String(l[0])}>{l.map((v, i) => <td key={i} className={`py-1.5 ${i ? "num text-right" : "font-semibold"}`}>{typeof v === "number" ? brl(v) : v}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Mensagens({ unidadeId, comp, meuNome }: { unidadeId: string; comp: string; meuNome: string }) {
  const { data: todas = [] } = useRows<Msg>("contador_mensagens", { order: "created_at", ascending: true });
  const lista = todas.filter((m) => m.competencia === comp && (!m.unidade_id || m.unidade_id === unidadeId));
  const [texto, setTexto] = useState("");
  const invalidar = useInvalidate();
  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    const { error } = await supabase.from("contador_mensagens").insert({ unidade_id: unidadeId, competencia: comp, texto: texto.trim(), autor_nome: meuNome });
    if (error) return notifyError(error);
    setTexto(""); invalidar("contador_mensagens");
  }
  async function resolver(m: Msg) {
    const { error } = await supabase.from("contador_mensagens").update({ resolvida: !m.resolvida }).eq("id", m.id);
    if (error) return notifyError(error);
    invalidar("contador_mensagens");
  }
  return (
    <div>
      {lista.length ? (
        <ul className="mb-3 max-h-80 space-y-2 overflow-y-auto">
          {lista.map((m) => (
            <li key={m.id} className={`rounded-xl border p-2.5 text-sm ${m.resolvida ? "border-slate-100 opacity-60" : "border-slate-200"}`}>
              <div className="mb-0.5 flex items-center gap-2 text-xs text-slate-500">
                <b className="text-slate-700">{m.autor_nome ?? "—"}</b> {m.created_at ? new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "agora"}
                <button type="button" onClick={() => resolver(m)} className="ml-auto font-semibold text-brand">{m.resolvida ? "reabrir" : "resolvido ✓"}</button>
              </div>
              <p className="whitespace-pre-line text-fg">{m.texto}</p>
            </li>
          ))}
        </ul>
      ) : <p className="mb-3 flex items-center gap-1.5 text-sm text-slate-500"><MessageSquare size={15} /> Nenhuma mensagem neste mês.</p>}
      <form onSubmit={enviar} className="flex gap-2">
        <textarea className="input min-h-[44px] flex-1" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: falta a nota da compra de compressores do dia 12" />
        <Button disabled={!texto.trim()}><Send size={16} /></Button>
      </form>
    </div>
  );
}

function DocsFechamento({ unidadeId, comp, id }: { unidadeId: string; comp: string; id?: string }) {
  const [fid, setFid] = useState<string | undefined>(id);
  const invalidar = useInvalidate();
  useEffect(() => setFid(id), [id]);
  if (fid) return <Anexos entidade="fechamento" id={fid} titulo="Arquivos" />;
  return (
    <Button type="button" variant="secondary" onClick={async () => {
      const { data, error } = await supabase.rpc("garantir_fechamento", { p_unidade: unidadeId, p_competencia: comp });
      if (error) return notifyError(error);
      setFid(data as string); invalidar("fechamentos");
    }}>Anexar arquivos neste mês</Button>
  );
}
