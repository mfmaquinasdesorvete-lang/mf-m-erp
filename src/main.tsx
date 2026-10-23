import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ErroTela } from "./components/ErroTela";
import { Dialogos } from "./components/Dialogos";
import { notifyLeitura } from "./lib/notify";
import { DEMO } from "./lib/supabase";
import { guardarConviteInstalar } from "./components/InstalarApp";
// fontes servidas pelo próprio site (sem depender do Google Fonts): DM Sans no texto e Poppins nos títulos,
// números grandes, botões, abas e menu
import "@fontsource-variable/dm-sans";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/great-vibes/latin-400.css";
import "./index.css";
import { aplicarDestaque, aplicarFundo, aplicarTema, lerDestaque, lerFundo, lerTema } from "./lib/tema";
import { aparenciaAtual, aplicarAparencia } from "./lib/aparencia";

// Tema escuro por padrão; a escolha fica salva no aparelho.
// cores, fontes e logo da empresa (a cópia guardada no aparelho; a do banco chega com as configurações)
aplicarAparencia(aparenciaAtual());
aplicarFundo(lerFundo());
aplicarTema(lerTema());
aplicarDestaque(lerDestaque());

// App instalado pelo navegador: guarda o convite "Instalar" do Chrome e liga o service worker (só no site publicado;
// ele não guarda dados, só a tela "Sem internet" e os arquivos com hash da versão).
guardarConviteInstalar();
if (import.meta.env.PROD && !DEMO && "serviceWorker" in navigator && location.hostname !== "localhost") {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => { /* sem app offline: o ERP funciona igual */ }); });
}

// Arquivo de uma versão que já saiu do servidor (aba aberta antes da atualização): mostra a faixa
// "Nova versão do ERP" em vez de recarregar sozinho e perder o que está sendo digitado.
window.addEventListener("vite:preloadError", () => window.dispatchEvent(new Event("erp-versao-nova")));

// Leitura que falhou (sem internet, sem permissão…) vira aviso na tela, e não "lista vazia" sem explicação
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (e) => notifyLeitura(e) }),
  // O que já foi baixado vale por 5 min e fica guardado 30 min: trocar de tela ou voltar para a aba não baixa as tabelas
  // de novo (era o que deixava o ERP pesado). O que a própria pessoa grava atualiza na hora (invalidate).
  defaultOptions: { queries: { staleTime: DEMO ? 0 : 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false, retry: 1 } },
});

// A prévia roda dentro de outra página, então a navegação fica em memória
// (abre direto numa página pelo endereço depois do #, ex.: index.html#/cotacao/<código>).
const Router = DEMO ? MemoryRouter : BrowserRouter;
const inicioDemo = DEMO && window.location.hash.startsWith("#/") ? { initialEntries: [window.location.hash.slice(1)] } : {};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router {...inicioDemo}>
        {/* login e páginas públicas (loja, proposta, cotação, ficha) também não ficam em branco se algo falhar */}
        <ErroTela>
          <App />
          <Dialogos />
        </ErroTela>
      </Router>
    </QueryClientProvider>
  </React.StrictMode>,
);
