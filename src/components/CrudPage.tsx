import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, FileDown, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { limpar, useInvalidate, useRows, useSave } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { Button, Field, MaisAcoes, Modal, PageHeader, Table } from "./ui";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { Anexos } from "./Anexos";
import { erroCampo, gravar, mostrar, type Mascara } from "@/lib/mascaras";
import { whatsappLink } from "@/lib/format";
import { combinaBusca } from "@/lib/buscaCliente";
import { useLocation, useNavigate } from "react-router-dom";
import { lerDestaque } from "@/lib/destaque";
import { FaixaDestaque } from "./FaixaDestaque";
import { AplicarMarcadores, BotaoMarcadores, ChipsMarcadores, filtroMarcadores, useMarcadores, type TabelaMarcavel } from "./nfe/Marcadores";

export type CampoForm = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea" | "email" | "checkbox" | "custom" | "secao" | "readonly";
  /** Máscara e validação (CPF/CNPJ, telefone, CEP, e-mail…): mostra formatado, grava só os números. */
  mask?: Mascara;
  /** Botão de lupa que busca os dados (CNPJ, CEP): chama onFieldChange com forcar = true. */
  buscar?: boolean;
  placeholder?: string;
  options?: { value: string | number; label: string }[];
  /** type "custom": desenha o campo (ex.: foto); setCampo muda outro campo do mesmo registro */
  render?: (valor: any, set: (v: any) => void, row: Record<string, any>, setCampo: (nome: string, v: any) => void) => ReactNode;
  ajuda?: string;
  span?: 1 | 2 | 3 | 4;
  required?: boolean;
};

export type Coluna<T> = { label: string; render: (row: T) => ReactNode; className?: string };

/**
 * Filtro da lista: opções fixas (cada uma com o seu teste) ou os valores que existem na coluna
 * (ex.: cidades e UFs dos cadastros).
 */
export type FiltroCrud<T> =
  | { label: string; opcoes: { label: string; teste: (row: T) => boolean }[] }
  | { label: string; valor: (row: T) => string | null | undefined };
export type OrdemCrud<T> = { label: string; comparar: (a: T, b: T) => number };

const POR_VEZ = 200;

type Props<T> = {
  title: string;
  table: string;
  fields: CampoForm[];
  columns: Coluna<T>[];
  searchKeys: (keyof T)[];
  defaults: Record<string, any>;
  order?: string;
  rowActions?: (row: T) => ReactNode;
  extraActions?: ReactNode;
  /** Ajusta os dados antes de gravar (ex.: converter números). */
  beforeSave?: (row: Record<string, any>) => Record<string, any>;
  /** Depois de gravar (ex.: dados sigilosos, que vão por outra função): recebe o registro salvo e o que estava no formulário. */
  afterSave?: (salvo: Record<string, any>, editado: Record<string, any>) => Promise<void> | void;
  /** Reage à mudança de um campo (ex.: CEP preenche endereço). */
  onFieldChange?: (name: string, value: any, row: Record<string, any>, forcar?: boolean) => Promise<Record<string, any> | null | void>;
  /** Mostra os documentos anexados no formulário (ex.: "cliente"). */
  anexos?: string;
  /** Colunas a mais na planilha exportada (ex.: estoque). */
  exportExtra?: (row: T) => Record<string, unknown>;
  /** Só consulta: esconde "Novo" e "Editar". */
  readOnly?: boolean;
  filtros?: FiltroCrud<T>[];
  /** Ordenações da lista (a primeira é a padrão). */
  ordens?: OrdemCrud<T>[];
  /** Seleção de várias linhas para excluir de uma vez (só admin pode excluir cadastros). */
  podeExcluir?: boolean;
  /** Nome no plural para as mensagens (ex.: "clientes"). */
  plural?: string;
  /** Outras ações para os selecionados (ex.: inativar produtos). Devolve a mensagem de sucesso. */
  acoesLote?: { label: string; executar: (ids: string[]) => Promise<string | void> }[];
  /** Recorte fixo da lista (ex.: só as máquinas); a busca e os filtros valem dentro dele. */
  filtroBase?: (row: T) => boolean;
  /** Abre o formulário deste registro (ex.: "Corrigir" vindo de outra aba). Mande um objeto novo a cada pedido. */
  editarAgora?: T | null;
  /** Formulário próprio no lugar do padrão (ex.: cadastro de clientes em abas). */
  formulario?: (registro: Record<string, any>, fechar: () => void) => ReactNode;
  /** Celular: cartão próprio no lugar da tabela empilhada (os botões e a seleção o CrudPage põe). */
  cartaoCelular?: (row: T, abrir: () => void) => ReactNode;
  /** Marcadores coloridos (os mesmos das notas): chips na lista, filtro, botão na linha e em lote. Nome: ["cliente", "clientes"]. */
  marcadores?: [string, string];
};

const spanClass = { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4" };

export function CrudPage<T extends { id: string }>(props: Props<T>) {
  const { title, table, fields, columns, searchKeys, defaults, order = "created_at", rowActions, extraActions, beforeSave, onFieldChange, readOnly, exportExtra, anexos,
    filtros: filtrosPagina = [], ordens = [], podeExcluir = false, plural = "registros", acoesLote = [], marcadores } = props;
  const { data: todosMarcadores = [] } = useMarcadores();
  const filtros = useMemo(() => (marcadores && todosMarcadores.some((m) => m.ativo)
    ? [...filtrosPagina, filtroMarcadores<T & { marcadores?: string[] | null }>(todosMarcadores) as FiltroCrud<T>] : filtrosPagina),
    [filtrosPagina, marcadores, todosMarcadores]);
  const [marcandoLote, setMarcandoLote] = useState(false);
  const tags = (row: T) => marcadores ? <ChipsMarcadores ids={(row as { marcadores?: string[] | null }).marcadores} todos={todosMarcadores} pequeno /> : null;
  const selecionavel = podeExcluir || acoesLote.length > 0 || !!marcadores;
  const { data: todos = [], isLoading } = useRows<T>(table, { order, ascending: order !== "created_at" });
  const filtroBase = props.filtroBase;
  // aberto por outra tela só com alguns registros (ex.: Analista fiscal → produtos sem NCM): mostra só eles,
  // mesmo fora do recorte da página, até clicar em "Ver todos"
  const location = useLocation();
  const navegar = useNavigate();
  const [destaque, setDestaque] = useState(() => lerDestaque(location.state));
  const data = useMemo(() => (destaque ? todos.filter((r) => destaque.ids.includes(r.id)) : filtroBase ? todos.filter(filtroBase) : todos),
    [todos, filtroBase, destaque]);
  const limparDestaque = () => { setDestaque(null); navegar(location.pathname + location.search, { replace: true, state: null }); };
  const save = useSave(table);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Record<string, any> | null>(null);
  useEffect(() => { if (props.editarAgora) setEditando({ ...props.editarAgora }); }, [props.editarAgora]);
  // um só registro em destaque: já abre o cadastro dele
  const [destaqueAberto, setDestaqueAberto] = useState(false);
  useEffect(() => {
    if (!destaque || destaqueAberto || destaque.ids.length !== 1 || readOnly) return;
    const r = todos.find((x) => x.id === destaque.ids[0]);
    if (r) { setDestaqueAberto(true); setEditando({ ...r }); }
  }, [destaque, destaqueAberto, todos, readOnly]);
  const [buscando, setBuscando] = useState<string | null>(null);
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const [fechadas, setFechadas] = useState<Set<string>>(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? new Set(fields.filter((f) => f.type === "secao").map((f) => f.name)) : new Set());
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [ordem, setOrdem] = useState(0);
  const [limite, setLimite] = useState(POR_VEZ);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const invalidar = useInvalidate();

  // valores existentes para os filtros "por coluna" (ex.: cidades)
  const valoresFiltro = useMemo(() => filtros.map((f) => "valor" in f
    ? [...new Set(data.map((r) => (f.valor(r) ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"))
    : []), [data, filtros]);

  const filtrados = useMemo(() => {
    let lista = busca.trim() ? data.filter((r) => combinaBusca(searchKeys.map((k) => r[k]), busca)) : data;
    filtros.forEach((f) => {
      const v = escolhas[f.label];
      if (!v) return;
      if ("valor" in f) lista = lista.filter((r) => (f.valor(r) ?? "").trim() === v);
      else { const op = f.opcoes.find((o) => o.label === v); if (op) lista = lista.filter(op.teste); }
    });
    return ordens[ordem] ? [...lista].sort(ordens[ordem].comparar) : lista;
  }, [data, busca, searchKeys, filtros, escolhas, ordens, ordem]);

  // mudou o filtro ou a busca: volta ao começo da lista
  useEffect(() => { setLimite(POR_VEZ); }, [busca, escolhas, ordem]);
  // a seleção só guarda o que ainda existe
  useEffect(() => { setSel((s) => (s.size ? new Set([...s].filter((id) => data.some((r) => r.id === id))) : s)); }, [data]);

  const filtrosAtivos = Object.values(escolhas).filter(Boolean).length;
  const temFiltros = filtros.length > 0 || ordens.length > 1;
  const [painel, setPainel] = useState(false);
  const celular = useCelular();
  const todosMarcados = filtrados.length > 0 && filtrados.every((r) => sel.has(r.id));
  const marcar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarTodos = () => setSel(todosMarcados ? new Set() : new Set(filtrados.map((r) => r.id)));

  /** Exclui os selecionados. O que tem vínculo (pedido, nota, conta…) o banco não deixa apagar: fica e é avisado. */
  async function excluirSelecionados() {
    const ids = [...sel];
    if (!ids.length || !confirm(`Excluir ${ids.length} ${plural}? Isso não pode ser desfeito.`)) return;
    let feitos = 0;
    const presos: string[] = [];
    const apagar = async (lote: string[]) => {
      const { error, count } = await supabase.from(table).delete({ count: "exact" }).in("id", lote);
      if (!error) { feitos += count ?? lote.length; return true; }
      return false;
    };
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const lote = ids.slice(i, i + 100);
        setExcluindo(`${Math.min(ids.length, i + lote.length)} de ${ids.length}…`);
        if (await apagar(lote)) continue;
        // algum do lote tem vínculo: tenta um por um
        for (const id of lote) if (!(await apagar([id]))) presos.push(id);
      }
    } finally {
      setExcluindo(null);
      invalidar(table);
    }
    setSel(new Set(presos));
    if (presos.length) {
      notify(`${feitos} excluído(s). ${presos.length} não puderam ser excluídos porque têm pedidos, notas, contas ou outros registros ligados (continuam selecionados).`, "erro");
    } else notify(`${feitos} ${plural} excluído(s)`);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const errados = fields.filter((f) => f.mask && erroCampo(f.mask, editando[f.name]));
    if (errados.length) {
      setTocados(new Set(errados.map((f) => f.name)));
      notifyError(new Error(`Confira: ${errados.map((f) => `${f.label.replace(/\s*\(.*\)$/, "")} (${erroCampo(f.mask, editando[f.name])})`).join(", ")}`));
      return;
    }
    try {
      const row = limpar(beforeSave ? beforeSave(editando) : editando);
      const salvo = await save.mutateAsync(row);
      if (props.afterSave) {
        // registro novo já tem id: se a etapa seguinte falhar, salvar de novo atualiza (não duplica)
        setEditando((r) => (r ? { ...r, id: salvo.id } : r));
        await props.afterSave(salvo, { ...editando, id: salvo.id });
      }
      notify("Salvo com sucesso");
      setEditando(null);
    } catch (err) {
      notifyError(err);
    }
  }

  const set = (name: string, value: any, forcar = false) => {
    setEditando((r) => ({ ...r, [name]: value }));
    const p = onFieldChange?.(name, value, { ...(editando ?? {}), [name]: value }, forcar);
    if (!p) return;
    // só mostra "buscando" se a resposta demorar (consulta na internet)
    const t = setTimeout(() => setBuscando(name), 150);
    p.then((extra) => {
      if (extra) setEditando((r) => (r ? { ...r, ...extra } : r));
    }).catch(notifyError).finally(() => { clearTimeout(t); setBuscando((b) => (b === name ? null : b)); });
  };

  const abrir = (row: Record<string, any>) => { setTocados(new Set()); setEditando(row); };

  // Exporta o que está na tela (respeita a busca), com os nomes dos campos do formulário
  function exportar() {
    const campos = fields.filter((f) => f.type !== "secao" && f.type !== "custom");
    const base = sel.size ? filtrados.filter((r) => sel.has(r.id)) : filtrados;
    const linhas = base.length
      ? base.map((r: any) => Object.fromEntries(campos.map((f) => {
        const v = r[f.name];
        const opcao = f.options?.find((o) => String(o.value) === String(v));
        return [f.label, opcao ? opcao.label : celula(v)];
      }).concat(Object.entries(exportExtra?.(r) ?? {}))))
      // lista vazia: baixa o modelo (só os nomes das colunas), para preencher e importar
      : [Object.fromEntries(campos.filter((f) => f.type !== "readonly").map((f) => [f.label, ""]))];
    baixarPlanilha(table, [{ nome: title, linhas }]).catch(notifyError);
  }

  // campo do formulário: no celular, número, caixa de marcar e campo curto ficam lado a lado (2 por linha)
  const larguraCelular = (f: CampoForm) =>
    f.type === "number" || f.type === "checkbox" || (f.span === 1 && f.type !== "custom" && f.type !== "textarea") ? "col-span-1" : "col-span-2";
  // "Fora de linha (não compra mais; vende até acabar)" → nome + explicação em letra menor
  const partesRotulo = (l: string) => { const i = l.indexOf(" ("); return i > 0 && l.endsWith(")") ? [l.slice(0, i), l.slice(i + 2, -1)] : [l, ""]; };
  const campoForm = (f: CampoForm) => f.type === "checkbox" ? (
    <label key={f.name} className={`${larguraCelular(f)} ${spanClass[f.span ?? 2]} flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm`}>
      <input type="checkbox" className="h-5 w-5 shrink-0" checked={!!editando?.[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
      <span className="min-w-0 leading-tight">{partesRotulo(f.label)[0]}{partesRotulo(f.label)[1] && <span className="block text-xs text-slate-500">{partesRotulo(f.label)[1]}</span>}</span>
    </label>
  ) : f.type === "custom" ? (
    <div key={f.name} className={`min-w-0 ${larguraCelular(f)} ${spanClass[f.span ?? 2]}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}</span>
      {f.render!(editando![f.name], (v) => set(f.name, v), editando!, (nome, v) => set(nome, v))}
    </div>
  ) : (
    <Field key={f.name} label={f.label} className={`${larguraCelular(f)} ${spanClass[f.span ?? 2]} flex flex-col justify-end`}>
      {f.type === "select" ? (
        <select className="input" value={editando![f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} required={f.required}>
          {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : f.type === "textarea" ? (
        <textarea className="input" rows={3} value={editando![f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />
      ) : f.type === "readonly" ? (
        <div className="input flex items-center bg-slate-50 font-mono text-slate-600">{editando![f.name] ?? <span className="font-sans text-slate-400">automático</span>}</div>
      ) : f.mask ? (
        <CampoMascara f={f} valor={editando![f.name]} row={editando!} buscando={buscando === f.name}
          mostrarErro={tocados.has(f.name)} onBlur={() => setTocados((t) => new Set(t).add(f.name))}
          onChange={(v) => set(f.name, v)} onBuscar={() => set(f.name, editando![f.name], true)} />
      ) : (
        <input
          className="input"
          type={f.type ?? "text"}
          step={f.type === "number" ? "any" : undefined}
          value={editando![f.name] ?? ""}
          placeholder={f.placeholder}
          onChange={(e) => set(f.name, e.target.value)}
          required={f.required}
        />
      )}
    </Field>
  );

  // seções do formulário (cada "secao" abre um bloco); no celular só a primeira parte vem aberta
  const grupos = useMemo(() => {
    const g: { secao: CampoForm | null; campos: CampoForm[] }[] = [{ secao: null, campos: [] }];
    for (const f of fields) {
      if (f.type === "secao") g.push({ secao: f, campos: [] });
      else g[g.length - 1].campos.push(f);
    }
    return g.filter((x) => x.secao || x.campos.length);
  }, [fields]);

  return (
    <div>
      <PageHeader
        title={title}
        actions={(() => {
          const botaoExportar = (
            <Button variant="secondary" onClick={exportar} title={filtrados.length ? "Baixar planilha do Excel (o que está filtrado, ou só os selecionados)" : "Baixar o modelo da planilha (lista vazia)"}>
              <FileDown size={16} /> {sel.size ? `Exportar ${sel.size} ${sel.size === 1 ? "selecionado" : "selecionados"}` : filtrados.length ? "Exportar" : "Baixar modelo"}
            </Button>
          );
          // no celular: "Novo" à vista e o resto no botão "Mais" (eram até 5 botões antes da lista)
          return <>
            {!readOnly && <Button className="md:order-last" onClick={() => abrir({ ...defaults })}><Plus size={16} /> Novo</Button>}
            {extraActions ? <MaisAcoes>{botaoExportar}{extraActions}</MaisAcoes> : botaoExportar}
          </>;
        })()}
      />

      {destaque && <FaixaDestaque destaque={destaque} mostrando={data.length} onLimpar={limparDestaque} />}

      {/* No celular os filtros ficam guardados no botão "Filtros" (a lista aparece logo abaixo da busca);
          no computador continuam na mesma linha da busca. */}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="relative min-w-0 flex-1 md:w-full md:max-w-md md:flex-none">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {temFiltros && (
          <button type="button" onClick={() => setPainel((a) => !a)} aria-expanded={painel}
            className={`inline-flex min-h-[46px] shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold md:hidden ${painel || filtrosAtivos ? "border-brand text-brand" : "border-slate-300 text-fg"}`}>
            <SlidersHorizontal size={16} /> Filtros
            {filtrosAtivos > 0 && <span className="rounded-full bg-brand px-1.5 text-xs leading-5 text-white">{filtrosAtivos}</span>}
          </button>
        )}
        <div className={`${painel ? "grid" : "hidden"} w-full grid-cols-2 gap-x-2 gap-y-2.5 md:contents`}>
          {filtros.map((f, i) => (
            <label key={f.label} className="min-w-0 md:contents">
              <span className="mb-1 block truncate text-xs font-semibold text-slate-500 md:hidden">{f.label}</span>
              <select className={`input min-w-0 md:!w-auto md:max-w-[14rem] ${escolhas[f.label] ? "!border-brand" : ""}`} aria-label={f.label}
                value={escolhas[f.label] ?? ""} onChange={(e) => setEscolhas((x) => ({ ...x, [f.label]: e.target.value }))}>
                <option value="">{celular ? "Todos" : `${f.label}: todos`}</option>
                {"valor" in f
                  ? valoresFiltro[i].map((v) => <option key={v} value={v}>{v}</option>)
                  : f.opcoes.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
              </select>
            </label>
          ))}
          {ordens.length > 1 && (
            <label className="min-w-0 md:contents">
              <span className="mb-1 block text-xs font-semibold text-slate-500 md:hidden">Ordem</span>
              <select className="input min-w-0 md:!w-auto" aria-label="Ordenar" value={ordem} onChange={(e) => setOrdem(Number(e.target.value))}>
                {ordens.map((o, i) => <option key={o.label} value={i}>{celular ? o.label : `Ordem: ${o.label}`}</option>)}
              </select>
            </label>
          )}
        </div>
        {(filtrosAtivos > 0 || busca) && (
          <button type="button" className={`px-2 py-2 text-sm text-brand hover:underline ${painel ? "" : "hidden md:inline"}`} onClick={() => { setEscolhas({}); setBusca(""); }}>Limpar filtros</button>
        )}
        {/* filtros escolhidos, à vista com o painel fechado (celular) */}
        {!painel && filtrosAtivos > 0 && (
          <div className="flex w-full flex-wrap gap-1.5 md:hidden">
            {Object.entries(escolhas).filter(([, v]) => v).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setEscolhas((x) => ({ ...x, [k]: "" }))} aria-label={`Tirar o filtro ${k}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-fg">
                <span className="truncate">{k}: {v}</span> <X size={13} className="shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-2 flex min-h-[2.25rem] flex-wrap items-center gap-2 text-sm text-slate-500">
        <span>{filtrados.length === data.length ? `${data.length} ${plural}` : `${filtrados.length} de ${data.length} ${plural}`}</span>
        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-light px-3 py-1 text-fg">
            <b>{sel.size} selecionado(s)</b>
            {marcadores && <Button variant="ghost" onClick={() => setMarcandoLote(true)}>Marcadores</Button>}
            {acoesLote.map((a) => (
              <Button key={a.label} variant="ghost" disabled={!!excluindo} onClick={async () => {
                setExcluindo(`${a.label.toLowerCase()}…`);
                try { notify((await a.executar([...sel])) || "Feito"); setSel(new Set()); invalidar(table); } catch (e) { notifyError(e); } finally { setExcluindo(null); }
              }}>{a.label}</Button>
            ))}
            {podeExcluir && (
              <Button variant="ghost" className="!text-red-600" disabled={!!excluindo} onClick={excluirSelecionados}>
                <Trash2 size={15} /> {excluindo ? `Excluindo ${excluindo}` : "Excluir"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSel(new Set())}><X size={15} /> Limpar seleção</Button>
          </div>
        )}
      </div>

      {props.cartaoCelular && (
        <div className="md:hidden">
          {!isLoading && filtrados.length === 0 && <p className="rounded-2xl border border-slate-200 bg-surface p-8 text-center text-sm text-slate-500">Nenhum registro encontrado.</p>}
          <ul className="space-y-2">
            {filtrados.slice(0, limite).map((row) => (
              <li key={row.id} className={`relative rounded-2xl border border-l-4 bg-surface p-3 shadow-card ${sel.has(row.id) ? "border-brand bg-brand-light/40" : "border-slate-200 border-l-modulo"}`}>
                {selecionavel && (
                  <input type="checkbox" className="absolute right-3 top-3 h-5 w-5" checked={sel.has(row.id)} onChange={() => marcar(row.id)} aria-label="Selecionar" />
                )}
                {/* o cartão reserva o canto de cima à direita para a caixinha de seleção */}
                {props.cartaoCelular!(row, () => { if (!readOnly) abrir({ ...row }); })}
                {marcadores && <div className="mt-1.5">{tags(row)}</div>}
                <div className="mt-3 flex flex-wrap items-center justify-end gap-1 border-t border-slate-100 pt-2">
                  {marcadores && <BotaoMarcadores tabela={table as TabelaMarcavel} registro={row as T & { marcadores?: string[] | null }} nome={marcadores} />}
                  {rowActions?.(row)}
                  {!readOnly && <Button variant="secondary" onClick={() => abrir({ ...row })}><Pencil size={15} /> Editar</Button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={props.cartaoCelular ? "hidden md:block" : ""}>
      <Table
        empty={!isLoading && filtrados.length === 0}
        head={<>
          {selecionavel && (
            <th className="th w-10">
              <input type="checkbox" className="h-4 w-4" checked={todosMarcados} onChange={marcarTodos}
                title={`Selecionar os ${filtrados.length} da lista`} aria-label="Selecionar todos" />
            </th>
          )}
          {columns.map((c) => <th key={c.label} className={`th ${c.className ?? ""}`}>{c.label}</th>)}
          <th className="th" />
        </>}
      >
        {filtrados.slice(0, limite).map((row) => (
          <tr key={row.id} className={`hover:bg-slate-50 ${sel.has(row.id) ? "bg-brand-light/40" : ""}`}>
            {selecionavel && (
              <td className="td sel w-10"><input type="checkbox" className="h-4 w-4" checked={sel.has(row.id)} onChange={() => marcar(row.id)} aria-label="Selecionar" /></td>
            )}
            {columns.map((c, i) => <td key={c.label} className={`td ${c.className ?? ""}`}>{c.render(row)}{i === 0 && marcadores && <div className="mt-1">{tags(row)}</div>}</td>)}
            <td className="td whitespace-nowrap text-right">
              {/* em tela estreita os botões ficam um embaixo do outro, para a tabela não passar da largura */}
              <div className="flex flex-col items-end gap-1 2xl:flex-row 2xl:items-center 2xl:justify-end">
                {marcadores && <BotaoMarcadores tabela={table as TabelaMarcavel} registro={row as T & { marcadores?: string[] | null }} nome={marcadores} />}
                {rowActions?.(row)}
                {!readOnly && <Button variant="secondary" onClick={() => abrir({ ...row })}><Pencil size={15} /> Editar</Button>}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      </div>
      {filtrados.length > limite && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" onClick={() => setLimite((l) => l + POR_VEZ)}>
            Mostrar mais ({filtrados.length - limite} restantes)
          </Button>
        </div>
      )}

      {marcandoLote && marcadores && (
        <AplicarMarcadores tabela={table as TabelaMarcavel} nome={marcadores}
          notas={data.filter((r) => sel.has(r.id)) as (T & { marcadores?: string[] | null })[]} onClose={() => setMarcandoLote(false)} />
      )}
      {props.formulario && editando && props.formulario(editando, () => setEditando(null))}
      <Modal open={!!editando && !props.formulario} onClose={() => setEditando(null)} title={editando?.id ? `Editar` : `Novo cadastro`}>
        {editando && (
          <form onSubmit={salvar}>
            <div className="space-y-3">
              {grupos.map((g, k) => {
                const campos = <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{g.campos.map(campoForm)}</div>;
                if (!g.secao) return <div key={`g${k}`}>{campos}</div>;
                const aberta = !fechadas.has(g.secao.name);
                return (
                  <section key={g.secao.name} className="rounded-xl border border-slate-200 border-l-4 border-l-modulo bg-slate-50 p-3">
                    <button type="button" className="flex w-full items-center gap-2 text-left" aria-expanded={aberta}
                      onClick={() => setFechadas((x) => { const n = new Set(x); if (n.has(g.secao!.name)) n.delete(g.secao!.name); else n.add(g.secao!.name); return n; })}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-modulo-texto">{g.secao.label}</span>
                        {aberta && g.secao.ajuda && <span className="block text-xs font-normal text-slate-600">{g.secao.ajuda}</span>}
                        {!aberta && <span className="block text-xs text-slate-500">{g.campos.length} {g.campos.length === 1 ? "campo" : "campos"} · abrir</span>}
                      </span>
                      <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform ${aberta ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                    {aberta && <div className="mt-3">{campos}</div>}
                  </section>
                );
              })}
            </div>
            {anexos && <div className="mt-4"><Anexos entidade={anexos} id={editando.id} /></div>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/** Tela de celular (abaixo de 768px): os filtros mostram o nome em cima e "Todos" dentro. */
function useCelular(q = "(max-width: 767px)") {
  const [ok, setOk] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const f = () => setOk(m.matches);
    f();
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, [q]);
  return ok;
}

const PLACEHOLDER: Partial<Record<Mascara, string>> = {
  doc: "000.000.000-00 ou 00.000.000/0000-00", cnpj: "00.000.000/0000-00", telefone: "(00) 0000-0000",
  whatsapp: "(00) 00000-0000", cep: "00000-000", email: "nome@empresa.com.br", uf: "SC", ie: "só números ou ISENTO",
};

/** Campo com máscara, validação e atalhos (WhatsApp, ligar, e-mail, buscar CNPJ/CEP). */
export function CampoMascara({ f, valor, row, buscando, mostrarErro, onBlur, onChange, onBuscar }: {
  f: CampoForm; valor: any; row: Record<string, any>; buscando: boolean; mostrarErro: boolean;
  onBlur: () => void; onChange: (v: string) => void; onBuscar: () => void;
}) {
  const m = f.mask!;
  const erro = mostrarErro ? erroCampo(m, valor) : null;
  const ok = !!valor && !erroCampo(m, valor);
  const primeiro = String(row.nome_fantasia || row.nome || "").split(" ")[0];
  const atalho =
    m === "whatsapp" && ok ? { href: whatsappLink(valor, primeiro ? `Olá, ${primeiro}! Aqui é da MF Máquinas.` : "Olá! Aqui é da MF Máquinas."), icone: <MessageCircle size={16} />, titulo: "Chamar no WhatsApp", cor: "text-emerald-600 hover:bg-emerald-50" }
    : m === "telefone" && ok ? { href: `tel:+55${String(valor).replace(/^55(?=\d{10,11}$)/, "")}`, icone: <Phone size={16} />, titulo: "Ligar", cor: "text-sky-600 hover:bg-sky-50" }
    : m === "email" && ok ? { href: `mailto:${valor}`, icone: <Mail size={16} />, titulo: "Enviar e-mail", cor: "text-sky-600 hover:bg-sky-50" }
    : null;
  const botoes = (atalho ? 1 : 0) + (f.buscar ? 1 : 0);
  return (
    <div>
      <div className="relative">
        <input
          className={`input ${erro ? "!border-red-400" : ""}`}
          style={botoes ? { paddingRight: `${botoes * 2.25 + 0.5}rem` } : undefined}
          type={m === "email" ? "email" : "text"}
          inputMode={m === "email" ? "email" : m === "uf" || m === "ie" ? "text" : "numeric"}
          autoComplete="off"
          value={mostrar(m, valor)}
          placeholder={f.placeholder ?? PLACEHOLDER[m]}
          onChange={(e) => onChange(gravar(m, e.target.value))}
          onBlur={onBlur}
          onKeyDown={(e) => { if (f.buscar && e.key === "Enter") { e.preventDefault(); onBuscar(); } }}
          required={f.required}
          aria-invalid={!!erro}
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {atalho && (
            <a href={atalho.href} target="_blank" rel="noreferrer" title={atalho.titulo} aria-label={atalho.titulo}
              className={`rounded-md p-1.5 ${atalho.cor}`} onClick={(e) => e.stopPropagation()}>{atalho.icone}</a>
          )}
          {f.buscar && (
            <button type="button" title="Buscar dados" aria-label={`Buscar ${f.label}`} onClick={(e) => { e.preventDefault(); onBuscar(); }}
              disabled={buscando} className="rounded-md p-1.5 text-brand hover:bg-slate-100 disabled:opacity-60">
              {buscando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          )}
        </div>
      </div>
      {erro && <span className="mt-1 block text-xs font-medium text-red-600">{erro}</span>}
      {!erro && buscando && <span className="mt-1 block text-xs text-slate-500">Buscando…</span>}
    </div>
  );
}
