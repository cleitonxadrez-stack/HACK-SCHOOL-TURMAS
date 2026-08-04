# HACK SCHOOL — Turmas do contraturno

Site de inscrição nas turmas do contraturno, com clube virtual, votação do mentor,
área do responsável, área do professor mentor e painel da equipe.

HTML, CSS e JavaScript puros falando direto com o Supabase. Sem build, sem servidor.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Estrutura e estilos |
| `app.js` | Toda a aplicação |
| `config.js` | URL e chave pública do Supabase |
| `vercel.json` | Diz ao Vercel que é site estático |

## Antes de publicar — três ajustes no Supabase

### 1 · Autorize o endereço do site

**Authentication → URL Configuration**

- **Site URL**: `https://turmas.hackschool.app`
- **Redirect URLs**: adicione também o endereço provisório do Vercel
  (`https://SEU-PROJETO.vercel.app`) e `http://localhost:3000` para testes

Sem isso o link de acesso por e-mail não funciona.

### 2 · Confirme que o login por e-mail está ativo

**Authentication → Providers → Email** ligado.
Desligue "Confirm email" se quiser que o primeiro acesso seja imediato.

### 3 · Crie sua conta de admin

Entre no site com o seu e-mail, receba o link, acesse. Isso cria seu registro
em `perfis` com papel `responsavel`. Depois, no SQL Editor:

```sql
update perfis set papel = 'admin' where email = 'seu@email.com';
```

Saia e entre de novo. Agora "Minha área" abre o painel da equipe.

Para cadastrar um professor mentor: peça que ele entre uma vez pelo site, e então:

```sql
update perfis set papel = 'mentor' where email = 'mentor@email.com';

update mentores set perfil_id = (select id from perfis where email = 'mentor@email.com')
 where nome = 'Nome do Mentor';
```

## Cadastro inicial (sem isto o site aparece vazio)

Pelo **Table Editor**, nesta ordem:

1. **slots** — os horários possíveis. Ex: rótulo `Ter e Qui · 08h às 09h`,
   dias `Ter e Qui`, início `08:00`, fim `09:00`
2. **polos** — cada escola parceira, e um polo com modalidade `online`
3. **polo_grade** — quais horários cada polo oferece, com `ordem` 1, 2, 3…
   A ordem define qual horário a próxima turma vai usar
4. **mentores** — nome, área, nível, formação, bio, destaques, limite de turmas
5. **mentor_slots** — quais horários cada mentor pode assumir
6. **turmas** — a primeira turma de cada polo: `numero` 1, o `slot_id` do
   primeiro horário da grade. As seguintes o sistema abre sozinho

## Publicar

1. GitHub: repositório novo, suba os quatro arquivos
2. Vercel: **Add New → Project**, importe o repositório, **Deploy**
3. Teste no endereço provisório
4. **Settings → Domains** → `turmas.hackschool.app` → crie o CNAME indicado

## Sobre as chaves em `config.js`

São públicas por natureza — ficam visíveis para qualquer visitante, e é assim
que o Supabase funciona. A proteção real está nas políticas de RLS do banco:
um visitante anônimo só enxerga turmas em formação, um responsável só as
próprias inscrições, e ninguém lê o voto de outra pessoa.

**A chave `service_role` nunca entra neste repositório.** Ela ignora toda a RLS.

## O que ainda não está aqui

- **Pagamento** — a tabela e o cálculo do repasse de 25% existem no banco, falta
  escolher o gateway (Asaas ou Pagar.me) e escrever o webhook
- **Notificação por WhatsApp** quando a turma fecha — sem isso a votação depende
  de a família entrar no site por conta própria
- **Segundo turno** em caso de empate — hoje a turma para e a coordenação resolve
- **Revisão jurídica** do texto de consentimento
