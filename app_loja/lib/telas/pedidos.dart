import 'package:flutter/material.dart';

import '../modelos.dart';
import '../servicos.dart';
import 'comum.dart';

const _situacao = {
  'orcamento': ('Recebido · aguardando confirmação', Color(0xFFFFFBEB), Color(0xFF92400E)),
  'aprovado': ('Confirmado', Color(0xFFF0F9FF), Color(0xFF0369A1)),
  'faturado': ('Nota fiscal emitida', Color(0xFFEEF2FF), Color(0xFF4338CA)),
  'entregue': ('Entregue', Color(0xFFECFDF5), Color(0xFF047857)),
  'cancelado': ('Cancelado', Color(0xFFFEF2F2), Color(0xFFB91C1C)),
};

class TelaPedidos extends StatefulWidget {
  const TelaPedidos({super.key});
  @override
  State<TelaPedidos> createState() => _TelaPedidosState();
}

class _TelaPedidosState extends State<TelaPedidos> {
  Future<List<Pedido>>? futuro;
  String? usuario;

  Future<List<Pedido>> _buscar() async {
    final r = await sb.rpc('loja_meus_pedidos');
    return ((r ?? []) as List).map((p) => Pedido.fromJson(Map<String, dynamic>.from(p))).toList();
  }

  void _atualizar() => setState(() => futuro = _buscar());

  @override
  void initState() {
    super.initState();
    // Recarrega ao trocar de conta e sempre que o cliente abre a aba
    sessao.addListener(_aoMudarSessao);
    abaAtual.addListener(_aoMudarAba);
    usuario = sessao.value?.user.id;
    if (usuario != null) futuro = _buscar();
  }

  void _aoMudarSessao() {
    final id = sessao.value?.user.id;
    if (id == usuario) return;
    usuario = id;
    if (id != null) {
      _atualizar();
    } else {
      setState(() => futuro = null);
    }
  }

  void _aoMudarAba() {
    if (abaAtual.value == 2 && usuario != null) _atualizar();
  }

  @override
  void dispose() {
    sessao.removeListener(_aoMudarSessao);
    abaAtual.removeListener(_aoMudarAba);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Meus pedidos')),
      body: usuario == null
          ? Vazio(Icons.lock_outline, 'Entre na sua conta para ver os pedidos.', acao: 'Entrar', aoTocar: () => abaAtual.value = 3)
          : FutureBuilder<List<Pedido>>(
              future: futuro,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                if (snap.hasError) return Vazio(Icons.cloud_off, 'Não foi possível carregar os pedidos.', acao: 'Tentar de novo', aoTocar: _atualizar);
                final lista = snap.data ?? [];
                if (lista.isEmpty) {
                  return Vazio(Icons.inventory_2_outlined, 'Você ainda não fez pedidos.', acao: 'Ver produtos', aoTocar: () => abaAtual.value = 0);
                }
                return RefreshIndicator(
                  onRefresh: () async {
                    _atualizar();
                    await futuro;
                  },
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: lista.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, i) => _CartaoPedido(lista[i]),
                  ),
                );
              },
            ),
    );
  }
}

class _CartaoPedido extends StatelessWidget {
  final Pedido p;
  const _CartaoPedido(this.p);

  @override
  Widget build(BuildContext context) {
    final s = _situacao[p.status] ?? _situacao['orcamento']!;
    final whatsapp = loja.dados?.empresa.whatsapp;
    return Cartao(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('Pedido #${p.codigo}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const Spacer(),
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(color: s.$2, borderRadius: BorderRadius.circular(99)),
              child: Text(s.$1, overflow: TextOverflow.ellipsis, style: TextStyle(color: s.$3, fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ),
        ]),
        Text(dataBR(p.data), style: const TextStyle(color: Color(0xFF64748B), fontSize: 13)),
        const SizedBox(height: 8),
        for (final i in p.itens)
          Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Text('${i.quantidade.toStringAsFixed(i.quantidade % 1 == 0 ? 0 : 2)}× ${i.descricao}')),
              const SizedBox(width: 12),
              Text(brl(i.valor)),
            ]),
          ),
        const Divider(),
        Row(children: [
          Text(p.frete > 0 ? 'Total (com frete)' : 'Total', style: const TextStyle(fontWeight: FontWeight.bold)),
          const Spacer(),
          Text(brl(p.total), style: const TextStyle(fontWeight: FontWeight.bold)),
        ]),
        if (p.rastreio != null) Padding(padding: const EdgeInsets.only(top: 4), child: SelectableText('Rastreio: ${p.rastreio}')),
        if (whatsapp != null && p.status != 'cancelado')
          TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: const Color(0xFF047857), padding: EdgeInsets.zero),
            onPressed: () => abrirWhatsapp(whatsapp, 'Olá! Sobre o meu pedido #${p.codigo}.'),
            icon: const Icon(Icons.chat, size: 18),
            label: const Text('Falar sobre este pedido'),
          ),
      ]),
    );
  }
}
