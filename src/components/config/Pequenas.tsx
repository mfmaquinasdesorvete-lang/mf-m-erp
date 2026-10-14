// Configurações em páginas menores: Comissões, Contador, Avisos automáticos, Caixa de e-mail e Dados e backup.
import { useState } from "react";
import { Link } from "react-router-dom";
import { FileDown, HandCoins, Users } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { AvisosConfig } from "@/components/Avisos";
import { EmailConfig } from "@/components/EmailConfig";
import { BackupsConfig } from "@/components/BackupsConfig";
import { ApagarTestes } from "@/components/ApagarTestes";
import { useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { usePerfil } from "@/lib/auth";
import { BotaoSalvar, Bloco, CabecalhoSecao, campo, Opcao, secaoPorId, useCfgPagina } from "./comum";
import { pl } from "@/lib/format";

export function ConfigComissoes() {
  const s = secaoPorId("comissoes")!;
  const { cfg, set, salvar, salvando } = useCfgPagina(["comissao_percentual"], (r) => ({ comissao_percentual: Number(String(r.comissao_percentual ?? 0).replace(",", ".")) || 0 }));
  const { data: vendedores = [] } = useRows<{ id: string; ativo: boolean; percentual?: number | null }>("vendedores");
  const { data: regras = [] } = useRows<{ id: string }>("comissao_regras");
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;
  const input = campo(cfg, set);
  const ativos = vendedores.filter((v) => v.ativo !== false);
  return (
    <div className="max-w-3xl">
      <CabecalhoSecao s={s} acoes={<BotaoSalvar form="form-comissoes" salvando={salvando} />} />
      <form id="form-comissoes" onSubmit={salvar} className="space-y-5">
        <Bloco titulo="Percentual padrão" descricao="É o percentual que o vendedor recebe quando é criado a partir de um usuário; depois cada vendedor pode ter o seu. No pedido, vale nesta ordem: o % digitado no pedido → a regra do vendedor na categoria → a regra da categoria → o % do vendedor.">
          <div className="max-w-xs">{input("comissao_percentual", "Comissão padrão (%)", "", "number", { min: 0, max: 100 })}</div>
        </Bloco>
      </form>
      <Card className="mt-5 p-4 sm:p-5">
        <h2 className="mb-3 font-semibold text-fg">Vendedores e regras</h2>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 p-3"><div className="num text-2xl font-bold text-fg">{ativos.length}</div><div className="text-xs text-slate-500">{pl(ativos.length, "vendedor ativo", "vendedores ativos")}</div></div>
          <div className="rounded-xl border border-slate-200 p-3"><div className="num text-2xl font-bold text-fg">{regras.length}</div><div className="text-xs text-slate-500">{pl(regras.length, "regra", "regras")} por categoria</div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/comissoes" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg"><HandCoins size={16} /> Abrir Comissões</Link>
          <span className="self-center text-xs text-slate-500">Lá ficam os vendedores e representantes, as regras por categoria e o relatório para pagar.</span>
        </div>
      </Card>
    </div>
  );
}

export function ConfigContador() {
  const s = secaoPorId("contador")!;
  const { cfg, set, mudar, salvar, salvando } = useCfgPagina(["contador_nome", "contador_email", "contador_envio_auto", "contador_envio_dia"]);
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;
  const input = campo(cfg, set);
  return (
    <div className="max-w-3xl">
      <CabecalhoSecao s={s} acoes={<BotaoSalvar form="form-contador" salvando={salvando} />} />
      <form id="form-contador" onSubmit={salvar} className="space-y-5">
        <Bloco titulo="Escritório de contabilidade" descricao={<>Para o contador entrar no ERP (só consulta), crie um usuário com o papel <b>Contador</b> em <Link to="/usuarios" className="font-semibold underline">Usuários</Link>.</>}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {input("contador_nome", "Nome do contador / escritório")}
            {input("contador_email", "E-mail do contador", "", "email")}
          </div>
        </Bloco>
        <Bloco titulo="Fechamento do mês">
          <Opcao ligado={!!cfg.contador_envio_auto} onChange={(v) => mudar({ contador_envio_auto: v })}>
            Enviar sozinho, todo mês, o pacote do mês anterior (XML das notas + planilhas) por e-mail
          </Opcao>
          <label className="mt-2 block max-w-xs">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Dia do envio</span>
            <select className="input" value={cfg.contador_envio_dia ?? 5} onChange={(e) => mudar({ contador_envio_dia: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>dia {d}</option>)}
            </select>
          </label>
        </Bloco>
      </form>
    </div>
  );
}

export function ConfigAvisos() {
  const s = secaoPorId("avisos")!;
  return (
    <div className="max-w-4xl">
      <CabecalhoSecao s={s} />
      <Card className="p-4 sm:p-5"><AvisosConfig /></Card>
    </div>
  );
}

export function ConfigEmail() {
  const s = secaoPorId("email")!;
  return (
    <div className="max-w-4xl">
      <CabecalhoSecao s={s} />
      <Card className="p-4 sm:p-5"><EmailConfig /></Card>
    </div>
  );
}

export function ConfigDados() {
  const s = secaoPorId("dados")!;
  const { papel, tem } = usePerfil();
  return (
    <div className="max-w-4xl space-y-5">
      <CabecalhoSecao s={s} />
      {tem("financeiro") && <BackupsConfig />}
      <ExportarTudo />
      {papel === "admin" ? <ApagarTestes /> : (
        <Card className="p-4 text-sm text-slate-500"><Users size={16} className="mr-1 inline" aria-hidden /> Apagar dados de teste: só o administrador.</Card>
      )}
    </div>
  );
}

function ExportarTudo() {
  const [etapa, setEtapa] = useState("");
  async function baixar() {
    try {
      const { exportarTudo } = await import("@/lib/exportar");
      await exportarTudo(async (tabela, de, ate) => {
        const { data, error } = await supabase.from(tabela).select("*").range(de, ate);
        if (error) throw error;
        return data ?? [];
      }, setEtapa);
      notify("Planilha baixada");
    } catch (e) { notifyError(e); } finally { setEtapa(""); }
  }
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="mb-1 font-semibold">Exportar todos os dados</h2>
      <p className="mb-3 text-sm text-slate-600">
        Baixa uma planilha do Excel com tudo do ERP: clientes, fornecedores, produtos, estoque, pedidos, OS, contas, notas e produção,
        uma aba para cada. Serve de cópia de segurança ou para mandar ao contador.
      </p>
      <Button type="button" variant="secondary" onClick={baixar} disabled={!!etapa}><FileDown size={16} /> {etapa ? `Lendo ${etapa}…` : "Baixar planilha completa"}</Button>
    </Card>
  );
}
