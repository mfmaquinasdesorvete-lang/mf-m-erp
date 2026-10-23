// Sobre → Design → Editar a aparência (administradores): cor da marca e de cada área, fontes dos títulos e do texto,
// logo do ERP, ícone da aba, imagens no lugar dos ícones das áreas e os logos das marcas e das sorveterias My Frost.
// Cada mudança já aparece na tela (a vitrine logo abaixo mostra o efeito); "Salvar para todos" grava em
// configuracoes.aparencia e vale para toda a equipe. Sair sem salvar volta ao que estava.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Palette, Plus, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { chip, Button, Card } from "@/components/ui";
import { EnviarImagem } from "@/components/EnviarImagem";
import { confirmar } from "@/components/Dialogos";
import { useConfig } from "@/lib/useConfig";
import { useInvalidate } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { grupos } from "@/lib/menu";
import { PASTA_MARCA } from "@/lib/marca";
import {
  aplicarAparencia, CORES_AREAS_PADRAO, corValida, FONTE_TEXTO_PADRAO, FONTE_TITULOS_PADRAO, FONTES, MARCAS_PADRAO,
  type Aparencia, type LogoMarca,
  CANTOS,
} from "@/lib/aparencia";

const PASTA = `${PASTA_MARCA}/aparencia`;
const AREAS = [
  { id: "inicio", titulo: "Início" },
  ...grupos.filter((g) => g.titulo).map((g) => ({ id: g.id, titulo: g.titulo })),
  { id: "admin", titulo: "Configurações" },
];

/** Tira o que está vazio ou igual ao padrão, para gravar só o que a empresa mudou. */
function limparAparencia(a: Aparencia): Aparencia {
  const cores = Object.fromEntries(Object.entries(a.cores_areas ?? {}).filter(([id, c]) => corValida(c) && c.toLowerCase() !== CORES_AREAS_PADRAO[id]));
  const icones = Object.fromEntries(Object.entries(a.icones_areas ?? {}).filter(([, u]) => !!u));
  return {
    cor_marca: corValida(a.cor_marca) ? a.cor_marca : null,
    cores_areas: cores,
    fonte_titulos: a.fonte_titulos && a.fonte_titulos !== FONTE_TITULOS_PADRAO ? a.fonte_titulos : null,
    fonte_texto: a.fonte_texto && a.fonte_texto !== FONTE_TEXTO_PADRAO ? a.fonte_texto : null,
    logo_erp: a.logo_erp || null,
    icones_areas: icones,
    cantos: a.cantos && a.cantos !== "padrao" ? a.cantos : null,
    marcas: (a.marcas ?? []).filter((m) => m.nome.trim() || m.url).map((m) => ({ ...m, nome: m.nome.trim() })),
  };
}

/** Cor com o quadradinho do navegador e o código (#rrggbb); vazio = a cor padrão. */
function CampoCor({ rotulo, valor, padrao, onChange }: { rotulo: ReactNode; valor?: string | null; padrao: string; onChange: (c: string | null) => void }) {
  const [texto, setTexto] = useState(valor ?? "");
  useEffect(() => setTexto(valor ?? ""), [valor]);
  const usada = corValida(valor) ? valor : padrao;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input type="color" value={usada} onChange={(e) => onChange(e.target.value)} aria-label={typeof rotulo === "string" ? rotulo : "Cor"}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-surface p-1" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-fg">{rotulo}</div>
        <input aria-label={`Código da cor: ${rotulo}`} className="input h-8 py-1 font-mono text-xs" value={texto} placeholder={`padrão ${padrao}`} maxLength={7}
          onChange={(e) => { setTexto(e.target.value); if (corValida(e.target.value)) onChange(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`); if (!e.target.value) onChange(null); }} />
      </div>
      {corValida(valor) && valor.toLowerCase() !== padrao && (
        <button type="button" onClick={() => onChange(null)} title="Voltar à cor padrão" aria-label="Voltar à cor padrão" className="botao-icone"><RotateCcw size={15} /></button>
      )}
    </div>
  );
}

function Parte({ titulo, texto, children }: { titulo: string; texto: string; children: ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-4">
      <h3 className="text-sm font-bold text-fg">{titulo}</h3>
      <p className="mb-3 text-xs text-slate-500">{texto}</p>
      {children}
    </div>
  );
}

export function EditorAparencia() {
  const { data: cfg } = useConfig();
  const invalidar = useInvalidate();
  const salva = useMemo<Aparencia>(() => (cfg?.aparencia as Aparencia | undefined) ?? {}, [cfg?.aparencia]);
  const [a, setA] = useState<Aparencia>(salva);
  const [icone, setIcone] = useState<string | null>(cfg?.icone_url ?? null);
  const [salvando, setSalvando] = useState(false);
  const semColuna = !!cfg && !("aparencia" in cfg);
  useEffect(() => { setA(salva); }, [salva]);
  useEffect(() => { setIcone(cfg?.icone_url ?? null); }, [cfg?.icone_url]);

  // prévia na hora; ao sair do editor sem salvar volta à aparência gravada
  useEffect(() => { aplicarAparencia(a); }, [a]);
  const gravada = useRef(salva);
  gravada.current = salva;
  useEffect(() => () => aplicarAparencia(gravada.current), []);

  const mudou = JSON.stringify(limparAparencia(a)) !== JSON.stringify(limparAparencia(salva)) || icone !== (cfg?.icone_url ?? null);
  const mudar = (p: Partial<Aparencia>) => setA((x) => ({ ...x, ...p }));
  const marcas: LogoMarca[] = useMemo(() => {
    const salvas = a.marcas ?? [];
    return [...MARCAS_PADRAO.map((m) => salvas.find((s) => s.id === m.id) ?? m), ...salvas.filter((s) => !MARCAS_PADRAO.some((m) => m.id === s.id))];
  }, [a.marcas]);
  const mudarMarca = (id: string, p: Partial<LogoMarca>) => mudar({ marcas: marcas.map((m) => (m.id === id ? { ...m, ...p } : m)) });

  async function salvar() {
    setSalvando(true);
    try {
      const { error } = await supabase.from("configuracoes").update({ aparencia: limparAparencia(a), icone_url: icone }).eq("id", 1);
      if (error) throw error;
      notify("Aparência salva: já vale para toda a equipe");
      invalidar("configuracoes");
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-fg"><Palette size={18} className="text-modulo-texto" aria-hidden /> Editar a aparência do ERP</h2>
          <p className="text-sm text-slate-600">Vale para toda a equipe. Cada mudança já aparece aqui e na vitrine abaixo; só fica gravada ao tocar em Salvar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={!mudou} onClick={() => { setA(salva); setIcone(cfg?.icone_url ?? null); }}><Undo2 size={16} /> Desfazer</Button>
          <Button type="button" variant="secondary" onClick={async () => { if (await confirmar("Voltar às cores, fontes e ícones padrão do ERP? Os logos das marcas continuam.")) setA({ marcas: a.marcas }); }}>
            <RotateCcw size={16} /> Padrão do ERP
          </Button>
          <Button type="button" disabled={!mudou || salvando || semColuna} onClick={salvar}><Save size={16} /> {salvando ? "Salvando…" : "Salvar para todos"}</Button>
        </div>
      </div>
      {semColuna && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">O banco ainda não tem o lugar para guardar a aparência: dá para testar aqui, e o Salvar libera assim que a atualização do banco for publicada.</p>}

      <Parte titulo="Cores" texto="A cor da marca vale para botões, links e destaques (vira a opção “Cor da empresa” e o padrão de quem não escolheu outra). Cada área tem a sua cor no título, nas abas, nas seções, nos painéis e no menu. As letras ficam legíveis sozinhas, no tema claro e no escuro.">
        <div className="mb-3 max-w-sm"><CampoCor rotulo="Cor da marca" valor={a.cor_marca} padrao="#0674a4" onChange={(c) => mudar({ cor_marca: c })} /></div>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {AREAS.map((ar) => (
            <CampoCor key={ar.id} rotulo={ar.titulo} valor={a.cores_areas?.[ar.id]} padrao={CORES_AREAS_PADRAO[ar.id] ?? "#64748b"}
              onChange={(c) => { const cores = { ...(a.cores_areas ?? {}) }; if (c) cores[ar.id] = c; else delete cores[ar.id]; mudar({ cores_areas: cores }); }} />
          ))}
        </div>
      </Parte>

      <Parte titulo="Fontes" texto="A dos títulos vale também para números grandes, botões, abas e menu; a do texto, para o resto e os campos.">
        <div className="grid gap-4 sm:grid-cols-2">
          {([["fonte_titulos", "Títulos", FONTE_TITULOS_PADRAO, "R$ 182.400 · Painel de vendas"], ["fonte_texto", "Texto", FONTE_TEXTO_PADRAO, "Máquina de sorvete S430 entregue em Joinville/SC"]] as const).map(([chave, rotulo, padrao, exemplo]) => {
            const id = a[chave] || padrao;
            const fonte = FONTES.find((f) => f.id === id) ?? FONTES[0];
            return (
              <label key={chave} className="block min-w-0">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">{rotulo}</span>
                <select className="input" value={id} onChange={(e) => mudar({ [chave]: e.target.value })}>
                  {FONTES.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.id === padrao ? " (padrão)" : ""}</option>)}
                </select>
                <span className={`mt-2 block truncate rounded-lg bg-slate-50 px-3 py-2 text-fg ${chave === "fonte_titulos" ? "text-xl font-bold" : "text-base"}`} style={{ fontFamily: fonte.familia }}>{exemplo}</span>
              </label>
            );
          })}
        </div>
      </Parte>

      <Parte titulo="Cantos" texto="O arredondado de botões, campos, cartões e painéis em todo o ERP (sai dos tokens do design system).">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cantos">
          {CANTOS.map((c) => {
            const ativo = (a.cantos ?? "padrao") === c.id;
            return (
              <button key={c.id} type="button" role="radio" aria-checked={ativo} onClick={() => mudar({ cantos: c.id })}
                className={`${chip(ativo, "border-brand bg-brand-light text-fg")} gap-2 px-3 py-2 text-sm`}
                style={{ borderRadius: `${0.75 * c.fator}rem` }}>
                <span className="h-5 w-7 border-2 border-current" style={{ borderRadius: `${0.375 * c.fator}rem` }} aria-hidden /> {c.nome}
              </button>
            );
          })}
        </div>
      </Parte>

      <Parte titulo="Logo e ícone do ERP" texto="O logo aparece no topo do menu e na tela de entrada. O ícone é o da aba do navegador e do atalho no celular (é o mesmo de Configurações → Empresa).">
        <div className="grid gap-4 sm:grid-cols-2">
          <EnviarImagem rotulo="Logo do ERP" dica="Quadrado (512 × 512), PNG ou SVG. Sem logo, fica o do ERP." url={a.logo_erp} nome="logo-erp" pasta={PASTA} quadrado onUrl={(u) => mudar({ logo_erp: u })} />
          <EnviarImagem rotulo="Ícone (quadrado)" dica="PNG quadrado, 512 × 512. Sem ícone, fica o do ERP." url={icone} nome="icone" pasta={PASTA_MARCA} quadrado onUrl={setIcone} />
        </div>
      </Parte>

      <Parte titulo="Ícones das áreas do menu" texto="Uma imagem sua no lugar do desenho de cada área (no menu e nos atalhos de criar). Sem imagem, fica o desenho de sempre.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {AREAS.filter((ar) => ar.id !== "inicio" && ar.id !== "admin").map((ar) => (
            <EnviarImagem key={ar.id} rotulo={ar.titulo} dica="Quadrado, PNG ou SVG." url={a.icones_areas?.[ar.id]} nome={`icone-${ar.id}`} pasta={PASTA} quadrado
              onUrl={(u) => { const ic = { ...(a.icones_areas ?? {}) }; if (u) ic[ar.id] = u; else delete ic[ar.id]; mudar({ icones_areas: ic }); }} />
          ))}
        </div>
      </Parte>

      <Parte titulo="Logos das marcas e das sorveterias My Frost" texto="Guardados num lugar só para usar nas telas e documentos de cada marca. Acrescente o logo de cada sorveteria My Frost que tiver um próprio.">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {marcas.map((m) => (
            <li key={m.id} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <input className="input h-9" value={m.nome} placeholder="Nome da marca ou da sorveteria" onChange={(e) => mudarMarca(m.id, { nome: e.target.value })} aria-label="Nome" />
                {!MARCAS_PADRAO.some((p) => p.id === m.id) && (
                  <button type="button" onClick={() => mudar({ marcas: marcas.filter((x) => x.id !== m.id) })} title="Tirar este logo" aria-label="Tirar este logo" className="botao-icone-perigo p-2"><Trash2 size={16} /></button>
                )}
              </div>
              <EnviarImagem rotulo="Logo" dica="PNG com fundo transparente." url={m.url} nome={`marca-${m.id}`} pasta={PASTA} onUrl={(u) => mudarMarca(m.id, { url: u })} />
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" className="mt-3" onClick={() => mudar({ marcas: [...marcas, { id: `m${Date.now().toString(36)}`, nome: "Sorveteria My Frost ", url: null }] })}>
          <Plus size={16} /> Acrescentar logo
        </Button>
      </Parte>
    </Card>
  );
}
