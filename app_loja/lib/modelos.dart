double numero(dynamic v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
int? inteiro(dynamic v) => v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));
String? texto(dynamic v) => v == null || '$v'.trim().isEmpty ? null : '$v';

class Empresa {
  final String nome;
  final String? whatsapp, endereco, municipio, uf, apresentacao, logo, slogan;
  Empresa({required this.nome, this.whatsapp, this.endereco, this.municipio, this.uf, this.apresentacao, this.logo, this.slogan});
  factory Empresa.fromJson(Map<String, dynamic> j) => Empresa(
        nome: texto(j['nome']) ?? 'Loja',
        whatsapp: texto(j['whatsapp']),
        endereco: texto(j['endereco']),
        municipio: texto(j['municipio']),
        uf: texto(j['uf']),
        apresentacao: texto(j['texto']),
        logo: texto(j['logo']),
        slogan: texto(j['slogan']),
      );
}

class Produto {
  final String id, nome, tipo, disponibilidade;
  final String? sku, descricao, foto;
  final double preco;
  final int? garantiaMeses, prazoDias;
  Produto({
    required this.id, required this.nome, required this.tipo, required this.disponibilidade, required this.preco,
    this.sku, this.descricao, this.foto, this.garantiaMeses, this.prazoDias,
  });
  bool get disponivel => disponibilidade != 'out of stock';
  factory Produto.fromJson(Map<String, dynamic> j) => Produto(
        id: '${j['id']}',
        nome: texto(j['nome']) ?? '',
        tipo: texto(j['tipo']) ?? '',
        disponibilidade: texto(j['disponibilidade']) ?? 'out of stock',
        preco: numero(j['preco']),
        sku: texto(j['sku']),
        descricao: texto(j['descricao']),
        foto: texto(j['foto']),
        garantiaMeses: inteiro(j['garantia_meses']),
        prazoDias: inteiro(j['prazo_dias']),
      );
}

class DadosLoja {
  final Empresa empresa;
  final List<Produto> produtos;
  DadosLoja(this.empresa, this.produtos);
  factory DadosLoja.fromJson(Map<String, dynamic> j) => DadosLoja(
        Empresa.fromJson(Map<String, dynamic>.from(j['empresa'] ?? {})),
        ((j['produtos'] ?? []) as List).map((p) => Produto.fromJson(Map<String, dynamic>.from(p))).toList(),
      );
  Produto? produto(String id) {
    for (final p in produtos) {
      if (p.id == id) return p;
    }
    return null;
  }
}

class ItemPedido {
  final String descricao;
  final double quantidade, valor;
  ItemPedido(this.descricao, this.quantidade, this.valor);
}

class Pedido {
  final int codigo;
  final String data, status;
  final double total, frete;
  final String? rastreio;
  final List<ItemPedido> itens;
  Pedido(this.codigo, this.data, this.status, this.total, this.frete, this.rastreio, this.itens);
  factory Pedido.fromJson(Map<String, dynamic> j) => Pedido(
        inteiro(j['numero']) ?? 0,
        '${j['data'] ?? ''}',
        '${j['status'] ?? 'orcamento'}',
        numero(j['total']),
        numero(j['frete']),
        texto(j['rastreio']),
        ((j['itens'] ?? []) as List)
            .map((i) => ItemPedido('${i['descricao'] ?? ''}', numero(i['quantidade']), numero(i['valor'])))
            .toList(),
      );
}
