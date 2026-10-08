import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Badge, Button, Card, Field, Modal, PageHeader, Table, Tabs } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { useUnidade } from "@/lib/unidade";
import { calcularExcecoes, faixasAtraso, TIPOS, type Excecao, type TipoExcecao } from "@/lib/auditoria";
import { DescricaoMudanca, type LinhaAuditoria } from "@/components/Historico";
import { baixarPlanilha } from "@/lib/exportar";
import { ChecklistAuditoria } from "@/components/ChecklistAuditoria";

export type Tratativa = { id?: string; chave: string; tipo: string; titulo?: string | null; situacao: "indicio" | "confirmado" | "resolvido" | "descartado"; impacto: string | null; responsavel: string | null; prazo: string | null; observacao: string | null; updated_at?: string };

const TABELAS: Record<string, string> = {
  contas_receber: "Conta a receber", contas_pagar: "Conta a pagar", pedidos: "Pedido", clientes: "Cliente", fornecedores: "Fornecedor",
  transportadoras: "Transportadora", produtos: "Produto", usuarios_erp: "Usuário", configuracoes: "Configurações", unidades: "Unidade",
  vendedores: "Vendedor", comissoes: "Comissão", contas_bancarias: "Conta bancária", extrato_lancamentos: "Extrato", auditoria_excecoes: "Exceção", auditoria_checklist: "Checklist da auditoria",
};

export default function Auditoria() {
  const [aba, setAba] = useState<"checklist" | "excecoes" | "historico">("checklist");
  const [tipoInicial, setTipoInicial] = useState<"" | TipoExcecao>("");
  const dados = useExcecoes();
  return (
    <div>
      <PageHeader title="Auditoria financeira" subtitle="Checklist do mês, exceções para conferir e o histórico de tudo o que foi alterado" />
      <Tabs value={aba} onChange={(a) => { setAba(a); setTipoInicial(""); }} options={[
        { value: "checklist", label: "Checklist do mês" }, { value: "excecoes", label: "Exceções" }, { value: "historico", label: "Histórico de alterações" },
      ]} />
      {aba === "checklist" ? <ChecklistAuditoria dados={dados} verExcecoes={(t) => { setTipoInicial(t); setAba("excecoes"); }} />
        : aba === "excecoes" ? <Excecoes dados={dados} tipoInicial={tipoInicial} key={tipoInicial} /> : <HistoricoGeral />}
    </div>
  );
}

/* ------------------------------------ Exceções ------------------------------------ */

export type DadosExcecoes = ReturnType<typeof useExcecoes>;

/** Exceções calculadas pelas regras + as registradas à mão pelo checklist, com a tratativa de cada uma. */
function useExcecoes() {
  const { filtrar } = useUnidade();
  const { data: receber = [] } = useRows<any>("contas_receber");
  const { data: pagar = [] } = useRows<any>("contas_pagar");
  const { data: lancamentos = [] } = useRows<any>("extrato_lancamentos");
  const { data: bancos = [] } = useRows<any>("contas_bancarias", { order: "nome", ascending: true });
  const { data: importacoes = [] } = useRows<any>("extrato_importacoes");
  const { data: auditoria = [] } = useRows<any>("auditoria");
  const { data: documentos = [] } = useRows<any>("documentos", { select: "entidade, entidade_id" });
  const { data: pedidos = [] } = useRows<any>("pedidos", { select: "id, numero, status, unidade_id, valor_total" });
  const { data: recebidas = [] } = useRows<any>("nfe_recebidas", { select: "id, chave, emitente_nome, valor_total, data_emissao, situacao, processamento, conta_pagar_id, estoque_lancado, unidade_id" });
  const { data: usuarios = [] } = useRows<any>("usuarios_erp", { select: "user_id, nome, papel, ativo, ultimo_acesso, created_at" });
  const { data: produtos = [] } = useRows<any>("produtos", { select: "id, sku, descricao, tipo, unidade, ncm, preco_custo, preco_venda, estoque_atual, estoque_minimo, ativo, vendavel, kit, categoria, localizacao, fornecedor_padrao_id, fora_de_linha, created_at" });
  const { data: ordens = [] } = useRows<any>("ordens_servico", { select: "id, numero, status, em_garantia, valor_total, unidade_id" });
  const { data: fornecedores = [] } = useRows<any>("fornecedores", { select: "id, nome" });
  const { data: tratativas = [] } = useRows<Tratativa>("auditoria_excecoes");

  const bancosU = filtrar(bancos);
  const idsBancos = new Set(bancosU.map((b: any) => b.id));
  const excecoes = useMemo(() => [
    ...calcularExcecoes({
      receber: filtrar(receber), pagar: filtrar(pagar), lancamentos: lancamentos.filter((l: any) => idsBancos.has(l.conta_bancaria_id)), bancos: bancosU,
      importacoes: importacoes.filter((i: any) => idsBancos.has(i.conta_bancaria_id)), auditoria, documentos, pedidos: filtrar(pedidos), ordens: filtrar(ordens), fornecedores,
      recebidas: filtrar(recebidas), usuarios, produtos, hoje: hoje(),
    }),
    // itens do checklist marcados como não conformes viram exceção para tratar (responsável, prazo, evidência)
    ...tratativas.filter((t) => t.tipo === "checklist").map((t): Excecao => ({
      chave: t.chave, tipo: "checklist", gravidade: "media", link: "/auditoria", titulo: t.titulo ?? "Item do checklist",
      detalhe: `Competência ${t.chave.split(":")[1] ?? ""}`, data: t.updated_at?.slice(0, 10),
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [receber, pagar, lancamentos, bancos, importacoes, auditoria, documentos, pedidos, ordens, fornecedores, recebidas, usuarios, produtos, tratativas, filtrar]);

  const trat = (e: Excecao): Tratativa => tratativas.find((t) => t.chave === e.chave) ?? { chave: e.chave, tipo: e.tipo, situacao: "indicio", impacto: null, responsavel: null, prazo: null, observacao: null };
  const fechada = (t: Tratativa) => t.situacao === "resolvido" || t.situacao === "descartado";
  const abertasPorTipo = (k: TipoExcecao) => excecoes.filter((e) => e.tipo === k && !fechada(trat(e))).length;
  return { excecoes, trat, fechada, abertasPorTipo, receber: filtrar(receber), pagar: filtrar(pagar) };
}

function Excecoes({ dados, tipoInicial }: { dados: DadosExcecoes; tipoInicial: "" | TipoExcecao }) {
  const { excecoes, trat, fechada, receber, pagar } = dados;
  const [tipo, setTipo] = useState<"" | TipoExcecao>(tipoInicial);
  const [ver, setVer] = useState<"abertas" | "todas" | "fechadas">("abertas");
  const [editar, setEditar] = useState<{ e: Excecao; t: Tratativa } | null>(null);
  const lista = excecoes
    .filter((e) => !tipo || e.tipo === tipo)
    .filter((e) => ver === "todas" || (ver === "abertas" ? !fechada(trat(e)) : fechada(trat(e))));
  const contagem = Object.keys(TIPOS).map((k) => ({ k: k as TipoExcecao, n: excecoes.filter((e) => e.tipo === k && !fechada(trat(e))).length }));
  const atrasoR = faixasAtraso(receber, hoje());
  const atrasoP = faixasAtraso(pagar, hoje());
  const atrasados = (t: Tratativa) => t.prazo && t.prazo < hoje() && !fechada(t);

  function exportar() {
    baixarPlanilha("auditoria-excecoes", [{ nome: "Exceções", linhas: lista.map((e) => {
      const t = trat(e);
      return { Tipo: TIPOS[e.tipo].rotulo, Critério: TIPOS[e.tipo].criterio, Item: e.titulo, Evidência: e.detalhe, Valor: e.valor ?? "", Data: e.data ? dataBR(e.data) : "",
        Situação: t.situacao, Impacto: t.impacto ?? "", Responsável: t.responsavel ?? "", Prazo: t.prazo ? dataBR(t.prazo) : "", Observação: t.observacao ?? "" };
    }) }]).catch(notifyError);
  }

  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {([["A receber vencido", atrasoR], ["A pagar vencido", atrasoP]] as const).map(([titulo, f]) => (
          <Card key={titulo} className="p-4">
            <div className="mb-2 text-sm font-semibold">{titulo} por faixa de atraso</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {f.map((x) => (
                <div key={x.rotulo} className={`rounded-lg px-2 py-2 ${x.qtd ? (x.max > 60 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800") : "bg-slate-50 text-slate-500"}`}>
                  <div className="text-[11px]">{x.rotulo}</div><div className="text-sm font-bold">{brl(x.valor)}</div><div className="text-[11px]">{x.qtd} conta(s)</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button onClick={() => setTipo("")} className={`rounded-full px-3 py-1 text-xs font-semibold ${!tipo ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-600"}`}>Todas ({contagem.reduce((s, c) => s + c.n, 0)})</button>
        {contagem.filter((c) => c.n || tipo === c.k).map((c) => (
          <button key={c.k} onClick={() => setTipo(c.k)} title={TIPOS[c.k].criterio}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${tipo === c.k ? "bg-brand text-brand-fg" : "bg-slate-100 text-slate-600"}`}>{TIPOS[c.k].rotulo} ({c.n})</button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={ver} onChange={(e) => setVer(e.target.value as any)} aria-label="Mostrar">
          <option value="abertas">Em aberto (indício ou confirmado)</option><option value="fechadas">Resolvidas ou descartadas</option><option value="todas">Todas</option>
        </select>
        {tipo && <span className="text-xs text-slate-500"><b>Critério:</b> {TIPOS[tipo].criterio}</span>}
        <Button variant="secondary" className="ml-auto" onClick={exportar} disabled={!lista.length}>Exportar</Button>
      </div>

      {!excecoes.length ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-slate-600"><ShieldAlert className="text-emerald-600" /> Nenhuma exceção encontrada pelas regras atuais.</Card>
      ) : (
        <Table empty={!lista.length}
          head={<><th className="th">Exceção</th><th className="th">Evidência</th><th className="th text-right">Valor</th><th className="th">Situação</th><th className="th">Responsável / prazo</th><th className="th" /></>}>
          {lista.map((e) => {
            const t = trat(e);
            return (
              <tr key={e.chave}>
                <td className="td">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span className={`h-2 w-2 rounded-full ${e.gravidade === "alta" ? "bg-red-500" : e.gravidade === "media" ? "bg-amber-500" : "bg-slate-400"}`} aria-label={`gravidade ${e.gravidade}`} />
                    {TIPOS[e.tipo].rotulo}
                  </div>
                  <Link to={e.link} className="font-medium text-fg hover:underline">{e.titulo}</Link>
                </td>
                <td className="td text-sm text-slate-600">{e.detalhe}{t.observacao && <div className="mt-1 text-xs text-slate-500">Obs.: {t.observacao}</div>}</td>
                <td className={`td whitespace-nowrap text-right ${e.valor != null && e.valor < 0 ? "text-red-600" : ""}`}>{e.valor != null ? brl(e.valor) : "—"}</td>
                <td className="td"><Badge value={t.situacao} />{t.impacto && <div className="mt-1 text-xs text-slate-500">impacto {t.impacto}</div>}</td>
                <td className="td text-sm">{t.responsavel ?? <span className="text-slate-400">—</span>}{t.prazo && <div className={`text-xs ${atrasados(t) ? "font-semibold text-red-600" : "text-slate-500"}`}>até {dataBR(t.prazo)}</div>}</td>
                <td className="td text-right"><Button variant="secondary" onClick={() => setEditar({ e, t })}>Tratar</Button></td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-3 text-xs text-slate-500">Os alertas servem para escolher o que conferir. Uma exceção só vira <b>confirmada</b> depois de olhar o documento ou o extrato.</p>
      {editar && <TratarExcecao e={editar.e} t={editar.t} onClose={() => setEditar(null)} />}
    </div>
  );
}

function TratarExcecao({ e, t, onClose }: { e: Excecao; t: Tratativa; onClose: () => void }) {
  const [f, setF] = useState<Tratativa>(t);
  const invalidate = useInvalidate();
  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    const row = { chave: e.chave, tipo: e.tipo, titulo: e.titulo, situacao: f.situacao, impacto: f.impacto || null, responsavel: f.responsavel || null, prazo: f.prazo || null, observacao: f.observacao || null };
    const { error } = await supabase.from("auditoria_excecoes").upsert(row, { onConflict: "chave" });
    if (error) return notifyError(error);
    notify("Tratativa salva");
    invalidate("auditoria_excecoes", "auditoria");
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={TIPOS[e.tipo].rotulo}>
      <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3 text-sm sm:col-span-2">
          <div className="font-semibold text-fg">{e.titulo}</div>
          <div className="text-slate-600">{e.detalhe}</div>
          <div className="mt-1 text-xs text-slate-500"><b>Critério:</b> {TIPOS[e.tipo].criterio}</div>
        </div>
        <Field label="Situação">
          <select className="input" value={f.situacao} onChange={(x) => setF({ ...f, situacao: x.target.value as Tratativa["situacao"] })}>
            <option value="indicio">Indício (a conferir)</option><option value="confirmado">Erro confirmado</option>
            <option value="resolvido">Resolvido</option><option value="descartado">Descartado (estava certo)</option>
          </select>
        </Field>
        <Field label="Impacto">
          <select className="input" value={f.impacto ?? ""} onChange={(x) => setF({ ...f, impacto: x.target.value })}>
            <option value="">—</option><option value="baixo">Baixo</option><option value="medio">Médio</option><option value="alto">Alto</option>
          </select>
        </Field>
        <Field label="Responsável"><input className="input" value={f.responsavel ?? ""} onChange={(x) => setF({ ...f, responsavel: x.target.value })} /></Field>
        <Field label="Prazo para corrigir"><input className="input" type="date" value={f.prazo ?? ""} onChange={(x) => setF({ ...f, prazo: x.target.value })} /></Field>
        <Field label="Evidência / o que foi feito" className="sm:col-span-2">
          <textarea className="input" rows={3} value={f.observacao ?? ""} onChange={(x) => setF({ ...f, observacao: x.target.value })} required={f.situacao !== "indicio"}
            placeholder="Ex.: conferido com o comprovante do banco; boleto pago em duplicidade, fornecedor vai devolver" />
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------ Histórico de alterações ------------------------------ */

function HistoricoGeral() {
  const { data: linhas = [] } = useRows<LinhaAuditoria>("auditoria");
  const [tabela, setTabela] = useState("");
  const [usuario, setUsuario] = useState("");
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [soAlteracoes, setSoAlteracoes] = useState(true);
  const usuarios = [...new Set(linhas.map((l) => l.usuario_nome ?? "sistema"))].sort();
  const lista = linhas
    .filter((l) => !tabela || l.tabela === tabela)
    .filter((l) => !usuario || (l.usuario_nome ?? "sistema") === usuario)
    .filter((l) => !mes || l.created_at.startsWith(mes))
    .filter((l) => !soAlteracoes || l.acao !== "insert")
    .slice(0, 500);

  function exportar() {
    baixarPlanilha("historico-alteracoes", [{ nome: "Histórico", linhas: lista.map((l) => ({
      Quando: new Date(l.created_at).toLocaleString("pt-BR"), Usuário: l.usuario_nome ?? "sistema", Origem: l.origem === "sistema" ? "automático" : "manual",
      Cadastro: TABELAS[l.tabela] ?? l.tabela, Registro: l.registro_id ?? "", Ação: l.acao, Campos: (l.campos ?? []).join(", "),
      Antes: l.antes ? JSON.stringify(l.antes) : "", Depois: l.depois ? JSON.stringify(l.depois) : "", Motivo: l.motivo ?? "",
    })) }]).catch(notifyError);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={tabela} onChange={(e) => setTabela(e.target.value)} aria-label="Cadastro">
          <option value="">Todos os cadastros</option>
          {Object.entries(TABELAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input w-auto" value={usuario} onChange={(e) => setUsuario(e.target.value)} aria-label="Usuário">
          <option value="">Todos os usuários</option>
          {usuarios.map((u) => <option key={u}>{u}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">Mês <input type="month" className="input w-auto" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mês" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soAlteracoes} onChange={(e) => setSoAlteracoes(e.target.checked)} /> Só alterações e exclusões</label>
        <Button variant="secondary" className="ml-auto" onClick={exportar} disabled={!lista.length}>Exportar</Button>
      </div>
      <Table empty={!lista.length}
        head={<><th className="th">Quando</th><th className="th">Quem</th><th className="th">Cadastro</th><th className="th">O que mudou</th><th className="th">Motivo</th></>}>
        {lista.map((l) => (
          <tr key={l.id}>
            <td className="td whitespace-nowrap text-sm">{new Date(l.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="td text-sm">{l.usuario_nome ?? "sistema"}{l.origem === "sistema" && <div className="text-xs text-slate-500">automático</div>}</td>
            <td className="td text-sm">{TABELAS[l.tabela] ?? l.tabela}<div className="text-xs text-slate-500">{(l.depois as any)?.descricao ?? (l.antes as any)?.descricao ?? (l.depois as any)?.nome ?? ""}</div></td>
            <td className="td text-sm"><DescricaoMudanca l={l} /></td>
            <td className="td text-sm text-amber-700">{l.motivo ?? ""}</td>
          </tr>
        ))}
      </Table>
      <p className="mt-3 text-xs text-slate-500">O histórico é gravado pelo banco de dados a cada alteração e não pode ser editado nem apagado por ninguém.</p>
    </div>
  );
}
