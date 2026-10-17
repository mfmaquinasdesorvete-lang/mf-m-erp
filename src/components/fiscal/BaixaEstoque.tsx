// Baixa de estoque com motivo fiscal (modo fiscal avançado): perda, quebra, defeito de fornecedor, obsolescência,
// furto, uso interno, manutenção da fábrica, sucata e amostra. Mostra o que a lei pede para a perda virar despesa
// dedutível e grava pela função registrar_baixa_estoque (que confere o saldo e as exigências).
import { useMemo, useState } from "react";
import { AlertTriangle, Scale, Trash2 } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { ProdutoBusca } from "@/components/ProdutoBusca";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { CampoUnidade, useUnidade } from "@/lib/unidade";
import { brl } from "@/lib/format";
import { REGRAS_BAIXA, ROTULO_DEDUTIVEL, regraBaixa, type MotivoBaixa } from "@/lib/fiscalAvancado";

type ProdutoB = { id: string; descricao: string; sku?: string | null; codigo_barras?: string | null; modelo?: string | null; marca?: string | null; preco_custo?: number | null; unidade?: string | null; tipo?: string | null };
type Item = { produto: ProdutoB; quantidade: string; peso_kg: string };

export function RegistrarBaixa({ onClose, produtoInicial, motivoInicial }: { onClose: () => void; produtoInicial?: ProdutoB | null; motivoInicial?: MotivoBaixa }) {
  const { padrao, nome } = useUnidade();
  const [unidadeId, setUnidadeId] = useState<string | null>(padrao);
  const [motivo, setMotivo] = useState<MotivoBaixa>(motivoInicial ?? "quebra_fabricacao");
  const [descricao, setDescricao] = useState("");
  const [evidencia, setEvidencia] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [equipamento, setEquipamento] = useState("");
  const [itens, setItens] = useState<Item[]>(produtoInicial ? [{ produto: produtoInicial, quantidade: "1", peso_kg: "" }] : []);
  const [salvando, setSalvando] = useState(false);
  const invalidar = useInvalidate();
  const { data: produtos = [] } = useRows<ProdutoB>("produtos", { select: "id, descricao, sku, codigo_barras, modelo, marca, preco_custo, unidade, tipo, ativo", order: "descricao", ascending: true, key: ["baixa"] });
  const { data: fornecedores = [] } = useRows<{ id: string; nome: string }>("fornecedores", { select: "id, nome", order: "nome", ascending: true, key: ["baixa"] });
  const { data: saldos = [] } = useRows<{ produto_id: string; unidade_id: string; quantidade: number }>("estoque_unidade", { order: "produto_id" });
  const r = regraBaixa(motivo)!;
  const fisicos = useMemo(() => produtos.filter((p) => p.tipo !== "servico"), [produtos]);
  const saldo = (id: string) => Number(saldos.find((s) => s.produto_id === id && s.unidade_id === unidadeId)?.quantidade ?? 0);
  const total = itens.reduce((s, i) => s + Number(i.produto.preco_custo ?? 0) * (Number(i.quantidade) || 0), 0);

  async function salvar() {
    if (!unidadeId) return notify("Escolha a unidade", "erro");
    if (!itens.length) return notify("Escolha pelo menos um item", "erro");
    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc("registrar_baixa_estoque", {
        p_unidade: unidadeId, p_motivo: motivo, p_descricao: descricao,
        p_itens: itens.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade.replace(",", "."), peso_kg: i.peso_kg.replace(",", ".") || null })),
        p_evidencia: evidencia || null, p_fornecedor: fornecedor || null, p_equipamento: equipamento || null,
      });
      if (error) throw error;
      const d = data as { numero: number; valor: number };
      notify(`Baixa #${d.numero} registrada: ${brl(d.valor)} pelo custo`);
      invalidar("baixas_estoque", "produtos", "estoque_movimentos", "estoque_unidade");
      onClose();
    } catch (e) { notifyError(e); } finally { setSalvando(false); }
  }

  return (
    <Modal open onClose={onClose} title="Baixa de estoque com motivo fiscal" wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoUnidade value={unidadeId} onChange={setUnidadeId} label="Unidade" />
          <Field label="Motivo">
            <select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoBaixa)}>
              {REGRAS_BAIXA.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
            </select>
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROTULO_DEDUTIVEL[r.dedutivel].cor}`}>{ROTULO_DEDUTIVEL[r.dedutivel].label}</span>
            {r.estornaCredito && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Estorna crédito de PIS/COFINS e ICMS</span>}
          </div>
          <p className="text-slate-700">{r.ajuda}</p>
          <p className="mt-1"><b>Documento:</b> {r.documento}.</p>
          <p className="mt-1"><b>Nota fiscal:</b> {r.notaFiscal}.</p>
          <p className="mt-1 flex gap-1 text-xs text-slate-500"><Scale size={13} className="mt-0.5 shrink-0" />{r.base}.</p>
        </div>

        <Field label="O que aconteceu">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} minLength={5}
            placeholder={motivo === "quebra_fabricacao" ? "Ex.: eixo empenou no torno, lote 12" : motivo === "sucata" ? "Ex.: cavaco de inox da usinagem da semana" : "Descreva o motivo"} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {(r.exigeEvidencia || ["quebra_fabricacao", "consumo_interno", "amostra_brinde"].includes(motivo)) && (
            <Field label={r.id === "furto_extravio" ? "Boletim de ocorrência (número)" : r.exigeEvidencia ? "Laudo / fotos (número ou link)" : "Comprovante (opcional)"}>
              <input className="input" value={evidencia} onChange={(e) => setEvidencia(e.target.value)} required={r.exigeEvidencia} />
            </Field>
          )}
          {r.exigeFornecedor && (
            <Field label="Fornecedor (para a NF de devolução)">
              <select className="input" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
                <option value="">Escolha…</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Field>
          )}
          {r.exigeEquipamento && (
            <Field label="Máquina da fábrica onde foi aplicada">
              <input className="input" value={equipamento} onChange={(e) => setEquipamento(e.target.value)} placeholder="Ex.: torno CNC 1, prensa, solda MIG" />
            </Field>
          )}
        </div>

        <div>
          <ProdutoBusca produtos={fisicos} placeholder="Adicionar peça ou material (descrição, SKU, código)…"
            detalhe={(p) => `${brl(Number(p.preco_custo ?? 0))} de custo · saldo ${saldo(p.id)} em ${nome(unidadeId)}`}
            onEscolher={(p) => setItens((xs) => (xs.some((x) => x.produto.id === p.id) ? xs : [...xs, { produto: p, quantidade: "1", peso_kg: "" }]))} />
          {itens.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {itens.map((i, k) => {
                const falta = (Number(i.quantidade) || 0) > saldo(i.produto.id);
                return (
                  <li key={i.produto.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{i.produto.descricao}</div>
                      <div className={`text-xs ${falta ? "text-red-700" : "text-slate-500"}`}>
                        saldo {saldo(i.produto.id)} {i.produto.unidade ?? ""} · custo {brl(Number(i.produto.preco_custo ?? 0))}
                        {falta && <> · <AlertTriangle size={11} className="inline" /> mais que o saldo</>}
                      </div>
                    </div>
                    <input className="input w-20" inputMode="decimal" aria-label="Quantidade" value={i.quantidade}
                      onChange={(e) => setItens((xs) => xs.map((x, j) => (j === k ? { ...x, quantidade: e.target.value } : x)))} />
                    {r.pedePeso && (
                      <input className="input w-24" inputMode="decimal" aria-label="Peso em kg" placeholder="kg" value={i.peso_kg}
                        onChange={(e) => setItens((xs) => xs.map((x, j) => (j === k ? { ...x, peso_kg: e.target.value } : x)))} />
                    )}
                    <Button variant="ghost" aria-label="Tirar item" onClick={() => setItens((xs) => xs.filter((_, j) => j !== k))}><Trash2 size={15} /></Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-600">Valor pelo custo: <b>{brl(total)}</b></span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || !itens.length || descricao.trim().length < 5}>{salvando ? "Gravando…" : "Registrar baixa"}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
