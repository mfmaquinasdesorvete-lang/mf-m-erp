// Título da janela de cadastro (30/10, auditoria dos cadastros A4)
import { describe, expect, it } from "vitest";
import { tituloCadastro } from "@/components/CrudPage";

describe("título da janela de cadastro", () => {
  it("novo no masculino e no feminino", () => {
    expect(tituloCadastro("fornecedor", {})).toBe("Novo fornecedor");
    expect(tituloCadastro("peça", null)).toBe("Nova peça");
    expect(tituloCadastro("embalagem", {})).toBe("Nova embalagem");
    expect(tituloCadastro("forma de pagamento", {})).toBe("Nova forma de pagamento");
    expect(tituloCadastro("técnico", {})).toBe("Novo técnico");
  });
  it("editar com o nome de quem é", () => {
    expect(tituloCadastro("fornecedor", { id: "1", nome: "Inox Ltda", nome_fantasia: "Inox Paulista" })).toBe("Editar fornecedor · Inox Paulista");
    expect(tituloCadastro("peça", { id: "2", descricao: "Bico dosador inox" })).toBe("Editar peça · Bico dosador inox");
    expect(tituloCadastro("técnico", { id: "3" })).toBe("Editar técnico");
  });
});
