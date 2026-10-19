import 'package:flutter/material.dart';

import '../modelos.dart';
import '../servicos.dart';

class Foto extends StatelessWidget {
  final Produto p;
  final bool grande;
  const Foto(this.p, {super.key, this.grande = false});

  @override
  Widget build(BuildContext context) {
    final url = urlFoto(p.foto);
    final vazio = Icon(Icons.image_not_supported_outlined, size: grande ? 48 : 28, color: const Color(0xFFCBD5E1));
    return AspectRatio(
      aspectRatio: 1,
      child: Container(
        color: Colors.white,
        alignment: Alignment.center,
        child: url.isEmpty
            ? vazio
            : Image.network(url, fit: BoxFit.contain, width: double.infinity, height: double.infinity, errorBuilder: (_, __, ___) => vazio),
      ),
    );
  }
}

class Disponivel extends StatelessWidget {
  final Produto p;
  const Disponivel(this.p, {super.key});

  @override
  Widget build(BuildContext context) {
    final d = disponibilidades[p.disponibilidade] ?? disponibilidades['out of stock']!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: d.$2, borderRadius: BorderRadius.circular(99)),
      child: Text(d.$1, style: TextStyle(color: d.$3, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class Quantidade extends StatelessWidget {
  final int valor;
  final ValueChanged<int> aoMudar;
  final int minimo;
  const Quantidade({super.key, required this.valor, required this.aoMudar, this.minimo = 1});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(border: Border.all(color: const Color(0xFFCBD5E1)), borderRadius: BorderRadius.circular(12)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(onPressed: () => aoMudar(valor - 1 < minimo ? minimo : valor - 1), icon: const Icon(Icons.remove, size: 18), tooltip: 'Menos'),
        SizedBox(width: 28, child: Text('$valor', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16))),
        IconButton(onPressed: () => aoMudar(valor + 1 > 99 ? 99 : valor + 1), icon: const Icon(Icons.add, size: 18), tooltip: 'Mais'),
      ]),
    );
  }
}

class BotaoWhatsapp extends StatelessWidget {
  final String rotulo;
  final VoidCallback aoTocar;
  const BotaoWhatsapp(this.rotulo, this.aoTocar, {super.key});

  @override
  Widget build(BuildContext context) => FilledButton.icon(
        onPressed: aoTocar,
        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF25D366), foregroundColor: const Color(0xFF06301A)),
        icon: const Icon(Icons.chat),
        label: Text(rotulo),
      );
}

class Vazio extends StatelessWidget {
  final IconData icone;
  final String texto;
  final String? acao;
  final VoidCallback? aoTocar;
  const Vazio(this.icone, this.texto, {super.key, this.acao, this.aoTocar});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icone, size: 44, color: const Color(0xFFCBD5E1)),
            const SizedBox(height: 12),
            Text(texto, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF64748B), fontSize: 16)),
            if (acao != null) TextButton(onPressed: aoTocar, child: Text(acao!, style: const TextStyle(fontWeight: FontWeight.bold))),
          ]),
        ),
      );
}

class Cartao extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const Cartao({super.key, required this.child, this.padding = const EdgeInsets.all(16)});

  @override
  Widget build(BuildContext context) => Container(
        padding: padding,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: child,
      );
}
