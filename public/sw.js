// Service worker do ERP Line (app instalado pelo navegador). Cuidadoso de propósito:
//  * páginas: sempre a internet primeiro (versão nova do ERP chega na hora); sem internet, mostra /offline.html;
//  * arquivos com hash em /assets/: guardados depois do 1º uso (o nome muda a cada versão, então nunca ficam velhos);
//  * outros arquivos do site: sempre da internet; se ela falhar, o que já estiver guardado (ex.: o logo da tela offline);
//  * dados (Supabase e APIs de outros endereços): não passam por aqui.
const CACHE = "erp-line-v2";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/logo-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const salvo = await c.match(req);
      if (salvo) return salvo;
      const resp = await fetch(req);
      if (resp.ok) c.put(req, resp.clone());
      return resp;
    }));
    return;
  }
  e.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || Response.error())));
});
