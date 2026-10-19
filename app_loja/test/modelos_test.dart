import 'package:flutter_test/flutter_test.dart';
import 'package:loja_mf/modelos.dart';

void main() {
  test('lê os dados da loja como vêm da função loja_dados', () {
    final d = DadosLoja.fromJson({
      'empresa': {'nome': 'MF Máquinas', 'whatsapp': '48 3375-5280', 'texto': ''},
      'produtos': [
        {'id': 'a1', 'nome': 'Máquina de sorvete', 'tipo': 'maquina', 'preco': '12990.50', 'disponibilidade': 'in stock', 'garantia_meses': 12},
        {'id': 'b2', 'nome': 'Peça', 'tipo': 'peca', 'preco': 80, 'disponibilidade': 'out of stock'},
      ],
    });
    expect(d.empresa.nome, 'MF Máquinas');
    expect(d.empresa.apresentacao, isNull);
    expect(d.produtos.length, 2);
    expect(d.produto('a1')!.preco, 12990.5);
    expect(d.produto('a1')!.disponivel, isTrue);
    expect(d.produto('b2')!.disponivel, isFalse);
  });

  test('lê um pedido de loja_meus_pedidos', () {
    final p = Pedido.fromJson({
      'numero': 42, 'data': '2026-10-19', 'status': 'aprovado', 'total': 100, 'frete': 0,
      'itens': [{'descricao': 'Peça', 'quantidade': 2, 'valor': 100}],
    });
    expect(p.codigo, 42);
    expect(p.itens.single.quantidade, 2);
  });
}
