// Seções que a pessoa organiza (27/10, pedido da usuária: "como no Elementor"): no modo "Organizar" a página vira uma
// lista com o nome de cada seção, que se arrasta pela alça (dedo ou mouse) ou se move pelas setas. A ordem fica salva
// no perfil (preferência "ordem:<página>"), vale em qualquer aparelho e não muda nada para as outras pessoas.
// Seção nova no código entra no lugar dela na ordem padrão; seção que deixou de existir é ignorada.
// A conta master pode "Usar para toda a equipe" (27/10): a ordem dela vira a padrão de todos (configuracoes.aparencia
// .ordem_secoes); quem arrumou a sua continua com a sua. Ordem de quem vale: a da pessoa, a da equipe, a do código.
import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, LayoutList, RotateCcw, Users } from "lucide-react";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { useConfig } from "@/lib/useConfig";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { lerOrdemSecoes, guardarOrdemSecoes } from "@/lib/ordemSecoes";

export type Secao = {
  id: string;
  /** nome que aparece no modo Organizar */
  titulo: string;
  conteudo: ReactNode;
  /** no computador (xl) ocupa a largura toda; sem isso, meia largura (duas lado a lado) */
  largo?: boolean;
  /** só aparece no celular / só no computador (ex.: o resumo azul do celular e os cartões de número do computador) */
  soCelular?: boolean;
  soComputador?: boolean;
};

/** A ordem salva aplicada às seções de agora (as novas entram onde estão no padrão). */
export function ordenarSecoes<T extends { id: string }>(secoes: T[], salva: string[] | null): T[] {
  if (!salva?.length) return secoes;
  const pos = new Map(salva.map((id, i) => [id, i]));
  const conhecidas = secoes.filter((s) => pos.has(s.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  const resultado = [...conhecidas];
  // a seção nova fica logo depois da que vinha antes dela no padrão
  secoes.forEach((s, i) => {
    if (pos.has(s.id)) return;
    const anterior = i > 0 ? resultado.findIndex((x) => x.id === secoes[i - 1].id) : -1;
    resultado.splice(anterior + 1, 0, s);
  });
  return resultado;
}

export function Secoes({ pagina, secoes, className = "" }: { pagina: string; secoes: Secao[]; className?: string }) {
  const visiveis = secoes.filter((s) => s.conteudo != null && s.conteudo !== false);
  const [salva, setSalva] = useState<string[] | null>(() => lerOrdemSecoes(pagina));
  const [organizando, setOrganizando] = useState(false);
  const [rascunho, setRascunho] = useState<string[]>([]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const itensRef = useRef(new Map<string, HTMLLIElement>());
  const { master } = usePerfil();
  const { data: cfg } = useConfig();
  const invalidar = useInvalidate();
  const aparencia = (cfg?.aparencia ?? null) as ({ ordem_secoes?: Record<string, string[]> } & Record<string, unknown>) | null;
  const daEquipe = aparencia?.ordem_secoes?.[pagina] ?? null;
  const lista = ordenarSecoes(visiveis, salva ?? (daEquipe?.length ? daEquipe : null));
  // master: grava a ordem como a padrão de todos (ou tira, com null), sem mexer no resto da aparência
  async function paraEquipe(ordem: string[] | null) {
    const atual = { ...(aparencia?.ordem_secoes ?? {}) };
    if (ordem) atual[pagina] = ordem; else delete atual[pagina];
    const { error } = await supabase.from("configuracoes").update({ aparencia: { ...(aparencia ?? {}), ordem_secoes: atual } }).eq("id", 1);
    if (error) { notifyError(error); return; }
    invalidar("configuracoes");
    notify(ordem ? "Essa ordem agora é a padrão de toda a equipe" : "A equipe volta para a ordem padrão do sistema");
  }

  function abrir() { setRascunho(lista.map((s) => s.id)); setOrganizando(true); }
  function salvar(ordem: string[] | null) {
    setSalva(ordem);
    guardarOrdemSecoes(pagina, ordem);
    supabase.rpc("salvar_preferencias", { p: { [`ordem:${pagina}`]: ordem ?? [] } }).then(() => null);
  }
  function mover(id: string, para: number) {
    setRascunho((r) => {
      const de = r.indexOf(id);
      if (de < 0 || para < 0 || para >= r.length || de === para) return r;
      const n = [...r];
      n.splice(de, 1);
      n.splice(para, 0, id);
      return n;
    });
  }
  // arrastar: segue o dedo/mouse e troca de lugar quando passa do meio da seção vizinha; perto da borda, rola a tela
  function arrastar(e: React.PointerEvent, id: string) {
    e.preventDefault();
    setArrastando(id);
    const mexer = (ev: PointerEvent) => {
      const y = ev.clientY;
      if (y < 80) window.scrollBy(0, -12); else if (y > window.innerHeight - 80) window.scrollBy(0, 12);
      setRascunho((r) => {
        const outros = r.filter((x) => x !== id);
        let para = outros.findIndex((x) => { const b = itensRef.current.get(x)?.getBoundingClientRect(); return !!b && y < b.top + b.height / 2; });
        if (para < 0) para = outros.length;
        const n = [...outros];
        n.splice(para, 0, id);
        return n.join() === r.join() ? r : n;
      });
    };
    const soltar = () => { setArrastando(null); window.removeEventListener("pointermove", mexer); window.removeEventListener("pointerup", soltar); window.removeEventListener("pointercancel", soltar); };
    window.addEventListener("pointermove", mexer);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  if (organizando) {
    const porId = new Map(visiveis.map((s) => [s.id, s]));
    const ordem = rascunho.filter((id) => porId.has(id));
    return (
      <section aria-label="Organizar a página" className={`cartao space-y-3 p-3 sm:p-4 ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-fg">Organizar a página</h2>
            <p className="text-xs text-slate-500">Segure a alça <GripVertical size={12} className="inline" aria-hidden /> e arraste, ou use as setas. "Pronto" vale só para você.
              {master && daEquipe && <> A equipe usa a ordem que você definiu. <button type="button" className="link-discreto" onClick={() => paraEquipe(null)}>Tirar</button></>}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" tamanho="mini" onClick={() => { salvar(null); setOrganizando(false); }} title={daEquipe ? "Volta para a ordem da equipe" : "Volta para a ordem do sistema"}>
              <RotateCcw size={13} aria-hidden /> {daEquipe ? "Ordem da equipe" : "Ordem padrão"}</Button>
            {master && <Button variant="secondary" tamanho="mini" onClick={() => { salvar(ordem); paraEquipe(ordem); setOrganizando(false); }} title="Essa ordem vira a padrão de todos; quem já arrumou a sua continua com a sua">
              <Users size={13} aria-hidden /> Usar para toda a equipe</Button>}
            <Button tamanho="mini" onClick={() => { salvar(ordem); setOrganizando(false); }}><Check size={13} aria-hidden /> Pronto</Button>
          </div>
        </div>
        <ol className="space-y-1.5">
          {ordem.map((id, i) => (
            <li key={id} ref={(el) => { if (el) itensRef.current.set(id, el); else itensRef.current.delete(id); }}
              className={`flex items-center gap-2 rounded-cartao border bg-surface px-2 py-2 transition ${arrastando === id ? "border-brand shadow-pop" : "border-slate-200"}`}>
              <button type="button" onPointerDown={(e) => arrastar(e, id)} aria-label={`Arrastar ${porId.get(id)!.titulo}`}
                className="botao-icone h-9 w-9 cursor-grab touch-none active:cursor-grabbing"><GripVertical size={18} /></button>
              <span className="num w-5 shrink-0 text-center text-xs font-semibold text-slate-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{porId.get(id)!.titulo}</span>
              <button type="button" onClick={() => mover(id, i - 1)} disabled={i === 0} aria-label="Subir" className="botao-icone h-8 w-8"><ArrowUp size={16} /></button>
              <button type="button" onClick={() => mover(id, i + 1)} disabled={i === ordem.length - 1} aria-label="Descer" className="botao-icone h-8 w-8"><ArrowDown size={16} /></button>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <div className={className}>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={abrir} className="link-discreto inline-flex items-center gap-1 text-xs" title="Mudar a ordem das seções desta página">
          <LayoutList size={14} aria-hidden /> Organizar
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {lista.map((s) => <div key={s.id} className={`min-w-0 ${s.largo ? "xl:col-span-2" : ""} ${s.soCelular ? "sm:hidden" : s.soComputador ? "max-sm:hidden" : ""}`}>{s.conteudo}</div>)}
      </div>
    </div>
  );
}
