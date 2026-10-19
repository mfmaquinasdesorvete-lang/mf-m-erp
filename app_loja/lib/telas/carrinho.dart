import 'package:flutter/material.dart';

import '../modelos.dart';
import '../servicos.dart';
import 'comum.dart';

class TelaCarrinho extends StatefulWidget {
  const TelaCarrinho({super.key});
  @override
  State<TelaCarrinho> createState() => _TelaCarrinhoState();
}

class _TelaCarrinhoState extends State<TelaCarrinho> {
  final obs = TextEditingController();
  bool enviando = false;
  (int, double)? feito; // número do pedido e total

  @override
  void dispose() {
    obs.dispose();
    super.dispose();
  }

  Future<void> finalizar() async {
    if (sessao.value == null || cadastro.dados == null) {
      voltarAoCarrinho = true;
      abaAtual.value = 3;
      return;
    }
    setState(() => enviando = true);
    try {
      final r = await sb.rpc('loja_criar_pedido', params: {
        'p_itens': carrinho.itens.entries.map((e) => {'produto_id': e.key, 'quantidade': e.value}).toList(),
        'p_observacoes': obs.text.trim().isEmpty ? null : obs.text.trim(),
      });
      final m = Map<String, dynamic>.from(r as Map);
      setState(() => feito = (inteiro(m['numero']) ?? 0, numero(m['total'])));
      carrinho.limpar();
      obs.clear();
    } catch (e) {
      avisarErro(e);
    } finally {
      if (mounted) setState(() => enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Carrinho')),
      body: ListenableBuilder(
        listenable: Listenable.merge([carrinho, loja, sessao, cadastro]),
        builder: (context, _) {
          final empresa = loja.dados?.empresa;
          if (feito != null) return _Pronto(numeroPedido: feito!.$1, total: feito!.$2, empresa: empresa, aoFechar: () => setState(() => feito = null));
          final linhas = <(Produto, int)>[
            for (final e in carrinho.itens.entries)
              if (loja.dados?.produto(e.key) case final p?) (p, e.value),
          ];
          if (linhas.isEmpty) {
            return Vazio(Icons.shopping_cart_outlined, 'Seu carrinho está vazio.', acao: 'Ver produtos', aoTocar: () => abaAtual.value = 0);
          }
          final total = linhas.fold<double>(0, (s, l) => s + l.$1.preco * l.$2);
          final logado = sessao.value != null;
          return ListView(padding: const EdgeInsets.all(16), children: [
            Cartao(
              padding: EdgeInsets.zero,
              child: Column(children: [
                for (var i = 0; i < linhas.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  _Linha(linhas[i].$1, linhas[i].$2),
                ],
              ]),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: obs,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Observações (voltagem, prazo, endereço de entrega diferente…)'),
            ),
            const SizedBox(height: 16),
            Cartao(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Text('Produtos', style: TextStyle(color: Color(0xFF475569), fontSize: 16)),
                  const Spacer(),
                  Text(brl(total), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 4),
                const Text('Frete e forma de pagamento são combinados com a nossa equipe depois do pedido.',
                    style: TextStyle(color: Color(0xFF64748B), fontSize: 13)),
                if (logado && cadastro.carregado && cadastro.dados == null)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text('Falta completar o seu cadastro (CPF/CNPJ e endereço).',
                        style: TextStyle(color: Color(0xFFB45309), fontWeight: FontWeight.w600)),
                  ),
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: enviando ? null : finalizar,
                  child: Text(enviando
                      ? 'Enviando…'
                      : !logado
                          ? 'Entrar e finalizar o pedido'
                          : cadastro.dados != null
                              ? 'Finalizar pedido'
                              : 'Completar cadastro'),
                ),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}

class _Linha extends StatelessWidget {
  final Produto p;
  final int qtd;
  const _Linha(this.p, this.qtd);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 64, child: ClipRRect(borderRadius: BorderRadius.circular(12), child: Foto(p))),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(p.nome, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text('${brl(p.preco)} cada', style: const TextStyle(color: Color(0xFF64748B), fontSize: 13)),
              const SizedBox(height: 6),
              Row(children: [
                Quantidade(valor: qtd, aoMudar: (n) => carrinho.alterar(p.id, n)),
                IconButton(
                  tooltip: 'Remover',
                  onPressed: () => carrinho.alterar(p.id, 0),
                  icon: const Icon(Icons.delete_outline, color: Color(0xFFDC2626)),
                ),
              ]),
            ]),
          ),
          Text(brl(p.preco * qtd), style: const TextStyle(fontWeight: FontWeight.bold)),
        ]),
      );
}

class _Pronto extends StatelessWidget {
  final int numeroPedido;
  final double total;
  final Empresa? empresa;
  final VoidCallback aoFechar;
  const _Pronto({required this.numeroPedido, required this.total, required this.empresa, required this.aoFechar});

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(24), children: [
        const SizedBox(height: 24),
        const Icon(Icons.check_circle, size: 64, color: Color(0xFF059669)),
        const SizedBox(height: 12),
        Text('Pedido #$numeroPedido recebido!', textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(
          'Total dos produtos: ${brl(total)}. Nossa equipe vai confirmar o frete e a forma de pagamento com você pelo WhatsApp.',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 16, color: Color(0xFF475569)),
        ),
        const SizedBox(height: 24),
        if (empresa?.whatsapp != null) ...[
          BotaoWhatsapp('Falar agora no WhatsApp', () => abrirWhatsapp(empresa!.whatsapp, 'Olá! Acabei de fazer o pedido #$numeroPedido pelo app.')),
          const SizedBox(height: 10),
        ],
        OutlinedButton(
          onPressed: () {
            aoFechar();
            abaAtual.value = 2;
          },
          child: const Text('Ver meus pedidos'),
        ),
      ]);
}
