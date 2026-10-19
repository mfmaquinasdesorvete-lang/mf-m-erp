// Técnicos: a equipe da assistência e os parceiros (técnicos de outras cidades), com a região que cada um atende
// (estados inteiros e/ou cidades). A OS guarda o técnico, e a ficha do cliente mostra quem já atendeu e quem
// atende a região dele. Parceiros Dr. Frost: convidados, com anúncio no site de técnicos (cadastro completo do
// anúncio); os demais são contatos (já atenderam ou vieram da internet).
import { useState } from "react";
import { ExternalLink, Users } from "lucide-react";
import { SeloDrFrost } from "@/components/tecnicos/SeloDrFrost";
import { EnviarImagem } from "@/components/EnviarImagem";
import { CrudPage, type CampoForm, type FiltroCrud } from "@/components/CrudPage";
import { Badge, Button } from "@/components/ui";
import { Contato } from "@/components/Contato";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { notify, notifyError } from "@/lib/notify";
import { dataBR, pl } from "@/lib/format";

export type Tecnico = {
  id: string; nome: string; tipo: "interno" | "parceiro"; whatsapp: string | null; telefone: string | null; email: string | null;
  municipio: string | null; uf: string | null; ufs: string[]; cidades: string[]; especialidades: string | null; observacoes: string | null;
  ativo: boolean; created_at: string;
  drfrost?: boolean; drfrost_id?: string | null; drfrost_url?: string | null; drfrost_desde?: string | null; drfrost_status?: string | null;
  nome_fantasia?: string | null; verificado?: boolean; destaque?: boolean; instagram?: string | null; facebook?: string | null;
  site?: string | null; youtube?: string | null; endereco?: string | null; servicos?: string[]; diferenciais?: string[];
  area_atuacao?: string | null; apresentacao?: string | null; logo_url?: string | null;
};

/** Logo do cadastro; sem logo, as iniciais (azul quando é parceiro Dr. Frost). */
function LogoTecnico({ t, tamanho = 40 }: { t: Tecnico; tamanho?: number }) {
  const iniciais = (t.nome_fantasia || t.nome).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  if (t.logo_url) return <img src={t.logo_url} alt="" className="shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-0.5" style={{ width: tamanho, height: tamanho }} />;
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-xl text-xs font-extrabold ${t.drfrost ? "bg-sky-600 text-white" : t.tipo === "interno" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"}`}
      style={{ width: tamanho, height: tamanho }}>{iniciais}</span>
  );
}

/** Desde quando está com a gente: entrada no Dr. Frost ou data do cadastro. */
const desde = (t: Tecnico) => (t.drfrost_desde || t.created_at || "").slice(0, 10);

/** Estados inteiros em siglas bem visíveis + cidades em texto. */
function Atende({ t }: { t: Tecnico }) {
  const ufs = t.ufs ?? [];
  const cidades = t.cidades ?? [];
  if (!ufs.length && !cidades.length) return <span className="text-sm text-slate-500">{textoRegiao(t)}</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ufs.map((u) => <span key={u} className="rounded-md bg-indigo-600 px-1.5 py-0.5 text-xs font-extrabold tracking-wide text-white">{u}</span>)}
      {cidades.length > 0 && <span className="text-xs text-slate-600">{cidades.slice(0, 3).join(", ")}{cidades.length > 3 ? ` +${cidades.length - 3}` : ""}</span>}
    </div>
  );
}

/** Lista separada por vírgula (serviços, diferenciais): digita livre e vira a lista ao sair do campo. */
function CampoLista({ valor, onChange, placeholder }: { valor: string[] | null | undefined; onChange: (v: string[]) => void; placeholder?: string }) {
  const [texto, setTexto] = useState((valor ?? []).join(", "));
  return <input className="input" value={texto} placeholder={placeholder} onChange={(e) => setTexto(e.target.value)}
    onBlur={() => { const l = [...new Set(texto.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean))]; onChange(l); setTexto(l.join(", ")); }} />;
}

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

/** Região em texto: "SC, PR · Joinville/SC, Curitiba/PR". */
export const textoRegiao = (t: Pick<Tecnico, "ufs" | "cidades" | "municipio" | "uf">) =>
  [(t.ufs ?? []).join(", "), (t.cidades ?? []).join(", ")].filter(Boolean).join(" · ") || [t.municipio, t.uf].filter(Boolean).join("/") || "região não informada";

/** "Joinville/SC, curitiba / pr" → ["Joinville/SC", "Curitiba/PR"]. */
export function lerCidades(texto: string): string[] {
  return texto.split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean).map((c) => {
    const [cid, uf] = c.split("/").map((x) => x.trim());
    const nome = cid.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m) => m.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());
    return uf ? `${nome}/${uf.toUpperCase().slice(0, 2)}` : nome;
  });
}

function EscolherUfs({ valor, onChange }: { valor: string[] | null | undefined; onChange: (v: string[]) => void }) {
  const lista = valor ?? [];
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Estados que atende">
      {UFS.map((u) => {
        const on = lista.includes(u);
        return (
          <button key={u} type="button" aria-pressed={on} onClick={() => onChange(on ? lista.filter((x) => x !== u) : [...lista, u].sort())}
            className={`num w-10 rounded-md py-1 text-xs font-bold transition ${on ? "bg-brand text-brand-fg" : "border border-slate-300 text-slate-600 hover:bg-slate-50"}`}>{u}</button>
        );
      })}
    </div>
  );
}

const fields: CampoForm[] = [
  { name: "nome", label: "Nome", required: true, span: 2 },
  { name: "logo_url", label: "Logo", type: "custom", span: 4,
    render: (v, set) => <EnviarImagem rotulo="Logo" dica="Logo da empresa do técnico (ou a do anúncio Dr. Frost). Até 2 MB." url={v} nome="tecnico" pasta="tecnicos" onUrl={set} /> },
  { name: "tipo", label: "Tipo", type: "select", options: [{ value: "interno", label: "Da equipe (MF)" }, { value: "parceiro", label: "Parceiro (outra cidade)" }] },
  { name: "ativo", label: "Ativo", type: "checkbox" },
  { name: "whatsapp", label: "WhatsApp", mask: "whatsapp" },
  { name: "telefone", label: "Telefone", mask: "telefone" },
  { name: "email", label: "E-mail", mask: "email", span: 2 },
  { name: "municipio", label: "Cidade onde mora / base", span: 2 },
  { name: "uf", label: "UF", mask: "uf" },
  { name: "secao_regiao", label: "Região que atende", type: "secao", ajuda: "Marque os estados que ele cobre por inteiro e/ou escreva as cidades. A ficha do cliente mostra os técnicos da região dele." },
  { name: "ufs", label: "Estados inteiros", type: "custom", span: 4, render: (v, set) => <EscolherUfs valor={v} onChange={set} /> },
  {
    name: "cidades", label: "Cidades (separadas por vírgula, com a UF: Joinville/SC, Curitiba/PR)", type: "custom", span: 4,
    render: (v, set) => <CampoCidades valor={v} onChange={set} />,
  },
  { name: "especialidades", label: "Especialidades (ex.: refrigeração, parte elétrica, máquinas de açaí)", type: "textarea", span: 4 },
  { name: "observacoes", label: "Observações (valor da visita, disponibilidade…)", type: "textarea", span: 4 },
  { name: "secao_drfrost", label: "Site Dr. Frost", type: "secao", ajuda: "Parceiro convidado, com anúncio no site de técnicos. Os demais técnicos são contatos (já atenderam ou vieram da internet)." },
  { name: "drfrost", label: "Parceiro Dr. Frost (convidado)", type: "checkbox" },
  { name: "verificado", label: "Anúncio verificado", type: "checkbox" },
  { name: "destaque", label: "Destaque no site", type: "checkbox" },
  { name: "nome_fantasia", label: "Nome no site / empresa", span: 2 },
  { name: "drfrost_url", label: "Link do anúncio", span: 2, placeholder: "https://drfrost.com.br/guia/…" },
  { name: "instagram", label: "Instagram", span: 2 },
  { name: "facebook", label: "Facebook", span: 2 },
  { name: "site", label: "Site", span: 2 },
  { name: "youtube", label: "YouTube", span: 2 },
  { name: "servicos", label: "Serviços (máquinas que atende, separados por vírgula)", type: "custom", span: 4,
    render: (v, set) => <CampoLista valor={v} onChange={set} placeholder="Máquinas de Sorvete Expresso, Máquina de Açaí Expresso" /> },
  { name: "diferenciais", label: "Diferenciais (separados por vírgula)", type: "custom", span: 4,
    render: (v, set) => <CampoLista valor={v} onChange={set} placeholder="Refrigeração, Pane Elétrica, Técnico Autorizado" /> },
  { name: "area_atuacao", label: "Área de atuação (texto do site)", span: 4 },
  { name: "apresentacao", label: "Apresentação (texto do site)", type: "textarea", span: 4 },
];

/** Cidades: digita livre e vira a lista ao sair do campo (sem perder o que está digitando). */
function CampoCidades({ valor, onChange }: { valor: string[] | null | undefined; onChange: (v: string[]) => void }) {
  const [texto, setTexto] = useState((valor ?? []).join(", "));
  return <input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={() => { const l = lerCidades(texto); onChange(l); setTexto(l.join(", ")); }} placeholder="Joinville/SC, Blumenau/SC" />;
}

const FILTROS: FiltroCrud<Tecnico>[] = [
  { label: "Origem", opcoes: [{ label: "Parceiros Dr. Frost (convidados)", teste: (t) => !!t.drfrost }, { label: "Verificados no site", teste: (t) => !!t.drfrost && !!t.verificado },
    { label: "Contatos (já atenderam ou da internet)", teste: (t) => !t.drfrost }] },
  { label: "Tipo", opcoes: [{ label: "Da equipe", teste: (t) => t.tipo === "interno" }, { label: "Parceiros", teste: (t) => t.tipo === "parceiro" }] },
  { label: "Estado", valor: (t) => t.uf },
  { label: "Situação", opcoes: [{ label: "Ativos", teste: (t) => t.ativo }, { label: "Inativos", teste: (t) => !t.ativo }] },
];

export default function Tecnicos() {
  const { tem, papel } = usePerfil();
  const invalidar = useInvalidate();
  const { data: tecnicos = [] } = useRows<Tecnico>("tecnicos", { order: "nome", ascending: true });
  const [ocupado, setOcupado] = useState(false);
  const podeEditar = tem("tecnico", "financeiro");

  /** Traz os funcionários marcados "faz assistência" que ainda não estão aqui. */
  async function trazerEquipe() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("nomes_tecnicos");
      if (error) throw error;
      const ja = new Set(tecnicos.map((t) => t.nome.trim().toLowerCase()));
      const novos = ((data ?? []) as { nome: string }[]).map((x) => x.nome).filter((n) => n && !ja.has(n.trim().toLowerCase()));
      if (!novos.length) return notify("A equipe da assistência já está toda aqui");
      const { error: e2 } = await supabase.from("tecnicos").insert(novos.map((nome) => ({ nome, tipo: "interno" })));
      if (e2) throw e2;
      invalidar("tecnicos");
      notify(`${novos.length} ${pl(novos.length, "técnico trazido", "técnicos trazidos")} da equipe: marque a região de cada um`);
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  return (
    <CrudPage<Tecnico>
      title="Técnicos"
      table="tecnicos"
      order="nome"
      plural="técnicos"
      readOnly={!podeEditar}
      podeExcluir={papel === "admin"}
      defaults={{ nome: "", tipo: "parceiro", ativo: true, ufs: [], cidades: [], drfrost: false, verificado: false, destaque: false, servicos: [], diferenciais: [] }}
      searchKeys={["nome", "nome_fantasia", "municipio", "uf", "especialidades", "whatsapp", "email", "instagram", "area_atuacao"]}
      filtros={FILTROS}
      beforeSave={(r) => ({ ...r, uf: r.uf ? String(r.uf).toUpperCase() : null, ufs: r.ufs ?? [], cidades: r.cidades ?? [], servicos: r.servicos ?? [], diferenciais: r.diferenciais ?? [] })}
      extraActions={podeEditar && <Button variant="secondary" disabled={ocupado} onClick={trazerEquipe}><Users size={16} /> Trazer da equipe</Button>}
      fields={fields}
      columns={[
        { label: "Técnico", render: (t) => (
          <div className="flex items-center gap-2.5">
          <LogoTecnico t={t} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1 font-medium">{t.nome} <SeloDrFrost t={t} />
              {t.drfrost_url && <a href={t.drfrost_url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline" title="Abrir o anúncio no site Dr. Frost" aria-label="Abrir o anúncio no site Dr. Frost"><ExternalLink size={13} /></a>}
              {!t.ativo && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-2xs font-semibold text-slate-700">inativo</span>}</div>
            <div className="text-xs text-slate-500">{[t.nome_fantasia, t.municipio && `${t.municipio}${t.uf ? `/${t.uf}` : ""}`, t.especialidades].filter(Boolean).join(" · ")}</div>
            {desde(t) && <span className="mt-0.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-2xs font-semibold text-amber-800">desde {dataBR(desde(t))}</span>}
          </div>
          </div>
        ) },
        { label: "Tipo", render: (t) => <Badge value={t.tipo === "interno" ? "Da equipe" : t.drfrost ? "Parceiro Dr. Frost" : "Contato"} /> },
        { label: "Atende", render: (t) => <Atende t={t} /> },
        { label: "Contato", render: (t) => <Contato r={t} mensagem={`Olá, ${t.nome.split(" ")[0]}! Aqui é da MF Máquinas.`} /> },
      ]}
      cartaoCelular={(t, abrir) => (
        <button type="button" onClick={abrir} className="flex w-full items-start gap-2.5 pr-8 text-left">
          <LogoTecnico t={t} tamanho={36} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1 text-sm font-bold text-fg">{t.nome} <SeloDrFrost t={t} /></span>
            <span className="block text-xs text-slate-500">{t.tipo === "interno" ? "Da equipe" : t.drfrost ? "Parceiro Dr. Frost" : "Contato"}{desde(t) ? ` · desde ${dataBR(desde(t))}` : ""}</span>
            <span className="mt-1 block"><Atende t={t} /></span>
          </span>
        </button>
      )}
    />
  );
}
