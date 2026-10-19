import 'package:flutter/material.dart';
import '../config.dart';
import '../servicos.dart';
import 'comum.dart';

class TelaConta extends StatelessWidget {
  const TelaConta({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([sessao, cadastro]),
      builder: (context, _) {
        final s = sessao.value;
        return Scaffold(
          appBar: AppBar(
            title: Text(s == null ? 'Entrar' : 'Minha conta'),
            actions: [
              if (s != null)
                TextButton.icon(
                  style: TextButton.styleFrom(foregroundColor: Colors.white),
                  onPressed: () => sb.auth.signOut(),
                  icon: const Icon(Icons.logout, size: 18),
                  label: const Text('Sair'),
                ),
            ],
          ),
          body: s == null
              ? const _Entrar()
              : !cadastro.carregado
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(padding: const EdgeInsets.all(16), children: [
                      Text(s.user.email ?? '', style: const TextStyle(color: Color(0xFF64748B))),
                      const SizedBox(height: 12),
                      // A chave força o formulário a recomeçar quando o cadastro muda (outra conta, por exemplo)
                      _FormCadastro(key: ValueKey('${s.user.id}-${cadastro.dados != null}'), inicial: cadastro.dados),
                    ]),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------
class _Entrar extends StatefulWidget {
  const _Entrar();
  @override
  State<_Entrar> createState() => _EntrarState();
}

class _EntrarState extends State<_Entrar> {
  bool criar = false, ocupado = false;
  String aviso = '';
  final email = TextEditingController(), senha = TextEditingController(), nome = TextEditingController();

  @override
  void dispose() {
    email.dispose();
    senha.dispose();
    nome.dispose();
    super.dispose();
  }

  Future<void> enviar() async {
    setState(() {
      ocupado = true;
      aviso = '';
    });
    try {
      if (!criar) {
        await sb.auth.signInWithPassword(email: email.text.trim(), password: senha.text);
      } else {
        if (senha.text.length < 8) throw Exception('A senha precisa ter ao menos 8 caracteres');
        final r = await sb.auth.signUp(
          email: email.text.trim(),
          password: senha.text,
          data: {'tipo': 'cliente_loja', 'nome': nome.text.trim()},
          emailRedirectTo: '$lojaUrl/conta',
        );
        if (r.session == null) {
          setState(() {
            aviso = 'Conta criada! Enviamos um link para o seu e-mail: confirme e depois entre aqui.';
            criar = false;
          });
        }
      }
    } catch (e) {
      avisarErro(e);
    } finally {
      if (mounted) setState(() => ocupado = false);
    }
  }

  Future<void> esqueci() async {
    if (email.text.trim().isEmpty) {
      avisar('Digite o seu e-mail primeiro', erro: true);
      return;
    }
    try {
      await sb.auth.resetPasswordForEmail(email.text.trim(), redirectTo: '$lojaUrl/conta');
      setState(() => aviso = 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.');
    } catch (e) {
      avisarErro(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text(criar ? 'Criar conta' : 'Entrar', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
      const SizedBox(height: 4),
      Text(criar ? 'Leva 1 minuto. Depois é só completar o endereço.' : 'Para fazer e acompanhar os seus pedidos.',
          style: const TextStyle(color: Color(0xFF475569))),
      const SizedBox(height: 16),
      Cartao(
        child: AutofillGroup(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (criar) ...[
              TextField(controller: nome, decoration: const InputDecoration(labelText: 'Seu nome'), autofillHints: const [AutofillHints.name]),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(labelText: 'E-mail'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: senha,
              obscureText: true,
              autofillHints: [criar ? AutofillHints.newPassword : AutofillHints.password],
              decoration: const InputDecoration(labelText: 'Senha'),
              onSubmitted: (_) => enviar(),
            ),
            if (aviso.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: const Color(0xFFECFDF5), borderRadius: BorderRadius.circular(10)),
                child: Text(aviso, style: const TextStyle(color: Color(0xFF065F46))),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: ocupado ? null : enviar, child: Text(ocupado ? 'Aguarde…' : criar ? 'Criar minha conta' : 'Entrar')),
            const SizedBox(height: 4),
            Row(children: [
              TextButton(onPressed: () => setState(() => criar = !criar), child: Text(criar ? 'Já tenho conta' : 'Ainda não tenho conta')),
              const Spacer(),
              if (!criar) TextButton(onPressed: esqueci, child: const Text('Esqueci a senha')),
            ]),
          ]),
        ),
      ),
    ]);
  }
}

// ---------------------------------------------------------------------
const _campos = ['cpf_cnpj', 'inscricao_estadual', 'nome', 'whatsapp', 'telefone', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf'];
const _obrigatorios = {'cpf_cnpj', 'nome', 'whatsapp', 'cep', 'logradouro', 'numero', 'bairro', 'municipio', 'uf'};

class _FormCadastro extends StatefulWidget {
  final Map<String, dynamic>? inicial;
  const _FormCadastro({super.key, required this.inicial});
  @override
  State<_FormCadastro> createState() => _FormCadastroState();
}

class _FormCadastroState extends State<_FormCadastro> {
  final form = GlobalKey<FormState>();
  late final Map<String, TextEditingController> c = {
    for (final k in _campos) k: TextEditingController(text: widget.inicial?[k] == null ? '' : '${widget.inicial![k]}'),
  };
  bool ocupado = false;

  bool get pj => digitos(c['cpf_cnpj']!.text).length == 14;

  @override
  void initState() {
    super.initState();
    c['cpf_cnpj']!.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    for (final x in c.values) {
      x.dispose();
    }
    super.dispose();
  }

  void _preencherVazios(Map<String, String> d) {
    d.forEach((k, v) {
      final ctl = c[k];
      if (ctl != null && ctl.text.trim().isEmpty && v.trim().isNotEmpty) ctl.text = v;
    });
  }

  Future<void> salvar() async {
    if (!form.currentState!.validate()) return;
    setState(() => ocupado = true);
    try {
      final p = <String, dynamic>{...?widget.inicial, for (final e in c.entries) e.key: e.value.text.trim().isEmpty ? null : e.value.text.trim()};
      await sb.rpc('loja_salvar_cadastro', params: {'p': p});
      avisar('Cadastro salvo');
      await cadastro.carregar(); // volta ao carrinho sozinho, se o cliente veio de lá
    } catch (e) {
      avisarErro(e);
    } finally {
      if (mounted) setState(() => ocupado = false);
    }
  }

  Widget campo(String k, String rotulo, {TextInputType? teclado, int? max, ValueChanged<bool>? aoFocar}) {
    final f = TextFormField(
      controller: c[k],
      keyboardType: teclado,
      maxLength: max,
      textCapitalization: k == 'uf' ? TextCapitalization.characters : TextCapitalization.none,
      decoration: InputDecoration(labelText: rotulo, counterText: ''),
      validator: (v) => _obrigatorios.contains(k) && (v ?? '').trim().isEmpty ? 'Obrigatório' : null,
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: aoFocar == null ? f : Focus(onFocusChange: aoFocar, child: f),
    );
  }

  @override
  Widget build(BuildContext context) {
    final novo = widget.inicial == null;
    return Cartao(
      child: Form(
        key: form,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(novo ? 'Complete o seu cadastro' : 'Meus dados', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('Usamos para a nota fiscal e a entrega. Empresa: digite o CNPJ que o resto se preenche.',
              style: TextStyle(color: Color(0xFF64748B), fontSize: 13)),
          const SizedBox(height: 16),
          campo('cpf_cnpj', 'CPF ou CNPJ', teclado: TextInputType.number, aoFocar: (focado) async {
            if (focado) return;
            final d = await buscarCnpj(c['cpf_cnpj']!.text);
            if (d != null && mounted) setState(() => _preencherVazios(d));
          }),
          if (pj) campo('inscricao_estadual', 'Inscrição estadual (se tiver)'),
          campo('nome', pj ? 'Razão social' : 'Nome completo'),
          campo('whatsapp', 'WhatsApp', teclado: TextInputType.phone),
          campo('telefone', 'Telefone (opcional)', teclado: TextInputType.phone),
          campo('cep', 'CEP', teclado: TextInputType.number, aoFocar: (focado) async {
            if (focado) return;
            final r = await buscarCep(c['cep']!.text);
            if (r != null && mounted) {
              setState(() => r.forEach((k, v) {
                    if (v.isNotEmpty) c[k]!.text = v;
                  }));
            }
          }),
          campo('logradouro', 'Rua / avenida'),
          Row(children: [
            Expanded(child: campo('numero', 'Número')),
            const SizedBox(width: 12),
            Expanded(child: campo('complemento', 'Complemento')),
          ]),
          campo('bairro', 'Bairro'),
          Row(children: [
            Expanded(flex: 3, child: campo('municipio', 'Cidade')),
            const SizedBox(width: 12),
            Expanded(child: campo('uf', 'UF', max: 2)),
          ]),
          const SizedBox(height: 4),
          FilledButton(
            onPressed: ocupado ? null : salvar,
            child: Text(ocupado ? 'Salvando…' : voltarAoCarrinho ? 'Salvar e voltar ao carrinho' : 'Salvar'),
          ),
        ]),
      ),
    );
  }
}
