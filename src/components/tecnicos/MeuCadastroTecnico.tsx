// Meu cadastro (app da assistência): o técnico da equipe confere e corrige os próprios dados — contato, cidade e o que
// ele atende. O cadastro dele é achado pelo nome do usuário (o mesmo jeito que acha as OS dele).
import { useEffect, useState } from "react";
import { useInvalidate, useRows } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { notify, notifyError } from "@/lib/notify";
import { acharCadastro } from "@/lib/tecnicos";

type Cadastro = { id: string; nome: string; tipo: string; whatsapp: string | null; telefone: string | null; email: string | null;
  municipio: string | null; uf: string | null; especialidades: string | null };
const CAMPOS = ["whatsapp", "telefone", "email", "municipio", "uf", "especialidades"] as const;
type Campo = (typeof CAMPOS)[number];
const ROTULO: Record<Campo, string> = { whatsapp: "WhatsApp", telefone: "Telefone", email: "E-mail", municipio: "Cidade onde mora",
  uf: "UF", especialidades: "Especialidades (o que você atende)" };
const campo = "w-full rounded-2xl border border-white/15 bg-noite-cartao px-4 py-3 text-base placeholder:text-noite-apagado focus:border-fixo-teal-500 focus:outline-none";

export function MeuCadastroTecnico({ nome }: { nome: string | null | undefined }) {
  const invalidar = useInvalidate();
  const { data: tecnicos = [], isLoading, error } = useRows<Cadastro>("tecnicos", { select: "id,nome,tipo,whatsapp,telefone,email,municipio,uf,especialidades", order: "nome", ascending: true });
  const meu = acharCadastro(tecnicos, nome);
  const [form, setForm] = useState<Record<Campo, string>>(() => Object.fromEntries(CAMPOS.map((c) => [c, ""])) as Record<Campo, string>);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (meu) setForm(Object.fromEntries(CAMPOS.map((c) => [c, meu[c] ?? ""])) as Record<Campo, string>); }, [meu?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <p className="rounded-2xl border border-white/10 p-4 text-sm text-noite-fraco">Carregando o seu cadastro…</p>;
  if (error) return <p className="rounded-2xl border border-fixo-rose-400/30 p-4 text-sm text-fixo-rose-300">Não deu para abrir o seu cadastro. Tente de novo.</p>;
  if (!meu) return (
    <p className="rounded-2xl border border-fixo-amber-400/30 bg-fixo-amber-400/10 p-4 text-sm text-fixo-amber-300">
      Ainda não há um cadastro de técnico com o seu nome. Peça ao administrador para cadastrar você em Técnicos.
    </p>
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!meu || salvando) return;
    setSalvando(true);
    const dados = Object.fromEntries(CAMPOS.map((c) => [c, form[c].trim() ? (c === "uf" ? form[c].trim().toUpperCase().slice(0, 2) : form[c].trim()) : null]));
    const { error: e1 } = await supabase.from("tecnicos").update(dados).eq("id", meu.id);
    setSalvando(false);
    if (e1) return notifyError(e1);
    invalidar("tecnicos");
    notify("Cadastro salvo");
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-2xl border border-white/10 p-4">
      <p className="text-base font-bold">{meu.nome}</p>
      {CAMPOS.map((c) => (
        <label key={c} className="block text-sm">
          <span className="mb-1 block text-noite-medio">{ROTULO[c]}</span>
          {c === "especialidades"
            ? <textarea rows={3} className={campo} value={form[c]} onChange={(e) => setForm({ ...form, [c]: e.target.value })} />
            : <input className={campo} value={form[c]} maxLength={c === "uf" ? 2 : undefined} inputMode={c === "whatsapp" || c === "telefone" ? "tel" : c === "email" ? "email" : undefined}
                onChange={(e) => setForm({ ...form, [c]: e.target.value })} />}
        </label>
      ))}
      <button type="submit" disabled={salvando} className="w-full rounded-2xl bg-fixo-teal-500 py-3 text-base font-bold text-noite-fundo disabled:opacity-60">
        {salvando ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
