// Regras de frete da loja e da cotação rápida: ligar o "Calcule o frete" na loja, frete grátis (a opção mais barata)
// por valor ou por estado, acréscimo sobre o frete, "Retirar na fábrica" e o peso e as medidas padrão para produto
// ainda sem cadastro. Grava em configuracoes.frete_regras (só o administrador muda).
import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { Button, Field } from "@/components/ui";
import { useConfig } from "@/lib/useConfig";
import { useInvalidate } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";
import { usePerfil } from "@/lib/auth";
import { lerValor } from "@/lib/auditoriaBusca";
import { lerRegras, type RegrasFrete } from "../../../supabase/functions/_shared/frete-cotar";

const txt = (v: number | null | undefined) => (v == null || v === 0 ? "" : String(v).replace(".", ","));

export function FreteRegras() {
  const { data: conf } = useConfig();
  const { tem } = usePerfil();
  const admin = tem("admin");
  const invalidar = useInvalidate();
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!conf) return;
    const r = lerRegras(conf.frete_regras);
    setF({
      loja_ligada: r.loja_ligada, retirada: r.retirada, gratis_acima: txt(r.gratis_acima), gratis_ufs: r.gratis_ufs.join(", "),
      acrescimo_percentual: txt(r.acrescimo_percentual), acrescimo_fixo: txt(r.acrescimo_fixo), peso_padrao_kg: txt(r.peso_padrao_kg),
      largura: txt(r.medidas_padrao?.largura_cm), altura: txt(r.medidas_padrao?.altura_cm), comprimento: txt(r.medidas_padrao?.comprimento_cm),
    });
  }, [conf]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const num = (k: string) => { const v = lerValor(String(f[k] ?? "")); return v != null && v > 0 ? v : null; };

  async function salvar(ev: FormEvent) {
    ev.preventDefault();
    const l = num("largura"), a = num("altura"), c = num("comprimento");
    if ([l, a, c].some(Boolean) && ![l, a, c].every(Boolean)) return notify("Medidas padrão: preencha largura, altura e comprimento (ou deixe as três vazias)", "erro");
    const regras: RegrasFrete = lerRegras({
      loja_ligada: f.loja_ligada === true, retirada: f.retirada !== false, gratis_acima: num("gratis_acima"),
      gratis_ufs: String(f.gratis_ufs ?? "").split(/[\s,;]+/).filter(Boolean), acrescimo_percentual: num("acrescimo_percentual") ?? 0,
      acrescimo_fixo: num("acrescimo_fixo") ?? 0, peso_padrao_kg: num("peso_padrao_kg"),
      medidas_padrao: l && a && c ? { largura_cm: l, altura_cm: a, comprimento_cm: c } : null,
    });
    setSalvando(true);
    try {
      const { error } = await supabase.from("configuracoes").update({ frete_regras: regras }).eq("id", 1);
      if (error) throw error;
      notify("Regras de frete salvas");
      invalidar("configuracoes");
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  const campo = (k: string, label: string, dica?: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <Field label={label} dica={dica}><input className="input" inputMode="decimal" value={String(f[k] ?? "")} onChange={set(k)} disabled={!admin} {...extra} /></Field>
  );
  const marca = (k: string, label: string, dica: string) => (
    <label className="flex items-start gap-2 rounded-campo border border-slate-200 p-3 text-sm">
      <input type="checkbox" className="mt-0.5" checked={f[k] === true} onChange={set(k)} disabled={!admin} />
      <span><b className="text-fg">{label}</b><span className="block text-xs text-slate-500">{dica}</span></span>
    </label>
  );

  return (
    <form onSubmit={salvar} className="max-w-3xl space-y-4">
      {!admin && <p className="text-sm text-slate-500">Só o administrador muda as regras de frete.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {marca("loja_ligada", "Calcule o frete na loja", "O cliente digita o CEP na página do produto e no carrinho e escolhe o frete; o valor entra no pedido.")}
        {marca("retirada", "Retirar na fábrica", "Opção grátis de retirar na unidade da loja.")}
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-bold text-fg">Frete grátis (na opção mais barata)</legend>
        {campo("gratis_acima", "Com os produtos a partir de (R$)", "Vazio = não dá frete grátis pelo valor")}
        {campo("gratis_ufs", "Para estes estados", "Siglas separadas por vírgula. Ex.: SC, PR", { inputMode: "text", placeholder: "SC, PR" })}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-bold text-fg">Acréscimo no frete do cliente</legend>
        {campo("acrescimo_percentual", "Percentual (%)", "Ex.: 10 para embalagem e manuseio")}
        {campo("acrescimo_fixo", "Valor fixo (R$)", "Somado a cada frete")}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-bold text-fg">Produto ainda sem peso ou medidas</legend>
        <p className="text-xs text-slate-500 sm:col-span-4">Se preencher, a cotação usa estes valores no lugar. Vazio: o produto fica "frete sob consulta" (complete em Fretes → Peso e medidas).</p>
        {campo("peso_padrao_kg", "Peso (kg)")}
        {campo("largura", "Largura (cm)")}
        {campo("altura", "Altura (cm)")}
        {campo("comprimento", "Comprimento (cm)")}
      </fieldset>
      {admin && <Button type="submit" carregando={salvando} disabled={salvando}><Save size={16} /> Salvar regras</Button>}
    </form>
  );
}
