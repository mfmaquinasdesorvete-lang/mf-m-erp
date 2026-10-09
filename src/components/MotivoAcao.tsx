// Janela que pede o motivo antes de uma ação que fica no histórico (editar pedido aprovado, reabrir, excluir nota…).
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Modal } from "./ui";
import { notifyError } from "@/lib/notify";

export function MotivoAcao({ titulo, children, rotulo = "Confirmar", perigo, minimo = 5, campo = "Motivo (fica no histórico)", onConfirmar, onClose }: {
  titulo: string; children?: ReactNode; rotulo?: string; perigo?: boolean; minimo?: number; campo?: string;
  onConfirmar: (motivo: string) => Promise<unknown>; onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const ok = motivo.trim().length >= minimo;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setOcupado(true);
    try {
      await onConfirmar(motivo.trim());
      onClose();
    } catch (err) {
      notifyError(err);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={titulo}>
      <form onSubmit={enviar} className="space-y-3">
        {children && <div className="space-y-2 text-sm text-slate-600">{children}</div>}
        <Field label={campo}>
          <textarea className="input min-h-[5rem]" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: vendedor não tinha sido informado" />
        </Field>
        {motivo.trim().length > 0 && !ok && <p className="text-xs text-amber-700">Escreva pelo menos {minimo} letras.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Voltar</Button>
          <Button disabled={!ok || ocupado} variant={perigo ? "danger" : "primary"}>{rotulo}</Button>
        </div>
      </form>
    </Modal>
  );
}
