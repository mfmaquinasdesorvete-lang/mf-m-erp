// Cadastro mínimo de cliente pelo representante: entra na carteira dele e fica marcado para a empresa conferir.
import { useState, type FormEvent } from "react";
import { Button, Field, Modal } from "@/components/ui";
import { formatarDoc, formatarTelefone } from "@/lib/mascaras";
import { errosClienteNovo, type ClienteNovo } from "@/lib/portal";
import { notify, notifyError } from "@/lib/notify";
import { rpcPortal, useAtualizarPortal } from "./dados";

const VAZIO: ClienteNovo = { nome: "", cpf_cnpj: "", municipio: "", uf: "", whatsapp: "", email: "" };

export function ClienteNovoModal({ onClose, onCriado }: { onClose: () => void; onCriado: (id: string, nome: string) => void }) {
  const [c, setC] = useState<ClienteNovo>(VAZIO);
  const [mostrarErros, setMostrarErros] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const atualizar = useAtualizarPortal();
  const erros = errosClienteNovo(c);
  const set = (k: keyof ClienteNovo) => (e: { target: { value: string } }) => setC((x) => ({ ...x, [k]: e.target.value }));
  const erro = (k: keyof ClienteNovo) => mostrarErros && erros[k] ? <span className="mt-1 block text-xs text-red-700" role="alert">{erros[k]}</span> : null;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMostrarErros(true);
    if (Object.keys(erros).length) return;
    setSalvando(true);
    try {
      const id = await rpcPortal<string>("portal_salvar_cliente", { p: { ...c, uf: c.uf.trim().toUpperCase() } });
      notify("Cliente cadastrado. A empresa vai conferir os dados.");
      atualizar();
      onCriado(id, c.nome.trim());
    } catch (err) { notifyError(err); } finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Cliente novo">
      <form onSubmit={salvar} className="space-y-3" noValidate>
        <p className="text-sm text-slate-600">Só o básico. A empresa confere o cadastro antes de faturar.</p>
        <Field label="Nome ou razão social *"><input className="input" value={c.nome} onChange={set("nome")} maxLength={120} autoComplete="off" />{erro("nome")}</Field>
        <Field label="CPF ou CNPJ *">
          <input className="input" inputMode="numeric" value={formatarDoc(c.cpf_cnpj)} onChange={(e) => setC((x) => ({ ...x, cpf_cnpj: e.target.value.replace(/\D/g, "").slice(0, 14) }))} />
          {erro("cpf_cnpj")}
        </Field>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <Field label="Cidade *"><input className="input" value={c.municipio} onChange={set("municipio")} maxLength={80} />{erro("municipio")}</Field>
          <Field label="UF *"><input className="input uppercase" value={c.uf} onChange={(e) => setC((x) => ({ ...x, uf: e.target.value.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() }))} maxLength={2} />{erro("uf")}</Field>
        </div>
        <Field label="WhatsApp *">
          <input className="input" inputMode="tel" value={formatarTelefone(c.whatsapp)} onChange={(e) => setC((x) => ({ ...x, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 13) }))} placeholder="(00) 90000-0000" />
          {erro("whatsapp")}
        </Field>
        <Field label="E-mail (opcional)"><input className="input" type="email" inputMode="email" value={c.email} onChange={set("email")} autoComplete="off" />{erro("email")}</Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={salvando}>{salvando ? "Salvando…" : "Cadastrar"}</Button>
        </div>
      </form>
    </Modal>
  );
}
