// Cadastro do cliente: até 3 endereços (o principal e mais 2), cada um com etiqueta (Loja, Residência, Prédio, Vizinho…),
// e o aviso "Cadastro unificado" com o que veio de cada cadastro juntado a este.
import { useState } from "react";
import { MapPinned, Merge, Plus, Trash2 } from "lucide-react";
import { Field } from "../ui";
import { CampoMascara } from "../CrudPage";
import { completarPorCep } from "@/lib/cadastro";
import { dataBR, digitos, docFormat } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import type { EnderecoExtra, Unificacao } from "@/lib/types";

/** Sugestões de etiqueta; dá para digitar outra. */
export const ETIQUETAS_ENDERECO = ["Loja", "Residência", "Prédio", "Vizinho"];
/** O principal e mais 2. */
export const MAX_ENDERECOS = 3;

export const textoEndereco = (e: Partial<EnderecoExtra>) =>
  [[e.logradouro, e.numero].filter(Boolean).join(", "), e.complemento, e.bairro, [e.municipio, e.uf].filter(Boolean).join("/")].filter(Boolean).join(" - ");

export const linkMapa = (e: Partial<EnderecoExtra>) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${textoEndereco(e)} ${e.cep ?? ""}`)}`;

/** Endereços extras prontos para gravar: sem os vazios, CEP só com números e UF em maiúsculas. */
export function limparEnderecos(lista: EnderecoExtra[] | null | undefined): EnderecoExtra[] {
  return (lista ?? [])
    .map((e) => {
      const r: EnderecoExtra = {};
      for (const [k, v] of Object.entries(e)) {
        const s = typeof v === "string" ? v.trim() : v;
        if (s !== "" && s != null) (r as any)[k] = s;
      }
      if (r.cep) r.cep = digitos(r.cep);
      if (r.uf) r.uf = r.uf.toUpperCase();
      return r;
    })
    .filter((e) => e.logradouro || e.cep || e.municipio)
    .slice(0, MAX_ENDERECOS - 1);
}

/** Etiqueta do endereço: as sugestões em botões e um campo para digitar outra. */
export function EtiquetaEndereco({ valor, onChange, disabled }: { valor: string | null | undefined; onChange: (v: string | null) => void; disabled?: boolean }) {
  const outra = !!valor && !ETIQUETAS_ENDERECO.includes(valor);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Etiqueta do endereço">
      {ETIQUETAS_ENDERECO.map((t) => (
        <button key={t} type="button" aria-pressed={valor === t} disabled={disabled} onClick={() => onChange(valor === t ? null : t)}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${valor === t ? "bg-brand text-brand-fg shadow-sm" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
          {t}
        </button>
      ))}
      <input className="input !h-8 !w-36 !py-1 text-xs" placeholder="Outra (digite)" aria-label="Outra etiqueta" maxLength={30} disabled={disabled}
        value={outra ? valor ?? "" : ""} onChange={(e) => onChange(e.target.value || null)} />
    </div>
  );
}

/** Endereços 2 e 3 do cliente (o 1 é o principal, nos campos de sempre). */
export function EnderecosExtras({ lista, onChange, disabled }: { lista: EnderecoExtra[]; onChange: (l: EnderecoExtra[]) => void; disabled?: boolean }) {
  const [buscando, setBuscando] = useState<number | null>(null);
  const [tocados, setTocados] = useState<Set<number>>(new Set());

  const mudar = (i: number, dados: Partial<EnderecoExtra>) => onChange(lista.map((e, j) => (j === i ? { ...e, ...dados } : e)));

  function cep(i: number, valor: string, forcar = false) {
    mudar(i, { cep: valor });
    if (!forcar && digitos(valor).length !== 8) return;
    setBuscando(i);
    completarPorCep(valor, forcar)
      .then((r) => r && onChange(lista.map((e, j) => (j === i ? { ...e, cep: valor, logradouro: r.logradouro, bairro: r.bairro, municipio: r.municipio, uf: r.uf } : e))))
      .catch(notifyError)
      .finally(() => setBuscando(null));
  }

  const campo = (i: number, nome: keyof EnderecoExtra, rotulo: string, span: string) => (
    <Field label={rotulo} className={`col-span-1 ${span}`}>
      <input className="input" value={(lista[i][nome] as string) ?? ""} disabled={disabled} onChange={(e) => mudar(i, { [nome]: e.target.value })} />
    </Field>
  );

  return (
    <div className="space-y-3">
      {lista.map((e, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-fg">Endereço {i + 2}</span>
            {e.origem && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-800">veio do {e.origem}</span>}
            <div className="flex-1" />
            {textoEndereco(e) && (
              <a href={linkMapa(e)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-light">
                <MapPinned size={14} /> Mapa
              </a>
            )}
            {!disabled && (
              <button type="button" onClick={() => onChange(lista.filter((_, j) => j !== i))} title="Tirar este endereço" aria-label={`Tirar o endereço ${i + 2}`}
                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
            )}
          </div>
          <div className="mb-3"><EtiquetaEndereco valor={e.etiqueta} disabled={disabled} onChange={(v) => mudar(i, { etiqueta: v })} /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <Field label="CEP" className="col-span-1 sm:col-span-3">
              <CampoMascara f={{ name: `cep_${i}`, label: "CEP", mask: "cep", buscar: true }} valor={e.cep} row={{}} buscando={buscando === i}
                mostrarErro={tocados.has(i)} onBlur={() => setTocados((t) => new Set(t).add(i))}
                onChange={(v) => cep(i, v)} onBuscar={() => cep(i, e.cep ?? "", true)} />
            </Field>
            {campo(i, "logradouro", "Endereço", "sm:col-span-7")}
            {campo(i, "numero", "Número", "sm:col-span-2")}
            {campo(i, "complemento", "Complemento", "sm:col-span-4")}
            {campo(i, "bairro", "Bairro", "sm:col-span-4")}
            {campo(i, "municipio", "Município", "sm:col-span-3")}
            <Field label="UF" className="col-span-1 sm:col-span-1">
              <input className="input uppercase" maxLength={2} value={e.uf ?? ""} disabled={disabled} onChange={(ev) => mudar(i, { uf: ev.target.value.toUpperCase() })} />
            </Field>
          </div>
        </div>
      ))}
      {!disabled && lista.length < MAX_ENDERECOS - 1 && (
        <button type="button" onClick={() => onChange([...lista, {}])}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-600 transition hover:border-brand hover:text-brand">
          <Plus size={16} /> Adicionar endereço {lista.length + 2} (até {MAX_ENDERECOS})
        </button>
      )}
    </div>
  );
}

/** Aviso no cadastro: com quais cadastros este foi unificado e o que veio de cada um. */
export function AvisoUnificacao({ unificacoes }: { unificacoes: Unificacao[] | null | undefined }) {
  const lista = unificacoes ?? [];
  if (!lista.length) return null;
  return (
    <section className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-900 shadow-card sm:p-5" aria-label="Cadastro unificado">
      <header className="mb-2 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-100 text-purple-700"><Merge size={18} /></span>
        <div>
          <h3 className="font-bold leading-tight">Cadastro unificado</h3>
          <p className="text-xs text-purple-800">
            {lista.length === 1 ? "Outro cadastro foi juntado a este" : `${lista.length} cadastros foram juntados a este`}. Pedidos, notas, contas e OS de lá estão aqui;
            o que era diferente ficou guardado neste cadastro.
          </p>
        </div>
      </header>
      <ul className="space-y-2">
        {lista.map((u, i) => (
          <li key={u.id ?? i} className="rounded-xl bg-surface/70 p-3">
            <div className="font-semibold">
              {u.codigo ? `Nº ${u.codigo} · ` : ""}{u.nome ?? "Sem nome"}
              {u.doc && <span className="font-normal text-purple-800"> · {docFormat(u.doc)}</span>}
            </div>
            <div className="text-xs text-purple-800">Unificado em {u.em ? dataBR(u.em) : "—"}{u.por ? ` por ${u.por}` : ""}</div>
            {(u.email || u.whatsapp || u.telefone || u.endereco) && (
              <div className="mt-1 text-xs text-slate-600">Como estava: {[u.email, u.whatsapp, u.telefone, u.endereco].filter(Boolean).join(" · ")}</div>
            )}
            {!!u.completou?.length && <div className="mt-1.5"><b>Completou:</b> {u.completou.join(", ")}</div>}
            {!!u.trouxe?.length && (
              <div className="mt-1"><b>Ficou guardado aqui:</b>
                <ul className="ml-4 list-disc">{u.trouxe.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
            {!!u.fora?.length && (
              <div className="mt-1 text-amber-800"><b>Não coube (anote se precisar):</b>
                <ul className="ml-4 list-disc">{u.fora.map((t) => <li key={t}>{t}</li>)}</ul>
              </div>
            )}
            {!u.completou?.length && !u.trouxe?.length && !u.fora?.length && <div className="mt-1 text-xs text-slate-600">Nada diferente: os dados eram os mesmos deste cadastro.</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}
