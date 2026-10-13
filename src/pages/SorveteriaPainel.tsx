// Painel de senhas (erp.myfrost.ai/sorveteria/painel): para a TV do balcão. Mostra o que está preparando e o que está pronto.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUnidade } from "@/lib/unidade";
import { usarLoja, useSorveteria } from "@/lib/sorveteria";

export default function SorveteriaPainel() {
  const { padrao } = useUnidade();
  usarLoja(padrao ?? "padrao");
  const { estado } = useSorveteria();
  const [, tic] = useState(0);
  useEffect(() => { const t = setInterval(() => tic((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  const lista = estado.pedidos.filter((p) => p.situacao !== "cancelado" && p.canal !== "delivery" && p.numero);
  const prep = lista.filter((p) => p.producao === "novo" || p.producao === "preparando"), pronto = lista.filter((p) => p.producao === "pronto");
  const Senhas = ({ itens, cor }: { itens: typeof lista; cor: string }) => (
    <div className="flex flex-wrap gap-3">{itens.length ? itens.map((p) => <span key={p.id} className={`rounded-2xl px-7 py-3 text-6xl font-extrabold ${cor}`}>{p.numero}</span>) : <span className="text-2xl opacity-50">—</span>}</div>
  );
  return (
    <div className="min-h-screen bg-[#12060d] p-6 text-white">
      <header className="mb-6 flex items-center"><h1 className="flex-1 text-3xl font-extrabold">🍨 {estado.loja.nome}</h1><Link to="/sorveteria" className="text-sm opacity-60 hover:opacity-100">sair</Link></header>
      <div className="grid gap-8 md:grid-cols-2">
        <section><h2 className="mb-4 text-2xl font-bold uppercase tracking-widest text-amber-300">Preparando</h2><Senhas itens={prep} cor="bg-[#3a1a2b]" /></section>
        <section><h2 className="mb-4 text-2xl font-bold uppercase tracking-widest text-emerald-300">Pronto! Retire no balcão</h2><Senhas itens={pronto} cor="bg-emerald-600 animate-pulse" /></section>
      </div>
    </div>
  );
}
