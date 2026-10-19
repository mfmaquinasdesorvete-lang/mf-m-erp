// App da loja MF Máquinas: mesma vitrine, carrinho, conta e pedidos da loja web
// (erp.myfrost.ai/loja). O pedido entra no ERP como orçamento (origem "loja").
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'servicos.dart';
import 'telas/carrinho.dart';
import 'telas/conta.dart';
import 'telas/pedidos.dart';
import 'telas/vitrine.dart';

const corMarca = Color(0xFF067494); // ciano do ERP (--brand)
const corAcento = Color(0xFF00D4FF); // --brand-nav
const corTinta = Color(0xFF071528); // ink

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (supabaseUrl.isEmpty || supabaseAnonKey.isEmpty) {
    runApp(const _SemConfig());
    return;
  }
  await Supabase.initialize(url: supabaseUrl, anonKey: supabaseAnonKey);
  acompanharSessao();
  await carrinho.abrir();
  loja.carregar();
  runApp(const AppLoja());
}

class AppLoja extends StatelessWidget {
  const AppLoja({super.key});

  @override
  Widget build(BuildContext context) {
    final esquema = ColorScheme.fromSeed(seedColor: corMarca, primary: corMarca, secondary: corAcento);
    return MaterialApp(
      title: 'MF Máquinas',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: mensageiro,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: esquema,
        scaffoldBackgroundColor: const Color(0xFFF4F7FB),
        appBarTheme: const AppBarTheme(backgroundColor: corTinta, foregroundColor: Colors.white, elevation: 0),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            textStyle: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
      ),
      home: const Inicio(),
    );
  }
}

class Inicio extends StatelessWidget {
  const Inicio({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: abaAtual,
      builder: (context, aba, _) => Scaffold(
        body: IndexedStack(index: aba, children: const [Vitrine(), TelaCarrinho(), TelaPedidos(), TelaConta()]),
        bottomNavigationBar: ListenableBuilder(
          listenable: Listenable.merge([carrinho, sessao]),
          builder: (context, _) => NavigationBar(
            selectedIndex: aba,
            onDestinationSelected: (i) => abaAtual.value = i,
            destinations: [
              const NavigationDestination(icon: Icon(Icons.storefront_outlined), selectedIcon: Icon(Icons.storefront), label: 'Loja'),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: carrinho.quantidadeTotal > 0,
                  label: Text('${carrinho.quantidadeTotal}'),
                  child: const Icon(Icons.shopping_cart_outlined),
                ),
                selectedIcon: const Icon(Icons.shopping_cart),
                label: 'Carrinho',
              ),
              const NavigationDestination(icon: Icon(Icons.inventory_2_outlined), selectedIcon: Icon(Icons.inventory_2), label: 'Pedidos'),
              NavigationDestination(
                icon: const Icon(Icons.person_outline),
                selectedIcon: const Icon(Icons.person),
                label: sessao.value == null ? 'Entrar' : 'Conta',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SemConfig extends StatelessWidget {
  const _SemConfig();
  @override
  Widget build(BuildContext context) => const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Configuração do Supabase não encontrada.\nRode com --dart-define-from-file=../.env.production',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      );
}
