// Configurações → Orçamentos e garantia: validade, prazo de entrega, observações padrão, layout da proposta,
// garantia das máquinas e do conserto, preventiva, os prazos da OS e os textos padrão de cada documento
// (pedido, OP, OC, OS, NF-e, ficha do cliente e máquina usada).
import { useEffect, useState, type FormEvent } from "react";
import { AVISO_OUTRA_EMPRESA_PADRAO } from "@/lib/garantia";
import { TEXTOS_PADRAO, type ChaveTexto } from "@/lib/textosPadrao";
import { useUnidade } from "@/lib/unidade";
import { supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notifyError } from "@/lib/notify";
import { BotaoSalvar, Bloco, CabecalhoSecao, campo, Opcao, secaoPorId, useCfgPagina } from "./comum";

const CHAVES = ["validade_orcamento_dias", "orcamento_prazo_entrega", "orcamento_observacoes", "proposta_titulo", "proposta_cor", "proposta_fotos",
  "proposta_apresentacao", "proposta_condicoes", "proposta_rodape", "garantia_meses_padrao", "garantia_servico_dias", "preventiva_meses",
  "os_armazenagem_dias", "termo_garantia", "aviso_outra_empresa", "textos", "taxa_diagnostico_video"];
const inteiro = (v: unknown, padrao: number) => (v === "" || v == null || !Number.isFinite(Number(v)) ? padrao : Math.max(0, Math.round(Number(v))));

export function ConfigOrcamentos() {
  const s = secaoPorId("orcamentos")!;
  const { cfg, set, mudar, salvar, salvando } = useCfgPagina(CHAVES, (r) => ({
    ...r, validade_orcamento_dias: inteiro(r.validade_orcamento_dias, 7), garantia_meses_padrao: inteiro(r.garantia_meses_padrao, 12),
    garantia_servico_dias: inteiro(r.garantia_servico_dias, 90), preventiva_meses: inteiro(r.preventiva_meses, 6), os_armazenagem_dias: inteiro(r.os_armazenagem_dias, 90),
    taxa_diagnostico_video: r.taxa_diagnostico_video === "" || r.taxa_diagnostico_video == null || !Number.isFinite(Number(r.taxa_diagnostico_video)) ? 150 : Math.max(0, Number(r.taxa_diagnostico_video)),
    proposta_titulo: r.proposta_titulo || "Proposta comercial", termo_garantia: r.termo_garantia ?? "",
    aviso_outra_empresa: String(r.aviso_outra_empresa ?? "").trim() || AVISO_OUTRA_EMPRESA_PADRAO,
    // só guarda o que foi escrito (vazio = texto padrão do sistema)
    textos: Object.fromEntries(Object.entries(r.textos ?? {}).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v)),
  }));
  // NF-e: as informações complementares são de cada unidade (as mesmas de Notas fiscais → Configurações da NF-e)
  const { unidades } = useUnidade();
  const invalidar = useInvalidate();
  const [nfTexto, setNfTexto] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (unidades.length && !nfTexto) setNfTexto(Object.fromEntries(unidades.map((u) => [u.id, u.informacoes_complementares ?? ""])));
  }, [unidades, nfTexto]);
  async function salvarTudo(e: FormEvent) {
    e.preventDefault();
    await salvar();
    try {
      for (const u of unidades) {
        const novo = (nfTexto?.[u.id] ?? "").trim() || null;
        if (nfTexto && novo !== (u.informacoes_complementares?.trim() || null)) {
          const { error } = await supabase.from("unidades").update({ informacoes_complementares: novo }).eq("id", u.id);
          if (error) throw error;
        }
      }
      invalidar("unidades");
    } catch (err) { notifyError(err); }
  }
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;
  const input = campo(cfg, set);
  const texto = (k: string, label: string, linhas = 3, ph = "") => (
    <label className="block sm:col-span-4">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <textarea className="input" rows={linhas} value={cfg[k] ?? ""} placeholder={ph} onChange={set(k)} />
    </label>
  );

  /** Texto padrão de um documento: vazio usa o do sistema (aparece apagado no campo). */
  const textoDoc = (k: ChaveTexto, label: string, ajuda: string, linhas = 3) => {
    const valor = String(cfg.textos?.[k] ?? "");
    const padrao = TEXTOS_PADRAO[k];
    const mudarTexto = (v: string) => mudar({ textos: { ...(cfg.textos ?? {}), [k]: v } });
    return (
      <div className="sm:col-span-4">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs font-semibold">
          <label htmlFor={`texto-${k}`} className="text-slate-600">{label}</label>
          {padrao && !valor && <button type="button" className="text-brand hover:underline" onClick={() => mudarTexto(padrao)}>Editar a partir do padrão</button>}
          {padrao && valor && valor !== padrao && <button type="button" className="text-slate-500 hover:underline" onClick={() => mudarTexto("")}>Voltar ao padrão</button>}
        </div>
        <textarea id={`texto-${k}`} className="input" rows={linhas} value={valor} placeholder={padrao || "Vazio: não sai nada"}
          aria-describedby={`texto-${k}-ajuda`} onChange={(e) => mudarTexto(e.target.value)} />
        <span id={`texto-${k}-ajuda`} className="mt-1 block text-xs text-slate-500">{ajuda}</span>
      </div>
    );
  };

  return (
    <div className="max-w-4xl">
      <CabecalhoSecao s={s} acoes={<BotaoSalvar form="form-orcamentos" salvando={salvando} />} />
      <form id="form-orcamentos" onSubmit={salvarTudo} className="space-y-5">
        <Bloco titulo="Orçamento" descricao="Valem para todo orçamento novo e para a proposta que o cliente abre para aprovar.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {input("validade_orcamento_dias", "Validade (dias)", "", "number", { min: 1 })}
            {input("orcamento_prazo_entrega", "Prazo de entrega (sai na proposta)", "sm:col-span-3", "text", { placeholder: "Ex.: 15 dias úteis após a confirmação do pagamento" })}
            {texto("orcamento_observacoes", "Observações que já vêm no orçamento novo (dá para mudar em cada um)", 2, "Ex.: Frete por conta do cliente. Instalação e treinamento inclusos na Grande Florianópolis.")}
          </div>
        </Bloco>

        <Bloco titulo="Proposta comercial (layout)" descricao="Vale para o PDF, o e-mail e a página que o cliente abre para aprovar. A logo e o cabeçalho vêm de Empresa e marca.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {input("proposta_titulo", "Título", "sm:col-span-2")}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Cor da proposta</span>
              <span className="flex items-center gap-2">
                <input type="color" className="h-11 w-14 cursor-pointer rounded-lg border border-slate-300 bg-transparent" value={cfg.proposta_cor ?? "#0EA5E9"} onChange={set("proposta_cor")} />
                <span className="num text-sm text-slate-500">{cfg.proposta_cor}</span>
              </span>
            </label>
            <div className="self-end pb-1"><Opcao ligado={!!cfg.proposta_fotos} onChange={(v) => mudar({ proposta_fotos: v })}>Mostrar fotos dos produtos</Opcao></div>
            {texto("proposta_apresentacao", "Apresentação (aparece no começo)")}
            {texto("proposta_condicoes", "Condições gerais (instalação, entrega, treinamento…)")}
            {texto("proposta_rodape", "Rodapé (opcional)", 2)}
          </div>
        </Bloco>

        <Bloco titulo="Garantia e preventiva" descricao="A garantia da máquina conta da venda (ou da entrega). O conserto tem garantia própria, que sai no laudo da OS.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {input("garantia_meses_padrao", "Garantia da máquina (meses)", "", "number", { min: 0 })}
            {input("garantia_servico_dias", "Garantia do conserto (dias)", "", "number", { min: 0 })}
            {input("preventiva_meses", "Preventiva a cada (meses)", "", "number", { min: 0 })}
            {input("os_armazenagem_dias", "Prazo para retirar da assistência (dias)", "", "number", { min: 0 })}
            {input("taxa_diagnostico_video", "Diagnóstico por vídeo chamada fora da garantia (R$)", "", "number", { min: 0, step: "0.01" })}
            <p className="text-xs text-slate-500 sm:col-span-4">
              Cada máquina pode ter garantia própria no cadastro do produto; sem ela, vale a padrão. O prazo para retirar sai no comprovante de entrada da OS.
            </p>
            {texto("termo_garantia", "Termo de garantia (sai na proposta e no laudo da OS)", 4)}
          </div>
        </Bloco>

        <Bloco titulo="Máquina vendida por outra empresa" descricao="Sai na OS, no comprovante de entrada e no laudo quando a máquina foi vendida por outra empresa (ex.: a My Frost). Deixa claro que a MF responde só pelo serviço e pelas peças que fornecer.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {texto("aviso_outra_empresa", "Aviso de responsabilidade ({empresa} = quem vendeu a máquina; {mf} = o nome da MF)", 5, AVISO_OUTRA_EMPRESA_PADRAO)}
            <p className="text-xs text-slate-500 sm:col-span-4">
              Para concluir a OS dessas máquinas, o sistema exige: número de série, condição de entrada, diagnóstico, serviço executado e orçamento aprovado pelo cliente.
              Confirme o texto com o advogado.
            </p>
          </div>
        </Bloco>

        <div className="pt-2">
          <h2 className="text-lg font-bold text-fg">Textos dos documentos</h2>
          <p className="text-sm text-slate-500">
            O que já vem escrito em cada documento. Campo vazio usa o texto padrão do sistema (aparece apagado). <b>{"{dias}"}</b> e <b>{"{empresa}"}</b> são trocados sozinhos.
          </p>
        </div>

        <Bloco titulo="Pedido de venda" descricao="Sai no PDF do pedido de venda (depois de aprovado). As observações do orçamento novo ficam no bloco Orçamento, lá em cima." fechado>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {textoDoc("pedido_condicoes", "Condições do pedido", "Ex.: conferência da mercadoria na entrega, prazo para reclamar de avaria, instalação.")}
          </div>
        </Bloco>

        <Bloco titulo="Ordem de produção (OP)" descricao="Já vem nas observações de toda OP nova (dá para mudar em cada uma)." fechado>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {textoDoc("op_observacoes", "Observações da OP nova", "Ex.: testar 2 horas com carga antes de liberar; conferir o nº de série na placa.")}
          </div>
        </Bloco>

        <Bloco titulo="Ordem de compra (OC)" descricao="Vale para a solicitação de cotação e para o pedido de compra enviados ao fornecedor." fechado>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {textoDoc("oc_observacoes", "Observações da OC nova", "Já vem nas observações de toda OC nova feita à mão.", 2)}
            {textoDoc("oc_cotacao", "Pedido de cotação", "Sai na solicitação de cotação (o que o fornecedor tem que responder).")}
            {textoDoc("oc_condicoes", "Condições de fornecimento", "Sai no pedido de compra e na cotação. Ex.: informar o nº da OC na nota fiscal; boleto só com a NF; horário de recebimento.")}
          </div>
        </Bloco>

        <Bloco titulo="Ordem de serviço (OS)" descricao="O laudo usa o termo de garantia e a garantia do conserto, lá em cima." fechado>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {textoDoc("os_condicoes_entrada", "Condições no comprovante de entrada", "{dias} = prazo para retirar da assistência.")}
          </div>
        </Bloco>

        <Bloco titulo="Nota fiscal (NF-e)" descricao="Informações complementares que saem em toda nota da unidade (as mesmas de Notas fiscais → Configurações da NF-e). Confirme com o contador." fechado>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {unidades.map((u) => (
              <label key={u.id} className="block sm:col-span-4">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">{u.nome}</span>
                <textarea className="input" rows={2} value={nfTexto?.[u.id] ?? ""} maxLength={2000}
                  placeholder="Ex.: Documento emitido por empresa optante pelo Lucro Real."
                  onChange={(e) => setNfTexto((t) => ({ ...(t ?? {}), [u.id]: e.target.value }))} />
              </label>
            ))}
          </div>
        </Bloco>

        <Bloco titulo="Ficha cadastral do cliente" descricao="Termo que o cliente lê e aceita ao assinar a ficha (LGPD). Vale para as fichas novas; as já assinadas guardam o texto da época. Confirme com o advogado." fechado>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {textoDoc("ficha_termo", "Termo da ficha cadastral", "{empresa} = o nome da empresa.", 5)}
          </div>
        </Bloco>

        <Bloco titulo="Máquina usada (seminova)" descricao="Sai na proposta, na página que o cliente abre para aprovar e no pedido quando há máquina usada, seminova ou recondicionada. Confirme com o advogado." fechado>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {textoDoc("usada_termo", "Condições da máquina usada", "Estado da máquina, garantia (o Código de Defesa do Consumidor dá no mínimo 90 dias) e o que não cobre.", 4)}
          </div>
        </Bloco>
      </form>
    </div>
  );
}
