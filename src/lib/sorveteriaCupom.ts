// Comprovante de 80 mm da sorveteria (não é documento fiscal): abre a impressão do navegador sem mostrar nada na tela.
import { brl } from "./format";
import {
  descontoPedido, gorjetaPedido, rotuloCanal, rotuloMeio, subtotalPedido, totalItem, totalPedido, type Loja, type Pedido,
} from "./sorveteria";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function cupomHtml(p: Pedido, loja: Loja) {
  const linha = (a: string, b: string, forte = false) => `<div class="l${forte ? " f" : ""}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
  const itens = p.itens.map((i) => {
    const nome = i.pesoG != null ? `${i.nome} ${i.pesoG}g` : `${i.qtd}x ${i.nome}`;
    const det = [i.sabores.length ? i.sabores.join(", ") : "", ...i.complementos.map((c) => `+ ${c.nome}`), i.obs ? `Obs: ${i.obs}` : ""].filter(Boolean);
    return linha(nome, brl(totalItem(i)), true) + det.map((d) => `<div class="d">${esc(d)}</div>`).join("");
  }).join("");
  const desc = descontoPedido(p), gorj = gorjetaPedido(p, loja.gorjetaPct);
  const cli = p.cliente;
  return `<!doctype html><meta charset="utf-8"><title>Pedido ${p.numero}</title><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}body{width:72mm;margin:4mm;font:12px/1.35 "Courier New",monospace;color:#000}
    .c{text-align:center}.l{display:flex;justify-content:space-between;gap:6px}.f{font-weight:700}.d{padding-left:8px;font-size:11px}
    hr{border:0;border-top:1px dashed #000;margin:6px 0}h1{font-size:15px;margin:0}.g{font-size:20px}
  </style>
  <div class="c"><h1>${esc(loja.nome)}</h1>${loja.endereco ? `<div>${esc(loja.endereco)}</div>` : ""}${loja.telefone ? `<div>${esc(loja.telefone)}</div>` : ""}</div><hr>
  <div class="c f">COMPROVANTE · NÃO É DOCUMENTO FISCAL</div>
  <div class="c g f">Pedido ${p.numero}</div>
  <div class="c">${rotuloCanal(p.canal)}${p.mesa ? ` ${esc(p.mesa)}` : ""} · ${new Date(p.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
  ${cli?.nome ? `<hr><div>Cliente: ${esc(cli.nome)} ${esc(cli.telefone)}</div>${p.canal === "delivery" ? `<div>${esc(cli.endereco)}${cli.bairro ? ` - ${esc(cli.bairro)}` : ""}</div>${cli.referencia ? `<div>Ref.: ${esc(cli.referencia)}</div>` : ""}` : ""}` : ""}
  <hr>${itens}<hr>
  ${desc || gorj || p.taxaEntrega ? linha("Subtotal", brl(subtotalPedido(p))) : ""}
  ${desc ? linha(`Desconto ${p.descontoPct ? p.descontoPct + "%" : ""}`, `- ${brl(desc)}`) : ""}
  ${p.canal === "delivery" && p.taxaEntrega ? linha("Taxa de entrega", brl(p.taxaEntrega)) : ""}
  ${gorj ? linha(`Serviço ${loja.gorjetaPct}%`, brl(gorj)) : ""}
  <div class="l f g"><span>TOTAL</span><span>${brl(totalPedido(p, loja.gorjetaPct))}</span></div><hr>
  ${p.pagamentos.map((x) => linha(rotuloMeio(x.meio), brl(x.valor))).join("")}
  ${p.troco ? linha("Troco", brl(p.troco), true) : ""}
  ${p.pagarNaEntrega && !p.pagamentos.length ? `<div class="c f">PAGAR NA ENTREGA</div>` : ""}
  ${p.obs ? `<hr><div>Obs: ${esc(p.obs)}</div>` : ""}
  <hr><div class="c">Obrigado e volte sempre!</div>`;
}

/** Imprime o comprovante num quadro invisível (um clique, sem pop-up). */
export function imprimirCupom(p: Pedido, loja: Loja) {
  const quadro = document.createElement("iframe");
  quadro.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";
  document.body.appendChild(quadro);
  const doc = quadro.contentDocument;
  if (!doc) { quadro.remove(); return; }
  doc.open(); doc.write(cupomHtml(p, loja)); doc.close();
  setTimeout(() => {
    try { quadro.contentWindow?.focus(); quadro.contentWindow?.print(); } finally { setTimeout(() => quadro.remove(), 60_000); }
  }, 150);
}
