// Pedido faturado com a NF de outra empresa (ex.: a empresa ligada emitiu a nota porque a unidade não tinha como emitir
// na hora). O pedido guarda quem emitiu, o nº, a data, a chave e o valor; sai de "falta a nota" e fica faturado ou
// entregue, sem o ERP emitir NF-e. A máquina entra na ficha do cliente com a data da nota. A receita é de quem emitiu.
import { useState, type FormEvent } from "react";
import { FileCheck2, Pencil, Undo2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, hoje } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { numeroBR } from "@/lib/fichaCadastral";
import { dadosDaChave, rotuloNfOutra } from "@/lib/nfOutra";
import type { Parte } from "@/lib/partesRelacionadas";
import type { Pedido } from "@/lib/types";

type PedidoNf = Pick<Pedido, "id" | "numero" | "status" | "valor_total" | "nf_outra_empresa" | "nf_outra_cnpj" | "nf_outra_numero" | "nf_outra_data"
  | "nf_outra_chave" | "nf_outra_valor" | "nf_outra_motivo">;

const cnpjBR = (d: string | null | undefined) => (d && d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : d ?? "");

/** Selo da lista e do quadro: "NF 123 · Empresa" (nota de outra empresa). */
export function SeloNfOutra({ p }: { p: Pick<Pedido, "nf_outra_numero" | "nf_outra_empresa" | "nf_outra_data"> }) {
  const rotulo = rotuloNfOutra(p);
  if (!rotulo) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-1.5 py-0.5 text-2xs font-bold text-violet-800"
      title={`NF emitida por ${p.nf_outra_empresa ?? "outra empresa"}${p.nf_outra_data ? ` em ${dataBR(p.nf_outra_data)}` : ""} (fora do ERP)`}>
      <FileCheck2 size={12} aria-hidden /> {rotulo}
    </span>
  );
}

/** Quadro dentro do pedido: a nota registrada, com Alterar e Tirar. */
export function NfOutraPainel({ p, podeEditar, onAlterar, onFeito }: { p: PedidoNf; podeEditar: boolean; onAlterar: () => void; onFeito: () => void }) {
  if (!p.nf_outra_numero) return null;
  async function tirar() {
    if (!(await confirmar(`Tirar do pedido #${p.numero} a NF ${p.nf_outra_numero} de ${p.nf_outra_empresa}? A situação do pedido não muda.`, { ok: "Tirar a nota" }))) return;
    const { error } = await supabase.rpc("registrar_nf_outra_empresa", { p_pedido: p.id, p_dados: { motivo: "registro tirado" }, p_entregue: false });
    if (error) return notifyError(error);
    notify("Nota de outra empresa tirada do pedido");
    onFeito();
  }
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
      <div className="flex flex-wrap items-start gap-2">
        <FileCheck2 size={18} className="mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 basis-60">
          <b>Faturado com a NF {p.nf_outra_numero} de {p.nf_outra_empresa}</b>{p.nf_outra_data && <> em {dataBR(p.nf_outra_data)}</>}
          {p.nf_outra_valor != null && <> · {brl(p.nf_outra_valor)}</>}
          <span className="block text-xs">
            {[p.nf_outra_cnpj ? `CNPJ ${cnpjBR(p.nf_outra_cnpj)}` : null, p.nf_outra_chave ? `chave ${p.nf_outra_chave}` : null, p.nf_outra_motivo].filter(Boolean).join(" · ")}
          </span>
          <span className="mt-1 block text-xs">A nota foi emitida fora do ERP: a receita e os impostos são de quem emitiu. Confirmar com o contador o acerto entre as empresas.</span>
        </div>
        {podeEditar && (
          <span className="flex shrink-0 gap-1">
            <Button type="button" variant="secondary" onClick={onAlterar}><Pencil size={14} /> Alterar</Button>
            <Button type="button" variant="ghost" onClick={tirar}><Undo2 size={14} /> Tirar</Button>
          </span>
        )}
      </div>
    </div>
  );
}

/** Janela para registrar (ou alterar) a nota de outra empresa. */
export function NfOutraModal({ p, onClose, onFeito }: { p: PedidoNf; onClose: () => void; onFeito: () => void }) {
  const { data: partes = [] } = useRows<Parte>("partes_relacionadas", { order: "nome", ascending: true });
  const empresas = partes.filter((x) => x.tipo === "empresa" && x.ativo !== false);
  const [f, setF] = useState({
    empresa: p.nf_outra_empresa ?? "", cnpj: p.nf_outra_cnpj ?? "", numero: p.nf_outra_numero ?? "", data: p.nf_outra_data ?? "",
    chave: p.nf_outra_chave ?? "", valor: String(p.nf_outra_valor ?? p.valor_total ?? "").replace(".", ","),
    motivo: p.nf_outra_motivo ?? "A unidade não tinha como emitir a nota naquela hora", entregue: true,
  });
  const [ocupado, setOcupado] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const daChave = dadosDaChave(f.chave);
  // empresa escolhida da lista: traz o CNPJ; chave colada: traz CNPJ e número
  function escolherEmpresa(nome: string) {
    const e = empresas.find((x) => x.nome === nome);
    setF((x) => ({ ...x, empresa: nome, cnpj: e?.documentos?.find((d) => String(d).replace(/\D/g, "").length === 14)?.replace(/\D/g, "") ?? x.cnpj }));
  }
  function colarChave(v: string) {
    const d = dadosDaChave(v);
    setF((x) => ({
      ...x, chave: v, cnpj: d?.cnpj ?? x.cnpj, numero: d?.numero ?? x.numero,
      empresa: x.empresa || (d ? empresas.find((e) => (e.documentos ?? []).some((doc) => String(doc).replace(/\D/g, "") === d.cnpj))?.nome ?? "" : ""),
    }));
  }
  async function enviar(e: FormEvent) {
    e.preventDefault();
    const chave = f.chave.replace(/\D/g, "");
    if (chave && chave.length !== 44) return notifyError(new Error("A chave de acesso tem 44 números (ou deixe em branco)."));
    setOcupado(true);
    const { error } = await supabase.rpc("registrar_nf_outra_empresa", {
      p_pedido: p.id,
      p_dados: { empresa: f.empresa.trim(), cnpj: f.cnpj.replace(/\D/g, ""), numero: f.numero.trim(), data: f.data, chave, valor: numeroBR(f.valor) ?? "", motivo: f.motivo.trim() },
      p_entregue: f.entregue,
    });
    setOcupado(false);
    if (error) return notifyError(error);
    notify(f.entregue ? `Pedido #${p.numero} entregue com a NF ${f.numero} de ${f.empresa}` : `Pedido #${p.numero} faturado com a NF ${f.numero} de ${f.empresa}`);
    onFeito();
  }
  return (
    <Modal open onClose={onClose} title={`NF de outra empresa · pedido #${p.numero}`}>
      <form onSubmit={enviar} className="space-y-3">
        <p className="text-sm text-slate-600">
          Use quando a venda saiu com a nota de outra empresa (por exemplo, a empresa ligada emitiu porque a unidade não tinha como emitir).
          O ERP não emite NF-e para este pedido; ele sai de "falta a nota" e a máquina entra na ficha do cliente com a data da nota.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Chave de acesso (opcional, 44 números)" className="sm:col-span-2">
            <input className="input" inputMode="numeric" value={f.chave} onChange={(e) => colarChave(e.target.value)} placeholder="Cole a chave: CNPJ e número vêm sozinhos" />
          </Field>
          {daChave && <p className="-mt-1 text-xs text-emerald-700 sm:col-span-2">Da chave: CNPJ {cnpjBR(daChave.cnpj)}, série {daChave.serie}, NF {daChave.numero}, emitida em {daChave.mes.split("-").reverse().join("/")}.</p>}
          <Field label="Empresa que emitiu a nota">
            <input className="input" list="empresas-ligadas" value={f.empresa} onChange={(e) => escolherEmpresa(e.target.value)} required minLength={2} maxLength={120} placeholder="Ex.: a empresa ligada" />
            <datalist id="empresas-ligadas">{empresas.map((x) => <option key={x.id} value={x.nome} />)}</datalist>
          </Field>
          <Field label="CNPJ de quem emitiu"><input className="input" inputMode="numeric" value={f.cnpj} onChange={(e) => set("cnpj", e.target.value)} maxLength={18} placeholder="opcional" /></Field>
          <Field label="Nº da NF"><input className="input" value={f.numero} onChange={(e) => set("numero", e.target.value)} required maxLength={20} /></Field>
          <Field label="Data de emissão"><input className="input" type="date" value={f.data} max={hoje()} onChange={(e) => set("data", e.target.value)} required /></Field>
          <Field label="Valor da nota (R$)"><input className="input" inputMode="decimal" value={f.valor} onChange={(e) => set("valor", e.target.value)} /></Field>
          <Field label="Motivo"><input className="input" value={f.motivo} onChange={(e) => set("motivo", e.target.value)} maxLength={300} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.entregue} onChange={(e) => set("entregue", e.target.checked)} /> Já foi entregue ao cliente (o pedido vai para Entregues; sem marcar, fica em Faturados)
        </label>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">A receita e os impostos desta venda são de quem emitiu a nota. O Analista fiscal mostra estes pedidos para conferir com o contador.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={ocupado}><FileCheck2 size={16} /> Registrar a nota</Button>
        </div>
      </form>
    </Modal>
  );
}
