// Vendas → Propostas do Tiny → Importar: lê a planilha de propostas exportada do Tiny (.xls/.xlsx/.csv, um ou vários
// arquivos) ou o backup da My Frost, mostra o que entra e só grava com a confirmação do administrador.
// MF: com valores, desconto, frete e condições; quem não é cliente vira cadastro. My Frost (empresa anterior): sem
// valores e só de quem já é cliente do ERP (o banco confere as duas regras de novo).
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notifyError } from "@/lib/notify";
import { brl, digitos } from "@/lib/format";
import { useUnidade } from "@/lib/unidade";
import { EMPRESA_PROPOSTA, grupoSituacao, lerPropostasTiny, paraEnvio, subtotalProposta, type EmpresaProposta, type LeituraPropostas } from "@/lib/propostasTiny";

const LOTE = 200;
type Resultado = { novas: number; atualizadas: number; clientes_novos: number; sem_cliente: number; erros: string[] };

export function ImportarPropostasTiny({ onClose }: { onClose: () => void }) {
  const { unidades, padrao } = useUnidade();
  const { data: clientes = [] } = useRows<{ id: string; cpf_cnpj: string | null; id_externo: string | null }>("clientes", {
    select: "id, cpf_cnpj, id_externo", key: ["propostas_tiny"],
  });
  const [leitura, setLeitura] = useState<LeituraPropostas | null>(null);
  const [empresa, setEmpresa] = useState<EmpresaProposta | "">("");
  const [unidade, setUnidade] = useState<string>("");
  const [combinado, setCombinado] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [progresso, setProgresso] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const invalidar = useInvalidate();

  async function abrir(lista?: FileList | null) {
    if (!lista?.length) return;
    setOcupado("ler");
    try {
      const l = await lerPropostasTiny([...lista]);
      if (!l.propostas.length) throw new Error("Nenhuma proposta encontrada no arquivo.");
      setLeitura(l);
      // o backup é da My Frost; as planilhas avulsas a pessoa escolhe
      setEmpresa(l.doBackup ? "my_frost" : "");
      setUnidade(unidades.find((u) => /\bSC\b|matriz/i.test(u.nome))?.id ?? padrao ?? "");
    } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }

  const resumo = useMemo(() => {
    if (!leitura) return null;
    const docs = new Set(clientes.map((c) => digitos(c.cpf_cnpj)).filter((d) => d.length >= 11));
    const externos = new Set(clientes.map((c) => c.id_externo).filter(Boolean));
    const ehCliente = (contato: string, doc: string) =>
      (doc.length >= 11 && docs.has(doc)) || (!!contato && externos.has(empresa === "my_frost" ? `myfrost:${contato}` : contato));
    const ps = leitura.propostas;
    const com = ps.filter((p) => ehCliente(p.contato_id, p.cpf_cnpj)).length;
    const datas = ps.map((p) => p.data).filter(Boolean).sort() as string[];
    const sit = new Map<string, number>();
    for (const p of ps) sit.set(p.situacao || "sem situação", (sit.get(p.situacao || "sem situação") ?? 0) + 1);
    return {
      total: ps.length, itens: ps.reduce((s, p) => s + p.itens.length, 0), com, sem: ps.length - com,
      de: datas[0], ate: datas[datas.length - 1], situacoes: [...sit.entries()].sort((a, b) => b[1] - a[1]),
      fechadas: ps.filter((p) => grupoSituacao(p.situacao) === "fechada").length,
      valorFechadas: ps.filter((p) => grupoSituacao(p.situacao) === "fechada").reduce((s, p) => s + subtotalProposta(p) - p.desconto + p.frete, 0),
    };
  }, [leitura, clientes, empresa]);

  const pronto = !!leitura && !!empresa && (empresa === "mf" || combinado) && !ocupado;

  async function importar() {
    if (!leitura || !empresa) return;
    setOcupado("importar");
    const r: Resultado = { novas: 0, atualizadas: 0, clientes_novos: 0, sem_cliente: 0, erros: [] };
    try {
      const lista = leitura.propostas.map((p) => paraEnvio(p, empresa));
      for (let i = 0; i < lista.length; i += LOTE) {
        setProgresso(`Propostas ${Math.min(i + LOTE, lista.length)} de ${lista.length}…`);
        const { data, error } = await supabase.rpc("importar_propostas_tiny", {
          p_empresa: empresa, p_propostas: lista.slice(i, i + LOTE), p_unidade: empresa === "mf" && unidade ? unidade : null,
        });
        if (error) throw error;
        r.novas += data?.novas ?? 0; r.atualizadas += data?.atualizadas ?? 0;
        r.clientes_novos += data?.clientes_novos ?? 0; r.sem_cliente += data?.sem_cliente ?? 0;
        r.erros.push(...((data?.erros ?? []) as { proposta: string; erro: string }[]).map((x) => `Proposta ${x.proposta}: ${x.erro}`));
      }
      setResultado(r);
    } catch (e) {
      notifyError(e);
      if (r.novas || r.atualizadas) setResultado(r); // o que já entrou fica (importar de novo não duplica)
    } finally {
      setOcupado("");
      setProgresso("");
      invalidar("propostas_tiny", "clientes", "ficha_cliente");
    }
  }

  if (resultado) {
    return (
      <Modal open onClose={onClose} title="Propostas do Tiny importadas">
        <div className="space-y-3 text-[15px]">
          <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={22} /> Pronto.</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            <li>{resultado.novas} propostas novas{resultado.atualizadas ? ` e ${resultado.atualizadas} atualizadas` : ""}</li>
            {resultado.clientes_novos > 0 && <li>{resultado.clientes_novos} clientes novos no cadastro (vieram da proposta)</li>}
            {resultado.sem_cliente > 0 && <li className="text-amber-700">{resultado.sem_cliente} propostas da My Frost ficaram de fora: não são de clientes do ERP</li>}
          </ul>
          {resultado.erros.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <b>{resultado.erros.length} não entraram:</b>
              <ul className="mt-1 list-disc pl-5">{resultado.erros.slice(0, 8).map((e) => <li key={e} className="[overflow-wrap:anywhere]">{e}</li>)}</ul>
            </div>
          )}
          <p className="text-sm text-slate-500">Importar o mesmo arquivo de novo não duplica: só atualiza a situação e os dados de cada proposta.</p>
          <div className="flex justify-end"><Button onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Importar propostas do Tiny" wide>
      {!leitura || !resumo ? (
        <div className="space-y-4">
          <p className="text-[15px] text-slate-700">
            No Tiny, em <b>Vendas → Propostas comerciais</b>, marque todas as propostas (de todos os períodos e situações) e use <b>Exportar</b>.
            Pode escolher vários arquivos de uma vez (.xls, .xlsx ou .csv). O backup da My Frost também serve (aba Propostas).
            Nada é gravado antes da sua confirmação na próxima tela.
          </p>
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
            <FileSpreadsheet size={36} className="text-brand" />
            <span className="font-semibold">{ocupado ? "Lendo…" : "Escolher as planilhas de propostas"}</span>
            <input type="file" multiple accept=".xls,.xlsx,.csv" className="hidden" onChange={(e) => abrir(e.target.files)} />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["Propostas", resumo.total], ["Itens", resumo.itens], ["Viraram venda", resumo.fechadas], ["De quem já é cliente", resumo.com]] as const).map(([r, v]) => (
              <div key={r} className="rounded-xl border border-slate-200 p-3"><div className="num text-2xl font-bold text-fg">{v}</div><div className="text-xs text-slate-500">{r}</div></div>
            ))}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>{leitura.arquivos.length > 1 ? `${leitura.arquivos.length} arquivos` : leitura.arquivos[0]}{resumo.de ? `, de ${resumo.de.split("-").reverse().join("/")} a ${resumo.ate?.split("-").reverse().join("/")}` : ""}.</li>
            <li>Situação no Tiny: {resumo.situacoes.map(([s, n]) => `${s} (${n})`).join(", ")}.</li>
          </ul>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-fg">De qual empresa são estas propostas?</legend>
            {(["mf", "my_frost"] as const).map((e) => (
              <label key={e} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${empresa === e ? "border-brand bg-sky-50" : "border-slate-200"}`}>
                <input type="radio" name="empresa" className="mt-1 h-4 w-4" checked={empresa === e} onChange={() => { setEmpresa(e); setCombinado(false); }} />
                <span className="text-sm">
                  <b>{EMPRESA_PROPOSTA[e]}</b>
                  <span className="block text-slate-600">{e === "mf"
                    ? "Do Tiny atual da MF. Entram com valores, desconto, frete, prazo e condições. Quem ainda não é cliente vira cadastro."
                    : "Do Tiny antigo. Entram só data, situação, vendedor e itens (sem valores, sem condições) e só de quem já é cliente do ERP."}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {empresa === "mf" && (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                {resumo.com} já são clientes do ERP; {resumo.sem} viram cadastro novo. Propostas que viraram venda: {brl(resumo.valorFechadas)}.
              </p>
              {unidades.length > 1 && (
                <label className="block max-w-xs text-sm">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Unidade</span>
                  <select className="input" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                    <option value="">—</option>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          {empresa === "my_frost" && (
            <div className="space-y-3">
              <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  A My Frost é outra empresa. As propostas dela entram só como histórico de atendimento: sem valores, sem desconto, frete
                  ou condições. {resumo.com} são de clientes do ERP e entram; {resumo.sem} ficam de fora
                  {resumo.sem > 0 ? " (importe antes a Base da My Frost, em Clientes, se o advogado liberar)" : ""}.
                </span>
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={combinado} onChange={(e) => setCombinado(e.target.checked)} />
                <span>Os dados são da My Frost Máquinas. Confirmo que o uso pela MF para assistência e venda de peças foi combinado com o advogado.</span>
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {progresso && <span className="mr-auto text-sm text-slate-500">{progresso}</span>}
            <Button variant="ghost" onClick={() => { setLeitura(null); setEmpresa(""); }} disabled={!!ocupado}>Outro arquivo</Button>
            <Button onClick={importar} disabled={!pronto}>{ocupado === "importar" ? "Importando…" : `Importar ${empresa === "my_frost" ? resumo.com : resumo.total} propostas`}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
