// Redes sociais dos clientes: o ERP procura no site da empresa (a cada 5 minutos, pela função clientes-redes) e a
// equipe aprova o que foi achado; para quem não tem site, a busca pronta no Google, Instagram e Facebook.
import { useState } from "react";
import { CheckCircle2, Search, Share2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { pl } from "@/lib/format";
import type { Cliente } from "@/lib/types";
import { dominioDoCliente, linkRede, linksBusca, type Redes } from "../../../supabase/functions/_shared/redes-sociais";

const ROTULO: Record<keyof Redes, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", website: "Site" };

function ListaRedes({ r }: { r: Redes }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {(Object.keys(ROTULO) as (keyof Redes)[]).filter((k) => r[k]).map((k) => {
        const href = k === "website" ? `https://${r[k]}` : linkRede(k, r[k]);
        return <a key={k} href={href ?? undefined} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline"><b className="font-semibold text-slate-600">{ROTULO[k]}:</b> {r[k]}</a>;
      })}
    </span>
  );
}

/** Na ficha (aba Contato): sugestão achada no site + busca pronta na internet. */
export function RedesBusca({ c, onUsar, disabled }: { c: Partial<Cliente>; onUsar: (r: Redes) => void; disabled?: boolean }) {
  const sug = (c.redes_sugeridas ?? null) as Redes | null;
  const l = linksBusca(c);
  return (
    <div className="col-span-1 space-y-2 sm:col-span-12">
      {sug && Object.keys(sug).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
          <Sparkles size={16} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1"><b>Achamos no site da empresa:</b> <ListaRedes r={sug} /></span>
          {!disabled && <Button type="button" variant="secondary" onClick={() => onUsar(sug)}><CheckCircle2 size={15} /> Usar</Button>}
        </div>
      )}
      {(c.nome || c.nome_fantasia) && (!c.instagram || !c.facebook) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <Search size={13} aria-hidden /> Procurar na internet:
          <a href={l.google} target="_blank" rel="noreferrer" className="font-semibold text-brand">Google</a>
          <a href={l.instagram} target="_blank" rel="noreferrer" className="font-semibold text-pink-600">Instagram</a>
          <a href={l.facebook} target="_blank" rel="noreferrer" className="font-semibold text-blue-700">Facebook</a>
        </p>
      )}
    </div>
  );
}

/** Em "Arrumar o cadastro": andamento da procura e as sugestões para aprovar. */
export function SecaoRedes({ clientes }: { clientes: Cliente[] }) {
  const invalidar = useInvalidate();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const comSite = clientes.filter((c) => dominioDoCliente(c));
  const procurados = comSite.filter((c) => c.redes_buscado_em).length;
  const pendentes = clientes.filter((c) => c.redes_sugeridas && Object.keys(c.redes_sugeridas).length);
  const comRede = clientes.filter((c) => c.instagram || c.facebook || c.tiktok).length;

  async function decidir(ids: string[], aceitar: boolean, chave: string) {
    setOcupado(chave);
    try {
      const { data, error } = await supabase.rpc("aceitar_redes_sugeridas", { p_ids: ids, p_aceitar: aceitar });
      if (error) throw error;
      invalidar("clientes");
      notify(aceitar ? `${data} ${pl(data, "cadastro atualizado", "cadastros atualizados")}` : "Sugestão descartada");
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }

  async function procurarAgora() {
    setOcupado("lote");
    try {
      const r = await callFunction<{ procurados: number; achados: number }>("clientes-redes", { acao: "lote" });
      invalidar("clientes");
      notify(r.procurados ? `${r.procurados} ${pl(r.procurados, "site visitado", "sites visitados")}, ${r.achados} com redes` : "Todos os sites já foram visitados");
    } catch (e) { notifyError(e); } finally { setOcupado(null); }
  }

  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="mb-1 flex items-center gap-2 font-semibold text-fg"><Share2 size={16} className="text-pink-600" /> Redes sociais</h3>
      <p className="mb-2 text-slate-600">
        O ERP visita sozinho o site de cada empresa (o campo Site ou o domínio do e-mail, quando não é Gmail/Hotmail…) e lê os links do
        Instagram, Facebook e TikTok. Nada entra no cadastro sem você aprovar. Quem não tem site: na ficha, aba Contato, tem a busca pronta.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Num rotulo="Com alguma rede" valor={comRede} />
        <Num rotulo="Com site para visitar" valor={comSite.length} />
        <Num rotulo="Sites visitados" valor={`${procurados} de ${comSite.length}`} />
        <Num rotulo="Para aprovar" valor={pendentes.length} destaque={pendentes.length > 0} />
      </div>
      <div className="flex flex-wrap gap-2">
        {procurados < comSite.length && (
          <Button type="button" variant="secondary" disabled={!!ocupado} onClick={procurarAgora}><Search size={15} /> {ocupado === "lote" ? "Visitando…" : "Visitar mais 20 agora"}</Button>
        )}
        {pendentes.length > 1 && (
          <Button type="button" disabled={!!ocupado} onClick={() => decidir(pendentes.map((c) => c.id), true, "todos")}>
            <CheckCircle2 size={15} /> {ocupado === "todos" ? "Aprovando…" : `Aprovar as ${pendentes.length}`}
          </Button>
        )}
      </div>
      {pendentes.length > 0 && (
        <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {pendentes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{c.nome_fantasia || c.nome}</div>
                <div className="text-xs"><ListaRedes r={c.redes_sugeridas as Redes} /></div>
              </div>
              <Button type="button" variant="secondary" disabled={!!ocupado} onClick={() => decidir([c.id], true, c.id)}><CheckCircle2 size={15} /> Aprovar</Button>
              <button type="button" className="botao-icone-perigo p-2" title="Não é desta empresa: descartar"
                aria-label="Descartar" disabled={!!ocupado} onClick={() => decidir([c.id], false, c.id)}><X size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Num({ rotulo, valor, destaque }: { rotulo: string; valor: number | string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${destaque ? "bg-violet-50 text-violet-900" : "bg-slate-50"}`}>
      <div className="text-lg font-bold">{valor}</div>
      <div className="text-xs text-slate-500">{rotulo}</div>
    </div>
  );
}
