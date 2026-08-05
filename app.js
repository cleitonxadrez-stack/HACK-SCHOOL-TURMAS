/* =====================================================================
   HACK SCHOOL — Turmas · aplicação
   Fala direto com o Supabase. A segurança está na RLS do banco.
   ===================================================================== */

const CFG = window.HACK_CONFIG;
const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
const CLUBE = 6;

const FUNCOES = [
  ['CEO','conduz a equipe e apresenta o pitch'],
  ['CTO','constrói a solução com apoio de IA'],
  ['CMO','cuida da marca e da comunicação'],
  ['CFO','define preço, custo e modelo de negócio'],
  ['Designer','desenha a experiência e a identidade'],
  ['Pesquisador','investiga o problema e valida com usuários']
];

const FASES = {
  formando:{rot:'Formando turma',cls:'st-matriculada'},
  votacao:{rot:'Equipe votando',cls:'st-contato'},
  empate:{rot:'Empate — definir',cls:'st-cancelada'},
  convite:{rot:'Convite ao mentor',cls:'st-nova'},
  sem_candidato:{rot:'Sem candidato',cls:'st-cancelada'},
  alinhamento:{rot:'Alinhamento inicial',cls:'st-matriculada'},
  hub:{rot:'No HACK HUB',cls:'st-ativa'},
  encerrada:{rot:'Encerrada',cls:'st-cancelada'}
};

const STATUS = {
  nova:{rot:'Nova inscrição',cls:'st-nova'},
  contatada:{rot:'Em contato',cls:'st-contato'},
  matriculada:{rot:'Matriculada',cls:'st-matriculada'},
  ativa:{rot:'Ativa / paga',cls:'st-ativa'},
  cancelada:{rot:'Cancelada',cls:'st-cancelada'}
};

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nn = n => String(n).padStart(2,'0');
const iniciais = n => (n||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
const soDigitos = s => (s||'').replace(/\D/g,'');
const dataBR = d => d ? d.split('T')[0].split('-').reverse().join('/') : '—';

function mascaraTel(v){ v=soDigitos(v).slice(0,11);
  if(v.length>10) return v.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
  if(v.length>6)  return v.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3');
  if(v.length>2)  return v.replace(/(\d{2})(\d{0,5})/,'($1) $2');
  return v; }
function mascaraCPF(v){ v=soDigitos(v).slice(0,11);
  return v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'); }

function toast(msg, erro){
  const t=$('#toast'); t.textContent=msg;
  t.style.background = erro ? 'var(--vermelho)' : 'var(--amarelo)';
  t.style.color = erro ? '#fff' : '#12100A';
  t.classList.add('on'); setTimeout(()=>t.classList.remove('on'), 4200);
}
function erroSupabase(e){
  const m = e?.message || String(e);
  if(m.includes('não está mais recebendo')) return 'Essa vaga acabou de ser preenchida. Escolha outra turma.';
  if(m.includes('duplicate key') && m.includes('sugestao')) return 'Esse nome já foi sugerido.';
  if(m.includes('insufficient_privilege') || m.includes('Sem acesso')) return 'Você não tem acesso a isso.';
  if(m.includes('Somente a equipe')) return 'Somente a equipe pode cadastrar. Saia e entre de novo.';
  if(m.includes('entrou no site com este e-mail')) return 'Ninguém entrou no site com esse e-mail ainda. Peça para a pessoa acessar uma vez.';
  if(m.includes('polos_nome') || m.includes('slots_rotulo_key')) return 'Já existe um cadastro com esse nome.';
  return m;
}
function ir(h){ location.hash = h; }
function carregando(){ return '<div class="vazio-msg">Carregando…</div>'; }

/* ---------- sessão ---------- */
let sessao = { user:null, perfil:null, mentor:null, areas:[], area:null };

const AREAS = {
  equipe:      { rot:'Painel da equipe',  sub:'inscrições, turmas e cadastros' },
  mentor:      { rot:'Meus clubes',       sub:'convites e alinhamento' },
  responsavel: { rot:'Minhas inscrições', sub:'acompanhar e votar' }
};

// Uma pessoa pode ser várias coisas ao mesmo tempo. O banco já sabe disso:
// admin vem do campo papel, mentor vem do cadastro em mentores ligado à conta,
// coordenador vem de polo_coordenadores, responsável vem de ter inscrições.
async function carregarSessao(){
  const { data:{ session } } = await sb.auth.getSession();
  sessao.user = session?.user || null;
  sessao.perfil = null; sessao.mentor = null; sessao.areas = [];
  if(!sessao.user) return;

  await sb.rpc('fn_vincular_inscricoes').catch(()=>{});
  const uid = sessao.user.id;

  const [perfil, mentor, coord, insc] = await Promise.all([
    sb.from('perfis').select('id,papel,nome,email').eq('id', uid).maybeSingle(),
    sb.from('mentores').select('*').eq('perfil_id', uid).maybeSingle(),
    sb.from('polo_coordenadores').select('polo_id').eq('perfil_id', uid),
    sb.from('inscricoes').select('id', {count:'exact', head:true}).eq('responsavel_user_id', uid)
  ]);

  sessao.perfil = perfil.data;
  sessao.mentor = mentor.data || null;

  const papel = perfil.data?.papel;
  if(papel === 'admin' || papel === 'coordenador' || (coord.data||[]).length) sessao.areas.push('equipe');
  if(sessao.mentor) sessao.areas.push('mentor');
  if((insc.count||0) > 0) sessao.areas.push('responsavel');
  if(!sessao.areas.length) sessao.areas.push('responsavel');   // sem nada ainda

  if(!sessao.areas.includes(sessao.area)) sessao.area = sessao.areas[0];
}

// Se a pessoa escolheu um perfil que ela não tem, avisa em vez de fingir
function avisoPerfil(){
  if(!perfilEscolhido || sessao.areas.includes(perfilEscolhido)) return '';
  const nome = (PERFIS_LOGIN.find(x=>x[0]===perfilEscolhido)||[])[1] || '';
  const texto = perfilEscolhido==='mentor'
    ? 'Seu e-mail ainda não está ligado a um cadastro de professor mentor. Peça à coordenação para fazer essa ligação.'
    : perfilEscolhido==='equipe'
      ? 'Seu e-mail não tem acesso ao painel da equipe.'
      : 'Ainda não há inscrição vinculada a este e-mail.';
  return `<div class="aviso" style="border-left-color:var(--laranja);margin-bottom:20px">
    <b style="color:var(--laranja)">Você entrou como ${esc(nome)}, mas esse acesso não está disponível.</b><br>${texto}</div>`;
}

// Linha discreta de troca, só para quem realmente tem mais de um acesso
function seletorArea(){
  const outras = sessao.areas.filter(a=>a!==sessao.area);
  if(!outras.length) return avisoPerfil();
  return avisoPerfil() + `<div class="trocaLinha">Trocar para
    ${outras.map(a=>`<button data-area="${a}">${AREAS[a].rot}</button>`).join('')}
  </div>`;
}

/* =====================================================================
   HOME
   ===================================================================== */
function vHome(n){
  return `
  <section class="hero"><div class="molde heroGrid">
    <div>
      <div class="selo">⚡ Inscrições abertas${n?` · <b>${n} turma${n>1?'s':''} formando agora</b>`:''}</div>
      <h1 style="margin:18px 0 14px">Laboratório de <span class="destaque">Startups</span><br>com Inteligência Artificial</h1>
      <p class="sub">No contraturno da escola ou ao vivo pela internet, seu filho aprende a criar sites, aplicativos, sistemas e soluções com IA — e transforma ideias em negócios reais antes de sair do Ensino Médio.</p>
      <div class="heroCta">
        <button class="btn amarelo" data-ir="#/turmas">Ver turmas abertas</button>
        <button class="btn vazio" data-ir="#/entrar">Entrar</button>
      </div>
      <div class="fatos">
        <div class="fato"><b>6 alunos</b><span>POR TURMA — UM CLUBE HACK</span></div>
        <div class="fato"><b>2 horas</b><span>POR SEMANA</span></div>
        <div class="fato"><b>Presencial</b><span>NOS POLOS PARCEIROS</span></div>
        <div class="fato"><b>Ou online</b><span>AO VIVO, EM TODO O BRASIL</span></div>
      </div>
    </div>
    <div class="cartaoLado">
      <div class="olho">Como funciona</div>
      <div class="trilha">
        ${[['Descubra seus talentos','Conheça seu perfil HACK e descubra como pode contribuir para a equipe.'],
           ['Crie sua startup','Sua turma é um Clube HACK de 6 estudantes. Cada um assume uma função.'],
           ['Descubra um problema','Investigue desafios da comunidade, das empresas e da sociedade.'],
           ['Desenvolva a solução','Use IA para criar sites, aplicativos, sistemas e outras soluções digitais.'],
           ['Apresente ao mundo','Participe do Festival HACK e do HACKTHON diante de empresários e especialistas.']
          ].map((e,i)=>`<div class="etapa"><div class="bolha">${i+1}</div>
            <div><h4>${e[0]}</h4><p>${e[1]}</p></div></div>`).join('')}
      </div>
    </div>
  </div></section>

  <section class="secao"><div class="molde">
    <div class="olho">Por que só 6 por turma</div>
    <h2 style="margin:10px 0 14px">A turma não é uma sala de aula. É uma equipe.</h2>
    <p class="sub" style="margin-bottom:26px">Cada Clube HACK funciona como uma startup: seis pessoas, seis funções, um produto. Quando a turma fecha, a equipe escolhe junto o professor mentor — e a próxima turma abre no horário seguinte.</p>
    <div class="grade3">
      ${FUNCOES.map(f=>`<div class="item"><h3>${f[0]}</h3><p>${f[1][0].toUpperCase()+f[1].slice(1)}.</p></div>`).join('')}
    </div>
  </div></section>

  <section class="secao"><div class="molde">
    <div class="olho">O que você vai aprender a criar</div>
    <h2 style="margin:10px 0 26px">Produtos de verdade, no seu portfólio</h2>
    <div class="grade4">
      ${[['Sites profissionais','Páginas publicadas de verdade, no ar.'],
         ['Aplicativos mobile','Apps que resolvem um problema real.'],
         ['Sistemas web','Cadastros, painéis e automações.'],
         ['Soluções com IA','Assistentes e geradores inteligentes.'],
         ['Lojas virtuais','Do catálogo ao checkout.'],
         ['Dashboards','Dados virando decisão.'],
         ['Automações','Processos repetitivos resolvidos com lógica.'],
         ['Startups','O time vira empresa, com pitch e investidores.']
        ].map(i=>`<div class="item"><h3>${i[0]}</h3><p>${i[1]}</p></div>`).join('')}
    </div>
  </div></section>

  <section class="secao"><div class="molde">
    <div class="olho">Durante o programa você vai desenvolver</div>
    <h2 style="margin:10px 0 8px">Competências que a escola não ensina sozinha</h2>
    <div class="marcas">
      ${['Inteligência Artificial','Empreendedorismo','Marketing Digital','Comunicação e Pitch','Gestão de Projetos','Criatividade','Liderança','Educação Financeira','Trabalho em Equipe','Resolução de Problemas Reais']
        .map(m=>`<span class="marcaChip">${m}</span>`).join('')}
    </div>
  </div></section>

  <section class="secao"><div class="molde" style="text-align:center">
    <div class="olho">Inscrições abertas</div>
    <h2 style="margin:12px 0 14px">Escolha o polo ou entre numa turma online</h2>
    <p class="sub" style="margin:0 auto 26px">A inscrição não tem custo. Nossa equipe confirma sua vaga pelo WhatsApp e só então o pagamento é liberado.</p>
    <button class="btn amarelo" data-ir="#/turmas">Ver turmas abertas</button>
  </div></section>`;
}

/* =====================================================================
   TURMAS ABERTAS
   ===================================================================== */
let fTexto='', fUF='todos', fModo='todas';
let cacheTurmas = null;

async function carregarTurmas(){
  const { data, error } = await sb.from('turmas')
    .select('id,numero,capacidade,ocupadas,slot_id,slots(rotulo),polos(id,nome,modalidade,cidade,uf,endereco,valor_mensal)')
    .eq('fase','formando')
    .order('numero');
  if(error) throw error;

  const slots = [...new Set(data.map(t=>t.slot_id))];
  let disp = {};
  if(slots.length){
    const { data:ms } = await sb.from('mentor_slots')
      .select('slot_id,mentores(id,nome,ativo)').in('slot_id', slots);
    (ms||[]).forEach(r=>{
      if(!r.mentores?.ativo) return;
      (disp[r.slot_id] = disp[r.slot_id] || []).push(r.mentores);
    });
  }
  data.forEach(t => t.candidatos = disp[t.slot_id] || []);
  cacheTurmas = data;
  return data;
}

function vTurmas(lista){
  const ufs = ['todos', ...new Set(lista.filter(t=>t.polos.modalidade==='presencial').map(t=>t.polos.uf))];
  return `
  <section class="secao" style="border-top:none;padding-top:46px"><div class="molde">
    <div class="olho">Passo 1 de 2</div>
    <h2 style="margin:10px 0 10px">Escolha sua turma</h2>
    <p class="sub">Cada turma é um Clube HACK de 6 estudantes. Quando uma fecha, a próxima abre no horário seguinte — então sempre há uma vaga em formação.</p>

    <div class="buscaBar">
      <div class="campoBusca"><input id="busca" placeholder="Buscar por escola ou cidade…" value="${esc(fTexto)}" autocomplete="off"></div>
    </div>
    <div class="filtros">
      ${[['todas','Todas as turmas'],['online','⚡ Online — todo o Brasil'],['presencial','Presencial nos polos']]
        .map(m=>`<button class="fchip ${fModo===m[0]?'on':''}" data-modo="${m[0]}">${m[1]}</button>`).join('')}
    </div>
    <div class="filtros" style="margin-bottom:0;${fModo==='online'?'display:none':''}">
      ${ufs.map(u=>`<button class="fchip ${fUF===u?'on':''}" data-uf="${u}">${u==='todos'?'Todos os estados':u}</button>`).join('')}
    </div>

    <div class="polos" id="listaPolos">${htmlTurmas(lista)}</div>
  </div></section>`;
}

function htmlTurmas(lista){
  const q = fTexto.trim().toLowerCase();
  let f = lista.filter(t=>{
    const p = t.polos;
    if(fModo!=='todas' && p.modalidade!==fModo) return false;
    if(p.modalidade==='presencial' && fUF!=='todos' && p.uf!==fUF) return false;
    if(!q) return true;
    if(p.modalidade==='online') return 'online ao vivo brasil nacional'.includes(q);
    return (p.nome+' '+(p.cidade||'')).toLowerCase().includes(q);
  });
  f = [...f.filter(t=>t.polos.modalidade==='online'), ...f.filter(t=>t.polos.modalidade!=='online')];

  if(!f.length) return `<div class="vazio-msg" style="grid-column:1/-1">
    Nenhuma turma aberta com esse filtro agora.<br><br>
    <button class="btn vazio peq" data-limpar="1">Ver todas as turmas</button>
    <button class="btn vazio peq" data-ir="#/indicar">Indicar minha escola</button></div>`;

  return f.map(t=>{
    const p = t.polos, online = p.modalidade==='online';
    const livres = t.capacidade - t.ocupadas;
    return `<article class="polo ${online?'online':''}">
      <div class="uTopo">
        <div><h3>${esc(p.nome)}</h3>
          <div class="uEnd">${esc(p.endereco||'')}${online?'':' · '+esc(p.cidade||'')}</div></div>
        ${online?'<span class="tagAo">AO VIVO · BRASIL</span>':`<span class="tagUf">${esc(p.uf||'')}</span>`}
      </div>
      ${t.numero>1?`<div class="fechadas"><span class="fechadaChip">${t.numero-1} turma${t.numero>2?'s':''} anterior${t.numero>2?'es':''} <b>completa${t.numero>2?'s':''}</b></span></div>`:''}
      <div class="turma aberta">
        <div class="turmaTopo">
          <span class="turmaNum">TURMA ${nn(t.numero)} · FORMANDO</span>
          <span class="turmaHora">${esc(t.slots?.rotulo||'')}</span>
        </div>
        <div class="assentos">
          ${Array.from({length:t.capacidade},(_,i)=>
            i<t.ocupadas ? `<span class="assento ocupado">${i+1}</span>`
            : i===t.ocupadas ? `<span class="assento proximo">${i+1}</span>`
            : `<span class="assento">${i+1}</span>`).join('')}
        </div>
        <div class="turmaEstado livre">${livres} de ${t.capacidade} vagas livres · R$ ${Number(p.valor_mensal).toFixed(0)},00/mês</div>
        <div class="mentorLinha equipe"><span class="avatar">★</span>
          <div><b>Mentor escolhido pela equipe</b>
          <span>${t.candidatos.length} mentor${t.candidatos.length===1?'':'es'} disponíve${t.candidatos.length===1?'l':'is'} neste horário</span></div>
          <span class="miniAvs">${t.candidatos.slice(0,4).map(c=>`<i>${iniciais(c.nome)}</i>`).join('')}</span></div>
        <button class="btn amarelo peq" style="margin-top:12px;width:100%" data-turma="${t.id}">
          Pegar a vaga ${t.ocupadas+1}
        </button>
      </div>
    </article>`;
  }).join('');
}

/* =====================================================================
   INSCRIÇÃO
   ===================================================================== */
let rascunho = { turma:null, etapa:1, dados:{} };

function vInscricao(){
  const t = rascunho.turma; if(!t){ ir('#/turmas'); return carregando(); }
  const p = t.polos, d = rascunho.dados, online = p.modalidade==='online';

  let corpo='';
  if(rascunho.etapa===1){
    corpo=`<h3 style="margin-bottom:16px">Dados do estudante</h3>
      <div class="campos">
        <div class="campo full"><label for="f_aluno">Nome completo do estudante</label>
          <input id="f_aluno" value="${esc(d.aluno||'')}" placeholder="Como aparece no boletim"></div>
        <div class="campo"><label for="f_nasc">Data de nascimento</label>
          <input id="f_nasc" type="date" value="${esc(d.nasc||'')}"></div>
        <div class="campo"><label for="f_serie">Série que está cursando</label>
          <select id="f_serie">${['','6º ano','7º ano','8º ano','9º ano','1º ano EM','2º ano EM','3º ano EM']
            .map(s=>`<option value="${s}" ${d.serie===s?'selected':''}>${s||'Selecione…'}</option>`).join('')}</select></div>
        <div class="campo full"><label for="f_escola">Escola em que estuda hoje</label>
          <input id="f_escola" value="${esc(d.escola ?? (online?'':p.nome))}"></div>
        ${online?`<div class="campo"><label for="f_cidade">Cidade</label><input id="f_cidade" value="${esc(d.cidade||'')}"></div>
        <div class="campo"><label for="f_uf">Estado</label><input id="f_uf" value="${esc(d.uf||'')}" placeholder="MT" maxlength="2"></div>
        <div class="campo full"><div class="aviso">A turma online funciona em encontros ao vivo com professor mentor, em horário de Brasília. O estudante precisa de computador ou notebook com internet.</div></div>`:''}
      </div>`;
  }
  if(rascunho.etapa===2){
    corpo=`<h3 style="margin-bottom:16px">Dados do responsável</h3>
      <div class="campos">
        <div class="campo full"><label for="f_resp">Nome completo do responsável</label><input id="f_resp" value="${esc(d.resp||'')}"></div>
        <div class="campo"><label for="f_cpf">CPF do responsável</label><input id="f_cpf" value="${esc(d.cpf||'')}" placeholder="000.000.000-00" inputmode="numeric"></div>
        <div class="campo"><label for="f_zap">WhatsApp</label><input id="f_zap" value="${esc(d.zap||'')}" placeholder="(00) 00000-0000" inputmode="numeric"></div>
        <div class="campo full"><label for="f_mail">E-mail</label>
          <input id="f_mail" type="email" value="${esc(d.email||'')}" placeholder="é por aqui que você acessa a área do aluno"></div>
        <div class="campo full"><label for="f_como">Como conheceu o HACK SCHOOL?</label>
          <select id="f_como">${['','Pela escola','Instagram','Anúncio','Indicação de amigo','Folder / cartaz','Outro']
            .map(s=>`<option value="${s}" ${d.como===s?'selected':''}>${s||'Selecione…'}</option>`).join('')}</select></div>
      </div>`;
  }
  if(rascunho.etapa===3){
    corpo=`<h3 style="margin-bottom:16px">Confira antes de enviar</h3>
      <div class="resumo">
        <div class="linhaResumo"><span>Estudante</span><span>${esc(d.aluno)} · ${esc(d.serie)}</span></div>
        <div class="linhaResumo"><span>Modalidade</span><span>${online?'Online ao vivo':'Presencial'}</span></div>
        <div class="linhaResumo"><span>${online?'Programa':'Polo'}</span><span>${esc(p.nome)}${online?'':' — '+esc(p.cidade||'')+'/'+esc(p.uf||'')}</span></div>
        <div class="linhaResumo"><span>Turma</span><span>Turma ${nn(t.numero)} · ${esc(t.slots?.rotulo||'')}</span></div>
        <div class="linhaResumo"><span>Professor mentor</span><span>escolhido pela equipe</span></div>
        <div class="linhaResumo"><span>Responsável</span><span>${esc(d.resp)}</span></div>
        <div class="linhaResumo"><span>Contato</span><span>${esc(d.zap)}<br>${esc(d.email)}</span></div>
        <div class="linhaResumo"><span>Investimento</span><span>R$ ${Number(p.valor_mensal).toFixed(0)},00 por mês</span></div>
      </div>
      <div class="aceite">
        <input type="checkbox" id="f_lgpd" ${d.lgpd?'checked':''}>
        <label for="f_lgpd" style="font-weight:500;color:var(--suave)">Sou o responsável legal pelo estudante e autorizo o HACK SCHOOL a tratar estes dados para contato sobre a inscrição, conforme a Lei Geral de Proteção de Dados. Posso pedir a exclusão a qualquer momento.</label>
      </div>
      <div class="aceite" style="margin-top:10px">
        <input type="checkbox" id="f_chat" ${d.chat?'checked':''}>
        <label for="f_chat" style="font-weight:500;color:var(--suave)">Autorizo o estudante a participar da conversa do clube com os colegas de turma e o professor mentor. A conversa é aberta a todos os integrantes, fica registrada e é visível para a coordenação. Não existe mensagem privada entre estudantes.</label>
      </div>
      <p class="sub" style="font-size:13.5px;margin-top:14px">A inscrição não gera cobrança. Sua vaga fica reservada enquanto nossa equipe entra em contato pelo WhatsApp.</p>`;
  }

  return `<section class="secao" style="border-top:none;padding-top:46px"><div class="molde"><div class="form-wrap">
    <div class="olho">Passo 2 de 2 · Inscrição</div>
    <h2 style="margin:10px 0 6px">${esc(p.nome)}</h2>
    <p class="sub">Turma ${nn(t.numero)} · ${esc(t.slots?.rotulo||'')} · ${online?'ao vivo pela internet':esc(p.cidade||'')} · R$ ${Number(p.valor_mensal).toFixed(0)},00 por mês</p>
    <div class="passos">
      <div class="passo ${rascunho.etapa>=1?'on':''}"></div>
      <div class="passo ${rascunho.etapa>=2?'on':''}"></div>
      <div class="passo ${rascunho.etapa>=3?'on':''}"></div>
    </div>
    <div id="formCorpo">${corpo}</div>
    <div class="acoes">
      <button class="btn vazio" id="btnVoltar">${rascunho.etapa===1?'Trocar de turma':'Voltar'}</button>
      <button class="btn amarelo" id="btnAvancar">${rascunho.etapa===3?'Enviar inscrição':'Continuar'}</button>
    </div>
  </div></div></section>`;
}

function coletar(){
  const d = rascunho.dados, online = rascunho.turma.polos.modalidade==='online', e=[];
  if(rascunho.etapa===1){
    d.aluno=$('#f_aluno').value.trim(); d.nasc=$('#f_nasc').value;
    d.serie=$('#f_serie').value; d.escola=$('#f_escola').value.trim();
    if(online){ d.cidade=$('#f_cidade').value.trim(); d.uf=$('#f_uf').value.trim().toUpperCase(); }
    if(d.aluno.split(' ').filter(Boolean).length<2) e.push(['f_aluno','Informe nome e sobrenome']);
    if(!d.nasc) e.push(['f_nasc','Informe a data de nascimento']);
    if(!d.serie) e.push(['f_serie','Selecione a série']);
    if(online && !d.cidade) e.push(['f_cidade','Informe a cidade']);
    if(online && d.uf.length!==2) e.push(['f_uf','Use a sigla, ex: MT']);
  }
  if(rascunho.etapa===2){
    d.resp=$('#f_resp').value.trim(); d.cpf=$('#f_cpf').value.trim();
    d.zap=$('#f_zap').value.trim(); d.email=$('#f_mail').value.trim(); d.como=$('#f_como').value;
    if(d.resp.split(' ').filter(Boolean).length<2) e.push(['f_resp','Informe nome e sobrenome']);
    if(soDigitos(d.cpf).length!==11) e.push(['f_cpf','CPF incompleto']);
    if(soDigitos(d.zap).length<10) e.push(['f_zap','WhatsApp incompleto']);
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) e.push(['f_mail','E-mail inválido']);
  }
  if(rascunho.etapa===3){
    d.lgpd=$('#f_lgpd').checked; d.chat=$('#f_chat').checked;
    if(!d.lgpd) e.push(['f_lgpd','É preciso autorizar para enviar']);
    if(!d.chat) e.push(['f_chat','É preciso autorizar a conversa do clube']);
  }
  return e;
}

function mostrarErros(erros){
  document.querySelectorAll('.erro').forEach(x=>x.classList.remove('erro'));
  document.querySelectorAll('.erro-msg').forEach(x=>x.remove());
  erros.forEach(([id,msg])=>{
    const el=$('#'+id); if(!el) return;
    el.classList.add('erro');
    const p=document.createElement('div'); p.className='erro-msg'; p.textContent=msg;
    el.parentElement.appendChild(p);
  });
  if(erros.length && $('#'+erros[0][0])) $('#'+erros[0][0]).focus();
}

let recibo = null;

async function enviarInscricao(btn){
  const t=rascunho.turma, d=rascunho.dados;
  btn.disabled=true; btn.textContent='Enviando…';
  const { data, error } = await sb.rpc('fn_criar_inscricao', {
    p_turma:t.id, p_aluno_nome:d.aluno, p_nascimento:d.nasc, p_serie:d.serie,
    p_escola:d.escola||null, p_cidade:d.cidade||t.polos.cidade, p_uf:d.uf||t.polos.uf,
    p_resp_nome:d.resp, p_cpf:d.cpf, p_whatsapp:d.zap, p_email:d.email,
    p_como:d.como||null, p_lgpd:true, p_chat:true
  });
  btn.disabled=false; btn.textContent='Enviar inscrição';
  if(error){ toast(erroSupabase(error), true); cacheTurmas=null; return; }
  const r = Array.isArray(data)?data[0]:data;
  recibo = { ...r, turma:t, email:d.email, zap:d.zap, aluno:d.aluno };
  cacheTurmas=null;
  ir('#/pronto');
}

function vPronto(){
  if(!recibo){ ir('#/'); return carregando(); }
  const t=recibo.turma, p=t.polos;
  return `<section class="secao" style="border-top:none;padding-top:56px"><div class="molde"><div class="form-wrap" style="text-align:center">
    <div style="font-size:46px">⚡</div>
    <h2 style="margin:12px 0 10px">Inscrição enviada</h2>
    <p class="sub" style="margin:0 auto">Guarde este número. Ele identifica a inscrição no nosso atendimento.</p>
    <div class="protocolo"><span style="font-size:12px;letter-spacing:2px;color:var(--suave2);font-weight:800">PROTOCOLO</span><b>${esc(recibo.protocolo)}</b></div>
    <div class="resumo" style="text-align:left">
      <div class="linhaResumo"><span>Estudante</span><span>${esc(recibo.aluno)}</span></div>
      <div class="linhaResumo"><span>${p.modalidade==='online'?'Programa':'Polo'}</span><span>${esc(p.nome)}</span></div>
      <div class="linhaResumo"><span>Turma</span><span>Turma ${nn(recibo.turma_numero)} · ${esc(t.slots?.rotulo||'')}</span></div>
      <div class="linhaResumo"><span>Situação</span><span><span class="statusPill st-nova">Nova inscrição</span></span></div>
    </div>
    ${recibo.fechou?`<div class="faixaClube" style="margin-bottom:20px">
      <div class="olho" style="color:var(--roxo)">Você fechou a turma</div>
      <h3 style="font-size:20px;margin:8px 0 6px">A turma ${nn(recibo.turma_numero)} completou 6 de 6</h3>
      <p class="sub" style="font-size:14.5px">O clube virtual foi aberto. Assim que você entrar na área do aluno, poderá conversar com os colegas e votar no professor mentor.</p>
    </div>`:''}
    <p class="sub" style="margin:0 auto 24px">Nossa equipe entra em contato pelo WhatsApp <b style="color:var(--tinta)">${esc(recibo.zap)}</b> em até 2 dias úteis. Para acompanhar, crie uma senha usando o e-mail <b style="color:var(--tinta)">${esc(recibo.email)}</b>.</p>
    <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
      <button class="btn amarelo" id="btnCriarSenha">Criar minha senha e acompanhar</button>
      <button class="btn vazio" data-ir="#/">Voltar ao início</button>
    </div>
  </div></div></section>`;
}

/* =====================================================================
   ENTRAR — perfil, e-mail e senha
   ===================================================================== */
let modoEntrar = 'entrar';      // 'entrar' | 'criar' | 'recuperar' | 'nova-senha'
let perfilEscolhido = 'responsavel';
let avisoEntrar = '';

const PERFIS_LOGIN = [
  ['responsavel','Aluno e responsável','acompanhar a inscrição, clube e votação'],
  ['mentor','Professor mentor','convites, turmas e alinhamento'],
  ['equipe','Equipe HACK SCHOOL','inscrições, turmas e cadastros']
];

function vEntrar(){
  if(modoEntrar === 'nova-senha') return `<section class="secao" style="border-top:none"><div class="molde">
    <div class="loginBox">
      <div style="text-align:center"><div class="olho">Recuperação</div>
      <h3 style="margin-top:8px;font-size:22px">Defina sua nova senha</h3></div>
      <div class="campo"><label for="n_senha">Nova senha</label>
        <input id="n_senha" type="password" placeholder="mínimo de 8 caracteres" autocomplete="new-password"></div>
      <div class="campo"><label for="n_senha2">Repita a senha</label>
        <input id="n_senha2" type="password" autocomplete="new-password"></div>
      <button class="btn amarelo" id="btnNovaSenha">Salvar e entrar</button>
    </div>
  </div></section>`;

  const titulos = {
    entrar:['Entrar','Escolha seu perfil e use seu e-mail e senha.'],
    criar:['Criar senha','Use o mesmo e-mail que você informou na inscrição ou o e-mail que a equipe cadastrou.'],
    recuperar:['Recuperar senha','Enviamos um link para você definir uma nova senha.']
  };
  const t = titulos[modoEntrar];

  return `<section class="secao" style="border-top:none"><div class="molde">
    <div class="loginBox" style="max-width:460px">
      <div style="text-align:center">
        <div class="olho">Acesso</div>
        <h3 style="margin-top:8px;font-size:22px">${t[0]}</h3>
        <p class="sub" style="font-size:13.5px;margin-top:8px">${t[1]}</p>
      </div>

      ${modoEntrar!=='recuperar' ? `<div class="perfilLista">
        ${PERFIS_LOGIN.map(x=>`<label class="perfilOpc ${perfilEscolhido===x[0]?'on':''}">
          <input type="radio" name="perfil" data-perfil="${x[0]}" ${perfilEscolhido===x[0]?'checked':''}>
          <span><b>${x[1]}</b><small>${x[2]}</small></span></label>`).join('')}
      </div>` : ''}

      <div class="campo"><label for="l_mail">E-mail</label>
        <input id="l_mail" type="email" placeholder="voce@email.com" autocomplete="email"></div>

      ${modoEntrar!=='recuperar' ? `<div class="campo"><label for="l_senha">Senha</label>
        <input id="l_senha" type="password" placeholder="${modoEntrar==='criar'?'crie uma senha de 8 caracteres':'sua senha'}"
          autocomplete="${modoEntrar==='criar'?'new-password':'current-password'}"></div>` : ''}

      ${avisoEntrar ? `<div class="aviso" style="border-left-color:var(--laranja)">${esc(avisoEntrar)}</div>` : ''}

      <button class="btn amarelo" id="btnEntrar">${
        modoEntrar==='entrar' ? 'Entrar'
        : modoEntrar==='criar' ? 'Criar minha senha'
        : 'Enviar link de recuperação'}</button>

      <div class="linksLogin">
        ${modoEntrar!=='entrar' ? '<button data-modo="entrar">Já tenho senha</button>' : ''}
        ${modoEntrar!=='criar' ? '<button data-modo="criar">Primeiro acesso</button>' : ''}
        ${modoEntrar!=='recuperar' ? '<button data-modo="recuperar">Esqueci minha senha</button>' : ''}
      </div>
    </div>
  </div></section>`;
}

function ligarEntrar(){
  document.querySelectorAll('[data-modo]').forEach(b=>b.onclick=()=>{
    modoEntrar=b.dataset.modo; avisoEntrar=''; render();
  });
  document.querySelectorAll('[data-perfil]').forEach(r=>r.onchange=()=>{
    perfilEscolhido=r.dataset.perfil;
    document.querySelectorAll('.perfilOpc').forEach(l=>l.classList.remove('on'));
    r.closest('.perfilOpc').classList.add('on');
  });

  const bn=$('#btnNovaSenha');
  if(bn) bn.onclick=async()=>{
    const a=$('#n_senha').value, b=$('#n_senha2').value;
    if(a.length<8){ toast('A senha precisa ter ao menos 8 caracteres', true); return; }
    if(a!==b){ toast('As senhas não conferem', true); return; }
    bn.disabled=true;
    const { error } = await sb.auth.updateUser({ password:a });
    bn.disabled=false;
    if(error){ toast(erroSupabase(error), true); return; }
    modoEntrar='entrar'; toast('Senha alterada');
    await carregarSessao(); location.hash='#/minha-area'; render();
  };

  const b=$('#btnEntrar'); if(!b) return;
  const acao=async()=>{
    const email=$('#l_mail').value.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('E-mail inválido', true); return; }
    b.disabled=true; avisoEntrar='';

    if(modoEntrar==='recuperar'){
      const { error } = await sb.auth.resetPasswordForEmail(email,
        { redirectTo: location.origin + location.pathname });
      b.disabled=false;
      if(error){ toast(erroSupabase(error), true); return; }
      avisoEntrar='Se existir conta com este e-mail, o link de recuperação chegou. Verifique também o spam.';
      render(); return;
    }

    const senha=$('#l_senha').value;
    if(senha.length<8){ toast('A senha precisa ter ao menos 8 caracteres', true); b.disabled=false; return; }

    if(modoEntrar==='criar'){
      const { data, error } = await sb.auth.signUp({ email, password:senha,
        options:{ emailRedirectTo: location.origin + location.pathname } });
      b.disabled=false;
      if(error){
        if((error.message||'').toLowerCase().includes('already registered')){
          modoEntrar='entrar'; avisoEntrar='Este e-mail já tem senha. Entre normalmente ou use "Esqueci minha senha".'; render(); return;
        }
        toast(erroSupabase(error), true); return;
      }
      if(!data.session){
        avisoEntrar='Enviamos um e-mail para confirmar que este endereço é seu. Confirme e depois entre com sua senha.';
        modoEntrar='entrar'; render(); return;
      }
      sessao.area=perfilEscolhido;
      await carregarSessao(); location.hash='#/minha-area'; render(); return;
    }

    const { error } = await sb.auth.signInWithPassword({ email, password:senha });
    b.disabled=false;
    if(error){
      const m=(error.message||'').toLowerCase();
      if(m.includes('email not confirmed')) avisoEntrar='Falta confirmar o e-mail. Procure a mensagem que enviamos e clique no botão.';
      else if(m.includes('invalid login')) avisoEntrar='E-mail ou senha incorretos. Se é seu primeiro acesso, use "Primeiro acesso".';
      else avisoEntrar=erroSupabase(error);
      render(); return;
    }
    sessao.area=perfilEscolhido;
    await carregarSessao();
    location.hash='#/minha-area'; render();
  };
  b.onclick=acao;
  const inp=$('#l_senha')||$('#l_mail');
  if(inp) inp.onkeydown=e=>{ if(e.key==='Enter') acao(); };
}

/* =====================================================================
   ÁREA DO RESPONSÁVEL
   ===================================================================== */
async function carregarMinhaArea(){
  const { data, error } = await sb.from('inscricoes')
    .select(`id,protocolo,aluno_nome,aluno_serie,responsavel_nome,responsavel_whatsapp,status,criado_em,turma_id,
             turmas!inscricoes_turma_id_fkey(id,numero,fase,capacidade,ocupadas,mentor_id,slots(rotulo),
                    polos(nome,modalidade,cidade,uf,endereco,valor_mensal),
                    mentores!turmas_mentor_id_fkey(nome,area))`)
    .eq('responsavel_user_id', sessao.user.id)
    .order('criado_em',{ascending:false});
  if(error) throw error;
  return data;
}

function vPainel(lista){
  if(!lista.length) return `<section class="secao" style="border-top:none;padding-top:46px"><div class="molde"><div class="form-wrap">
    ${seletorArea()}
    <h2 style="margin-top:${sessao.areas.length>1?'18px':'0'}">Nenhuma inscrição neste e-mail</h2>
    <p class="sub" style="margin:12px 0 22px">Não encontramos inscrição vinculada a <b style="color:var(--tinta)">${esc(sessao.perfil?.email||'')}</b>. Se você usou outro e-mail na inscrição, saia e entre com ele.</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <button class="btn amarelo" data-ir="#/turmas">Ver turmas abertas</button>
      <button class="btn vazio" id="btnSair">Sair</button></div>
  </div></div></section>`;

  return `<section class="secao" style="border-top:none;padding-top:46px"><div class="molde"><div class="form-wrap">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px">
      <div><div class="olho">Área do aluno</div><h2 style="margin-top:8px">${esc(sessao.perfil?.nome||'')}</h2></div>
      <button class="btn vazio peq" id="btnSair">Sair</button>
    </div>
    ${seletorArea()}
    ${lista.map(i=>{
      const t=i.turmas, p=t.polos, st=STATUS[i.status];
      const banner = ['votacao','convite','alinhamento','hub'].includes(t.fase) ? `
        <div class="faixaClube" style="margin:18px 0">
          <div class="olho" style="color:var(--roxo)">Clube virtual · Turma ${nn(t.numero)}</div>
          <h3 style="font-size:20px;margin:8px 0 6px">${
            t.fase==='votacao' ? 'Sua turma fechou em 6 de 6'
            : t.fase==='convite' ? 'A equipe escolheu o mentor'
            : t.fase==='alinhamento' ? 'O mentor entrou no clube'
            : 'Clube virtual encerrado'}</h3>
          <p class="sub" style="font-size:14.5px">${
            t.fase==='votacao' ? 'Agora a equipe escolhe junto o professor mentor.'
            : t.fase==='convite' ? 'Aguardando o mentor confirmar o convite.'
            : t.fase==='alinhamento' ? 'Ele está definindo o nome do clube, as funções e o primeiro encontro.'
            : 'Tudo combinado. A jornada continua no HACK HUB.'}</p>
          <button class="btn ${t.fase==='votacao'?'amarelo':'vazio'} peq" style="margin-top:14px" data-clube="${t.id}">
            ${t.fase==='votacao'?'Entrar no clube e votar':'Abrir o clube virtual'}</button>
        </div>` : '';
      return `
      <div class="resumo" style="margin-top:22px">
        <div class="linhaResumo"><span>Estudante</span><span>${esc(i.aluno_nome)} · ${esc(i.aluno_serie)}</span></div>
        <div class="linhaResumo"><span>Protocolo</span><span>${esc(i.protocolo)}</span></div>
        <div class="linhaResumo"><span>Situação</span><span><span class="statusPill ${st.cls}">${st.rot}</span></span></div>
        <div class="linhaResumo"><span>${p.modalidade==='online'?'Programa':'Polo'}</span><span>${esc(p.nome)}<br><span style="font-weight:400;color:var(--suave2)">${esc(p.endereco||'')}</span></span></div>
        <div class="linhaResumo"><span>Turma</span><span>Turma ${nn(t.numero)} · ${esc(t.slots?.rotulo||'')}</span></div>
        <div class="linhaResumo"><span>Professor mentor</span><span>${t.mentores?esc(t.mentores.nome):'escolhido pela equipe'}</span></div>
        <div class="linhaResumo"><span>Mensalidade</span><span>R$ ${Number(p.valor_mensal).toFixed(0)},00</span></div>
      </div>
      ${banner}
      ${i.status==='matriculada'?`<div class="item"><h3>Pagamento</h3>
        <p>Sua vaga foi confirmada. O pagamento da primeira mensalidade será liberado aqui em breve — estamos finalizando a integração.</p></div>`:''}
      ${i.status==='nova'||i.status==='contatada'?`<div class="item"><h3>Aguardando confirmação</h3>
        <p>Nossa equipe entra em contato pelo WhatsApp ${esc(i.responsavel_whatsapp)} para confirmar a vaga.</p></div>`:''}`;
    }).join('')}
  </div></div></section>`;
}

/* =====================================================================
   CLUBE VIRTUAL
   ===================================================================== */
let clubeId = null;

async function carregarClube(tid){
  const [turma, membros, apur, votaram, cands, nomes, msgs, alin, funcs, meuVoto] = await Promise.all([
    sb.from('turmas').select('id,numero,fase,capacidade,mentor_id,slots(rotulo),polos(nome,modalidade,endereco),mentores!turmas_mentor_id_fkey(id,nome,area,nivel,formacao,bio,destaques)').eq('id',tid).single(),
    sb.from('inscricoes').select('id,aluno_nome,aluno_serie,responsavel_user_id').eq('turma_id',tid).neq('status','cancelada'),
    sb.rpc('fn_apuracao',{p_turma:tid}),
    sb.rpc('fn_quem_votou',{p_turma:tid}),
    sb.rpc('fn_candidatos',{p_turma:tid,p_max:4}),
    sb.from('sugestoes_nome').select('id,nome,inscricao_id,apoios_nome(inscricao_id)').eq('turma_id',tid),
    sb.from('mensagens').select('*').eq('turma_id',tid).order('criado_em'),
    sb.from('alinhamentos').select('*').eq('turma_id',tid).maybeSingle(),
    sb.from('funcoes_equipe_turma').select('inscricao_id,funcao').eq('turma_id',tid),
    sb.from('votos').select('mentor_id').eq('turma_id',tid)
  ]);
  if(turma.error) throw turma.error;
  return {
    t:turma.data, membros:membros.data||[], apur:apur.data||[], votaram:(votaram.data||[]).map(x=>x.inscricao_id),
    cands:cands.data||[], nomes:nomes.data||[], msgs:msgs.data||[],
    alin:alin.data, funcs:funcs.data||[], meuVoto:(meuVoto.data||[])[0]?.mentor_id||null
  };
}

function vClube(c){
  const t=c.t, p=t.polos, f=t.fase;
  const eu = c.membros.find(m=>m.responsavel_user_id===sessao.user.id);
  const linha0 = c.apur[0] || {};
  const total = linha0.total ?? c.membros.length;
  const dados = linha0.votaram ?? c.votaram.length;
  const completa = !!linha0.completa;
  const votando = f==='votacao';
  const contagem = {}; c.apur.forEach(r=>{ if(r.mentor_id) contagem[r.mentor_id]=r.votos; });
  const venc = t.mentores;

  const titulos = {
    votacao:['Escolham o professor mentor',`A turma fechou em ${t.capacidade} de ${t.capacidade}. Vocês decidem juntos quem vai orientar o clube. Os votos aparecem quando todos tiverem votado.`],
    empate:['Empate na votação','A coordenação vai conversar com a equipe para desempatar.'],
    convite:['Convite enviado ao mentor','A equipe escolheu. O mentor tem 48 horas para confirmar e entrar aqui com vocês.'],
    sem_candidato:['Nenhum mentor disponível','Os mentores votados não puderam assumir. A coordenação vai propor novos nomes.'],
    alinhamento:['O mentor entrou no clube',`${venc?esc(venc.nome):'O mentor'} está definindo com vocês o básico: nome do clube, funções de cada um e o primeiro encontro.`],
    hub:['Clube virtual encerrado','Tudo combinado. A partir daqui a jornada de vocês acontece no HACK HUB.']
  };
  const ttl = titulos[f] || titulos.votacao;

  const nomes = c.nomes.slice().sort((a,b)=>b.apoios_nome.length-a.apoios_nome.length);
  const jaSugeri = eu && nomes.some(n=>n.inscricao_id===eu.id);

  const blocoNome = (f==='votacao'||f==='convite') ? `<div class="painelVoto">
    <h3>Nome do clube</h3>
    <p class="sub" style="font-size:13.5px;margin-top:4px">Sugiram um nome. O mais apoiado é o que o mentor confirma no primeiro encontro.</p>
    <div class="nomesLista">
      ${nomes.length?nomes.map(n=>{
        const apoiei = eu && n.apoios_nome.some(a=>a.inscricao_id===eu.id);
        return `<div class="nomeItem ${apoiei?'apoiado':''}"><b>${esc(n.nome)}</b>
          <button class="btn ${apoiei?'amarelo':'vazio'} peq" data-apoio="${n.id}">${apoiei?'✓':'+'} ${n.apoios_nome.length}</button></div>`;
      }).join(''):'<div class="vazio-msg" style="padding:20px;font-size:13px">Nenhuma sugestão ainda. Comecem vocês.</div>'}
    </div>
    ${jaSugeri?'<p class="notaMod">Você já sugeriu um nome. Dá para apoiar os dos colegas.</p>':`<div class="chatEnvio" style="border:none;padding:12px 0 0">
      <input id="nomeTxt" placeholder="Sua sugestão de nome…" maxlength="28" autocomplete="off">
      <button class="btn vazio peq" id="nomeEnviar">Sugerir</button></div>`}
  </div>` : '';

  const al = c.alin;
  const feito = x => x ? '<i class="ok">✓</i>' : '<i class="pend">•</i>';
  const blocoAl = (al && (f==='alinhamento'||f==='hub')) ? `<div class="painelVoto">
    <h3 style="margin-bottom:12px">${f==='hub'?'Combinados do clube':'O mentor está definindo'}</h3>
    <div class="checklist">
      <div>${feito(al.nome_clube)}<span>Nome do clube</span><b>${al.nome_clube?esc(al.nome_clube):'aguardando'}</b></div>
      <div>${feito(al.primeiro_encontro)}<span>Primeiro encontro</span><b>${al.primeiro_encontro?esc(al.primeiro_encontro):'aguardando'}</b></div>
      <div>${feito(c.funcs.length===c.membros.length)}<span>Funções da equipe</span><b>${c.funcs.length} de ${c.membros.length}</b></div>
      ${p.modalidade==='online'?`<div>${feito(al.link_sala)}<span>Sala de vídeo</span><b>${al.link_sala?'definida':'aguardando'}</b></div>`:''}
    </div>
    ${c.funcs.length?`<div class="funcoesLista">${c.funcs.map(x=>{
      const m=c.membros.find(y=>y.id===x.inscricao_id);
      return `<span class="funcChip"><b>${esc(x.funcao)}</b> ${esc((m?.aluno_nome||'').split(' ')[0])}${m&&eu&&m.id===eu.id?' (você)':''}</span>`;
    }).join('')}</div>`:''}
    ${f==='hub'&&al.link_sala?`<p class="notaMod">Sala do encontro: <a href="${esc(al.link_sala)}" target="_blank" rel="noopener" style="color:var(--amarelo)">${esc(al.link_sala)}</a></p>`:''}
    ${f==='hub'?`<ul class="combinados">${(al.combinados||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  </div>` : '';

  const blocoHub = f==='hub' ? `<div class="faixaHub">
    <div class="olho" style="color:var(--verde)">Próxima etapa</div>
    <h3 style="font-size:21px;margin:8px 0 8px">${esc(al?.nome_clube||'Seu clube')} está no HACK HUB</h3>
    <p class="sub" style="font-size:14.5px">Perfil da equipe, desafios da Jornada Discovery, Pontos de Impacto e ranking. O clube virtual cumpriu o papel dele.</p>
    <button class="btn amarelo" style="margin-top:16px" id="btnHub">Abrir o HACK HUB</button>
  </div>` : '';

  const listaCands = (f==='alinhamento'||f==='hub' ? c.cands.filter(m=>m.mentor_id===t.mentor_id) : c.cands).map(m=>{
    const votos = contagem[m.mentor_id]||0;
    const pct = total?Math.round(votos/total*100):0;
    const ganhou = t.mentor_id===m.mentor_id;
    const meu = c.meuVoto===m.mentor_id;
    return `<article class="cand ${meu&&votando?'escolhido':''} ${ganhou?'vencedor':''}">
      <div class="candTopo"><span class="candAv">${iniciais(m.nome)}</span>
        <div><h3>${esc(m.nome)}</h3><div class="candArea">${esc(m.area||'')}</div>
        <div class="candNivel">${esc(m.nivel||'')}</div></div></div>
      <p>${esc(m.bio||'')}</p>
      <div class="candDest">${(m.destaques||[]).map(d=>`<span>${esc(d)}</span>`).join('')}</div>
      <div class="candForm">Formação: ${esc(m.formacao||'—')} · disponível ${esc(t.slots?.rotulo||'')}</div>
      <div class="candAcao">
        ${votando && !completa
          ? `<button class="btn ${meu?'amarelo':'vazio'} peq" data-voto="${m.mentor_id}">${meu?'✓ Meu voto':'Votar neste mentor'}</button>`
          : `<div class="barraVoto"><i style="width:${pct}%"></i></div><span class="votosNum">${completa?votos+' voto'+(votos!==1?'s':''):'—'}</span>`}
      </div>
    </article>`;
  }).join('');

  const chat = `<div class="chat">
    <div class="chatTopo">Conversa da turma ${nn(t.numero)}</div>
    <div class="chatCorpo" id="chatCorpo">
      ${c.msgs.map(m=>{
        if(m.do_sistema) return `<div class="msg sis"><p>${esc(m.texto)}</p></div>`;
        if(m.autor_mentor) return `<div class="msg mentor"><b>${esc(venc?.nome||'Mentor')} · mentor<time>${new Date(m.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></b><p>${esc(m.texto)}</p></div>`;
        const a = c.membros.find(x=>x.id===m.autor_inscricao);
        const meu = eu && m.autor_inscricao===eu.id;
        return `<div class="msg ${meu?'eu':''}"><b>${meu?'Você':esc((a?.aluno_nome||'Colega').split(' ')[0])}<time>${new Date(m.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></b><p>${esc(m.texto)}</p></div>`;
      }).join('')}
    </div>
    ${f==='hub'||!eu
      ? `<div class="chatEnvio" style="justify-content:center;color:var(--suave2);font-size:12.5px;padding:14px">${f==='hub'?'Conversa encerrada — continua no HACK HUB':'Somente integrantes escrevem aqui'}</div>`
      : `<div class="chatEnvio"><input id="chatTxt" placeholder="Escreva para a sua turma…" maxlength="800" autocomplete="off">
         <button class="btn amarelo peq" id="chatEnviar">Enviar</button></div>`}
  </div>
  <p class="notaMod">A conversa é aberta a todos os integrantes do clube e fica visível para a coordenação e o professor mentor. Não há mensagem privada entre estudantes.</p>`;

  return `<section class="secao" style="border-top:none;padding-top:38px"><div class="molde">
    <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center">
      <div class="olho">${esc(p.nome)} · ${esc(t.slots?.rotulo||'')}</div>
      <div style="display:flex;gap:8px">
        <button class="btn vazio peq" id="btnAtualizar">Atualizar</button>
        <button class="btn vazio peq" data-ir="#/minha-area">Voltar</button></div>
    </div>
    <div class="faixaClube">
      <div class="olho" style="color:var(--roxo)">Clube virtual · Turma ${nn(t.numero)}${al?.nome_clube?' · '+esc(al.nome_clube):''}</div>
      <h2>${ttl[0]}</h2>
      <p class="sub" style="font-size:15px">${ttl[1]}</p>
      <div class="membros">
        ${c.membros.map(m=>{
          const votou = c.votaram.includes(m.id);
          const souEu = eu && m.id===eu.id;
          return `<span class="membro ${votou?'votou':''} ${souEu?'eu':''}">
            <i>${votou?'✓':iniciais(m.aluno_nome)}</i>${esc((m.aluno_nome||'').split(' ')[0])}${souEu?' (você)':''}</span>`;
        }).join('')}
      </div>
    </div>
    ${venc&&f!=='hub'?`<div class="resultado">
      <div style="font-size:34px">🎉</div>
      <h3 style="margin:8px 0 6px">A equipe decidiu</h3>
      <p style="font-size:15px;color:var(--suave)"><b>${esc(venc.nome)}</b> é o mentor da Turma ${nn(t.numero)}.</p></div>`:''}
    ${blocoHub}
    <div class="clubeGrid">
      <div>
        ${blocoAl}
        ${votando?`<div class="painelVoto"><h3>${c.meuVoto?'Seu voto está registrado':'Seu voto'}</h3>
          <div class="progressoVoto">${dados} de ${total} votaram · ${completa?'resultado revelado':'os votos só aparecem quando todos votarem'}</div></div>`:''}
        ${blocoNome}
        ${listaCands}
      </div>
      <div>${chat}</div>
    </div>
  </div></section>`;
}

/* =====================================================================
   ÁREA DO MENTOR
   ===================================================================== */
let mentorAba = 'turmas';

async function carregarMentor(){
  const m = sessao.mentor;
  const [convites, turmas, slots, meusSlots] = await Promise.all([
    sb.from('convites').select('id,ordem,votos_obtidos,expira_em,turmas(id,numero,capacidade,slots(rotulo),polos(nome,modalidade,cidade,uf))')
      .eq('mentor_id',m.id).eq('status','pendente'),
    sb.from('turmas').select('id,numero,fase,slots(rotulo),polos(nome,modalidade)').eq('mentor_id',m.id).in('fase',['alinhamento','hub']),
    sb.from('slots').select('id,rotulo').order('rotulo'),
    sb.from('mentor_slots').select('slot_id').eq('mentor_id',m.id)
  ]);
  const tids = (turmas.data||[]).filter(t=>t.fase==='alinhamento').map(t=>t.id);
  let alins=[], membros=[], funcs=[], sugs=[];
  if(tids.length){
    const r = await Promise.all([
      sb.from('alinhamentos').select('*').in('turma_id',tids),
      sb.from('inscricoes').select('id,aluno_nome,turma_id').in('turma_id',tids),
      sb.from('funcoes_equipe_turma').select('turma_id,inscricao_id,funcao').in('turma_id',tids),
      sb.from('sugestoes_nome').select('turma_id,nome,apoios_nome(inscricao_id)').in('turma_id',tids)
    ]);
    alins=r[0].data||[]; membros=r[1].data||[]; funcs=r[2].data||[]; sugs=r[3].data||[];
  }
  return { convites:convites.data||[], turmas:turmas.data||[], slots:slots.data||[],
           meusSlots:(meusSlots.data||[]).map(x=>x.slot_id), alins, membros, funcs, sugs };
}

function vMentor(d){
  const m = sessao.mentor;
  const pend = d.convites.length + d.turmas.filter(t=>t.fase==='alinhamento').length;

  const corpoTurmas = (!d.convites.length && !d.turmas.length)
    ? '<div class="vazio-msg">Nenhum convite ou alinhamento pendente para você agora.</div>'
    : d.convites.map(c=>{
        const t=c.turmas, p=t.polos;
        return `<div class="faixaClube" style="margin-bottom:18px">
          <div class="olho" style="color:var(--roxo)">Convite · Turma ${nn(t.numero)}</div>
          <h3 style="font-size:21px;margin:8px 0 8px">Você foi escolhido por uma equipe</h3>
          <p class="sub" style="font-size:14.5px">Os ${t.capacidade} estudantes da Turma ${nn(t.numero)} do ${esc(p.nome)} votaram e você recebeu ${c.votos_obtidos} voto${c.votos_obtidos!==1?'s':''}. Encontros ${esc(t.slots?.rotulo||'')}${p.modalidade==='online'?', ao vivo pela internet':''}.</p>
          <p class="notaMod">Responda até ${new Date(c.expira_em).toLocaleString('pt-BR')}. Se recusar, o convite passa ao segundo mais votado.</p>
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
            <button class="btn amarelo" data-aceitar="${c.id}">Aceitar e entrar no clube</button>
            <button class="btn vazio" data-recusar="${c.id}">Não posso assumir</button></div>
        </div>`;
      }).join('') + d.turmas.map(t=>{
        if(t.fase==='hub') return `<div class="item" style="margin-bottom:14px;border-color:var(--verde)">
          <h3 style="color:var(--verde)">Turma ${nn(t.numero)} · ${esc(t.polos.nome)}</h3>
          <p>${esc(t.slots?.rotulo||'')} · equipe ativa no HACK HUB.</p></div>`;
        const al = d.alins.find(a=>a.turma_id===t.id) || {};
        const mem = d.membros.filter(x=>x.turma_id===t.id);
        const fn = d.funcs.filter(x=>x.turma_id===t.id);
        const sg = d.sugs.filter(x=>x.turma_id===t.id).sort((a,b)=>b.apoios_nome.length-a.apoios_nome.length);
        const online = t.polos.modalidade==='online';
        const pronto = al.nome_clube && al.primeiro_encontro && fn.length===mem.length && (!online||al.link_sala);
        return `<div class="painelVoto" style="margin-bottom:18px">
          <div class="olho">Alinhamento · Turma ${nn(t.numero)} · ${esc(t.polos.nome)}</div>
          <h3 style="margin:8px 0 4px;font-size:20px">Combine o básico e encerre o clube virtual</h3>
          <p class="sub" style="font-size:14px">Definido isto, a equipe segue para o HACK HUB e o clube virtual fecha.</p>
          <div class="campos" style="margin-top:18px">
            <div class="campo full"><label>Nome do clube</label>
              <input value="${esc(al.nome_clube||'')}" data-al="${t.id}|nome_clube" placeholder="confirme uma sugestão da equipe">
              ${sg.length?`<div class="sugLinha">Sugestões da equipe:
                ${sg.map(s=>`<button class="sugChip ${al.nome_clube===s.nome?'on':''}" data-sug="${t.id}|${esc(s.nome)}">${esc(s.nome)} · ${s.apoios_nome.length}</button>`).join('')}</div>`
              :'<div class="sugLinha">A equipe ainda não sugeriu nomes.</div>'}</div>
            <div class="campo full"><label>Primeiro encontro</label>
              <input value="${esc(al.primeiro_encontro||'')}" data-al="${t.id}|primeiro_encontro" placeholder="ex: sábado 09/08, 09h, sala 4"></div>
            ${online?`<div class="campo full"><label>Link da sala de vídeo</label>
              <input value="${esc(al.link_sala||'')}" data-al="${t.id}|link_sala" placeholder="cole o link do encontro ao vivo"></div>`:''}
          </div>
          <h3 style="margin:22px 0 10px;font-size:16px">Funções da equipe</h3>
          <div class="funcGrid">
            ${mem.map(x=>{
              const atual = fn.find(y=>y.inscricao_id===x.id)?.funcao || '';
              return `<div class="funcLinha">
                <span class="membro"><i>${iniciais(x.aluno_nome)}</i>${esc((x.aluno_nome||'').split(' ')[0])}</span>
                <select data-func="${t.id}|${x.id}"><option value="">Definir…</option>
                  ${FUNCOES.map(f=>`<option value="${f[0]}" ${atual===f[0]?'selected':''}>${f[0]} — ${f[1]}</option>`).join('')}
                </select></div>`;
            }).join('')}
          </div>
          <h3 style="margin:22px 0 10px;font-size:16px">Combinados do clube</h3>
          <ul class="combinados">${(al.combinados||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
          <button class="btn amarelo" style="margin-top:18px;width:100%" ${pronto?'':'disabled'} data-encerrar="${t.id}">
            ${pronto?'Encerrar clube virtual e abrir no HACK HUB':'Preencha nome, encontro e as funções'}</button>
        </div>`;
      }).join('');

  const corpoPerfil = `<div class="painelVoto">
    <h3 style="font-size:20px">Seu cadastro</h3>
    <p class="sub" style="font-size:14px">É isto que as equipes leem antes de votar. Escreva pensando em um estudante de 13 anos decidindo com quem quer trabalhar.</p>
    <div class="campos" style="margin-top:18px">
      <div class="campo full"><label>Nome</label><input value="${esc(m.nome||'')}" data-pf="nome"></div>
      <div class="campo"><label>Área principal</label><input value="${esc(m.area||'')}" data-pf="area" placeholder="ex: Desenvolvimento e IA"></div>
      <div class="campo"><label>Nível de certificação</label><input value="${esc(m.nivel||'')}" data-pf="nivel"></div>
      <div class="campo full"><label>Formação</label><input value="${esc(m.formacao||'')}" data-pf="formacao"></div>
      <div class="campo full"><label>Como você trabalha</label>
        <textarea rows="3" data-pf="bio" placeholder="Duas ou três frases sobre o seu jeito de orientar">${esc(m.bio||'')}</textarea></div>
      <div class="campo full"><label>Destaques (um por linha, até 3)</label>
        <textarea rows="3" data-pf="destaques">${esc((m.destaques||[]).join('\n'))}</textarea></div>
      <div class="campo"><label>Limite de turmas simultâneas</label>
        <select data-pf="limite_turmas">${[2,3,4,5,6,8].map(n=>`<option value="${n}" ${m.limite_turmas===n?'selected':''}>${n} turmas</option>`).join('')}</select></div>
    </div>
    <button class="btn amarelo" style="margin-top:18px" id="btnSalvarPerfil">Salvar cadastro</button>

    <h3 style="margin:26px 0 6px;font-size:16px">Horários que você pode assumir</h3>
    <p class="sub" style="font-size:13.5px">Você só entra na lista de candidatos de turmas nesses horários. Manter isto atualizado evita ser eleito para um encontro que você não pode dar.</p>
    <div class="horGrid">
      ${d.slots.map(s=>`<label class="horChip ${d.meusSlots.includes(s.id)?'on':''}">
        <input type="checkbox" data-hor="${s.id}" ${d.meusSlots.includes(s.id)?'checked':''}>${esc(s.rotulo)}</label>`).join('')}
    </div>
  </div>

  <div class="painelVoto">
    <div class="olho">Prévia · como a equipe vê você</div>
    <div class="cand" style="margin:14px 0 0">
      <div class="candTopo"><span class="candAv">${iniciais(m.nome)}</span>
        <div><h3>${esc(m.nome||'')}</h3><div class="candArea">${esc(m.area||'')}</div>
        <div class="candNivel">${esc(m.nivel||'')}</div></div></div>
      <p>${esc(m.bio||'')}</p>
      <div class="candDest">${(m.destaques||[]).filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('')}</div>
      <div class="candForm">Formação: ${esc(m.formacao||'—')} · ${d.meusSlots.length} horário${d.meusSlots.length!==1?'s':''} disponível${d.meusSlots.length!==1?'eis':''}</div>
      <div class="candAcao"><button class="btn vazio peq" disabled>Votar neste mentor</button></div>
    </div>
  </div>`;

  return `<section class="secao" style="border-top:none;padding-top:40px"><div class="molde"><div class="form-wrap">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:22px">
      <div><div class="olho">Professor mentor</div><h2 style="margin-top:8px">${esc(m.nome||'')}</h2>
      <p class="sub" style="font-size:14px">${esc(m.area||'')} · limite de ${m.limite_turmas} turmas</p></div>
      <button class="btn vazio peq" id="btnSair">Sair</button>
    </div>
    ${seletorArea()}
    <div class="abas">
      <button class="aba ${mentorAba!=='perfil'?'on':''}" data-mab="turmas">Convites e turmas${pend?' · '+pend:''}</button>
      <button class="aba ${mentorAba==='perfil'?'on':''}" data-mab="perfil">Meu cadastro</button>
    </div>
    ${mentorAba==='perfil'?corpoPerfil:corpoTurmas}
  </div></div></section>`;
}

/* =====================================================================
   ADMIN
   ===================================================================== */
let adminAba='inscricoes', fPolo='todos', fStatus='todos', fBusca='';

async function carregarAdmin(){
  const [insc, turmas, polos, slots, mentores, ms] = await Promise.all([
    sb.from('inscricoes').select(`id,protocolo,aluno_nome,aluno_serie,responsavel_nome,responsavel_whatsapp,responsavel_email,status,criado_em,polo_id,
        turmas!inscricoes_turma_id_fkey(numero,slots(rotulo)),polos!inscricoes_polo_id_fkey(nome,modalidade)`).order('criado_em',{ascending:false}).limit(500),
    sb.from('turmas').select('id,numero,fase,capacidade,ocupadas,polo_id,polos(nome,modalidade,cidade,uf),slots(rotulo),mentores!turmas_mentor_id_fkey(nome)').order('numero'),
    sb.from('polos').select('id,nome,modalidade,cidade,uf,valor_mensal,ativo').order('nome'),
    sb.from('slots').select('id,rotulo,hora_inicio').order('hora_inicio'),
    sb.from('mentores').select('id,nome,area,limite_turmas,ativo,perfil_id').order('nome'),
    sb.from('mentor_slots').select('mentor_id,slot_id')
  ]);
  return { insc:insc.data||[], turmas:turmas.data||[], polos:polos.data||[],
           slots:slots.data||[], mentores:mentores.data||[], ms:ms.data||[] };
}

function vAdmin(d){
  const todas=d.insc;
  const kpis=[
    ['Inscrições totais',todas.length,'var(--tinta)'],
    ['A contatar',todas.filter(i=>i.status==='nova').length,'var(--azul)'],
    ['Aguardando pagamento',todas.filter(i=>i.status==='matriculada').length,'var(--amarelo)'],
    ['Alunos ativos',todas.filter(i=>i.status==='ativa').length,'var(--verde)']
  ];
  const q=fBusca.trim().toLowerCase();
  const lista=todas.filter(i=>
    (fPolo==='todos'||i.polo_id===fPolo) &&
    (fStatus==='todos'||i.status===fStatus) &&
    (!q || (i.aluno_nome+i.responsavel_nome+i.protocolo).toLowerCase().includes(q)));

  const corpo = adminAba==='cadastros' ? vCadastros(d) : adminAba==='inscricoes' ? `
    <div class="adminFiltros">
      <input id="adBusca" placeholder="Buscar aluno, responsável ou protocolo…" value="${esc(fBusca)}">
      <select id="adPolo"><option value="todos">Todos os polos</option>
        ${d.polos.map(p=>`<option value="${p.id}" ${fPolo===p.id?'selected':''}>${esc(p.nome)}</option>`).join('')}</select>
      <select id="adStatus"><option value="todos">Todas as situações</option>
        ${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${fStatus===k?'selected':''}>${v.rot}</option>`).join('')}</select>
    </div>
    <div class="tabelaWrap"><table>
      <thead><tr><th>Protocolo</th><th>Estudante</th><th>Responsável</th><th>WhatsApp</th>
      <th>Polo / turma</th><th>Inscrito em</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.length?lista.map(i=>`<tr>
        <td class="mono">${esc(i.protocolo)}</td>
        <td><b>${esc(i.aluno_nome)}</b><br><span style="color:var(--suave2);font-size:12.5px">${esc(i.aluno_serie)}</span></td>
        <td>${esc(i.responsavel_nome)}<br><span style="color:var(--suave2);font-size:12.5px">${esc(i.responsavel_email)}</span></td>
        <td class="zap">${esc(i.responsavel_whatsapp)}</td>
        <td>${esc(i.polos?.nome||'')} ${i.polos?.modalidade==='online'?'<span class="tagAo" style="font-size:9px">ONLINE</span>':''}
          <br><span style="color:var(--suave2);font-size:12.5px">Turma ${nn(i.turmas?.numero||0)} · ${esc(i.turmas?.slots?.rotulo||'')}</span></td>
        <td>${dataBR(i.criado_em)}</td>
        <td><select class="statusSel" data-status="${i.id}">
          ${Object.entries(STATUS).map(([k,v])=>`<option value="${k}" ${i.status===k?'selected':''}>${v.rot}</option>`).join('')}</select></td>
        <td><a class="btn vazio peq" target="_blank" rel="noopener"
          href="https://wa.me/55${soDigitos(i.responsavel_whatsapp)}?text=${encodeURIComponent('Olá, '+(i.responsavel_nome||'').split(' ')[0]+'! Aqui é do HACK SCHOOL. Recebemos a inscrição de '+(i.aluno_nome||'').split(' ')[0]+' ('+i.protocolo+'). Podemos falar?')}">WhatsApp</a></td>
      </tr>`).join(''):'<tr><td colspan="8"><div class="vazio-msg" style="border:none">Nenhuma inscrição com esses filtros.</div></td></tr>'}
      </tbody></table></div>`
  : `<div class="tabelaWrap"><table>
      <thead><tr><th>Polo</th><th>Turma</th><th>Horário</th><th>Mentor</th><th>Ocupação</th><th>Fase</th></tr></thead>
      <tbody>${d.turmas.map(t=>`<tr>
        <td><b>${esc(t.polos?.nome||'')}</b><br><span style="color:var(--suave2);font-size:12.5px">${t.polos?.modalidade==='online'?'todo o Brasil':esc(t.polos?.cidade||'')+'/'+esc(t.polos?.uf||'')}</span></td>
        <td class="mono">TURMA ${nn(t.numero)}</td>
        <td>${esc(t.slots?.rotulo||'')}</td>
        <td>${t.mentores?esc(t.mentores.nome):'<span style="color:var(--suave2)">a definir pela equipe</span>'}</td>
        <td><div class="assentosMini">${Array.from({length:t.capacidade},(_,k)=>`<i class="${k<t.ocupadas?'on':''}"></i>`).join('')}</div>
          <span style="font-size:12px;color:var(--suave2);font-weight:700">${t.ocupadas}/${t.capacidade}</span></td>
        <td><span class="statusPill ${FASES[t.fase].cls}">${FASES[t.fase].rot}</span></td>
      </tr>`).join('')}</tbody></table></div>`;

  return `<section class="secao" style="border-top:none;padding-top:38px"><div class="molde">
    <div class="adminTopo">
      <div><div class="olho">Painel da equipe</div><h2 style="margin-top:8px">Contraturno HACK SCHOOL</h2></div>
      <div style="display:flex;gap:10px">
        ${adminAba==='inscricoes'?'<button class="btn vazio peq" id="btnCSV">Exportar CSV</button>':''}
        <button class="btn vazio peq" id="btnSair">Sair</button></div>
    </div>
    ${seletorArea()}
    <div class="kpis">${kpis.map(k=>`<div class="kpi"><b style="color:${k[2]}">${k[1]}</b><span>${k[0]}</span></div>`).join('')}</div>
    <div class="abas">
      <button class="aba ${adminAba==='inscricoes'?'on':''}" data-adab="inscricoes">Inscrições</button>
      <button class="aba ${adminAba==='turmas'?'on':''}" data-adab="turmas">Turmas</button>
      <button class="aba ${adminAba==='cadastros'?'on':''}" data-adab="cadastros">Cadastros</button>
    </div>
    ${corpo}
  </div></section>`;
}


/* =====================================================================
   ADMIN · CADASTROS
   ===================================================================== */
let cadForm = null;        // 'polo' | 'mentor' | 'slot' | null
let cadSlots = [];         // horários marcados no formulário aberto
let cadMentorEdit = null;  // mentor cujos horários estão sendo editados

const DIAS_OPCOES = ['Seg e Qua','Ter e Qui','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

function chipsHorarios(slots, marcados, attr){
  if(!slots.length) return '<div class="aviso">Nenhum horário cadastrado ainda. Crie um horário primeiro.</div>';
  return `<div class="horGrid">${slots.map(s=>`
    <label class="horChip ${marcados.includes(s.id)?'on':''}">
      <input type="checkbox" ${attr}="${s.id}" ${marcados.includes(s.id)?'checked':''}>${esc(s.rotulo)}</label>`).join('')}</div>`;
}

function vCadastros(d){
  const turmasPorPolo = {};
  d.turmas.forEach(t=>{ turmasPorPolo[t.polo_id] = (turmasPorPolo[t.polo_id]||0)+1; });
  const slotsPorMentor = {};
  d.ms.forEach(x=>{ (slotsPorMentor[x.mentor_id] = slotsPorMentor[x.mentor_id]||[]).push(x.slot_id); });

  const formPolo = cadForm!=='polo' ? '' : `<div class="painelVoto" style="margin-bottom:18px">
    <h3 style="font-size:18px">Nova escola</h3>
    <p class="sub" style="font-size:13.5px;margin-top:4px">A escola entra no ar assim que você salvar, já com a Turma 01 aberta.</p>
    <div class="campos" style="margin-top:16px">
      <div class="campo full"><label for="cp_nome">Nome da escola</label><input id="cp_nome" placeholder="Colégio…"></div>
      <div class="campo"><label for="cp_mod">Modalidade</label>
        <select id="cp_mod"><option value="presencial">Presencial</option><option value="online">Online</option></select></div>
      <div class="campo"><label for="cp_valor">Mensalidade (R$)</label><input id="cp_valor" type="number" value="200" inputmode="numeric"></div>
      <div class="campo"><label for="cp_cidade">Cidade</label><input id="cp_cidade"></div>
      <div class="campo"><label for="cp_uf">Estado</label><input id="cp_uf" placeholder="MT" maxlength="2"></div>
      <div class="campo full"><label for="cp_end">Endereço</label><input id="cp_end" placeholder="Rua, número — bairro"></div>
    </div>
    <h3 style="margin:20px 0 6px;font-size:16px">Horários desta escola</h3>
    <p class="sub" style="font-size:13px">Marque na ordem em que quer preencher. A Turma 01 usa o primeiro marcado; quando fechar, a 02 abre no seguinte.</p>
    ${chipsHorarios(d.slots, cadSlots, 'data-cadslot')}
    <div class="acoes"><button class="btn vazio" data-cadcancel="1">Cancelar</button>
    <button class="btn amarelo" id="btnSalvarPolo">Criar escola</button></div>
  </div>`;

  const formMentor = cadForm!=='mentor' ? '' : `<div class="painelVoto" style="margin-bottom:18px">
    <h3 style="font-size:18px">Novo professor mentor</h3>
    <p class="sub" style="font-size:13.5px;margin-top:4px">É este texto que as equipes leem antes de votar.</p>
    <div class="campos" style="margin-top:16px">
      <div class="campo full"><label for="cm_nome">Nome completo</label><input id="cm_nome"></div>
      <div class="campo"><label for="cm_area">Área principal</label><input id="cm_area" placeholder="ex: Desenvolvimento e IA"></div>
      <div class="campo"><label for="cm_nivel">Nível</label><input id="cm_nivel" placeholder="Mentor certificado · nível 1"></div>
      <div class="campo full"><label for="cm_form">Formação</label><input id="cm_form"></div>
      <div class="campo full"><label for="cm_bio">Como trabalha</label>
        <textarea id="cm_bio" rows="3" placeholder="Duas ou três frases sobre o jeito de orientar"></textarea></div>
      <div class="campo full"><label for="cm_dest">Destaques (um por linha, até 3)</label><textarea id="cm_dest" rows="3"></textarea></div>
      <div class="campo"><label for="cm_lim">Limite de turmas</label>
        <select id="cm_lim">${[2,3,4,5,6,8].map(n=>`<option value="${n}" ${n===4?'selected':''}>${n} turmas</option>`).join('')}</select></div>
    </div>
    <h3 style="margin:20px 0 6px;font-size:16px">Horários que pode assumir</h3>
    ${chipsHorarios(d.slots, cadSlots, 'data-cadslot')}
    <div class="acoes"><button class="btn vazio" data-cadcancel="1">Cancelar</button>
    <button class="btn amarelo" id="btnSalvarMentor">Criar mentor</button></div>
  </div>`;

  const formSlot = cadForm!=='slot' ? '' : `<div class="painelVoto" style="margin-bottom:18px">
    <h3 style="font-size:18px">Novo horário</h3>
    <p class="sub" style="font-size:13.5px;margin-top:4px">O nome é montado sozinho, no padrão do sistema.</p>
    <div class="campos" style="margin-top:16px">
      <div class="campo full"><label for="cs_dias">Dias</label>
        <select id="cs_dias">${DIAS_OPCOES.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div class="campo"><label for="cs_ini">Começa</label><input id="cs_ini" type="time" value="14:00"></div>
      <div class="campo"><label for="cs_fim">Termina</label><input id="cs_fim" type="time" value="15:00"></div>
    </div>
    <div class="acoes"><button class="btn vazio" data-cadcancel="1">Cancelar</button>
    <button class="btn amarelo" id="btnSalvarSlot">Criar horário</button></div>
  </div>`;

  return `
  ${formPolo}${formMentor}${formSlot}

  <div class="adminTopo" style="margin-bottom:14px">
    <h3 style="font-size:18px">Escolas e polos</h3>
    <button class="btn amarelo peq" data-cadabrir="polo">+ Nova escola</button>
  </div>
  <div class="tabelaWrap"><table style="min-width:700px">
    <thead><tr><th>Nome</th><th>Onde</th><th>Mensalidade</th><th>Turmas</th><th>Situação</th><th></th></tr></thead>
    <tbody>${d.polos.length?d.polos.map(p=>`<tr>
      <td><b>${esc(p.nome)}</b></td>
      <td>${p.modalidade==='online'?'<span class="tagAo">ONLINE</span>':esc(p.cidade||'')+'/'+esc(p.uf||'')}</td>
      <td>R$ ${Number(p.valor_mensal).toFixed(0)},00</td>
      <td>${turmasPorPolo[p.id]||0}</td>
      <td><span class="statusPill ${p.ativo?'st-ativa':'st-cancelada'}">${p.ativo?'No ar':'Fora do ar'}</span></td>
      <td><button class="btn vazio peq" data-polotoggle="${p.id}|${p.ativo?'0':'1'}">${p.ativo?'Tirar do ar':'Colocar no ar'}</button></td>
    </tr>`).join(''):'<tr><td colspan="6"><div class="vazio-msg" style="border:none">Nenhuma escola cadastrada.</div></td></tr>'}
    </tbody></table></div>

  <div class="adminTopo" style="margin:28px 0 14px">
    <h3 style="font-size:18px">Professores mentores</h3>
    <button class="btn amarelo peq" data-cadabrir="mentor">+ Novo mentor</button>
  </div>
  <div class="tabelaWrap"><table style="min-width:800px">
    <thead><tr><th>Nome</th><th>Área</th><th>Horários</th><th>Limite</th><th>Conta</th><th>Situação</th><th></th></tr></thead>
    <tbody>${d.mentores.length?d.mentores.map(m=>{
      const meus=slotsPorMentor[m.id]||[];
      return `<tr>
      <td><b>${esc(m.nome)}</b></td>
      <td>${esc(m.area||'')}</td>
      <td>${meus.length}</td>
      <td>${m.limite_turmas}</td>
      <td>${m.perfil_id?'<span class="statusPill st-ativa">ligada</span>':`<button class="btn vazio peq" data-vincular="${m.id}">Ligar e-mail</button>`}</td>
      <td><span class="statusPill ${m.ativo?'st-ativa':'st-cancelada'}">${m.ativo?'Ativo':'Inativo'}</span></td>
      <td><button class="btn vazio peq" data-mentorhor="${m.id}">Horários</button>
          <button class="btn vazio peq" data-mentortoggle="${m.id}|${m.ativo?'0':'1'}">${m.ativo?'Desativar':'Ativar'}</button></td>
    </tr>${cadMentorEdit===m.id?`<tr><td colspan="7" style="background:var(--bg2)">
      <div style="padding:6px 0"><b style="font-size:13.5px">Horários de ${esc(m.nome)}</b>
      ${chipsHorarios(d.slots, meus, 'data-horm')}
      <div style="margin-top:12px;display:flex;gap:10px">
        <button class="btn amarelo peq" data-salvarhor="${m.id}">Salvar horários</button>
        <button class="btn vazio peq" data-cadcancel="1">Fechar</button></div></div></td></tr>`:''}`;
    }).join(''):'<tr><td colspan="7"><div class="vazio-msg" style="border:none">Nenhum mentor cadastrado.</div></td></tr>'}
    </tbody></table></div>

  <div class="adminTopo" style="margin:28px 0 14px">
    <h3 style="font-size:18px">Horários disponíveis</h3>
    <button class="btn amarelo peq" data-cadabrir="slot">+ Novo horário</button>
  </div>
  <div class="marcas">${d.slots.map(x=>`<span class="marcaChip">${esc(x.rotulo)}</span>`).join('') || '<span class="sub">Nenhum horário cadastrado.</span>'}</div>
  <p class="notaMod" style="margin-top:14px">Um horário só pode ser apagado se nenhuma escola ou mentor estiver usando — por isso não há botão de excluir aqui. Se errou, crie o certo e deixe o outro sem uso.</p>`;
}

function ligarCadastros(d){
  document.querySelectorAll('[data-cadabrir]').forEach(b=>b.onclick=()=>{
    cadForm=b.dataset.cadabrir; cadSlots=[]; cadMentorEdit=null; render();
  });
  document.querySelectorAll('[data-cadcancel]').forEach(b=>b.onclick=()=>{
    cadForm=null; cadSlots=[]; cadMentorEdit=null; render();
  });
  document.querySelectorAll('[data-cadslot]').forEach(cb=>cb.onchange=()=>{
    const id=cb.dataset.cadslot;
    if(cb.checked){ if(!cadSlots.includes(id)) cadSlots.push(id); }
    else cadSlots=cadSlots.filter(x=>x!==id);
    cb.closest('.horChip').classList.toggle('on', cb.checked);
  });

  const bp=$('#btnSalvarPolo');
  if(bp) bp.onclick=async()=>{
    const nome=$('#cp_nome').value.trim(), mod=$('#cp_mod').value;
    if(nome.length<3){ toast('Informe o nome da escola',true); return; }
    if(!cadSlots.length){ toast('Marque pelo menos um horário',true); return; }
    bp.disabled=true;
    const { error } = await sb.rpc('fn_admin_criar_polo',{
      p_nome:nome, p_modalidade:mod,
      p_cidade:$('#cp_cidade').value.trim(), p_uf:$('#cp_uf').value.trim().toUpperCase(),
      p_endereco:$('#cp_end').value.trim(), p_valor:Number($('#cp_valor').value)||200,
      p_slots:cadSlots });
    bp.disabled=false;
    if(error){ toast(erroSupabase(error), true); return; }
    cacheTurmas=null; cadForm=null; cadSlots=[];
    toast(`${nome} está no ar com a Turma 01 aberta`); render();
  };

  const bm=$('#btnSalvarMentor');
  if(bm) bm.onclick=async()=>{
    const nome=$('#cm_nome').value.trim();
    if(nome.split(' ').filter(Boolean).length<2){ toast('Informe nome e sobrenome',true); return; }
    bm.disabled=true;
    const { error } = await sb.rpc('fn_admin_criar_mentor',{
      p_nome:nome, p_area:$('#cm_area').value.trim(), p_nivel:$('#cm_nivel').value.trim(),
      p_formacao:$('#cm_form').value.trim(), p_bio:$('#cm_bio').value.trim(),
      p_destaques:$('#cm_dest').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,3),
      p_limite:Number($('#cm_lim').value), p_slots:cadSlots });
    bm.disabled=false;
    if(error){ toast(erroSupabase(error), true); return; }
    cacheTurmas=null; cadForm=null; cadSlots=[];
    toast(`${nome} cadastrado`); render();
  };

  const bs=$('#btnSalvarSlot');
  if(bs) bs.onclick=async()=>{
    bs.disabled=true;
    const { error } = await sb.rpc('fn_admin_criar_slot',{
      p_dias:$('#cs_dias').value, p_inicio:$('#cs_ini').value, p_fim:$('#cs_fim').value });
    bs.disabled=false;
    if(error){ toast(erroSupabase(error), true); return; }
    cadForm=null; toast('Horário criado'); render();
  };

  document.querySelectorAll('[data-polotoggle]').forEach(b=>b.onclick=async()=>{
    const [id,at]=b.dataset.polotoggle.split('|');
    const { error } = await sb.rpc('fn_admin_ativar_polo',{p_polo:id, p_ativo:at==='1'});
    if(error){ toast(erroSupabase(error), true); return; }
    cacheTurmas=null; render();
  });
  document.querySelectorAll('[data-mentortoggle]').forEach(b=>b.onclick=async()=>{
    const [id,at]=b.dataset.mentortoggle.split('|');
    const { error } = await sb.rpc('fn_admin_ativar_mentor',{p_mentor:id, p_ativo:at==='1'});
    if(error){ toast(erroSupabase(error), true); return; }
    cacheTurmas=null; render();
  });
  document.querySelectorAll('[data-mentorhor]').forEach(b=>b.onclick=()=>{
    cadMentorEdit = cadMentorEdit===b.dataset.mentorhor ? null : b.dataset.mentorhor;
    cadForm=null; render();
  });
  document.querySelectorAll('[data-horm]').forEach(cb=>cb.onchange=()=>{
    cb.closest('.horChip').classList.toggle('on', cb.checked);
  });
  document.querySelectorAll('[data-salvarhor]').forEach(b=>b.onclick=async()=>{
    const ids=[...document.querySelectorAll('[data-horm]')].filter(x=>x.checked).map(x=>x.dataset.horm);
    const { error } = await sb.rpc('fn_admin_horarios_mentor',{p_mentor:b.dataset.salvarhor, p_slots:ids});
    if(error){ toast(erroSupabase(error), true); return; }
    cadMentorEdit=null; cacheTurmas=null; toast(`${ids.length} horário${ids.length!==1?'s':''} salvo${ids.length!==1?'s':''}`); render();
  });
  document.querySelectorAll('[data-vincular]').forEach(b=>b.onclick=async()=>{
    const email=prompt('E-mail com que o mentor já entrou no site:');
    if(!email) return;
    const { error } = await sb.rpc('fn_admin_vincular_mentor',{p_mentor:b.dataset.vincular, p_email:email.trim()});
    if(error){ toast(erroSupabase(error), true); return; }
    toast('Conta ligada — ele já vê os convites dele'); render();
  });
}

function exportarCSV(lista){
  const linhas=[['Protocolo','Estudante','Serie','Responsavel','WhatsApp','Email','Polo','Modalidade','Turma','Horario','Situacao','Inscrito em']];
  lista.forEach(i=>linhas.push([i.protocolo,i.aluno_nome,i.aluno_serie,i.responsavel_nome,i.responsavel_whatsapp,
    i.responsavel_email,i.polos?.nome,i.polos?.modalidade,'Turma '+nn(i.turmas?.numero||0),i.turmas?.slots?.rotulo,
    STATUS[i.status].rot,dataBR(i.criado_em)]));
  const csv=linhas.map(l=>l.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a'); a.href=url; a.download='inscricoes-hackschool.csv'; a.click();
  URL.revokeObjectURL(url); toast('CSV exportado');
}

/* =====================================================================
   INDICAR ESCOLA
   ===================================================================== */
function vIndicar(){
  return `<section class="secao" style="border-top:none;padding-top:46px"><div class="molde"><div class="form-wrap">
    <div class="olho">Sua escola ainda não é polo</div>
    <h2 style="margin:10px 0 10px">Indique sua escola</h2>
    <p class="sub">O HACK SCHOOL entra com os professores mentores e a metodologia. A escola entra com o espaço no contraturno — e recebe parte da receita das turmas. Enquanto isso, você pode entrar numa turma online.</p>
    <div class="campos" style="margin-top:24px">
      <div class="campo full"><label for="ie_escola">Nome da escola</label><input id="ie_escola" placeholder="Colégio…"></div>
      <div class="campo"><label for="ie_cidade">Cidade</label><input id="ie_cidade"></div>
      <div class="campo"><label for="ie_uf">Estado</label><input id="ie_uf" placeholder="MT" maxlength="2"></div>
      <div class="campo"><label for="ie_nome">Seu nome</label><input id="ie_nome"></div>
      <div class="campo"><label for="ie_zap">Seu WhatsApp</label><input id="ie_zap" placeholder="(00) 00000-0000"></div>
    </div>
    <div class="acoes">
      <button class="btn vazio" data-ir="#/turmas">Ver turmas online</button>
      <button class="btn amarelo" id="btnIndicar">Enviar indicação</button></div>
  </div></div></section>`;
}

/* =====================================================================
   ROTEADOR
   ===================================================================== */
const app = () => $('#app');
let renderSeq = 0;

// Normaliza o endereço. O link de acesso por e-mail volta com o token no
// hash (#access_token=...) — isso não é rota, e vira '#/'.
function rotaAtual(){
  const bruto = location.hash || '';
  return bruto.startsWith('#/') ? bruto : '#/';
}

async function render(){
  const meu = ++renderSeq;
  const rota = rotaAtual();
  app().innerHTML = `<div class="vista">${carregando()}</div>`;
  let html='', ligar=()=>{};

  try{
    if(rota==='#/'){
      const t = cacheTurmas || await carregarTurmas();
      html = vHome(t.length);
    }
    else if(rota==='#/turmas'){
      const t = cacheTurmas || await carregarTurmas();
      html = vTurmas(t); ligar = ()=>ligarTurmas(t);
    }
    else if(rota==='#/inscricao'){ html = vInscricao(); ligar = ligarInscricao; }
    else if(rota==='#/pronto'){ html = vPronto(); ligar = ()=>{
      const b=$('#btnCriarSenha'); if(b) b.onclick=()=>{
        modoEntrar='criar'; perfilEscolhido='responsavel'; ir('#/entrar'); };
    }; }
    else if(rota==='#/indicar'){ html = vIndicar(); ligar = ligarIndicar; }
    else if(rota==='#/entrar'){
      if(sessao.user && modoEntrar!=='nova-senha'){ ir('#/minha-area'); return; }
      html = vEntrar(); ligar = ligarEntrar;
    }
    else if(rota==='#/minha-area'){
      if(!sessao.user){ ir('#/entrar'); return; }
      if(sessao.area==='equipe'){
        const d = await carregarAdmin(); html = vAdmin(d); ligar = ()=>ligarAdmin(d);
      } else if(sessao.area==='mentor' && sessao.mentor){
        const d = await carregarMentor(); html = vMentor(d); ligar = ()=>ligarMentor(d);
      } else {
        const d = await carregarMinhaArea(); html = vPainel(d); ligar = ligarPainel;
      }
    }
    else if(rota==='#/clube'){
      if(!sessao.user){ ir('#/entrar'); return; }
      if(!clubeId){ ir('#/minha-area'); return; }
      const c = await carregarClube(clubeId); html = vClube(c); ligar = ()=>ligarClube(c);
    }
    else html = vHome(cacheTurmas?cacheTurmas.length:0);
  }catch(e){
    console.error(e);
    html = `<section class="secao" style="border-top:none"><div class="molde"><div class="vazio-msg">
      Não foi possível carregar agora.<br><br><span style="font-size:12.5px">${esc(erroSupabase(e))}</span><br><br>
      <button class="btn vazio peq" onclick="location.reload()">Tentar de novo</button></div></div></section>`;
  }

  if(meu !== renderSeq) return;          // um render mais novo assumiu
  if(!html) html = vHome(cacheTurmas?cacheTurmas.length:0);
  app().innerHTML = `<div class="vista">${html}</div>`;
  window.scrollTo({top:0,behavior:'instant'});
  document.querySelectorAll('[data-ir]').forEach(b=>b.onclick=()=>ir(b.dataset.ir));
  document.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>{
    sessao.area = b.dataset.area;
    mentorAba='turmas'; adminAba='inscricoes'; cadForm=null; cadMentorEdit=null;
    render();
  });
  const sair=$('#btnSair'); if(sair) sair.onclick=async()=>{
    await sb.auth.signOut(); sessao={user:null,perfil:null,mentor:null}; location.hash='#/'; render(); };
  try{ ligar(); }catch(e){ console.error('ligar()',e); }
  atualizarMenu();
}

function atualizarMenu(){
  const b=$('#navArea'); if(!b) return;
  b.textContent = sessao.user ? 'Logado' : 'Entrar';
}

/* ---------- ligações por tela ---------- */
function ligarTurmas(lista){
  const b=$('#busca');
  if(b) b.oninput=e=>{ fTexto=e.target.value; $('#listaPolos').innerHTML=htmlTurmas(lista); ligarCards(lista); };
  document.querySelectorAll('[data-uf]').forEach(c=>c.onclick=()=>{fUF=c.dataset.uf;render();});
  document.querySelectorAll('[data-modo]').forEach(c=>c.onclick=()=>{fModo=c.dataset.modo;render();});
  document.querySelectorAll('[data-limpar]').forEach(c=>c.onclick=()=>{fTexto='';fUF='todos';fModo='todas';render();});
  ligarCards(lista);
}
function ligarCards(lista){
  document.querySelectorAll('[data-turma]').forEach(b=>b.onclick=()=>{
    const t=lista.find(x=>x.id===b.dataset.turma);
    rascunho={turma:t,etapa:1,dados:{}};
    ir('#/inscricao');
  });
  document.querySelectorAll('[data-ir]').forEach(b=>b.onclick=()=>ir(b.dataset.ir));
}

function ligarInscricao(){
  const z=$('#f_zap'); if(z) z.oninput=e=>e.target.value=mascaraTel(e.target.value);
  const c=$('#f_cpf'); if(c) c.oninput=e=>e.target.value=mascaraCPF(e.target.value);
  $('#btnVoltar').onclick=()=>{ if(rascunho.etapa===1) ir('#/turmas'); else { coletar(); rascunho.etapa--; render(); } };
  $('#btnAvancar').onclick=async(ev)=>{
    const e=coletar();
    if(e.length){ mostrarErros(e); return; }
    if(rascunho.etapa===3){ await enviarInscricao(ev.currentTarget); return; }
    rascunho.etapa++; render();
  };
}

function ligarPainel(){
  document.querySelectorAll('[data-clube]').forEach(b=>b.onclick=()=>{
    clubeId=b.dataset.clube; ir('#/clube');
  });
}

function ligarClube(c){
  const at=$('#btnAtualizar'); if(at) at.onclick=()=>render();
  const bh=$('#btnHub'); if(bh) bh.onclick=()=>toast('Em breve: integração com a plataforma HACK HUB');

  document.querySelectorAll('[data-voto]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    const { data, error } = await sb.rpc('fn_votar',{p_turma:c.t.id, p_mentor:b.dataset.voto});
    if(error){ toast(erroSupabase(error), true); b.disabled=false; return; }
    toast(data==='eleito'?'Votação encerrada — mentor eleito'
        : data==='empate'?'Votação empatada — a coordenação vai definir'
        : 'Voto registrado');
    render();
  });

  document.querySelectorAll('[data-apoio]').forEach(b=>b.onclick=async()=>{
    const { error } = await sb.rpc('fn_apoiar_nome',{p_sugestao:b.dataset.apoio});
    if(error){ toast(erroSupabase(error), true); return; }
    render();
  });

  const ne=$('#nomeEnviar'), nt=$('#nomeTxt');
  if(ne&&nt){
    const sug=async()=>{
      const v=nt.value.trim(); if(v.length<2) return;
      const { error } = await sb.rpc('fn_sugerir_nome',{p_turma:c.t.id, p_nome:v});
      if(error){ toast(erroSupabase(error), true); return; }
      toast('Sugestão registrada'); render();
    };
    ne.onclick=sug; nt.onkeydown=e=>{ if(e.key==='Enter') sug(); };
  }

  const ce=$('#chatEnviar'), ct=$('#chatTxt');
  if(ce&&ct){
    const eu=c.membros.find(m=>m.responsavel_user_id===sessao.user.id);
    const mandar=async()=>{
      const v=ct.value.trim(); if(!v||!eu) return;
      ct.value='';
      const { error } = await sb.from('mensagens').insert({turma_id:c.t.id, autor_inscricao:eu.id, texto:v});
      if(error){ toast(erroSupabase(error), true); return; }
      render();
    };
    ce.onclick=mandar; ct.onkeydown=e=>{ if(e.key==='Enter') mandar(); };
  }
  const cc=$('#chatCorpo'); if(cc) cc.scrollTop=cc.scrollHeight;
}

function ligarMentor(d){
  document.querySelectorAll('[data-mab]').forEach(a=>a.onclick=()=>{ mentorAba=a.dataset.mab; render(); });

  document.querySelectorAll('[data-aceitar]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    const { error } = await sb.rpc('fn_responder_convite',{p_convite:b.dataset.aceitar, p_aceitar:true});
    if(error){ toast(erroSupabase(error), true); b.disabled=false; return; }
    toast('Você entrou no clube — combine o básico com a equipe'); render();
  });
  document.querySelectorAll('[data-recusar]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Recusar este convite? Ele passa para o segundo mais votado.')) return;
    b.disabled=true;
    const { error } = await sb.rpc('fn_responder_convite',{p_convite:b.dataset.recusar, p_aceitar:false, p_motivo:'agenda'});
    if(error){ toast(erroSupabase(error), true); b.disabled=false; return; }
    toast('Convite repassado'); render();
  });

  document.querySelectorAll('[data-al]').forEach(inp=>{
    inp.onchange=async()=>{
      const [tid,campo]=inp.dataset.al.split('|');
      const { error } = await sb.from('alinhamentos').update({[campo]:inp.value.trim()}).eq('turma_id',tid);
      if(error){ toast(erroSupabase(error), true); return; }
      render();
    };
  });
  document.querySelectorAll('[data-sug]').forEach(b=>b.onclick=async()=>{
    const [tid,nome]=b.dataset.sug.split('|');
    const { error } = await sb.from('alinhamentos').update({nome_clube:nome}).eq('turma_id',tid);
    if(error){ toast(erroSupabase(error), true); return; }
    render();
  });
  document.querySelectorAll('[data-func]').forEach(sel=>sel.onchange=async()=>{
    const [tid,iid]=sel.dataset.func.split('|');
    if(!sel.value) return;
    const { error } = await sb.rpc('fn_definir_funcao',{p_turma:tid, p_inscricao:iid, p_funcao:sel.value});
    if(error){ toast(erroSupabase(error), true); return; }
    render();
  });
  document.querySelectorAll('[data-encerrar]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    const { error } = await sb.rpc('fn_concluir_alinhamento',{p_turma:b.dataset.encerrar});
    if(error){ toast(erroSupabase(error), true); b.disabled=false; return; }
    toast('Clube virtual encerrado — equipe aberta no HACK HUB'); render();
  });

  const bp=$('#btnSalvarPerfil');
  if(bp) bp.onclick=async()=>{
    const campos={};
    document.querySelectorAll('[data-pf]').forEach(i=>{
      const c=i.dataset.pf;
      if(c==='destaques') campos[c]=i.value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,3);
      else if(c==='limite_turmas') campos[c]=Number(i.value);
      else campos[c]=i.value.trim();
    });
    bp.disabled=true;
    const { error } = await sb.from('mentores').update(campos).eq('id',sessao.mentor.id);
    bp.disabled=false;
    if(error){ toast(erroSupabase(error), true); return; }
    Object.assign(sessao.mentor, campos);
    toast('Cadastro salvo'); render();
  };

  document.querySelectorAll('[data-hor]').forEach(cb=>cb.onchange=async()=>{
    const sid=cb.dataset.hor;
    const q = cb.checked
      ? sb.from('mentor_slots').insert({mentor_id:sessao.mentor.id, slot_id:sid})
      : sb.from('mentor_slots').delete().eq('mentor_id',sessao.mentor.id).eq('slot_id',sid);
    const { error } = await q;
    if(error){ toast(erroSupabase(error), true); cb.checked=!cb.checked; return; }
    render();
  });
}

function ligarAdmin(d){
  document.querySelectorAll('[data-adab]').forEach(a=>a.onclick=()=>{ adminAba=a.dataset.adab; render(); });
  const bs=$('#adBusca'); if(bs) bs.oninput=e=>{
    const pos=e.target.selectionStart; fBusca=e.target.value; render();
    setTimeout(()=>{ const n=$('#adBusca'); if(n){ n.focus(); n.setSelectionRange(pos,pos); } },30);
  };
  const pl=$('#adPolo'); if(pl) pl.onchange=e=>{ fPolo=e.target.value; render(); };
  const st=$('#adStatus'); if(st) st.onchange=e=>{ fStatus=e.target.value; render(); };
  const cs=$('#btnCSV'); if(cs) cs.onclick=()=>exportarCSV(d.insc);
  if(adminAba==='cadastros') ligarCadastros(d);
  document.querySelectorAll('[data-status]').forEach(s=>s.onchange=async()=>{
    const { error } = await sb.from('inscricoes').update({status:s.value}).eq('id',s.dataset.status);
    if(error){ toast(erroSupabase(error), true); return; }
    toast('Situação atualizada'); render();
  });
}

function ligarIndicar(){
  const b=$('#btnIndicar'); if(!b) return;
  b.onclick=()=>{
    const t=`Olá! Quero indicar minha escola para ser polo do HACK SCHOOL.%0A%0AEscola: ${encodeURIComponent($('#ie_escola').value)}%0ACidade: ${encodeURIComponent($('#ie_cidade').value)}/${encodeURIComponent($('#ie_uf').value)}%0AMeu nome: ${encodeURIComponent($('#ie_nome').value)}%0AWhatsApp: ${encodeURIComponent($('#ie_zap').value)}`;
    window.open(`https://wa.me/${CFG.WHATSAPP_CONTATO}?text=${t}`,'_blank');
  };
  const z=$('#ie_zap'); if(z) z.oninput=e=>e.target.value=mascaraTel(e.target.value);
}

/* ---------- inicialização ---------- */
sb.auth.onAuthStateChange(async (evt)=>{
  if(evt === 'PASSWORD_RECOVERY'){
    modoEntrar = 'nova-senha';
    if(location.hash !== '#/entrar'){ location.hash = '#/entrar'; return; }
    render(); return;
  }
  if(evt!=='SIGNED_IN' && evt!=='SIGNED_OUT') return;
  await carregarSessao();
  const r = rotaAtual();
  const destino = evt==='SIGNED_IN'
    ? ((r==='#/' || r==='#/entrar') ? '#/minha-area' : r)
    : '#/';
  if(location.hash !== destino){ location.hash = destino; return; }
  render();
});

window.addEventListener('hashchange', ()=>render());

// Rede de segurança: erro solto nunca deixa a página em branco
window.addEventListener('error', e=>{
  console.error(e.error||e.message);
  if(app() && !app().textContent.trim()){
    app().innerHTML = `<section class="secao" style="border-top:none"><div class="molde">
      <div class="vazio-msg">Algo falhou ao carregar.<br><br>
      <button class="btn vazio peq" onclick="location.href=location.pathname+'#/'">Voltar ao início</button>
      </div></div></section>`;
  }
});

(async ()=>{
  try{ await carregarSessao(); }catch(e){ console.error('sessao',e); }
  const bruto = location.hash || '';
  // limpa o token do link de acesso e decide onde a pessoa cai
  if(bruto.includes('type=recovery')){
    modoEntrar='nova-senha';
    history.replaceState(null,'', location.pathname + '#/entrar');
  } else if(!bruto.startsWith('#/')){
    history.replaceState(null,'', location.pathname + (sessao.user ? '#/minha-area' : '#/'));
  } else if(sessao.user && bruto==='#/entrar'){
    history.replaceState(null,'', location.pathname + '#/minha-area');
  }
  render();
})();
