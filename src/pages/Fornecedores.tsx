import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileSpreadsheet, Layers, Wrench } from "lucide-react";
import { ImportarContatos } from "@/components/ImportarContatos";
import { CrudPage, type CampoForm, type FiltroCrud } from "@/components/CrudPage";
import { filtroCadastradoEm, filtroCompletude, filtrosLocal, ordensCadastro } from "@/lib/filtrosCadastro";
import { supabase } from "@/lib/supabase";
import { Contato, NomeCadastro } from "@/components/Contato";
import { Button, Modal } from "@/components/ui";
import { useInvalidate, useRows } from "@/lib/data";
import { AgruparFiliais, FiliaisDaMarca, UnificarCadastros } from "@/components/cadastros/MarcaFiliais";
import { confirmar } from "@/components/Dialogos";
import { ArrumarFornecedores, EtiquetasCliente, ReceitaCadastro } from "@/components/clientes/QualidadeClientes";
import { brl, dataBR, digitos, docFormat, pl } from "@/lib/format";
import { usePerfil } from "@/lib/auth";
import type { Fornecedor, Transportadora } from "@/lib/types";
import { completarPorCep, completarPorCnpj } from "@/lib/cadastro";
import { CampoBloqueio, SeloGolpe } from "@/components/fornecedores/Golpe";
import { notify, notifyError } from "@/lib/notify";
import { ehPosto } from "@/lib/extratoTipos";
import { useLojasDeMarketplace } from "@/lib/comprasMarketplace";
import { MARKETPLACES } from "@/lib/marketplaces";

const CAMPOS_RECEITA = ["nome", "nome_fantasia", "email", "telefone", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "inscricao_estadual"];

/** CNPJ completo preenche nome, IE, contato e endereço; CEP preenche o endereço. */
const busca = async (name: string, value: any, row: Record<string, any>, forcar?: boolean) => {
  if (name === "cep" && (forcar || digitos(value).length === 8)) return completarPorCep(value, forcar);
  if (name !== "cnpj") return null;
  if (digitos(value).length === 14) return completarPorCnpj(row, value, CAMPOS_RECEITA, forcar);
  if (forcar) notify("Digite o CNPJ completo (14 números) para buscar na Receita", "erro");
  return null;
};

const identificacao = (ajudaNome: string): CampoForm[] => [
  { name: "codigo", label: "Código", type: "readonly", span: 1 },
  { name: "cnpj", label: "CNPJ (preenche o resto)", mask: "cnpj", buscar: true, span: 3 },
  { name: "nome_fantasia", label: ajudaNome },
  { name: "nome", label: "Razão social", required: true },
  { name: "inscricao_estadual", label: "Inscrição estadual (vem pelo CNPJ)", mask: "ie" },
];

const endereco: CampoForm[] = [
  { name: "e", label: "Endereço", type: "secao" },
  { name: "cep", label: "CEP", mask: "cep", buscar: true, span: 1 },
  { name: "logradouro", label: "Logradouro", span: 3 },
  { name: "numero", label: "Número", span: 1 },
  { name: "complemento", label: "Complemento", span: 1 },
  { name: "bairro", label: "Bairro" },
  { name: "municipio", label: "Município", span: 3 },
  { name: "uf", label: "UF", mask: "uf", span: 1 },
];

const colunas = <T extends { codigo?: number | null; nome: string; nome_fantasia?: string | null; cnpj?: string | null; municipio?: string | null; uf?: string | null }>(msg: string) => [
  { label: "Cód.", render: (r: T) => <span className="font-mono text-xs text-slate-500">{r.codigo ?? "—"}</span>, className: "w-14" },
  { label: "Nome", render: (r: T) => <NomeCadastro r={r} /> },
  { label: "CNPJ", render: (r: T) => <span className="whitespace-nowrap">{docFormat(r.cnpj) || "—"}</span> },
  { label: "Contato", render: (r: T) => <Contato r={r as any} mensagem={msg} /> },
];

const tag = (r: Fornecedor, t: string) => (r.tags ?? []).includes(t);
const FILTROS_FORN: FiltroCrud<Fornecedor>[] = [
  ...filtrosLocal<Fornecedor>(),
  filtroCompletude<Fornecedor>((r) => r.cnpj),
  {
    label: "Receita", opcoes: [
      { label: "CNPJ baixado/inapto", teste: (r) => tag(r, "cnpj_irregular") },
      { label: "IE baixada", teste: (r) => tag(r, "ie_baixada") },
      { label: "Endereço diferente da Receita (2 endereços)", teste: (r) => tag(r, "endereco_receita") },
      { label: "CNPJ ainda não conferido", teste: (r) => digitos(r.cnpj).length === 14 && !r.receita_em },
      { label: "CNPJ ativo e conferido", teste: (r) => !!r.receita_em && r.receita_situacao === "ATIVA" },
    ],
  },
  { label: "WhatsApp", opcoes: [{ label: "Sem WhatsApp", teste: (r) => !r.whatsapp }, { label: "Com WhatsApp", teste: (r) => !!r.whatsapp }] },
  { label: "Golpe", opcoes: [{ label: "Bloqueados (golpe: não pagar)", teste: (r) => !!r.bloqueado }, { label: "Sem bloqueio", teste: (r) => !r.bloqueado }] },
  { label: "Situação", opcoes: [{ label: "Ativos", teste: (r) => r.ativo !== false }, { label: "Inativos", teste: (r) => r.ativo === false }] },
  { label: "Homologação", opcoes: [{ label: "Homologados", teste: (r) => !!r.homologado }, { label: "Não homologados", teste: (r) => !r.homologado }] },
  { label: "Atividade", opcoes: [{ label: "Postos de combustível", teste: (r) => ehPosto(r) }, { label: "Sem os postos", teste: (r) => !ehPosto(r) }] },
  filtroCadastradoEm<Fornecedor>(),
];
const ORDENS_FORN = ordensCadastro<Fornecedor>();
const FILTROS_TRANSP: FiltroCrud<Transportadora>[] = [
  ...filtrosLocal<Transportadora>(),
  { label: "Situação", opcoes: [{ label: "Ativas", teste: (r) => r.ativo !== false }, { label: "Inativas", teste: (r) => r.ativo === false }] },
  filtroCompletude<Transportadora>((r) => r.cnpj),
  filtroCadastradoEm<Transportadora>(),
];
const ORDENS_TRANSP = ordensCadastro<Transportadora>();

/** Ativa/inativa várias transportadoras de uma vez. */
async function situacaoTransportadoras(ids: string[], ativo: boolean) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("transportadoras").update({ ativo }).in("id", ids.slice(i, i + 200));
    if (error) throw error;
  }
  return `${ids.length} ${pl(ids.length, "transportadora", "transportadoras")} ${ativo ? pl(ids.length, "ativada", "ativadas") : pl(ids.length, "inativada", "inativadas")}`;
}

/** Chama uma função do banco e devolve o texto para o aviso (erro vira exceção, mostrada pela lista). */
async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw error;
  return data;
}

/** Fornecedores e transportadoras: cada um no seu item do menu (mesma permissão de tela). */
export default function Fornecedores({ tipo: aba }: { tipo: "fornecedores" | "transportadoras" }) {
  const { pode, papel, tem } = usePerfil();
  const [importar, setImportar] = useState<"fornecedor" | "transportadora" | null>(null);
  const [arrumar, setArrumar] = useState(false);
  const [receita, setReceita] = useState<Fornecedor | null>(null);
  // lojas que venderam para a MF por marketplace (pela nota): filtro como o dos postos
  const lojasMkt = useLojasDeMarketplace();
  const filtrosForn = useMemo<FiltroCrud<Fornecedor>[]>(() => FILTROS_FORN.map((f) => f.label !== "Atividade" || !("opcoes" in f) ? f : {
    ...f,
    opcoes: [
      ...f.opcoes,
      { label: "Lojas de marketplace (Mercado Livre, TikTok…)", teste: (r: Fornecedor) => lojasMkt.has(digitos(r.cnpj)) },
      ...MARKETPLACES.filter((m) => [...lojasMkt.values()].includes(m.id)).map((m) => ({ label: `Lojas do ${m.nome}`, teste: (r: Fornecedor) => lojasMkt.get(digitos(r.cnpj)) === m.id })),
      { label: "Sem as lojas de marketplace", teste: (r: Fornecedor) => !lojasMkt.has(digitos(r.cnpj)) },
    ],
  }), [lojasMkt]);
  const podeImportar = tem("financeiro");
  const invalidar = useInvalidate();
  // marca com filiais (como nas transportadoras) e cadastros repetidos
  const { data: fornTodos = [] } = useRows<Fornecedor>("fornecedores", { order: "nome", ascending: true });
  const { data: transpTodas = [] } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const [mostrarFiliais, setMostrarFiliais] = useState(false);
  const [filiaisDe, setFiliaisDe] = useState<string | null>(null);
  const [abrirForn, setAbrirForn] = useState<Fornecedor | null>(null);
  const [unificando, setUnificando] = useState<{ lista: (Fornecedor | Transportadora)[]; tabela: "fornecedores" | "transportadoras"; fim?: (msg: string) => void } | null>(null);
  const [agrupando, setAgrupando] = useState<{ lista: Fornecedor[]; fim: (msg: string) => void } | null>(null);
  const filiaisPorMarca = useMemo(() => {
    const m = new Map<string, Fornecedor[]>();
    for (const f of fornTodos) if (f.matriz_id && !f.unificado_em) m.set(f.matriz_id, [...(m.get(f.matriz_id) ?? []), f]);
    return m;
  }, [fornTodos]);
  const nomeForn = (id: string | null | undefined) => { const f = fornTodos.find((x) => x.id === id); return f ? (f.nome_fantasia?.trim() || f.nome) : ""; };
  const baseForn = useCallback((r: Fornecedor) => !r.unificado_em && (mostrarFiliais || !r.matriz_id), [mostrarFiliais]);
  const baseTransp = useCallback((r: Transportadora) => !r.unificado_em, []);
  // o que se compra de cada fornecedor: as categorias dos produtos ligados a ele (cadastro de fornecimento e códigos das notas)
  const { data: forneceProd = [] } = useRows<{ produto_id: string; fornecedor_id: string }>("produto_fornecedor", { select: "produto_id, fornecedor_id", order: "produto_id", key: ["cat-forn"] });
  const { data: prodCat = [] } = useRows<{ id: string; categoria: string | null }>("produtos", { select: "id, categoria", order: "id", key: ["cat-forn"] });
  const categoriasDo = useMemo(() => {
    const cat = new Map(prodCat.map((p) => [p.id, p.categoria?.trim()]));
    const conta = new Map<string, Map<string, number>>();
    for (const x of forneceProd) {
      const c = cat.get(x.produto_id); if (!c) continue;
      const m = conta.get(x.fornecedor_id) ?? new Map<string, number>(); m.set(c, (m.get(c) ?? 0) + 1); conta.set(x.fornecedor_id, m);
    }
    return new Map([...conta].map(([f, m]) => [f, [...m].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c)]));
  }, [forneceProd, prodCat]);
  // o que se compra de cada um pelas notas recebidas (grupo do NCM dos itens), quanto e quando foi a última
  const { data: compras = [] } = useQuery({
    queryKey: ["fornecedores_compras"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fornecedores_compras");
      if (error) throw error;
      return (data ?? []) as { fornecedor_id: string; grupos: string[]; total: number; notas: number; ultima: string | null }[];
    },
    staleTime: 5 * 60_000,
  });
  const comprasDo = useMemo(() => new Map(compras.map((c) => [c.fornecedor_id, c])), [compras]);
  const marcaAberta = filiaisDe ? fornTodos.find((f) => f.id === filiaisDe) : null;

  async function unificar(principal: string, outros: string[], motivo: string) {
    if (!unificando) return;
    try {
      const n = await rpc(unificando.tabela === "fornecedores" ? "unificar_fornecedores" : "unificar_transportadoras", { p_principal: principal, p_outros: outros, p_motivo: motivo });
      const msg = `${n} ${pl(Number(n), "repetido unificado", "repetidos unificados")}: tudo passou para o principal`;
      invalidar(unificando.tabela, "nfe_recebidas", "contas_pagar", "pedidos_compra", "produtos");
      if (unificando.fim) unificando.fim(msg); else notify(msg);
      setUnificando(null);
    } catch (e) { notifyError(e); }
  }
  async function agrupar(marca: string | null, filiais: string[], novaMarca: string | null) {
    if (!agrupando) return;
    try {
      await rpc("agrupar_fornecedores", { p_marca: marca, p_filiais: filiais, p_nova_marca: novaMarca });
      const msg = `${filiais.length - (marca ? 1 : 0)} ${pl(filiais.length, "filial agrupada", "filiais agrupadas")} na marca`;
      invalidar("fornecedores");
      agrupando.fim(msg);
      setAgrupando(null);
    } catch (e) { notifyError(e); }
  }
  async function separar(f: Fornecedor) {
    if (!(await confirmar(`Tirar "${f.nome_fantasia?.trim() || f.nome}" da marca? Ele volta a aparecer sozinho na lista.`))) return;
    const { error } = await supabase.from("fornecedores").update({ matriz_id: null }).eq("id", f.id);
    if (error) notifyError(error); else { notify("Separado da marca"); invalidar("fornecedores"); }
  }
  const botaoImportar = (tipo: "fornecedor" | "transportadora") =>
    podeImportar && <Button variant="secondary" onClick={() => setImportar(tipo)}><FileSpreadsheet size={16} /> Importar</Button>;

  return (
    <div>
      {importar && <ImportarContatos tipo={importar} onClose={() => setImportar(null)} />}
      {arrumar && <ArrumarFornecedores onClose={() => setArrumar(false)} />}
      {receita && (
        <Modal open onClose={() => setReceita(null)} title={`Receita · ${receita.nome_fantasia || receita.nome}`}>
          <ReceitaCadastro registro={receita as any} tabela="fornecedores" />
        </Modal>
      )}
      {unificando && <UnificarCadastros opcoes={unificando.lista} titulo={unificando.tabela} onClose={() => { unificando.fim?.("Nada mudou"); setUnificando(null); }} onUnificar={unificar} />}
      {agrupando && <AgruparFiliais opcoes={agrupando.lista} marcas={fornTodos.filter((f) => filiaisPorMarca.has(f.id))}
        onClose={() => { agrupando.fim("Nada mudou"); setAgrupando(null); }} onAgrupar={agrupar} />}
      {marcaAberta && <FiliaisDaMarca marca={marcaAberta} filiais={filiaisPorMarca.get(marcaAberta.id) ?? []} rede={marcaAberta.rede ?? []}
        podeEditar={pode("editar_fornecedores")} onClose={() => setFiliaisDe(null)} atualizado={() => invalidar("fornecedores")}
        onUnificar={(lista) => setUnificando({ lista, tabela: "fornecedores" })} onSeparar={separar}
        onAbrir={(f) => { setFiliaisDe(null); setAbrirForn({ ...f }); }} />}
      {aba === "fornecedores" ? (
        <CrudPage<Fornecedor>
          anexos="fornecedor"
          acoesEmLinha
          key="f"
          readOnly={!pode("editar_fornecedores")}
          filtroBase={baseForn}
          editarAgora={abrirForn}
          acoesLote={pode("editar_fornecedores") ? [
            { label: "Passar para clientes", executar: async (ids) => {
              if (!(await confirmar(`Passar ${ids.length} ${pl(ids.length, "cadastro", "cadastros")} para Clientes? O fornecedor fica inativo (as contas e notas antigas continuam ligadas a ele) e os anexos vão para o cliente.`, { ok: "Passar para clientes" }))) return "Nada mudou";
              const r = await rpc("fornecedores_virar_cliente", { p_ids: ids, p_manter_fornecedor: false }) as { criados: number; voltaram: number };
              invalidar("fornecedores", "clientes");
              return `Agora em Clientes: ${r.criados} ${pl(r.criados, "novo", "novos")}${r.voltaram ? ` e ${r.voltaram} que já eram clientes` : ""}`;
            } },
            { label: "Marcar homologado", executar: async (ids) => {
              const { error } = await supabase.from("fornecedores").update({ homologado: true, homologado_em: new Date().toISOString().slice(0, 10) }).in("id", ids);
              if (error) throw error; invalidar("fornecedores"); return `${ids.length} ${pl(ids.length, "homologado", "homologados")}`;
            } },
            { label: "Inativar", executar: async (ids) => {
              const { error } = await supabase.from("fornecedores").update({ ativo: false }).in("id", ids);
              if (error) throw error; invalidar("fornecedores"); return `${ids.length} ${pl(ids.length, "inativado", "inativados")}`;
            } },
            { label: "Ativar", executar: async (ids) => {
              const { error } = await supabase.from("fornecedores").update({ ativo: true }).in("id", ids);
              if (error) throw error; invalidar("fornecedores"); return `${ids.length} ${pl(ids.length, "ativado", "ativados")}`;
            } },
            { label: "Unificar repetidos", executar: (ids) => ids.length < 2 ? Promise.resolve("Marque 2 ou mais cadastros repetidos para unificar")
              : new Promise<string>((fim) => setUnificando({ lista: fornTodos.filter((f) => ids.includes(f.id)), tabela: "fornecedores", fim })) },
            { label: "Agrupar como filiais de uma marca", executar: (ids) => ids.length < 2 ? Promise.resolve("Marque a matriz e as filiais (2 ou mais)")
              : new Promise<string>((fim) => setAgrupando({ lista: fornTodos.filter((f) => ids.includes(f.id)), fim })) },
          ] : []}
          extraActions={<>
            <Button variant="secondary" aria-pressed={mostrarFiliais} onClick={() => setMostrarFiliais((v) => !v)}><Layers size={16} /> {mostrarFiliais ? "Esconder filiais" : "Mostrar filiais"}</Button>
            {pode("editar_fornecedores") && <Button variant="secondary" onClick={() => setArrumar(true)}><Wrench size={16} /> Arrumar cadastro</Button>}
            {botaoImportar("fornecedor")}
          </>}
          rowActions={(r) => digitos(r.cnpj).length === 14 && (
            <button type="button" onClick={() => setReceita(r)}
              title={r.receita_em ? "O que a Receita diz deste fornecedor (e os dois endereços, se forem diferentes)" : "Conferir este CNPJ na Receita agora"}
              aria-label="Receita" className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg p-1.5 text-xs font-semibold transition ${r.receita_em
                ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-sm hover:brightness-110"
                : "border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
              <Building2 size={15} aria-hidden /><span className="sr-only">Receita</span>
            </button>
          )}
          filtros={filtrosForn}
          ordens={ORDENS_FORN}
          podeExcluir={papel === "admin"}
          plural="fornecedores"
          title="Fornecedores"
          table="fornecedores"
          marcadores={["fornecedor", "fornecedores"]}
          order="nome"
          defaults={{ nome: "", ativo: true }}
          searchKeys={["codigo", "nome", "nome_fantasia", "cnpj", "whatsapp", "telefone", "email", "municipio"]}
          beforeSave={(r) => ({ ...r, uf: r.uf?.toUpperCase(), bloqueio_motivo: r.bloqueado ? r.bloqueio_motivo : null })}
          onFieldChange={busca}
          fields={[
            ...identificacao("Nome (fantasia / como chamamos)"),
            { name: "c", label: "Contato", type: "secao" },
            { name: "whatsapp", label: "WhatsApp (pedidos e cotações)", mask: "whatsapp" },
            { name: "telefone", label: "Telefone", mask: "telefone" },
            { name: "email", label: "E-mail", mask: "email", span: 2 },
            { name: "chave_pix", label: "Chave Pix (para pagar)", placeholder: "CPF/CNPJ, e-mail, celular ou chave aleatória", span: 2 },
            ...endereco,
            { name: "observacoes", label: "Observações", type: "textarea", span: 4 },
            { name: "h", label: "Situação e homologação", type: "secao" },
            { name: "ativo", label: "Ativo (aparece nas compras)", type: "checkbox", span: 2 },
            { name: "homologado", label: "HOMOLOGADO (pode fornecer peças das máquinas certificadas pelo Inmetro)", type: "checkbox", span: 2 },
            { name: "homologado_em", label: "Homologado em", type: "date", span: 1 },
            { name: "homologado_obs", label: "Como foi homologado (certificado, laudo, visita…)", span: 3 },
            { name: "g", label: "Golpe / fraude", type: "secao" },
            { name: "bloqueado", label: "Bloqueio de pagamentos", type: "custom", span: 4,
              render: (_v, _s, row, setCampo) => <CampoBloqueio row={row} setCampo={setCampo} admin={papel === "admin"} /> },
          ]}
          columns={[
            ...colunas<Fornecedor>("Olá! Aqui é da MF Máquinas.").filter((c) => c.label !== "Cód." && c.label !== "CNPJ").map((c) => c.label === "Nome"
              ? { ...c, render: (r: Fornecedor) => <><NomeCadastro r={r} />
                <div className="mt-0.5 text-2xs text-slate-500">{[r.codigo != null ? `cód. ${r.codigo}` : null, docFormat(r.cnpj) || null].filter(Boolean).join(" · ")}</div>{r.bloqueado && <div className="mt-0.5"><SeloGolpe f={r} /></div>}<EtiquetasCliente c={r} />
                {filiaisPorMarca.has(r.id) && <button type="button" onClick={(e) => { e.stopPropagation(); setFiliaisDe(r.id); }}
                  className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 hover:bg-sky-200">
                  <Layers size={12} aria-hidden /> {filiaisPorMarca.get(r.id)!.length} {pl(filiaisPorMarca.get(r.id)!.length, "filial", "filiais")}</button>}
                {r.matriz_id && <button type="button" onClick={(e) => { e.stopPropagation(); setFiliaisDe(r.matriz_id!); }}
                  className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">filial de {nomeForn(r.matriz_id)}</button>}</> } : c),
            { label: "Compra o quê", render: (r) => {
              const cp = comprasDo.get(r.id);
              const cats = [...new Set([...(categoriasDo.get(r.id) ?? []), ...(cp?.grupos ?? [])])].slice(0, 2);
              if (!cats.length && !cp) return <span className="text-xs text-slate-400">sem notas</span>;
              return <div className="max-w-[15rem]">
                {cats.length > 0 && <div className="flex flex-wrap gap-1">{cats.map((c) => <span key={c} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-2xs font-semibold text-slate-700">{c}</span>)}</div>}
                {cp && <div className="mt-0.5 text-2xs text-slate-500">{brl(Number(cp.total))} em {cp.notas} {pl(Number(cp.notas), "nota", "notas")}{cp.ultima ? ` · última ${dataBR(cp.ultima)}` : ""}</div>}
              </div>;
            } },
            { label: "Cidade", render: (r) => [r.municipio, r.uf].filter(Boolean).join("/") || "—" },
            { label: "Situação", render: (r) => <div className="flex flex-col items-start gap-1">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${r.ativo === false ? "text-slate-400" : "text-emerald-600"}`}>
                <span className={`h-2 w-2 rounded-full ${r.ativo === false ? "bg-slate-400" : "bg-emerald-500"}`} aria-hidden />{r.ativo === false ? "inativo" : "ativo"}</span>
              {r.homologado && <span title={r.homologado_obs || "Fornecedor homologado"} className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-2xs font-black tracking-wide text-emerald-800">HOMOLOGADO</span>}
            </div> },
          ]}
        />
      ) : (
        <CrudPage<Transportadora>
          key="t"
          readOnly={!pode("editar_transportadoras")}
          extraActions={botaoImportar("transportadora")}
          filtros={FILTROS_TRANSP}
          ordens={ORDENS_TRANSP}
          podeExcluir={papel === "admin"}
          plural="transportadoras"
          filtroBase={baseTransp}
          acoesLote={pode("editar_transportadoras") ? [
            { label: "Inativar", executar: (ids) => situacaoTransportadoras(ids, false) },
            { label: "Ativar", executar: (ids) => situacaoTransportadoras(ids, true) },
            { label: "Unificar repetidos", executar: (ids) => ids.length < 2 ? Promise.resolve("Marque 2 ou mais cadastros repetidos para unificar")
              : new Promise<string>((fim) => setUnificando({ lista: transpTodas.filter((t) => ids.includes(t.id)), tabela: "transportadoras", fim })) },
          ] : []}
          title="Lista completa"
          table="transportadoras"
          marcadores={["transportadora", "transportadoras"]}
          order="nome"
          defaults={{ nome: "", ativo: true }}
          searchKeys={["codigo", "nome", "nome_fantasia", "cnpj", "regioes", "whatsapp"]}
          beforeSave={(r) => ({ ...r, uf: r.uf?.toUpperCase() })}
          onFieldChange={busca}
          fields={[
            ...identificacao("Nome (como aparece no frete)"),
            { name: "ativo", label: "Ativa", type: "checkbox" },
            { name: "c", label: "Contato", type: "secao" },
            { name: "contato", label: "Pessoa de contato" },
            { name: "whatsapp", label: "WhatsApp (para pedir cotação)", mask: "whatsapp" },
            { name: "telefone", label: "Telefone", mask: "telefone" },
            { name: "email", label: "E-mail", mask: "email" },
            { name: "regioes", label: "Regiões que atende (ex.: SP, MG, GO)", span: 4 },
            ...endereco,
            { name: "observacoes", label: "Observações (prazos, coleta, seguro…)", type: "textarea", span: 4 },
          ]}
          columns={[
            ...colunas<Transportadora>("Olá! Aqui é da MF Máquinas, gostaria de uma cotação de frete."),
            { label: "Atende", render: (r) => r.regioes ?? "—" },
            { label: "Situação", render: (r) => (r.ativo ? "ativa" : "inativa") },
          ]}
        />
      )}
    </div>
  );
}
