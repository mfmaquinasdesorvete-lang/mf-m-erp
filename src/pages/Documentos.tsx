// Documentos (no jeito do site Cofre): duas partes — Docs da empresa e Parcelamentos.
// Docs da empresa: o que precisa de atenção (impostos e guias vencidos em aberto: confirmar), os pagos que ainda esperam o
// comprovante (Anexar na própria linha), os documentos da empresa por tipo (contratos, certificados, extratos) e todos
// os anexos do ERP com busca; ao lado, o acompanhamento com as dicas. Parcelamentos: a tela dos parcelamentos de impostos.
import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FileCheck2, FileText, FolderOpen, Info, KeyRound, Landmark, Paperclip, ReceiptText, ShieldCheck, Trash2, Upload, type LucideIcon } from "lucide-react";
import { Button, Card, Modal, PageHeader, Table, Tabs } from "@/components/ui";
import { Anexos, ENTIDADES, IconeArquivo, abrirDocumento, apagarDocumento, enviarDocumentos, tamanhoArquivo, type Documento } from "@/components/Anexos";
import { useInvalidate, useRows } from "@/lib/data";
import { brl, dataBR, hoje, pl, somarDias } from "@/lib/format";
import { notify } from "@/lib/notify";
import { BarraFiltros } from "@/components/filtros/BarraFiltros";
import { noPeriodo, semanaAtual, SEM_PERIODO, type Periodo } from "@/lib/filtroLista";
import { usePerfil } from "@/lib/auth";
import { useVisivel } from "@/lib/menu";
import { useAbaUrl } from "@/lib/abaUrl";
import { ehContaDeImposto, pagasSemComprovante, prazosParaConfirmar, tipoDocEmpresa, TIPOS_DOC_EMPRESA, type ContaDoc, type TipoDocEmpresa } from "@/lib/documentosPainel";

const Parcelamentos = lazy(() => import("@/pages/Parcelamentos"));
const GERAL = "00000000-0000-0000-0000-000000000000";
type Conta = ContaDoc & { categoria: string | null; fornecedor: { nome: string | null } | null };
const ICONE_TIPO: Record<TipoDocEmpresa, LucideIcon> = { contrato: FileText, certificado: KeyRound, extrato: Landmark, outro: Paperclip };

/** Cartão de uma parte da tela: título, explicação e a ação à direita (como no site). */
function Quadro({ titulo, texto, acao, destaque, children }: { titulo: string; texto?: string; acao?: ReactNode; destaque?: boolean; children: ReactNode }) {
  return (
    <Card className={`overflow-hidden ${destaque ? "border-t-2 border-t-purple-500" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-fg">{titulo}</h2>
          {texto && <p className="text-sm text-slate-600">{texto}</p>}
        </div>
        {acao}
      </div>
      {children}
    </Card>
  );
}

/** Lista vazia explicada ("Seu arquivo começa aqui"). */
function Vazio({ icone: Icone, titulo, texto }: { icone: LucideIcon; titulo: string; texto: string }) {
  return (
    <div className="px-6 pb-8 pt-4 text-center">
      <Icone size={30} className="mx-auto text-slate-400" aria-hidden />
      <p className="mt-2 font-bold text-fg">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{texto}</p>
    </div>
  );
}

export default function Documentos() {
  const vis = useVisivel();
  const veParcelamentos = vis.ve("contador", "/parcelamentos");
  const [aba, setAba] = useAbaUrl<"empresa" | "parcelamentos">("empresa", veParcelamentos ? ["empresa", "parcelamentos"] as const : ["empresa"] as const);
  return (
    <div>
      <PageHeader title="Documentos" subtitle="Os documentos da empresa, os comprovantes das contas e os parcelamentos, num lugar só." />
      {veParcelamentos && <Tabs value={aba} onChange={setAba} options={[{ value: "empresa", label: "Docs da empresa" }, { value: "parcelamentos", label: "Parcelamentos" }]} />}
      {aba === "parcelamentos" && veParcelamentos
        ? <Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">Carregando os parcelamentos…</p>}><Parcelamentos embutido /></Suspense>
        : <DocsDaEmpresa veContas={vis.ve("financeiro")} onParcelamentos={veParcelamentos ? () => setAba("parcelamentos") : undefined} />}
    </div>
  );
}

function DocsDaEmpresa({ veContas, onParcelamentos }: { veContas: boolean; onParcelamentos?: () => void }) {
  const dia = hoje();
  const desde = somarDias(-60);
  const { data: docs = [], isLoading } = useRows<Documento>("documentos", {});
  const { data: contas = [] } = useRows<Conta>("contas_pagar", {
    select: "id, descricao, valor, vencimento, status, data_pagamento, categoria, fornecedor:fornecedores(nome)", order: "vencimento", key: ["documentos", desde],
    // só o que a tela usa: as em aberto e as pagas nos últimos 60 dias
    filtro: (q) => q.or(`status.eq.aberto,data_pagamento.gte.${desde}`),
  });
  const invalidar = useInvalidate();
  const { user_id, papel } = usePerfil();
  const [anexarEm, setAnexarEm] = useState<Conta | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const comAnexo = useMemo(() => new Set(docs.filter((d) => d.entidade === "conta_pagar" && d.entidade_id).map((d) => d.entidade_id!)), [docs]);
  // só impostos e guias: as contas de fornecedores ficam em Financeiro → Contas a pagar
  const deImpostos = useMemo(() => contas.filter(ehContaDeImposto), [contas]);
  const atencao = veContas ? prazosParaConfirmar(deImpostos, dia) : [];
  const semComprovante = veContas ? pagasSemComprovante(deImpostos, comAnexo, dia) : [];
  const daEmpresa = docs.filter((d) => d.entidade === "geral").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const porTipo = TIPOS_DOC_EMPRESA.map((t) => ({ ...t, docs: daEmpresa.filter((d) => tipoDocEmpresa(d.nome) === t.id) })).filter((t) => t.docs.length);

  async function anexarDaEmpresa(lista: FileList | null) {
    if (!lista?.length) return;
    setEnviando(true);
    const n = await enviarDocumentos("geral", GERAL, [...lista]);
    setEnviando(false);
    if (n) notify(`${n} ${pl(n, "arquivo", "arquivos")} ${pl(n, "anexado", "anexados")}`);
    invalidar("documentos");
  }
  const podeApagar = (d: Documento) => d.created_by === user_id || papel === "admin";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        {veContas && (
          <Quadro titulo="O que precisa de atenção" texto="Impostos e guias vencidos que ainda estão em aberto: confirme se foram pagos e anexe o comprovante. As contas de fornecedores ficam em Financeiro → Contas a pagar.">
            {!atencao.length ? <Vazio icone={ShieldCheck} titulo="Tudo em dia" texto="Nenhum imposto ou guia vencido em aberto." /> : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {atencao.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link to="/financeiro" state={{ aba: "pagar" }} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-600 text-white" aria-hidden><ReceiptText size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-fg">{c.descricao || "Conta a pagar"}</span>
                        <span className="block truncate text-xs text-slate-600">{[c.fornecedor?.nome, c.categoria].filter(Boolean).join(" · ") || "—"}</span>
                        <span className="mt-1 inline-block rounded-md bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">Prazo passado · confirmar</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="num block font-bold text-fg">{brl(Number(c.valor))}</span>
                        <span className="block text-xs text-slate-500">Venceu {dataBR(c.vencimento)}</span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {atencao.length > 6 && <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">e mais {atencao.length - 6} em Financeiro → Contas a pagar.</p>}
          </Quadro>
        )}

        {veContas && (
          <Quadro titulo="Pagas, aguardando comprovante" texto="Impostos e guias pagos nos últimos 60 dias sem nenhum arquivo anexado." destaque>
            <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 sm:mx-5">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden /> Guia ou boleto emitido não comprova o pagamento: anexe o comprovante do banco.
            </div>
            {!semComprovante.length ? <Vazio icone={FileCheck2} titulo="Todos os comprovantes anexados" texto="Cada imposto ou guia pago nos últimos 60 dias já tem um arquivo." /> : (
              <ul className="divide-y divide-slate-100 border-t border-slate-100">
                {semComprovante.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-fg">{[c.fornecedor?.nome, c.descricao].filter(Boolean).join(" · ") || "Conta a pagar"}</span>
                      <span className="block text-xs text-slate-600">{brl(Number(c.valor))} · paga em {dataBR(c.data_pagamento ?? c.vencimento)}</span>
                    </span>
                    <Button variant="secondary" onClick={() => setAnexarEm(c)}><Upload size={15} /> Anexar</Button>
                  </li>
                ))}
              </ul>
            )}
            {semComprovante.length > 8 && <p className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">e mais {semComprovante.length - 8} sem comprovante.</p>}
          </Quadro>
        )}

        <Quadro titulo="Documentos da empresa" texto="Contrato social, alterações, alvarás, certidões, certificados digitais e extratos, separados por tipo."
          acao={<>
            <Button disabled={enviando} onClick={() => input.current?.click()}><Upload size={16} /> {enviando ? "Enviando…" : "Anexar"}</Button>
            <input ref={input} type="file" multiple className="hidden" onChange={(e) => { anexarDaEmpresa(e.target.files); e.target.value = ""; }} />
          </>}>
          {!daEmpresa.length ? <Vazio icone={FolderOpen} titulo="Seu arquivo começa aqui" texto="Anexe o contrato social, as alterações, alvarás, certidões e o certificado digital em PDF, JPG, PNG ou PFX." /> : (
            <div className="grid gap-3 border-t border-slate-100 p-4 sm:p-5 lg:grid-cols-2">
              {porTipo.map((t) => {
                const Icone = ICONE_TIPO[t.id];
                return (
                  <section key={t.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
                    <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-fg">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-modulo/15 text-modulo-texto" aria-hidden><Icone size={15} /></span>
                      {t.rotulo} <span className="num font-semibold text-slate-500">· {t.docs.length}</span>
                    </h3>
                    <p className="mb-2 text-2xs text-slate-500">{t.dica}</p>
                    <ul className="divide-y divide-slate-100">
                      {t.docs.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
                          <IconeArquivo tipo={d.tipo} />
                          <button type="button" className="min-w-0 flex-1 truncate text-left font-medium text-fg hover:underline" title={d.nome} onClick={() => abrirDocumento(d)}>{d.nome}</button>
                          <span className="shrink-0 text-2xs text-slate-500">{dataBR(d.created_at)}</span>
                          {podeApagar(d) && <button type="button" aria-label="Apagar" className="botao-icone-perigo p-1" onClick={async () => { if (await apagarDocumento(d)) invalidar("documentos"); }}><Trash2 size={14} /></button>}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Quadro>

        <TodosOsAnexos docs={docs} carregando={isLoading} podeApagar={podeApagar} />
      </div>

      {/* ao lado: o acompanhamento (como o "Seu dia, mais claro" do site) */}
      <aside className="min-w-0">
        <Card className="border-t-2 border-t-purple-500 p-4 sm:p-5 xl:sticky xl:top-4">
          <p className="text-2xs font-bold uppercase tracking-wider text-slate-500">Acompanhamento</p>
          <h2 className="mb-4 text-xl font-bold text-fg">Seus documentos, mais claros.</h2>
          <ul className="space-y-4 text-sm">
            {veContas && <Dica icone={FileCheck2} titulo="Guarde a prova do pagamento">
              {semComprovante.length ? `${semComprovante.length} ${pl(semComprovante.length, "imposto ou guia pago espera", "impostos e guias pagos esperam")} o comprovante.` : "Todos os impostos e guias pagos recentes têm comprovante."} Anexe o do banco, não a guia.
            </Dica>}
            {veContas && <Dica icone={ReceiptText} titulo="Prazos passados">
              {atencao.length ? `${atencao.length} ${pl(atencao.length, "imposto ou guia vencido está", "impostos e guias vencidos estão")} em aberto: confirme se foram pagos.` : "Nenhum imposto ou guia vencido em aberto."}
            </Dica>}
            <Dica icone={KeyRound} titulo="Certificado digital">
              {porTipo.find((t) => t.id === "certificado")?.docs.length ? "O certificado (.pfx) está guardado aqui; a senha fica só em Configurações." : "Guarde aqui o arquivo .pfx do certificado A1 (a senha fica só em Configurações)."}
            </Dica>
            {onParcelamentos && <Dica icone={Landmark} titulo="Parcelamentos">
              Anexe os extratos de cada acordo: o total negociado e o saldo dependem deles; parcelas soltas não comprovam o total.
            </Dica>}
          </ul>
          {onParcelamentos && <Button variant="secondary" className="mt-5 w-full" onClick={onParcelamentos}>Ver os parcelamentos <ChevronRight size={16} /></Button>}
        </Card>
      </aside>

      {anexarEm && (
        <Modal open onClose={() => setAnexarEm(null)} title={`Comprovante · ${anexarEm.descricao || "conta a pagar"}`}>
          <p className="mb-3 text-sm text-slate-600">{brl(Number(anexarEm.valor))} · paga em {dataBR(anexarEm.data_pagamento ?? anexarEm.vencimento)}. Anexe o comprovante do banco (PDF ou foto).</p>
          <Anexos entidade="conta_pagar" id={anexarEm.id} titulo="Comprovantes desta conta" />
        </Modal>
      )}
    </div>
  );
}

function Dica({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <Icone size={18} className="mt-0.5 shrink-0 text-slate-500" aria-hidden />
      <span className="min-w-0"><b className="block text-fg">{titulo}</b><span className="text-slate-600">{children}</span></span>
    </li>
  );
}

/** Todos os anexos do ERP (pedidos, OS, clientes, contas…), com a barra de filtros das listas. */
function TodosOsAnexos({ docs, carregando, podeApagar }: { docs: Documento[]; carregando: boolean; podeApagar: (d: Documento) => boolean }) {
  const invalidar = useInvalidate();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  // abre na semana (pela data do anexo), como as outras listas
  const [periodo, setPeriodo] = useState<Periodo>(() => semanaAtual(hoje()));
  const lista = useMemo(() => docs
    .filter((d) => (!tipo || d.entidade === tipo) && noPeriodo(d.created_at, periodo) && (!busca || d.nome.toLowerCase().includes(busca.toLowerCase())))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)), [docs, busca, tipo, periodo]);
  return (
    <Quadro titulo="Todos os anexos do ERP" texto="Tudo o que foi anexado em pedidos, OS, clientes, contas, produtos e notas.">
      <div className="border-t border-slate-100 px-4 pt-4 sm:px-5">
        <BarraFiltros busca={busca} onBusca={setBusca} placeholder="Buscar pelo nome do arquivo…" periodo={periodo} onPeriodo={setPeriodo} rotuloData="Anexado"
          filtros={<label className="text-sm"><span className="mb-1 block text-xs font-semibold text-slate-600">Onde</span>
            <select className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ENTIDADES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>}
          nFiltros={tipo ? 1 : 0} onLimpar={() => { setBusca(""); setTipo(""); setPeriodo(SEM_PERIODO); }} />
      </div>
      <div className="px-4 pb-4 sm:px-5">
        {!carregando && !lista.length ? <Vazio icone={FolderOpen} titulo="Nada anexado neste período" texto="Troque o período no botão Anexado ou busque pelo nome do arquivo." /> : (
          <Table head={<><th className="th">Arquivo</th><th className="th">Onde</th><th className="th">Tamanho</th><th className="th">Data</th><th className="th" /></>}>
            {lista.map((d) => (
              <tr key={d.id}>
                <td className="td"><button type="button" className="flex items-center gap-2 text-left font-medium hover:underline" onClick={() => abrirDocumento(d)}><IconeArquivo tipo={d.tipo} /> {d.nome}</button></td>
                <td className="td">{ENTIDADES[d.entidade] ?? d.entidade}</td>
                <td className="td">{tamanhoArquivo(d.tamanho)}</td>
                <td className="td">{dataBR(d.created_at)}</td>
                <td className="td text-right">{podeApagar(d) && (
                  <button type="button" aria-label="Apagar" className="botao-icone-perigo p-1" onClick={async () => { if (await apagarDocumento(d)) invalidar("documentos"); }}><Trash2 size={16} /></button>
                )}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Quadro>
  );
}
