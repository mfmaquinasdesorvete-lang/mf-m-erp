// Gravados na hora de montar o site (vite.config.ts → define): versão em uso e mudanças de cada dia.
declare const __ERP_VERSAO__: import("./lib/atualizacoes").InfoVersao | null;
declare const __ERP_HISTORICO__: import("./lib/atualizacoes").DiaHistorico[];
declare const __ERP_TELAS__: import("./lib/atualizacoes").AlteracaoTela[];
declare const __ERP_CODIGO__: import("./lib/codigoErp").TecnicaCodigo[];
declare const __ERP_ENTREGAS_CHATS__: import("./lib/chatsEntregas").EntregaChat[];
