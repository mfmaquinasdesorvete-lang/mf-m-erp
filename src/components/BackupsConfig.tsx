// Situação do backup diário automático (gerado no GitHub, guardado no Supabase e copiado para a Hostinger).
import { AlertTriangle, CheckCircle2, Clock, Server, ShieldCheck, XCircle } from "lucide-react";
import { Card } from "./ui";
import { useRows } from "@/lib/data";

type Backup = {
  id: string; data: string; status: "ok" | "erro"; pasta: string | null; tamanho: number | null; tabelas: number | null; linhas: number | null;
  arquivos: number | null; restauracao_ok: boolean | null; detalhe: string | null; hostinger_em: string | null; created_at: string;
};

const quando = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const mb = (n: number | null) => (n == null ? "" : `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`);
const num = (n: number | null) => (n == null ? "" : n.toLocaleString("pt-BR"));

export function BackupsConfig() {
  const { data: todos = [], isLoading } = useRows<Backup>("backups_registro", { order: "created_at", ascending: false });
  const lista = todos.slice(0, 10);
  const ultimo = todos.find((b) => b.status === "ok");
  const atrasado = !ultimo || Date.now() - Date.parse(ultimo.created_at) > 30 * 3600 * 1000;

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-emerald-600" /> Backup diário automático</h2>
      <p className="mb-3 text-sm text-slate-600">
        Todo dia às 02:15 o ERP inteiro (banco de dados e arquivos: fotos, documentos, anexos) é copiado, testado (restaurado num
        banco de teste, tabela por tabela) e criptografado. Fica 7 dias no Supabase e é copiado para a Hostinger, na pasta
        <b> backups-erp</b>, fora do site: 30 dias + 1 por mês durante 1 ano. Para abrir um backup é preciso a frase do backup
        (secret <b>BACKUP_CHAVE</b> no GitHub): guarde uma cópia dela em lugar seguro.
      </p>

      {isLoading ? null : !ultimo ? (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <b>Ainda não há backup completo.</b> Falta cadastrar a frase do backup no GitHub: Settings → Secrets and variables →
            Actions → New repository secret, nome <b>BACKUP_CHAVE</b>, valor uma frase longa (16 caracteres ou mais).
          </div>
        </div>
      ) : (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3 text-sm ${atrasado ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          <span className="flex items-center gap-1.5 font-semibold">
            {atrasado ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />} Último backup: {quando(ultimo.created_at)}
          </span>
          <span>{mb(ultimo.tamanho)} · {num(ultimo.tabelas)} tabelas, {num(ultimo.linhas)} linhas, {num(ultimo.arquivos)} arquivos</span>
          <span className="flex items-center gap-1">
            {ultimo.restauracao_ok ? <><CheckCircle2 size={14} /> restauração testada</> : ultimo.restauracao_ok === false ? <><XCircle size={14} className="text-red-600" /> teste de restauração falhou</> : "sem teste de restauração"}
          </span>
          <span className="flex items-center gap-1">
            <Server size={14} /> {ultimo.hostinger_em ? `na Hostinger desde ${quando(ultimo.hostinger_em)}` : "a Hostinger ainda não baixou"}
          </span>
        </div>
      )}

      {lista.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {lista.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${b.status === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                {b.status === "ok" ? "ok" : "falhou"}
              </span>
              <span className="text-slate-700">{quando(b.created_at)}</span>
              {b.status === "ok" && <span className="text-slate-500">{mb(b.tamanho)}</span>}
              {b.status === "ok" && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  {b.hostinger_em ? <><Server size={12} /> Hostinger</> : <><Clock size={12} /> aguardando Hostinger</>}
                </span>
              )}
              {b.detalhe && <span className="w-full truncate text-xs text-slate-500" title={b.detalhe}>{b.detalhe}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
