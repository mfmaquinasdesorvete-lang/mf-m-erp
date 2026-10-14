// Configurações → Apagar dados de teste (só administrador).
// Marca pedidos, OS, ordens de produção e contas avulsas; "Ver o que vai sair" mostra tudo que será apagado
// (e o estoque que volta); só apaga depois de digitar APAGAR. NF-e autorizada nunca é apagada (ver testes_apagar).
import { useState } from "react";
import { Eraser, Eye, Trash2 } from "lucide-react";
import { Button, Card } from "./ui";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";

type Linha = { id: string; numero?: number; status?: string; created_at?: string; valor_total?: number; descricao?: string; valor?: number; pedido_id?: string | null; os_id?: string | null; cliente?: { nome: string } | null };
type Previa = {
  pedidos: { numero: number; cliente: string | null; total: number; status: string }[];
  os: { numero: number; cliente: string | null; status: string }[];
  ops: { numero: number; maquina: string | null; status: string }[];
  contas: { descricao: string; valor: number; status: string }[];
  estoque_volta: { produto: string; quantidade: number }[];
  notas_reais: string[];
  notas_teste: number;
};

export function ApagarTestes() {
  const { data: pedidos = [] } = useRows<Linha>("pedidos", { select: "id, numero, status, created_at, valor_total, cliente:clientes(nome)", order: "numero", ascending: true });
  const { data: os = [] } = useRows<Linha>("ordens_servico", { select: "id, numero, status, created_at, cliente:clientes(nome)", order: "numero", ascending: true });
  const { data: ops = [] } = useRows<Linha>("ordens_producao", { select: "id, numero, status, created_at", order: "numero", ascending: true });
  const { data: contas = [] } = useRows<Linha>("contas_receber", { select: "id, descricao, valor, status, created_at, pedido_id, os_id, cliente:clientes(nome)", order: "created_at", ascending: true });
  const avulsas = contas.filter((c) => !c.pedido_id && !c.os_id);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [confirma, setConfirma] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const invalidate = useInvalidate();

  const alternar = (chave: string) => { setPrevia(null); setMarcados((m) => { const n = new Set(m); n.has(chave) ? n.delete(chave) : n.add(chave); return n; }); };
  const escolhidos = (tipo: string) => [...marcados].filter((k) => k.startsWith(tipo + ":")).map((k) => k.slice(tipo.length + 1));
  const args = () => ({
    p_pedidos: escolhidos("pedido").map(Number), p_os: escolhidos("os").map(Number), p_ops: escolhidos("op").map(Number), p_contas: escolhidos("conta"),
  });

  async function chamar(executar: boolean) {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("testes_apagar", { ...args(), p_executar: executar });
      if (error) throw error;
      if (executar) {
        notify("Dados de teste apagados");
        setMarcados(new Set()); setPrevia(null); setConfirma("");
        invalidate("pedidos", "ordens_servico", "ordens_producao", "contas_receber", "produtos", "estoque_movimentos", "notificacoes", "notas_fiscais");
      } else setPrevia(data as Previa);
    } catch (e) {
      notifyError(e);
    } finally {
      setOcupado(false);
    }
  }

  const grupo = (titulo: string, tipo: string, linhas: Linha[], rotulo: (l: Linha) => string, chave: (l: Linha) => string) => linhas.length > 0 && (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</legend>
      <div className="space-y-1">
        {linhas.map((l) => {
          const k = `${tipo}:${chave(l)}`;
          return (
            <label key={k} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${marcados.has(k) ? "border-red-300 bg-red-50" : "border-slate-200"}`}>
              <input type="checkbox" className="h-4 w-4" checked={marcados.has(k)} onChange={() => alternar(k)} />
              <span className="min-w-0 flex-1">{rotulo(l)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  const total = marcados.size;
  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Eraser size={18} aria-hidden /> Apagar dados de teste</h2>
      <p className="mb-3 text-sm text-slate-500">
        Marque o que foi teste. O ERP mostra tudo que vai sair junto (parcelas, comissões, envios, avisos) e devolve ao estoque o que o teste tirou.
        NF-e autorizada não é apagada: fica guardada, com uma observação, para a devolução com o contador.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {grupo("Pedidos", "pedido", pedidos, (l) => `#${l.numero} · ${l.cliente?.nome ?? "sem cliente"} · ${brl(l.valor_total)} · ${l.status} · ${dataBR(l.created_at)}`, (l) => String(l.numero))}
        {grupo("Ordens de serviço", "os", os, (l) => `OS #${l.numero} · ${l.cliente?.nome ?? "sem cliente"} · ${l.status} · ${dataBR(l.created_at)}`, (l) => String(l.numero))}
        {grupo("Ordens de produção (não concluídas)", "op", ops.filter((o) => o.status !== "concluida"), (l) => `OP #${l.numero} · ${l.status} · ${dataBR(l.created_at)}`, (l) => String(l.numero))}
        {grupo("Contas a receber avulsas", "conta", avulsas, (l) => `${l.descricao} · ${l.cliente?.nome ?? ""} · ${brl(l.valor)} · ${l.status}`, (l) => l.id)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" disabled={!total || ocupado} onClick={() => chamar(false)}><Eye size={16} aria-hidden /> Ver o que vai sair ({total})</Button>
      </div>
      {previa && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="region" aria-label="O que vai ser apagado">
          <p className="mb-2 font-semibold">Vai ser apagado:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {previa.pedidos.map((p) => <li key={`p${p.numero}`}>Pedido #{p.numero} · {p.cliente ?? "—"} · {brl(p.total)} ({p.status})</li>)}
            {previa.os.map((o) => <li key={`o${o.numero}`}>OS #{o.numero} · {o.cliente ?? "—"} ({o.status})</li>)}
            {previa.ops.map((o) => <li key={`op${o.numero}`}>Ordem de produção #{o.numero}{o.maquina ? ` · ${o.maquina}` : ""}</li>)}
            {previa.contas.map((c, i) => <li key={`c${i}`}>Conta: {c.descricao} · {brl(c.valor)} ({c.status})</li>)}
          </ul>
          {previa.estoque_volta.length > 0 && (
            <p className="mt-2"><b>Volta ao estoque:</b> {previa.estoque_volta.map((e) => `${Number(e.quantidade).toLocaleString("pt-BR")} × ${e.produto}`).join("; ")}</p>
          )}
          {previa.notas_reais.length > 0 && (
            <p className="mt-2 font-semibold">NF-e real nº {previa.notas_reais.join(", ")} fica guardada (não dá para apagar nota autorizada): faça a devolução com o contador.</p>
          )}
          {previa.notas_teste > 0 && <p className="mt-1">{previa.notas_teste} {pl(previa.notas_teste, "nota", "notas")} de homologação (teste da Sefaz) saem da lista.</p>}
          <label className="mt-3 block text-sm font-semibold">
            Para confirmar, digite APAGAR
            <input className="input mt-1 max-w-xs uppercase" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="off" />
          </label>
          <Button type="button" variant="danger" className="mt-3" disabled={ocupado || confirma.trim().toUpperCase() !== "APAGAR"} onClick={() => chamar(true)}>
            <Trash2 size={16} aria-hidden /> Apagar de vez
          </Button>
        </div>
      )}
    </Card>
  );
}
