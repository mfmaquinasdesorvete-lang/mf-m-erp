// Importar dados: todas as importações num lugar só (Tiny, planilhas, XML de notas, extrato do banco, base da My Frost).
// Cada uma continua também na tela onde é usada; aqui só aparecem as que o papel da pessoa pode fazer.
import { useState, type ReactNode } from "react";
import { Archive, Boxes, Building2, Cloud, FileSpreadsheet, FileText, FileUp, Landmark, Package, ScrollText, Truck, Users, type LucideIcon } from "lucide-react";
import { Button, Modal, PageHeader } from "@/components/ui";
import { usePerfil } from "@/lib/auth";
import { useRows } from "@/lib/data";
import { ImportarXmlNotas } from "@/components/ImportarXmlNotas";
import { ImportarContatos } from "@/components/ImportarContatos";
import { ImportarProdutos } from "@/components/ImportarProdutos";
import { ImportarKitsTiny } from "@/components/produtos/ImportarKitsTiny";
import { ImportarPropostasTiny } from "@/components/vendas/ImportarPropostasTiny";
import { ImportarMyFrost } from "@/components/clientes/ImportarMyFrost";
import { ImportarTiny } from "@/components/ImportarTiny";
import { ImportarPedidosTiny } from "@/components/vendas/ImportarPedidosTiny";
import { ImportarModal, type ContaBancaria } from "@/pages/Conciliacao";

type Id = "nfe_emitidas" | "nfe_recebidas" | "clientes" | "fornecedores" | "transportadoras" | "produtos" | "kits" | "propostas" | "pedidos_tiny" | "extrato" | "myfrost" | "tiny_api";
type Cartao = { id: Id; grupo: string; titulo: string; resumo: string; vaiPara: string; icone: LucideIcon; cor: string; pode: boolean };

export default function Importar() {
  const { papel, tem, pode } = usePerfil();
  const [aberto, setAberto] = useState<Id | null>(null);
  const fechar = () => setAberto(null);
  const admin = papel === "admin";
  const cartoes: Cartao[] = [
    { id: "nfe_emitidas", grupo: "Notas fiscais", titulo: "Notas emitidas no Tiny", resumo: "XML ou .zip das NF-e de venda emitidas no sistema anterior (histórico)", vaiPara: "Notas fiscais → emitidas", icone: FileText, cor: "from-fixo-sky-500 to-fixo-blue-600", pode: pode("nfe_recebidas") },
    { id: "nfe_recebidas", grupo: "Notas fiscais", titulo: "Notas de fornecedores", resumo: "XML ou .zip que o fornecedor mandou (quando a nota não veio pela SEFAZ)", vaiPara: "Notas fiscais → recebidas", icone: FileUp, cor: "from-fixo-cyan-500 to-fixo-cyan-700", pode: pode("nfe_recebidas") },
    { id: "clientes", grupo: "Cadastros", titulo: "Clientes", resumo: "Planilha de contatos exportada do Tiny", vaiPara: "Vendas → Clientes", icone: Users, cor: "from-fixo-emerald-500 to-fixo-emerald-600", pode: tem("financeiro") },
    { id: "fornecedores", grupo: "Cadastros", titulo: "Fornecedores", resumo: "Planilha de contatos exportada do Tiny", vaiPara: "Fábrica e estoque → Fornecedores", icone: Building2, cor: "from-fixo-orange-500 to-fixo-red-600", pode: tem("financeiro") },
    { id: "transportadoras", grupo: "Cadastros", titulo: "Transportadoras", resumo: "Planilha de contatos exportada do Tiny", vaiPara: "Logística → Transportadoras", icone: Truck, cor: "from-fixo-purple-500 to-fixo-violet-700", pode: tem("financeiro") },
    { id: "produtos", grupo: "Produtos", titulo: "Produtos do Tiny", resumo: "Planilha de produtos (descrição, códigos, NCM, preços)", vaiPara: "Fábrica e estoque → Produtos e estoque", icone: Package, cor: "from-fixo-amber-500 to-fixo-amber-700", pode: pode("editar_produtos") },
    { id: "kits", grupo: "Produtos", titulo: "Kits do Tiny", resumo: "Composição dos kits (o que vai dentro de cada um)", vaiPara: "Produtos e estoque → kits", icone: Boxes, cor: "from-fixo-pink-500 to-fixo-pink-700", pode: pode("editar_produtos") },
    { id: "propostas", grupo: "Vendas", titulo: "Propostas do Tiny", resumo: "Planilhas de propostas comerciais (histórico de MF e My Frost)", vaiPara: "Venda de Máquinas → Propostas do Tiny", icone: ScrollText, cor: "from-fixo-emerald-500 to-fixo-emerald-700", pode: admin },
    { id: "pedidos_tiny", grupo: "Vendas", titulo: "Pedidos de venda do Tiny", resumo: "Todos os pedidos de venda, com itens, direto da API do Tiny (histórico completo, ligado às notas)", vaiPara: "Venda de Peças e Venda de Máquinas", icone: Cloud, cor: "from-fixo-sky-500 to-fixo-emerald-700", pode: admin },
    { id: "extrato", grupo: "Bancos", titulo: "Extrato do banco", resumo: "Arquivo OFX ou CSV do banco para conferir com as contas", vaiPara: "Financeiro → Bancos e conciliação", icone: Landmark, cor: "from-fixo-amber-500 to-fixo-orange-600", pode: pode("editar_financeiro") },
    { id: "myfrost", grupo: "Bases antigas", titulo: "Base da My Frost", resumo: "Clientes, máquinas e peças da empresa anterior, do backup do Tiny", vaiPara: "Clientes (com etiqueta da máquina)", icone: Archive, cor: "from-fixo-slate-500 to-fixo-slate-700", pode: admin },
    { id: "tiny_api", grupo: "Bases antigas", titulo: "Tiny pela API", resumo: "Cadastros, produtos com estoque e contas em aberto direto da API do Tiny (precisa do token nos segredos do Supabase)", vaiPara: "Vários cadastros", icone: Cloud, cor: "from-fixo-slate-600 to-fixo-slate-900", pode: admin },
  ];
  const visiveis = cartoes.filter((c) => c.pode);
  const grupos = [...new Set(visiveis.map((c) => c.grupo))];

  return (
    <div className="max-w-6xl">
      <PageHeader title="Importar dados" subtitle="Tudo o que entra no ERP vindo do Tiny, de planilhas, XML e extratos. Cada importação também fica na tela onde é usada." />
      {!visiveis.length && <p className="text-sm text-slate-500">O seu perfil não faz importações.</p>}
      <div className="space-y-6">
        {grupos.map((g) => (
          <section key={g}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{g}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visiveis.filter((c) => c.grupo === g).map((c) => (
                <div key={c.id} className="cartao flex gap-3 p-4">
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${c.cor} text-white shadow-card`} aria-hidden><c.icone size={22} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-fg">{c.titulo}</div>
                    <p className="text-sm text-slate-500">{c.resumo}</p>
                    <p className="mt-1 text-xs text-slate-500">Vai para: <b className="font-semibold text-slate-600">{c.vaiPara}</b></p>
                    <Button type="button" variant="secondary" className="mt-2" onClick={() => setAberto(c.id)}><FileSpreadsheet size={16} aria-hidden /> Importar</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {aberto === "nfe_emitidas" && <ImportarXmlNotas tipo="emitidas" onClose={fechar} />}
      {aberto === "nfe_recebidas" && <ImportarXmlNotas tipo="recebidas" onClose={fechar} />}
      {aberto === "clientes" && <ImportarContatos tipo="cliente" onClose={fechar} />}
      {aberto === "fornecedores" && <ImportarContatos tipo="fornecedor" onClose={fechar} />}
      {aberto === "transportadoras" && <ImportarContatos tipo="transportadora" onClose={fechar} />}
      {aberto === "produtos" && <ImportarProdutos onClose={fechar} />}
      {aberto === "kits" && <ImportarKitsTiny onClose={fechar} />}
      {aberto === "propostas" && <ImportarPropostasTiny onClose={fechar} />}
      {aberto === "myfrost" && <ImportarMyFrost onClose={fechar} />}
      {aberto === "extrato" && <Extrato onClose={fechar} />}
      {aberto === "pedidos_tiny" && <Janela titulo="Pedidos de venda do Tiny" onClose={fechar}><ImportarPedidosTiny /></Janela>}
      {aberto === "tiny_api" &&<Janela titulo="Tiny pela API" onClose={fechar}><ImportarTiny /></Janela>}
    </div>
  );
}

function Extrato({ onClose }: { onClose: () => void }) {
  const { data: bancos = [] } = useRows<ContaBancaria>("contas_bancarias", { order: "nome", ascending: true });
  return <ImportarModal bancos={bancos.filter((b) => b.ativo)} contaInicial="" onClose={onClose} />;
}

function Janela({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: ReactNode }) {
  return <Modal open onClose={onClose} title={titulo} wide>{children}</Modal>;
}
