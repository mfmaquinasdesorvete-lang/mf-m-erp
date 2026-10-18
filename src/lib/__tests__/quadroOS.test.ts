import { describe, expect, it } from "vitest";
import { proximoStatus, situacaoOS } from "../quadroOS";

const H = "2026-10-18";
describe("OS no quadro", () => {
  it("põe cada situação na etapa certa", () => {
    expect(situacaoOS({ status: "aberta", data_entrada: H }, H)?.etapa).toBe("recebida");
    expect(situacaoOS({ status: "aguardando_peca", data_entrada: H }, H)?.etapa).toBe("peca");
    expect(situacaoOS({ status: "concluida", data_entrada: "2026-10-01", concluida_em: "2026-10-17T10:00:00Z" }, H)?.etapa).toBe("pronta");
    expect(situacaoOS({ status: "cancelada", data_entrada: H }, H)).toBeNull();
    expect(situacaoOS({ status: "entregue", data_entrada: "2026-08-01", entregue_em: "2026-09-01T10:00:00Z" }, H)).toBeNull();
  });
  it("marca previsão estourada e OS parada", () => {
    expect(situacaoOS({ status: "em_reparo", data_entrada: H, previsao: "2026-10-10" }, H)).toMatchObject({ nivel: 2, alerta: "previsão estourada" });
    expect(situacaoOS({ status: "aberta", data_entrada: "2026-10-10" }, H)).toMatchObject({ nivel: 1, acao: "diagnosticar" });
    expect(situacaoOS({ status: "concluida", data_entrada: "2026-09-01", concluida_em: "2026-10-01T10:00:00Z" }, H)).toMatchObject({ nivel: 1, alerta: "pronta e não retirada" });
  });
  it("vídeo chamada segue termo → Pix → agendar", () => {
    const v = { status: "aberta", data_entrada: H, atendimento: "video" };
    expect(situacaoOS(v, H)?.proximo).toContain("termo");
    expect(situacaoOS({ ...v, orcamento_aprovado_em: H }, H)?.proximo).toContain("Pix");
    expect(situacaoOS({ ...v, orcamento_aprovado_em: H, video_pago_em: H }, H)).toMatchObject({ nivel: 1, acao: "agendar" });
    expect(situacaoOS({ ...v, orcamento_aprovado_em: H, em_garantia: true, agendado_em: "2026-10-15T14:00:00Z" }, H)).toMatchObject({ nivel: 2, alerta: "vídeo chamada já passou" });
  });
  it("botão avança a situação quando dá", () => {
    expect(proximoStatus("diagnosticar")).toBe("em_diagnostico");
    expect(proximoStatus("orcamento")).toBe("aguardando_aprovacao");
    expect(proximoStatus("peca_chegou")).toBe("em_reparo");
    expect(proximoStatus("concluir")).toBeNull();
  });
});
