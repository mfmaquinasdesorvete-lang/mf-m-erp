// Configurações → Recebimentos e taxas: as contas de cada unidade (Pix, banco, InfinitePay e as taxas do plano),
// separadas do cadastro da unidade, e as regras de cobrança e custos dos meios de pagamento da empresa.
import { useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, Landmark, Link2, QrCode } from "lucide-react";
import { Button, Card, Field } from "@/components/ui";
import { useSave } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { normalizarTaxas } from "@/lib/infinitepay";
import { useUnidade, type Unidade } from "@/lib/unidade";
import { BotaoSalvar, Bloco, CabecalhoSecao, campo, secaoPorId, useCfgPagina } from "./comum";

const CHAVES = ["dias_vencimento_boleto", "multa_percentual", "juros_percentual_mes", "custos_pagamento"];
const num = (v: unknown) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));

export function ConfigRecebimentos() {
  const s = secaoPorId("recebimentos")!;
  const { unidades } = useUnidade();
  const [aberta, setAberta] = useState<string | null>(null);
  const { cfg, set, mudar, salvar, salvando } = useCfgPagina(CHAVES, (r) => ({
    ...r, dias_vencimento_boleto: num(r.dias_vencimento_boleto) ?? 0, multa_percentual: num(r.multa_percentual) ?? 0, juros_percentual_mes: num(r.juros_percentual_mes) ?? 0,
  }));
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;
  const input = campo(cfg, set);

  return (
    <div className="max-w-5xl space-y-5">
      <CabecalhoSecao s={s} />

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Contas de cada unidade</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {unidades.map((u) => (
            <ResumoUnidade key={u.id} u={u} aberta={aberta === u.id} onAbrir={() => setAberta(aberta === u.id ? null : u.id)} />
          ))}
        </div>
      </section>

      <form id="form-recebimentos" onSubmit={salvar} className="space-y-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Regras da empresa</h2>
        <Bloco titulo="Cobrança (contas a receber)" descricao="Valem para os boletos e cobranças das duas unidades. Multa e juros entram no Pix e no link de pagamento de conta vencida.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {input("dias_vencimento_boleto", "Dias para o 1º vencimento", "", "number")}
            {input("multa_percentual", "Multa por atraso (%)", "", "number")}
            {input("juros_percentual_mes", "Juros ao mês (%)", "", "number")}
          </div>
        </Bloco>
        <Bloco titulo="Custos dos meios de pagamento (margem de contribuição)" descricao="Quanto cada forma de pagamento custa para a MF, para o cálculo da margem de cada venda. As taxas reais da InfinitePay ficam nas contas das unidades, acima.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([["cartao_pct", "Cartão (%)"], ["boleto_fixo", "Boleto (R$ por parcela)"], ["pix_pct", "Pix (%)"], ["transferencia_pct", "Transferência (%)"], ["dinheiro_pct", "Dinheiro (%)"]] as const).map(([k, l]) => (
              <Field key={k} label={l}>
                <input className="input" inputMode="decimal" value={cfg.custos_pagamento?.[k] ?? ""}
                  onChange={(e) => mudar({ custos_pagamento: { ...(cfg.custos_pagamento ?? {}), [k]: e.target.value === "" ? 0 : Number(e.target.value.replace(",", ".")) || 0 } })} />
              </Field>
            ))}
          </div>
        </Bloco>
        <div className="flex justify-end"><BotaoSalvar form="form-recebimentos" salvando={salvando} /></div>
      </form>
    </div>
  );
}

/** Cartão da unidade: o que já está pronto (Pix, banco, link) e o formulário ao tocar em Editar. */
function ResumoUnidade({ u, aberta, onAbrir }: { u: Unidade; aberta: boolean; onAbrir: () => void }) {
  const x = u as Unidade & Record<string, any>;
  const taxas = normalizarTaxas(x.infinitepay_taxas);
  const comTaxa = taxas.pix != null || taxas.debito != null || (taxas.credito ?? []).some((t) => t != null);
  const itens = [
    { ok: !!x.pix_chave, icone: QrCode, texto: x.pix_chave ? `Pix ${x.pix_chave}` : "Sem chave Pix para cobrança" },
    { ok: !!x.instrucoes_pagamento, icone: Landmark, texto: x.instrucoes_pagamento ? String(x.instrucoes_pagamento).split("\n")[0] : "Sem dados de banco para os lembretes" },
    { ok: !!x.infinitepay_tag, icone: Link2, texto: x.infinitepay_tag ? `InfinitePay $${x.infinitepay_tag}${comTaxa ? " · taxas cadastradas" : " · faltam as taxas"}` : "Sem InfinitePay (link de pagamento)" },
  ];
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-bold text-fg">{u.nome}{u.matriz ? <span className="ml-1 text-xs font-semibold text-slate-500">· matriz</span> : null}</div>
        <Button type="button" variant={aberta ? "ghost" : "secondary"} onClick={onAbrir}>{aberta ? "Fechar" : "Editar"}</Button>
      </div>
      {!aberta ? (
        <ul className="space-y-1.5 text-sm">
          {itens.map((i) => (
            <li key={i.texto} className={`flex items-start gap-2 ${i.ok ? "text-slate-700" : "text-amber-800"}`}>
              {i.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden /> : <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />}
              <i.icone size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden /><span className="min-w-0 break-words">{i.texto}</span>
            </li>
          ))}
        </ul>
      ) : <FormContas u={x} onFeito={onAbrir} />}
    </Card>
  );
}

function FormContas({ u: inicial, onFeito }: { u: Record<string, any>; onFeito: () => void }) {
  const [u, setU] = useState<Record<string, any>>(inicial);
  const save = useSave("unidades");
  const input = campo(u, (k) => (e) => setU((x) => ({ ...x, [k]: e.target.value })));
  // taxa da InfinitePay: ["pix"], ["debito"] ou ["credito", 0..11]
  const taxa = (label: string, caminho: [string] | [string, number]) => {
    const t = (u.infinitepay_taxas ?? {}) as Record<string, any>;
    const valor = caminho.length === 1 ? t[caminho[0]] : t.credito?.[caminho[1]];
    const mudar = (v: string) => {
      const novo = { ...t };
      if (caminho.length === 1) novo[caminho[0]] = v;
      else { const c = [...(t.credito ?? Array(12).fill(null))]; c[caminho[1]] = v; novo.credito = c; }
      setU({ ...u, infinitepay_taxas: novo });
    };
    return (
      <label key={label} className="block">
        <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
        <input className="input text-right" inputMode="decimal" placeholder="—" value={valor ?? ""} onChange={(e) => mudar(e.target.value)} aria-label={`Taxa ${label}`} />
      </label>
    );
  };
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({
        id: u.id, instrucoes_pagamento: u.instrucoes_pagamento || null, pix_chave: u.pix_chave || null, pix_nome: u.pix_nome || null, pix_cidade: u.pix_cidade || null,
        infinitepay_tag: u.infinitepay_tag || null, infinitepay_taxas: normalizarTaxas(u.infinitepay_taxas),
      });
      notify(`Contas de ${u.nome} salvas`);
      onFeito();
    } catch (err) { notifyError(err); }
  }
  return (
    <form onSubmit={salvar} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-fg"><QrCode size={15} aria-hidden /> Pix para cobrança</legend>
        <p className="text-xs text-slate-500">Com a chave, cada conta a receber ganha o Pix copia e cola (e QR Code) com o valor certo, no e-mail, no WhatsApp e na página do cliente.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {input("pix_chave", "Chave Pix")}
          {input("pix_nome", "Nome do recebedor")}
          {input("pix_cidade", "Cidade do recebedor")}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-fg"><Landmark size={15} aria-hidden /> Banco (texto dos lembretes)</legend>
        <textarea className="input" rows={3} placeholder={"Pix (CNPJ): 12.345.678/0001-90\nBanco do Brasil · Ag. 1234-5 · C/C 98765-4"} value={u.instrucoes_pagamento ?? ""}
          onChange={(e) => setU({ ...u, instrucoes_pagamento: e.target.value })} aria-label="Dados para pagamento" />
        <p className="text-xs text-slate-500">Vai nos lembretes de vencimento e na cobrança pelo WhatsApp.</p>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-fg"><Link2 size={15} aria-hidden /> InfinitePay (link de pagamento)</legend>
        <Field label="InfiniteTag (o nome com $ no app, sem o $)">
          <input className="input" value={u.infinitepay_tag ?? ""} placeholder="ex.: minhaloja" autoCapitalize="none"
            onChange={(e) => setU({ ...u, infinitepay_tag: e.target.value.replace(/^\$/, "").trim().toLowerCase() || null })} />
        </Field>
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-fg">Taxas do plano (%), pagas pela MF</summary>
          <p className="my-2 text-xs text-slate-500">Copie do app da InfinitePay. Quando o cliente paga pelo link, o ERP lança a taxa como despesa já paga (tarifas bancárias) para o saldo bater. Em branco = não lança.</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {taxa("Pix", ["pix"])}
            {taxa("Débito", ["debito"])}
            {Array.from({ length: 12 }, (_, i) => taxa(`Crédito ${i + 1}x`, ["credito", i]))}
          </div>
        </details>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onFeito}>Cancelar</Button>
        <Button disabled={save.isPending}>Salvar {String(u.nome ?? "")}</Button>
      </div>
    </form>
  );
}
