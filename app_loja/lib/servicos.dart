// Acesso ao Supabase (as mesmas funções que a loja web usa) e estado do app.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import 'config.dart';
import 'modelos.dart';

SupabaseClient get sb => Supabase.instance.client;

// ---------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------
final _brl = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
String brl(num v) => _brl.format(v);
String digitos(String? s) => (s ?? '').replaceAll(RegExp(r'\D'), '');

String dataBR(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  String dois(int n) => n.toString().padLeft(2, '0');
  return '${dois(d.day)}/${dois(d.month)}/${d.year}';
}

String somarDias(int dias) => DateTime.now().add(Duration(days: dias)).toIso8601String();

String urlFoto(String? caminho) {
  if (caminho == null || caminho.isEmpty) return '';
  if (RegExp(r'^https?://').hasMatch(caminho)) return caminho;
  return sb.storage.from(bucketFotos).getPublicUrl(caminho);
}

String urlProduto(String id) => '$lojaUrl/$id';

Future<void> abrirWhatsapp(String? numero, String mensagem) async {
  var n = digitos(numero);
  if (n.isNotEmpty && n.length <= 11) n = '55$n';
  await launchUrl(Uri.parse('https://wa.me/$n?text=${Uri.encodeComponent(mensagem)}'), mode: LaunchMode.externalApplication);
}

const disponibilidades = {
  'in stock': ('Pronta entrega', Color(0xFFECFDF5), Color(0xFF047857)),
  'available for order': ('Sob encomenda', Color(0xFFF0F9FF), Color(0xFF0369A1)),
  'out of stock': ('Esgotado', Color(0xFFF1F5F9), Color(0xFF475569)),
};

// ---------------------------------------------------------------------
// Avisos (SnackBar global)
// ---------------------------------------------------------------------
final mensageiro = GlobalKey<ScaffoldMessengerState>();

void avisar(String texto, {bool erro = false}) {
  mensageiro.currentState
    ?..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(texto), backgroundColor: erro ? const Color(0xFFB91C1C) : null));
}

void avisarErro(Object e) {
  var t = e is AuthException ? e.message : e is PostgrestException ? e.message : '$e';
  if (t.contains('Invalid login')) t = 'E-mail ou senha incorretos';
  avisar(t.replaceFirst('Exception: ', ''), erro: true);
}

// ---------------------------------------------------------------------
// Navegação entre abas (Loja, Carrinho, Pedidos, Conta)
// ---------------------------------------------------------------------
final abaAtual = ValueNotifier<int>(0);

/// Quando o cliente sai do carrinho para entrar/completar o cadastro, volta ao carrinho depois.
bool voltarAoCarrinho = false;

// ---------------------------------------------------------------------
// Dados da loja (rpc loja_dados)
// ---------------------------------------------------------------------
class Loja extends ChangeNotifier {
  DadosLoja? dados;
  Object? erro;
  bool carregando = false;

  Future<void> carregar() async {
    carregando = true;
    erro = null;
    notifyListeners();
    try {
      final r = await sb.rpc('loja_dados');
      dados = DadosLoja.fromJson(Map<String, dynamic>.from(r as Map));
    } catch (e) {
      erro = e;
    } finally {
      carregando = false;
      notifyListeners();
    }
  }
}

final loja = Loja();

// ---------------------------------------------------------------------
// Carrinho (fica no aparelho)
// ---------------------------------------------------------------------
class Carrinho extends ChangeNotifier {
  static const _chave = 'erp-line-carrinho';
  final Map<String, int> itens = {};

  int get quantidadeTotal => itens.values.fold(0, (s, q) => s + q);

  Future<void> abrir() async {
    try {
      final p = await SharedPreferences.getInstance();
      final lista = jsonDecode(p.getString(_chave) ?? '[]') as List;
      for (final i in lista) {
        itens['${i['id']}'] = (i['quantidade'] as num).toInt();
      }
      notifyListeners();
    } catch (_) {/* carrinho vazio */}
  }

  void _gravar() {
    notifyListeners();
    SharedPreferences.getInstance().then((p) => p.setString(
        _chave, jsonEncode(itens.entries.map((e) => {'id': e.key, 'quantidade': e.value}).toList())));
  }

  void adicionar(String id, [int q = 1]) {
    itens[id] = ((itens[id] ?? 0) + q).clamp(1, 99).toInt();
    _gravar();
  }

  void alterar(String id, int q) {
    if (q <= 0) {
      itens.remove(id);
    } else {
      itens[id] = q.clamp(1, 99).toInt();
    }
    _gravar();
  }

  void limpar() {
    itens.clear();
    _gravar();
  }
}

final carrinho = Carrinho();

// ---------------------------------------------------------------------
// Sessão do cliente e cadastro (rpc loja_meu_cadastro)
// ---------------------------------------------------------------------
final sessao = ValueNotifier<Session?>(null);

class Cadastro extends ChangeNotifier {
  Map<String, dynamic>? dados;
  bool carregado = false;

  Future<void> carregar() async {
    if (sessao.value == null) {
      dados = null;
      carregado = false;
      notifyListeners();
      return;
    }
    try {
      final r = await sb.rpc('loja_meu_cadastro');
      dados = r == null ? null : Map<String, dynamic>.from(r as Map);
    } catch (_) {
      dados = null;
    }
    carregado = true;
    // Entrou (ou completou o cadastro) vindo do carrinho: volta para finalizar o pedido
    if (voltarAoCarrinho && dados != null) {
      voltarAoCarrinho = false;
      abaAtual.value = 1;
    }
    notifyListeners();
  }
}

final cadastro = Cadastro();

StreamSubscription<AuthState>? _assinatura;

void acompanharSessao() {
  sessao.value = sb.auth.currentSession;
  cadastro.carregar();
  _assinatura ??= sb.auth.onAuthStateChange.listen((e) {
    final mudou = sessao.value?.user.id != e.session?.user.id;
    sessao.value = e.session;
    if (mudou) cadastro.carregar();
  });
}

// ---------------------------------------------------------------------
// CEP e CNPJ (preenchimento automático do cadastro)
// ---------------------------------------------------------------------
Future<Map<String, dynamic>?> _json(String url) async {
  try {
    final r = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 12));
    return r.statusCode == 200 ? Map<String, dynamic>.from(jsonDecode(r.body) as Map) : null;
  } catch (_) {
    return null;
  }
}

Future<Map<String, String>?> buscarCep(String cep) async {
  final d = digitos(cep);
  if (d.length != 8) return null;
  final v = await _json('https://viacep.com.br/ws/$d/json/');
  if (v != null && v['erro'] == null) {
    return {'logradouro': '${v['logradouro'] ?? ''}', 'bairro': '${v['bairro'] ?? ''}', 'municipio': '${v['localidade'] ?? ''}', 'uf': '${v['uf'] ?? ''}'};
  }
  final b = await _json('https://brasilapi.com.br/api/cep/v1/$d');
  if (b == null) return null;
  return {'logradouro': '${b['street'] ?? ''}', 'bairro': '${b['neighborhood'] ?? ''}', 'municipio': '${b['city'] ?? ''}', 'uf': '${b['state'] ?? ''}'};
}

String _titulo(String s) => s
    .toLowerCase()
    .split(' ')
    .map((p) => p.isEmpty ? p : (['de', 'da', 'do', 'das', 'dos', 'e'].contains(p) ? p : p[0].toUpperCase() + p.substring(1)))
    .join(' ');

Future<Map<String, String>?> buscarCnpj(String doc) async {
  final d = digitos(doc);
  if (d.length != 14) return null;
  final j = await _json('https://brasilapi.com.br/api/cnpj/v1/$d');
  if (j == null || j['razao_social'] == null) return null;
  String s(dynamic v) => v == null ? '' : '$v';
  return {
    'nome': s(j['razao_social']),
    'telefone': digitos(s(j['ddd_telefone_1'])),
    'cep': digitos(s(j['cep'])),
    'logradouro': _titulo([s(j['descricao_tipo_de_logradouro']), s(j['logradouro'])].where((x) => x.isNotEmpty).join(' ')),
    'numero': s(j['numero']),
    'complemento': s(j['complemento']),
    'bairro': _titulo(s(j['bairro'])),
    'municipio': _titulo(s(j['municipio'])),
    'uf': s(j['uf']),
  };
}
