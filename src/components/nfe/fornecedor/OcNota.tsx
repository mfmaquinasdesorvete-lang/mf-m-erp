// Aba "Ordem de compra" da nota de fornecedor: as OC abertas do mesmo fornecedor com os produtos da nota (sugestão
// automática), ligar e desligar, a comparação nota × OC (quantidade a mais ou a menos e preço com diferença acima
// de 2%) e a baixa das quantidades recebidas. A baixa vai junto com a entrada no estoque ou, se o estoque já
// entrou, pelo botão desta aba. A mesma nota não baixa duas vezes a mesma OC.
import { useState } from "react";
import { CheckCircle2, Link2, PackageCheck, Unlink } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { confirmar } from "@/components/Dialogos";
import { supabase } from "@/lib/supabase";
import { brl, dataBR, pl } from "@/lib/format";
import { notify, notifyError } from "@/lib/notify";
import { ordenarOcsSugeridas } from "@/lib/notaFornecedor";
import { ComparacaoOc } from "@/components/compras/ComparacaoOc";
import type { DadosNota, NotaBase } from "./useNotaFornecedor";


export function OcNota({ d, nota, podeEditar }: { d: DadosNota; nota: NotaBase; podeEditar: boolean }) {
  const [ocupado, setOcupado] = useState(false);
  const [numero, setNumero] = useState("");
  const produtosNota = d.linhas.map((l) => l.produto_id).filter(Boolean) as string[];
  const lista = ordenarOcsSugeridas(d.ocs, produtosNota);
  const outras = d.ocs.filter((o) => !o.ligada && !lista.some((x) => x.id === o.id));
  const ligadas = d.ocs.filter((o) => o.ligada);
  const pendentes = ligadas.filter((o) => !o.baixado_em);
  const { linhas, baixas } = d.comparacao;

  async function ligar(id: string, ligar: boolean, rotulo: string) {
    const pergunta = ligar ? `Ligar esta nota à ordem de compra ${rotulo}? A baixa das quantidades só acontece ao confirmar a entrada (ou pelo botão de baixa).`
      : `Desligar a nota da ordem de compra ${rotulo}?`;
    if (!(await confirmar(pergunta, { ok: ligar ? "Ligar" : "Desligar" }))) return;
    setOcupado(true);
    try {
      const { error } = await supabase.rpc("ligar_nota_oc", { p_nfe: nota.id, p_pedido: id, p_ligar: ligar });
      if (error) throw error;
      notify(ligar ? `Nota ligada à ordem de compra ${rotulo}` : `Nota desligada da ordem de compra ${rotulo}`);
      d.recarregar();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  async function ligarPeloNumero() {
    const n = Number(numero.replace(/\D/g, ""));
    if (!n) return;
    const { data, error } = await supabase.from("pedidos_compra").select("id, numero").eq("numero", n).maybeSingle();
    if (error) return notifyError(error);
    if (!data) return notifyError(new Error(`Ordem de compra #${n} não encontrada`));
    await ligar(data.id, true, `#${n}`);
    setNumero("");
  }

  async function baixar() {
    const ocs = [...new Set(baixas.map((b) => `#${b.numero}`))];
    const avisos = linhas.filter((l) => l.situacao !== "confere" || l.alerta_preco).length;
    const texto = `Dar baixa de ${baixas.length} ${pl(baixas.length, "item", "itens")} na ordem de compra ${ocs.join(", ")}? `
      + "O estoque não muda (já entrou pela nota). A mesma nota não baixa duas vezes a mesma OC."
      + (avisos ? ` Atenção: ${avisos} ${pl(avisos, "diferença", "diferenças")} entre a nota e a OC.` : "");
    if (!(await confirmar(texto, { titulo: "Baixa na ordem de compra", ok: "Dar baixa" }))) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc("baixar_oc_pela_nota", { p_nfe: nota.id, p_baixas: baixas.map((b) => ({ item_id: b.item_id, quantidade: b.quantidade })) });
      if (error) throw error;
      notify(`${Number(data ?? 0)} ${pl(data, "item baixado", "itens baixados")} na ordem de compra`);
      d.recarregar();
    } catch (e) { notifyError(e); } finally { setOcupado(false); }
  }

  if (d.ocsCarregando) return <p className="text-sm text-slate-500">Procurando as ordens de compra…</p>;
  if (d.ocsErro) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Não deu para ler as ordens de compra: {(d.ocsErro as Error).message}</p>;

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-2 text-sm font-bold text-fg">Ordens de compra {lista.some((o) => !o.ligada) && <span className="font-normal text-slate-500">· sugeridas pelo fornecedor e pelos produtos</span>}</h3>
        {!lista.length && <p className="text-sm text-slate-500">Nenhuma ordem de compra aberta deste fornecedor com os produtos da nota.</p>}
        <ul className="space-y-2">
          {lista.map((o) => (
            <li key={o.id} className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${o.ligada ? "border-modulo/40 bg-modulo/5" : "border-slate-200"}`}>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-fg">#{o.numero} <Badge value={`pc_${o.status}`} />
                  {o.baixado_em && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} /> recebida por esta nota em {dataBR(o.baixado_em)}</span>}
                </span>
                <span className="block text-xs text-slate-500">
                  {[o.fornecedor, !o.mesmo_fornecedor && "outro fornecedor", `${o.comuns} ${pl(o.comuns, "produto", "produtos")} da nota`,
                    o.previsao_entrega && `entrega ${dataBR(o.previsao_entrega)}`, brl(o.valor_total)].filter(Boolean).join(" · ")}
                </span>
              </span>
              {podeEditar && (o.ligada
                ? !o.baixado_em && <Button type="button" variant="ghost" disabled={ocupado} onClick={() => ligar(o.id, false, `#${o.numero}`)}><Unlink size={15} /> Desligar</Button>
                : <Button type="button" variant="secondary" disabled={ocupado} onClick={() => ligar(o.id, true, `#${o.numero}`)}><Link2 size={15} /> Ligar</Button>)}
            </li>
          ))}
        </ul>
        {outras.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-modulo-texto">Outras ordens abertas deste fornecedor ({outras.length})</summary>
            <ul className="mt-1 space-y-1">
              {outras.map((o) => (
                <li key={o.id} className="flex items-center gap-2">
                  <span className="flex-1">#{o.numero} · {o.itens.slice(0, 2).map((i) => i.descricao).join(", ")}{o.itens.length > 2 ? ` +${o.itens.length - 2}` : ""}</span>
                  {podeEditar && <Button type="button" variant="ghost" disabled={ocupado} onClick={() => ligar(o.id, true, `#${o.numero}`)}><Link2 size={14} /> Ligar</Button>}
                </li>
              ))}
            </ul>
          </details>
        )}
        {podeEditar && (
          <div className="mt-2 flex max-w-sm items-center gap-2">
            <input className="input" inputMode="numeric" placeholder="Nº de outra ordem de compra" value={numero} onChange={(e) => setNumero(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ligarPeloNumero(); } }} />
            <Button type="button" variant="secondary" disabled={ocupado || !numero.trim()} onClick={ligarPeloNumero}>Ligar</Button>
          </div>
        )}
      </section>

      {pendentes.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-fg">Nota × ordem de compra</h3>
          {!linhas.length && <p className="text-sm text-slate-500">Ligue os itens aos produtos para comparar.</p>}
          <ComparacaoOc linhas={linhas} />
          {podeEditar && baixas.length > 0 && (nota.estoque_lancado ? (
            <div className="mt-3 flex justify-end">
              <Button type="button" disabled={ocupado} onClick={baixar}><PackageCheck size={15} /> Dar baixa na ordem de compra</Button>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-800">A baixa na ordem de compra vai junto com “Confirmar entrada” (aba Itens e custos).</p>
          ))}
        </section>
      )}
    </div>
  );
}
