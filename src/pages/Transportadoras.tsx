// Transportadoras por marca: cada marca é um cartão (site, rastreio, portal, API, atendimento) com as filiais
// que atendem a MF dentro dela; a rede (unidades achadas nos CT-e e na internet), os contatos dos e-mails,
// as condições comerciais e o que veio da internet "a conferir". A lista completa (planilha) continua na outra aba.
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, Globe, Link2, Mail, MapPin, Merge, Pencil,
  Phone, Plug, Plus, Search, SearchCheck, Truck, Unlink, Users,
} from "lucide-react";
import { Button, Field, Modal, PageHeader, Tabs } from "@/components/ui";
import { Contato } from "@/components/Contato";
import Fornecedores from "@/pages/Fornecedores";
import { limpar, useInvalidate, useRows, useSave } from "@/lib/data";
import { dataBR, digitos, docFormat, whatsappLink } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { completarPorCep, completarPorCnpj } from "@/lib/cadastro";
import type { ContatoTransportadora, Transportadora, UnidadeRede } from "@/lib/types";
import {
  API, RECURSOS, SERVICOS, TIPOS, aConferir, combina, filtrar, nomeCurto, porMarca, redeNova, sugestoesAgrupar, temContato, ufsDa,
  type FiltroMarca, type Marca,
} from "@/lib/transportadoras";

const COR_API: Record<string, string> = {
  sim: "bg-emerald-100 text-emerald-800", parcial: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  plataforma: "bg-sky-100 text-sky-800", nao: "bg-slate-100 text-slate-600", desconhecido: "bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200",
};
const MSG = "Olá! Aqui é da MF Máquinas, gostaria de uma cotação de frete.";
const CAMPOS_RECEITA = ["nome", "nome_fantasia", "email", "telefone", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "inscricao_estadual"];

export default function Transportadoras() {
  const [aba, setAba] = useState<"marcas" | "lista">("marcas");
  return (
    <div>
      <Tabs value={aba} onChange={setAba} options={[{ value: "marcas", label: "Por marca" }, { value: "lista", label: "Lista completa (planilha)" }]} />
      {aba === "marcas" ? <PorMarca /> : <Fornecedores tipo="transportadoras" />}
    </div>
  );
}

function PorMarca() {
  const { pode } = usePerfil();
  const podeEditar = pode("editar_transportadoras");
  const { data: rows = [], isLoading } = useRows<Transportadora>("transportadoras", { order: "nome", ascending: true });
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroMarca>("todas");
  const [tipo, setTipo] = useState("");
  const [inativas, setInativas] = useState(false);
  const [editar, setEditar] = useState<{ registro: Partial<Transportadora>; marca?: Transportadora } | null>(null);
  const [agrupar, setAgrupar] = useState<Transportadora | null>(null);
  const [unificar, setUnificar] = useState<Transportadora[] | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const invalidate = useInvalidate();

  const todas = useMemo(() => porMarca(rows, { inativas }), [rows, inativas]);
  const sugestoes = useMemo(() => sugestoesAgrupar(porMarca(rows)), [rows]);
  const lista = useMemo(() => filtrar(todas, filtro).filter((m) => (!tipo || (m.marca.tipo ?? "transportadora") === tipo) && combina(m, busca)), [todas, filtro, tipo, busca]);
  const chips: { v: FiltroMarca; rotulo: string; icone: typeof Plug }[] = [
    { v: "todas", rotulo: "Todas", icone: Truck }, { v: "api", rotulo: "Com API", icone: Plug }, { v: "plataforma", rotulo: "Via plataforma", icone: Link2 },
    { v: "conferir", rotulo: "A conferir", icone: SearchCheck }, { v: "sem_contato", rotulo: "Sem contato", icone: Phone }, { v: "alerta", rotulo: "Com alerta", icone: AlertTriangle },
  ];
  const alterna = (id: string) => setAbertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function rpc(nome: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(nome, args);
    if (error) return notifyError(error), false;
    notify(ok);
    invalidate("transportadoras", "auditoria");
    return true;
  }

  async function rpcSeparar(t: Transportadora) {
    const { error } = await supabase.from("transportadoras").update({ matriz_id: null }).eq("id", t.id);
    if (error) return notifyError(error);
    notify(`${nomeCurto(t)} saiu da marca e virou um cadastro próprio`);
    invalidate("transportadoras");
  }

  return (
    <>
      <PageHeader title="Transportadoras" subtitle="Cada marca com as filiais que atendem a MF; site, rastreio, API e contatos"
        actions={podeEditar && <Button onClick={() => setEditar({ registro: { nome: "", ativo: true, tipo: "transportadora" } })}><Plus size={16} /> Nova transportadora</Button>} />

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar marcas">
        {chips.map(({ v, rotulo, icone: I }) => {
          const n = filtrar(todas, v).length;
          return (
            <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${filtro === v ? "border-brand bg-brand text-brand-fg" : "border-slate-300 bg-surface text-slate-700 hover:border-brand/50"}`}>
              <I size={13} aria-hidden /> {rotulo} <span className="opacity-80">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input className="input pl-9" placeholder="Buscar por nome, CNPJ, cidade, contato…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar transportadora" />
        </label>
        <select className="input w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={inativas} onChange={(e) => setInativas(e.target.checked)} /> Mostrar inativas</label>
      </div>

      {podeEditar && sugestoes.length > 0 && (
        <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <div className="mb-1.5 flex items-center gap-2 font-semibold"><Merge size={16} aria-hidden /> Cadastros que parecem ser da mesma empresa (mesmo CNPJ)</div>
          <ul className="space-y-1.5">
            {sugestoes.map((s) => (
              <li key={s.raiz} className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">{s.soltas.map(nomeCurto).join(", ")}{s.marca && <> → em <b>{nomeCurto(s.marca)}</b></>}</span>
                <Button type="button" variant="secondary" className="!min-h-0 !py-1 text-xs"
                  onClick={() => rpc("agrupar_transportadoras", { p_marca: s.marca?.id ?? null, p_filiais: s.soltas.map((t) => t.id), p_nova_marca: s.marca ? null : nomeCurto(s.soltas[0]).split(/ [-·] /)[0] },
                    `${s.soltas.length} cadastro(s) agrupado(s)`)}>
                  Agrupar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? <p className="py-8 text-center text-sm text-slate-500">Carregando…</p> : !lista.length ? (
        <p className="py-8 text-center text-sm text-slate-500">Nenhuma transportadora com esse filtro.</p>
      ) : (
        <ul className="space-y-2.5">
          {lista.map((m) => (
            <CartaoMarca key={m.marca.id} m={m} aberta={abertas.has(m.marca.id) || !!busca.trim()} onAlternar={() => alterna(m.marca.id)} podeEditar={podeEditar}
              onEditar={(t) => setEditar({ registro: t, marca: t.id === m.marca.id ? undefined : m.marca })}
              onNovaFilial={(base) => setEditar({ registro: { nome: m.marca.nome, ativo: true, tipo: m.marca.tipo, matriz_id: m.marca.id, ...base }, marca: m.marca })}
              onAgrupar={() => setAgrupar(m.marca)} onUnificar={(l) => setUnificar(l)}
              onSeparar={(t) => rpcSeparar(t)} onConferir={() => rpc("conferir_transportadora", { p_id: m.marca.id }, "Marcada como conferida")} />
          ))}
        </ul>
      )}

      {editar && <CadastroModal registro={editar.registro} marca={editar.marca} onClose={() => setEditar(null)} />}
      {agrupar && <AgruparModal marca={agrupar} todas={porMarca(rows)} onClose={() => setAgrupar(null)}
        onAgrupar={async (ids) => { if (await rpc("agrupar_transportadoras", { p_marca: agrupar.id, p_filiais: ids }, `${ids.length} cadastro(s) agora são filiais de ${nomeCurto(agrupar)}`)) setAgrupar(null); }} />}
      {unificar && <UnificarModal opcoes={unificar} onClose={() => setUnificar(null)}
        onUnificar={async (principal, outros, motivo) => { if (await rpc("unificar_transportadoras", { p_principal: principal, p_outros: outros, p_motivo: motivo }, `${outros.length} repetido(s) unificado(s)`)) setUnificar(null); }} />}
    </>
  );

}

/* ------------------------------------------------------------------ cartão da marca */

function CartaoMarca({ m, aberta, onAlternar, podeEditar, onEditar, onNovaFilial, onAgrupar, onUnificar, onSeparar, onConferir }: {
  m: Marca; aberta: boolean; onAlternar: () => void; podeEditar: boolean; onEditar: (t: Transportadora) => void;
  onNovaFilial: (base?: Partial<Transportadora>) => void; onAgrupar: () => void; onUnificar: (l: Transportadora[]) => void;
  onSeparar: (t: Transportadora) => void; onConferir: () => void;
}) {
  const t = m.marca;
  const [aba, setAba] = useState<"filiais" | "contatos" | "rede" | "condicoes" | "internet">("filiais");
  const rede = redeNova(m);
  const ufs = ufsDa(m);
  const api = API[t.api ?? "desconhecido"];
  const links: [string, string | null | undefined, typeof Globe][] = [["Site", t.site, Globe], ["Rastreio", t.rastreio_url, MapPin], ["Portal do cliente", t.portal_url, Users], ["Cotação online", t.cotacao_url, Truck], ["API", t.api_doc_url, Plug]];
  const contatoRapido = [t, ...m.filiais].find((x) => x.whatsapp || x.telefone || x.email);
  const qtdContatos = (t.contatos?.length ?? 0) + (t.emails_operacionais?.length ?? 0);
  const abas: { v: typeof aba; rotulo: string; n?: number }[] = [
    { v: "filiais", rotulo: "Filiais", n: m.filiais.length }, { v: "contatos", rotulo: "Contatos", n: qtdContatos },
    { v: "rede", rotulo: "Rede de unidades", n: rede.filter((u) => !u.cadastrada).length }, { v: "condicoes", rotulo: "Condições" }, { v: "internet", rotulo: "API e internet" },
  ];
  return (
    <li className={`rounded-2xl border bg-surface shadow-card ${t.ativo ? "border-slate-200" : "border-dashed border-slate-300 opacity-75"}`}>
      <div className="flex flex-wrap items-start gap-3 p-3.5">
        <button type="button" onClick={onAlternar} aria-expanded={aberta} aria-label={aberta ? "Fechar" : "Abrir"}
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">
          {aberta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        <div className="min-w-0 flex-1 basis-60">
          <button type="button" onClick={onAlternar} className="text-left">
            <span className="text-base font-bold text-fg">{nomeCurto(t)}</span>
            {t.nome_fantasia && t.nome_fantasia !== t.nome && <span className="ml-2 text-xs text-slate-500">{t.nome}</span>}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Chip>{TIPOS[t.tipo ?? "transportadora"]}</Chip>
            <span title={api.dica} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_API[t.api ?? "desconhecido"]}`}>
              <Plug size={11} aria-hidden /> {api.rotulo}{(t.api === "sim" || t.api === "parcial") && t.api_recursos?.length ? `: ${t.api_recursos.slice(0, 3).map((r) => RECURSOS[r] ?? r).join(", ")}` : ""}
            </span>
            {aConferir(t) && <span title="Dados encontrados na internet: confira antes de usar" className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">a conferir</span>}
            {!t.ativo && <Chip>inativa</Chip>}
            {!temContato(m) && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">sem contato</span>}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {[m.filiais.length ? `${m.filiais.length} filial(is)` : [t.municipio, t.uf].filter(Boolean).join("/"), ufs.length > 1 && ufs.join(", "),
              t.servicos?.length && t.servicos.slice(0, 4).map((s) => SERVICOS[s] ?? s).join(", "), t.ultimo_contato && `último e-mail ${dataBR(t.ultimo_contato)}`].filter(Boolean).join(" · ")}
          </div>
          {t.alerta && <p className="mt-1.5 flex gap-1.5 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-800"><AlertTriangle size={14} className="mt-px shrink-0" aria-hidden /> {t.alerta}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {links.filter(([, u]) => !!u).map(([r, u, I]) => (
            <a key={r} href={u!} target="_blank" rel="noreferrer" title={r} aria-label={r}
              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:border-brand/50 hover:text-brand"><I size={15} /></a>
          ))}
          {contatoRapido?.whatsapp && <a href={whatsappLink(contatoRapido.whatsapp, MSG)} target="_blank" rel="noreferrer" title="Pedir cotação no WhatsApp" className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50"><Phone size={15} /></a>}
          {podeEditar && <Button type="button" variant="secondary" className="!min-h-0 !px-2.5 !py-1.5 text-xs" onClick={() => onEditar(t)}><Pencil size={14} /> Editar</Button>}
        </div>
      </div>

      {aberta && (
        <div className="border-t border-slate-100 px-3.5 pb-3.5 pt-2.5">
          <div className="mb-2.5 flex flex-wrap gap-1" role="tablist">
            {abas.map((a) => (
              <button key={a.v} type="button" role="tab" aria-selected={aba === a.v} onClick={() => setAba(a.v)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${aba === a.v ? "bg-brand text-brand-fg" : "text-slate-600 hover:bg-slate-100"}`}>
                {a.rotulo}{a.n != null && <span className="ml-1 opacity-75">{a.n}</span>}
              </button>
            ))}
          </div>
          {aba === "filiais" && <Filiais m={m} podeEditar={podeEditar} onEditar={onEditar} onNova={() => onNovaFilial()} onAgrupar={onAgrupar} onUnificar={onUnificar} onSeparar={onSeparar} />}
          {aba === "contatos" && <Contatos t={t} />}
          {aba === "rede" && <Rede m={m} itens={rede} podeEditar={podeEditar} onCadastrar={(u) => onNovaFilial({
            nome: t.nome, nome_fantasia: `${nomeCurto(t)} · ${u.municipio ?? u.nome ?? ""}`.trim(), cnpj: digitos(u.cnpj ?? "") || null, municipio: u.municipio ?? null,
            uf: u.uf?.slice(0, 2).toUpperCase() ?? null, telefone: digitos(u.telefone ?? "").slice(0, 13) || null, email: u.email?.split(/[\s/;,]+/)[0] ?? null,
            logradouro: u.endereco ?? null, observacoes: u.origem ? `Veio da rede (${u.origem})` : null,
          })} />}
          {aba === "condicoes" && <Condicoes t={t} />}
          {aba === "internet" && <Internet t={t} podeEditar={podeEditar} onConferir={onConferir} />}
        </div>
      )}
    </li>
  );
}

const Chip = ({ children }: { children: ReactNode }) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{children}</span>;
const Vazio = ({ children }: { children: ReactNode }) => <p className="py-2 text-sm text-slate-500">{children}</p>;

function Filiais({ m, podeEditar, onEditar, onNova, onAgrupar, onUnificar, onSeparar }: {
  m: Marca; podeEditar: boolean; onEditar: (t: Transportadora) => void; onNova: () => void; onAgrupar: () => void;
  onUnificar: (l: Transportadora[]) => void; onSeparar: (t: Transportadora) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const unidades = [m.marca, ...m.filiais];
  const marcados = unidades.filter((u) => sel.has(u.id));
  return (
    <div>
      {podeEditar && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Button type="button" variant="secondary" className="!min-h-0 !py-1 text-xs" onClick={onNova}><Plus size={14} /> Filial</Button>
          <Button type="button" variant="secondary" className="!min-h-0 !py-1 text-xs" onClick={onAgrupar} title="Trazer outros cadastros para dentro desta marca"><Building2 size={14} /> Trazer cadastros para esta marca</Button>
          {marcados.length >= 2 && <Button type="button" className="!min-h-0 !py-1 text-xs" onClick={() => { onUnificar(marcados); setSel(new Set()); }}><Merge size={14} /> Unificar {marcados.length} repetidos</Button>}
        </div>
      )}
      {!m.filiais.length ? <Vazio>Sem filiais: esta marca tem um cadastro só{m.marca.municipio ? ` (${m.marca.municipio}/${m.marca.uf ?? ""})` : ""}.</Vazio> : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {unidades.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              {podeEditar && <input type="checkbox" aria-label={`Marcar ${nomeCurto(u)}`} checked={sel.has(u.id)}
                onChange={() => setSel((s) => { const n = new Set(s); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} />}
              <span className="min-w-0 flex-1 basis-48">
                <span className="font-semibold text-fg">{u.id === m.marca.id ? "Cadastro da marca" : nomeCurto(u)}</span>
                <span className="block text-xs text-slate-500">{[[u.municipio, u.uf].filter(Boolean).join("/"), docFormat(u.cnpj), u.codigo && `cód. ${u.codigo}`, !u.ativo && "inativa"].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <span className="basis-48"><Contato r={u} mensagem={MSG} /></span>
              {podeEditar && (
                <span className="flex gap-1">
                  <Button type="button" variant="ghost" className="!min-h-0 !px-2 !py-1" title="Editar" aria-label={`Editar ${nomeCurto(u)}`} onClick={() => onEditar(u)}><Pencil size={14} /></Button>
                  {u.id !== m.marca.id && <Button type="button" variant="ghost" className="!min-h-0 !px-2 !py-1" title="Tirar da marca (vira cadastro próprio)" aria-label={`Tirar ${nomeCurto(u)} da marca`} onClick={() => onSeparar(u)}><Unlink size={14} /></Button>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Contatos({ t }: { t: Transportadora }) {
  const cs = t.contatos ?? [];
  const ops = t.emails_operacionais ?? [];
  if (!cs.length && !ops.length && !t.sac_telefone && !t.sac_email) return <Vazio>Nenhum contato ainda. Em <b>Editar</b> dá para incluir.</Vazio>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {cs.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {cs.map((c, i) => (
            <li key={i} className="rounded-lg border border-slate-200 px-2.5 py-1.5">
              <span className="font-semibold text-fg">{c.nome || "—"}</span>{c.cargo && <span className="text-xs text-slate-500"> · {c.cargo}</span>}{c.filial && <span className="text-xs text-slate-500"> · {c.filial}</span>}
              <div className="flex flex-wrap gap-x-3 text-xs">
                {c.email && c.email.split(/\s*\/\s*/).map((e) => <a key={e} href={`mailto:${e}`} className="text-brand hover:underline">{e}</a>)}
                {c.telefone && <span className="text-slate-600">{c.telefone}</span>}
                {c.whatsapp && <a href={whatsappLink(c.whatsapp, MSG)} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">WhatsApp {c.whatsapp}</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2 text-sm">
        {(t.sac_telefone || t.sac_email) && <p><b>SAC:</b> {[t.sac_telefone, t.sac_email].filter(Boolean).join(" · ")}</p>}
        {ops.length > 0 && (
          <ul className="space-y-1">
            {ops.map((o, i) => (
              <li key={i} className="flex flex-wrap gap-x-2"><Mail size={14} className="mt-0.5 text-slate-400" aria-hidden /><a href={`mailto:${o.email}`} className="text-brand hover:underline">{o.email}</a>{o.uso && <span className="text-xs text-slate-500">{o.uso}</span>}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Rede({ m, itens, podeEditar, onCadastrar }: { m: Marca; itens: (UnidadeRede & { cadastrada: boolean })[]; podeEditar: boolean; onCadastrar: (u: UnidadeRede) => void }) {
  if (!itens.length) return <Vazio>Sem unidades na rede. Elas aparecem aqui quando vêm dos CT-e ou da pesquisa na internet.</Vazio>;
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">Unidades da {nomeCurto(m.marca)} achadas nos e-mails (CT-e, cotações) e na internet. Só viram cadastro quando você precisar: assim a lista não fica longa.</p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {itens.map((u, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 basis-56">
              <span className="font-semibold text-fg">{u.nome || [u.municipio, u.uf].filter(Boolean).join("/")}</span>
              <span className="block text-xs text-slate-500">{[[u.municipio, u.uf].filter(Boolean).join("/"), u.cnpj && docFormat(u.cnpj), u.telefone, u.email, u.endereco].filter(Boolean).join(" · ")}</span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.origem?.startsWith("internet") ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{u.origem ?? "—"}</span>
            {u.cadastrada ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} /> já cadastrada</span>
              : podeEditar && <Button type="button" variant="secondary" className="!min-h-0 !py-1 text-xs" onClick={() => onCadastrar(u)}><Plus size={14} /> Cadastrar como filial</Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Condicoes({ t }: { t: Transportadora }) {
  if (!t.condicoes && !t.restricoes && !t.observacoes) return <Vazio>Sem condições registradas. Em <b>Editar</b> dá para anotar tabela, reajustes, GRIS, TDE, prazos e restrições.</Vazio>;
  return (
    <div className="grid gap-3 text-sm lg:grid-cols-2">
      {t.condicoes && <div><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">Tabela e condições</h4><p className="whitespace-pre-line">{t.condicoes}</p></div>}
      {t.restricoes && <div><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">Restrições</h4><p className="whitespace-pre-line">{t.restricoes}</p></div>}
      {t.observacoes && <div className="lg:col-span-2"><h4 className="mb-1 text-xs font-semibold uppercase text-slate-500">Observações</h4><p className="whitespace-pre-line text-slate-700">{t.observacoes}</p></div>}
    </div>
  );
}

function Internet({ t, podeEditar, onConferir }: { t: Transportadora; podeEditar: boolean; onConferir: () => void }) {
  return (
    <div className="space-y-2.5 text-sm">
      {aConferir(t) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-amber-900">
          <SearchCheck size={16} aria-hidden />
          <span className="min-w-0 flex-1">Dados encontrados na internet em {dataBR(t.pesquisa_em)}. Confira (site, rastreio, API) e marque como conferido.</span>
          {podeEditar && <Button type="button" variant="secondary" className="!min-h-0 !py-1 text-xs" onClick={onConferir}><CheckCircle2 size={14} /> Conferi</Button>}
        </div>
      )}
      {t.conferido_em && <p className="text-xs text-emerald-700">Conferido{t.conferido_por ? ` por ${t.conferido_por}` : ""} em {dataBR(t.conferido_em)}.</p>}
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold text-slate-600">API</dt>
        <dd>{API[t.api ?? "desconhecido"].rotulo}{t.api_recursos?.length ? ` · ${t.api_recursos.map((r) => RECURSOS[r] ?? r).join(", ")}` : ""}
          {t.api_doc_url && <> · <a href={t.api_doc_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">documentação <ExternalLink size={12} /></a></>}</dd>
        {t.api_como_obter && <><dt className="font-semibold text-slate-600">Como conseguir</dt><dd className="text-slate-700">{t.api_como_obter}</dd></>}
        {t.sistema && <><dt className="font-semibold text-slate-600">Sistema</dt><dd>{t.sistema}</dd></>}
        {t.integracoes?.length ? <><dt className="font-semibold text-slate-600">Aparece em</dt><dd>{t.integracoes.join(", ")}</dd></> : null}
        {t.servicos?.length ? <><dt className="font-semibold text-slate-600">Serviços</dt><dd>{t.servicos.map((s) => SERVICOS[s] ?? s).join(", ")}</dd></> : null}
        {t.abrangencia?.length ? <><dt className="font-semibold text-slate-600">Atende</dt><dd>{t.abrangencia.join(", ")}</dd></> : null}
      </dl>
      {t.pesquisa_fontes?.length ? (
        <details className="text-xs"><summary className="cursor-pointer font-semibold text-slate-600">Fontes ({t.pesquisa_fontes.length})</summary>
          <ul className="mt-1 space-y-0.5">{t.pesquisa_fontes.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">{u}</a></li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ cadastro (marca ou filial) */

function CadastroModal({ registro, marca, onClose }: { registro: Partial<Transportadora>; marca?: Transportadora; onClose: () => void }) {
  const [r, setR] = useState<Partial<Transportadora>>({ contatos: [], emails_operacionais: [], servicos: [], api_recursos: [], abrangencia: [], integracoes: [], ...registro });
  const save = useSave("transportadoras");
  const ehFilial = !!(r.matriz_id ?? marca);
  const set = <K extends keyof Transportadora>(k: K, v: Transportadora[K] | null) => setR((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof Transportadora, label: string, cls = "", extra: Record<string, unknown> = {}) => (
    <Field label={label} className={cls}><input className="input" value={(r[k] as string) ?? ""} onChange={(e) => set(k, e.target.value as never)} {...extra} /></Field>
  );
  const alternaLista = (k: "servicos" | "api_recursos", v: string) => set(k, (r[k] ?? []).includes(v) ? (r[k] ?? []).filter((x) => x !== v) : [...(r[k] ?? []), v]);
  const lista = (s: string) => s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean);

  async function buscarCnpj() {
    const p = await completarPorCnpj(r as Record<string, unknown>, r.cnpj ?? "", CAMPOS_RECEITA, true);
    if (p) setR((x) => ({ ...x, ...p }));
  }
  async function buscarCep() {
    const p = await completarPorCep(r.cep ?? "", true);
    if (p) setR((x) => ({ ...x, ...p }));
  }
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      const contatos = (r.contatos ?? []).filter((c) => Object.values(c).some((v) => v && String(v).trim()));
      const ops = (r.emails_operacionais ?? []).filter((o) => o.email?.trim());
      await save.mutateAsync(limpar({
        ...r, contatos, emails_operacionais: ops, uf: r.uf?.toUpperCase() ?? null, cnpj: digitos(r.cnpj ?? "") || null,
        abrangencia: (r.abrangencia ?? []).map((u) => u.toUpperCase().slice(0, 2)),
      } as Record<string, unknown>));
      notify(r.id ? "Cadastro salvo" : ehFilial ? "Filial cadastrada" : "Transportadora cadastrada");
      onClose();
    } catch (err) {
      notifyError(err);
    }
  }

  return (
    <Modal open wide onClose={onClose} title={r.id ? `Editar ${ehFilial ? "filial" : ""} ${nomeCurto(r as Transportadora) || ""}`.replace(/\s+/g, " ") : ehFilial ? `Nova filial de ${marca ? nomeCurto(marca) : ""}` : "Nova transportadora"}>
      <form onSubmit={salvar} className="space-y-4">
        <Secao titulo="Empresa">
          <Field label="CNPJ (busca na Receita)" className="sm:col-span-2">
            <span className="flex gap-1"><input className="input" value={r.cnpj ?? ""} onChange={(e) => set("cnpj", e.target.value)} inputMode="numeric" />
              <Button type="button" variant="secondary" onClick={buscarCnpj} title="Buscar na Receita" aria-label="Buscar CNPJ na Receita"><Search size={15} /></Button></span>
          </Field>
          {txt("nome_fantasia", ehFilial ? "Nome da filial (como aparece no frete)" : "Nome curto da marca", "sm:col-span-2")}
          {txt("nome", "Razão social", "sm:col-span-2", { required: true })}
          {txt("inscricao_estadual", "Inscrição estadual")}
          <Field label="Tipo">
            <select className="input" value={r.tipo ?? "transportadora"} onChange={(e) => set("tipo", e.target.value as Transportadora["tipo"])}>
              {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={r.ativo ?? true} onChange={(e) => set("ativo", e.target.checked)} /> Ativa</label>
        </Secao>
        <Secao titulo="Contato desta unidade">
          {txt("contato", "Pessoa de contato")}
          {txt("whatsapp", "WhatsApp (para cotação)")}
          {txt("telefone", "Telefone")}
          {txt("email", "E-mail", "", { type: "email" })}
          {txt("regioes", "Regiões que atende (texto)", "sm:col-span-4")}
        </Secao>
        <Secao titulo="Endereço">
          <Field label="CEP"><span className="flex gap-1"><input className="input" value={r.cep ?? ""} onChange={(e) => set("cep", e.target.value)} inputMode="numeric" />
            <Button type="button" variant="secondary" onClick={buscarCep} aria-label="Buscar CEP"><Search size={15} /></Button></span></Field>
          {txt("logradouro", "Logradouro", "sm:col-span-3")}
          {txt("numero", "Número")}{txt("complemento", "Complemento")}{txt("bairro", "Bairro", "sm:col-span-2")}
          {txt("municipio", "Município", "sm:col-span-3")}{txt("uf", "UF", "", { maxLength: 2 })}
        </Secao>
        {!ehFilial && (
          <>
            <Secao titulo="Internet e API">
              {txt("site", "Site", "sm:col-span-2", { type: "url", placeholder: "https://" })}
              {txt("rastreio_url", "Página de rastreio ({nf} {cnpj} {codigo} viram os dados do envio)", "sm:col-span-2", { placeholder: "https://" })}
              {txt("portal_url", "Portal do cliente", "sm:col-span-2", { type: "url", placeholder: "https://" })}
              {txt("cotacao_url", "Cotação online", "sm:col-span-2", { type: "url", placeholder: "https://" })}
              <Field label="Tem API?">
                <select className="input" value={r.api ?? "desconhecido"} onChange={(e) => set("api", e.target.value as Transportadora["api"])}>
                  {Object.entries(API).map(([v, a]) => <option key={v} value={v}>{a.rotulo}</option>)}
                </select>
              </Field>
              {txt("api_doc_url", "Documentação da API", "sm:col-span-2", { type: "url", placeholder: "https://" })}
              {txt("sistema", "Sistema (ex.: SSW)")}
              <Toggles titulo="O que a API faz" opcoes={RECURSOS} valores={r.api_recursos ?? []} onAlternar={(v) => alternaLista("api_recursos", v)} />
              <Field label="Como conseguir o acesso" className="sm:col-span-4"><textarea className="input" rows={2} value={r.api_como_obter ?? ""} onChange={(e) => set("api_como_obter", e.target.value)} /></Field>
              <Field label="Aparece nas plataformas (separe por vírgula)" className="sm:col-span-4"><input className="input" value={(r.integracoes ?? []).join(", ")} onChange={(e) => set("integracoes", lista(e.target.value))} placeholder="Melhor Envio, Frenet" /></Field>
            </Secao>
            <Secao titulo="Serviços e atendimento">
              <Toggles titulo="Serviços" opcoes={SERVICOS} valores={r.servicos ?? []} onAlternar={(v) => alternaLista("servicos", v)} />
              <Field label="Estados atendidos (ex.: SC, PR, RS)" className="sm:col-span-2"><input className="input" value={(r.abrangencia ?? []).join(", ")} onChange={(e) => set("abrangencia", lista(e.target.value))} /></Field>
              {txt("sac_telefone", "SAC: telefone")}{txt("sac_email", "SAC: e-mail")}
              <ListaContatos valor={r.contatos ?? []} onChange={(v) => set("contatos", v)} />
              <ListaEmails valor={r.emails_operacionais ?? []} onChange={(v) => set("emails_operacionais", v)} />
            </Secao>
            <Secao titulo="Condições">
              <Field label="Tabela e condições (reajustes, GRIS, TDE, prazos, cubagem…)" className="sm:col-span-4"><textarea className="input" rows={3} value={r.condicoes ?? ""} onChange={(e) => set("condicoes", e.target.value)} /></Field>
              <Field label="Restrições (peso, medidas, regiões)" className="sm:col-span-2"><textarea className="input" rows={2} value={r.restricoes ?? ""} onChange={(e) => set("restricoes", e.target.value)} /></Field>
              <Field label="Alerta (aparece em vermelho no cartão)" className="sm:col-span-2"><textarea className="input" rows={2} value={r.alerta ?? ""} onChange={(e) => set("alerta", e.target.value)} /></Field>
            </Secao>
          </>
        )}
        <Field label="Observações"><textarea className="input" rows={3} value={r.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

const Secao = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <fieldset className="rounded-xl border border-slate-200 p-3">
    <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</legend>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">{children}</div>
  </fieldset>
);

function Toggles({ titulo, opcoes, valores, onAlternar }: { titulo: string; opcoes: Record<string, string>; valores: string[]; onAlternar: (v: string) => void }) {
  return (
    <div className="sm:col-span-4">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{titulo}</span>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(opcoes).map(([v, l]) => (
          <button key={v} type="button" aria-pressed={valores.includes(v)} onClick={() => onAlternar(v)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${valores.includes(v) ? "border-brand bg-brand text-brand-fg" : "border-slate-300 text-slate-700 hover:border-brand/50"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function ListaContatos({ valor, onChange }: { valor: ContatoTransportadora[]; onChange: (v: ContatoTransportadora[]) => void }) {
  const muda = (i: number, k: keyof ContatoTransportadora, v: string) => onChange(valor.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  return (
    <div className="sm:col-span-4">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">Pessoas (comercial, coleta, financeiro…)</span>
      <ul className="space-y-1.5">
        {valor.map((c, i) => (
          <li key={i} className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 p-1.5 sm:grid-cols-6">
            {(["nome", "cargo", "filial", "email", "telefone", "whatsapp"] as const).map((k) => (
              <input key={k} className="input !py-1 text-xs" placeholder={k === "filial" ? "filial/cidade" : k} aria-label={k} value={c[k] ?? ""} onChange={(e) => muda(i, k, e.target.value)} />
            ))}
            <button type="button" className="col-span-2 text-left text-xs text-red-600 hover:underline sm:col-span-6" onClick={() => onChange(valor.filter((_, j) => j !== i))}>tirar</button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" className="mt-1 !min-h-0 !py-1 text-xs" onClick={() => onChange([...valor, {}])}><Plus size={14} /> Pessoa</Button>
    </div>
  );
}

function ListaEmails({ valor, onChange }: { valor: { email: string; uso?: string }[]; onChange: (v: { email: string; uso?: string }[]) => void }) {
  return (
    <div className="sm:col-span-4">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">E-mails da operação (coleta, cotação, XML, financeiro)</span>
      <ul className="space-y-1">
        {valor.map((o, i) => (
          <li key={i} className="flex gap-1.5">
            <input className="input !py-1 text-xs" placeholder="e-mail" aria-label="e-mail" value={o.email} onChange={(e) => onChange(valor.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
            <input className="input !py-1 text-xs" placeholder="para quê" aria-label="uso" value={o.uso ?? ""} onChange={(e) => onChange(valor.map((x, j) => (j === i ? { ...x, uso: e.target.value } : x)))} />
            <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => onChange(valor.filter((_, j) => j !== i))}>tirar</button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" className="mt-1 !min-h-0 !py-1 text-xs" onClick={() => onChange([...valor, { email: "" }])}><Plus size={14} /> E-mail</Button>
    </div>
  );
}

/* ------------------------------------------------------------------ agrupar e unificar */

function AgruparModal({ marca, todas, onClose, onAgrupar }: { marca: Transportadora; todas: Marca[]; onClose: () => void; onAgrupar: (ids: string[]) => void }) {
  const [busca, setBusca] = useState(nomeCurto(marca).split(/[ ·-]/)[0]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const opcoes = todas.filter((m) => m.marca.id !== marca.id && combina(m, busca)).slice(0, 60);
  return (
    <Modal open onClose={onClose} title={`Trazer cadastros para ${nomeCurto(marca)}`}>
      <p className="mb-2 text-sm text-slate-600">Os marcados viram filiais de <b>{nomeCurto(marca)}</b> (as filiais deles vêm junto). Pedidos e envios continuam apontando para eles.</p>
      <input className="input mb-2" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" aria-label="Buscar cadastros" />
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {opcoes.map((m) => (
          <li key={m.marca.id}>
            <label className="flex items-center gap-2 px-3 py-2 text-sm">
              <input type="checkbox" checked={sel.has(m.marca.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(m.marca.id)) n.delete(m.marca.id); else n.add(m.marca.id); return n; })} />
              <span className="min-w-0 flex-1"><b>{nomeCurto(m.marca)}</b><span className="block text-xs text-slate-500">{[[m.marca.municipio, m.marca.uf].filter(Boolean).join("/"), docFormat(m.marca.cnpj), m.filiais.length && `${m.filiais.length} filial(is)`].filter(Boolean).join(" · ")}</span></span>
            </label>
          </li>
        ))}
        {!opcoes.length && <li className="px-3 py-4 text-sm text-slate-500">Nada encontrado.</li>}
      </ul>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
        <Button type="button" disabled={!sel.size} onClick={() => onAgrupar([...sel])}><Building2 size={15} /> Trazer {sel.size || ""}</Button>
      </div>
    </Modal>
  );
}

function UnificarModal({ opcoes, onClose, onUnificar }: { opcoes: Transportadora[]; onClose: () => void; onUnificar: (principal: string, outros: string[], motivo: string) => void }) {
  const [principal, setPrincipal] = useState(opcoes.find((o) => o.cnpj)?.id ?? opcoes[0].id);
  const [motivo, setMotivo] = useState("Cadastro repetido");
  return (
    <Modal open onClose={onClose} title={`Unificar ${opcoes.length} cadastros`}>
      <p className="mb-2 text-sm text-slate-600">Escolha o que fica. Pedidos, envios e cotações dos outros passam para ele; o que só os outros tinham (telefone, e-mail, endereço) completa o principal; os outros ficam inativos com o aviso, nada é apagado.</p>
      <ul className="mb-3 space-y-1">
        {opcoes.map((o) => (
          <li key={o.id}><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <input type="radio" name="principal" checked={principal === o.id} onChange={() => setPrincipal(o.id)} />
            <span><b>{nomeCurto(o)}</b><span className="block text-xs text-slate-500">{[[o.municipio, o.uf].filter(Boolean).join("/"), docFormat(o.cnpj), o.codigo && `cód. ${o.codigo}`].filter(Boolean).join(" · ")}</span></span>
          </label></li>
        ))}
      </ul>
      <Field label="Motivo (fica no histórico)"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
        <Button type="button" onClick={() => onUnificar(principal, opcoes.map((o) => o.id).filter((id) => id !== principal), motivo)}><Merge size={15} /> Unificar</Button>
      </div>
    </Modal>
  );
}
