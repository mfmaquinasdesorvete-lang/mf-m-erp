// Atendimento pelo WhatsApp Business (número fixo): as três perguntas que mais chegam viram mensagem pronta, e a pessoa
// só toca em enviar. Nota fiscal (DANFE e XML, ou a chave de acesso quando a nota não tem os arquivos), rastreio do
// pedido e preço e estoque da peça. Toda resposta leva o link da Área do Cliente, para o cliente achar sozinho depois.
import { brl, dataBR } from "./format";

export type NotaResposta = { numero: number | string | null; serie?: string | number | null; data: string; valor: number | null; chave: string | null; danfe_url: string | null; xml_url: string | null };
export type EnvioResposta = { pedido: number | string | null; enviado_em: string | null; transportadora: string | null; codigo: string | null; link: string | null };
export type PecaResposta = {
  descricao: string; codigo?: string | null; preco: number | null; estoque: number; porUnidade?: { unidade: string; qtd: number }[];
  sobEncomenda?: boolean | null; prazoDias?: number | null;
};

const primeiroNome = (nome: string | null | undefined) => (nome ?? "").trim().split(/\s+/)[0] || "";
const ola = (nome: string | null | undefined) => (primeiroNome(nome) ? `Olá, ${primeiroNome(nome)}!` : "Olá!");
const rodapeArea = (area: string | null | undefined, oQue: string) => (area ? `\n\n${oQue}, a qualquer hora, na sua página da MF Máquinas: ${area}` : "");

export function mensagemNota(cliente: string | null | undefined, n: NotaResposta, area?: string | null) {
  const linhas = [`${ola(cliente)} Segue a nota fiscal nº ${n.numero ?? "—"} de ${dataBR(n.data)}${n.valor ? ` (${brl(n.valor)})` : ""}.`];
  if (n.danfe_url) linhas.push(`DANFE (PDF): ${n.danfe_url}`);
  if (n.xml_url) linhas.push(`XML: ${n.xml_url}`);
  if (!n.danfe_url && !n.xml_url && n.chave) linhas.push(`Chave de acesso: ${n.chave}\n(com ela dá para baixar a nota no portal da NF-e: https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx)`);
  return linhas.join("\n") + rodapeArea(area, "Todas as suas notas ficam");
}

export function mensagemRastreio(cliente: string | null | undefined, e: EnvioResposta, area?: string | null) {
  const pedido = e.pedido ? `seu pedido nº ${e.pedido}` : "seu pedido";
  if (!e.enviado_em && !e.codigo) {
    return `${ola(cliente)} ${pedido[0].toUpperCase()}${pedido.slice(1)} ainda está em separação aqui na MF. Assim que sair, mandamos o rastreio.` + rodapeArea(area, "Você acompanha");
  }
  const linhas = [`${ola(cliente)} ${pedido[0].toUpperCase()}${pedido.slice(1)} saiu${e.enviado_em ? ` dia ${dataBR(e.enviado_em)}` : ""}${e.transportadora ? ` pela ${e.transportadora}` : ""}.`];
  if (e.codigo) linhas.push(`Código de rastreio: ${e.codigo}`);
  if (e.link) linhas.push(`Acompanhe aqui: ${e.link}`);
  return linhas.join("\n") + rodapeArea(area, "Você acompanha seus pedidos");
}

export function mensagemPeca(cliente: string | null | undefined, p: PecaResposta, area?: string | null) {
  const nome = `${p.descricao}${p.codigo ? ` (cód. ${p.codigo})` : ""}`;
  const preco = p.preco ? ` custa ${brl(p.preco)}` : "";
  let estoque: string;
  if (p.estoque > 0) {
    const onde = (p.porUnidade ?? []).filter((u) => u.qtd > 0).map((u) => `${u.qtd} em ${u.unidade}`).join(" e ");
    estoque = `Temos ${p.estoque} em estoque${onde && (p.porUnidade ?? []).filter((u) => u.qtd > 0).length > 1 ? ` (${onde})` : ""}.`;
  } else {
    estoque = p.sobEncomenda || p.prazoDias
      ? `No momento é sob encomenda${p.prazoDias ? `: prazo de cerca de ${p.prazoDias} dias` : ""}.`
      : "No momento está sem estoque; avisamos assim que chegar.";
  }
  return `${ola(cliente)} A peça ${nome}${preco}. ${estoque}\nQuer que eu separe para você?` + rodapeArea(area, "Suas compras e notas ficam");
}
