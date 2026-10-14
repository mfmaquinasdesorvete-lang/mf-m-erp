// Vendas → Propostas do Tiny: o histórico de propostas comerciais do Tiny da MF (com valores) e da My Frost, a empresa
// anterior (sem valores). Filtra por empresa, situação e vendedor; abre a proposta; a da MF pode virar um orçamento novo.
import { useMemo, useState } from "react";
import { ChevronRight, FileDown, FilePlus2, Upload } from "lucide-react";
import { Button, CelulaAbrir, Modal, Table } from "@/components/ui";
import { useRows } from "@/lib/data";
import { usePerfil } from "@/lib/auth";
import { brl, dataBR } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { combinaBusca } from "@/lib/buscaCliente";
import type { Item } from "@/lib/types";
import {
  corSituacao, EMPRESA_PROPOSTA, grupoSituacao, nomeCliente, ROTULO_GRUPO, type EmpresaProposta, type GrupoSituacao, type PropostaTiny,
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

export function PropostasTiny({ onNovoOrcamento }: { onNovoOrcamento?: (clienteId: string, itens: Item[]) => void }) {
  const { papel } = usePerfil();
  const { data: todas = [], isLoading, error } = useRows<PropostaTiny>("propostas_tiny", { select: SELECT, order: "data", ascending: false });
  const [empresa, setEmpresa] = useState<EmpresaProposta | "todas">("todas");
  const [grupo, setGrupo] = useState<GrupoSituacao | "todas">("todas");
  const [vendedor, setVendedor] = useState("");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<PropostaTiny | null>(null);
  const [importar, setImportar] = useState(false);

  const vendedores = useMemo(() => [...new Set(todas.map((p) => p.vendedor).filter(Boolean) as string[])].sort(), [todas]);
  const daEmpresa = todas.filter((p) => empresa === "todas" || p.empresa === empresa);
  const lista = useMemo(() => daEmpresa.filter((p) =>
    (grupo === "todas" || grupoSituacao(p.situacao) === grupo) &&
    (!vendedor || p.vendedor === vendedor) &&
    (!busca || combinaBusca([p.numero, nomeCliente(p), p.contato_nome, p.cliente?.cpf_cnpj, p.cliente?.municipio, p.vendedor, ...p.itens.map((i) => i.descricao)], busca)),
  ), [daEmpresa, grupo, vendedor, busca]);
  const mf = lista.filter((p) => p.empresa === "mf");
  const fechadasMf = mf.filter((p) => grupoSituacao(p.situacao) === "fechada");
  const abertasMf = mf.filter((p) => grupoSituacao(p.situacao) === "aberta");

  const chip = (ativo: boolean) => `shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${ativo ? "border-brand bg-brand text-brand-fg" : "border-slate-200 bg-surface text-slate-600 hover:border-slate-300"}`;

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
          <span className="hidden flex-1 sm:block" />
          <Button variant="secondary" disabled={!lista.length} onClick={() => exportar(lista)}><FileDown size={16} /> Exportar</Button>
          {papel === "admin" && <Button variant="secondary" onClick={() => setImportar(true)}><Upload size={16} /> Importar do Tiny</Button>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["todas", "mf", "my_frost"] as const).map((e) => (
            <button key={e} type="button" className={chip(empresa === e)} onClick={() => setEmpresa(e)}>
              {e === "todas" ? "Todas" : e === "mf" ? "MF" : "My Frost"} <span className="num ml-1 opacity-90">{e === "todas" ? todas.length : todas.filter((p) => p.empresa === e).length}</span>
            </button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-slate-200" aria-hidden />
          {(["todas", "aberta", "fechada", "perdida"] as const).map((g) => (
            <button key={g} type="button" className={chip(grupo === g)} onClick={() => setGrupo(g)}>
              {g === "todas" ? "Qualquer situação" : ROTULO_GRUPO[g]} <span className="num ml-1 opacity-90">{g === "todas" ? daEmpresa.length : daEmpresa.filter((p) => grupoSituacao(p.situacao) === g).length}</span>
            </button>
          ))}
        </div>
        {mf.length > 0 && (
          <p className="text-sm text-slate-600">
            MF nesta lista: {fechadasMf.length} viraram venda ({brl(fechadasMf.reduce((s, p) => s + Number(p.total ?? 0), 0))}) e {abertasMf.length} em aberto ({brl(abertasMf.reduce((s, p) => s + Number(p.total ?? 0), 0))}).
          </p>
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
          <button key={p.id} type="button" onClick={() => setAberta(p)}
            className="w-full rounded-xl border border-slate-200 bg-surface p-4 text-left shadow-card active:bg-slate-50">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 font-bold text-fg [overflow-wrap:anywhere]">#{p.numero ?? "—"} <SeloEmpresa e={p.empresa} /> · {nomeCliente(p)}</span>
              <SeloSituacao s={p.situacao} />
            </div>
            <div className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">{resumoItens(p)}</div>
            <div className="mt-1 flex items-center justify-between text-sm text-slate-500">
              <span>{dataBR(p.data)}{p.vendedor ? ` · ${p.vendedor}` : ""}</span>
              {p.empresa === "mf" ? <span className="num text-base font-bold text-fg">{brl(p.total)}</span> : <span className="text-xs">sem valores</span>}
            </div>
            <div className="mt-2 flex items-center justify-end gap-0.5 text-sm font-semibold text-brand">Ver <ChevronRight size={16} /></div>
          </button>
        ))}
      </div>

      <div className="hidden md:block">
        {todas.length > 0 && (
          <Table empty={!isLoading && !lista.length}
            head={<><th className="th">Nº</th><th className="th">Data</th><th className="th">Cliente</th><th className="th">Itens</th><th className="th">Situação</th><th className="th">Vendedor</th><th className="th text-right">Total</th><th className="th" /></>}>
            {lista.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberta(p)}>
                <td className="td whitespace-nowrap font-medium">#{p.numero ?? "—"} <SeloEmpresa e={p.empresa} /></td>
                <td className="td whitespace-nowrap">{dataBR(p.data)}</td>
                <td className="td">{nomeCliente(p)}<div className="text-xs text-slate-500">{[p.cliente?.municipio, p.cliente?.uf].filter(Boolean).join("/")}</div></td>
                <td className="td max-w-[320px] text-sm text-slate-600"><span className="line-clamp-2">{resumoItens(p)}</span></td>
                <td className="td"><SeloSituacao s={p.situacao} /></td>
                <td className="td text-sm">{p.vendedor ?? ""}</td>
                <td className="td whitespace-nowrap text-right font-medium">{p.empresa === "mf" ? brl(p.total) : <span className="text-xs font-normal text-slate-500">sem valores</span>}</td>
                <CelulaAbrir texto="Ver" />
              </tr>
            ))}
          </Table>
        )}
      </div>

      {aberta && <DetalheProposta p={aberta} onClose={() => setAberta(null)}
        onNovoOrcamento={onNovoOrcamento && aberta.empresa === "mf" && aberta.cliente_id ? (itens) => { setAberta(null); onNovoOrcamento(aberta.cliente_id!, itens); } : undefined} />}
      {importar && <ImportarPropostasTiny onClose={() => setImportar(false)} />}
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
          <span className="text-slate-600">{dataBR(p.data)}{p.vendedor ? ` · ${p.vendedor}` : ""}{p.proximo_contato ? ` · próximo contato ${dataBR(p.proximo_contato)}` : ""}</span>
        </div>
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
