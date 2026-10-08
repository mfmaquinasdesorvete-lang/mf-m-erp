import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { DEMO } from "./lib/supabase";
import "./index.css";
import { aplicarDestaque, aplicarTema, lerDestaque, lerTema } from "./lib/tema";

// Tema escuro por padrão; a escolha fica salva no aparelho.
aplicarTema(lerTema());
aplicarDestaque(lerDestaque());

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: DEMO ? 0 : 30_000, retry: 1 } } });

if (DEMO) {
  // A prévia roda em ambientes que bloqueiam caixas de diálogo do navegador.
  window.confirm = () => true;
  window.prompt = () => "Cancelamento solicitado pelo cliente (demonstração)";
}

// A prévia roda dentro de outra página, então a navegação fica em memória.
const Router = DEMO ? MemoryRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Router>
        <App />
      </Router>
    </QueryClientProvider>
  </React.StrictMode>,
);
