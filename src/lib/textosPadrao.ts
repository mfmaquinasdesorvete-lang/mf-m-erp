// Textos padrão dos documentos (Configurações → Orçamentos e garantia → Textos dos documentos).
// Ficam em configuracoes.textos; vazio = o texto padrão daqui. {dias} e {empresa} são trocados na hora.

export type ChaveTexto =
  | "pedido_condicoes" | "op_observacoes" | "oc_observacoes" | "oc_cotacao" | "oc_condicoes"
  | "os_condicoes_entrada" | "ficha_termo" | "usada_termo" | "reg006_revisao";

export const TEXTOS_PADRAO: Record<ChaveTexto, string> = {
  pedido_condicoes: "",
  op_observacoes: "",
  oc_observacoes: "",
  oc_cotacao: "Por favor, informe preço unitário, prazo de entrega, condição de pagamento e valor do frete até o nosso endereço.",
  oc_condicoes: "",
  os_condicoes_entrada: "O orçamento do conserto será enviado pelo WhatsApp antes de qualquer serviço. Equipamentos não retirados em até {dias} dias após o aviso de conclusão poderão ser cobrados por armazenagem.",
  // igual ao do banco (termo_ficha_cadastral): o banco usa o texto salvo, ou este quando vazio
  ficha_termo: "Declaro que as informações desta ficha cadastral são verdadeiras e me comprometo a avisar a {empresa} sobre qualquer alteração. "
    + "Autorizo o uso destes dados para emissão de notas fiscais, entregas, cobranças, garantia, assistência técnica e contato comercial, "
    + "conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Reconheço como válida esta assinatura eletrônica, registrada com data, "
    + "hora, endereço IP e código de verificação (Medida Provisória nº 2.200-2/2001, art. 10, § 2º).",
  usada_termo: "Máquina usada (seminova): revisada e testada antes da entrega e vendida no estado em que se encontra, com as marcas normais de uso. "
    + "Garantia de 90 dias contados da entrega para defeitos de funcionamento (art. 26 do Código de Defesa do Consumidor). "
    + "Não cobre peças de desgaste (vedações, bicos, correias), mau uso, falta de limpeza ou instalação elétrica fora do padrão.",
  // revisão do formulário de qualidade REG-006 (Teste do giga): sai no cabeçalho do PDF
  reg006_revisao: "Revisão 00",
};

/** Texto salvo na configuração ou o padrão, com {dias} e {empresa} trocados. */
export function textoPadrao(cfg: { textos?: Record<string, unknown> | null } | null | undefined, chave: ChaveTexto, troca: { dias?: number | string; empresa?: string } = {}): string {
  const salvo = String(cfg?.textos?.[chave] ?? "").trim();
  return (salvo || TEXTOS_PADRAO[chave])
    .replace(/\{dias\}/g, String(troca.dias ?? ""))
    .replace(/\{empresa\}/g, troca.empresa ?? "empresa");
}

/** Máquina usada, seminova ou recondicionada pelo nome (a mesma regra do banco ao registrar a máquina vendida). */
export const ehUsada = (descricao: string | null | undefined) => /(usad[ao]|semi\s*-?\s*nov[ao]|seminov[ao]|recondicionad[ao])/i.test(descricao ?? "");
