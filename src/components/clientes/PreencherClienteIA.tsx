// "Preencher com IA" no cadastro novo de cliente: cola a conversa do WhatsApp e/ou manda a foto do cartão de visita; a
// função ia-cliente devolve os dados e os cadastros parecidos (mesmo CPF/CNPJ, telefone ou e-mail). A pessoa marca o que
// usar; só entra em campo vazio (o que já foi digitado fica). Depois a lupa do CNPJ completa pela Receita, como antes.
import { useState } from "react";
import { Camera, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Button, Field, Modal } from "@/components/ui";
import { callFunction } from "@/lib/supabase";
import type { DadosClienteIA } from "../../../supabase/functions/_shared/ia-cliente";

type Repetido = { id: string; nome: string; codigo: number | null; motivo: string };
type Resposta = { dados: DadosClienteIA; avisos: string[]; repetidos: Repetido[] };
type Foto = { tipo: string; base64: string; url: string };

const ROTULO: Partial<Record<keyof DadosClienteIA, string>> = {
  tipo_pessoa: "Tipo", nome: "Nome / razão social", nome_fantasia: "Nome fantasia", cpf_cnpj: "CPF/CNPJ", email: "E-mail",
  whatsapp: "WhatsApp", telefone: "Telefone", cep: "CEP", logradouro: "Rua", numero: "Número", complemento: "Complemento",
  bairro: "Bairro", municipio: "Cidade", uf: "UF", instagram: "Instagram", website: "Site", contato: "Pessoa de contato", observacao: "Observação",
};

/** Do que a IA leu para os campos do cadastro (contato e observação vão juntos em "observações do contato"). */
export function camposDoCadastro(d: Partial<DadosClienteIA>, usar: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) if (v && usar.has(k) && k !== "contato" && k !== "observacao") out[k] = v as string;
  const extra = [usar.has("contato") && d.contato ? `Contato: ${d.contato}` : null, usar.has("observacao") ? d.observacao : null].filter(Boolean).join(" · ");
  if (extra) out.contato_observacoes = extra;
  return out;
}

export function PreencherClienteIA({ atual, onAplicar, onAbrirRepetido, onClose }: {
  atual: Record<string, any>; onAplicar: (campos: Record<string, string>) => void; onAbrirRepetido?: (id: string) => void; onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<Foto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [r, setR] = useState<Resposta | null>(null);
  const [usar, setUsar] = useState<Set<string>>(new Set());

  function lerFoto(f: File | undefined) {
    if (!f) return;
    const leitor = new FileReader();
    leitor.onload = () => setFoto({ tipo: f.type, base64: String(leitor.result).split(",")[1] ?? "", url: String(leitor.result) });
    leitor.readAsDataURL(f);
  }

  async function ler() {
    setOcupado(true); setErro(null); setR(null);
    try {
      const resp = await callFunction<Resposta>("ia-cliente", { texto: texto.trim() || null, imagem: foto ? { tipo: foto.tipo, base64: foto.base64 } : null });
      setR(resp);
      // marcado já: o que a IA achou e o cadastro ainda não tem
      setUsar(new Set(Object.entries(resp.dados).filter(([k, v]) => v && (k === "contato" || k === "observacao" || !String(atual[k] ?? "").trim())).map(([k]) => k)));
    } catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  }

  const achados = r ? (Object.keys(ROTULO) as (keyof DadosClienteIA)[]).filter((k) => r.dados[k]) : [];
  const alternar = (k: string) => setUsar((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <Modal open onClose={onClose} title="Preencher com IA">
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">Cole a conversa do WhatsApp com o cliente e/ou mande a foto do cartão de visita. A IA acha os dados; você escolhe o que usar.</p>
        <Field label="Conversa ou texto">
          <textarea className="input min-h-[110px]" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={6000}
            placeholder="Ex.: Oi, sou a Maria da Gelato Nobre, CNPJ 11.222.333/0001-81, Rua das Flores 120, Centro, Florianópolis…" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-sky-700">
            <Camera className="h-4 w-4" /> {foto ? "Trocar a foto do cartão" : "Foto do cartão de visita"}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => lerFoto(e.target.files?.[0])} />
          </label>
          {foto && <img src={foto.url} alt="Cartão de visita" className="h-12 rounded border border-slate-200" />}
          <Button className="ml-auto" onClick={ler} disabled={ocupado || (texto.trim().length < 8 && !foto)}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {ocupado ? "Lendo…" : "Ler com IA"}
          </Button>
        </div>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800" role="alert">{erro}</p>}

        {r && (
          <div className="space-y-3" aria-live="polite">
            {r.repetidos.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="h-4 w-4" /> Parece que esse cliente já existe:</p>
                <ul className="mt-1 space-y-1">
                  {r.repetidos.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1"><b>{p.nome}</b>{p.codigo ? ` (nº ${p.codigo})` : ""} · {p.motivo}</span>
                      {onAbrirRepetido && <Button variant="secondary" onClick={() => onAbrirRepetido(p.id)}>Abrir esse cadastro</Button>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.avisos.map((a) => <p key={a} className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{a}</p>)}
            {!achados.length ? <p className="text-slate-500">A IA não achou dados de cadastro nisso.</p> : (
              <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
                {achados.map((k) => (
                  <li key={k}>
                    <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2">
                      <input type="checkbox" className="mt-1" checked={usar.has(k)} onChange={() => alternar(k)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-slate-500">{ROTULO[k]}{atual[k] && k !== "contato" && k !== "observacao" ? ` · no cadastro: ${atual[k]}` : ""}</span>
                        <span className="block break-words font-semibold text-fg">{r.dados[k]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => { onAplicar(camposDoCadastro(r.dados, usar)); onClose(); }} disabled={!usar.size}>Usar no cadastro</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
