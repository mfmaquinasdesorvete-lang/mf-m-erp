// Painel do contador: fechamento mensal por unidade, com o pacote de XML e planilhas,
// envio automático, mês travado depois de fechado e conversa com o financeiro.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleHelp, Download, FilePlus2, Lock, LockOpen, Mail, MessageSquare, Send } from "lucide-react";
import { Button, CampoMes, Card, chip, Field, Modal, PageHeader, Section, Tabs } from "@/components/ui";
import { ChipRevisao } from "@/components/financeiro/Revisao";
import { TABELA, type ContaRevisao, type TipoConta } from "@/lib/aprovacao";
import { Anexos } from "@/components/Anexos";
import { useInvalidate, useRows } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { callFunction, supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { brl, dataBR, docFormat, pl } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { buracosNumeracao } from "@/lib/compliance";
import { nomeCfop } from "@/lib/cfop";
import { confirmar, pedirTexto } from "@/components/Dialogos";
import { COR_STATUS, ConciliacaoBancos, Divergencias, ResultadoMes } from "@/components/contador/FechamentoMes";
import { conciliacaoDoMes, divergenciasDoMes, statusDoMes, type BancoMes } from "@/lib/fechamentoMes";
import type { LancExtratoDre } from "@/lib/dreExtrato";
import { useAbaUrl } from "@/lib/abaUrl";
import { CalendarioObrigacoes } from "@/components/contador/CalendarioObrigacoes";
import { Contabilidade } from "@/components/contador/Contabilidade";

type Fechamento = { id: string; unidade_id: string; competencia: string; status: string; enviado_em: string | null; fechado_em: string | null; arquivo_caminho: string | null; observacoes: string | null };
type Nota = { id: string; unidade_id: string | null; status: string; numero: string | null; serie: string | null; valor_total: number; created_at: string; pedido_id?: string | null; payload?: { items?: Record<string, any>[] } | null };
type Recebida = { id: string; unidade_id: string | null; valor_total: number; data_emissao: string | null; manifestacao: string | null; situacao: string | null; emitente_nome: string; itens?: { cfop?: string; valor_total?: number }[] | null };
type Conta = { unidade_id?: string | null; status: string; valor: number; valor_pago?: number | null; data_pagamento?: string | null };
// mesmo select e mesma key do LancamentosMes e do DRE: as consultas são feitas uma vez só
const SELECT_PAGAR = "*, fornecedor:fornecedores(nome)", SELECT_RECEBER = "*, cliente:clientes(nome, nome_fantasia)";
const SELECT_EXTRATO = "id, conta_bancaria_id, data, valor, descricao, identificador, status, conta_receber_id, conta_pagar_id, par_transferencia_id";
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
  const [aba, setAba] = useAbaUrl<"fechamento" | "calendario" | "contabilidade">("fechamento", ["fechamento", "calendario", "contabilidade"]);

  return (
    <div>
      <PageHeader title="Painel do contador" subtitle={contador
        ? "Tudo o que você precisa para o fechamento: notas, XML, planilhas e conversa com o financeiro da MF."
        : `Fechamento mensal com o contador${cfg?.contador_nome ? ` (${cfg.contador_nome})` : ""}. ${cfg?.contador_envio_auto ? `Envio automático todo dia ${cfg.contador_envio_dia}.` : "Envio automático desligado (Configurações → Contador)."}`} />
      <Tabs value={aba} onChange={setAba} options={[{ value: "fechamento", label: "Fechamento do mês" }, { value: "calendario", label: "Calendário de obrigações" },
        ...(contador ? [] : [{ value: "contabilidade" as const, label: "Contabilidade" }])]} />
      {aba === "contabilidade" && !contador ? <Contabilidade /> : aba === "calendario" ? <CalendarioObrigacoes /> : <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CampoMes rotulo="Competência" value={comp} max={new Date().toISOString().slice(0, 7)} onChange={(v) => v && setComp(v)} />
        <div className="flex gap-1.5">
          {unidades.map((u) => (
            <button key={u.id} type="button" onClick={() => setUnid(u.id)}
              className={chip(unid === u.id)}>{u.nome}</button>
          ))}
        </div>
      </div>
      {unid && <Competencia key={`${unid}-${comp}`} unidadeId={unid} comp={comp} contador={contador} />}
      </>}
    </div>
  );
}

function Competencia({ unidadeId, comp, contador }: { unidadeId: string; comp: string; contador: boolean }) {
  const { nome, unidades } = useUnidade();
  const { papel, nome: meuNome } = usePerfil();
  const invalidar = useInvalidate();
  const { data: fechamentos = [] } = useRows<Fechamento>("fechamentos", {});
  const { data: notasTodas = [] } = useRows<Nota & { ambiente?: string }>("notas_fiscais", { select: "id, unidade_id, status, numero, serie, valor_total, created_at, pedido_id, payload, ambiente" });
  const notas = notasTodas.filter((n) => n.ambiente !== "homologacao"); // nota de teste não vai para o contador
  const { data: recebidas = [] } = useRows<Recebida>("nfe_recebidas", { select: "id, unidade_id, valor_total, data_emissao, manifestacao, situacao, emitente_nome, itens" });
  const { data: cartas = [] } = useRows<{ nota_id: string; status: string; created_at: string }>("nfe_cartas_correcao", {});
  const { data: inut = [] } = useRows<{ unidade_id: string; status: string; created_at: string }>("nfe_inutilizacoes", {});
  const { data: receber = [] } = useRows<LancMes>("contas_receber", { select: SELECT_RECEBER, key: ["contador"] });
  const { data: pagar = [] } = useRows<LancMes>("contas_pagar", { select: SELECT_PAGAR, key: ["contador"] });
  const { data: extrato = [] } = useRows<LancExtratoDre & { status: string }>("extrato_lancamentos", { select: SELECT_EXTRATO, order: "data", ascending: true, key: ["dre"] });
  const { data: bancos = [] } = useRows<BancoMes>("contas_bancarias", { select: "id, nome, ativo, unidade_id", order: "nome", ascending: true });
  const [ocupado, setOcupado] = useState("");
  const f = fechamentos.find((x) => x.unidade_id === unidadeId && x.competencia === comp);
  const unidade = unidades.find((u) => u.id === unidadeId);
  const terminou = comp < new Date().toISOString().slice(0, 7);
  const contas = useMemo(() => [
    ...receber.map((c) => ({ ...c, tipo: "receber" as const })),
    ...pagar.map((c) => ({ ...c, tipo: "pagar" as const })),
  ], [receber, pagar]);

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
    const fiscais: { id: string; texto: string; bloqueia: boolean; link: string }[] = [];
    const problema = doMes.filter((n) => ["erro", "contingencia", "processando"].includes(n.status));
    if (problema.length) fiscais.push({ id: "nfe-problema", bloqueia: true, link: "/notas", texto: `${problema.length} NF-e ${pl(problema.length, "emitida", "emitidas")} com erro, em processamento ou na contingência` });
    const semManif = rec.filter((n) => n.situacao !== "cancelada" && !["confirmacao", "desconhecimento", "nao_realizada"].includes(n.manifestacao ?? ""));
    if (semManif.length) fiscais.push({ id: "sem-manifestacao", bloqueia: false, link: "/notas?aba=recebidas", texto: `${semManif.length} ${pl(semManif.length, "nota", "notas")} de fornecedor sem manifestação conclusiva` });
    const buracos = buracosNumeracao(notas.filter((n) => n.unidade_id === unidadeId && n.status !== "erro" && n.created_at.slice(0, 7) <= comp));
    if (buracos.length) fiscais.push({ id: "numeracao", bloqueia: true, link: "/notas?aba=compliance", texto: `Números de NF-e pulados: ${buracos.flatMap((b) => b.faltando).slice(0, 10).join(", ")} (inutilizar)` });
    return {
      emitidas: aut.length, valorEmitidas: soma(aut), canceladas: doMes.filter((n) => n.status === "cancelada").length,
      recebidas: rec.length, valorRecebidas: soma(rec),
      cartas: cartas.filter((c) => idsNotas.has(c.nota_id) && c.status === "autorizada" && noMes(c.created_at, comp)).length,
      inutilizacoes: inut.filter((i) => i.unidade_id === unidadeId && i.status === "autorizada" && noMes(i.created_at, comp)).length,
      recebimentos: pago(receber), pagamentos: pago(pagar), saidas: [...saidas.entries()].sort(), entradas: [...entradas.entries()].sort(), fiscais,
    };
  }, [notas, recebidas, cartas, inut, receber, pagar, unidadeId, comp]);

  // fechamento: primeiro as pendências (com o caminho até o documento), depois os números
  const conciliacao = useMemo(() => conciliacaoDoMes(extrato, bancos, unidadeId, comp), [extrato, bancos, unidadeId, comp]);
  const divergencias = useMemo(() => divergenciasDoMes({ comp, unidadeId, extrato, bancos, contas, notas, recebidas, fiscais: r.fiscais }),
    [comp, unidadeId, extrato, bancos, contas, notas, recebidas, r.fiscais]);
  const bloqueantes = divergencias.filter((d) => d.bloqueia).length;
  const aValidar = contas.filter((c) => c.unidade_id === unidadeId && c.status === "pago" && noMes(c.data_pagamento, comp)
    && c.revisao === "aprovado" && c.contador_status !== "validado" && c.contador_status !== "duvida").length;
  const situacao = statusDoMes({ fechado: f?.status === "fechado", enviado: f?.status === "enviado", terminou, bloqueantes, aValidar });

  async function pacote(enviar: boolean) {
    setOcupado(enviar ? "enviar" : "baixar");
    try {
      const res = await callFunction<{ url: string | null; arquivos: number; faltando: string[]; enviado: boolean }>("contador-pacote", { acao: "gerar", competencia: comp, unidade_id: unidadeId, enviar_email: enviar });
      if (res.url) window.open(res.url, "_blank", "noopener");
      notify(`${enviar ? "Enviado ao contador. " : ""}Pacote com ${res.arquivos} ${pl(res.arquivos, "arquivo", "arquivos")}${res.faltando.length ? `; ${res.faltando.length} XML não ${pl(res.faltando.length, "encontrado", "encontrados")} (lista no LEIA-ME)` : ""}`);
      invalidar("fechamentos");
    } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }
  async function fechar() {
    const falta = [bloqueantes ? `${bloqueantes} ${pl(bloqueantes, "pendência que impede", "pendências que impedem")} o fechamento` : "",
      aValidar ? `${aValidar} ${pl(aValidar, "lançamento", "lançamentos")} sem validação do contador` : ""].filter(Boolean).join(" e ");
    const obs = await pedirTexto(falta
      ? `O mês ainda tem ${falta}. Para fechar assim, escreva a justificativa (fica no fechamento e na trilha):`
      : "Observação do fechamento (opcional):", "");
    if (obs === null) return;
    if (falta && obs.trim().length < 10) return notifyError(new Error("Escreva a justificativa (pelo menos 10 letras) ou resolva as pendências antes de fechar."));
    const { error } = await supabase.rpc("fechar_competencia", { p_unidade: unidadeId, p_competencia: comp, p_observacoes: obs || null });
    if (error) return notifyError(error);
    notify("Mês fechado: pagamentos e recebimentos deste mês ficam travados"); invalidar("fechamentos");
  }
  async function reabrir() {
    if (!(await confirmar("Reabrir o mês? O contador é avisado."))) return;
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
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COR_STATUS[situacao.status]}`}>{situacao.rotulo}</span>
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
        <div className="mt-3 text-sm">
          {divergencias.length ? (
            <a href="#pendencias-mes" className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${bloqueantes ? "text-amber-800" : "text-slate-700"}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${bloqueantes ? "bg-amber-500" : "bg-slate-400"}`} aria-hidden />
              <b>{bloqueantes ? `${bloqueantes} ${pl(bloqueantes, "pendência impede", "pendências impedem")} o fechamento` : "Nenhuma pendência impede o fechamento"}</b>
              {divergencias.length - bloqueantes > 0 && <span>· {divergencias.length - bloqueantes} para conferir</span>}
              <span className="font-semibold text-brand">ver a lista ↓</span>
            </a>
          ) : <p className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={16} aria-hidden /> Sem pendências neste mês.</p>}
          {situacao.status !== "com_pendencias" && <p className="mt-1 text-xs text-slate-500">{situacao.explicacao}</p>}
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

      {/* pendências antes dos números; cada uma leva à tela de origem */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div id="pendencias-mes" className="min-w-0 scroll-mt-20 xl:col-span-2"><Divergencias lista={divergencias} unidadeId={unidadeId} comp={comp} meuNome={meuNome} /></div>
        <div className="min-w-0"><ConciliacaoBancos contas={conciliacao} /></div>
      </div>

      <ResultadoMes unidadeId={unidadeId} comp={comp} contas={contas} />

      {/* lado a lado só em tela grande: no notebook a tabela de saídas (5 colunas) não cabe em meia largura */}
      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
        <Section title="Saídas por CFOP (NF-e autorizadas)">
          <TabelaCfop titulo="Saídas por CFOP" linhas={r.saidas.map(([c, x]) => [c, x.valor, x.icms, x.ipi, x.pis + x.cofins])} cab={["CFOP", "Valor", "ICMS", "IPI", "PIS + COFINS"]} />
        </Section>
        <Section title="Entradas por CFOP do fornecedor">
          <TabelaCfop titulo="Entradas por CFOP do fornecedor" linhas={r.entradas.map(([c, v]) => [c, v])} cab={["CFOP", "Valor dos produtos"]} />
        </Section>
      </div>

      <div id="lancamentos-mes" className="scroll-mt-20"><LancamentosMes unidadeId={unidadeId} comp={comp} contador={contador} fechado={status === "fechado"} /></div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Conversa com o financeiro"><Mensagens unidadeId={unidadeId} comp={comp} meuNome={meuNome} /></Section>
        <Section title="Documentos do fechamento (guias, balancete, apurações)"><DocsFechamento unidadeId={unidadeId} comp={comp} id={f?.id} /></Section>
      </div>
    </div>
  );
}

/** No computador é tabela; no celular cada CFOP vira um cartão "rótulo → valor" (classe .tabela). */
function TabelaCfop({ linhas, cab, titulo }: { linhas: (string | number)[][]; cab: string[]; titulo: string }) {
  if (!linhas.length) return <p className="text-sm text-slate-500">Nada neste mês.</p>;
  const total = cab.slice(1).map((_, i) => linhas.reduce((s, l) => s + Number(l[i + 1] || 0), 0));
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5 md:mx-0">
      <table className="tabela w-full text-sm">
        <caption className="sr-only">{titulo}</caption>
        <thead><tr>{cab.map((c, i) => <th key={c} scope="col" className={`th ${i ? "text-right" : "pl-0"}`}>{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((l) => (
            <tr key={String(l[0])}>
              {l.map((v, i) => i === 0 ? (
                <td key={i} role="rowheader" data-label="CFOP" className="py-2 pr-3 align-top font-semibold text-fg md:pl-0">
                  {v}<span className="block text-xs font-normal text-slate-500">{nomeCfop(String(v))}</span>
                </td>
              ) : (
                <td key={i} data-label={cab[i]} className="num whitespace-nowrap py-2 text-right md:pl-3">{brl(Number(v))}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {linhas.length > 1 && (
          <tfoot className="hidden border-t-2 border-slate-200 font-bold text-fg md:table-footer-group">
            <tr><th scope="row" className="py-2 text-left">Total</th>{total.map((t, i) => <td key={i} className="num whitespace-nowrap py-2 pl-3 text-right">{brl(t)}</td>)}</tr>
          </tfoot>
        )}
      </table>
      {linhas.length > 1 && (
        <p className="mt-2 px-4 text-right text-sm font-bold text-fg sm:px-5 md:hidden">Total {brl(total[0])}</p>
      )}
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
            <li key={m.id} className={`rounded-xl border p-2.5 text-sm ${m.resolvida ? "border-slate-100 opacity-90" : "border-slate-200"}`}>
              <div className="mb-0.5 flex items-center gap-2 text-xs text-slate-500">
                <b className="text-slate-700">{m.autor_nome ?? "—"}</b> {m.created_at ? new Date(m.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "agora"}
                <button type="button" onClick={() => resolver(m)} className="link-acao ml-auto px-1" aria-pressed={!!m.resolvida}>{m.resolvida ? "reabrir" : "resolvido ✓"}</button>
              </div>
              <p className="whitespace-pre-line text-fg">{m.texto}</p>
            </li>
          ))}
        </ul>
      ) : <p className="mb-3 flex items-center gap-1.5 text-sm text-slate-500"><MessageSquare size={15} /> Nenhuma mensagem neste mês.</p>}
      <form onSubmit={enviar} className="flex gap-2">
        <textarea className="input min-h-[44px] flex-1" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Mensagem para o financeiro"
          placeholder="Ex.: falta a nota da compra de compressores do dia 12" />
        <Button disabled={!texto.trim()} aria-label="Enviar mensagem" className="self-end"><Send size={16} aria-hidden /></Button>
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

type LancMes = ContaRevisao & { tipo: TipoConta; terceiro: string | null; valor_pago?: number | null; fornecedor?: { nome: string } | null; cliente?: { nome: string; nome_fantasia?: string | null } | null };

/**
 * Lançamentos pagos e recebidos no mês (o que vai no pacote): aprovado internamente x validado pelo contador, contados separados.
 * O contador valida ou pergunta; com o mês fechado, o financeiro corrige por lançamento corretivo (o original fica como está).
 */
function LancamentosMes({ unidadeId, comp, contador, fechado }: { unidadeId: string; comp: string; contador: boolean; fechado: boolean }) {
  const { tem } = usePerfil();
  const invalidar = useInvalidate();
  const { data: pagar = [] } = useRows<LancMes>("contas_pagar", { select: SELECT_PAGAR, key: ["contador"] });
  const { data: receber = [] } = useRows<LancMes>("contas_receber", { select: SELECT_RECEBER, key: ["contador"] });
  const [filtro, setFiltro] = useState<"todos" | "validar" | "nao_aprovados" | "duvidas">("todos");
  const [ocupado, setOcupado] = useState(false);
  const [corrigir, setCorrigir] = useState<LancMes | null>(null);
  const linhas = useMemo(() => [
    ...pagar.map((c) => ({ ...c, tipo: "pagar" as const, terceiro: c.fornecedor?.nome ?? null })),
    ...receber.map((c) => ({ ...c, tipo: "receber" as const, terceiro: c.cliente ? c.cliente.nome_fantasia?.trim() || c.cliente.nome : null })),
  ].filter((c) => c.unidade_id === unidadeId && c.status === "pago" && noMes(c.data_pagamento, comp))
    .sort((a, b) => (a.data_pagamento ?? "").localeCompare(b.data_pagamento ?? "")), [pagar, receber, unidadeId, comp]);
  const aprovado = (c: LancMes) => c.revisao === "aprovado" || c.revisao === "historico";
  const validado = (c: LancMes) => c.revisao === "historico" || (c.revisao === "aprovado" && c.contador_status === "validado");
  const aValidar = linhas.filter((c) => c.revisao === "aprovado" && c.contador_status !== "validado" && c.contador_status !== "duvida");
  const lista = filtro === "validar" ? aValidar : filtro === "nao_aprovados" ? linhas.filter((c) => !aprovado(c))
    : filtro === "duvidas" ? linhas.filter((c) => c.contador_status === "duvida" || c.contador_status === "ajustado") : linhas;

  async function conferir(acao: "validar" | "duvida" | "desfazer", ls: LancMes[]) {
    let comentario: string | null = null;
    if (acao === "duvida") {
      comentario = (await pedirTexto("Qual a dúvida? (vai para a conversa do mês, presa a este lançamento)", ""));
      if (!comentario?.trim()) return;
    }
    setOcupado(true);
    try {
      for (const tipo of ["pagar", "receber"] as const) {
        const ids = ls.filter((c) => c.tipo === tipo).map((c) => c.id);
        if (!ids.length) continue;
        const { error } = await supabase.rpc("contador_conferir", { p_tabela: TABELA[tipo], p_ids: ids, p_acao: acao, p_comentario: comentario });
        if (error) throw error;
      }
      notify(acao === "validar" ? `${ls.length} ${pl(ls.length, "lançamento", "lançamentos")} ${pl(ls.length, "validado", "validados")}` : acao === "duvida" ? "Dúvida enviada ao financeiro" : "Validação desfeita");
      invalidar("contas_pagar", "contas_receber", "contador_mensagens", "revisoes_contas");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const n = linhas.length;
  return (
    <Section title="Lançamentos do mês: aprovação e validação"
      actions={contador && aValidar.length > 0 ? <Button type="button" disabled={ocupado} onClick={() => conferir("validar", aValidar)}><CheckCircle2 size={16} /> Validar as {aValidar.length} aprovadas</Button> : undefined}>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Lançamentos pagos/recebidos", String(n)], ["Aprovados internamente", `${linhas.filter(aprovado).length} de ${n}`],
          ["Validados pelo contador", `${linhas.filter(validado).length} de ${n}`], ["Dúvidas abertas", String(linhas.filter((c) => c.contador_status === "duvida").length)]].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-slate-200 p-2.5"><div className="text-xs text-slate-500">{l}</div><div className="num font-bold text-fg">{v}</div></div>
        ))}
      </div>
      <div role="tablist" aria-label="Filtrar lançamentos" className="faixa-chips mb-3">
        {([["todos", "Todos"], ["validar", `A validar (${aValidar.length})`], ["nao_aprovados", "Ainda não aprovados"], ["duvidas", "Dúvidas e ajustados"]] as const).map(([v, t]) => (
          <button key={v} type="button" role="tab" aria-selected={filtro === v} onClick={() => setFiltro(v)}
            className={chip(filtro === v)}>{t}</button>
        ))}
      </div>
      {lista.length ? (
        <ul className="divide-y divide-slate-100">
          {lista.map((c) => (
            <li key={`${c.tipo}-${c.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
              <span className={`rounded-full px-2 py-0.5 text-2xs font-bold ${c.tipo === "pagar" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{c.tipo === "pagar" ? "Pagamento" : "Recebimento"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg">{c.terceiro || c.descricao}</span>
                <span className="block truncate text-xs text-slate-500">{c.terceiro ? `${c.descricao} · ` : ""}{c.categoria ?? "sem categoria"} · em {dataBR(c.data_pagamento)}</span>
                {c.contador_comentario && (c.contador_status === "duvida" || c.contador_status === "ajustado") && <span className="mt-0.5 block text-xs text-violet-700">Dúvida: “{c.contador_comentario}”</span>}
              </span>
              <span className="num text-sm font-bold text-fg">{brl(Number(c.valor_pago ?? c.valor))}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <ChipRevisao conta={c} link={!contador} />
                {contador && c.revisao === "aprovado" && c.contador_status !== "validado" && (
                  <Button type="button" variant="secondary" disabled={ocupado} onClick={() => conferir("validar", [c])} className="!min-h-[34px] !px-2.5 !py-1 text-sm"><CheckCircle2 size={14} /> Validar</Button>
                )}
                {contador && c.revisao !== "historico" && c.contador_status !== "duvida" && (
                  <Button type="button" variant="ghost" disabled={ocupado} onClick={() => conferir("duvida", [c])} className="!min-h-[34px] !px-2.5 !py-1 text-sm"><CircleHelp size={14} /> Dúvida</Button>
                )}
                {contador && c.contador_status === "validado" && (
                  <Button type="button" variant="ghost" disabled={ocupado} onClick={() => conferir("desfazer", [c])} className="!min-h-[34px] !px-2.5 !py-1 text-sm">Desfazer</Button>
                )}
                {!contador && fechado && tem("financeiro") && (
                  <Button type="button" variant="ghost" onClick={() => setCorrigir(c)} className="!min-h-[34px] !px-2.5 !py-1 text-sm"><FilePlus2 size={14} /> Lançamento corretivo</Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">{n ? "Nada neste filtro." : "Nenhum pagamento ou recebimento neste mês."}</p>}
      <p className="mt-3 text-xs text-slate-500">
        Aprovado internamente e validado pelo contador são contados separados: baixar ou enviar o pacote não valida. O mês só fecha com tudo
        validado, ou com a justificativa na observação do fechamento.{fechado ? " Mês fechado: correção só por lançamento corretivo, ligado ao original." : ""}
      </p>
      {corrigir && <LancamentoCorretivo original={corrigir} onClose={() => setCorrigir(null)} />}
    </Section>
  );
}

/** Lançamento corretivo: nova conta ligada à original (que fica como está), com motivo; entra na revisão e pede a 2ª. */
function LancamentoCorretivo({ original, onClose }: { original: LancMes; onClose: () => void }) {
  const invalidar = useInvalidate();
  const [desc, setDesc] = useState(`Correção: ${original.descricao}`);
  const [valor, setValor] = useState("");
  const [venc, setVenc] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const base = {
      descricao: desc.trim(), valor: Number(valor), vencimento: venc, categoria: original.categoria, unidade_id: original.unidade_id, corrige_id: original.id,
      observacoes: `Lançamento corretivo de "${original.descricao}" (${original.tipo === "pagar" ? "pago" : "recebido"} em ${dataBR(original.data_pagamento)}): ${motivo.trim()}`,
    };
    const { error } = await supabase.from(TABELA[original.tipo]).insert(original.tipo === "pagar"
      ? { ...base, fornecedor_id: original.fornecedor_id ?? null } : { ...base, cliente_id: original.cliente_id ?? null });
    setSalvando(false);
    if (error) return notifyError(error);
    notify("Lançamento corretivo criado: entra na revisão (1ª e 2ª)");
    invalidar("contas_pagar", "contas_receber"); onClose();
  }
  return (
    <Modal open onClose={onClose} title="Lançamento corretivo">
      <form onSubmit={salvar} className="space-y-3">
        <p className="text-sm text-slate-600">O lançamento original ({brl(Number(original.valor_pago ?? original.valor))}, {dataBR(original.data_pagamento)}) fica como está, no mês fechado. A correção entra no mês aberto, ligada a ele, e passa pela 1ª e 2ª revisão.</p>
        <Field label="Descrição"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor da correção (R$)"><input className="input" type="number" min={0.01} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required /></Field>
          <Field label="Vencimento"><input className="input" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} required /></Field>
        </div>
        <Field label="Motivo (obrigatório: o que está sendo corrigido e por quê)">
          <textarea className="input" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={10} required placeholder="Ex.: juros cobrados a mais no boleto; o banco devolveu a diferença" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando || motivo.trim().length < 10 || !(Number(valor) > 0)}>{salvando ? "Salvando…" : "Criar lançamento corretivo"}</Button>
        </div>
      </form>
    </Modal>
  );
}
