import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ErroTela } from "./components/ErroTela";
import { Dialogos } from "./components/Dialogos";
import { notifyLeitura } from "./lib/notify";
import { DEMO } from "./lib/supabase";
// fontes servidas pelo próprio site (sem depender do Google Fonts): DM Sans no texto e Poppins nos títulos,
// números grandes, botões, abas e menu
import "@fontsource-variable/dm-sans";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "./index.css";
import { aplicarDestaque, aplicarTema, lerDestaque, lerTema } from "./lib/tema";

// Tema escuro por padrão; a escolha fica salva no aparelho.
aplicarTema(lerTema());
aplicarDestaque(lerDestaque());

// Arquivo de uma versão que já saiu do servidor (aba aberta antes da atualização): mostra a faixa
// "Nova versão do ERP" em vez de recarregar sozinho e perder o que está sendo digitado.
window.addEventListener("vite:preloadError", () => window.dispatchEvent(new Event("erp-versao-nova")));

// Leitura que falhou (sem internet, sem permissão…) vira aviso na tela, e não "lista vazia" sem explicação
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (e) => notifyLeitura(e) }),
  defaultOptions: { queries: { staleTime: DEMO ? 0 : 30_000, retry: 1 } },
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
