// Marca com filiais e cadastros repetidos, para fornecedores e transportadoras: unificar (o repetido passa tudo
// para o principal e fica arquivado), agrupar filiais numa marca e ver as filiais de uma marca.
import { useState, type FormEvent } from "react";
import { Building2, ExternalLink, Merge, RefreshCw } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { callFunction } from "@/lib/supabase";
import { docFormat, pl } from "@/lib/format";
import { formatarTelefone } from "@/lib/mascaras";
import { notify, notifyError } from "@/lib/notify";
import type { FilialRede } from "@/lib/types";
import { repetidosProvaveis } from "@/lib/repetidos";

export type CadastroBase = {
  id: string; nome: string; nome_fantasia?: string | null; cnpj?: string | null; municipio?: string | null; uf?: string | null;
  codigo?: number | null; telefone?: string | null; email?: string | null; receita_situacao?: string | null; matriz_id?: string | null;
};

const nomeCurto = (o: CadastroBase) => o.nome_fantasia?.trim() || o.nome;
const local = (o: CadastroBase) => [o.municipio, o.uf].filter(Boolean).join("/");
const sem = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Escolher o principal entre os repetidos e o motivo. */
export function UnificarCadastros<T extends CadastroBase>({ opcoes, titulo = "cadastros", onClose, onUnificar }: {
  opcoes: T[]; titulo?: string; onClose: () => void; onUnificar: (principal: string, outros: string[], motivo: string) => Promise<void>;
}) {
  const [principal, setPrincipal] = useState(opcoes.find((o) => o.cnpj)?.id ?? opcoes[0]?.id);
  const [motivo, setMotivo] = useState("Cadastro repetido");
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    try { await onUnificar(principal, opcoes.map((o) => o.id).filter((id) => id !== principal), motivo); } finally { setOcupado(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Unificar ${opcoes.length} ${titulo}`}>
      <form onSubmit={enviar} className="space-y-3">
        <p className="text-sm text-slate-600">Escolha o que fica. Notas, contas, compras e cotações dos outros passam para ele; o que só os outros tinham
          (telefone, e-mail, endereço) completa o principal; os outros ficam arquivados com o aviso. Nada é apagado.</p>
        <ul className="space-y-1">
          {opcoes.map((o) => (
            <li key={o.id}><label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${principal === o.id ? "border-brand bg-brand/5" : "border-slate-200"}`}>
              <input type="radio" name="principal" checked={principal === o.id} onChange={() => setPrincipal(o.id)} />
              <span className="min-w-0"><b className="[overflow-wrap:anywhere]">{nomeCurto(o)}</b>
                <span className="block text-xs text-slate-500">{[local(o), docFormat(o.cnpj) || "sem CNPJ", o.codigo && `cód. ${o.codigo}`].filter(Boolean).join(" · ")}</span></span>
            </label></li>
          ))}
        </ul>
        <Field label="Motivo (fica no histórico)"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={ocupado || opcoes.length < 2}><Merge size={16} aria-hidden /> {ocupado ? "Unificando…" : "Unificar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Agrupar os marcados como filiais de uma marca (um deles ou uma marca nova só com o nome). */
export function AgruparFiliais<T extends CadastroBase>({ opcoes, marcas, onClose, onAgrupar }: {
  opcoes: T[]; marcas: T[]; onClose: () => void; onAgrupar: (marca: string | null, filiais: string[], novaMarca: string | null) => Promise<void>;
}) {
  // marca sugerida: a que já tem filiais, senão a "matriz" (CNPJ terminado em 0001), senão a primeira
  const sugerida = opcoes.find((o) => marcas.some((m) => m.id === o.id)) ?? opcoes.find((o) => /0001\d{2}$/.test(String(o.cnpj ?? ""))) ?? opcoes[0];
  const [marca, setMarca] = useState<string>(sugerida?.id ?? "nova");
  const [nova, setNova] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    try { await onAgrupar(marca === "nova" ? null : marca, opcoes.map((o) => o.id), marca === "nova" ? nova : null); } finally { setOcupado(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Agrupar ${opcoes.length} como filiais`}>
      <form onSubmit={enviar} className="space-y-3">
        <p className="text-sm text-slate-600">A marca vira o cartão da lista; as filiais ficam dentro dela (cada uma com o seu CNPJ, endereço e notas).</p>
        <fieldset className="space-y-1">
          <legend className="mb-1 text-xs font-semibold text-slate-600">Qual é a marca (matriz)?</legend>
          {opcoes.map((o) => (
            <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${marca === o.id ? "border-brand bg-brand/5" : "border-slate-200"}`}>
              <input type="radio" name="marca" checked={marca === o.id} onChange={() => setMarca(o.id)} />
              <span className="min-w-0"><b className="[overflow-wrap:anywhere]">{nomeCurto(o)}</b>
                <span className="block text-xs text-slate-500">{[local(o), docFormat(o.cnpj) || "sem CNPJ"].filter(Boolean).join(" · ")}</span></span>
            </label>
          ))}
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${marca === "nova" ? "border-brand bg-brand/5" : "border-slate-200"}`}>
            <input type="radio" name="marca" checked={marca === "nova"} onChange={() => setMarca("nova")} /> Nova marca (só o nome)
          </label>
        </fieldset>
        {marca === "nova" && <Field label="Nome da marca"><input className="input" value={nova} onChange={(e) => setNova(e.target.value)} required minLength={2} autoFocus /></Field>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={ocupado}>{ocupado ? "Agrupando…" : "Agrupar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Filiais de uma marca: cada uma com cidade, CNPJ, contato e a situação na Receita; repetidos prováveis e a rede achada na internet. */
export function FiliaisDaMarca<T extends CadastroBase>({ marca, filiais, rede = [], onClose, onUnificar, onSeparar, onAbrir, podeEditar, atualizado }: {
  marca: T; filiais: T[]; rede?: FilialRede[]; onClose: () => void; podeEditar: boolean;
  onUnificar: (lista: T[]) => void; onSeparar: (f: T) => void; onAbrir: (f: T) => void; atualizado: () => void;
}) {
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const todas = [marca, ...filiais].sort((a, b) => (a.uf ?? "").localeCompare(b.uf ?? "") || (a.municipio ?? "").localeCompare(b.municipio ?? ""));
  const repetidos = repetidosProvaveis(todas);
  const comCnpj = todas.filter((f) => String(f.cnpj ?? "").replace(/\D/g, "").length === 14);
  const cadastrados = new Set(todas.map((f) => String(f.cnpj ?? "").replace(/\D/g, "")).filter(Boolean));
  const redeNova = rede.filter((r) => !r.cnpj || !cadastrados.has(String(r.cnpj).replace(/\D/g, "")));

  // puxa da Receita os dados de todas as filiais com CNPJ (endereço, telefone, e-mail, situação, IE)
  async function atualizarTodas() {
    let ok = 0, falhas = 0;
    for (const f of comCnpj) {
      setAtualizando(nomeCurto(f) + (f.municipio ? ` (${f.municipio})` : ""));
      try { await callFunction("clientes-receita", { acao: "um", fornecedor_id: f.id }); ok++; } catch { falhas++; }
    }
    setAtualizando(null);
    atualizado();
    if (falhas) notifyError(new Error(`${ok} ${pl(ok, "filial atualizada", "filiais atualizadas")} pela Receita; ${falhas} não responderam (tente de novo mais tarde)`));
    else notify(`${ok} ${pl(ok, "filial atualizada", "filiais atualizadas")} pela Receita`);
  }

  return (
    <Modal open onClose={onClose} title={`${nomeCurto(marca)} · ${filiais.length} ${pl(filiais.length, "filial", "filiais")}`} wide>
      <div className="space-y-4">
        {podeEditar && comCnpj.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button type="button" variant="secondary" disabled={!!atualizando} onClick={atualizarTodas}>
              <RefreshCw size={16} className={atualizando ? "motion-safe:animate-spin" : ""} aria-hidden /> Atualizar as {comCnpj.length} pela Receita
            </Button>
            {atualizando && <span className="text-slate-500" aria-live="polite">Buscando {atualizando}…</span>}
          </div>
        )}
        {repetidos.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <b>{repetidos.length} {pl(repetidos.length, "cidade tem", "cidades têm")} cadastro repetido</b> (um deles sem CNPJ):
            <ul className="mt-1 space-y-1">
              {repetidos.map((g) => (
                <li key={g[0].id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{local(g[0])}: {g.map((o) => nomeCurto(o) + (o.cnpj ? ` (${docFormat(o.cnpj)})` : " (sem CNPJ)")).join(" · ")}</span>
                  {podeEditar && <Button type="button" className="!min-h-0 !py-1 text-xs" onClick={() => onUnificar(g)}><Merge size={14} aria-hidden /> Unificar</Button>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>
              <th className="px-3 py-2">Filial</th><th className="px-3 py-2">CNPJ</th><th className="px-3 py-2">Contato</th><th className="px-3 py-2">Receita</th><th className="px-3 py-2"><span className="sr-only">Ações</span></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {todas.map((f) => (
                <tr key={f.id}>
                  <td className="px-3 py-2"><button type="button" onClick={() => onAbrir(f)} className="text-left font-semibold text-fg hover:text-brand hover:underline">{local(f) || nomeCurto(f)}</button>
                    {f.id === marca.id && <span className="ml-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-2xs font-semibold text-sky-800">marca</span>}
                    <span className="block text-xs text-slate-500 [overflow-wrap:anywhere]">{nomeCurto(f)}</span></td>
                  <td className="whitespace-nowrap px-3 py-2">{docFormat(f.cnpj) || <span className="text-amber-700">sem CNPJ</span>}</td>
                  <td className="px-3 py-2 text-xs">{f.telefone ? formatarTelefone(f.telefone) : "—"}{f.email && <span className="block break-all text-slate-500">{f.email}</span>}</td>
                  <td className="px-3 py-2 text-xs">{f.receita_situacao ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{podeEditar && f.id !== marca.id &&
                    <Button type="button" tamanho="mini" variant="ghost" onClick={() => onSeparar(f)} title="Tirar desta marca (vira um fornecedor avulso)">Separar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {redeNova.length > 0 && (
          <section aria-label="Filiais achadas na internet">
            <h3 className="mb-1 text-sm font-bold text-fg"><Building2 size={15} className="mr-1 inline align-[-2px]" aria-hidden />Outras filiais achadas na internet <span className="font-normal text-slate-500">(a conferir; viram cadastro quando a primeira nota chegar)</span></h3>
            <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              {redeNova.map((r, i) => (
                <li key={i} className="rounded-lg border border-slate-200 px-2 py-1.5">
                  <b className="text-fg">{[r.municipio, r.uf].filter(Boolean).join("/") || r.nome}</b>
                  <span className="block text-slate-500">{[r.endereco, r.telefone && formatarTelefone(r.telefone), r.cnpj && docFormat(r.cnpj)].filter(Boolean).join(" · ")}</span>
                  {r.origem && /^https?:/.test(r.origem) && <a href={r.origem} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand hover:underline">fonte <ExternalLink size={10} aria-hidden /></a>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
