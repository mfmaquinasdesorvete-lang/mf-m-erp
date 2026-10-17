// Configurações → Pedidos e expedição: painel da expedição, o que o ERP faz sozinho na venda, etiquetas e a
// impressora Zebra (teste de impressão pelo driver ou direto pelo Zebra Browser Print, calibragem e escurecimento).
import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, ListChecks, PackageCheck, Printer, Send, Settings2, ShieldAlert, Truck } from "lucide-react";
import { Button, Indicador } from "@/components/ui";
import { useRows } from "@/lib/data";
import { notify, notifyError } from "@/lib/notify";
import { imprimirPdf } from "@/lib/imprimir";
import { comPadrao, pdfTeste, ZPL_CALIBRAR, zebraEnviar, zebraPadrao, zplTeste } from "@/lib/zebra";
import type { ImpressoraEtiqueta } from "@/lib/types";
import { BotaoSalvar, Bloco, CabecalhoSecao, Opcao, secaoPorId, useCfgPagina } from "./comum";

const CHAVES = ["nfe_automatica", "link_pagamento_ao_aprovar", "vender_sem_estoque", "etiqueta_formato", "expedicao_apos", "impressora_etiqueta",
  "risco_ativo", "risco_valor_alto", "risco_pontos_travar"];
/** Número digitado (vírgula ou ponto) ou o padrão. */
const numero = (v: unknown, padrao: number) => {
  const t = String(v ?? "").trim();
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n > 0 ? n : padrao;
};

export function ConfigPedidos() {
  const s = secaoPorId("pedidos")!;
  const { cfg, set, mudar, salvar, salvando } = useCfgPagina(CHAVES, (row) => ({
    ...row, risco_ativo: row.risco_ativo !== false, risco_valor_alto: numero(row.risco_valor_alto, 3000), risco_pontos_travar: Math.round(numero(row.risco_pontos_travar, 25)),
  }));
  const { data: exps = [] } = useRows<{ status: string; despachado_em?: string | null; created_at: string }>("expedicoes", { select: "status, despachado_em, created_at", key: ["config"] });
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;
  const conta = (st: string) => exps.filter((e) => e.status === st).length;
  const semana = Date.now() - 7 * 864e5;
  const despachados = exps.filter((e) => e.status === "despachado" && Date.parse(e.despachado_em ?? e.created_at) >= semana).length;
  const imp = comPadrao(cfg.impressora_etiqueta);
  const mudarImp = (patch: Partial<ImpressoraEtiqueta>) => mudar({ impressora_etiqueta: { ...(cfg.impressora_etiqueta ?? {}), ...patch } });

  return (
    <div className="max-w-5xl">
      <CabecalhoSecao s={s} acoes={<BotaoSalvar form="form-pedidos" salvando={salvando} />} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Para separar" valor={conta("separar")} icon={ListChecks} cor={conta("separar") ? "laranja" : "neutro"} sub="pedidos na fila" />
        <Indicador rotulo="Conferindo / embalando" valor={conta("separando") + conta("conferido")} icon={ClipboardCheck} cor="azul" sub="em andamento" />
        <Indicador rotulo="Prontos para despachar" valor={conta("embalado")} icon={PackageCheck} cor={conta("embalado") ? "verde" : "neutro"} sub="embalados" />
        <Indicador rotulo="Despachados" valor={despachados} icon={Send} cor="indigo" sub="últimos 7 dias" />
      </div>
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        <Link to="/fluxo" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"><Truck size={15} /> Fluxo de pedidos</Link>
        <Link to="/expedicao" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50"><PackageCheck size={15} /> Painel da expedição</Link>
      </div>

      <form id="form-pedidos" onSubmit={salvar} className="space-y-5">
        <Bloco titulo="Quando a venda é aprovada" descricao="O que o ERP faz sozinho depois que a venda é aprovada (no ERP, na loja virtual ou pela proposta).">
          <div className="space-y-1">
            <Opcao ligado={!!cfg.nfe_automatica} onChange={(v) => mudar({ nfe_automatica: v })}>
              <b>Emitir a NF-e automaticamente</b> (na hora pelo ERP; pedidos da loja e propostas em até 15 minutos). Se o cadastro tiver erro, a nota não sai e aparece em Compliance fiscal.
            </Opcao>
            <Opcao ligado={cfg.link_pagamento_ao_aprovar !== false} onChange={(v) => mudar({ link_pagamento_ao_aprovar: v })}>
              <b>Criar o link de pagamento</b> da venda por Pix ou cartão (InfinitePay da unidade): o pedido mostra o link pronto para mandar no WhatsApp e as parcelas são baixadas sozinhas quando o cliente paga.
            </Opcao>
            <Opcao ligado={!!cfg.vender_sem_estoque} onChange={(v) => mudar({ vender_sem_estoque: v })}>
              <b>Aprovar venda sem estoque</b> (o estoque pode ficar negativo). Desligado, a aprovação é bloqueada e mostra o que falta; produtos <i>sob encomenda</i> passam sempre.
            </Opcao>
          </div>
          <label className="mt-3 block max-w-md">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">O pedido entra na expedição</span>
            <select className="input" value={cfg.expedicao_apos ?? "nfe"} onChange={set("expedicao_apos")}>
              <option value="nfe">Quando a NF-e for autorizada</option>
              <option value="aprovacao">Logo que a venda é aprovada (separa enquanto a nota sai)</option>
            </select>
          </label>
        </Bloco>

        <Bloco titulo={<span className="flex items-center gap-2"><ShieldAlert size={18} className="text-amber-600" /> Conferência de risco antes de despachar</span>}
          descricao="Vendas pagas por cartão ou por link ganham pontos de risco (pagamento sem baixa, primeira compra, valor alto, CPF/CNPJ irregular, endereço incompleto, pedidos seguidos, cartão em muitas parcelas…). Do limite para cima, o despacho espera o financeiro aprovar dizendo o que conferiu. Vendas do Mercado Livre ficam de fora.">
          <Opcao ligado={cfg.risco_ativo !== false} onChange={(v) => mudar({ risco_ativo: v })}>
            <b>Conferir o risco antes de despachar</b> vendas por cartão ou link (o financeiro recebe o aviso quando o pedido entra na expedição).
          </Opcao>
          <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Valor alto (R$)</span>
              <input className="input" inputMode="decimal" value={cfg.risco_valor_alto ?? 3000} onChange={set("risco_valor_alto")} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Trava a partir de (pontos)</span>
              <input className="input" type="number" min={1} max={200} value={cfg.risco_pontos_travar ?? 25} onChange={set("risco_pontos_travar")} />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">Médio a partir de 25 pontos e alto a partir de 50. Só pagamento sem baixa já soma 40.</p>
        </Bloco>

        <Bloco titulo="Etiquetas" descricao="O modelo (o que aparece, avisos, rodapé, etiqueta de volume) fica em qualquer pedido: Etiquetas → Modelo das etiquetas.">
          <label className="block max-w-md">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Etiqueta de transporte</span>
            <select className="input" value={cfg.etiqueta_formato ?? "10x15"} onChange={set("etiqueta_formato")}>
              <option value="10x15">10 x 15 cm (impressora térmica, ex.: Zebra)</option>
              <option value="a4">Folha A4, 4 etiquetas por folha (impressora comum)</option>
            </select>
          </label>
        </Bloco>

        <Bloco titulo={<span className="flex items-center gap-2"><Printer size={18} className="text-brand" /> Impressora Zebra</span>}
          descricao="Configure uma vez em cada computador que imprime etiquetas. O tamanho tem que ser o mesmo do rolo.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <label className="col-span-2 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Modelo</span>
              <input className="input" placeholder="Ex.: ZD220, ZD230, GC420t" value={cfg.impressora_etiqueta?.modelo ?? ""} onChange={(e) => mudarImp({ modelo: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Resolução</span>
              <select className="input" value={imp.dpi} onChange={(e) => mudarImp({ dpi: Number(e.target.value) as 203 | 300 })}>
                <option value={203}>203 dpi</option><option value={300}>300 dpi</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Largura (mm)</span>
              <input className="input" type="number" min={25} max={120} value={imp.largura_mm} onChange={(e) => mudarImp({ largura_mm: Number(e.target.value) || 100 })} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Altura (mm)</span>
              <input className="input" type="number" min={25} max={300} value={imp.altura_mm} onChange={(e) => mudarImp({ altura_mm: Number(e.target.value) || 150 })} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Como imprimir</span>
              <select className="input" value={imp.metodo} onChange={(e) => mudarImp({ metodo: e.target.value as "pdf" | "zebra" })}>
                <option value="pdf">Pelo driver da Zebra (janela de impressão)</option>
                <option value="zebra">Direto pelo Zebra Browser Print (sem janela)</option>
              </select>
            </label>
            <label className="col-span-2 block sm:col-span-3">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Escurecimento: {imp.escurecimento} (0 claro – 30 escuro)</span>
              <input type="range" min={0} max={30} className="w-full" value={imp.escurecimento} onChange={(e) => mudarImp({ escurecimento: Number(e.target.value) })} />
            </label>
          </div>
          <TesteZebra imp={cfg.impressora_etiqueta ?? {}} empresa={cfg.nome_fantasia || cfg.razao_social || "ERP Line"} />
          <details className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
            <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-fg"><Settings2 size={15} aria-hidden /> Como deixar a Zebra pronta (uma vez em cada computador)</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600">
              <li>Instale o driver <b>ZDesigner</b> do site da Zebra (zebra.com → Suporte → o seu modelo → Drivers).</li>
              <li>No Windows, em Impressoras → Zebra → <b>Preferências de impressão</b>: papel <b>{imp.largura_mm} x {imp.altura_mm} mm</b>, orientação retrato e o escurecimento acima.</li>
              <li>Coloque o rolo e calibre (botão abaixo ou segure o botão da impressora até piscar 2 vezes).</li>
              <li>Imprima o teste em PDF: na janela, escolha a Zebra, <b>escala 100% / tamanho real</b> e <b>sem margens</b>. A borda tem que sair inteira.</li>
              <li>Para imprimir sem a janela: instale o <b>Zebra Browser Print</b> (gratuito, site da Zebra), abra, escolha a Zebra como padrão e aceite o endereço erp.myfrost.ai quando ele perguntar. Depois mude "Como imprimir" para direto.</li>
            </ol>
          </details>
        </Bloco>
      </form>
    </div>
  );
}

function TesteZebra({ imp, empresa }: { imp: ImpressoraEtiqueta; empresa: string }) {
  const [ocupado, setOcupado] = useState("");
  const [achada, setAchada] = useState<string | null>(null);
  async function direto(zpl: string, oque: string) {
    setOcupado(oque);
    try {
      const z = await zebraPadrao();
      if (!z) { setAchada(null); notify("Zebra Browser Print não encontrado neste computador: abra o programa (ou instale) e tente de novo", "erro"); return; }
      setAchada(z.impressora.name);
      await zebraEnviar(z.base, z.impressora, zpl);
      notify(`Enviado para ${z.impressora.name}`);
    } catch (e) { notifyError(e); } finally { setOcupado(""); }
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" disabled={!!ocupado} onClick={async () => { setOcupado("pdf"); try { imprimirPdf(await pdfTeste(imp, empresa)); } catch (e) { notifyError(e); } finally { setOcupado(""); } }}>
        <Printer size={15} /> Teste pelo driver (PDF)
      </Button>
      <Button type="button" variant="secondary" disabled={!!ocupado} onClick={() => direto(zplTeste(imp, empresa), "zpl")}><Printer size={15} /> Teste direto (Browser Print)</Button>
      <Button type="button" variant="ghost" disabled={!!ocupado} onClick={() => direto(ZPL_CALIBRAR, "cal")}>Calibrar rolo</Button>
      {achada && <span className="text-xs text-emerald-700">Impressora encontrada: {achada}</span>}
    </div>
  );
}
