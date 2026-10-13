// Configurações → Orçamentos e garantia: validade, prazo de entrega, observações padrão, layout da proposta,
// garantia das máquinas e do conserto, preventiva e os prazos da OS.
import { BotaoSalvar, Bloco, CabecalhoSecao, campo, Opcao, secaoPorId, useCfgPagina } from "./comum";

const CHAVES = ["validade_orcamento_dias", "orcamento_prazo_entrega", "orcamento_observacoes", "proposta_titulo", "proposta_cor", "proposta_fotos",
  "proposta_apresentacao", "proposta_condicoes", "proposta_rodape", "garantia_meses_padrao", "garantia_servico_dias", "preventiva_meses",
  "os_armazenagem_dias", "termo_garantia"];
const inteiro = (v: unknown, padrao: number) => (v === "" || v == null || !Number.isFinite(Number(v)) ? padrao : Math.max(0, Math.round(Number(v))));

export function ConfigOrcamentos() {
  const s = secaoPorId("orcamentos")!;
  const { cfg, set, mudar, salvar, salvando } = useCfgPagina(CHAVES, (r) => ({
    ...r, validade_orcamento_dias: inteiro(r.validade_orcamento_dias, 7), garantia_meses_padrao: inteiro(r.garantia_meses_padrao, 12),
    garantia_servico_dias: inteiro(r.garantia_servico_dias, 90), preventiva_meses: inteiro(r.preventiva_meses, 6), os_armazenagem_dias: inteiro(r.os_armazenagem_dias, 90),
    proposta_titulo: r.proposta_titulo || "Proposta comercial", termo_garantia: r.termo_garantia ?? "",
  }));
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;
  const input = campo(cfg, set);
  const texto = (k: string, label: string, linhas = 3, ph = "") => (
    <label className="block sm:col-span-4">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <textarea className="input" rows={linhas} value={cfg[k] ?? ""} placeholder={ph} onChange={set(k)} />
    </label>
  );

  return (
    <div className="max-w-4xl">
      <CabecalhoSecao s={s} acoes={<BotaoSalvar form="form-orcamentos" salvando={salvando} />} />
      <form id="form-orcamentos" onSubmit={salvar} className="space-y-5">
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
            <p className="text-xs text-slate-500 sm:col-span-4">
              Cada máquina pode ter garantia própria no cadastro do produto; sem ela, vale a padrão. O prazo para retirar sai no comprovante de entrada da OS.
            </p>
            {texto("termo_garantia", "Termo de garantia (sai na proposta e no laudo da OS)", 4)}
          </div>
        </Bloco>
      </form>
    </div>
  );
}
