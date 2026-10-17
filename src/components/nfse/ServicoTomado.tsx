// Notas fiscais → NFS-e → Recebidas: serviço tomado lançado pela descrição (com ou sem o número da NFS-e) e a conta a
// pagar de cada serviço tomado, como no Tiny. O XML da mesma nota (prestador + número) que chegar depois completa o
// lançamento sem duplicar.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Link2, Save } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { ClienteBusca } from "@/components/ClienteBusca";
import { CampoCategoria } from "@/components/financeiro/CategoriaRateio";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { semUnificados, useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { useUnidade } from "@/lib/unidade";
import { brl, dataBR, hoje } from "@/lib/format";
import { liquidoNfse, valorNumero, type NfseImportada } from "@/lib/nfseImportada";

type Fornecedor = { id: string; nome: string; cnpj: string | null; bloqueado?: boolean | null; unificado_em?: string | null };

const CATEGORIA_PADRAO = "serviços profissionais";
const num = (s: string) => Math.round(valorNumero(s) * 100) / 100;
const txt = (v: number | null | undefined) => (v ? String(v).replace(".", ",") : "");

function useFornecedores() {
  const { data = [] } = useRows<Fornecedor>("fornecedores", { select: "id, nome, cnpj, bloqueado, unificado_em", order: "nome", ascending: true });
  return useMemo(() => semUnificados(data).map((f) => ({ ...f, nome: f.bloqueado ? `⛔ ${f.nome} (golpe: não pagar)` : f.nome, cpf_cnpj: f.cnpj })), [data]);
}

/** Lançar (ou corrigir) o serviço tomado e, se marcado, já lançar a conta a pagar. */
export function FormServicoTomado({ inicial, onClose }: { inicial?: NfseImportada | null; onClose: () => void }) {
  const { unidades, padrao } = useUnidade();
  const ativas = unidades.filter((u) => u.ativo);
  const fornecedores = useFornecedores();
  const invalidar = useInvalidate();
  const [f, setF] = useState(() => ({
    unidade_id: inicial?.unidade_id ?? padrao ?? ativas[0]?.id ?? "",
    fornecedor_id: inicial?.fornecedor_id ?? "",
    numero: inicial?.numero ?? "",
    data_emissao: inicial?.data_emissao ?? hoje(),
    competencia: (inicial?.competencia ?? "").slice(0, 7),
    valor_servicos: txt(inicial?.valor_servicos),
    discriminacao: inicial?.discriminacao ?? "",
    valor_iss: txt(inicial?.valor_iss), iss_retido: inicial?.iss_retido ?? false,
    valor_ir: txt(inicial?.valor_ir), valor_inss: txt(inicial?.valor_inss),
    valor_pis: txt(inicial?.valor_pis), valor_cofins: txt(inicial?.valor_cofins), valor_csll: txt(inicial?.valor_csll),
  }));
  const [retencoesAbertas, setRetencoesAbertas] = useState(!!inicial && (inicial.iss_retido || inicial.valor_ir + inicial.valor_inss + inicial.valor_pis + inicial.valor_cofins + inicial.valor_csll > 0));
  const [lancar, setLancar] = useState(!inicial);
  const [vencimento, setVencimento] = useState(hoje());
  const [categoria, setCategoria] = useState(CATEGORIA_PADRAO);
  const [ocupado, setOcupado] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const valores = {
    valor_servicos: num(f.valor_servicos), valor_iss: f.valor_iss ? num(f.valor_iss) : null, iss_retido: f.iss_retido,
    valor_ir: num(f.valor_ir), valor_inss: num(f.valor_inss), valor_pis: num(f.valor_pis), valor_cofins: num(f.valor_cofins), valor_csll: num(f.valor_csll),
  };
  const liquido = liquidoNfse({ ...valores, valor_liquido: null });

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.fornecedor_id) return notifyError(new Error("Escolha o fornecedor (prestador do serviço)"));
    if (!(valores.valor_servicos > 0)) return notifyError(new Error("Informe o valor do serviço"));
    if (liquido <= 0) return notifyError(new Error("As retenções passam do valor do serviço"));
    setOcupado(true);
    try {
      const { data: id, error } = await supabase.rpc("registrar_servico_tomado", { p: {
        id: inicial?.id ?? null, unidade_id: f.unidade_id, fornecedor_id: f.fornecedor_id, numero: f.numero.trim(),
        data_emissao: f.data_emissao, competencia: f.competencia ? `${f.competencia}-01` : null, discriminacao: f.discriminacao.trim(),
        ...Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, typeof v === "number" ? v.toFixed(2) : v])),
      } });
      if (error) throw error;
      if (lancar) {
        const { error: e2 } = await supabase.rpc("lancar_conta_servico_tomado", { p_nfse: id, p_vencimento: vencimento, p_categoria: categoria || CATEGORIA_PADRAO });
        if (e2) {
          notify("Serviço tomado salvo, mas a conta a pagar não foi lançada");
          throw e2;
        }
        invalidar("contas_pagar");
        notify(`Serviço tomado salvo e conta a pagar de ${brl(liquido)} lançada (vai para a aprovação)`);
      } else {
        notify(inicial ? "Serviço tomado corrigido" : "Serviço tomado salvo");
      }
      onClose();
    } catch (err) { notifyError(err); } finally {
      setOcupado(false);
      invalidar("nfse_importadas");
    }
  }

  async function cancelar() {
    if (!inicial || !(await confirmar("Cancelar este serviço tomado? Ele fica na lista como cancelado e não lança conta.", { perigo: true }))) return;
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("registrar_servico_tomado", { p: { id: inicial.id, cancelar: "true" } });
      if (error) throw error;
      invalidar("nfse_importadas");
      notify("Serviço tomado cancelado");
      onClose();
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }

  const campoValor = (k: "valor_iss" | "valor_ir" | "valor_inss" | "valor_pis" | "valor_cofins" | "valor_csll", rotulo: string) => (
    <Field label={rotulo}>
      <input className="input" inputMode="decimal" placeholder="0,00" value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );

  return (
    <Modal open onClose={onClose} title={inicial ? "Corrigir serviço tomado" : "Lançar serviço tomado"} wide>
      <form onSubmit={salvar} className="space-y-4">
        <p className="text-sm text-slate-600">
          Para o serviço que a MF contratou (contador, advogado, manutenção, sistemas…) sem o XML da nota — ou sem nota.
          Com o número da NFS-e, o XML que chegar depois completa este lançamento, sem duplicar.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fornecedor (prestador do serviço)" className="sm:col-span-2">
            <ClienteBusca clientes={fornecedores} value={f.fornecedor_id} required placeholder="Buscar por nome, CNPJ ou cidade…"
              onChange={(id) => set("fornecedor_id", id)} />
          </Field>
          <Field label="Unidade da MF que tomou o serviço">
            <select className="input" value={f.unidade_id} onChange={(e) => set("unidade_id", e.target.value)} required>
              {ativas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
          <Field label="Número da NFS-e (se houver)">
            <input className="input" value={f.numero} maxLength={30} placeholder="Sem nota: deixe vazio" onChange={(e) => set("numero", e.target.value)} />
          </Field>
          <Field label="Data (emissão da nota ou do serviço)">
            <input className="input" type="date" required max={hoje()} value={f.data_emissao} onChange={(e) => set("data_emissao", e.target.value)} />
          </Field>
          <Field label="Competência (mês do serviço)">
            <input className="input" type="month" value={f.competencia} onChange={(e) => set("competencia", e.target.value)} />
            <span className="mt-1 block text-xs text-slate-500">Vazio: o mês da data.</span>
          </Field>
          <Field label="Valor do serviço (R$)">
            <input className="input" inputMode="decimal" required placeholder="0,00" value={f.valor_servicos} onChange={(e) => set("valor_servicos", e.target.value)} />
          </Field>
          <div className="flex items-end pb-2 text-sm">
            <span>A pagar ao prestador: <b className="num">{brl(Math.max(0, liquido))}</b></span>
          </div>
          <Field label="Descrição do serviço" className="sm:col-span-2">
            <textarea className="input" rows={3} required minLength={3} maxLength={4000} value={f.discriminacao}
              placeholder="Ex.: Honorários contábeis de outubro; manutenção do compressor da fábrica…" onChange={(e) => set("discriminacao", e.target.value)} />
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <button type="button" className="text-sm font-semibold text-brand" onClick={() => setRetencoesAbertas((v) => !v)} aria-expanded={retencoesAbertas}>
            {retencoesAbertas ? "▾" : "▸"} Impostos retidos (ISS, IR, INSS, PIS, COFINS, CSLL)
          </button>
          {retencoesAbertas && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {campoValor("valor_iss", "ISS (R$)")}
              <label className="inline-flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" className="h-4 w-4" checked={f.iss_retido} onChange={(e) => set("iss_retido", e.target.checked)} /> ISS retido pela MF
              </label>
              <span className="hidden sm:block" />
              {campoValor("valor_ir", "IR retido (R$)")}
              {campoValor("valor_inss", "INSS retido (R$)")}
              {campoValor("valor_csll", "CSLL retida (R$)")}
              {campoValor("valor_pis", "PIS retido (R$)")}
              {campoValor("valor_cofins", "COFINS retida (R$)")}
              <p className="text-xs text-slate-500 sm:col-span-3">
                O retido sai do valor pago ao prestador e a MF recolhe em guia própria (DARF/ISS). Quais retenções valem para cada
                serviço: confirmar com o contador.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4" checked={lancar} onChange={(e) => setLancar(e.target.checked)} /> Lançar a conta a pagar agora
          </label>
          {lancar && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Vencimento">
                <input className="input" type="date" required value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
              </Field>
              <CampoCategoria tipo="despesa" value={categoria} onChange={setCategoria} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {inicial ? <Button type="button" variant="secondary" onClick={cancelar} disabled={ocupado}><Ban size={16} /> Cancelar serviço</Button> : <span />}
          <Button type="submit" disabled={ocupado}><Save size={16} /> {ocupado ? "Salvando…" : lancar ? "Salvar e lançar a conta" : "Salvar"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Conta a pagar de um serviço tomado (do XML ou lançado na tela). */
export function LancarContaServico({ nota, onClose }: { nota: NfseImportada; onClose: () => void }) {
  const fornecedores = useFornecedores();
  const invalidar = useInvalidate();
  const [fornecedor, setFornecedor] = useState(nota.fornecedor_id ?? "");
  const [vencimento, setVencimento] = useState(hoje());
  const [categoria, setCategoria] = useState(CATEGORIA_PADRAO);
  const [ocupado, setOcupado] = useState(false);
  const liquido = liquidoNfse(nota);

  // conta do mesmo fornecedor com valor parecido perto da data (já lançada à mão, conta fixa…): ligar em vez de duplicar
  const forn = nota.fornecedor_id || fornecedor;
  const { data: parecidas = [] } = useQuery({
    queryKey: ["contas_pagar", "parecidas-servico", forn, nota.id],
    enabled: !!forn,
    queryFn: async () => {
      const d = new Date(`${nota.data_emissao}T12:00:00Z`);
      const dia = (n: number) => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("contas_pagar").select("id, descricao, valor, vencimento, status, documento")
        .eq("fornecedor_id", forn).neq("status", "cancelado").gte("vencimento", dia(-45)).lte("vencimento", dia(75))
        .gte("valor", Math.round(liquido * 95) / 100).lte("valor", Math.round(Number(nota.valor_servicos) * 105) / 100)
        .order("vencimento").limit(5);
      if (error) throw error;
      return (data ?? []) as { id: string; descricao: string; valor: number; vencimento: string; status: string; documento: string | null }[];
    },
  });

  async function ligar(conta: string) {
    setOcupado(true);
    try {
      const { error } = await supabase.from("nfse_importadas")
        .update({ conta_pagar_id: conta, fornecedor_id: forn, updated_at: new Date().toISOString() }).eq("id", nota.id);
      if (error) throw error;
      invalidar("nfse_importadas");
      notify("Serviço tomado ligado à conta que já existia");
      onClose();
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("lancar_conta_servico_tomado", {
        p_nfse: nota.id, p_vencimento: vencimento, p_categoria: categoria || CATEGORIA_PADRAO, p_fornecedor: fornecedor || null,
      });
      if (error) throw error;
      invalidar("contas_pagar");
      invalidar("nfse_importadas");
      notify(`Conta a pagar de ${brl(liquido)} lançada (vai para a aprovação)`);
      onClose();
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }

  return (
    <Modal open onClose={onClose} title="Lançar conta a pagar do serviço tomado">
      <form onSubmit={lancar} className="space-y-3">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="font-semibold">{nota.numero ? `NFS-e ${nota.numero}` : "Serviço sem nota"} · {nota.prestador_nome ?? "prestador"}</div>
          <div className="text-slate-600">{dataBR(nota.data_emissao)} · serviço {brl(nota.valor_servicos)}{liquido !== Number(nota.valor_servicos) ? ` · a pagar ${brl(liquido)} (sem as retenções)` : ""}</div>
          {nota.discriminacao && <div className="mt-1 text-xs text-slate-500">{nota.discriminacao.slice(0, 160)}</div>}
        </div>
        {!nota.fornecedor_id && (
          <Field label="Fornecedor (o CNPJ do prestador não está no cadastro)">
            <ClienteBusca clientes={fornecedores} value={fornecedor} required placeholder="Buscar por nome, CNPJ ou cidade…" onChange={(id) => setFornecedor(id)} />
          </Field>
        )}
        {parecidas.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Já existe conta deste fornecedor com valor parecido. Se for a mesma, ligue em vez de lançar outra:</p>
            <ul className="mt-2 space-y-1.5">
              {parecidas.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">{c.descricao} · {brl(c.valor)} · vence {dataBR(c.vencimento)}{c.status === "pago" ? " · paga" : ""}</span>
                  <Button type="button" variant="secondary" className="!px-2 !py-1 text-xs" disabled={ocupado} onClick={() => ligar(c.id)}><Link2 size={14} /> É esta: ligar</Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vencimento">
            <input className="input" type="date" required value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </Field>
          <CampoCategoria tipo="despesa" value={categoria} onChange={setCategoria} />
        </div>
        <p className="text-xs text-slate-500">A conta entra com a NFS-e no documento, a emissão e a competência da nota, e passa pela aprovação como as outras.</p>
        <div className="flex justify-end">
          <Button type="submit" disabled={ocupado || (!nota.fornecedor_id && !fornecedor)}>{ocupado ? "Lançando…" : `Lançar ${brl(liquido)}`}</Button>
        </div>
      </form>
    </Modal>
  );
}
