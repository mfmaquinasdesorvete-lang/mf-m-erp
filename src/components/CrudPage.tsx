import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { FileDown, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Search } from "lucide-react";
import { limpar, useRows, useSave } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { Button, Field, Modal, PageHeader, Table } from "./ui";
import { baixarPlanilha, celula } from "@/lib/exportar";
import { Anexos } from "./Anexos";
import { erroCampo, gravar, mostrar, type Mascara } from "@/lib/mascaras";
import { whatsappLink } from "@/lib/format";

export type CampoForm = {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "textarea" | "email" | "checkbox" | "custom" | "secao" | "readonly";
  /** Máscara e validação (CPF/CNPJ, telefone, CEP, e-mail…): mostra formatado, grava só os números. */
  mask?: Mascara;
  /** Botão de lupa que busca os dados (CNPJ, CEP): chama onFieldChange com forcar = true. */
  buscar?: boolean;
  placeholder?: string;
  options?: { value: string | number; label: string }[];
  /** type "custom": desenha o campo (ex.: foto) */
  render?: (valor: any, set: (v: any) => void, row: Record<string, any>) => ReactNode;
  ajuda?: string;
  span?: 1 | 2 | 3 | 4;
  required?: boolean;
};

export type Coluna<T> = { label: string; render: (row: T) => ReactNode; className?: string };

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
  /** Reage à mudança de um campo (ex.: CEP preenche endereço). */
  onFieldChange?: (name: string, value: any, row: Record<string, any>, forcar?: boolean) => Promise<Record<string, any> | null | void>;
  /** Mostra os documentos anexados no formulário (ex.: "cliente"). */
  anexos?: string;
  /** Colunas a mais na planilha exportada (ex.: estoque). */
  exportExtra?: (row: T) => Record<string, unknown>;
  /** Só consulta: esconde "Novo" e "Editar". */
  readOnly?: boolean;
};

const spanClass = { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4" };

export function CrudPage<T extends { id: string }>(props: Props<T>) {
  const { title, table, fields, columns, searchKeys, defaults, order = "created_at", rowActions, extraActions, beforeSave, onFieldChange, readOnly, exportExtra, anexos } = props;
  const { data = [], isLoading } = useRows<T>(table, { order, ascending: order !== "created_at" });
  const save = useSave(table);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Record<string, any> | null>(null);
  const [buscando, setBuscando] = useState<string | null>(null);
  const [tocados, setTocados] = useState<Set<string>>(new Set());

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    if (!b) return data;
    return data.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(b)));
  }, [data, busca, searchKeys]);

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
      await save.mutateAsync(row);
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
    const linhas = filtrados.length
      ? filtrados.map((r: any) => Object.fromEntries(campos.map((f) => {
        const v = r[f.name];
        const opcao = f.options?.find((o) => String(o.value) === String(v));
        return [f.label, opcao ? opcao.label : celula(v)];
      }).concat(Object.entries(exportExtra?.(r) ?? {}))))
      // lista vazia: baixa o modelo (só os nomes das colunas), para preencher e importar
      : [Object.fromEntries(campos.filter((f) => f.type !== "readonly").map((f) => [f.label, ""]))];
    baixarPlanilha(table, [{ nome: title, linhas }]).catch(notifyError);
  }

  return (
    <div>
      <PageHeader
        title={title}
        actions={<>
          <Button variant="secondary" onClick={exportar} title={filtrados.length ? "Baixar planilha do Excel" : "Baixar o modelo da planilha (lista vazia)"}><FileDown size={16} /> {filtrados.length ? "Exportar" : "Baixar modelo"}</Button>
          {extraActions}
          {!readOnly && <Button onClick={() => abrir({ ...defaults })}><Plus size={16} /> Novo</Button>}
        </>}
      />

      <div className="relative mb-3 max-w-md">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input className="input pl-9" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Table
        empty={!isLoading && filtrados.length === 0}
        head={<>
          {columns.map((c) => <th key={c.label} className={`th ${c.className ?? ""}`}>{c.label}</th>)}
          <th className="th" />
        </>}
      >
        {filtrados.map((row) => (
          <tr key={row.id} className="hover:bg-slate-50">
            {columns.map((c) => <td key={c.label} className={`td ${c.className ?? ""}`}>{c.render(row)}</td>)}
            <td className="td whitespace-nowrap text-right">
              {rowActions?.(row)}
              {!readOnly && <Button variant="secondary" className="ml-1" onClick={() => abrir({ ...row })}><Pencil size={15} /> Editar</Button>}
            </td>
          </tr>
        ))}
      </Table>

      <Modal open={!!editando} onClose={() => setEditando(null)} title={editando?.id ? `Editar` : `Novo cadastro`}>
        {editando && (
          <form onSubmit={salvar}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {fields.map((f) => f.type === "secao" ? (
                <div key={f.name} className="mt-2 border-t border-slate-100 pt-4 sm:col-span-4">
                  <div className="text-sm font-bold text-fg">{f.label}</div>
                  {f.ajuda && <div className="text-xs text-slate-500">{f.ajuda}</div>}
                </div>
              ) : f.type === "custom" ? (
                <div key={f.name} className={spanClass[f.span ?? 2]}>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">{f.label}</span>
                  {f.render!(editando[f.name], (v) => set(f.name, v), editando)}
                </div>
              ) : (
                <Field key={f.name} label={f.label} className={spanClass[f.span ?? 2]}>
                  {f.type === "select" ? (
                    <select className="input" value={editando[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} required={f.required}>
                      {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea className="input" rows={3} value={editando[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />
                  ) : f.type === "checkbox" ? (
                    <input type="checkbox" className="h-5 w-5" checked={!!editando[f.name]} onChange={(e) => set(f.name, e.target.checked)} />
                  ) : f.type === "readonly" ? (
                    <div className="input flex items-center bg-slate-50 font-mono text-slate-600">{editando[f.name] ?? <span className="font-sans text-slate-400">automático</span>}</div>
                  ) : f.mask ? (
                    <CampoMascara f={f} valor={editando[f.name]} row={editando} buscando={buscando === f.name}
                      mostrarErro={tocados.has(f.name)} onBlur={() => setTocados((t) => new Set(t).add(f.name))}
                      onChange={(v) => set(f.name, v)} onBuscar={() => set(f.name, editando[f.name], true)} />
                  ) : (
                    <input
                      className="input"
                      type={f.type ?? "text"}
                      step={f.type === "number" ? "any" : undefined}
                      value={editando[f.name] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.name, e.target.value)}
                      required={f.required}
                    />
                  )}
                </Field>
              ))}
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

const PLACEHOLDER: Partial<Record<Mascara, string>> = {
  doc: "000.000.000-00 ou 00.000.000/0000-00", cnpj: "00.000.000/0000-00", telefone: "(00) 0000-0000",
  whatsapp: "(00) 00000-0000", cep: "00000-000", email: "nome@empresa.com.br", uf: "SC", ie: "só números ou ISENTO",
};

/** Campo com máscara, validação e atalhos (WhatsApp, ligar, e-mail, buscar CNPJ/CEP). */
function CampoMascara({ f, valor, row, buscando, mostrarErro, onBlur, onChange, onBuscar }: {
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
