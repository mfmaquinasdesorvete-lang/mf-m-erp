// Vendas → Propostas do Tiny: o histórico de propostas comerciais do Tiny da MF (com valores) e da My Frost, a empresa
// anterior (sem valores). Filtra por empresa, situação e vendedor; abre a proposta; a da MF pode virar um orçamento novo.
import { useMemo, useState } from "react";
import { ChevronRight, FileDown, FilePlus2, Tags, Upload } from "lucide-react";
import { Button, CelulaAbrir, Modal, Table } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { AplicarMarcadores, BotaoMarcadores, ChipsMarcadores, SelectMarcador, useMarcadores } from "@/components/nfe/Marcadores";
import { usePerfil } from "@/lib/auth";
import { brl, dataBR, hoje, somarDias } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { combinaBusca } from "@/lib/buscaCliente";
import type { Item } from "@/lib/types";
import {
  contatoDaProposta, EMPRESA_PROPOSTA, grupoSituacao, nomeCliente, ROTULO_ABA_SITUACAO, situacaoPadrao, SITUACOES_TINY, corSituacao,
  type EmpresaProposta, type PropostaTiny,
} from "@/lib/propostasTiny";
import { ImportarPropostasTiny } from "./ImportarPropostasTiny";

const SELECT = "*, cliente:clientes(id, nome, nome_fantasia, codigo, cpf_cnpj, municipio, uf)";

export function SeloSituacao({ s }: { s: string | null }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${corSituacao(s)}`}>{s || "sem situação"}</span>;
}
export function SeloEmpresa({ e }: { e: EmpresaProposta }) {
  return e === "mf"
    ? <span className="whitespace-nowrap rounded-md bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold text-sky-800">MF</span>
    : <span className="whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800" title="Empresa anterior: proposta sem valores">MY FROST</span>;
}
const resumoItens = (p: PropostaTiny) => p.itens.map((i) => `${Number(i.quantidade) !== 1 ? `${Number(i.quantidade).toLocaleString("pt-BR")} × ` : ""}${i.descricao}`).join(" · ");

function exportar(lista: PropostaTiny[]) {
  const props = lista.map((p) => ({
    Empresa: EMPRESA_PROPOSTA[p.empresa], Número: p.numero ?? "", Data: celula(p.data), Situação: p.situacao ?? "", Cliente: nomeCliente(p),
    "CPF/CNPJ": p.cliente?.cpf_cnpj ?? "", Cidade: [p.cliente?.municipio, p.cliente?.uf].filter(Boolean).join("/"), Vendedor: p.vendedor ?? "",
    "Próximo contato": celula(p.proximo_contato), Itens: resumoItens(p),
    Desconto: p.empresa === "mf" ? Number(p.desconto ?? 0) : "", Frete: p.empresa === "mf" ? Number(p.frete ?? 0) : "", Total: p.empresa === "mf" ? Number(p.total ?? 0) : "",
  }));
  const itens = lista.flatMap((p) => p.itens.map((i) => ({
    Empresa: EMPRESA_PROPOSTA[p.empresa], Proposta: p.numero ?? "", Cliente: nomeCliente(p), Item: i.descricao, Quantidade: Number(i.quantidade),
    Unitário: p.empresa === "mf" ? Number(i.valor_unitario ?? 0) : "", Total: p.empresa === "mf" ? Number(i.quantidade) * Number(i.valor_unitario ?? 0) : "",
  })));
  baixarPlanilha("propostas-tiny", [{ nome: "Propostas", linhas: props }, { nome: "Itens", linhas: itens }]).catch(notifyError);
}

type Aba = "todas" | "contatar" | string;
const COR_CONTATO = { atrasado: "text-red-600 font-semibold", hoje: "text-amber-700 font-semibold", futuro: "text-slate-600" } as const;

export function PropostasTiny({ onNovoOrcamento }: { onNovoOrcamento?: (clienteId: string, itens: Item[]) => void }) {
  const { papel } = usePerfil();
  const { data: todas = [], isLoading, error } = useRows<PropostaTiny>("propostas_tiny", { select: SELECT, order: "data", ascending: false });
  const { data: marcadores = [] } = useMarcadores();
  const [empresa, setEmpresa] = useState<EmpresaProposta | "todas">("todas");
  const [aba, setAba] = useState<Aba>("todas");
  const [vendedor, setVendedor] = useState("");
  const [marcador, setMarcador] = useState("");
  const [busca, setBusca] = useState("");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [importar, setImportar] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [marcando, setMarcando] = useState(false);
  const dia = hoje();

  const vendedores = useMemo(() => [...new Set(todas.map((p) => p.vendedor).filter(Boolean) as string[])].sort(), [todas]);
  const daEmpresa = todas.filter((p) => empresa === "todas" || p.empresa === empresa);
  const contatar = (p: PropostaTiny) => { const c = contatoDaProposta(p, dia); return c === "atrasado" || c === "hoje"; };
  const abas = useMemo(() => {
    const n = (s: string) => daEmpresa.filter((p) => situacaoPadrao(p.situacao) === s).length;
    return [
      { id: "todas", rotulo: "Todas", n: daEmpresa.length },
      { id: "contatar", rotulo: "Contatar hoje", n: daEmpresa.filter(contatar).length },
      ...SITUACOES_TINY.map((s) => ({ id: s as string, rotulo: ROTULO_ABA_SITUACAO[s], n: n(s) })),
    ].filter((x) => x.n > 0 || x.id === "todas" || x.id === aba);
  }, [daEmpresa, aba, dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const lista = useMemo(() => {
    const l = daEmpresa.filter((p) =>
      (aba === "todas" || (aba === "contatar" ? contatar(p) : situacaoPadrao(p.situacao) === aba)) &&
      (!vendedor || p.vendedor === vendedor) && (!marcador || (p.marcadores ?? []).includes(marcador)) &&
      (!busca || combinaBusca([p.numero, nomeCliente(p), p.contato_nome, p.cliente?.cpf_cnpj, p.cliente?.municipio, p.vendedor, ...p.itens.map((i) => i.descricao)], busca)));
    // na aba "Contatar hoje", o contato mais atrasado primeiro
    return aba === "contatar" ? [...l].sort((x, y) => String(x.proximo_contato).localeCompare(String(y.proximo_contato))) : l;
  }, [daEmpresa, aba, vendedor, marcador, busca, dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const mf = lista.filter((p) => p.empresa === "mf");
  const fechadasMf = mf.filter((p) => grupoSituacao(p.situacao) === "fechada");
  const abertasMf = mf.filter((p) => grupoSituacao(p.situacao) === "aberta");
  const aberta = abertaId ? todas.find((p) => p.id === abertaId) ?? null : null;
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosMarcados = lista.length > 0 && lista.every((p) => sel.has(p.id));

  const chip = (ativo: boolean) => `shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${ativo ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300"}`;
  const ProxContato = ({ p }: { p: PropostaTiny }) => {
    if (!p.proximo_contato) return <span className="text-slate-400">—</span>;
    const c = contatoDaProposta(p, dia);
    return <span className={`whitespace-nowrap ${c ? COR_CONTATO[c] : "text-slate-500"}`}>{dataBR(p.proximo_contato)}{c === "hoje" ? " · hoje" : c === "atrasado" ? " · atrasado" : ""}</span>;
  };

  return (
    <div>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input max-w-md" placeholder="Buscar nº, cliente, CPF/CNPJ, cidade ou item…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {vendedores.length > 1 && (
            <select className="input w-auto" aria-label="Vendedor" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <SelectMarcador valor={marcador} onChange={setMarcador} todos={marcadores} />
          <span className="hidden flex-1 sm:block" />
          <Button variant="secondary" disabled={!lista.length} onClick={() => exportar(lista)}><FileDown size={16} /> Exportar</Button>
          {papel === "admin" && <Button variant="secondary" onClick={() => setImportar(true)}><Upload size={16} /> Importar do Tiny</Button>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["todas", "mf", "my_frost"] as const).map((e) => (
            <button key={e} type="button" className={chip(empresa === e)} onClick={() => setEmpresa(e)}>
              {e === "todas" ? "Todas as empresas" : e === "mf" ? "MF" : "My Frost"} <span className="num ml-1 opacity-90">{e === "todas" ? todas.length : todas.filter((p) => p.empresa === e).length}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Situação das propostas">
          {abas.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={aba === x.id} onClick={() => { setAba(x.id); setSel(new Set()); }}
              className={`shrink-0 border-b-2 px-3 pb-2 pt-1 text-sm font-semibold transition ${aba === x.id ? "border-brand text-fg" : "border-transparent text-slate-500 hover:text-fg"} ${x.id === "contatar" && x.n > 0 && aba !== x.id ? "!text-amber-700" : ""}`}>
              {x.rotulo} <span className="num block text-xs font-bold opacity-80">{String(x.n).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        {mf.length > 0 && (
          <p className="text-sm text-slate-600">
            MF nesta lista: {fechadasMf.length} viraram venda ({brl(fechadasMf.reduce((s, p) => s + Number(p.total ?? 0), 0))}) e {abertasMf.length} em aberto ({brl(abertasMf.reduce((s, p) => s + Number(p.total ?? 0), 0))}).
          </p>
        )}
        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-sm">
            <span className="font-semibold text-fg">{sel.size} {sel.size === 1 ? "proposta selecionada" : "propostas selecionadas"}</span>
            <Button variant="secondary" onClick={() => setMarcando(true)}><Tags size={15} /> Marcadores</Button>
            <Button variant="ghost" onClick={() => setSel(new Set())}>Limpar seleção</Button>
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar as propostas: {(error as Error).message}</p>}
      {!isLoading && !error && !todas.length && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-600">
          <p className="font-semibold text-fg">Nenhuma proposta do Tiny ainda.</p>
          <p className="mt-1 text-sm">{papel === "admin" ? "Use \"Importar do Tiny\" com a planilha de propostas exportada do Tiny." : "O administrador importa a planilha de propostas exportada do Tiny."}</p>
        </div>
      )}

      {/* Celular: cartões */}
      <div className="space-y-2 md:hidden">
        {lista.map((p) => (
          <div key={p.id} className={`relative rounded-xl border bg-surface shadow-card ${sel.has(p.id) ? "border-brand" : "border-slate-200"}`}>
            <input type="checkbox" className="absolute right-3 top-3 h-5 w-5" checked={sel.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Selecionar proposta ${p.numero ?? ""}`} />
            <button type="button" onClick={() => setAbertaId(p.id)} className="w-full p-4 pr-11 text-left active:bg-slate-50">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 font-bold text-fg [overflow-wrap:anywhere]">#{p.numero ?? "—"} <SeloEmpresa e={p.empresa} /> · {nomeCliente(p)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5"><SeloSituacao s={p.situacao} /><ChipsMarcadores ids={p.marcadores} todos={marcadores} pequeno /></div>
              <div className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">{resumoItens(p)}</div>
              <div className="mt-1 flex items-center justify-between gap-2 text-sm text-slate-500">
                <span>{dataBR(p.data)}{p.vendedor ? ` · ${p.vendedor}` : ""}</span>
                {p.empresa === "mf" ? <span className="num text-base font-bold text-fg">{brl(p.total)}</span> : <span className="text-xs">sem valores</span>}
              </div>
              {p.proximo_contato && <div className="mt-1 text-sm">Próximo contato: <ProxContato p={p} /></div>}
              <div className="mt-2 flex items-center justify-end gap-0.5 text-sm font-semibold text-brand">Ver <ChevronRight size={16} /></div>
            </button>
          </div>
        ))}
      </div>

      <div className="hidden md:block">
        {todas.length > 0 && (
          <Table empty={!isLoading && !lista.length}
            head={<>
              <th className="th w-10"><input type="checkbox" className="h-4 w-4" checked={todosMarcados} aria-label="Selecionar todas"
                onChange={() => setSel(todosMarcados ? new Set() : new Set(lista.map((p) => p.id)))} /></th>
              <th className="th">Nº</th><th className="th">Data</th><th className="th">Próx. contato</th><th className="th">Cliente</th><th className="th">Itens</th>
              <th className="th text-right">Valor</th><th className="th">Marcadores</th><th className="th">Situação</th><th className="th" />
            </>}>
            {lista.map((p) => (
              <tr key={p.id} className={`cursor-pointer hover:bg-slate-50 ${sel.has(p.id) ? "bg-brand-light/30" : ""}`} onClick={() => setAbertaId(p.id)}>
                <td className="td" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="h-4 w-4" checked={sel.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Selecionar proposta ${p.numero ?? ""}`} /></td>
                <td className="td whitespace-nowrap font-medium">#{p.numero ?? "—"} <SeloEmpresa e={p.empresa} /></td>
                <td className="td whitespace-nowrap">{dataBR(p.data)}</td>
                <td className="td"><ProxContato p={p} /></td>
                <td className="td">{nomeCliente(p)}<div className="text-xs text-slate-500">{[p.cliente?.municipio, p.cliente?.uf].filter(Boolean).join("/")}{p.vendedor ? ` · ${p.vendedor}` : ""}</div></td>
                <td className="td max-w-[260px] text-sm text-slate-600"><span className="line-clamp-2">{resumoItens(p)}</span></td>
                <td className="td whitespace-nowrap text-right font-medium">{p.empresa === "mf" ? brl(p.total) : <span className="text-xs font-normal text-slate-500">sem valores</span>}</td>
                <td className="td"><ChipsMarcadores ids={p.marcadores} todos={marcadores} pequeno /></td>
                <td className="td"><SeloSituacao s={p.situacao} /></td>
                <CelulaAbrir texto="Ver" />
              </tr>
            ))}
          </Table>
        )}
      </div>

      {aberta && <DetalheProposta p={aberta} onClose={() => setAbertaId(null)}
        onNovoOrcamento={onNovoOrcamento && aberta.empresa === "mf" && aberta.cliente_id ? (itens) => { setAbertaId(null); onNovoOrcamento(aberta.cliente_id!, itens); } : undefined} />}
      {importar && <ImportarPropostasTiny onClose={() => setImportar(false)} />}
      {marcando && <AplicarMarcadores tabela="propostas_tiny" notas={todas.filter((p) => sel.has(p.id))} nome={["proposta", "propostas"]} onClose={() => setMarcando(false)} />}
    </div>
  );
}

/** Próximo contato e situação da proposta, mudados no ERP (o resto continua como veio do Tiny). */
function AcompanharProposta({ p }: { p: PropostaTiny }) {
  const { tem } = usePerfil();
  const invalidate = useInvalidate();
  const [data, setData] = useState(p.proximo_contato?.slice(0, 10) ?? "");
  const [situacao, setSituacao] = useState(situacaoPadrao(p.situacao));
  const [salvando, setSalvando] = useState(false);
  const pode = tem("vendas", "financeiro");
  const mudou = data !== (p.proximo_contato?.slice(0, 10) ?? "") || situacao !== situacaoPadrao(p.situacao);
  const opcoes = [...new Set([...SITUACOES_TINY, situacaoPadrao(p.situacao)])];
  async function salvar() {
    setSalvando(true);
    try {
      const { error } = await supabase.from("propostas_tiny").update({ proximo_contato: data || null, situacao }).eq("id", p.id);
      if (error) throw error;
      notify("Proposta atualizada");
      invalidate("propostas_tiny");
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }
  const mais = (d: number) => setData(somarDias(d));
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-600">Próximo contato</span>
        <input type="date" className="input w-auto" value={data} disabled={!pode} onChange={(e) => setData(e.target.value)} />
      </label>
      {pode && (
        <span className="flex gap-1 pb-1">
          {[1, 3, 7, 15].map((d) => <button key={d} type="button" onClick={() => mais(d)} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-white">+{d}d</button>)}
        </span>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-600">Situação</span>
        <select className="input w-auto" value={situacao} disabled={!pode} onChange={(e) => setSituacao(e.target.value)}>
          {opcoes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <span className="flex-1" />
      <BotaoMarcadores tabela="propostas_tiny" registro={p} nome={["proposta", "propostas"]} />
      {pode && <Button type="button" disabled={!mudou || salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</Button>}
    </div>
  );
}

export function DetalheProposta({ p, onClose, onNovoOrcamento }: { p: PropostaTiny; onClose: () => void; onNovoOrcamento?: (itens: Item[]) => void }) {
  const mf = p.empresa === "mf";
  const comProduto = p.itens.filter((i) => i.produto_id);
  return (
    <Modal open onClose={onClose} title={`Proposta ${p.numero ?? ""} do Tiny · ${mf ? "MF" : "My Frost"}`} wide>
      <div className="space-y-4 text-[15px] [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center gap-2">
          <SeloSituacao s={p.situacao} />
          <span className="text-slate-600">{dataBR(p.data)}{p.vendedor ? ` · ${p.vendedor}` : ""}</span>
          <MarcadoresDaProposta ids={p.marcadores} />
        </div>
        <AcompanharProposta p={p} />
        <div>
          <div className="font-semibold text-fg">{nomeCliente(p)}</div>
          <div className="text-sm text-slate-600">{[p.cliente?.municipio, p.cliente?.uf].filter(Boolean).join("/")}{p.aos_cuidados ? ` · aos cuidados de ${p.aos_cuidados}` : ""}</div>
        </div>
        {!mf && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Proposta da My Frost (empresa anterior): fica como histórico de atendimento, sem valores nem condições. A MF não responde por ela.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-1.5 pr-2">Item</th><th className="py-1.5 pr-2 text-right">Qtd</th>
              {mf && <><th className="py-1.5 pr-2 text-right">Unitário</th><th className="py-1.5 text-right">Total</th></>}
            </tr></thead>
            <tbody>
              {p.itens.map((i, k) => (
                <tr key={k} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2">{i.descricao}{mf && !i.produto_id && <span className="ml-1 text-xs text-slate-400">(sem cadastro no ERP)</span>}</td>
                  <td className="num py-1.5 pr-2 text-right">{Number(i.quantidade).toLocaleString("pt-BR")}</td>
                  {mf && <><td className="num py-1.5 pr-2 text-right">{brl(i.valor_unitario)}</td><td className="num py-1.5 text-right">{brl(Number(i.quantidade) * Number(i.valor_unitario ?? 0))}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mf && (
          <div className="ml-auto max-w-xs space-y-0.5 text-sm">
            {Number(p.desconto) > 0 && <div className="flex justify-between"><span>Desconto</span><span className="num">- {brl(p.desconto)}</span></div>}
            {Number(p.frete) > 0 && <div className="flex justify-between"><span>Frete</span><span className="num">{brl(p.frete)}</span></div>}
            <div className="flex justify-between text-base font-bold text-fg"><span>Total</span><span className="num">{brl(p.total)}</span></div>
          </div>
        )}
        {mf && (p.prazo_entrega || p.validade_dias) && (
          <p className="text-sm text-slate-700">{[p.prazo_entrega && `Prazo de entrega: ${p.prazo_entrega}`, p.validade_dias ? `Validade: ${p.validade_dias} dias` : ""].filter(Boolean).join(" · ")}</p>
        )}
        {mf && p.observacoes && (
          <details className="rounded-xl border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-fg">Condições e observações</summary>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">{p.observacoes}</p>
          </details>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {onNovoOrcamento && comProduto.length > 0 && (
            <Button variant="secondary" title="Abre um orçamento novo com os itens e os preços desta proposta (confira os preços)"
              onClick={() => onNovoOrcamento(comProduto.map((i) => ({ produto_id: i.produto_id!, descricao: i.descricao, quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario ?? 0) })))}>
              <FilePlus2 size={16} /> Novo orçamento com estes itens
            </Button>
          )}
          <Button onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  );
}

function MarcadoresDaProposta({ ids }: { ids?: string[] | null }) {
  const { data: todos = [] } = useMarcadores();
  return <ChipsMarcadores ids={ids} todos={todos} />;
}
