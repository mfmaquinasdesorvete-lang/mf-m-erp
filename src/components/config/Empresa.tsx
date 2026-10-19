// Configurações → Empresa e marca: dados gerais, logo, ícone, cores e o cabeçalho dos PDFs (prévia ao lado).
import { Button } from "@/components/ui";
import { docFormat } from "@/lib/format";
import { PASTA_MARCA } from "@/lib/marca";
import { EnviarImagem } from "@/components/EnviarImagem";
import { BotaoSalvar, Bloco, CabecalhoSecao, campo, secaoPorId, useCfgPagina } from "./comum";

const CHAVES = ["razao_social", "nome_fantasia", "cnpj", "inscricao_estadual", "municipio", "uf", "whatsapp", "endereco", "telefone", "email",
  "slogan", "site", "instagram", "logo_url", "icone_url", "cor_primaria", "cor_secundaria", "pdf_cabecalho"];

export function ConfigEmpresa() {
  const s = secaoPorId("empresa")!;
  const { cfg, set, mudar, salvar, salvando } = useCfgPagina(CHAVES, (r) => ({ ...r, uf: r.uf?.toUpperCase() ?? null }));
  if (!cfg) return <p className="text-slate-500">Carregando…</p>;
  const input = campo(cfg, set);
  const nome = cfg.nome_fantasia || cfg.razao_social || "Sua empresa";

  return (
    <div className="max-w-5xl">
      <CabecalhoSecao s={s} acoes={<BotaoSalvar form="form-empresa" salvando={salvando} />} />
      <form id="form-empresa" onSubmit={salvar} className="space-y-5">
        <Bloco titulo="Dados gerais" descricao="Aparecem nos PDFs, nos e-mails e na vitrine. CNPJ, IE e endereço de cada unidade ficam em Unidades (cada documento sai com os dados da sua unidade).">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {input("razao_social", "Razão social", "sm:col-span-2")}
            {input("nome_fantasia", "Nome fantasia", "sm:col-span-2")}
            {input("cnpj", "CNPJ")}
            {input("inscricao_estadual", "Inscrição estadual")}
            {input("municipio", "Município")}
            {input("uf", "UF", "", "text", { maxLength: 2 })}
            {input("endereco", "Endereço (aparece nos PDFs)", "sm:col-span-2")}
            {input("whatsapp", "WhatsApp comercial")}
            {input("telefone", "Telefone")}
            {input("email", "E-mail", "sm:col-span-2", "email")}
            {input("site", "Site", "", "text", { placeholder: "www.suaempresa.com.br" })}
            {input("instagram", "Instagram", "", "text", { placeholder: "@suaempresa" })}
            {input("slogan", "Frase da marca (slogan)", "sm:col-span-4", "text", { placeholder: "Ex.: Máquinas de sorvete com assistência em todo o Brasil" })}
          </div>
        </Bloco>

        <Bloco titulo="Logo, ícone e cores" descricao="A logo sai nos PDFs (orçamento, pedido, OS, recibo, etiquetas) e na vitrine. O ícone é o da aba do navegador e do atalho no celular.">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <EnviarImagem rotulo="Logo" dica="PNG com fundo transparente fica melhor. Até 2 MB." url={cfg.logo_url} nome="logo" pasta={PASTA_MARCA} onUrl={(u) => mudar({ logo_url: u })} />
              <EnviarImagem rotulo="Ícone (quadrado)" dica="PNG quadrado, 512 × 512. Sem ícone, fica o do ERP." url={cfg.icone_url} nome="icone" pasta={PASTA_MARCA} quadrado onUrl={(u) => mudar({ icone_url: u })} />
              <div className="grid grid-cols-2 gap-3">
                <Cor rotulo="Cor principal" valor={cfg.cor_primaria} padrao="#0EA5E9" onChange={(v) => mudar({ cor_primaria: v })} />
                <Cor rotulo="Cor de destaque" valor={cfg.cor_secundaria} padrao="#F59E0B" onChange={(v) => mudar({ cor_secundaria: v })} />
              </div>
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold text-slate-600">Cabeçalho dos PDFs</legend>
                <div className="grid grid-cols-3 gap-2">
                  {([["escuro", "Escuro"], ["claro", "Claro"], ["cor", "Na cor principal"]] as const).map(([v, r]) => (
                    <button key={v} type="button" aria-pressed={(cfg.pdf_cabecalho ?? "escuro") === v} onClick={() => mudar({ pdf_cabecalho: v })}
                      className={`rounded-lg border px-2 py-2 text-sm font-semibold ${(cfg.pdf_cabecalho ?? "escuro") === v ? "border-brand bg-brand-light text-fg" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>{r}</button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-slate-600">Prévia do cabeçalho do PDF</div>
              <PreviaPdf cfg={cfg} nome={nome} />
              <div className="mb-1.5 mt-4 text-xs font-semibold text-slate-600">Prévia na vitrine</div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3" style={{ borderTop: `4px solid ${cfg.cor_primaria || "#0EA5E9"}` }}>
                {cfg.logo_url ? <img src={cfg.logo_url} alt="" className="h-10 w-10 rounded-lg object-contain" /> : <span className="h-10 w-10 rounded-lg bg-slate-200" />}
                <div className="min-w-0">
                  <div className="font-bold text-fg">{nome}</div>
                  <div className="truncate text-xs text-slate-500">{cfg.slogan || "Frase da marca"}</div>
                </div>
              </div>
            </div>
          </div>
        </Bloco>
      </form>
    </div>
  );
}

/** Cabeçalho do PDF como vai sair (escuro, claro ou na cor principal). */
function PreviaPdf({ cfg, nome }: { cfg: Record<string, any>; nome: string }) {
  const estilo = cfg.pdf_cabecalho ?? "escuro";
  const fundo = estilo === "claro" ? "#ffffff" : estilo === "cor" ? cfg.cor_primaria || "#0EA5E9" : "#070d18";
  const texto = estilo === "claro" ? "#0f172a" : "#ffffff";
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
      <div className="flex items-center gap-3 px-3 py-3" style={{ background: fundo, color: texto, borderBottom: estilo === "claro" ? `3px solid ${cfg.cor_primaria || "#070d18"}` : undefined }}>
        {cfg.logo_url ? <img src={cfg.logo_url} alt="" className="h-11 w-11 object-contain" /> : <span className="h-11 w-11 rounded bg-amber-500" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{nome}</div>
          <div className="truncate text-2xs opacity-80">{[cfg.razao_social, cfg.cnpj && `CNPJ ${docFormat(cfg.cnpj)}`].filter(Boolean).join(" · ")}</div>
          <div className="truncate text-2xs opacity-80">{[cfg.endereco, cfg.municipio && `${cfg.municipio}/${cfg.uf ?? ""}`].filter(Boolean).join(" - ")}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold">PROPOSTA COMERCIAL</div>
          <div className="text-2xs opacity-80">Nº 123</div>
        </div>
      </div>
      <div className="space-y-1.5 p-3"><div className="h-2 w-2/3 rounded bg-slate-200" /><div className="h-2 w-1/2 rounded bg-slate-100" /><div className="h-2 w-3/4 rounded bg-slate-100" /></div>
    </div>
  );
}

function Cor({ rotulo, valor, padrao, onChange }: { rotulo: string; valor?: string | null; padrao: string; onChange: (v: string | null) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{rotulo}</span>
      <span className="flex items-center gap-2">
        <input type="color" className="h-11 w-14 cursor-pointer rounded-lg border border-slate-300 bg-transparent" value={valor || padrao} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <span className="num text-sm text-slate-500">{valor || "padrão"}</span>
        {valor && <button type="button" className="text-xs font-semibold text-slate-500 hover:underline" onClick={() => onChange(null)}>limpar</button>}
      </span>
    </label>
  );
}

