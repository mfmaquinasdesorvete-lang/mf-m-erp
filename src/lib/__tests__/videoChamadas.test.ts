import { describe, expect, it } from "vitest";
import { resumoVideo, situacaoVideo, SEM_TECNICO, type OsVideo } from "../videoChamadas";

const agora = new Date("2026-10-21T13:00:00");
const os = (x: Partial<OsVideo>): OsVideo => ({ id: Math.random().toString(), numero: 1, status: "aberta", atendimento: "video", valor_mao_obra: 150, horas_tecnicas: 1, ...x });

describe("vídeo chamadas", () => {
  it("situação segue aceite → Pix → agendar → agendada → feita", () => {
    expect(situacaoVideo(os({}))).toBe("aceite");
    expect(situacaoVideo(os({ orcamento_aprovado_em: "x" }))).toBe("pix");
    expect(situacaoVideo(os({ orcamento_aprovado_em: "x", em_garantia: true }))).toBe("agendar");
    expect(situacaoVideo(os({ orcamento_aprovado_em: "x", video_pago_em: "x", agendado_em: "2026-10-21T15:00:00" }))).toBe("agendada");
    expect(situacaoVideo(os({ status: "concluida" }))).toBe("feita");
  });

  it("agenda de hoje, próximas e o financeiro de cada técnico", () => {
    const r = resumoVideo([
      os({ tecnico: "Ana", orcamento_aprovado_em: "x", video_pago_em: "2026-10-20T10:00:00", agendado_em: "2026-10-21T15:00:00" }),
      os({ tecnico: "Ana", orcamento_aprovado_em: "x" }),
      os({ tecnico: "Bruno", status: "concluida", video_pago_em: "x", valor_mao_obra: 300, horas_tecnicas: 2 }),
      os({ tecnico: "", em_garantia: true, orcamento_aprovado_em: "x" }),
      os({ tecnico: "Ana", status: "cancelada" }),
      os({ atendimento: "oficina", tecnico: "Ana" }),
    ], agora);
    expect(r.total).toBe(4);
    expect(r.hoje).toBe(1);
    expect(r.proximas).toHaveLength(1);
    expect(r.pendentes).toHaveLength(2);
    expect(r.recebido).toBe(450);
    expect(r.aReceber).toBe(150);
    expect(r.porTecnico.map((t) => [t.tecnico, t.chamadas, t.recebido, t.aReceber])).toEqual([
      ["Ana", 2, 150, 150], ["Bruno", 1, 300, 0], [SEM_TECNICO, 1, 0, 0],
    ]);
  });
});
