// Etiqueta da revisão (fluxo de aprovação antes do contador) nas listas de contas: tocar abre Aprovações.
import { Link } from "react-router-dom";
import { COR_TOM, etapaConta, type ContaRevisao, type Pendencia } from "@/lib/aprovacao";

export function ChipRevisao({ conta, pend, link = true }: { conta: ContaRevisao; pend?: Pendencia[]; link?: boolean }) {
  if (!conta.revisao || conta.revisao === "historico") return null;
  const e = etapaConta(conta, pend);
  const classe = `inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_TOM[e.tom]}`;
  if (!link) return <span title={e.dica} className={classe}>{e.texto}</span>;
  return <Link to="/aprovacoes" title={e.dica ? `${e.dica} · abrir Aprovações` : "Abrir Aprovações"} className={`${classe} hover:brightness-95`}>{e.texto}</Link>;
}
