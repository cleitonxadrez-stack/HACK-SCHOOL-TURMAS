// =====================================================================
// HACK SCHOOL — Turmas · configuração
//
// Estas duas chaves são PÚBLICAS por natureza. Elas ficam visíveis para
// qualquer pessoa que abrir o site — é assim que o Supabase funciona.
// A proteção real está nas políticas de RLS dentro do banco.
//
// A chave "service_role" NUNCA entra neste arquivo nem neste repositório.
// =====================================================================

window.HACK_CONFIG = {
  SUPABASE_URL: 'https://wkqsobfuudyponkpwikv.supabase.co',
  SUPABASE_KEY: 'sb_publishable_U82TETYWJpmr6F-WiIXM0Q_MGmgngr-',

  // Se algum dia a chave publishable der problema de compatibilidade,
  // troque pela chave legada 'anon' (formato eyJ...) do mesmo projeto.

  WHATSAPP_CONTATO: '5565999999999',   // troque pelo número real da equipe
  EMAIL_CONTATO: 'hackschoolbr@gmail.com'
};
