// Vendas → marcar → Conciliar (como no Tiny): procura no extrato do banco o Pix ou depósito de cada venda marcada,
// mostra os pares achados para conferir e concilia só os escolhidos (função conciliar_vendas do banco).
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Landmark, SearchX } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { useInvalidate } from "@/lib/data";
import { brl, dataBR, pl } from "@/lib/format";
import { notifyError } from "@/lib/notify";
import { supabase } from "@/lib/supabase";

type Par = {
  lanc: string; numero: number; cliente: string | null; valor: number; data: string; banco: string | null; descricao: string | null;
  tipo: "nova" | "conta"; nome_confere: boolean; centavos: boolean;
};
type Resultado = {
  vendas: number; ja: number; pares: Par[]; duvida: number[]; sem_par: number[]; pulados: { numero: number; motivo: string }[];
  aplicado: boolean; conciliadas: number; contas_criadas: number; erros: { numero: number; erro: string }[];
};

/** Par que já vem marcado: o nome do cliente aparece no extrato ou o valor tem centavos (valor redondo pode ser coincidência). */
export const marcadoDePadrao = (p: Pick<Par, "nome_confere" | "centavos">) => p.nome_confere || p.centavos;

export function ConciliarVendas({ ids, onClose }: { ids: string[]; onClose: (ok: boolean) => void }) {
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [feito, setFeito] = useState<Resultado | null>(null);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState(true);
  const invalidate = useInvalidate();

  useEffect(() => {
    let vivo = true;
    supabase.rpc("conciliar_vendas", { p_ids: ids, p_aplicar: false }).then(({ data, error }) => {
      if (!vivo) return;
      setOcupado(false);
      if (error) { notifyError(error); onClose(false); return; }
      const r = data as Resultado;
      setPrevia(r);
      setEscolhidos(new Set(r.pares.filter(marcadoDePadrao).map((p) => p.lanc)));
    });
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function conciliar() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("conciliar_vendas", { p_ids: ids, p_aplicar: true, p_escolhidos: [...escolhidos] });
      if (error) throw error;
      setFeito(data as Resultado);
      invalidate("pedidos", "contas_receber", "extrato_lancamentos", "auditoria");
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  const alternar = (lanc: string) => setEscolhidos((s) => { const n = new Set(s); if (n.has(lanc)) n.delete(lanc); else n.add(lanc); return n; });

  if (feito) return (
    <Modal open onClose={() => onClose(true)} title="Vendas conciliadas">
      <div className="space-y-3 text-sm">
        <p className="flex items-start gap-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
          <span><b>{feito.conciliadas}</b> {pl(feito.conciliadas, "venda conciliada", "vendas conciliadas")} com o extrato
            {feito.contas_criadas > 0 && <> · <b>{feito.contas_criadas}</b> {pl(feito.contas_criadas, "conta a receber lançada", "contas a receber lançadas")} como recebida{feito.contas_criadas > 1 ? "s" : ""}</>}.</span></p>
        {feito.erros.length > 0 && (
          <div><p className="font-semibold text-red-700">Não deu certo ({feito.erros.length}):</p>
            <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-slate-600">{feito.erros.map((x) => <li key={x.numero}>#{x.numero}: {x.erro}</li>)}</ul></div>
        )}
        <p className="text-xs text-slate-500">Para desfazer uma: Bancos e conciliação → a linha do extrato → Desfazer.</p>
        <div className="flex justify-end"><Button onClick={() => onClose(true)}>Fechar</Button></div>
      </div>
    </Modal>
  );

  const pares = previa?.pares ?? [];
  const escolhidosNaLista = pares.filter((p) => escolhidos.has(p.lanc));
  return (
    <Modal open onClose={() => onClose(false)} title="Conciliar vendas com o extrato" wide>
      {!previa ? <p className="py-8 text-center text-sm text-slate-500">Procurando o Pix ou depósito de cada venda no extrato…</p> : (
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            O ERP procura no extrato do banco da unidade uma entrada com <b>o mesmo valor</b> da venda, de 10 dias antes a 60 dias depois.
            Só entra o par certo: a venda com uma entrada só, e a entrada servindo só para ela. Confira quem pagou antes de conciliar.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Numero valor={pares.length} rotulo="pares achados" cor="text-emerald-700" />
            <Numero valor={previa.duvida.length} rotulo="em dúvida" cor="text-amber-700" dica="Mais de uma entrada com o mesmo valor, ou a entrada serve para mais de uma venda. Concilie pela tela Bancos e conciliação." />
            <Numero valor={previa.sem_par.length} rotulo="sem entrada no extrato" cor="text-slate-600" dica="Venda no cartão ou marketplace (cai com o desconto da taxa), parcelada, paga em outra conta ou extrato do mês ainda não importado." />
            <Numero valor={previa.ja} rotulo={pl(previa.ja, "já conciliada", "já conciliadas")} cor="text-sky-700" />
          </div>

          {pares.length > 0 && (<>
            <div className="flex flex-wrap items-center gap-2">
              <b>{escolhidosNaLista.length} de {pares.length} {pl(pares.length, "par marcado", "pares marcados")}</b>
              <span className="num text-slate-600">{brl(escolhidosNaLista.reduce((t, p) => t + Number(p.valor), 0))}</span>
              <button type="button" className="link-acao text-xs" onClick={() => setEscolhidos(new Set(pares.map((p) => p.lanc)))}>Marcar todos</button>
              <button type="button" className="text-xs font-semibold text-slate-600 hover:underline" onClick={() => setEscolhidos(new Set())}>Desmarcar todos</button>
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-surface text-xs text-slate-500">
                  <tr><th className="w-8 p-2" /><th className="p-2">Venda</th><th className="p-2">Cliente</th><th className="p-2">Quem pagou (extrato)</th><th className="p-2 text-right">Valor</th></tr>
                </thead>
                <tbody>
                  {pares.map((p) => (
                    <tr key={p.lanc} className="border-t border-slate-100 align-top">
                      <td className="p-2"><input type="checkbox" aria-label={`Conciliar a venda #${p.numero}`} checked={escolhidos.has(p.lanc)} onChange={() => alternar(p.lanc)} /></td>
                      <td className="whitespace-nowrap p-2 font-semibold">#{p.numero}</td>
                      <td className="min-w-0 p-2">{p.cliente ?? "—"}</td>
                      <td className="min-w-0 p-2">
                        <div className="break-words">{p.descricao ?? "—"}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1"><Landmark size={12} aria-hidden />{p.banco} · {dataBR(p.data)}</span>
                          {p.nome_confere
                            ? <span className="rounded bg-emerald-100 px-1.5 font-semibold text-emerald-800">nome confere</span>
                            : !p.centavos && <span className="rounded bg-amber-100 px-1.5 font-semibold text-amber-800" title="Valor redondo e o nome do cliente não aparece no extrato: pode ser outra pessoa pagando o mesmo valor">conferir</span>}
                          {p.tipo === "nova" && <span title="A venda não tem conta a receber: entra como recebida nesta data">lança a conta</span>}
                        </div>
                      </td>
                      <td className="num whitespace-nowrap p-2 text-right font-semibold">{brl(p.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              Ao conciliar, a venda sem conta ganha a conta a receber <b>já recebida</b> na data do extrato (sem comissão nova e sem aviso ao cliente)
              e a linha do extrato fica ligada a ela. A conta que já existia só é ligada (se estava em aberto, é baixada).
            </p>
          </>)}
          {pares.length === 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-slate-600"><SearchX size={18} className="mt-0.5 shrink-0" aria-hidden />
              Nenhum par certo no extrato para estas vendas.</p>
          )}
          {previa.duvida.length > 0 && <Lista titulo="Em dúvida" numeros={previa.duvida} />}
          {previa.sem_par.length > 0 && <Lista titulo="Sem entrada no extrato" numeros={previa.sem_par} />}
          {previa.pulados.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-slate-500"><CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
              Ficaram de fora: {previa.pulados.slice(0, 12).map((x) => `#${x.numero} (${x.motivo})`).join(", ")}{previa.pulados.length > 12 ? "…" : ""}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => onClose(false)}>Fechar</Button>
            <Button type="button" disabled={ocupado || !escolhidosNaLista.length} onClick={conciliar}>
              {ocupado ? "Conciliando…" : `Conciliar ${escolhidosNaLista.length} ${pl(escolhidosNaLista.length, "venda", "vendas")}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Numero({ valor, rotulo, cor, dica }: { valor: number; rotulo: string; cor: string; dica?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2.5" title={dica}>
      <div className={`num text-xl font-bold ${cor}`}>{valor}</div>
      <div className="text-xs text-slate-500">{rotulo}</div>
    </div>
  );
}

function Lista({ titulo, numeros }: { titulo: string; numeros: number[] }) {
  return (
    <details className="text-xs text-slate-600">
      <summary className="cursor-pointer font-semibold">{titulo} ({numeros.length})</summary>
      <p className="mt-1 break-words">{numeros.slice().sort((a, b) => a - b).map((n) => `#${n}`).join(", ")}</p>
    </details>
  );
}
