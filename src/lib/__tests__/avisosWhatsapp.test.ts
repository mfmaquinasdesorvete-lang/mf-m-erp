import { describe, expect, it } from "vitest";
import { avisoWhatsapp, MODELO_WHATSAPP_EQUIPE, textoTelegram } from "../../../supabase/functions/_shared/avisos-modelos";
import { EXEMPLOS } from "../avisos";

describe("avisos da equipe pelo WhatsApp", () => {
  it("vira título e texto sem HTML nem quebra de linha, com o link escrito", () => {
    const m = avisoWhatsapp(textoTelegram("pedido_aprovado", EXEMPLOS.pedido_aprovado, { site: "https://erp.myfrost.ai" }));
    expect(m.titulo).toMatch(/^🛒 Venda aprovada · Pedido #/);
    expect(m.texto).not.toMatch(/[<>\n]/);
    expect(m.texto).toContain("Abrir no ERP: https://erp.myfrost.ai/pedidos");
    expect(m.texto).toMatch(/\*R\$/);
  });

  it("todos os avisos da equipe cabem no modelo", () => {
    for (const tipo of Object.keys(EXEMPLOS).filter((t) => !t.startsWith("cli_"))) {
      const m = avisoWhatsapp(textoTelegram(tipo, EXEMPLOS[tipo], { nome: "Ana Souza", papel: "admin", site: "https://erp" }));
      expect(m.titulo.length, tipo).toBeGreaterThan(0);
      expect(m.texto.length, tipo).toBeLessThanOrEqual(1000);
      expect(m.texto, tipo).not.toMatch(/\n|&amp;|&lt;/);
    }
  });

  it("modelo não começa nem termina com variável", () => {
    expect(MODELO_WHATSAPP_EQUIPE.texto).not.toMatch(/^\{\{|\}\}\s*$/);
    expect(MODELO_WHATSAPP_EQUIPE.exemplo).toHaveLength(2);
  });
});
