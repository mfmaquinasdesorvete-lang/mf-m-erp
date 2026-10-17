import { describe, expect, it } from "vitest";
import { buscarSetores, ehCelular, emailsDaLista, linkTelefone, linkWhatsApp, porSetor, setorDoEmail, type ContatoContabil } from "../contabilidade";

const c = (id: string, setor: ContatoContabil["setor"], nome: string, email: string | null, whatsapp: string | null, x: Partial<ContatoContabil> = {}): ContatoContabil =>
  ({ id, setor, nome, email, whatsapp, observacao: null, ordem: Number(id), ativo: true, ...x });
const LISTA = [
  c("1", "recepcao", "Ana Exemplo", "atendimento@escritorio-exemplo.com.br", "(19) 9 1111-2222"),
  c("2", "fiscal", "Bia Exemplo", "fiscal01@escritorio-exemplo.com.br", "(19) 3000-1000"),
  c("3", "fiscal", "Caio Exemplo", "fiscal02@escritorio-exemplo.com.br", null),
  c("4", "pessoal", "Duda Exemplo", "pessoal01@escritorio-exemplo.com.br", "19 98888-7777"),
  c("5", "pessoal", "Edu Saiu", "pessoal02@escritorio-exemplo.com.br", null, { ativo: false }),
];

describe("contatos da contabilidade", () => {
  it("WhatsApp só para celular (com o 55); fixo vira telefone", () => {
    expect(ehCelular("(19) 9 1111-2222")).toBe(true);
    expect(ehCelular("(19) 3000-1000")).toBe(false);
    expect(linkWhatsApp("(19) 9 1111-2222")).toBe("https://wa.me/5519911112222");
    expect(linkWhatsApp("+55 19 98888-7777")).toBe("https://wa.me/5519988887777");
    expect(linkWhatsApp("(19) 3000-1000")).toBeNull();
    expect(linkTelefone("(19) 3000-1000")).toBe("tel:+551930001000");
    expect(linkTelefone(null)).toBeNull();
  });

  it("por setor na ordem de uso (fiscal antes da recepção), sem os desativados nem setor vazio", () => {
    const g = porSetor(LISTA);
    expect(g.map((s) => s.id)).toEqual(["fiscal", "pessoal", "recepcao"]);
    expect(g[1].contatos.map((x) => x.nome)).toEqual(["Duda Exemplo"]);
  });

  it("quem procurar: pelo assunto, sem acento, ou pelo nome da pessoa", () => {
    expect(buscarSetores(LISTA, "férias").map((s) => s.id)).toEqual(["pessoal"]);
    expect(buscarSetores(LISTA, "guia icms").map((s) => s.id)).toEqual(["fiscal"]);
    expect(buscarSetores(LISTA, "caio").flatMap((s) => s.contatos.map((x) => x.id))).toEqual(["3"]);
    expect(buscarSetores(LISTA, "")).toHaveLength(3);
  });

  it("setor de quem recebe o pacote do mês pelo e-mail (maiúsculas não importam)", () => {
    expect(setorDoEmail(LISTA, "FISCAL02@ESCRITORIO-EXEMPLO.COM.BR")?.setor).toBe("fiscal");
    expect(setorDoEmail(LISTA, "outro@x.com")).toBeNull();
    // o campo pode ter mais de um e-mail (o pacote vai para todos)
    expect(emailsDaLista("Financeiro@escritorio-exemplo.com.br, fiscal01@escritorio-exemplo.com.br;")).toEqual(["financeiro@escritorio-exemplo.com.br", "fiscal01@escritorio-exemplo.com.br"]);
    expect(emailsDaLista(null)).toEqual([]);
  });
});
