// Dinheiro entre as contas da própria MF, com os sócios e com as empresas ligadas (partes relacionadas), separado
// do resto como o combustível. Vem dos extratos dos bancos; quem é sócio ou empresa ligada (CPF/CNPJ e o nome como
// aparece no extrato) é cadastrado aqui pelo administrador e fica só no banco. O mesmo lançamento em duas contas conta uma vez.
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Building2, Download, Pencil, Plus, User, Users } from "lucide-react";
import { Button, Card, Field, Modal, nomeMes, PageHeader, Stat, Table } from "@/components/ui";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { mesDoPeriodo, noPeriodo, periodoDoAtalho, periodoDoMes, rotuloPeriodo, SEM_PERIODO, temPeriodo, type Periodo } from "@/lib/filtroLista";
import { limpar, useRows, useSave } from "@/lib/data";
import { useUnidade } from "@/lib/unidade";
import { usePerfil } from "@/lib/auth";
import { brl, dataBR, hoje, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { baixarPlanilha } from "@/lib/exportar";
import { semRepetidos, transferenciasInternas } from "@/lib/extratoTipos";
import { classificar, COMO, mascararDocumento, soDigitos, totais, type Achado, type Parte } from "@/lib/partesRelacionadas";

type Conta = { id: string; nome: string; unidade_id: string; ativo: boolean };
type Lanc = { id: string; conta_bancaria_id: string; data: string; valor: number; descricao: string | null; identificador?: string | null; status: string };
type Unidade = { id: string; razao_social: string | null; cnpj: string | null };
type Linha = Lanc & { achado: Achado };

const ENTRE = "entre_contas";
const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ROTULO_STATUS: Record<string, string> = { pendente: "Para conciliar", conciliado: "Conciliado", transferencia: "Transferência", ignorado: "Ignorado" };

export default function PartesRelacionadas() {
  const { filtrar } = useUnidade();
  const admin = usePerfil().papel === "admin";
  const { data: contasTodas = [] } = useRows<Conta>("contas_bancarias", { order: "nome", ascending: true });
  const contas = filtrar(contasTodas).filter((c) => c.ativo);
  const { data: lancamentos = [] } = useRows<Lanc>("extrato_lancamentos", { order: "data", ascending: false });
  const { data: unidades = [] } = useRows<Unidade>("unidades", { select: "id, razao_social, cnpj", order: "nome", ascending: true, key: ["partes"] });
  const { data: partes = [], error: erroPartes } = useRows<Parte>("partes_relacionadas", { order: "nome", ascending: true });

  // abre no mês atual; tocar num mês do "Mês a mês" escolhe o mês inteiro
  const [faixa, setFaixa] = useState<Periodo>(() => periodoDoAtalho("mes", hoje()));
  const mes = mesDoPeriodo(faixa);
  const [grupo, setGrupo] = useState(""); // "" = todos, ENTRE ou o id da parte
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Partial<Parte> | null>(null);

  const nomeConta = (id: string) => contasTodas.find((c) => c.id === id)?.nome ?? "—";
  const nomeParte = (id: string) => partes.find((p) => p.id === id)?.nome ?? "—";
  const nomeGrupo = (a: Achado) => (a.grupo === "parte" ? nomeParte(a.parte) : "Entre nossas contas");
  const chave = (a: Achado) => (a.grupo === "parte" ? a.parte : ENTRE);

  // todos os lançamentos do painel (todos os meses), já sem o mesmo extrato importado duas vezes
  const todas = useMemo(() => {
    const ids = new Set(contas.map((c) => c.id));
    const propria = {
      nomes: [...new Set(unidades.map((u) => u.razao_social ?? "").filter(Boolean))],
      documentos: unidades.map((u) => soDigitos(u.cnpj)).filter(Boolean),
    };
    const doPainel = semRepetidos(lancamentos.filter((l) => ids.has(l.conta_bancaria_id)));
    const pares = transferenciasInternas(doPainel);
    const out: Linha[] = [];
    for (const l of doPainel) {
      const achado = classificar(l, partes, propria) ?? (pares.has(l.id) ? { grupo: "entre_contas", como: "par" } as Achado : null);
      if (achado) out.push({ ...l, achado });
    }
    return out;
  }, [lancamentos, contas, unidades, partes]); // eslint-disable-line react-hooks/exhaustive-deps

  const casa = (l: Linha) => !busca.trim() || sem(l.descricao).includes(sem(busca.trim())) || sem(nomeConta(l.conta_bancaria_id)).includes(sem(busca.trim()));
  const doPeriodo = todas.filter((l) => noPeriodo(l.data, faixa) && casa(l));
  const filtradas = doPeriodo.filter((l) => !grupo || chave(l.achado) === grupo);

  const grupos = useMemo(() => {
    const g = [{ id: ENTRE, nome: "Entre nossas contas", icone: ArrowLeftRight, tom: "info" as const, sub: "Pix e TED de uma conta da MF para outra" }];
    for (const p of partes.filter((x) => x.ativo !== false)) {
      g.push({ id: p.id, nome: p.nome, icone: p.tipo === "socio" ? User : Building2, tom: "info" as const,
        sub: p.tipo === "socio" ? "Sócio(a)" : "Empresa ligada" });
    }
    return g;
  }, [partes]);

  const porMes = useMemo(() => {
    const m = new Map<string, { entrou: number; saiu: number }>();
    for (const l of todas.filter((x) => (!grupo || chave(x.achado) === grupo) && casa(x))) {
      const k = l.data.slice(0, 7); const x = m.get(k) ?? { entrou: 0, saiu: 0 };
      if (Number(l.valor) > 0) x.entrou += Number(l.valor); else x.saiu -= Number(l.valor);
      m.set(k, x);
    }
    return [...m].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [todas, grupo, busca]); // eslint-disable-line react-hooks/exhaustive-deps
  const maiorMes = Math.max(1, ...porMes.map(([, x]) => Math.max(x.entrou, x.saiu)));

  const periodo = mes ? nomeMes(mes) : temPeriodo(faixa) ? rotuloPeriodo(faixa, hoje()).toLowerCase() : "todo o extrato importado";
  const t = totais(filtradas);

  const exportar = () => baixarPlanilha(`partes-relacionadas${mes ? `-${mes}` : faixa.de ? `-${faixa.de}` : ""}`, [{
    nome: "Lançamentos",
    linhas: filtradas.map((l) => ({
      Data: dataBR(l.data), Conta: nomeConta(l.conta_bancaria_id), Quem: nomeGrupo(l.achado), "Como identificou": COMO[l.achado.como],
      Descrição: l.descricao ?? "", Entrou: Number(l.valor) > 0 ? Number(l.valor) : "", Saiu: Number(l.valor) < 0 ? -Number(l.valor) : "", Situação: ROTULO_STATUS[l.status] ?? l.status,
    })),
  }]);

  return (
    <div>
      <PageHeader title="Entre contas, sócios e empresas ligadas"
        subtitle="O dinheiro que vai e vem entre as contas da MF, os sócios e as empresas ligadas, separado do resto (vem dos extratos dos bancos)" />

      <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar na descrição ou conta" periodo={faixa} onPeriodo={setFaixa} rotuloData="Data"
        nFiltros={grupo ? 1 : 0} onLimpar={() => { setBusca(""); setGrupo(""); setFaixa(SEM_PERIODO); }}
        direita={<Button type="button" variant="secondary" onClick={exportar} disabled={!filtradas.length}><Download size={16} aria-hidden /> Exportar</Button>} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {grupos.map((g) => {
          const x = totais(doPeriodo.filter((l) => chave(l.achado) === g.id));
          const ativo = grupo === g.id;
          return (
            <button key={g.id} type="button" onClick={() => setGrupo(ativo ? "" : g.id)} aria-pressed={ativo}
              className={`rounded-2xl border bg-surface p-4 text-left shadow-sm transition hover:shadow-pop ${ativo ? "border-brand ring-2 ring-brand/40" : "border-slate-200"}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${g.id === ENTRE ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}><g.icone size={18} aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block font-bold text-fg [overflow-wrap:anywhere]">{g.nome}</span>
                  <span className="block text-xs text-slate-500">{g.sub} · {x.n} {pl(x.n, "lançamento", "lançamentos")}</span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><div className="text-xs text-slate-500">Entrou na MF</div><div className="num font-semibold text-emerald-700">{brl(x.entrou)}</div></div>
                <div><div className="text-xs text-slate-500">Saiu da MF</div><div className="num font-semibold text-red-600">{brl(x.saiu)}</div></div>
                <div><div className="text-xs text-slate-500">{g.id === ENTRE ? "Diferença" : "Saldo"}</div>
                  <div className={`num font-bold ${x.saldo >= 0 ? "text-fg" : "text-red-700"}`}>{brl(x.saldo)}</div></div>
              </div>
            </button>
          );
        })}
      </div>

      {grupo === ENTRE && Math.abs(t.saldo) > 0.01 && (
        <Card className="mb-4 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Entre as contas da MF o que sai de uma entra na outra: a diferença de {brl(t.saldo)} {periodo === "todo o extrato importado" ? "" : `(${periodo}) `}
          costuma ser extrato que falta importar (a outra ponta está num banco sem extrato no ERP) ou Pix para uma conta da MF que não está cadastrada.
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-bold text-fg">Mês a mês <span className="text-sm font-normal text-slate-500">· {grupo ? (grupo === ENTRE ? "entre nossas contas" : nomeParte(grupo)) : "todos"}</span></h2>
          {!porMes.length ? <p className="text-sm text-slate-500">Nada nos extratos importados.</p> : (
            <ul className="space-y-2">
              {porMes.map(([m, x]) => (
                <li key={m}>
                  <button type="button" onClick={() => setFaixa(mes === m ? SEM_PERIODO : periodoDoMes(m))} className={`w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-slate-50 ${mes === m ? "ring-2 ring-brand/40" : ""}`}>
                    <div className="flex flex-wrap justify-between gap-x-3"><span className="font-semibold text-fg">{nomeMes(m)}</span>
                      <span className="num whitespace-nowrap"><span className="text-emerald-700">+{brl(x.entrou)}</span> · <span className="text-red-600">−{brl(x.saiu)}</span></span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(1, (x.entrou / maiorMes) * 100)}%` }} /></div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-red-500" style={{ width: `${Math.max(1, (x.saiu / maiorMes) * 100)}%` }} /></div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-bold text-fg">Sócios e empresas ligadas</h2>
            {admin && <Button type="button" className="!min-h-0 !py-1.5" onClick={() => setEditando({ tipo: "empresa", documentos: [], nomes_extrato: [], ativo: true })}><Plus size={16} aria-hidden /> Cadastrar</Button>}
          </div>
          {erroPartes ? <p className="text-sm text-slate-500">Só o administrador, o financeiro e o contador veem esta lista.</p>
            : !partes.length ? <p className="text-sm text-slate-500">Ninguém cadastrado. {admin ? "Cadastre o CPF de cada sócio e o CNPJ das empresas ligadas (matriz e filial na mesma linha)." : "Peça ao administrador para cadastrar."}</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {partes.map((p) => (
                <li key={p.id} className={`flex items-start justify-between gap-2 py-2 ${p.ativo === false ? "opacity-60" : ""}`}>
                  <span className="min-w-0">
                    <b className="text-fg [overflow-wrap:anywhere]">{p.nome}</b>
                    <span className="text-slate-500"> · {p.tipo === "socio" ? "sócio(a)" : "empresa ligada"}{p.ativo === false ? " · fora do painel" : ""}</span>
                    <span className="block text-xs text-slate-500">{p.documentos.map(mascararDocumento).join(" · ") || "sem CPF/CNPJ"}</span>
                    {p.nomes_extrato.length > 0 && <span className="block text-xs text-slate-500">No extrato: {p.nomes_extrato.join(" · ")}</span>}
                  </span>
                  {admin && <button type="button" onClick={() => setEditando(p)} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Editar ${p.nome}`}><Pencil size={16} aria-hidden /></button>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Entre nossas contas: Pix/TED com o nome ou o CNPJ da MF, o que foi marcado como transferência na <Link to="/conciliacao" className="text-brand hover:underline">conciliação</Link> e
            o mesmo valor saindo de uma conta e entrando em outra no mesmo dia ou no seguinte.
          </p>
        </Card>
      </div>

      <h2 className="mb-2 font-bold text-fg">Lançamentos <span className="text-sm font-normal text-slate-500">· {periodo} · {t.n} {pl(t.n, "lançamento", "lançamentos")}{grupo ? ` · ${grupo === ENTRE ? "entre nossas contas" : nomeParte(grupo)}` : ""}</span></h2>
      <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Entrou na MF" valor={brl(t.entrou)} icon={Users} tom="bom" />
        <Stat label="Saiu da MF" valor={brl(t.saiu)} icon={Users} tom="atencao" />
        <Stat label="Saldo (entrou − saiu)" valor={brl(t.saldo)} icon={ArrowLeftRight} tom={t.saldo >= 0 ? "info" : "critico"} />
      </div>
      <Table empty={!filtradas.length} head={<><th className="th">Data</th><th className="th">Quem</th><th className="th">Descrição</th><th className="th">Conta</th><th className="th text-right">Valor</th><th className="th">Situação</th></>}>
        {filtradas.slice(0, 500).map((l) => (
          <tr key={l.id}>
            <td className="td whitespace-nowrap">{dataBR(l.data)}</td>
            <td className="td"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${l.achado.grupo === "parte" ? "bg-violet-50 text-violet-800 ring-violet-200" : "bg-sky-50 text-sky-800 ring-sky-200"}`}>{nomeGrupo(l.achado)}</span>
              <span className="block text-xs text-slate-500">{COMO[l.achado.como]}</span></td>
            <td className="td min-w-0 text-sm [overflow-wrap:anywhere]">{l.descricao}</td>
            <td className="td text-sm text-slate-600">{nomeConta(l.conta_bancaria_id)}</td>
            <td className={`td num whitespace-nowrap text-right font-semibold ${Number(l.valor) >= 0 ? "text-emerald-700" : "text-red-600"}`}>{brl(Number(l.valor))}</td>
            <td className="td whitespace-nowrap text-sm">{ROTULO_STATUS[l.status] ?? l.status}</td>
          </tr>
        ))}
      </Table>
      {filtradas.length > 500 && <p className="mt-2 text-xs text-slate-500">Mostrando 500 de {filtradas.length}. Escolha um mês ou use Exportar para ver tudo.</p>}

      {editando && <CadastroParte parte={editando} onClose={() => setEditando(null)} />}
    </div>
  );
}

/** Cadastro de sócio ou empresa ligada (só o administrador). CPF/CNPJ e nomes um por linha. */
function CadastroParte({ parte, onClose }: { parte: Partial<Parte>; onClose: () => void }) {
  const salvar = useSave("partes_relacionadas");
  const [nome, setNome] = useState(parte.nome ?? "");
  const [tipo, setTipo] = useState<Parte["tipo"]>(parte.tipo ?? "empresa");
  const [docs, setDocs] = useState((parte.documentos ?? []).join("\n"));
  const [nomesExtrato, setNomesExtrato] = useState((parte.nomes_extrato ?? []).join("\n"));
  const [ativo, setAtivo] = useState(parte.ativo !== false);

  const linhas = (s: string) => s.split(/[\n;,]+/).map((x) => x.trim()).filter(Boolean);
  const documentos = linhas(docs).map(soDigitos);
  const invalidos = documentos.filter((d) => d.length !== 11 && d.length !== 14);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return notify("Escreva o nome", "erro");
    if (invalidos.length) return notify("CPF tem 11 números e CNPJ tem 14", "erro");
    try {
      await salvar.mutateAsync(limpar({ id: parte.id, nome: nome.trim(), tipo, documentos: [...new Set(documentos)], nomes_extrato: linhas(nomesExtrato), ativo }));
      notify(parte.id ? "Cadastro atualizado" : "Cadastrado: os lançamentos já aparecem no painel");
      onClose();
    } catch (err) { notifyError(err); }
  };

  return (
    <Modal open onClose={onClose} title={parte.id ? `Editar ${parte.nome}` : "Cadastrar sócio ou empresa ligada"}>
      <form onSubmit={enviar} className="space-y-3">
        <Field label="Nome"><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus /></Field>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-slate-700">Tipo</legend>
          <div className="flex flex-wrap gap-2">
            {([["socio", "Sócio(a)"], ["empresa", "Empresa ligada"]] as const).map(([v, r]) => (
              <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tipo === v ? "border-brand bg-brand/5" : "border-slate-200"}`}>
                <input type="radio" name="tipo" checked={tipo === v} onChange={() => setTipo(v)} /> {r}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="CPF ou CNPJ (um por linha: matriz e filial juntas)">
          <textarea className="input min-h-[4.5rem]" value={docs} onChange={(e) => setDocs(e.target.value)} inputMode="numeric" placeholder="00.000.000/0001-00" />
        </Field>
        {invalidos.length > 0 && <p className="text-sm text-red-600">Confira: {invalidos.join(", ")} (CPF tem 11 números e CNPJ tem 14).</p>}
        <Field label="Como o nome aparece no extrato (opcional, um por linha)">
          <textarea className="input min-h-[4.5rem]" value={nomesExtrato} onChange={(e) => setNomesExtrato(e.target.value)} placeholder="Ex.: o nome que vem no Pix" />
        </Field>
        <p className="text-xs text-slate-500">O banco às vezes mostra o CPF/CNPJ só pela metade (•••.123.456-••): o ERP acha pelos números à mostra ou pelo nome.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Mostrar no painel</label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
