// Cadastros → Embalagens (como no Tiny): descrição, tipo, largura × altura × comprimento (cm) e peso (kg).
// O envio usa as medidas para a cubagem; o produto pode ter a sua embalagem padrão.
import { CrudPage, type FiltroCrud } from "@/components/CrudPage";
import { usePerfil } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { TIPOS_EMBALAGEM, FATOR_CUBAGEM } from "@/lib/fretes";
import type { Embalagem } from "@/components/fretes/EnvioForm";

const m3 = (r: Embalagem) => (Number(r.largura_cm) || 0) * (Number(r.altura_cm) || 0) * (Number(r.comprimento_cm) || 0) / 1_000_000;

const FILTROS: FiltroCrud<Embalagem>[] = [
  { label: "Situação", opcoes: [{ label: "Ativas", teste: (r) => r.ativo }, { label: "Inativas", teste: (r) => !r.ativo }] },
  { label: "Tipo", valor: (r) => TIPOS_EMBALAGEM.find(([k]) => k === r.tipo)?.[1] ?? r.tipo },
];

async function situacao(ids: string[], ativo: boolean) {
  const { error } = await supabase.from("embalagens").update({ ativo }).in("id", ids);
  if (error) throw error;
  return `${ids.length} embalagem(ns) ${ativo ? "ativada(s)" : "inativada(s)"}`;
}

export default function Embalagens() {
  const { pode } = usePerfil();
  const podeEditar = pode("cotar_frete") || pode("editar_financeiro");
  return (
    <CrudPage<Embalagem>
      title="Embalagens"
      table="embalagens"
      plural="embalagens"
      order="descricao"
      readOnly={!podeEditar}
      filtros={FILTROS}
      acoesLote={podeEditar ? [{ label: "Inativar", executar: (ids) => situacao(ids, false) }, { label: "Ativar", executar: (ids) => situacao(ids, true) }] : []}
      defaults={{ descricao: "", tipo: "caixa", ativo: true }}
      searchKeys={["descricao", "tipo"]}
      beforeSave={(r) => ({
        ...r, descricao: String(r.descricao ?? "").trim(),
        ...Object.fromEntries(["largura_cm", "altura_cm", "comprimento_cm", "peso_kg"].map((k) => [k, r[k] === "" || r[k] == null ? null : Number(String(r[k]).replace(",", "."))])),
      })}
      fields={[
        { name: "descricao", label: "Descrição", required: true, placeholder: "Ex.: Engradado MF-300, Fardo Franquia", span: 3 },
        { name: "tipo", label: "Tipo", type: "select", span: 1, options: TIPOS_EMBALAGEM.map(([value, label]) => ({ value, label })) },
        { name: "largura_cm", label: "Largura (cm)", type: "number", span: 1 },
        { name: "altura_cm", label: "Altura (cm)", type: "number", span: 1 },
        { name: "comprimento_cm", label: "Comprimento (cm)", type: "number", span: 1 },
        { name: "peso_kg", label: "Peso (kg)", type: "number", span: 1, ajuda: "Peso do volume embalado (usado quando o produto não tem peso)" },
        { name: "ativo", label: "Ativa", type: "checkbox", span: 1 },
        { name: "observacoes", label: "Observações", type: "textarea", span: 4 },
      ]}
      columns={[
        { label: "Embalagem", render: (r) => <><div className="font-semibold">{r.descricao}</div><div className="text-xs text-slate-500">{TIPOS_EMBALAGEM.find(([k]) => k === r.tipo)?.[1] ?? r.tipo}{r.ativo ? "" : " · inativa"}</div></> },
        { label: "L × A × C (cm)", render: (r) => [r.largura_cm, r.altura_cm, r.comprimento_cm].every(Boolean) ? `${Number(r.largura_cm).toLocaleString("pt-BR")} × ${Number(r.altura_cm).toLocaleString("pt-BR")} × ${Number(r.comprimento_cm).toLocaleString("pt-BR")}` : "—" },
        { label: "Peso", render: (r) => (r.peso_kg != null ? `${Number(r.peso_kg).toLocaleString("pt-BR")} kg` : "—") },
        { label: "Cubagem", render: (r) => (m3(r) ? `${m3(r).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m³ · ${(m3(r) * FATOR_CUBAGEM).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg cubado` : "—") },
      ]}
    />
  );
}
