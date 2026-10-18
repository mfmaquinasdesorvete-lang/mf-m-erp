import { describe, expect, it } from "vitest";
import { situacaoOC, situacaoOP } from "../quadros";

const H = "2026-10-18";
describe("compras no quadro", () => {
  it("cotação sem fornecedor ou parada pede ação", () => {
    expect(situacaoOC({ status: "cotacao", created_at: H }, H)).toMatchObject({ etapa: "cotacao", nivel: 1, alerta: "sem fornecedor" });
    expect(situacaoOC({ status: "cotacao", created_at: "2026-10-10", fornecedor_id: "f" }, H)).toMatchObject({ nivel: 1, alerta: "cotação parada" });
    expect(situacaoOC({ status: "cotacao", created_at: H, fornecedor_id: "f" }, H)?.nivel).toBe(0);
  });
  it("entrega atrasada é vermelha; recebida antiga sai do quadro", () => {
    expect(situacaoOC({ status: "enviado", enviado_em: "2026-10-01", previsao_entrega: "2026-10-10" }, H)).toMatchObject({ nivel: 2, acao: "receber" });
    expect(situacaoOC({ status: "recebido", recebido_em: "2026-09-01" }, H)).toBeNull();
    expect(situacaoOC({ status: "cancelado" }, H)).toBeNull();
  });
});
describe("produção no quadro", () => {
  it("planejada com falta de peça manda comprar; sem falta, começar", () => {
    expect(situacaoOP({ status: "planejada", created_at: H }, 2, H)).toMatchObject({ nivel: 1, acao: "comprar" });
    expect(situacaoOP({ status: "planejada", created_at: H }, 0, H)).toMatchObject({ nivel: 0, acao: "iniciar" });
    expect(situacaoOP({ status: "em_producao", created_at: H, previsao: "2026-10-01" }, 0, H)).toMatchObject({ nivel: 2, alerta: "atrasada" });
  });
  it("só mostra as prontas do mês", () => {
    expect(situacaoOP({ status: "concluida", concluida_em: "2026-10-05T10:00:00Z" }, 0, H)?.etapa).toBe("concluida");
    expect(situacaoOP({ status: "concluida", concluida_em: "2026-09-05T10:00:00Z" }, 0, H)).toBeNull();
  });
});
