import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { brl, dataBR } from "@/lib/format";

export type LinhaAuditoria = {
  id: number; tabela: string; registro_id: string | null; acao: "insert" | "update" | "delete"; usuario_nome: string | null;
  campos: string[] | null; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null;
  motivo: string | null; origem: "usuario" | "sistema"; created_at: string;
};

export const ROTULO_CAMPO: Record<string, string> = {
  valor: "valor", vencimento: "vencimento", status: "situação", data_pagamento: "data do pagamento", valor_pago: "valor pago",
  descricao: "descrição", categoria: "categoria", fornecedor_id: "fornecedor", cliente_id: "cliente", documento: "documento",
  conta_bancaria_id: "conta bancária", forma_pagamento: "forma de pagamento", observacoes: "observações", nome: "nome",
  cnpj: "CNPJ", cpf_cnpj: "CPF/CNPJ", email: "e-mail", telefone: "telefone", whatsapp: "WhatsApp", papel: "papel", ativo: "ativo",
  desconto: "desconto", parcelas: "parcelas", preco_venda: "preço de venda", preco_custo: "custo", percentual: "percentual",
  saldo_inicial: "saldo inicial", conta_receber_id: "conta a receber", conta_pagar_id: "conta a pagar", situacao: "situação",
  responsavel: "responsável", prazo: "prazo", impacto: "impacto", observacao: "observação", inscricao_estadual: "IE",
};
const DINHEIRO = ["valor", "valor_pago", "desconto", "preco_venda", "preco_custo", "saldo_inicial", "valor_total", "frete"];
const DATA = ["vencimento", "data_pagamento", "prazo", "data"];

export function valorCampo(campo: string, v: unknown): string {
  if (v == null || v === "") return "vazio";
  if (DINHEIRO.includes(campo)) return brl(Number(v));
  if (DATA.includes(campo)) return dataBR(String(v));
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  const s = String(v);
  return /^[0-9a-f-]{36}$/.test(s) ? "(registro)" : s.length > 80 ? s.slice(0, 80) + "…" : s;
}

export function DescricaoMudanca({ l }: { l: LinhaAuditoria }) {
  if (l.acao === "insert") return <span>criou o registro</span>;
  if (l.acao === "delete") return <span className="text-red-600">excluiu o registro</span>;
  return (
    <span>
      {(l.campos ?? []).filter((c) => !["conciliado_em", "conciliado_por", "baixou_conta", "updated_at", "atualizado_por"].includes(c)).map((c, i) => (
        <span key={c}>{i > 0 && "; "}<b>{ROTULO_CAMPO[c] ?? c.replace(/_/g, " ")}</b>: {valorCampo(c, l.antes?.[c])} → {valorCampo(c, l.depois?.[c])}</span>
      ))}
    </span>
  );
}

/** Quem mudou o quê neste registro (fica no rodapé das fichas). */
export function Historico({ tabela, id }: { tabela: string; id?: string | null }) {
  const [aberto, setAberto] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["auditoria", tabela, id],
    enabled: aberto && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("auditoria").select("*").eq("tabela", tabela).eq("registro_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as LinhaAuditoria[];
    },
  });
  if (!id) return null;
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <button type="button" onClick={() => setAberto(!aberto)} className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-fg">
        <History size={15} /> Histórico de alterações {aberto ? "▴" : "▾"}
      </button>
      {aberto && (
        <ul className="mt-2 space-y-2 text-sm">
          {isLoading && <li className="text-slate-500">Carregando…</li>}
          {!isLoading && !data.length && <li className="text-slate-500">Nenhuma alteração registrada.</li>}
          {data.map((l) => (
            <li key={l.id} className="border-l-2 border-slate-200 pl-3">
              <div className="text-xs text-slate-500">
                {new Date(l.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {l.usuario_nome ?? "sistema"}
                {l.origem === "sistema" && " (automático)"}
              </div>
              <div className="text-slate-700"><DescricaoMudanca l={l} /></div>
              {l.motivo && <div className="text-xs text-amber-700">Motivo: {l.motivo}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
