// Convidar o representante para o portal (só administrador): cria o login pela mesma função da tela de Usuários
// (usuarios-admin) ou liga um login que já existe. O banco dá o papel representante e liga ao vendedor.
import { useState, type FormEvent } from "react";
import { Check, Copy, MessageCircle, RefreshCw } from "lucide-react";
import { Button, Field, Modal, Tabs } from "@/components/ui";
import { callFunction, supabase } from "@/lib/supabase";
import { useInvalidate } from "@/lib/data";
import { notifyError } from "@/lib/notify";
import { whatsappLink } from "@/lib/format";
import { gerarSenha } from "@/lib/senhas";
import { erroPortal, textoConvite } from "@/lib/portal";
import type { Vendedor } from "@/lib/types";

type Usuario = { user_id: string; nome: string; papel: string };
const SITE = typeof window !== "undefined" ? window.location.origin : "";

async function rpc(fn: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(erroPortal(error.message));
}

export function ConvitePortal({ vendedor, usuarios, vinculados, onClose }: {
  vendedor: Vendedor; usuarios: Usuario[]; vinculados: Set<string>; onClose: () => void;
}) {
  const invalidar = useInvalidate();
  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [nome, setNome] = useState(vendedor.nome);
  const [email, setEmail] = useState(vendedor.email ?? "");
  const [telefone, setTelefone] = useState(vendedor.whatsapp ?? "");
  const [senha, setSenha] = useState(gerarSenha);
  const [userId, setUserId] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pronto, setPronto] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  // login que já existe: nem administrador nem já ligado a outro vendedor
  const opcoes = usuarios.filter((u) => u.papel !== "admin" && !vinculados.has(u.user_id));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      if (modo === "novo") {
        await rpc("portal_convidar_representante", { p_vendedor: vendedor.id, p_email: email });
        // a função só aceita os papéis antigos: o convite faz o login nascer representante na mesma gravação
        const r = await callFunction<{ user_id: string }>("usuarios-admin", {
          acao: "criar", nome, email, senha, telefone, papel: "vendas", papeis_extras: [], unidade_id: null,
        }).catch((err) => { throw new Error(erroPortal((err as Error).message)); });
        await rpc("portal_ligar_representante", { p_vendedor: vendedor.id, p_user: r.user_id });
        setPronto(textoConvite({ nome, email, senha, site: SITE }));
      } else {
        if (!userId) throw new Error("escolha o login");
        await rpc("portal_ligar_representante", { p_vendedor: vendedor.id, p_user: userId });
        setPronto("");
      }
      invalidar("vendedores", "usuarios_erp");
    } catch (err) { notifyError(err); } finally { setOcupado(false); }
  }

  if (pronto !== null) return (
    <Modal open onClose={onClose} title="Portal liberado">
      <div className="space-y-3">
        {pronto ? <>
          <p className="text-sm text-slate-700">Passe estes dados para {nome.split(" ")[0]}. A senha é provisória: no primeiro acesso a pessoa cria a própria.</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{pronto}</pre>
        </> : <p className="text-sm text-slate-700">Pronto: o login agora entra só no Portal do representante ({SITE}/portal), ligado a {vendedor.nome}.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {pronto && <Button type="button" variant="secondary" onClick={async () => {
            try { await navigator.clipboard.writeText(pronto); setCopiado(true); } catch { notifyError(new Error("não deu para copiar: selecione o texto e copie")); }
          }}>{copiado ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />} {copiado ? "Copiado" : "Copiar"}</Button>}
          {pronto && telefone.replace(/\D/g, "").length >= 10 && (
            <a className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg bg-solido-verde px-3.5 py-2 text-sm font-semibold text-white sm:min-h-0" href={whatsappLink(telefone, pronto)} target="_blank" rel="noreferrer">
              <MessageCircle size={15} aria-hidden /> Enviar pelo WhatsApp
            </a>
          )}
          <Button type="button" onClick={onClose}>Concluir</Button>
        </div>
      </div>
    </Modal>
  );

  return (
    <Modal open onClose={onClose} title={`Portal do representante · ${vendedor.nome}`}>
      <form onSubmit={salvar} className="space-y-3">
        <p className="text-sm text-slate-600">
          O representante entra só no portal: vê os próprios pedidos, clientes da carteira e comissões, e manda orçamentos para a empresa aprovar.
          Nenhum outro dado da empresa.
        </p>
        <Tabs value={modo} onChange={setModo} options={[{ value: "novo", label: "Login novo" }, { value: "existente", label: "Ligar login que já existe" }]} />
        {modo === "novo" ? (
          <>
            <Field label="Nome *"><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={120} /></Field>
            <Field label="E-mail de acesso *"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" /></Field>
            <Field label="WhatsApp"><input className="input" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Field>
            <Field label="Senha provisória (troca no primeiro acesso)">
              <span className="flex gap-2">
                <input className="input font-mono" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} required autoComplete="off" />
                <Button type="button" variant="secondary" onClick={() => setSenha(gerarSenha())}><RefreshCw size={15} aria-hidden /> Gerar</Button>
              </span>
            </Field>
          </>
        ) : (
          <Field label="Login *">
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)} required>
              <option value="">Escolha…</option>
              {opcoes.map((u) => <option key={u.user_id} value={u.user_id}>{u.nome}</option>)}
            </select>
            <span className="mt-1 block text-xs text-amber-800">O login perde o acesso às telas do ERP e passa a ver só o portal.</span>
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={ocupado}>{ocupado ? "Salvando…" : modo === "novo" ? "Criar login do portal" : "Ligar ao portal"}</Button>
        </div>
      </form>
    </Modal>
  );
}
