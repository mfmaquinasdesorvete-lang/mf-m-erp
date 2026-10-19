// Lê os mesmos valores do ERP web (.env.production), passados no build com
//   --dart-define-from-file=../.env.production
// Assim o app usa o mesmo projeto Supabase sem repetir chave nenhuma no código.
const supabaseUrl = String.fromEnvironment('VITE_SUPABASE_URL');
const supabaseAnonKey = String.fromEnvironment('VITE_SUPABASE_ANON_KEY');

/// Endereço público da loja web (links de compartilhar, confirmação de e-mail e nova senha).
const lojaUrl = String.fromEnvironment('LOJA_URL', defaultValue: 'https://erp.myfrost.ai/loja');

const bucketFotos = 'produtos-fotos';
