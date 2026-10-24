// Retaguarda: o que só a conta master (a dona) abre. Os outros administradores tocam a operação inteira, mas não
// veem a carteira pessoal, a My Frost Sorveterias, os usuários e permissões nem as configurações da empresa.
import { Link } from "react-router-dom";
import { BadgeDollarSign, ChevronRight, Database, FileText, IceCreamCone, Landmark, Lock, Settings, ShieldAlert, Upload, UserCog, Wallet, Zap, type LucideIcon } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { VendasDoAno } from "@/components/gerencial/PainelVendasAno";

type Atalho = { to: string; titulo: string; texto: string; icone: LucideIcon; cor: string };

export const ATALHOS_RETAGUARDA: { grupo: string; itens: Atalho[] }[] = [
  {
    grupo: "Minha carteira",
    itens: [
      { to: "/pessoal", titulo: "Painel pessoal", texto: "Suas contas, cartões, gastos e empresas, separados da MF", icone: Wallet, cor: "bg-fixo-amber-700" },
      { to: "/retaguarda/entradas", titulo: "Entradas acima de R$ 5 mil", texto: "Dinheiro grande que entrou nas contas da MF e ainda não tem dono: escreva de quem é e o que foi", icone: BadgeDollarSign, cor: "bg-fixo-green-700" },
      { to: "/retaguarda/notas-my-frost", titulo: "My Frost (empresa anterior)", texto: "Notas fiscais por ano e tipo, com a planilha para o contador, e as propostas de compra dela, guardadas à parte da MF", icone: FileText, cor: "bg-fixo-sky-700" },
      { to: "/licenciados", titulo: "My Frost Sorveterias", texto: "Lojas licenciadas, máquinas, contratos e pagamentos", icone: IceCreamCone, cor: "bg-fixo-pink-700" },
    ],
  },
  {
    grupo: "Quem entra e o que pode",
    itens: [
      { to: "/usuarios", titulo: "Usuários e permissões", texto: "Criar usuários, papéis, senhas e o registro de acessos (entrada, saída e tempo parado)", icone: UserCog, cor: "bg-fixo-indigo-700" },
      { to: "/auditoria", titulo: "Auditoria", texto: "Histórico de alterações e exceções do financeiro", icone: ShieldAlert, cor: "bg-fixo-red-700" },
    ],
  },
  {
    grupo: "Empresa e sistema",
    itens: [
      { to: "/configuracoes", titulo: "Configurações da empresa", texto: "Empresa, unidades, NF-e, recebimentos, comissões, descontos e avisos", icone: Settings, cor: "bg-fixo-slate-700" },
      { to: "/configuracoes/bancos", titulo: "Bancos e integrações", texto: "Contas, Banco Inter, Open Finance e extratos automáticos", icone: Landmark, cor: "bg-fixo-blue-600" },
      { to: "/configuracoes/dados", titulo: "Dados e backups", texto: "Cópias de segurança e exportação completa", icone: Database, cor: "bg-fixo-cyan-700" },
      { to: "/automacoes", titulo: "Automações", texto: "O que o ERP faz sozinho e quando: rotinas agendadas, avisos e a IA", icone: Zap, cor: "bg-fixo-purple-700" },
      { to: "/importar", titulo: "Importar dados", texto: "Planilhas e XML do Tiny, extratos e cadastros", icone: Upload, cor: "bg-fixo-violet-700" },
    ],
  },
];

export default function Retaguarda() {
  return (
    <div>
      <PageHeader title="Retaguarda" subtitle="Só a conta master vê esta área. Os outros administradores tocam a operação, sem estas telas." />
      <p className="mb-4 flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
        <Lock size={16} className="shrink-0" /> Criar ou mudar administradores também só pela conta master (o banco confere).
      </p>
      <VendasDoAno />
      <div className="space-y-5">
        {ATALHOS_RETAGUARDA.map((g) => (
          <section key={g.grupo}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{g.grupo}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.itens.map((a) => {
                const Icone = a.icone;
                return (
                  <Link key={a.to} to={a.to} className="group">
                    <Card className="flex h-full items-center gap-3 p-3 transition group-hover:border-brand/60 sm:p-4">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${a.cor}`} aria-hidden><Icone size={20} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-fg">{a.titulo}</span>
                        <span className="block text-xs text-slate-500">{a.texto}</span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-slate-400" />
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
