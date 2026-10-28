// Conferir a NF-e antes de emitir: a nota não vai sozinha para a SEFAZ. Mostra os itens do pedido e deixa mudar a
// descrição, a quantidade, o valor e o CFOP de cada um, o desconto, o frete, a transportadora, os volumes e o peso,
// a natureza da operação, o destinatário e o endereço de entrega, e o texto da nota; só ao apertar "Emitir" ela é
// enviada. Os ajustes valem só para a nota (o pedido e o financeiro não mudam: se o total ficar diferente, avisa).
import { preencherTextoNfe } from "../../../supabase/functions/_shared/textoNfe";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText } from "lucide-react";
import { Button, Field, Modal, Section } from "@/components/ui";
import { brl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { callFunction, supabase } from "@/lib/supabase";
import { confirmarSeTeste } from "@/lib/ambienteNfe";
import { faturamentoDoPedido, MOTIVOS_NOTA_MENOR, problemaIeDestinatario } from "../../../supabase/functions/_shared/nfe-ajustes";

type Item = { id: string; descricao: string; quantidade: number; valor_unitario: number; numero_serie?: string | null };
type ClienteNfe = { id?: string; nome: string; nome_fantasia?: string | null; cpf_cnpj: string | null; inscricao_estadual: string | null; contribuinte_icms: number | null; tipo_pessoa: string | null; municipio?: string | null; uf?: string | null };
const CAMPOS_CLIENTE = "id, nome, nome_fantasia, cpf_cnpj, inscricao_estadual, contribuinte_icms, tipo_pessoa, municipio, uf";
type PedidoNfe = {
  id: string; numero: number; valor_total: number; desconto: number; frete: number; observacoes: string | null;
  transportadora_id?: string | null; modalidade_frete?: number | null; peso_total_kg?: number | null;
  cliente?: ClienteNfe | null; unidade?: { informacoes_complementares?: string | null; telefone?: string | null; whatsapp?: string | null; natureza_operacao?: string | null } | null; vendedor?: string | null; forma_pagamento?: string | null; itens: Item[];
};

const num = (v: string) => Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

const camposDoPedido = (p: PedidoNfe) => ({
  pedido: p.numero, vendedor: p.vendedor, forma_pagamento: p.forma_pagamento,
  telefone: p.unidade?.whatsapp || p.unidade?.telefone, cliente: p.cliente?.nome_fantasia || p.cliente?.nome,
});

export function ConferirNfe({ pedidoId, onClose, onEmitida }: { pedidoId: string; onClose: () => void; onEmitida?: () => void }) {
  const [p, setP] = useState<PedidoNfe | null>(null);
  const [itens, setItens] = useState<{ id: string; descricao: string; quantidade: string; valor: string; cfop: string }[]>([]);
  const [desconto, setDesconto] = useState("0");
  const [frete, setFrete] = useState("0");
  const [info, setInfo] = useState("");
  // transportadora da nota (28/10: não dava para pôr a transportadora na nota): vem do pedido e dá para trocar aqui
  const [transportadoras, setTransportadoras] = useState<{ id: string; nome: string; nome_fantasia: string | null }[]>([]);
  const [transportadora, setTransportadora] = useState("");
  const [modalidade, setModalidade] = useState(9);
  // 28/10: "virar NF sem autorizar para poder mexer": volumes e peso, natureza, destinatário e entrega
  const [volumes, setVolumes] = useState({ quantidade: "", especie: "", bruto: "", liquido: "" });
  const [natureza, setNatureza] = useState("");
  const [outroCliente, setOutroCliente] = useState<ClienteNfe | null>(null);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<ClienteNfe[]>([]);
  const [entregaOutra, setEntregaOutra] = useState(false);
  const [entrega, setEntrega] = useState({ logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "", cep: "" });
  const [enviando, setEnviando] = useState(false);
  const [motivo, setMotivo] = useState("");
  // entrega parcial: o que já tem NF-e autorizada; esta nota é do restante
  const [jaEmitido, setJaEmitido] = useState(0);

  useEffect(() => {
    supabase.from("notas_fiscais").select("status, ambiente, valor_total").eq("pedido_id", pedidoId).then(({ data, error }) => {
      if (error) return notifyError(error);
      setJaEmitido(faturamentoDoPedido(0, data ?? []).jaEmitido);
    });
    supabase.from("transportadoras").select("id, nome, nome_fantasia").eq("ativo", true).is("unificado_em", null).order("nome")
      .then(({ data }) => setTransportadoras((data ?? []) as { id: string; nome: string; nome_fantasia: string | null }[]));
    supabase.from("pedidos").select(`id, numero, valor_total, desconto, frete, observacoes, transportadora_id, modalidade_frete, peso_total_kg, vendedor, forma_pagamento, cliente:clientes(${CAMPOS_CLIENTE}), unidade:unidades(informacoes_complementares, telefone, whatsapp, natureza_operacao), ` +
      "itens:pedido_itens(id, descricao, quantidade, valor_unitario, numero_serie)").eq("id", pedidoId).single()
      .then(({ data, error }) => {
        if (error) return notifyError(error);
        const d = data as unknown as PedidoNfe;
        setP(d);
        setItens(d.itens.map((i) => ({ id: i.id, descricao: i.descricao, quantidade: String(i.quantidade), valor: String(i.valor_unitario).replace(".", ","), cfop: "" })));
        setNatureza(d.unidade?.natureza_operacao ?? "");
        if (Number(d.peso_total_kg) > 0) setVolumes((v) => ({ ...v, bruto: String(d.peso_total_kg).replace(".", ",") }));
        setDesconto(String(d.desconto ?? 0).replace(".", ","));
        setFrete(String(d.frete ?? 0).replace(".", ","));
        setTransportadora(d.transportadora_id ?? "");
        setModalidade(d.modalidade_frete ?? 9);
        setInfo([`Pedido #${d.numero}`, d.observacoes, preencherTextoNfe(d.unidade?.informacoes_complementares, camposDoPedido(d))].filter(Boolean).join(" - "));
      });
  }, [pedidoId]);

  // busca de outro cliente do cadastro para destinatário (nome, fantasia ou CPF/CNPJ)
  useEffect(() => {
    const t = busca.trim().replace(/[,()*%]/g, " ");
    if (t.length < 3) { setAchados([]); return; }
    const dig = t.replace(/\D/g, "");
    const id = setTimeout(() => {
      const q = supabase.from("clientes").select(CAMPOS_CLIENTE).is("unificado_em", null).limit(8);
      (dig.length >= 5 ? q.ilike("cpf_cnpj", `%${dig}%`) : q.or(`nome.ilike.%${t}%,nome_fantasia.ilike.%${t}%`))
        .then(({ data }) => setAchados((data ?? []) as ClienteNfe[]));
    }, 300);
    return () => clearTimeout(id);
  }, [busca]);

  const total = useMemo(() => r2(itens.reduce((s, i) => s + num(i.quantidade) * num(i.valor), 0) - num(desconto) + num(frete)), [itens, desconto, frete]);
  // a conta é contra o que falta faturar (o pedido todo, se ainda não tem NF-e)
  const base = p ? Math.max(0, r2(Number(p.valor_total) - jaEmitido)) : 0;
  const mudou = !!p && !jaEmitido && Math.abs(total - base) > 0.009;
  // nota menor que a venda: só nos casos que a lei permite, com o motivo registrado no pedido
  const menor = !!p && total < base - 0.009;
  const passou = !!p && jaEmitido > 0 && total > base + 0.009;
  // IE errada = recusa certa da SEFAZ: avisa aqui, antes de gastar um envio
  const destinatario = outroCliente ?? p?.cliente ?? null;
  const problemaIe = destinatario ? problemaIeDestinatario(destinatario.cpf_cnpj, destinatario.inscricao_estadual, destinatario.tipo_pessoa === "PJ" && Number(destinatario.contribuinte_icms) === 1) : null;
  const set = (k: number, campo: "descricao" | "quantidade" | "valor" | "cfop", v: string) => setItens((l) => l.map((x, j) => (j === k ? { ...x, [campo]: v } : x)));
  const opcional = (v: string) => (v.trim() ? num(v) : null);

  async function emitir() {
    if (!p) return;
    if (itens.some((i) => !(num(i.quantidade) > 0) || num(i.valor) < 0 || !i.descricao.trim())) return notify("Confira os itens: descrição, quantidade maior que zero e valor", "erro");
    if (itens.some((i) => i.cfop.trim() && !/^[56]\d{3}$/.test(i.cfop.replace(/\D/g, "")))) return notify("CFOP com 4 números, começando com 5 (no estado) ou 6 (outro estado)", "erro");
    if (entregaOutra && (!entrega.logradouro.trim() || !entrega.municipio.trim())) return notify("Preencha a rua e a cidade do endereço de entrega", "erro");
    if (menor && !motivo) return notify("A NF-e ficou menor que o pedido: escolha o motivo", "erro");
    if (passou) return notify(`A NF-e passa do que falta faturar (${brl(base)}): ajuste os itens`, "erro");
    setEnviando(true);
    try {
      if (!(await confirmarSeTeste())) return;
      const ajustes = {
        itens: itens.map((i) => ({ id: i.id, descricao: i.descricao.trim(), quantidade: num(i.quantidade), valor_unitario: num(i.valor), cfop: i.cfop.replace(/\D/g, "") || undefined })),
        desconto: num(desconto), frete: num(frete), informacoes: info, motivo: menor ? motivo : undefined,
        transportadora_id: transportadora || null, modalidade_frete: modalidade,
        natureza_operacao: natureza.trim() || undefined,
        volumes: { quantidade: opcional(volumes.quantidade), especie: volumes.especie, peso_bruto: opcional(volumes.bruto), peso_liquido: opcional(volumes.liquido) },
        cliente_id: outroCliente?.id ?? null,
        entrega: entregaOutra ? entrega : null,
      };
      await callFunction("nfe-emitir", { pedido_id: p.id, ajustes });
      notify("NF-e enviada para a SEFAZ. Acompanhe em Notas fiscais.");
      onEmitida?.();
      onClose();
    } catch (e) { notifyError(e); } finally { setEnviando(false); }
  }

  return (
    <Modal open onClose={onClose} title={p ? `Conferir a NF-e do pedido #${p.numero}` : "Conferir a NF-e"} wide>
      {!p ? <p className="py-6 text-center text-slate-500">Carregando…</p> : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">A nota só vai para a SEFAZ quando você apertar <b>Emitir NF-e</b>. Confira e ajuste o que precisar
            {destinatario?.nome ? <> · destinatário <b>{destinatario.nome}</b>{outroCliente ? " (trocado nesta nota)" : ""}</> : null}.</p>
          {jaEmitido > 0 && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              Este pedido já tem NF-e de <b>{brl(jaEmitido)}</b> (entrega parcial). Esta nota é do restante: <b>{brl(base)}</b>.
              Deixe só os itens que faltam sair, com as quantidades que faltam.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr><th className="p-2">Descrição na nota</th><th className="w-24 p-2">Qtd.</th><th className="w-32 p-2">Valor unit.</th><th className="w-24 p-2" title="Vazio: o da regra de tributação">CFOP</th><th className="w-28 p-2 text-right">Total</th></tr>
              </thead>
              <tbody>
                {itens.map((i, k) => (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="p-2"><input className="input" value={i.descricao} onChange={(e) => set(k, "descricao", e.target.value)} aria-label={`Descrição do item ${k + 1}`} /></td>
                    <td className="p-2"><input className="input text-right" inputMode="decimal" value={i.quantidade} onChange={(e) => set(k, "quantidade", e.target.value)} aria-label={`Quantidade do item ${k + 1}`} /></td>
                    <td className="p-2"><input className="input text-right" inputMode="decimal" value={i.valor} onChange={(e) => set(k, "valor", e.target.value)} aria-label={`Valor do item ${k + 1}`} /></td>
                    <td className="p-2"><input className="input" inputMode="numeric" maxLength={4} placeholder="auto" value={i.cfop} onChange={(e) => set(k, "cfop", e.target.value)} aria-label={`CFOP do item ${k + 1} (vazio: o da regra)`} /></td>
                    <td className="p-2 text-right font-semibold">{brl(num(i.quantidade) * num(i.valor))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Desconto (R$)"><input className="input text-right" inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} /></Field>
            <Field label="Frete (R$)"><input className="input text-right" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} /></Field>
            <div className="rounded-xl bg-slate-50 p-3 text-right">
              <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">Total da nota</span>
              <span className="text-xl font-extrabold text-fg">{brl(total)}</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Frete por conta de">
              <select className="input" value={modalidade} onChange={(e) => setModalidade(Number(e.target.value))}>
                <option value={0}>Remetente (MF paga o frete)</option>
                <option value={1}>Destinatário (cliente paga o frete)</option>
                <option value={2}>Terceiros</option>
                <option value={9}>Sem frete (retira)</option>
              </select>
            </Field>
            <Field label="Transportadora (sai na nota)">
              <select className="input" value={transportadora} onChange={(e) => { setTransportadora(e.target.value); if (e.target.value && modalidade === 9) setModalidade(0); }} disabled={modalidade === 9}>
                <option value="">{modalidade === 9 ? "Sem frete" : "Escolha…"}</option>
                {transportadoras.map((t) => <option key={t.id} value={t.id}>{t.nome_fantasia || t.nome}</option>)}
              </select>
            </Field>
          </div>
          <Section title="Volumes, natureza, destinatário e entrega" recolhivel resumo={[volumes.quantidade && `${volumes.quantidade} vol.`, volumes.bruto && `${volumes.bruto} kg`, outroCliente && "outro destinatário", entregaOutra && "outra entrega"].filter(Boolean).join(" · ") || "como no pedido"}>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Volumes (quantidade)"><input className="input text-right" inputMode="numeric" value={volumes.quantidade} onChange={(e) => setVolumes({ ...volumes, quantidade: e.target.value })} /></Field>
                <Field label="Espécie"><input className="input" placeholder="Caixa, Engradado…" value={volumes.especie} onChange={(e) => setVolumes({ ...volumes, especie: e.target.value })} /></Field>
                <Field label="Peso bruto (kg)"><input className="input text-right" inputMode="decimal" value={volumes.bruto} onChange={(e) => setVolumes({ ...volumes, bruto: e.target.value })} /></Field>
                <Field label="Peso líquido (kg)"><input className="input text-right" inputMode="decimal" value={volumes.liquido} onChange={(e) => setVolumes({ ...volumes, liquido: e.target.value })} /></Field>
              </div>
              <Field label="Natureza da operação" dica="Ex.: Venda de mercadoria, Remessa em bonificação. Se mudar a natureza, confira também o CFOP dos itens.">
                <input className="input" maxLength={60} value={natureza} onChange={(e) => setNatureza(e.target.value)} />
              </Field>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">Destinatário</p>
                {outroCliente ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <b className="text-fg">{outroCliente.nome}</b><span className="text-slate-500">{outroCliente.cpf_cnpj} · {outroCliente.municipio}/{outroCliente.uf}</span>
                    <Button variant="ghost" tamanho="mini" onClick={() => { setOutroCliente(null); setBusca(""); }}>Voltar ao cliente do pedido</Button>
                  </p>
                ) : (
                  <>
                    <input className="input" placeholder={`${p.cliente?.nome ?? "Cliente do pedido"} · para trocar, busque outro cliente (nome ou CPF/CNPJ)`} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar outro cliente para destinatário" />
                    {achados.length > 0 && (
                      <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {achados.map((c) => (
                          <li key={c.id}><button type="button" className="linha-clicavel w-full px-3 py-2 text-left text-sm" onClick={() => { setOutroCliente(c); setAchados([]); }}>
                            <b className="text-fg">{c.nome}</b> <span className="text-slate-500">{c.cpf_cnpj} · {c.municipio}/{c.uf}</span></button></li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {outroCliente && <p className="mt-1 text-xs text-amber-800">A nota sai em nome deste cliente. O pedido e as parcelas do financeiro continuam no cliente do pedido.</p>}
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entregaOutra} onChange={(e) => setEntregaOutra(e.target.checked)} /> Entregar em outro endereço (vai escrito na nota)</label>
              {entregaOutra && (
                <div className="grid gap-3 sm:grid-cols-6">
                  <Field label="Rua" className="sm:col-span-3"><input className="input" value={entrega.logradouro} onChange={(e) => setEntrega({ ...entrega, logradouro: e.target.value })} /></Field>
                  <Field label="Número"><input className="input" value={entrega.numero} onChange={(e) => setEntrega({ ...entrega, numero: e.target.value })} /></Field>
                  <Field label="Complemento" className="sm:col-span-2"><input className="input" value={entrega.complemento} onChange={(e) => setEntrega({ ...entrega, complemento: e.target.value })} /></Field>
                  <Field label="Bairro" className="sm:col-span-2"><input className="input" value={entrega.bairro} onChange={(e) => setEntrega({ ...entrega, bairro: e.target.value })} /></Field>
                  <Field label="Cidade" className="sm:col-span-2"><input className="input" value={entrega.municipio} onChange={(e) => setEntrega({ ...entrega, municipio: e.target.value })} /></Field>
                  <Field label="UF"><input className="input uppercase" maxLength={2} value={entrega.uf} onChange={(e) => setEntrega({ ...entrega, uf: e.target.value })} /></Field>
                  <Field label="CEP"><input className="input" inputMode="numeric" value={entrega.cep} onChange={(e) => setEntrega({ ...entrega, cep: e.target.value })} /></Field>
                </div>
              )}
            </div>
          </Section>
          <Field label="Informações complementares (vão impressas na nota)">
            <textarea className="input min-h-[70px]" value={info} onChange={(e) => setInfo(e.target.value)} />
          </Field>
          {problemaIe && (
            <p className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>Antes de emitir: {problemaIe}. Em Clientes, abra o cadastro e toque na lupa ao lado de Inscrição estadual.</span>
            </p>
          )}
          {menor && (
            <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <p>A NF-e precisa mostrar o valor real da venda. Nota abaixo do valor vendido só nos casos abaixo,
                e o motivo fica registrado nas ocorrências do pedido. Fora disso é crime contra a ordem tributária (Lei 8.137/1990, art. 1º).</p>
              <Field label="Motivo da nota menor que o pedido">
                <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                  <option value="">Escolha…</option>
                  {Object.entries(MOTIVOS_NOTA_MENOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
          )}
          {passou && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-900">A nota ({brl(total)}) passa do que falta faturar ({brl(base)}): tire os itens que já saíram na outra NF-e.</p>}
          {mudou && (
            <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>O total da nota ({brl(total)}) ficou diferente do pedido ({brl(Number(p.valor_total))}). O pedido e as parcelas do financeiro não mudam sozinhos.
                A nota precisa mostrar o valor real da venda: se o preço mudou, ajuste também o pedido.</span>
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={emitir} disabled={enviando || (menor && !motivo) || passou || !!problemaIe}><FileText size={16} /> {enviando ? "Enviando…" : "Emitir NF-e"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
