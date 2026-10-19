import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../modelos.dart';
import '../servicos.dart';
import 'comum.dart';

const _filtros = [
  ('', 'Tudo'),
  ('maquina', 'Máquinas'),
  ('acessorio', 'Acessórios'),
  ('peca', 'Peças'),
  ('insumo', 'Insumos'),
];

class Vitrine extends StatefulWidget {
  const Vitrine({super.key});
  @override
  State<Vitrine> createState() => _VitrineState();
}

class _VitrineState extends State<Vitrine> {
  String filtro = '';

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: loja,
      builder: (context, _) {
        final dados = loja.dados;
        final empresa = dados?.empresa;
        return Scaffold(
          appBar: AppBar(
            titleSpacing: 12,
            title: Row(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: empresa?.logo != null
                    ? Image.network(empresa!.logo!, width: 38, height: 38, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const Icon(Icons.icecream))
                    : const Icon(Icons.icecream, size: 30),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(empresa?.nome ?? 'Loja', overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                  if (empresa?.slogan != null)
                    Text(empresa!.slogan!, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Colors.white70)),
                ]),
              ),
            ]),
          ),
          body: _corpo(dados),
        );
      },
    );
  }

  Widget _corpo(DadosLoja? dados) {
    if (dados == null && loja.carregando) return const Center(child: CircularProgressIndicator());
    if (dados == null) {
      return Vazio(Icons.cloud_off, 'Não foi possível abrir a loja agora.', acao: 'Tentar de novo', aoTocar: loja.carregar);
    }
    final filtros = _filtros.where((f) => f.$1.isEmpty || dados.produtos.any((p) => p.tipo == f.$1)).toList();
    final lista = dados.produtos.where((p) => filtro.isEmpty || p.tipo == filtro).toList();
    return RefreshIndicator(
      onRefresh: loja.carregar,
      child: CustomScrollView(slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
          sliver: SliverToBoxAdapter(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Loja', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
              if (dados.empresa.apresentacao != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(dados.empresa.apresentacao!, style: const TextStyle(fontSize: 15, color: Color(0xFF475569))),
                ),
            ]),
          ),
        ),
        if (filtros.length > 2)
          SliverToBoxAdapter(
            child: SizedBox(
              height: 52,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                children: [
                  for (final f in filtros)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(label: Text(f.$2), selected: filtro == f.$1, onSelected: (_) => setState(() => filtro = f.$1)),
                    ),
                ],
              ),
            ),
          ),
        if (lista.isEmpty)
          const SliverFillRemaining(hasScrollBody: false, child: Vazio(Icons.inventory_2_outlined, 'Nenhum produto por aqui ainda.'))
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 260,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.54,
              ),
              delegate: SliverChildBuilderDelegate((context, i) => _CartaoProduto(lista[i]), childCount: lista.length),
            ),
          ),
      ]),
    );
  }
}

class _CartaoProduto extends StatelessWidget {
  final Produto p;
  const _CartaoProduto(this.p);

  @override
  Widget build(BuildContext context) {
    void abrir() => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TelaProduto(p)));
    return Cartao(
      padding: EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          InkWell(onTap: abrir, child: Foto(p)),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Disponivel(p),
                const SizedBox(height: 6),
                InkWell(
                  onTap: abrir,
                  child: Text(p.nome, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15, height: 1.25)),
                ),
                const Spacer(),
                Text(brl(p.preco), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                if (p.disponivel) ...[
                  const SizedBox(height: 6),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(40)),
                      onPressed: () {
                        carrinho.adicionar(p.id);
                        avisar('Adicionado ao carrinho');
                      },
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('Carrinho'),
                    ),
                  ),
                ],
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class TelaProduto extends StatefulWidget {
  final Produto p;
  const TelaProduto(this.p, {super.key});
  @override
  State<TelaProduto> createState() => _TelaProdutoState();
}

class _TelaProdutoState extends State<TelaProduto> {
  int qtd = 1;

  @override
  Widget build(BuildContext context) {
    final p = widget.p;
    final empresa = loja.dados?.empresa;
    return Scaffold(
      appBar: AppBar(
        title: Text(p.nome, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            tooltip: 'Compartilhar',
            icon: const Icon(Icons.share),
            onPressed: () => Share.share('${p.nome} · ${brl(p.preco)}\n${urlProduto(p.id)}'),
          ),
        ],
      ),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        ClipRRect(borderRadius: BorderRadius.circular(16), child: Foto(p, grande: true)),
        const SizedBox(height: 16),
        Align(alignment: Alignment.centerLeft, child: Disponivel(p)),
        const SizedBox(height: 8),
        Text(p.nome, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, height: 1.2)),
        if (p.sku != null) Text('Código ${p.sku}', style: const TextStyle(color: Color(0xFF64748B))),
        const SizedBox(height: 12),
        Text(brl(p.preco), style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800)),
        if (p.disponibilidade == 'available for order' && (p.prazoDias ?? 0) > 0)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              'Sob encomenda: envio previsto até ${dataBR(somarDias(p.prazoDias!))} (em até ${p.prazoDias} dias)',
              style: const TextStyle(color: Color(0xFF0369A1), fontWeight: FontWeight.w600),
            ),
          ),
        const SizedBox(height: 14),
        Text((p.descricao ?? '').trim().isEmpty ? p.nome : p.descricao!.trim(), style: const TextStyle(fontSize: 16, height: 1.5, color: Color(0xFF334155))),
        if (p.tipo == 'maquina' && (p.garantiaMeses ?? 0) > 0)
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: Row(children: [
              const Icon(Icons.verified_user, color: Color(0xFF047857), size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Garantia de ${p.garantiaMeses} meses e assistência técnica própria',
                    style: const TextStyle(color: Color(0xFF047857), fontWeight: FontWeight.w600)),
              ),
            ]),
          ),
        const SizedBox(height: 20),
        if (p.disponivel)
          Row(children: [
            Quantidade(valor: qtd, aoMudar: (n) => setState(() => qtd = n)),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.icon(
                onPressed: () {
                  carrinho.adicionar(p.id, qtd);
                  abaAtual.value = 1;
                  Navigator.of(context).popUntil((r) => r.isFirst);
                },
                icon: const Icon(Icons.shopping_cart),
                label: const Text('Comprar'),
              ),
            ),
          ]),
        if (empresa?.whatsapp != null) ...[
          const SizedBox(height: 10),
          BotaoWhatsapp(
            'Tirar dúvidas no WhatsApp',
            () => abrirWhatsapp(empresa!.whatsapp, 'Olá! Tenho interesse em: ${p.nome}${p.sku != null ? ' (cód. ${p.sku})' : ''}.\n${urlProduto(p.id)}'),
          ),
        ],
        const SizedBox(height: 24),
      ]),
    );
  }
}
