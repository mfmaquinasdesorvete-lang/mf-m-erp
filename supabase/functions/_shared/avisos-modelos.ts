// Textos dos avisos: Telegram (equipe) e e-mail (clientes).
// Arquivo sem dependências: é usado pelas Edge Functions e também pelo ERP
// (botão "Ver exemplo" em Configurações), então o que se vê lá é o que sai.

export type Dados = Record<string, unknown>;
export type Empresa = {
  nome: string; telefone?: string | null; whatsapp?: string | null; email?: string | null;
  endereco?: string | null; municipio?: string | null; uf?: string | null; site?: string | null;
};
export type MensagemEmail = {
  assunto: string;
  titulo: string;
  paragrafos: string[];
  destaques?: [string, string][];
  botao?: { texto: string; url: string };
  codigos?: { rotulo: string; valor: string }[];
  aviso?: string;
};

// ---------------------------------------------------------------------
// formatação
// ---------------------------------------------------------------------
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const brl = (v: unknown) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataBR = (v: unknown) => {
  const t = s(v);
  if (!t) return "";
  const [a, m, d] = t.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : t;
};
const primeiroNome = (v: unknown) => {
  const n = s(v).trim().split(/\s+/)[0] ?? "";
  // razão social (LTDA, ME...) fica sem "Olá, X": usa o nome completo
  return /ltda|eireli|\bme\b|s\/?a|comercio|comércio|sorveteria|lanchonete/i.test(s(v)) ? s(v).trim() : n;
};
export const esc = (v: unknown) =>
  s(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const digitos = (v: unknown) => s(v).replace(/\D/g, "");
export function linkWhatsApp(numero: unknown, texto: string) {
  let n = digitos(numero);
  if (!n) return "";
  if (n.length <= 11) n = "55" + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

// ---------------------------------------------------------------------
// Catálogo (exemplos usados no "Ver exemplo" e no teste)
// ---------------------------------------------------------------------
export const EXEMPLOS: Record<string, Dados> = {
  resumo_diario: {
    data: "2026-10-07", vendas_ontem: 32590, qtd_vendas_ontem: 2, orcamentos_abertos: 2, a_entregar: 1, recebido_ontem: 14500,
    receber_hoje: 7909.33, receber_vencido: 7909.33, qtd_receber_vencido: 1, pagar_hoje: 1200, pagar_vencido: 0,
    os_abertas: 3, os_atrasadas: 1, os_prontas: 1, estoque_baixo: 2, compras_atrasadas: 0, nfe_conferir: 2, preventivas: 3,
  },
  pagamento_recebido: { cliente: "Sorveteria Gelato", descricao: "Pedido #102 - parcela 1/2", valor: 14500, forma: "boleto" },
  pedido_aprovado: { numero: 103, cliente: "Açaí do Porto", valor: 18900, vendedor: "Carla", forma: "pix" },
  nfe_autorizada: { numero: "1301", pedido: 102, cliente: "Sorveteria Gelato", valor: 29000 },
  nfe_erro: { pedido: 104, cliente: "Doce Mel", mensagem: "Rejeição 778: Informado NCM inexistente" },
  os_nova: { numero: 53, cliente: "Lanchonete Central", equipamento: "Máquina de Milk Shake", defeito: "Haste não gira", garantia: false },
  os_pronta: { numero: 51, cliente: "Sorveteria Gelato", equipamento: "Máquina de Sorvete Soft MF-300", valor: 0, garantia: true },
  nfe_fornecedor: { emitente: "Refrigeração Sul Peças", valor: 2380.5, situacao: "aguardando_vinculo", motivo: "2 itens sem produto vinculado" },
  compra_recebida: { numero: 31, fornecedor: "Motores Paulista", status: "recebido", valor: 1890 },
  estoque_minimo: { produto: "Kit vedação MF-300", sku: "KV-300", atual: 2, minimo: 5, unidade: "UN" },
  cli_os_recebida: { cliente: "Sorveteria Gelato", numero: 51, equipamento: "Máquina de Sorvete Soft MF-300", numero_serie: "MF300-2025-0012", defeito: "Sorvete saindo mole e motor fazendo barulho", previsao: "2026-10-09" },
  cli_os_pronta: { cliente: "Sorveteria Gelato", numero: 51, equipamento: "Máquina de Sorvete Soft MF-300", solucao: "Troca do rolamento do motor do batedor e revisão geral", valor: 0, garantia: true },
  cli_cobranca_lembrete: { cliente: "Sorveteria Gelato", descricao: "Pedido #102 - parcela 2/2", valor: 14500, vencimento: "2026-11-05", forma: "pix", pagamento: "Pix (CNPJ): 12.345.678/0001-90\nBanco do Brasil · Ag. 1234-5 · C/C 98765-4" },
  cli_cobranca_vencida: { cliente: "Sorveteria Gelato", descricao: "Pedido #102 - parcela 2/2", valor: 14500, vencimento: "2026-10-05", forma: "pix", pagamento: "Pix (CNPJ): 12.345.678/0001-90" },
  cli_pagamento: { cliente: "Sorveteria Gelato", descricao: "Pedido #102 - parcela 1/2", valor: 14500, data: "2026-10-03" },
  cli_nfe: { cliente: "Sorveteria Gelato", numero: "1301", pedido: 102, valor: 29000, danfe_url: "https://exemplo.com/danfe.pdf", chave: "35261012345678000190550010000013011000013010" },
  cli_pedido_enviado: { cliente: "Açaí do Porto", numero: 103, transportadora: "Rodonaves", rastreio: "RDN123456789BR", volumes: 2 },
  cli_preventiva: { cliente: "Sorveteria Gelato", equipamento: "Máquina de Sorvete Soft MF-300", numero_serie: "MF300-2025-0012", data: "2026-10-14", em_garantia: true },
  cli_garantia: { cliente: "Doce Mel", equipamento: "Máquina de Sorvete Expressa MF-150", numero_serie: "MF150-2025-0230", garantia_ate: "2026-11-06" },
};

// ---------------------------------------------------------------------
// Telegram (equipe) — HTML simples aceito pelo Telegram
// ---------------------------------------------------------------------
const ve = (papel: string, ...p: string[]) => papel === "admin" || p.includes(papel);
const SITUACAO_NFE: Record<string, string> = { aguardando_vinculo: "Itens sem produto vinculado", revisao: "Não é compra: decidir o que fazer" };
const FORMA: Record<string, string> = { boleto: "boleto", pix: "Pix", cartao: "cartão", dinheiro: "dinheiro", transferencia: "transferência" };

export function textoTelegram(tipo: string, d: Dados, ctx: { nome?: string; papel?: string; site?: string | null } = {}): string {
  const papel = ctx.papel ?? "admin";
  const link = (caminho: string, texto = "Abrir no ERP") => (ctx.site ? `\n\n<a href="${esc(ctx.site.replace(/\/$/, "") + caminho)}">${texto} →</a>` : "");
  switch (tipo) {
    case "resumo_diario": {
      const l: string[] = [];
      if (ve(papel, "vendas", "financeiro")) {
        l.push(`🛒 Vendas ontem: <b>${brl(d.vendas_ontem)}</b> (${s(d.qtd_vendas_ontem)} pedido(s))`);
        l.push(`📝 Orçamentos abertos: <b>${s(d.orcamentos_abertos)}</b> · a entregar: <b>${s(d.a_entregar)}</b>`);
      }
      if (ve(papel, "financeiro")) {
        l.push(`💰 Recebido ontem: <b>${brl(d.recebido_ontem)}</b>`);
        l.push(`📥 A receber hoje: <b>${brl(d.receber_hoje)}</b>`);
        l.push(`📤 A pagar hoje: <b>${brl(d.pagar_hoje)}</b>`);
        if (Number(d.qtd_receber_vencido) > 0) l.push(`⚠️ Cobranças vencidas: <b>${s(d.qtd_receber_vencido)}</b> (${brl(d.receber_vencido)})`);
        if (Number(d.pagar_vencido) > 0) l.push(`⚠️ Contas a pagar vencidas: <b>${brl(d.pagar_vencido)}</b>`);
        if (Number(d.nfe_conferir) > 0) l.push(`📄 Notas de fornecedor para conferir: <b>${s(d.nfe_conferir)}</b>`);
      }
      if (ve(papel, "vendas", "tecnico")) {
        l.push(`🔧 OS em andamento: <b>${s(d.os_abertas)}</b>${Number(d.os_atrasadas) > 0 ? ` (⚠️ ${s(d.os_atrasadas)} atrasada(s))` : ""} · prontas p/ retirar: <b>${s(d.os_prontas)}</b>`);
        if (Number(d.preventivas) > 0) l.push(`🔔 Clientes para lembrar da preventiva: <b>${s(d.preventivas)}</b>`);
      }
      if (ve(papel, "financeiro", "tecnico")) {
        if (Number(d.estoque_baixo) > 0) l.push(`📦 Itens no estoque mínimo: <b>${s(d.estoque_baixo)}</b>`);
        if (Number(d.compras_atrasadas) > 0) l.push(`🚚 Compras com entrega atrasada: <b>${s(d.compras_atrasadas)}</b>`);
      }
      return `☀️ <b>Bom dia${ctx.nome ? `, ${esc(primeiroNome(ctx.nome))}` : ""}!</b>\nResumo de ${dataBR(d.data)}\n\n${l.join("\n")}${link("/")}`;
    }
    case "pagamento_recebido":
      return `💰 <b>Pagamento recebido</b>\n${esc(d.cliente)}\n${esc(d.descricao)}\n<b>${brl(d.valor)}</b> · ${esc(FORMA[s(d.forma)] ?? d.forma)}${link("/financeiro")}`;
    case "pedido_aprovado":
      return `🛒 <b>Venda aprovada · Pedido #${esc(d.numero)}</b>\n${esc(d.cliente)}\n<b>${brl(d.valor)}</b> · ${esc(FORMA[s(d.forma)] ?? d.forma)}${d.vendedor ? `\nVendedor: ${esc(d.vendedor)}` : ""}${link("/pedidos")}`;
    case "nfe_autorizada":
      return `🧾 <b>NF-e ${esc(d.numero)} autorizada</b>\nPedido #${esc(d.pedido)} · ${esc(d.cliente)}\n${brl(d.valor)}${link("/notas")}`;
    case "nfe_erro":
      return `❌ <b>NF-e rejeitada · Pedido #${esc(d.pedido)}</b>\n${esc(d.cliente)}\n<i>${esc(d.mensagem)}</i>\nCorrija e emita de novo.${link("/notas")}`;
    case "os_nova":
      return `🔧 <b>Nova OS #${esc(d.numero)}</b>${d.garantia ? " · em garantia" : ""}\n${esc(d.cliente)}\n${esc(d.equipamento)}\nDefeito: <i>${esc(d.defeito)}</i>${link("/assistencia")}`;
    case "os_pronta":
      return `✅ <b>OS #${esc(d.numero)} pronta</b>\n${esc(d.cliente)} · ${esc(d.equipamento)}\n${d.garantia ? "Coberta pela garantia" : `Valor: <b>${brl(d.valor)}</b>`}\nAvise o cliente para retirar.${link("/assistencia")}`;
    case "nfe_fornecedor":
      return `📄 <b>Nota de fornecedor para conferir</b>\n${esc(d.emitente)} · ${brl(d.valor)}\n${esc(SITUACAO_NFE[s(d.situacao)] ?? d.situacao)}${d.motivo ? `: <i>${esc(d.motivo)}</i>` : ""}${link("/notas")}`;
    case "compra_recebida":
      return `📦 <b>Compra #${esc(d.numero)} ${d.status === "parcial" ? "recebida em parte" : "recebida"}</b>\n${esc(d.fornecedor)}\nAs peças já entraram no estoque.${link("/producao")}`;
    case "estoque_minimo":
      return `⚠️ <b>Estoque no mínimo</b>\n${esc(d.produto)}${d.sku ? ` (${esc(d.sku)})` : ""}\nTem <b>${s(Number(d.atual))} ${esc(d.unidade ?? "")}</b> · mínimo ${s(Number(d.minimo))}${link("/estoque")}`;
    case "teste":
      return `👋 <b>Teste do robô MF Máquinas</b>\nEstá funcionando${ctx.nome ? `, ${esc(primeiroNome(ctx.nome))}` : ""}! Os avisos vão chegar aqui.`;
    default:
      return `🔔 ${esc(tipo)}`;
  }
}

// ---------------------------------------------------------------------
// E-mail (clientes)
// ---------------------------------------------------------------------
export function mensagemCliente(tipo: string, d: Dados, empresa: Empresa): MensagemEmail {
  const ola = `Olá, ${primeiroNome(d.cliente)}!`;
  const zap = (texto: string) => linkWhatsApp(empresa.whatsapp || empresa.telefone, texto);
  const contato = [empresa.whatsapp && `WhatsApp ${empresa.whatsapp}`, empresa.telefone && empresa.telefone !== empresa.whatsapp && `telefone ${empresa.telefone}`]
    .filter(Boolean).join(" ou ");
  const falar = contato ? `Qualquer dúvida, é só responder este e-mail ou chamar no ${contato}.` : "Qualquer dúvida, é só responder este e-mail.";
  const cobranca = (): Pick<MensagemEmail, "destaques" | "codigos"> => ({
    destaques: [["Referente a", s(d.descricao)], ["Valor", brl(d.valor)], ["Vencimento", dataBR(d.vencimento)]],
    codigos: d.pagamento ? [{ rotulo: "Como pagar", valor: s(d.pagamento) }] : [],
  });

  switch (tipo) {
    case "cli_os_recebida":
      return {
        assunto: `Recebemos sua máquina · OS nº ${s(d.numero)}`,
        titulo: "Recebemos sua máquina",
        paragrafos: [ola, `Sua ${s(d.equipamento)} já está com a nossa assistência técnica. Guarde o número da OS para acompanhar o conserto.`,
          "Assim que o diagnóstico ficar pronto, entramos em contato.", falar],
        destaques: [["Ordem de serviço", `nº ${s(d.numero)}`], ["Equipamento", s(d.equipamento)],
          ...(d.numero_serie ? [["Nº de série", s(d.numero_serie)] as [string, string]] : []),
          ["Defeito informado", s(d.defeito)], ...(d.previsao ? [["Previsão", dataBR(d.previsao)] as [string, string]] : [])],
      };
    case "cli_os_pronta":
      return {
        assunto: `Sua máquina está pronta! · OS nº ${s(d.numero)}`,
        titulo: "Sua máquina está pronta 🎉",
        paragrafos: [ola, `O conserto da sua ${s(d.equipamento)} foi concluído e ela já pode ser retirada.`,
          empresa.endereco ? `Endereço para retirada: ${empresa.endereco}.` : "", falar].filter(Boolean),
        destaques: [["Ordem de serviço", `nº ${s(d.numero)}`], ...(d.solucao ? [["Serviço realizado", s(d.solucao)] as [string, string]] : []),
          ["Valor", d.garantia ? "Coberto pela garantia" : brl(d.valor)]],
        botao: zap(`Olá! Quero combinar a retirada da OS nº ${s(d.numero)}.`) ? { texto: "Combinar a retirada pelo WhatsApp", url: zap(`Olá! Quero combinar a retirada da OS nº ${s(d.numero)}.`) } : undefined,
      };
    case "cli_cobranca_lembrete":
      return { assunto: `Lembrete: pagamento vence em ${dataBR(d.vencimento)}`, titulo: "Seu pagamento vence em 3 dias",
        paragrafos: [ola, "Passando para lembrar do vencimento abaixo. Se já pagou, pode desconsiderar este e-mail.",
          d.pagamento ? "Os dados para pagamento estão logo abaixo. Depois de pagar, se puder, responda com o comprovante." : "", falar].filter(Boolean),
        ...cobranca(),
        botao: zap(`Olá! Sobre o pagamento de ${s(d.descricao)} (vencimento ${dataBR(d.vencimento)}).`) ? { texto: "Falar pelo WhatsApp", url: zap(`Olá! Sobre o pagamento de ${s(d.descricao)} (vencimento ${dataBR(d.vencimento)}).`) } : undefined };
    case "cli_cobranca_vencida":
      return { assunto: `Pagamento de ${dataBR(d.vencimento)} em aberto`, titulo: "Seu pagamento está em aberto",
        paragrafos: [ola, "Não identificamos o pagamento abaixo, que venceu ontem.",
          "Se já pagou, desconsidere: pode levar até 2 dias úteis para aparecer. Se precisar de outra data, fale com a gente.", falar],
        ...cobranca(),
        botao: zap(`Olá! Quero combinar o pagamento de ${s(d.descricao)}.`) ? { texto: "Combinar pelo WhatsApp", url: zap(`Olá! Quero combinar o pagamento de ${s(d.descricao)}.`) } : undefined };
    case "cli_pagamento":
      return { assunto: `Pagamento recebido · obrigado!`, titulo: "Recebemos seu pagamento",
        paragrafos: [ola, "Confirmamos o seu pagamento. Muito obrigado pela confiança!", falar],
        destaques: [["Referente a", s(d.descricao)], ["Valor", brl(d.valor)], ...(d.data ? [["Pago em", dataBR(d.data)] as [string, string]] : [])] };
    case "cli_nfe":
      return { assunto: `Nota fiscal nº ${s(d.numero)} · Pedido #${s(d.pedido)}`, titulo: "Sua nota fiscal foi emitida",
        paragrafos: [ola, `A nota fiscal do pedido #${s(d.pedido)} foi autorizada. Guarde para a garantia e para a sua contabilidade.`, falar],
        destaques: [["Nota fiscal", `nº ${s(d.numero)}`], ["Pedido", `#${s(d.pedido)}`], ["Valor", brl(d.valor)]],
        botao: d.danfe_url ? { texto: "Baixar a nota (DANFE)", url: s(d.danfe_url) } : undefined,
        codigos: d.chave ? [{ rotulo: "Chave de acesso", valor: s(d.chave).replace(/(\d{4})(?=\d)/g, "$1 ") }] : [] };
    case "cli_pedido_enviado":
      return { assunto: `Seu pedido #${s(d.numero)} foi enviado 🚚`, titulo: "Seu pedido está a caminho",
        paragrafos: [ola, `Seu pedido #${s(d.numero)} saiu daqui e já está com a transportadora.`, falar],
        destaques: [["Pedido", `#${s(d.numero)}`], ...(d.transportadora ? [["Transportadora", s(d.transportadora)] as [string, string]] : []),
          ...(d.volumes ? [["Volumes", s(d.volumes)] as [string, string]] : [])],
        codigos: [{ rotulo: "Código de rastreio", valor: s(d.rastreio) }] };
    case "cli_preventiva": {
      const msg = `Olá! Quero agendar a manutenção preventiva da ${s(d.equipamento)}${d.numero_serie ? ` (série ${s(d.numero_serie)})` : ""}.`;
      return { assunto: `Hora da manutenção preventiva da sua máquina`, titulo: "Hora da preventiva",
        paragrafos: [ola, `A manutenção preventiva da sua ${s(d.equipamento)} está prevista para ${dataBR(d.data)}.`,
          "Ela mantém o sorvete na textura certa, economiza energia e evita a máquina parar no meio da temporada.",
          d.em_garantia ? "Fazer a preventiva em dia também mantém a garantia válida." : "", falar].filter(Boolean),
        destaques: [["Equipamento", s(d.equipamento)], ...(d.numero_serie ? [["Nº de série", s(d.numero_serie)] as [string, string]] : []), ["Data prevista", dataBR(d.data)]],
        botao: zap(msg) ? { texto: "Agendar pelo WhatsApp", url: zap(msg) } : undefined };
    }
    case "cli_garantia": {
      const msg = `Olá! A garantia da minha ${s(d.equipamento)} está terminando e quero fazer uma revisão.`;
      return { assunto: `A garantia da sua máquina termina em ${dataBR(d.garantia_ate)}`, titulo: "Sua garantia está acabando",
        paragrafos: [ola, `A garantia da sua ${s(d.equipamento)} vai até ${dataBR(d.garantia_ate)}.`,
          "Notou barulho, vazamento ou o sorvete saindo mole? Fale com a gente antes dessa data para resolver sem custo.", falar],
        destaques: [["Equipamento", s(d.equipamento)], ...(d.numero_serie ? [["Nº de série", s(d.numero_serie)] as [string, string]] : []), ["Garantia até", dataBR(d.garantia_ate)]],
        botao: zap(msg) ? { texto: "Falar pelo WhatsApp", url: zap(msg) } : undefined };
    }
    default:
      return { assunto: empresa.nome, titulo: empresa.nome, paragrafos: [ola, falar] };
  }
}

const NAVY = "#0B1F3A";
const BOTAO = "#066d8c";

export function htmlEmail(m: MensagemEmail, empresa: Empresa, descadastro?: string, logo?: string | null): string {
  const linhas = (m.destaques ?? []).map(([k, v]) =>
    `<tr><td style="padding:8px 0;color:#5b6b82;font-size:14px;width:40%;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;color:#0f1d33;font-size:15px;font-weight:600">${esc(v)}</td></tr>`).join("");
  const codigos = (m.codigos ?? []).map((c) =>
    `<p style="margin:16px 0 4px;color:#5b6b82;font-size:13px">${esc(c.rotulo)}</p><div style="background:#f1f5f9;border-radius:8px;padding:10px 12px;font-family:Consolas,Menlo,monospace;font-size:14px;color:#0f1d33;word-break:break-all">${esc(c.valor)}</div>`).join("");
  const endereco = [empresa.endereco, [empresa.municipio, empresa.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  const contato = [empresa.whatsapp && `WhatsApp ${empresa.whatsapp}`, empresa.telefone && empresa.telefone !== empresa.whatsapp && empresa.telefone, empresa.email].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.assunto)}</title></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(m.paragrafos[1] ?? m.titulo)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:${NAVY};padding:20px 24px">
${logo ? `<img src="${esc(logo)}" width="40" height="40" alt="" style="vertical-align:middle;border-radius:8px;margin-right:10px">` : ""}<span style="color:#ffffff;font-size:18px;font-weight:700;vertical-align:middle">${esc(empresa.nome)}</span>
</td></tr>
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f1d33">${esc(m.titulo)}</h1>
${m.paragrafos.map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:#334155">${esc(p)}</p>`).join("")}
${linhas ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${linhas}</table>` : ""}
${m.botao ? `<p style="margin:22px 0 6px"><a href="${esc(m.botao.url)}" style="display:inline-block;background:${BOTAO};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:10px">${esc(m.botao.texto)}</a></p>` : ""}
${codigos}
${m.aviso ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b">${esc(m.aviso)}</p>` : ""}
</td></tr>
<tr><td style="padding:20px 24px 24px">
<p style="margin:0;font-size:13px;line-height:1.5;color:#64748b"><b style="color:#334155">${esc(empresa.nome)}</b>${endereco ? `<br>${esc(endereco)}` : ""}${contato ? `<br>${esc(contato)}` : ""}</p>
</td></tr>
</table>
${descadastro ? `<p style="margin:14px 0 0;font-size:12px;color:#64748b">Você recebe estes avisos por ser cliente da ${esc(empresa.nome)}. <a href="${esc(descadastro)}" style="color:#64748b">Não quero mais receber</a></p>` : ""}
</td></tr></table></body></html>`;
}

export function textoEmail(m: MensagemEmail, empresa: Empresa, descadastro?: string): string {
  return [
    m.titulo, "", ...m.paragrafos.flatMap((p) => [p, ""]),
    ...(m.destaques ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(m.botao ? ["", `${m.botao.texto}: ${m.botao.url}`] : []),
    ...(m.codigos ?? []).flatMap((c) => ["", `${c.rotulo}:`, c.valor]),
    ...(m.aviso ? ["", m.aviso] : []),
    "", "--", empresa.nome, empresa.endereco ?? "", [empresa.whatsapp, empresa.email].filter(Boolean).join(" · "),
    ...(descadastro ? ["", `Não quer mais receber estes avisos? ${descadastro}`] : []),
  ].join("\n");
}
