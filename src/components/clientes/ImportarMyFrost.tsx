// Clientes → Base da My Frost: lê o backup do Tiny da My Frost Máquinas (a empresa anterior), mostra o que entra
// (donos de máquina com as máquinas, quem comprou peças, técnicos) e o que fica de fora, e só grava com a confirmação
// do administrador. Ninguém recebe mensagem: as máquinas entram sem garantia da MF e sem preventiva marcada.
// Peças: as que o catálogo ainda não tem, já com "compatível com máquinas My Frost" no nome, para escolher.
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useInvalidate, useRows } from "@/lib/data";
import { notifyError } from "@/lib/notify";
import { brl, digitos, pl } from "@/lib/format";
import { lerBackupMyFrost, TAG_USADA, TIPOS_MYFROST, type LeituraLegado } from "@/lib/legadoMyFrost";
import { gruposCertos, principalDoGrupo, type Contatavel } from "@/lib/unificarClientes";

const LOTE = 100;
type Resultado = { novos: number; existentes: number; arquivados: number; maquinas: number; compras: number; pecas: number; erros: string[] };

export function ImportarMyFrost({ onClose }: { onClose: () => void }) {
  const { data: produtos = [] } = useRows<{ id: string; sku: string | null; descricao: string }>("produtos", { select: "id, sku, descricao", key: ["myfrost"] });
  const { data: clientes = [] } = useRows<Contatavel & { id_externo: string | null; arquivado_em: string | null }>("clientes", {
    select: "id, codigo, nome, cpf_cnpj, telefone, whatsapp, email, municipio, id_externo, arquivado_em", key: ["myfrost"],
  });
  const [leitura, setLeitura] = useState<LeituraLegado | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [combinado, setCombinado] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [progresso, setProgresso] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const invalidar = useInvalidate();

  async function abrir(arquivo?: File) {
    if (!arquivo) return;
    setOcupado("ler");
    try {
      const l = await lerBackupMyFrost(arquivo, produtos);
      setLeitura(l);
      // já marcadas: as peças que não se parecem com nenhuma do catálogo
      setEscolhidas(new Set(l.pecas.filter((p) => !p.parecida).map((p) => p.ref)));
    } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }

  // quem já é cliente da MF pela mesma lógica de unificar: mesmo CPF/CNPJ, ou mesmo nome com o mesmo telefone/e-mail,
  // ou mesmo nome e cidade (sem documento). Esse cliente só ganha as etiquetas, as máquinas e as compras.
  const vinculo = useMemo(() => {
    const m = new Map<string, string>();
    if (!leitura) return m;
    const erp = clientes.filter((c) => !c.arquivado_em);
    const lista: Contatavel[] = [
      ...erp.map((c) => ({ ...c, id: `e:${c.id}` })),
      ...leitura.clientes.map((c) => ({ id: `m:${c.ref}`, nome: c.nome, cpf_cnpj: c.cpf_cnpj, telefone: c.telefone, celular: c.celular, email: c.email, municipio: c.municipio })),
    ];
    for (const g of gruposCertos(lista)) {
      const doErp = g.filter((x) => x.id.startsWith("e:"));
      if (!doErp.length) continue;
      const alvo = principalDoGrupo(doErp).id.slice(2);
      for (const x of g) if (x.id.startsWith("m:")) m.set(x.id.slice(2), alvo);
    }
    return m;
  }, [leitura, clientes]);

  const resumo = useMemo(() => {
    if (!leitura) return null;
    const docs = new Set(clientes.map((c) => digitos(c.cpf_cnpj)).filter(Boolean));
    const externos = new Set(clientes.map((c) => c.id_externo).filter(Boolean));
    const ja = leitura.clientes.filter((c) => vinculo.has(c.ref) || (c.cpf_cnpj && docs.has(c.cpf_cnpj)) || externos.has(`myfrost:${c.ref}`)).length;
    const conta = (g: string) => leitura.clientes.filter((c) => c.grupo === g).length;
    return {
      ja, novos: leitura.clientes.length - ja, donos: conta("maquina"), pecas: conta("pecas"), tecnicos: conta("tecnico"),
      maquinas: leitura.clientes.reduce((s, c) => s + c.maquinas.length, 0),
      semData: leitura.clientes.reduce((s, c) => s + c.maquinas.filter((m) => !m.data).length, 0),
      compras: leitura.clientes.reduce((s, c) => s + c.compras.length, 0),
      semDoc: leitura.clientes.filter((c) => !c.cpf_cnpj).length,
      compraUsada: leitura.clientes.filter((c) => c.tags.includes(TAG_USADA)).length,
    };
  }, [leitura, clientes, vinculo]);

  async function importar() {
    if (!leitura) return;
    setOcupado("importar");
    const r: Resultado = { novos: 0, existentes: 0, arquivados: 0, maquinas: 0, compras: 0, pecas: 0, erros: [] };
    try {
      // as etiquetas aparecem com nome e cor na lista de clientes (quem já existir fica como está)
      await supabase.from("tipos_contato").upsert(TIPOS_MYFROST, { onConflict: "chave", ignoreDuplicates: true });
      const lista = leitura.clientes.map(({ grupo: _g, ...c }) => ({ ...c, cliente_id: vinculo.get(c.ref) }));
      for (let i = 0; i < lista.length; i += LOTE) {
        setProgresso(`Clientes ${Math.min(i + LOTE, lista.length)} de ${lista.length}…`);
        const { data, error } = await supabase.rpc("importar_legado_myfrost", { p_clientes: lista.slice(i, i + LOTE) });
        if (error) throw error;
        r.novos += data?.novos ?? 0; r.existentes += data?.existentes ?? 0; r.arquivados += data?.arquivados ?? 0;
        r.maquinas += data?.maquinas ?? 0; r.compras += data?.compras ?? 0;
        r.erros.push(...((data?.erros ?? []) as { cliente: string; erro: string }[]).map((x) => `${x.cliente}: ${x.erro}`));
      }
      const pecas = leitura.pecas.filter((p) => escolhidas.has(p.ref))
        .map(({ vendas: _v, ultima_venda: _u, parecida: _p, ...p }) => p);
      if (pecas.length) {
        setProgresso(`Peças (${pecas.length})…`);
        const { data, error } = await supabase.rpc("importar_pecas_myfrost", { p_pecas: pecas });
        if (error) throw error;
        r.pecas = data?.novas ?? 0;
        r.erros.push(...((data?.erros ?? []) as { peca: string; erro: string }[]).map((x) => `${x.peca}: ${x.erro}`));
      }
      setResultado(r);
    } catch (e) {
      notifyError(e);
      if (r.novos || r.existentes) setResultado(r); // o que já entrou fica (importar de novo não duplica)
    } finally {
      setOcupado("");
      setProgresso("");
      invalidar("clientes", "equipamentos", "produtos", "tipos_contato", "ficha_cliente");
    }
  }

  if (resultado) {
    return (
      <Modal open onClose={onClose} title="Base da My Frost importada">
        <div className="space-y-3 text-[15px]">
          <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 size={22} /> Pronto.</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            <li>{resultado.novos} clientes novos (etiqueta "My Frost (histórico)")</li>
            <li>{resultado.existentes} já eram clientes da MF: só ganharam a etiqueta, as máquinas e as compras</li>
            <li>{resultado.maquinas} máquinas em Garantias e preventivas (sem garantia da MF)</li>
            <li>{resultado.compras} compras de peças na ficha dos clientes</li>
            {resultado.pecas > 0 && <li>{resultado.pecas} peças novas no cadastro de produtos (confira preço e NCM)</li>}
            {resultado.arquivados > 0 && <li className="text-amber-700">{resultado.arquivados} estavam arquivados (fora da lista de clientes): as máquinas ficaram no cadastro arquivado</li>}
          </ul>
          {resultado.erros.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <b>{resultado.erros.length} não entraram:</b>
              <ul className="mt-1 list-disc pl-5">{resultado.erros.slice(0, 8).map((e) => <li key={e} className="[overflow-wrap:anywhere]">{e}</li>)}</ul>
            </div>
          )}
          <p className="text-sm text-slate-500">Nenhuma mensagem foi enviada aos clientes. Importar o mesmo arquivo de novo não duplica.</p>
          <div className="flex justify-end"><Button onClick={onClose}>Fechar</Button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Base da My Frost (empresa anterior)" wide>
      {!leitura || !resumo ? (
        <div className="space-y-4">
          <p className="text-[15px] text-slate-700">
            Escolha o backup do Tiny da My Frost (a planilha com as abas <b>Contatos</b>, <b>Pedidos_venda_itens</b>, <b>Propostas</b> e <b>Produtos</b>).
            Nada é gravado antes da sua confirmação na próxima tela.
          </p>
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-brand ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
            <FileSpreadsheet size={36} className="text-brand" />
            <span className="font-semibold">{ocupado ? "Lendo o backup…" : "Escolher o backup (.xlsx)"}</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => abrir(e.target.files?.[0])} />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([["Clientes", leitura.clientes.length], ["Já são da MF", resumo.ja], ["Máquinas", resumo.maquinas], ["Compras de peças", resumo.compras]] as const).map(([r, v]) => (
              <div key={r} className="rounded-xl border border-slate-200 p-3"><div className="num text-2xl font-bold text-fg">{v}</div><div className="text-xs text-slate-500">{r}</div></div>
            ))}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>{resumo.donos} donos de máquina, {resumo.pecas} que só compraram peças e {resumo.tecnicos} técnicos. {resumo.novos} são novos no ERP.</li>
            <li>Máquinas por modelo: {leitura.maquinasPorModelo.map(([m, n]) => `${m} (${n})`).join(", ")}.</li>
            <li>As máquinas vêm dos pedidos entregues ou faturados, das propostas concluídas e das etiquetas de modelo do cadastro.
              {resumo.semData > 0 && ` ${resumo.semData} só tinham a etiqueta: entram sem data da venda.`}</li>
            {leitura.unificados > 0 && <li>{leitura.unificados} contatos repetidos no Tiny viraram um cadastro só (mesmo CPF/CNPJ, ou mesmo nome com o mesmo telefone ou e-mail, ou mesmo nome e cidade sem documento).</li>}
            <li>Quem já é cliente da MF (pela mesma lógica) não tem o cadastro alterado: só ganha a etiqueta, as máquinas e as compras.</li>
            {leitura.usadas > 0 && <li>{leitura.usadas} máquinas usadas (seminovas). {resumo.compraUsada} clientes entram no cadastro <b>Compra máquina usada</b>.</li>}
            {resumo.semDoc > 0 && <li className="text-amber-700">{resumo.semDoc} sem CPF/CNPJ: entram pelo nome. Complete antes de emitir nota.</li>}
            <li className="text-slate-500">Fica de fora: {leitura.foraDaImportacao.map((x) => `${x.quantidade} ${x.rotulo}`).join(", ")}. Valores de venda também não entram.</li>
          </ul>
          <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
            Nenhuma mensagem é enviada aos clientes. As máquinas entram sem garantia da MF e sem preventiva marcada: o contato é feito por vocês, quando quiserem.
            A MF é uma empresa diferente da My Frost: nas OS dessas máquinas sai o aviso de que a MF responde só pelo serviço e pelas peças que fornecer.
          </p>

          {leitura.pecas.length > 0 && (
            <div className="rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
                <div>
                  <div className="font-semibold">Peças que o catálogo ainda não tem ({escolhidas.size} de {leitura.pecas.length} marcadas)</div>
                  <div className="text-xs text-slate-500">Entram com "compatível com máquinas My Frost" no nome. As parecidas com alguma do catálogo vêm desmarcadas.</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEscolhidas(new Set(leitura.pecas.map((p) => p.ref)))}>Todas</Button>
                  <Button variant="secondary" onClick={() => setEscolhidas(new Set())}>Nenhuma</Button>
                </div>
              </div>
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm">
                {leitura.pecas.map((p) => (
                  <li key={p.ref}>
                    <label className="flex cursor-pointer items-start gap-2 p-2.5 hover:bg-slate-50">
                      <input type="checkbox" className="mt-1" checked={escolhidas.has(p.ref)}
                        onChange={(e) => setEscolhidas((s) => { const n = new Set(s); if (e.target.checked) n.add(p.ref); else n.delete(p.ref); return n; })} />
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                        <span className="font-medium">{p.descricao}</span>
                        <span className="block text-xs text-slate-500">
                          {[p.sku && `código ${p.sku}`, p.vendas ? `${p.vendas} ${pl(p.vendas, "venda", "vendas")}` : "", p.preco_venda ? brl(p.preco_venda) : "", !p.ncm && "sem NCM"].filter(Boolean).join(" · ")}
                        </span>
                        {p.parecida && <span className="block text-xs text-amber-700">Parecida com: {p.parecida}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" className="mt-0.5" checked={combinado} onChange={(e) => setCombinado(e.target.checked)} />
            <span><AlertTriangle size={15} className="mr-1 inline" aria-hidden />
              Os dados são da My Frost Máquinas. Confirmo que o uso pela MF para assistência e venda de peças foi combinado com o advogado.</span>
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {progresso && <span className="text-sm text-slate-500">{progresso}</span>}
            <Button variant="secondary" onClick={() => setLeitura(null)} disabled={!!ocupado}>Outro arquivo</Button>
            <Button onClick={importar} disabled={!!ocupado || !combinado || !leitura.clientes.length}>
              {ocupado ? "Importando…" : `Importar ${leitura.clientes.length} clientes${escolhidas.size ? ` e ${escolhidas.size} peças` : ""}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
