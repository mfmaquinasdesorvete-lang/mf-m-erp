// Enviar pelos Correios a partir do cadastro do cliente: escolhe de qual unidade sai, os itens e o peso, e gera
// a declaração de conteúdo no modelo dos Correios (sem NF) ou só a etiqueta com o nº da NF (com NF). Nada é gravado.
import { useState } from "react";
import { AlertTriangle, FileText, Plus, Trash2 } from "lucide-react";
import { Button, Field, Modal, chip } from "@/components/ui";
import { PdfViewer } from "@/components/PdfViewer";
import { useUnidade } from "@/lib/unidade";
import { notifyError } from "@/lib/notify";
import { brl } from "@/lib/format";
import { enderecoDaUnidade, enderecoDoCliente, pendenciasEnvio, totaisDeclaracao, type ItemDeclaracao } from "@/lib/correios";

type ClienteEnvio = Parameters<typeof enderecoDoCliente>[0];
const numero = (t: string) => Number(String(t).replace(/\./g, "").replace(",", ".")) || 0;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function EnvioCorreios({ cliente, onClose }: { cliente: ClienteEnvio; onClose: () => void }) {
  const { unidades, padrao } = useUnidade();
  const ativas = unidades.filter((u) => u.ativo !== false);
  const [unidadeId, setUnidadeId] = useState(padrao ?? ativas[0]?.id ?? "");
  const [comNota, setComNota] = useState(true);
  const [nf, setNf] = useState("");
  const [itens, setItens] = useState<{ conteudo: string; quantidade: string; valor: string }[]>([{ conteudo: "", quantidade: "1", valor: "" }]);
  const [peso, setPeso] = useState("");
  const [dispensa, setDispensa] = useState(false);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [gerando, setGerando] = useState(false);

  const unidade = ativas.find((u) => u.id === unidadeId);
  const remetente = unidade ? enderecoDaUnidade(unidade) : null;
  const destinatario = enderecoDoCliente(cliente);
  const lista: ItemDeclaracao[] = itens.map((i) => ({ conteudo: i.conteudo, quantidade: numero(i.quantidade), valor: numero(i.valor) }));
  const tot = totaisDeclaracao(lista);
  const pend = remetente ? pendenciasEnvio({ remetente, destinatario, itens: lista, notaFiscal: comNota ? nf.trim() || null : null }) : ["unidade que envia"];
  const falta = [...pend, ...(comNota && !nf.trim() ? ["número da NF"] : []), ...(!comNota && !dispensa ? ["confirmar que o envio está dispensado de NF"] : [])];

  async function gerar() {
    if (!remetente) return;
    setGerando(true);
    try {
      const { pdfEnvioCorreios } = await import("@/lib/pdf");
      const hoje = new Date();
      setPdf(await pdfEnvioCorreios({
        remetente, destinatario, itens: lista, pesoKg: numero(peso) || null, notaFiscal: comNota ? nf.trim() : null,
        cidadeData: `${remetente.municipio ?? ""}, ${hoje.getDate()} de ${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`,
      }));
    } catch (e) { notifyError(e); } finally { setGerando(false); }
  }

  if (pdf) return <PdfViewer blob={pdf} nome={`correios-${destinatario.nome.split(" ")[0].toLowerCase()}.pdf`} titulo="Envio pelos Correios" onClose={() => setPdf(null)} />;

  return (
    <Modal open onClose={onClose} title="Enviar pelos Correios">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sai de qual unidade">
            <select className="input" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
              {ativas.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.municipio ? ` · ${u.municipio}/${u.uf}` : ""}</option>)}
            </select>
          </Field>
          <div className="rounded-xl border border-slate-200 p-2 text-xs text-slate-600">
            <b className="text-fg">Para:</b> {destinatario.nome}<br />
            {[destinatario.logradouro, destinatario.numero].filter(Boolean).join(", ")} {destinatario.municipio && `· ${destinatario.municipio}/${destinatario.uf}`} {destinatario.cep && `· CEP ${destinatario.cep}`}
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Vai com nota fiscal?">
          {[[true, "Com nota fiscal"], [false, "Sem nota (declaração de conteúdo)"]].map(([v, rot]) => (
            <button key={String(v)} type="button" role="radio" aria-checked={comNota === v} onClick={() => setComNota(v as boolean)}
              className={chip(comNota === v)}>{rot as string}</button>
          ))}
        </div>

        {comNota ? (
          <Field label="Nº da NF que vai junto"><input className="input" inputMode="numeric" value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Ex.: 612" /></Field>
        ) : (
          <>
            <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>Quem assina a declaração afirma <b>não ser contribuinte</b> ou estar <b>dispensado de NF</b>. Venda, remessa para conserto e envio em garantia
                da MF pedem nota fiscal. Use a declaração só quando o contador confirmar que o envio dispensa NF.</span>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={dispensa} onChange={(e) => setDispensa(e.target.checked)} />
              Este envio está dispensado de nota fiscal (confirmado com o contador)
            </label>
          </>
        )}

        <div>
          <p className="mb-1 text-sm font-semibold">O que vai na caixa {comNota && <span className="font-normal text-slate-500">(opcional com NF)</span>}</p>
          <ul className="space-y-2">
            {itens.map((i, k) => (
              <li key={k} className="grid grid-cols-[4.5rem_1fr_auto] items-end gap-2 sm:grid-cols-[1fr_4.5rem_6.5rem_auto]">
                <input className="input col-span-3 sm:col-span-1" aria-label={`Conteúdo do item ${k + 1}`} placeholder="Ex.: Pá batedora" value={i.conteudo}
                  onChange={(e) => setItens((l) => l.map((x, j) => (j === k ? { ...x, conteudo: e.target.value } : x)))} />
                <input className="input" inputMode="decimal" aria-label="Quantidade" value={i.quantidade}
                  onChange={(e) => setItens((l) => l.map((x, j) => (j === k ? { ...x, quantidade: e.target.value } : x)))} />
                <input className="input" inputMode="decimal" aria-label="Valor unitário (R$)" placeholder="R$ un." value={i.valor}
                  onChange={(e) => setItens((l) => l.map((x, j) => (j === k ? { ...x, valor: e.target.value } : x)))} />
                <button type="button" className="botao-icone-perigo p-2 disabled:opacity-30" aria-label="Tirar item" disabled={itens.length === 1}
                  onClick={() => setItens((l) => l.filter((_, j) => j !== k))}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setItens((l) => [...l, { conteudo: "", quantidade: "1", valor: "" }])}><Plus size={16} /> Item</Button>
            <span className="text-sm text-slate-600">{tot.quantidade} {tot.quantidade === 1 ? "item" : "itens"} · <b>{brl(tot.valor)}</b></span>
          </div>
        </div>

        <Field label="Peso total (kg)"><input className="input w-32" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="Ex.: 1,5" /></Field>

        {falta.length > 0 && <p className="text-sm text-amber-700">Falta: {falta.join(", ")}.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Fechar</Button>
          <Button type="button" disabled={falta.length > 0 || gerando} onClick={gerar}>
            <FileText size={16} /> {gerando ? "Gerando…" : comNota ? "Gerar etiqueta" : "Gerar declaração e etiqueta"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
