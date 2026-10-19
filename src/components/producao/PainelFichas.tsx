// Painel da ficha técnica (topo de Produção → Ficha técnica): quantas máquinas já têm ficha, a margem sobre as peças,
// peças sem custo (que deixam o custo incompleto), custo × preço de cada máquina e as de menor margem primeiro.
// Clicar numa máquina do ranking abre a ficha dela.
import { useMemo } from "react";
import { AlertTriangle, ClipboardList, Layers, Percent } from "lucide-react";
import { Section } from "@/components/ui";
import { Colunas, Ranking } from "@/components/Charts";
import { CartaoPainel, type Cartao } from "@/components/painel/Painel";
import { brl, pl } from "@/lib/format";
import { custoEstrutura, temFicha, type LinhaFicha } from "@/lib/estrutura";
import { ehKitAberto } from "@/lib/kits";
import type { KitComponente, Produto } from "@/lib/types";

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const curto = (s: string, n = 18) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function PainelFichas({ maquinas, fabricados, produtos, fichas, kits, onAbrir }: {
  maquinas: Produto[]; fabricados: Produto[]; produtos: Produto[]; fichas: LinhaFicha[]; kits: KitComponente[];
  onAbrir: (id: string) => void;
}) {
  const r = useMemo(() => {
    const comFicha = maquinas.filter((m) => temFicha(fichas, m.id));
    const linhas = comFicha.map((m) => {
      const custo = custoEstrutura(fichas, produtos, m.id, kits);
      const preco = Number(m.preco_venda ?? 0);
      return { m, custo, preco, margem: preco > 0 ? (preco - custo) / preco : null };
    });
    const comPreco = linhas.filter((l) => l.margem != null);
    const margemMedia = comPreco.length ? comPreco.reduce((v, l) => v + l.preco - l.custo, 0) / comPreco.reduce((v, l) => v + l.preco, 0) : null;
    // peça (sem ficha própria e sem kit) usada em alguma ficha e sem custo no cadastro
    const usadas = new Set(fichas.map((f) => f.componente_id));
    const semCusto = [...usadas].filter((id) => !temFicha(fichas, id) && !ehKitAberto(id, kits)
      && !(Number(produtos.find((p) => p.id === id)?.preco_custo ?? 0) > 0)).length;
    return { comFicha, linhas, comPreco, margemMedia, semCusto };
  }, [maquinas, fichas, produtos, kits]);

  const semFicha = maquinas.length - r.comFicha.length;
  const terceiro = fabricados.filter((p) => p.origem_producao === "terceirizado").length;
  const porPreco = [...r.linhas].sort((a, b) => b.preco - a.preco).slice(0, 8);
  const piores = [...r.comPreco].sort((a, b) => a.margem! - b.margem!).slice(0, 8);
  const cartoes: Cartao[] = [
    { id: "fichas", rotulo: "Máquinas com ficha", valor: `${r.comFicha.length} de ${maquinas.length}`, sub: semFicha ? `${semFicha} ${pl(semFicha, "sem ficha", "sem ficha")}` : "todas com ficha", icone: ClipboardList, cor: semFicha ? "var(--kpi-laranja)" : "var(--kpi-verde)" },
    { id: "margem", rotulo: "Margem sobre as peças", valor: r.margemMedia == null ? "—" : pct(r.margemMedia), sub: `média de ${r.comPreco.length} ${pl(r.comPreco.length, "máquina", "máquinas")} com preço`, icone: Percent, cor: r.margemMedia != null && r.margemMedia < 0.25 ? "#dc2626" : "var(--serie-1)" },
    { id: "semcusto", rotulo: "Peças sem custo", valor: r.semCusto, sub: r.semCusto ? "o custo das fichas fica incompleto" : "todas com custo", icone: AlertTriangle, cor: r.semCusto ? "#dc2626" : "var(--kpi-verde)" },
    { id: "fabricados", rotulo: "Fabricados aqui", valor: fabricados.length, sub: terceiro ? `${terceiro} com etapa em terceiro` : "pás, eixos, subconjuntos", icone: Layers, cor: "var(--kpi-roxo)" },
  ];

  return (
    <div className="mb-5 space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cartoes.map((c) => <CartaoPainel key={c.id} c={c} />)}</div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Section title="Custo das peças × preço de venda" className="min-w-0 xl:col-span-3">
          <Colunas altura={220} vazio="Nenhuma máquina com ficha ainda."
            dados={porPreco.map((l) => ({ rotulo: l.m.sku?.trim() || curto(l.m.descricao.replace(/^m[áa]quina (de )?(sorvete )?/i, "")), valores: [l.custo, l.preco] }))}
            series={[{ nome: "Custo das peças", cor: "var(--kpi-laranja)" }, { nome: "Preço de venda", cor: "var(--serie-1)" }]} />
        </Section>
        <Section title="Menor margem primeiro" className="min-w-0 xl:col-span-2">
          <Ranking cor="var(--kpi-roxo)" formatar={pct} vazio="Cadastre o preço de venda das máquinas para ver a margem."
            onClicar={(i) => onAbrir(piores[i].m.id)}
            itens={piores.map((l) => ({ rotulo: l.m.descricao, valor: Math.max(l.margem!, 0), detalhe: `custo ${brl(l.custo)} · preço ${brl(l.preco)}${l.margem! < 0 ? " · ⚠ abaixo do custo" : ""}` }))} />
        </Section>
      </div>
    </div>
  );
}
