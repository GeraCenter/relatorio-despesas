(function () {
'use strict';
const APPVER = '2.7.0';
const $ = id => document.getElementById(id);
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_L = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const n2 = (v, d = 2) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const parseNum = s => { if (s == null) return NaN; s = String(s).trim().replace(/\s|R\$/g, ''); if (!s) return NaN; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return Number(s); };
const pad = x => String(x).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const br = s => { const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hhmm = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const CLIP = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5"/></svg>';
$('appVer').textContent = 'v' + APPVER;

function show(view) { ['view-wait', 'view-auth', 'view-app'].forEach(v => $(v).hidden = v !== view); }

// ======================================================================
// Estado
// ======================================================================
const DEF = { nome: '', cargo: '', emissor: '', cartao: '', placa: '', empresa: 'Gera Center', limite: 500, fech: 25 };
let me = null;             // { uid, email }
let myProfile = { ...DEF };
let isMaster = false, isAprov = false;   // master: tudo; aprovador: vê e aprova relatórios
const papelDe = c => c && c.admin ? 'master' : c && c.aprovador ? 'aprovador' : 'funcionario';
const flagsDe = p => ({ admin: p === 'master', aprovador: p === 'aprovador' });
const NOME_PAPEL = { master: 'Master', aprovador: 'Aprovador', funcionario: 'Funcionário' };
let viewUid = null;         // de quem é o relatório na tela
let profile = { ...DEF };   // perfil do relatório na tela
let lancs = [];
let unsub = null;
let fech = null, unsubFech = null;   // situação do período na tela (enviado / aprovado / devolvido)
const travado = () => !!fech && (fech.status === 'enviado' || fech.status === 'aprovado');
const podeEditar = () => !readOnly() && !travado();
function pararOuvir() { if (unsub) { unsub(); unsub = null; } if (unsubFech) { unsubFech(); unsubFech = null; } }
let editingId = null, confirmId = null;
let LOGO = null;
const readOnly = () => viewUid !== (me && me.uid);

// ciclo: fecha no dia F; começa no dia F+1 do mês anterior
function cycleKeyFor(date, F = profile.fech) { let y = date.getFullYear(), m = date.getMonth(); if (date.getDate() > F) { m++; if (m > 11) { m = 0; y++; } } return y + '-' + pad(m + 1); }
function cycleRange(key, F = profile.fech) { const [y, m] = key.split('-').map(Number); return { start: new Date(y, m - 2, F + 1), end: new Date(y, m - 1, F) }; }
function shiftKey(key, d) { let [y, m] = key.split('-').map(Number); m += d; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + pad(m); }
let curKey = cycleKeyFor(new Date(), 25);
function items() { return lancs.slice().sort((a, b) => a.data.localeCompare(b.data) || String(a.id).localeCompare(String(b.id))); }

function status(t, warn) { $('syncMsg').textContent = t; $('syncMsg').classList.toggle('warn', !!warn); }
const errMsg = e => {
  const c = e && e.code || '';
  if (c === 'permission-denied') return 'Sem permissão para essa ação.';
  if (c === 'unavailable') return 'Sem conexão com o servidor. Tentando de novo…';
  if (c === 'resource-exhausted') return 'Limite diário do plano gratuito atingido. Tente amanhã.';
  return (e && e.message) || String(e);
};

// ======================================================================
// Login
// ======================================================================
function authMode(mode) {
  ['fLogin', 'fSignup', 'fReset', 'fColar', 'pVerify', 'pBlocked', 'pNoConfig', 'pAction', 'pSenha'].forEach(id => $(id).hidden = true);
  if (mode === 'colar') { $('fColar').hidden = false; $('kErr').textContent = ''; }
  if (mode === 'senha') $('pSenha').hidden = false;
  ({ login: 'fLogin', signup: 'fSignup', reset: 'fReset', verify: 'pVerify', blocked: 'pBlocked', noconfig: 'pNoConfig' })[mode] && ($({ login: 'fLogin', signup: 'fSignup', reset: 'fReset', verify: 'pVerify', blocked: 'pBlocked', noconfig: 'pNoConfig' }[mode]).hidden = false);
  ['lErr', 'sErr', 'rErr', 'rOk', 'vErr', 'vOk'].forEach(id => $(id).textContent = '');
  show('view-auth');
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
  const m = b.dataset.mode; const e = ($('lEmail').value || $('sEmail').value || $('rEmail').value).trim();
  ['lEmail', 'sEmail', 'rEmail'].forEach(id => { if (!$(id).value) $(id).value = e; });
  authMode(m);
}));
document.querySelectorAll('[data-sair]').forEach(b => b.addEventListener('click', () => Store.sair()));

const authErr = e => {
  if (e && e.code === 'auth/expired-action-code') return 'O link expirou. Peça um novo.';
  const c = e && e.code || '';
  return ({
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/invalid-credential': 'E-mail ou senha incorretos. Se é o seu primeiro acesso, use "Primeiro acesso".',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos. Se é o seu primeiro acesso, use "Primeiro acesso".',
    'auth/email-already-in-use': 'Esse e-mail já tem senha. Use "Entrar" ou "Esqueci a senha".',
    'auth/weak-password': 'Senha fraca. Use pelo menos 8 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem internet. Verifique a conexão.',
    'auth/missing-email': 'Informe o e-mail.'
  })[c] || ('Não deu certo: ' + ((e && e.message) || e));
};
$('fLogin').addEventListener('submit', async e => {
  e.preventDefault(); $('lErr').textContent = '';
  const em = $('lEmail').value.trim(), s = $('lSenha').value;
  if (!em || !s) { $('lErr').textContent = 'Informe e-mail e senha.'; return; }
  $('btnEntrar').disabled = true;
  try { await Store.entrar(em, s); } catch (x) { $('lErr').textContent = authErr(x); } finally { $('btnEntrar').disabled = false; }
});
$('fSignup').addEventListener('submit', async e => {
  e.preventDefault(); $('sErr').textContent = '';
  const em = $('sEmail').value.trim(), s = $('sSenha').value, s2 = $('sSenha2').value;
  if (!em) { $('sErr').textContent = 'Informe o e-mail.'; return; }
  if (s.length < 8) { $('sErr').textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
  if (s !== s2) { $('sErr').textContent = 'As duas senhas não são iguais.'; return; }
  try { await Store.criarConta(em, s); } catch (x) { $('sErr').textContent = authErr(x); }
});
$('fReset').addEventListener('submit', async e => {
  e.preventDefault(); $('rErr').textContent = ''; $('rOk').textContent = '';
  const em = $('rEmail').value.trim(); if (!em) { $('rErr').textContent = 'Informe o e-mail.'; return; }
  try { await Store.esqueciSenha(em); $('rOk').textContent = 'Se esse e-mail tiver acesso, o link chega em alguns minutos. Veja também o spam. Se o link não abrir, use "O link do e-mail não abre?".'; }
  catch (x) { if (x && x.code === 'auth/user-not-found') $('rOk').textContent = 'Se esse e-mail tiver acesso, o link chega em alguns minutos. Veja também o spam.'; else $('rErr').textContent = authErr(x); }
});
$('btnVerificado').addEventListener('click', async () => {
  $('vErr').textContent = '';
  try { if (await Store.confirmarVerificacao()) entrarNoSistema({ uid: me.uid, email: me.email, verificado: true }); else $('vErr').textContent = 'Ainda não aparece como confirmado. Clique no link do e-mail e tente de novo.'; }
  catch (x) { $('vErr').textContent = authErr(x); }
});
$('btnReenviar').addEventListener('click', async () => {
  try { await Store.reenviarConfirmacao(); $('vOk').textContent = 'E-mail reenviado.'; } catch (x) { $('vErr').textContent = authErr(x); }
});
$('btnTentar').addEventListener('click', () => me && entrarNoSistema(me));
// link de e-mail colado: aceita o link direto ou "embrulhado" por Outlook/Gmail/antivírus
function lerLinkColado(txt) {
  let t = String(txt || '').trim();
  for (let i = 0; i < 4; i++) { try { const d = decodeURIComponent(t); if (d === t) break; t = d; } catch (_) { break; } }
  const mode = (t.match(/[?&]mode=([A-Za-z]+)/) || [])[1], code = (t.match(/[?&]oobCode=([A-Za-z0-9_\-]+)/) || [])[1];
  return mode && code ? { mode, code } : null;
}
$('fColar').addEventListener('submit', e => {
  e.preventDefault(); const r = lerLinkColado($('kLink').value);
  if (!r) { $('kErr').textContent = 'Não reconheci esse link. Copie o link inteiro do e-mail (botão direito → Copiar endereço do link).'; return; }
  $('kLink').value = '';
  history.replaceState(null, '', location.pathname + '?mode=' + encodeURIComponent(r.mode) + '&oobCode=' + encodeURIComponent(r.code));
  tratarLinkDeEmail();
});
$('fSenha').addEventListener('submit', async e => {
  e.preventDefault(); $('tErr').textContent = ''; const s1 = $('tSenha').value, s2 = $('tSenha2').value;
  if (s1.length < 8) { $('tErr').textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
  if (s1 !== s2) { $('tErr').textContent = 'As duas senhas não são iguais.'; return; }
  try { await Store.trocarMinhaSenha(s1); await Store.marcarSenhaTrocada(me.email); entrarNoSistema(me); }
  catch (x) { $('tErr').textContent = x && x.code === 'auth/requires-recent-login' ? 'Por segurança, saia e entre de novo com a senha provisória, e depois crie a nova senha.' : authErr(x); }
});

// ======================================================================
// Entrada no sistema
// ======================================================================
async function entrarNoSistema(u) {
  const eu = me = { uid: u.uid, email: u.email, verificado: u.verificado !== false };
  show('view-wait');
  if (!eu.verificado) {
    // pode ter confirmado em outro aparelho ou aba
    try { if (await Store.confirmarVerificacao()) eu.verificado = true; } catch (_) {}
    if (me !== eu) return; // saiu ou trocou de conta enquanto isso
  }
  let conv = null, semRede = false;
  try { conv = await Store.meuConvite(u.email); }
  catch (e) { // sem internet na abertura: segue com o que estiver guardado no aparelho
    semRede = true;
    conv = (() => { try { return JSON.parse(localStorage.getItem('rg.conv.' + u.uid) || 'null'); } catch (_) { return null; } })();
  }
  // conta criada pelo administrador dispensa a confirmação por e-mail
  if (me !== eu) return;
  if (!eu.verificado && !(conv && conv.conta_admin)) { $('vEmail').textContent = u.email; authMode('verify'); return; }
  if (!conv || !conv.ativo) {
    authMode('blocked');
    $('pBlocked').querySelector('p').innerHTML = semRede
      ? 'Não consegui confirmar o acesso de <b>' + esc(u.email) + '</b> porque o aparelho está sem internet. Conecte e toque em Tentar de novo.'
      : 'O e-mail <b>' + esc(u.email) + '</b> ainda não está liberado para usar o sistema. Peça ao administrador para liberar o seu acesso.';
    return;
  }
  if (conv.trocar_senha && !semRede) { $('tErr').textContent = ''; $('fSenha').reset(); authMode('senha'); return; }
  try { localStorage.setItem('rg.conv.' + u.uid, JSON.stringify({ ativo: conv.ativo, admin: !!conv.admin, aprovador: !!conv.aprovador, conta_admin: !!conv.conta_admin })); } catch (_) {}
  isMaster = !!conv.admin; isAprov = isMaster || !!conv.aprovador;
  let p = null;
  try { p = await Store.perfil(u.uid); } catch (_) {}
  let novoPerfil = false;
  if (!p) { novoPerfil = true; p = { ...DEF, nome: conv.nome || '', email: u.email }; Store.salvarPerfil(u.uid, p).catch(e => status('Não consegui salvar seus dados: ' + errMsg(e), true)); }
  myProfile = { ...DEF, ...p, email: u.email };
  $('whoName').textContent = myProfile.nome || u.email; $('whoEmail').textContent = myProfile.nome ? u.email : '';
  $('tabs').hidden = !isAprov; $('tabAdminTxt').textContent = isMaster ? 'Administração' : 'Aprovações'; $('btnRoBack').textContent = isMaster ? 'Voltar para a administração' : 'Voltar para as aprovações';
  curKey = cycleKeyFor(new Date(), myProfile.fech);
  abrirMeus();
  show('view-app');
  if (isAprov) atualizarPendencias();
  verificarAtrasos();
  if (novoPerfil || !myProfile.nome) { $('cfg').open = true; $('pMsg').textContent = 'Primeiro acesso: preencha seus dados e clique em Salvar dados. Eles aparecem no relatório.'; }
}

function abrirMeus() {
  viewUid = me.uid; profile = myProfile;
  $('tabMine').setAttribute('aria-selected', 'true'); $('tabAdmin').setAttribute('aria-selected', 'false');
  $('view-main').hidden = false; $('view-admin').hidden = true; $('roBanner').hidden = true;
  $('formPanel').hidden = false; $('cfgPanel').hidden = false;
  fillProfileForm(); resetForm(); assinar();
}
function abrirDeOutro(u) {
  viewUid = u.uid; profile = { ...DEF, ...u };
  $('view-main').hidden = false; $('view-admin').hidden = true; $('roBanner').hidden = false;
  $('roTxt').textContent = 'Relatório de ' + (u.nome || u.email) + ' — somente leitura';
  $('formPanel').hidden = true; $('cfgPanel').hidden = true;
  editingId = null; confirmId = null; assinar(); window.scrollTo({ top: 0 });
}
$('tabMine').addEventListener('click', abrirMeus);
$('tabAdmin').addEventListener('click', abrirAdmin);
$('btnRoBack').addEventListener('click', abrirAdmin);

function assinar() {
  pararOuvir();
  lancs = []; render();
  const { start, end } = cycleRange(curKey);
  unsub = Store.ouvirLancamentos(viewUid, iso(start), iso(end), (list, doCache) => {
    lancs = list.map(norm); render();
    const pend = list.filter(x => x.pendente).length;
    if (pend) status(pend + ' lançamento' + (pend > 1 ? 's' : '') + ' aguardando internet para sincronizar.', true);
    else status(doCache ? 'Sem conexão: mostrando o que está guardado no aparelho.' : 'Tudo sincronizado.', doCache);
  }, e => status('Não consegui carregar os lançamentos: ' + errMsg(e), true));
  fech = null; const k = curKey, uid = viewUid;
  unsubFech = Store.ouvirFechamento(uid, k, f => { if (k !== curKey || uid !== viewUid) return; fech = f; if (travado() && editingId) resetForm(); render(); if (me && uid === me.uid) verificarAtrasos(); }, () => {});
}

let loginLigado = false;
function ligarLogin() { loginLigado = true; Store.aoMudarLogin(u => {
  pararOuvir();
  if (!u) { me = null; atrasos = []; $('atrasoBar').hidden = true; authMode('login'); return; }
  me = { uid: u.uid, email: u.email, verificado: u.verificado };
  entrarNoSistema(me);
}); }

// ======================================================================
// Tela principal
// ======================================================================
// lançamentos antigos (só combustível) tinham "posto" no lugar de "descricao"
const CATS = ["Combustível", "Pedágio", "Estacionamento", "Alimentação", "Hospedagem", "Transporte (táxi, app, ônibus)", "Material / suprimentos", "Outros"];
const norm = x => ({ ...x, descricao: x.descricao || x.posto || '', categoria: x.categoria || 'Combustível' });
// faixas do limite (o limite é o que cada funcionário cadastrou em "Meus dados"); compara em centavos
function situacaoLimite(tot, L) {
  const t = Math.round((Number(tot) || 0) * 100), l = Math.round((Number(L) || 0) * 100);
  if (t > l) return { cls: 'over', txt: 'Acima do limite' };
  if (t === l && l > 0) return { cls: 'warn', txt: 'Limite atingido' };
  if (t > l * 0.9) return { cls: 'warn', txt: 'Perto do limite' };
  return { cls: 'ok', txt: 'Dentro do limite' };
}
function totals() {
  const it = items(); const tot = it.reduce((s, x) => s + x.valor, 0);
  const porCat = {}; it.forEach(x => { porCat[x.categoria] = (porCat[x.categoria] || 0) + x.valor; });
  return { it, tot, porCat };
}
const catResumo = porCat => Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => c + ' ' + brl(v)).join(' · ');
function render() {
  const { start, end } = cycleRange(curKey); const [y, m] = curKey.split('-').map(Number);
  $('cycTitle').textContent = 'Fatura ' + MESES[m - 1] + '/' + y;
  $('cycRange').textContent = br(iso(start)) + ' a ' + br(iso(end));
  $('iData').min = iso(start); $('iData').max = iso(end);
  const { it, tot, porCat } = totals(); const L = profile.limite; const pct = L ? tot / L : 0;
  $('gSpent').textContent = brl(tot); $('gOf').textContent = 'de ' + brl(L);
  $('barFill').style.width = Math.min(100, pct * 100) + '%';
  const sl = situacaoLimite(tot, L);
  const bar = $('bar'); bar.classList.toggle('warn', sl.cls === 'warn'); bar.classList.toggle('over', sl.cls === 'over');
  const pill = $('pill'); pill.className = 'pill ' + sl.cls; pill.textContent = sl.txt;
  const saldo = L - tot; $('sSaldo').textContent = brl(saldo); $('sSaldo').style.color = saldo < 0 ? 'var(--danger)' : '';
  $('sQtd').textContent = it.length; const sem = it.filter(x => !x.cupom).length; $('sSem').textContent = sem; $('sSem').style.color = sem ? 'var(--amber)' : '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (today >= start && today <= end) { const dl = Math.round((end - today) / 864e5); $('daysLeft').textContent = dl === 0 ? 'A fatura fecha hoje.' : 'Faltam ' + dl + ' dia' + (dl > 1 ? 's' : '') + ' para o fechamento (' + br(iso(end)) + ').'; }
  else $('daysLeft').textContent = today > end ? 'Ciclo encerrado.' : 'Ciclo futuro.';
  $('count').textContent = it.length ? it.length + ' lançamento' + (it.length > 1 ? 's' : '') : '';
  const ds = [...new Set(it.map(x => x.descricao))]; $('descs').innerHTML = ds.map(p => '<option value="' + esc(p) + '">').join('');
  renderList(it); renderSheet(it, tot, porCat); renderFech();
}
function renderList(it) {
  const ro = readOnly(), lock = !podeEditar();
  if (!it.length) { $('list').innerHTML = '<div class="empty"><b>Nenhuma despesa neste ciclo</b>' + (ro ? 'Este funcionário ainda não lançou nada neste ciclo.' : 'Preencha o formulário acima com a data, a categoria, a descrição e o valor. No celular, toque em <b>Tirar foto</b> para anexar o cupom.') + '</div>'; return; }
  let h = '<div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th class="r">Valor</th><th></th></tr></thead><tbody>';
  it.forEach(x => {
    h += '<tr class="' + (x.id === editingId ? 'editing' : '') + '"><td class="num">' + br(x.data) + '</td><td>' + esc(x.descricao) + '<div class="hint">' + [esc(x.categoria), x.nf ? 'NF ' + esc(x.nf) : ''].filter(Boolean).join(' · ') + '</div>' +
      (x.cupom ? '' : '<div class="nocupom">sem cupom anexado</div>') + (x.pendente ? '<div class="sync">aguardando sincronizar</div>' : '') +
      '</td><td class="r num">' + brl(x.valor) + '</td><td class="r">';
    if (confirmId === x.id) h += '<span class="confirm">Excluir? <button class="link danger" data-act="del" data-id="' + x.id + '">Sim</button><button class="link" data-act="nodel">Não</button></span>';
    else h += (x.cupom ? '<button class="icon-btn" data-act="view" data-id="' + x.id + '" title="Ver cupom" aria-label="Ver cupom">' + CLIP + '</button>' : '') +
      (lock ? '' : '<button class="link" data-act="edit" data-id="' + x.id + '">Editar</button><button class="link danger" data-act="ask" data-id="' + x.id + '">Excluir</button>');
    h += '</td></tr>';
  });
  $('list').innerHTML = h + '</tbody></table></div>';
}
function cardTxt() { const p = profile; return [p.emissor, p.cartao ? 'final ' + p.cartao : ''].filter(Boolean).join(' · ') || '—'; }
function periodText() { const { start, end } = cycleRange(curKey); return br(iso(start)) + ' a ' + br(iso(end)); }
function refMonth() { const [y, m] = curKey.split('-').map(Number); return MESES_L[m - 1] + '/' + y; }
const DECL_BASE = 'Declaro que as despesas acima foram realizadas com o cartão de crédito corporativo exclusivamente em atividades a serviço da empresa, e que os comprovantes seguem anexos.';
let DECL = DECL_BASE;
function renderSheet(it, tot, porCat) {
  const p = profile; const L = p.limite;
  let rows = it.map((x, i) => '<tr><td>' + (i + 1) + '</td><td>' + br(x.data) + '</td><td>' + esc(x.categoria) + '</td><td>' + esc(x.descricao) + '</td><td>' + esc(x.nf || '—') + '</td><td class="r">' + brl(x.valor) + '</td></tr>').join('');
  if (!rows) rows = '<tr><td colspan="6" style="color:#888;text-align:center;padding:14px">Sem lançamentos neste ciclo</td></tr>';
  $('sheet').innerHTML =
    '<div class="sh-head"><img src="icons/logo.png" alt="Gera Center"><h3>Relatório de Despesas<br>Cartão Corporativo</h3></div>' +
    '<div class="meta num"><div><span>Colaborador:</span> ' + esc(p.nome || '________________') + '</div><div><span>Empresa:</span> ' + esc(p.empresa || '—') + '</div>' +
    '<div><span>Cargo/Depto:</span> ' + esc(p.cargo || '—') + '</div><div><span>Cartão:</span> ' + esc(cardTxt()) + '</div>' +
    '<div><span>Fatura:</span> ' + refMonth() + '</div><div><span>Período:</span> ' + periodText() + '</div></div>' +
    '<table class="num"><thead><tr><th>#</th><th>Data</th><th>Categoria</th><th>Descrição</th><th>Cupom/NF</th><th class="r">Valor</th></tr></thead><tbody>' + rows +
    '<tr class="tot"><td colspan="5">Total</td><td class="r">' + brl(tot) + '</td></tr></tbody></table>' +
    (Object.keys(porCat || {}).length > 1 ? '<div class="decl"><span style="color:#666">Por categoria:</span> ' + esc(catResumo(porCat)) + '</div>' : '') +
    '<div class="meta num"><div><span>Limite do ciclo:</span> ' + brl(L) + '</div><div><span>Saldo:</span> ' + brl(L - tot) + (tot > L ? ' (excedido)' : '') + '</div></div>' +
    '<div class="decl">' + DECL + '</div>' +
    (fech && fech.status === 'aprovado' ? '<div class="decl"><b>Aprovado</b> por ' + esc(fech.avaliado_nome || fech.avaliado_por || '') + ' em ' + quando(fech.avaliado_em) + '.</div>' : '') +
    '<div class="sigs"><div class="sig">' + (esc(p.nome) || '&nbsp;') + '<small>Data ___/___/____</small></div></div>';
  ajustarFolha();
}
// ----- folha A4 na tela: reduz para caber na largura (celular); um toque amplia -----
let folhaAmpliada = false;
function ajustarFolha() {
  const w = $('sheetWrap'), sh = $('sheet'); if (!w || !sh || !w.clientWidth) return;
  const base = 540, cabe = Math.min(1, w.clientWidth / base), esc2 = folhaAmpliada ? 1 : cabe;
  sh.style.transform = esc2 < 1 ? 'scale(' + esc2 + ')' : '';
  w.style.height = Math.ceil(sh.offsetHeight * esc2) + 'px';
  w.classList.toggle('zoom', folhaAmpliada && cabe < 1);
  $('zoomHint').hidden = cabe >= 1; $('zoomHint').textContent = folhaAmpliada ? 'Toque na folha para reduzir. Arraste para o lado para ver o resto.' : 'Toque na folha para ampliar.';
}
$('sheetWrap').addEventListener('click', () => { folhaAmpliada = !folhaAmpliada; ajustarFolha(); });
let ultimaLarg = 0;
if (window.ResizeObserver) new ResizeObserver(() => { const lw = $('sheetWrap').clientWidth; if (lw !== ultimaLarg) { ultimaLarg = lw; ajustarFolha(); } }).observe($('sheetWrap'));
window.addEventListener('resize', ajustarFolha);
$('prev').addEventListener('click', () => { curKey = shiftKey(curKey, -1); confirmId = null; if (!$('view-admin').hidden) carregarAdmin(); else { if (!readOnly()) resetForm(); assinar(); } });
$('next').addEventListener('click', () => { curKey = shiftKey(curKey, 1); confirmId = null; if (!$('view-admin').hidden) carregarAdmin(); else { if (!readOnly()) resetForm(); assinar(); } });

// ======================================================================
// Cupom: foto (câmera/galeria) ou PDF, comprimido para caber no banco
// ======================================================================
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
const toBlob = (c, q) => new Promise(r => c.toBlob(b => r(b), 'image/jpeg', q));
const blobToDataUrl = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
const MAXB = 850 * 1024;
async function compactar(src, w0, h0) {
  // tenta tamanhos e qualidades até a página caber em ~850 KB
  for (const [dim, q] of [[1600, .72], [1400, .65], [1200, .6], [1000, .55], [800, .5]]) {
    const k = Math.min(1, dim / Math.max(w0, h0)); const c = document.createElement('canvas');
    c.width = Math.round(w0 * k); c.height = Math.round(h0 * k); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0, c.width, c.height);
    const b = await toBlob(c, q); if (b && b.size <= MAXB) return { bytes: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height, canvas: c };
  }
  throw new Error('Imagem grande demais. Tente tirar a foto de novo, mais perto do cupom.');
}
async function miniatura(canvas) { const k = 160 / Math.max(canvas.width, canvas.height); const c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', .6); }
async function processarArquivo(file) {
  const name = file.name || 'cupom'; const ext = (name.split('.').pop() || '').toLowerCase();
  const isPdf = file.type === 'application/pdf' || ext === 'pdf';
  if (file.size > 25 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 25 MB).');
  const pages = [];
  if (isPdf) {
    if (!window.pdfjsLib) throw new Error('Leitor de PDF não carregou.');
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    for (let n = 1; n <= Math.min(pdf.numPages, 3); n++) {
      const pg = await pdf.getPage(n); const v0 = pg.getViewport({ scale: 1 }); const v = pg.getViewport({ scale: Math.min(3, 1600 / v0.width) });
      const c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: v }).promise; pages.push(await compactar(c, c.width, c.height));
    }
  } else {
    const url = URL.createObjectURL(file);
    try { const img = await loadImg(url); pages.push(await compactar(img, img.naturalWidth, img.naturalHeight)); }
    catch (e) { throw e && e.message && e.message.startsWith('Imagem') ? e : new Error('Não consegui ler essa imagem. Use JPG, PNG ou PDF.'); }
    finally { URL.revokeObjectURL(url); }
  }
  return { novo: true, pages: pages.map(p => ({ bytes: p.bytes, w: p.w, h: p.h })), tipo: isPdf ? 'pdf' : 'img', nome: name, thumb: await miniatura(pages[0].canvas) };
}
let pendingAtt = null, removedAtt = false;
function showAtt() {
  const a = pendingAtt; $('btnAttDel').hidden = !a; $('attThumb').hidden = !(a && a.thumb);
  if (!a) { $('attName').innerHTML = '<span class="hint">Foto do cupom fiscal (JPG, PNG) ou PDF. No computador, também dá para arrastar o arquivo aqui.</span>'; return; }
  if (a.thumb) $('attThumb').src = a.thumb;
  $('attName').textContent = (a.nome || 'Cupom') + (a.novo ? ' · ' + Math.round(a.pages.reduce((s, p) => s + p.bytes.length, 0) / 1024) + ' KB' : ' · já anexado');
}
async function handleFile(file) {
  if (!file) return; $('formErr').textContent = ''; $('attName').textContent = 'Preparando ' + (file.name || 'foto') + '…';
  try { pendingAtt = await processarArquivo(file); } catch (e) { $('formErr').textContent = e.message || 'Não consegui ler esse arquivo.'; }
  showAtt();
}
$('btnCam').addEventListener('click', () => $('camFile').click());
$('btnClip').addEventListener('click', () => $('attFile').click());
$('camFile').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
$('attFile').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
$('btnAttDel').addEventListener('click', () => { if (pendingAtt && !pendingAtt.novo) removedAtt = true; pendingAtt = null; showAtt(); });
const fbox = $('form');
fbox.addEventListener('dragover', e => { e.preventDefault(); $('attBox').classList.add('drag'); });
fbox.addEventListener('dragleave', e => { if (!fbox.contains(e.relatedTarget)) $('attBox').classList.remove('drag'); });
fbox.addEventListener('drop', e => { e.preventDefault(); $('attBox').classList.remove('drag'); handleFile(e.dataTransfer.files[0]); });
window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());

async function cupomImagens(uid, x) {
  const out = [];
  for (let k = 1; k <= ((x.cupom && x.cupom.paginas) || 0); k++) {
    const c = await Store.lerCupom(uid, x.id, k);
    if (c) out.push({ url: await blobToDataUrl(new Blob([c.bytes], { type: 'image/jpeg' })), w: c.w, h: c.h });
  }
  return out;
}
$('vClose').addEventListener('click', () => $('viewer').close());

// ======================================================================
// Formulário de lançamento
// ======================================================================
function defaultDate() { const { start, end } = cycleRange(curKey); const t = new Date(); t.setHours(0, 0, 0, 0); return iso(t < start ? start : t > end ? end : t); }
function resetForm() { editingId = null; $('form').reset(); $('iData').value = defaultDate(); pendingAtt = null; removedAtt = false; showAtt(); $('btnSave').textContent = 'Adicionar'; $('btnCancel').hidden = true; $('formErr').textContent = ''; try { const c = localStorage.getItem('rg.cat'); if (c && CATS.includes(c)) $('iCat').value = c; } catch (_) {} }
$('btnCancel').addEventListener('click', () => { resetForm(); render(); });

$('form').addEventListener('submit', e => {
  e.preventDefault(); if (!podeEditar()) { $('formErr').textContent = 'Este período já foi enviado e está bloqueado.'; return; }
  const data = $('iData').value, descricao = $('iDesc').value.trim(), categoria = $('iCat').value, valor = parseNum($('iValor').value);
  const err = m => { $('formErr').textContent = m; };
  if (!data) return err('Informe a data da despesa.');
  const { start, end } = cycleRange(curKey); const d = fromIso(data);
  if (d < start || d > end) return err('A data precisa estar entre ' + periodText() + '. Para outro período, troque o ciclo no topo.');
  if (!descricao) return err('Informe a descrição, por exemplo o nome do estabelecimento.');
  if (!(valor > 0)) return err('Informe o valor pago, por exemplo 150,00.');
  const old = editingId ? lancs.find(x => x.id === editingId) : null;
  const id = old ? old.id : Store.novoId(me.uid);
  const oldPag = old && old.cupom ? old.cupom.paginas : 0;
  let cupom = old ? old.cupom || null : null, thumb = old ? old.thumb || null : null;
  if (pendingAtt && pendingAtt.novo) {
    cupom = { paginas: pendingAtt.pages.length, tipo: pendingAtt.tipo, nome: pendingAtt.nome, bytes: pendingAtt.pages.reduce((s, p) => s + p.bytes.length, 0) }; thumb = pendingAtt.thumb;
    Store.salvarCupom(me.uid, id, pendingAtt.pages, oldPag).catch(x => status('Não consegui salvar o cupom: ' + errMsg(x), true));
  } else if (removedAtt && oldPag) {
    cupom = null; thumb = null; Store.excluirCupom(me.uid, id, oldPag).catch(() => {});
  }
  const rec = { data, categoria, descricao, valor: Math.round(valor * 100) / 100, nf: $('iNf').value.trim(), cupom, thumb };
  try { localStorage.setItem('rg.cat', categoria); } catch (_) {}
  // não espera o servidor: aparece na hora e sincroniza quando houver internet
  Store.salvarLancamento(me.uid, id, rec, !old).catch(x => status('Não consegui salvar o lançamento: ' + errMsg(x), true));
  resetForm(); $('iDesc').focus();
});

$('list').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return; const id = b.dataset.id, act = b.dataset.act;
  const x = lancs.find(z => z.id === id);
  if (act === 'view' && x) {
    $('vTitle').textContent = br(x.data) + ' · ' + x.descricao + ' · ' + brl(x.valor); $('vBody').innerHTML = '<span class="hint">Carregando…</span>'; $('viewer').showModal();
    try { const imgs = await cupomImagens(viewUid, x); $('vBody').innerHTML = imgs.length ? '' : '<span class="hint">Cupom não encontrado.</span>'; imgs.forEach(i => { const im = new Image(); im.src = i.url; im.alt = 'Cupom'; $('vBody').appendChild(im); }); }
    catch (er) { $('vBody').innerHTML = '<span class="bad-txt">Não consegui abrir o cupom: ' + esc(errMsg(er)) + '</span>'; }
    return;
  }
  if (!podeEditar()) return;
  if (act === 'ask') confirmId = id;
  else if (act === 'nodel') confirmId = null;
  else if (act === 'del' && x) { confirmId = null; if (editingId === id) resetForm(); Store.excluirLancamento(me.uid, id, x.cupom ? x.cupom.paginas : 0).catch(er => status('Não consegui excluir: ' + errMsg(er), true)); }
  else if (act === 'edit' && x) {
    resetForm(); editingId = id;
    $('iData').value = x.data; $('iDesc').value = x.descricao; $('iCat').value = CATS.includes(x.categoria) ? x.categoria : 'Outros'; $('iValor').value = n2(x.valor); $('iNf').value = x.nf || '';
    pendingAtt = x.cupom ? { novo: false, nome: x.cupom.nome, tipo: x.cupom.tipo, thumb: x.thumb } : null; showAtt();
    $('btnSave').textContent = 'Salvar alteração'; $('btnCancel').hidden = false; $('formPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  render();
});

// ======================================================================
// Envio ao administrador, aprovação e devolução
// ======================================================================
const dt = v => !v ? null : v.toDate ? v.toDate() : new Date(v);
const quando = v => { const d = dt(v); return d ? d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'; };
const fotografia = it => it.map(x => ({ id: x.id, data: x.data, valor: x.valor })).sort((a, b) => a.id.localeCompare(b.id));
function nomeFatura(k) { const [y, m] = k.split('-').map(Number); return MESES[m - 1] + '/' + y; }
function envioTag(f) {
  if (!f) return '<span class="hint">Não enviado</span>';
  if (f.status === 'enviado') return '<span class="warn-txt">Aguardando aprovação</span><div class="hint">' + quando(f.enviado_em) + '</div>';
  if (f.status === 'aprovado') return '<span class="ok-txt">Aprovado</span><div class="hint">' + quando(f.avaliado_em) + '</div>';
  return '<span class="bad-txt">Devolvido</span><div class="hint">' + quando(f.avaliado_em) + '</div>';
}
// confere se os lançamentos mudaram depois do envio (o servidor registra a hora de cada alteração)
function divergencias(it) {
  if (!fech || !fech.itens) return [];
  const msgs = []; const antes = JSON.stringify(fech.itens), agora = JSON.stringify(fotografia(it));
  if (antes !== agora) {
    const a = new Map(fech.itens.map(x => [x.id, x])), b = new Map(it.map(x => [x.id, x]));
    const novos = it.filter(x => !a.has(x.id)).length, sumiu = fech.itens.filter(x => !b.has(x.id)).length;
    const mud = it.filter(x => a.has(x.id) && (a.get(x.id).valor !== x.valor || a.get(x.id).data !== x.data)).length;
    msgs.push('Atenção: os lançamentos mudaram depois do envio (' + [novos ? novos + ' incluído(s)' : '', sumiu ? sumiu + ' excluído(s)' : '', mud ? mud + ' alterado(s)' : ''].filter(Boolean).join(', ') + ').');
  }
  const env = dt(fech.enviado_em);
  if (env) { const dep = it.filter(x => dt(x.alterado_em) && dt(x.alterado_em) > env).length; if (dep && !msgs.length) msgs.push('Atenção: ' + dep + ' lançamento(s) editado(s) depois do envio.'); }
  return msgs;
}
function renderFech() {
  const ro = readOnly(), f = fech, b = $('fechBanner');
  const quem = ro ? (profile.nome || profile.email || 'O funcionário') : 'Você';
  b.className = 'fech'; b.hidden = !f;
  if (f && f.status === 'enviado') { b.classList.add('env'); b.innerHTML = '<b>Enviado para aprovação</b><span>' + esc(quem) + ' enviou este período em ' + quando(f.enviado_em) + '. Os lançamentos estão bloqueados.' + (ro ? '' : ' Se precisar alterar algo, peça ao aprovador para devolver.') + '</span>'; }
  else if (f && f.status === 'aprovado') { b.classList.add('apr'); b.innerHTML = '<b>Aprovado</b><span>Aprovado por ' + esc(f.avaliado_nome || f.avaliado_por || '') + ' em ' + quando(f.avaliado_em) + '. Os lançamentos estão bloqueados.</span>'; }
  else if (f && f.status === 'devolvido') { b.classList.add('dev'); b.innerHTML = '<b>Devolvido para correção</b><span>Por ' + esc(f.avaliado_nome || f.avaliado_por || '') + ' em ' + quando(f.avaliado_em) + (ro ? '. Aguardando o funcionário corrigir e reenviar.' : '. Faça as correções e envie de novo.') + '</span>' + (f.motivo ? '<div class="motivo">' + esc(f.motivo) + '</div>' : ''); }
  if (!ro) $('formPanel').hidden = travado();
  $('envioBox').hidden = ro || travado();
  if (!ro) { $('btnEnviar').textContent = f && f.status === 'devolvido' ? 'Reenviar ao aprovador' : 'Enviar ao aprovador'; }
  const podeAvaliar = isAprov && f && (f.status === 'enviado' || f.status === 'aprovado');
  $('avalBox').hidden = !podeAvaliar;
  if (podeAvaliar) {
    $('btnAprovar').hidden = f.status !== 'enviado';
    $('btnDevolver').textContent = f.status === 'aprovado' ? 'Reabrir para correção' : 'Devolver para correção';
    const d = divergencias(items()); $('avalAlerta').hidden = !d.length; $('avalAlerta').textContent = d.join(' ');
  }
  const h = (f && f.historico) || []; $('histBox').hidden = !h.length;
  $('histList').innerHTML = h.slice().reverse().map(x => '<li><b>' + esc({ enviado: 'Enviado', aprovado: 'Aprovado', devolvido: 'Devolvido' }[x.acao] || x.acao) + '</b> · ' + quando(x.quando) + ' · ' + esc(x.nome || x.por || '') + (x.motivo ? '<span class="m">' + esc(x.motivo) + '</span>' : '') + '</li>').join('');
}
$('btnEnviar').addEventListener('click', () => {
  const { it, tot } = totals(); $('envHint').textContent = '';
  if (!it.length) { $('envHint').textContent = 'Não há lançamentos neste período para enviar.'; return; }
  if (it.some(x => x.pendente)) { $('envHint').textContent = 'Há lançamentos aguardando internet para sincronizar. Conecte e tente de novo.'; return; }
  const sem = it.filter(x => !x.cupom).length;
  $('envTxt').innerHTML = 'Enviar o relatório da fatura <b>' + nomeFatura(curKey) + '</b> (' + it.length + ' lançamento' + (it.length > 1 ? 's' : '') + ', total <b>' + brl(tot) + '</b>) ao aprovador?<br>Depois de enviar, este período fica <b>bloqueado</b> para alterações.' +
    (sem ? '<br><span class="warn-txt"><b>Atenção:</b> ' + sem + ' lançamento' + (sem > 1 ? 's estão' : ' está') + ' sem cupom anexado.</span>' : '');
  $('envConfirm').hidden = false; $('btnEnviar').hidden = true;
});
$('btnEnvNao').addEventListener('click', () => { $('envConfirm').hidden = true; $('btnEnviar').hidden = false; });
$('btnEnvSim').addEventListener('click', async () => {
  const { it, tot } = totals(); const { start, end } = cycleRange(curKey);
  $('btnEnvSim').disabled = true;
  try {
    await Store.enviarFechamento(me.uid, curKey, { status: 'enviado', de: iso(start), ate: iso(end), total: Math.round(tot * 100) / 100, qtd: it.length, itens: fotografia(it),
      historico: [...((fech && fech.historico) || []), { acao: 'enviado', quando: new Date().toISOString(), por: me.email, nome: myProfile.nome || '' }] }, !!fech);
    $('envConfirm').hidden = true; $('btnEnviar').hidden = false; $('envHint').textContent = 'Quando terminar os lançamentos deste período, envie para aprovação.';
    if (editingId) resetForm();
  } catch (e) { $('envHint').textContent = 'Não consegui enviar: ' + errMsg(e); $('envConfirm').hidden = true; $('btnEnviar').hidden = false; }
  finally { $('btnEnvSim').disabled = false; }
});
async function avaliar(status, motivo) {
  const reg = { acao: status, quando: new Date().toISOString(), por: me.email, nome: myProfile.nome || '' }; if (motivo) reg.motivo = motivo;
  await Store.avaliarFechamento(viewUid, curKey, { status, motivo: motivo || (fech && fech.motivo) || '', avaliado_nome: myProfile.nome || me.email, historico: [...((fech && fech.historico) || []), reg] });
  atualizarPendencias();
}
$('btnAprovar').addEventListener('click', async () => {
  $('avalMsg').textContent = ''; $('btnAprovar').disabled = true;
  try { await avaliar('aprovado'); $('avalMsg').textContent = 'Aprovado.'; } catch (e) { $('avalMsg').textContent = 'Não consegui aprovar: ' + errMsg(e); }
  finally { $('btnAprovar').disabled = false; }
});
$('btnDevolver').addEventListener('click', () => { $('devMotivo').value = ''; $('devErr').textContent = ''; $('devQuem').textContent = (profile.nome || profile.email || '') + ' · fatura ' + nomeFatura(curKey); $('dlgDev').showModal(); $('devMotivo').focus(); });
$('btnDevCancel').addEventListener('click', () => $('dlgDev').close());
$('btnDevOk').addEventListener('click', async () => {
  const m = $('devMotivo').value.trim(); if (m.length < 3) { $('devErr').textContent = 'Escreva o que precisa ser corrigido.'; return; }
  $('btnDevOk').disabled = true;
  try { await avaliar('devolvido', m); $('dlgDev').close(); $('avalMsg').textContent = 'Devolvido para correção.'; } catch (e) { $('devErr').textContent = 'Não consegui devolver: ' + errMsg(e); }
  finally { $('btnDevOk').disabled = false; }
});
// ----- relatório atrasado: ciclo fechado há PRAZO_DIAS dias, com lançamentos, ainda não enviado (ou devolvido e não reenviado) -----
const PRAZO_DIAS = 5;
function atrasado(fim, hoje = new Date()) { const p = new Date(fim); p.setDate(p.getDate() + PRAZO_DIAS); const h = new Date(hoje); h.setHours(0, 0, 0, 0); return h >= p; }
let atrasos = [], verificandoAtraso = null;
function verificarAtrasos() {
  if (!me) return;
  clearTimeout(verificandoAtraso);
  verificandoAtraso = setTimeout(async () => {
    if (!me) return;
    const uid = me.uid, F = myProfile.fech || 25, k0 = cycleKeyFor(new Date(), F), lista = [];
    for (const k of [shiftKey(k0, -3), shiftKey(k0, -2), shiftKey(k0, -1)]) {
      const { start, end } = cycleRange(k, F); if (!atrasado(end)) continue;
      try {
        const ls = await Store.lancamentosPeriodo(uid, iso(start), iso(end)); if (!ls.length) continue;
        const f = await Store.lerFechamento(uid, k).catch(() => null);
        if (!f || f.status === 'devolvido') lista.push({ k, end, devolvido: !!f });
      } catch (_) {}
    }
    if (!me || me.uid !== uid) return;
    atrasos = lista; mostrarAtrasos();
  }, 400);
}
function mostrarAtrasos() {
  const bar = $('atrasoBar'); bar.hidden = !atrasos.length;
  bar.innerHTML = atrasos.map((a, i) => '<div class="linha"><span><b>Relatório atrasado: fatura ' + nomeFatura(a.k) + '</b><br>' +
    (a.devolvido ? 'Foi devolvido para correção e ainda não foi reenviado ao aprovador.' : 'O ciclo fechou em ' + br(iso(a.end)) + ' e o relatório ainda não foi enviado ao aprovador.') +
    '</span><button data-atraso="' + i + '">' + (a.devolvido ? 'Corrigir e reenviar' : 'Abrir e enviar') + '</button></div>').join('');
}
$('atrasoBar').addEventListener('click', e => { const b = e.target.closest('[data-atraso]'); if (!b) return; const a = atrasos[+b.dataset.atraso]; if (!a) return; curKey = a.k; abrirMeus(); $('envioBox').scrollIntoView({ behavior: 'smooth', block: 'center' }); });

// pendências do administrador: períodos enviados (ciclo atual e anterior de cada funcionário)
let pendencias = [];
async function atualizarPendencias() {
  if (!isAprov) return;
  try {
    const [cs, us] = await Promise.all([Store.listarConvites(), Store.listarUsuarios()]);
    const ativos = new Set(cs.filter(c => c.ativo).map(c => c.email));
    const lista = [];
    await Promise.all(us.filter(u => ativos.has((u.email || '').toLowerCase())).map(async u => {
      const k0 = cycleKeyFor(new Date(), u.fech || 25);
      for (const k of [shiftKey(k0, -1), k0]) { const f = await Store.lerFechamento(u.uid, k).catch(() => null); if (f && f.status === 'enviado') lista.push({ u, k, f }); }
    }));
    pendencias = lista.sort((a, b) => (dt(a.f.enviado_em) || 0) - (dt(b.f.enviado_em) || 0));
    $('admBadge').hidden = !pendencias.length; $('admBadge').textContent = pendencias.length;
    $('pendHint').textContent = pendencias.length ? pendencias.length + ' relatório' + (pendencias.length > 1 ? 's' : '') : '';
    $('pendList').innerHTML = pendencias.length ? pendencias.map((p, i) => '<div class="pend-row"><div><b>' + esc(p.u.nome || p.u.email) + '</b> · fatura ' + nomeFatura(p.k) + '<div class="hint">Enviado em ' + quando(p.f.enviado_em) + ' · ' + (p.f.qtd || 0) + ' lançamento(s) · ' + brl(p.f.total || 0) + '</div></div><button class="primary" data-pend="' + i + '">Avaliar</button></div>').join('')
      : '<span class="hint">Nenhum relatório aguardando aprovação.</span>';
  } catch (e) { $('pendList').innerHTML = '<span class="bad-txt">Não consegui carregar as pendências: ' + esc(errMsg(e)) + '</span>'; }
}
$('pendList').addEventListener('click', e => { const b = e.target.closest('[data-pend]'); if (!b) return; const p = pendencias[+b.dataset.pend]; if (!p) return; curKey = p.k; abrirDeOutro(p.u); });

// ======================================================================
// Meus dados
// ======================================================================
function fillProfileForm() {
  const p = myProfile; $('pNome').value = p.nome || ''; $('pCargo').value = p.cargo || ''; $('pCartao').value = p.cartao || ''; $('pEmissor').value = p.emissor || '';
  $('pEmpresa').value = p.empresa || ''; $('pLimite').value = n2(p.limite); $('pFech').value = p.fech;
}
$('pform').addEventListener('submit', e => {
  e.preventDefault();
  const lim = parseNum($('pLimite').value), f = parseInt($('pFech').value, 10);
  if (!(lim > 0)) { $('pMsg').textContent = 'Informe um limite válido, por exemplo 500,00.'; return; }
  if (!(f >= 1 && f <= 28)) { $('pMsg').textContent = 'O dia de fechamento deve ficar entre 1 e 28.'; return; }
  const fechMudou = f !== myProfile.fech;
  myProfile = { nome: $('pNome').value.trim(), cargo: $('pCargo').value.trim(), emissor: $('pEmissor').value.trim(), cartao: $('pCartao').value.replace(/\D/g, '').slice(-4),
    placa: myProfile.placa || '', empresa: $('pEmpresa').value.trim(), limite: lim, fech: f, email: me.email };
  Store.salvarPerfil(me.uid, myProfile).catch(x => $('pMsg').textContent = 'Não consegui salvar: ' + errMsg(x));
  $('whoName').textContent = myProfile.nome || me.email; $('whoEmail').textContent = myProfile.nome ? me.email : '';
  $('pMsg').textContent = 'Dados salvos.'; profile = myProfile;
  if (fechMudou) { curKey = cycleKeyFor(new Date(), f); assinar(); } else render();
});

// ======================================================================
// Comprovantes na impressão e no PDF
// ======================================================================
async function attachmentPages() {
  const out = []; const it = items();
  for (let i = 0; i < it.length; i++) {
    const x = it[i]; if (!x.cupom) continue; let imgs = [];
    try { imgs = await cupomImagens(viewUid, x); } catch (_) {}
    imgs.forEach((im, k) => out.push({ url: im.url, w: im.w, h: im.h, titulo: 'Comprovante ' + (i + 1) + (imgs.length > 1 ? ' (' + (k + 1) + '/' + imgs.length + ')' : ''),
      sub: br(x.data) + ' · ' + x.categoria + ' · ' + x.descricao + ' · ' + brl(x.valor) + (x.nf ? ' · Cupom/NF ' + x.nf : '') }));
  }
  return out;
}
function setDecl(withAtt) { const it = items(); const com = it.filter(x => x.cupom).length; DECL = withAtt && com ? DECL_BASE.replace('seguem anexos.', 'seguem anexos (' + com + ' de ' + it.length + ' lançamento' + (it.length > 1 ? 's' : '') + ').') : DECL_BASE; }
async function logoDataUrl() { if (LOGO) return LOGO; try { const r = await fetch('icons/logo.png'); LOGO = await blobToDataUrl(await r.blob()); } catch (_) { LOGO = null; } return LOGO; }
function nomeArquivo() { const [yy, mm] = curKey.split('-'); const n = (profile.nome || 'colaborador').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, ''); return 'Relatorio-Despesas-' + yy + '-' + mm + '-' + n; }
async function buildPdf(withAtt) {
  setDecl(withAtt);
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const p = profile, { it, tot, porCat } = totals(), W = 210, M = 16;
  const logo = await logoDataUrl(); if (logo) { try { doc.addImage(logo, 'PNG', M, 9, 30, 30 / 1.671); } catch (e) {} }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(58, 58, 55);
  doc.text('Relatório de Despesas', M + 36, 15.5); doc.setFontSize(10.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90);
  doc.text('Cartão Corporativo', M + 36, 21);
  doc.setDrawColor(245, 180, 0); doc.setLineWidth(1); doc.line(M, 30, W - M, 30);
  doc.setTextColor(30); doc.setFontSize(9.5);
  const meta = [['Colaborador', p.nome || ''], ['Empresa', p.empresa || '—'], ['Cargo/Depto', p.cargo || '—'], ['Cartão', cardTxt()], ['Fatura', refMonth()], ['Período', periodText()]];
  meta.forEach((r, i) => { const x = i % 2 ? W / 2 + 4 : M, y = 37 + Math.floor(i / 2) * 6; doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text(r[0] + ':', x, y); doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.text(r[1] || '________________________', x + 27, y); });
  const body = it.map((x, i) => [i + 1, br(x.data), x.categoria, x.descricao, x.nf || '—', brl(x.valor)]);
  doc.autoTable({ startY: 57, margin: { left: M, right: M }, head: [['#', 'Data', 'Categoria', 'Descrição', 'Cupom/NF', 'Valor']], body,
    foot: [['', '', 'Total', '', '', brl(tot)]], theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, lineColor: [200, 200, 200], lineWidth: .2 },
    headStyles: { fillColor: [58, 58, 55], textColor: 255 }, footStyles: { fillColor: [253, 240, 204], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 20 }, 2: { cellWidth: 32 }, 4: { cellWidth: 24 }, 5: { halign: 'right', cellWidth: 26 } } });
  let y = doc.lastAutoTable.finalY + 8;
  if (Object.keys(porCat).length > 1) { doc.setFontSize(9); doc.setTextColor(90); const cl = doc.splitTextToSize('Por categoria: ' + catResumo(porCat), W - 2 * M); doc.text(cl, M, y); y += cl.length * 4.4 + 3; }
  doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(60);
  doc.text('Limite do ciclo: ' + brl(p.limite) + '     Saldo: ' + brl(p.limite - tot) + (tot > p.limite ? ' (excedido)' : ''), M, y); y += 8;
  const lines = doc.splitTextToSize(DECL, W - 2 * M); doc.text(lines, M, y); y += lines.length * 4.6 + 6;
  if (fech && fech.status === 'aprovado') { doc.setFont('helvetica', 'bold'); doc.setTextColor(31, 122, 74); doc.text('Aprovado por ' + (fech.avaliado_nome || fech.avaliado_por || '') + ' em ' + quando(fech.avaliado_em) + '.', M, y); doc.setFont('helvetica', 'normal'); y += 8; }
  const sy = Math.max(y + 22, 250); doc.setDrawColor(40); doc.setLineWidth(.3);
  const cw = 100, sx = (W - cw) / 2;
  doc.line(sx, sy, sx + cw, sy); doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.text(p.nome || '', sx + cw / 2, sy + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setTextColor(100); doc.text('Data ____/____/______', sx + cw / 2, sy + 10, { align: 'center' });
  doc.setFontSize(7.5); doc.setTextColor(150); doc.text('Gerado em ' + new Date().toLocaleString('pt-BR') + ' · Relatório de Despesas v' + APPVER, M, 290);
  if (withAtt) {
    for (const pg of await attachmentPages()) {
      doc.addPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(58, 58, 55); doc.text(pg.titulo, M, 18);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90); doc.text(doc.splitTextToSize(pg.sub, W - 2 * M), M, 24);
      doc.setDrawColor(245, 180, 0); doc.setLineWidth(.8); doc.line(M, 29, W - M, 29);
      const mw = W - 2 * M, mh = 297 - 36 - 14; const k = Math.min(mw / pg.w, mh / pg.h); const iw = pg.w * k, ih = pg.h * k;
      doc.addImage(pg.url, 'JPEG', (W - iw) / 2, 36, iw, ih, undefined, 'FAST');
    }
  }
  setDecl(false);
  return doc;
}
$('btnPdf').addEventListener('click', async () => {
  const msg = $('pdfMsg'); if (!window.jspdf) { msg.textContent = 'Gerador de PDF não carregou. Recarregue a página.'; return; }
  msg.textContent = 'Gerando PDF…';
  try { (await buildPdf($('incAtt').checked)).save(nomeArquivo() + '.pdf'); msg.textContent = ''; } catch (e) { msg.textContent = 'Não consegui gerar o PDF: ' + errMsg(e); }
});
$('btnPrint').addEventListener('click', async () => {
  const msg = $('pdfMsg'); const inc = $('incAtt').checked; const box = $('attPages'); box.innerHTML = '';
  if (inc) {
    msg.textContent = 'Preparando comprovantes…';
    try {
      for (const pg of await attachmentPages()) {
        const d = document.createElement('section'); d.className = 'att-page';
        d.innerHTML = '<header><b></b><span></span></header><div class="img"><img alt=""></div>';
        d.querySelector('b').textContent = pg.titulo; d.querySelector('span').textContent = pg.sub; d.querySelector('img').src = pg.url; box.appendChild(d);
      }
    } catch (_) {}
    setDecl(true); const t = totals(); renderSheet(t.it, t.tot, t.porCat); msg.textContent = '';
  }
  const t = document.title; document.title = nomeArquivo();
  await new Promise(r => setTimeout(r, 80)); window.print(); document.title = t; box.innerHTML = ''; setDecl(false); render();
});
$('incAtt').addEventListener('change', () => { try { localStorage.setItem('rg.incAtt', $('incAtt').checked ? '1' : '0'); } catch (_) {} });
try { if (localStorage.getItem('rg.incAtt') === '0') $('incAtt').checked = false; } catch (_) {}

// ======================================================================
// Trazer dados do programa antigo (pasta "Relatório de Gasolina")
// ======================================================================
$('btnImp').addEventListener('click', () => $('impDir').click());
$('impDir').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = ''; const msg = $('impMsg');
  const dj = files.find(f => /(^|\/)dados\.json$/i.test(f.webkitRelativePath || f.name) && (f.webkitRelativePath || '').split('/').length <= 2);
  if (!dj) { msg.textContent = 'Não encontrei o arquivo dados.json nessa pasta. Escolha a pasta "Relatório de Gasolina".'; return; }
  const base = (dj.webkitRelativePath || '').split('/').slice(0, -1).join('/');
  const byRel = new Map(files.map(f => [(f.webkitRelativePath || f.name).slice(base ? base.length + 1 : 0), f]));
  let d; try { d = JSON.parse((await dj.text()).replace(/^﻿/, '')); } catch (_) { msg.textContent = 'O dados.json está com erro e não pôde ser lido.'; return; }
  const itens = Object.values(d.ciclos || {}).flatMap(c => c.itens || []).filter(x => /^\d{4}-\d\d-\d\d$/.test(x.data || '') && Number(x.valor) > 0);
  if (!itens.length) { msg.textContent = 'Não há lançamentos nesse dados.json.'; return; }
  // perfil: preenche só o que estiver vazio aqui
  const pf = d.perfil || {}; let mudouPerfil = false;
  for (const k of ['nome', 'cargo', 'emissor', 'cartao', 'placa', 'empresa']) if (!myProfile[k] && pf[k]) { myProfile[k] = pf[k]; mudouPerfil = true; }
  if (mudouPerfil) { Store.salvarPerfil(me.uid, { ...myProfile, email: me.email }).catch(() => {}); fillProfileForm(); }
  let n = 0, fotos = 0, falhas = 0;
  for (const x of itens) {
    msg.textContent = 'Importando ' + (++n) + ' de ' + itens.length + '…';
    const id = String(x.id || ('imp-' + x.data + '-' + n)).replace(/[\/\s]/g, '_').slice(0, 100);
    let cupom = null, thumb = null;
    const rel = x.anexo && x.anexo.arquivo; const f = rel && byRel.get(rel);
    if (f) {
      try { const a = await processarArquivo(f); cupom = { paginas: a.pages.length, tipo: a.tipo, nome: (x.anexo.nome || f.name), bytes: a.pages.reduce((s, p) => s + p.bytes.length, 0) }; thumb = a.thumb; Store.salvarCupom(me.uid, id, a.pages, 0).catch(() => {}); fotos++; }
      catch (_) { falhas++; }
    }
    Store.salvarLancamento(me.uid, id, { data: x.data, categoria: 'Combustível', descricao: String(x.posto || '').slice(0, 200) || 'Combustível', valor: Number(x.valor), nf: x.cupom_nf || '', cupom, thumb, origem: 'importado' }, true)
      .catch(er => status('Falha ao importar: ' + errMsg(er), true));
  }
  msg.textContent = itens.length + ' lançamento' + (itens.length > 1 ? 's' : '') + ' importado' + (itens.length > 1 ? 's' : '') + ', com ' + fotos + ' cupo' + (fotos === 1 ? 'm' : 'ns') + (falhas ? '. ' + falhas + ' cupom(ns) não puderam ser lidos.' : '.') + ' Use as setas do topo para ver os outros meses.';
});

// ======================================================================
// Administração
// ======================================================================
let convites = [], usuarios = [];
function abrirAdmin() {
  if (!isAprov) return;
  pararOuvir();
  viewUid = me.uid; profile = myProfile;
  $('tabMine').setAttribute('aria-selected', 'false'); $('tabAdmin').setAttribute('aria-selected', 'true');
  $('view-main').hidden = true; $('view-admin').hidden = false; $('roBanner').hidden = true;
  $('funPanel').hidden = !isMaster; $('expPanel').hidden = !isMaster; $('usoPanel').hidden = !isMaster; if (isMaster) mostrarUso();
  carregarAdmin();
}
async function carregarAdmin() {
  const [y, m] = curKey.split('-').map(Number);
  $('cycTitle').textContent = 'Fatura ' + MESES[m - 1] + '/' + y; $('cycRange').textContent = 'todos os funcionários';
  $('repBody').innerHTML = '<tr><td colspan="7" class="hint">Carregando…</td></tr>';
  try { [convites, usuarios] = await Promise.all([Store.listarConvites(), Store.listarUsuarios()]); }
  catch (e) { $('repBody').innerHTML = '<tr><td colspan="7" class="bad-txt">Não consegui carregar: ' + esc(errMsg(e)) + '</td></tr>'; return; }
  if (isMaster) renderConvites(); atualizarPendencias();
  const ativos = new Set(convites.filter(c => c.ativo).map(c => c.email));
  const lista = usuarios.filter(u => ativos.has((u.email || '').toLowerCase())).sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'));
  const linhas = await Promise.all(lista.map(async u => {
    const F = u.fech || 25; const { start, end } = cycleRange(curKey, F);
    try { const [ls, f] = await Promise.all([Store.lancamentosPeriodo(u.uid, iso(start), iso(end)), Store.lerFechamento(u.uid, curKey).catch(() => null)]); return { u, ls: ls.map(norm), f }; } catch (e) { return { u, ls: null, e }; }
  }));
  const semAcesso = convites.filter(c => c.ativo && !usuarios.some(u => (u.email || '').toLowerCase() === c.email));
  $('repHint').textContent = lista.length + ' funcionário' + (lista.length !== 1 ? 's' : '') + (semAcesso.length ? ' · ' + semAcesso.length + ' ainda não entrou' + (semAcesso.length > 1 ? 'aram' : '') : '');
  $('repBody').innerHTML = linhas.map(({ u, ls, e, f }) => {
    if (!ls) return '<tr><td>' + esc(u.nome || u.email) + '</td><td colspan="6" class="bad-txt">' + esc(errMsg(e)) + '</td></tr>';
    const tot = ls.reduce((s, x) => s + (Number(x.valor) || 0), 0); const sem = ls.filter(x => !x.cupom).length; const L = u.limite || 500;
    const sl = situacaoLimite(tot, L);
    const sit = !ls.length ? '<span class="hint">Sem lançamentos</span>' : '<span class="' + { ok: 'ok-txt', warn: 'warn-txt', over: 'bad-txt' }[sl.cls] + '">' + sl.txt + '</span>';
    return '<tr><td>' + esc(u.nome || '—') + '<div class="hint">' + esc(u.email) + '</div></td><td class="r num">' + ls.length + '</td><td class="r num">' + brl(tot) + '</td><td class="r num ' + (sem ? 'warn-txt' : '') + '">' + sem + '</td><td>' + sit + '</td><td>' + (!f && ls.length && atrasado(cycleRange(curKey, u.fech || 25).end) ? '<span class="bad-txt"><b>Atrasado</b></span><div class="hint">não enviado</div>' : envioTag(f)) + '</td><td class="r"><button class="link" data-ver="' + u.uid + '">' + (f && f.status === 'enviado' ? 'Avaliar' : 'Ver relatório') + '</button></td></tr>';
  }).join('') + semAcesso.map(c => '<tr><td>' + esc(c.nome || '—') + '<div class="hint">' + esc(c.email) + '</div></td><td colspan="5" class="hint">Ainda não fez o primeiro acesso</td><td></td></tr>').join('')
    || '<tr><td colspan="7" class="hint">Nenhum funcionário ainda. Libere o acesso no quadro abaixo.</td></tr>';
}
$('repBody').addEventListener('click', e => { const b = e.target.closest('[data-ver]'); if (!b) return; const u = usuarios.find(x => x.uid === b.dataset.ver); if (u) abrirDeOutro(u); });
function renderConvites() {
  $('funCount').textContent = convites.filter(c => c.ativo).length + ' com acesso';
  $('convBody').innerHTML = convites.sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR')).map(c => {
    const eu = c.email === me.email;
    return '<tr><td>' + esc(c.nome || '—') + '</td><td>' + esc(c.email) + '</td><td>' + (c.ativo ? '<span class="tag on">Ativo</span>' : '<span class="tag off">Desativado</span>') + (c.admin ? ' <span class="tag adm">Master</span>' : c.aprovador ? ' <span class="tag apr">Aprovador</span>' : '') + (c.trocar_senha ? ' <span class="tag" style="color:var(--amber)">Ainda não trocou a senha</span>' : '') + '</td><td class="r">' +
      (eu ? '<span class="hint">você</span>' : (c.ativo ? '<button class="link danger" data-cv="off" data-em="' + esc(c.email) + '">Desativar</button>' : '<button class="link" data-cv="on" data-em="' + esc(c.email) + '">Reativar</button>') +
        ' <select class="papel" data-papel="' + esc(c.email) + '" aria-label="Perfil de ' + esc(c.nome || c.email) + '">' + ['funcionario', 'aprovador', 'master'].map(p => '<option value="' + p + '"' + (papelDe(c) === p ? ' selected' : '') + '>' + NOME_PAPEL[p] + '</option>').join('') + '</select> ' +
        (c.conta_admin ? '' : '<button class="link" data-cv="dispensa" data-em="' + esc(c.email) + '" title="Para quem criou a própria senha e não consegue abrir o link de confirmação">Dispensar confirmação</button>')) + '</td></tr>';
  }).join('');
}
$('convBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-cv]'); if (!b) return; const c = convites.find(x => x.email === b.dataset.em); if (!c) return;
  const novo = { nome: c.nome || '', ativo: c.ativo, ...flagsDe(papelDe(c)) };
  if (b.dataset.cv === 'dispensa') novo.conta_admin = true;
  if (b.dataset.cv === 'off') novo.ativo = false; if (b.dataset.cv === 'on') novo.ativo = true;
  b.disabled = true;
  try { await Store.salvarConvite(c.email, novo); Object.assign(c, novo); renderConvites(); carregarAdmin(); } catch (x) { $('cErr').textContent = errMsg(x); b.disabled = false; }
});
$('convBody').addEventListener('change', async e => {
  const sel = e.target.closest('[data-papel]'); if (!sel) return; const c = convites.find(x => x.email === sel.dataset.papel); if (!c) return;
  const novo = { nome: c.nome || '', ativo: c.ativo, ...flagsDe(sel.value) }; sel.disabled = true; $('cErr').textContent = '';
  try { await Store.salvarConvite(c.email, novo); Object.assign(c, novo); renderConvites(); carregarAdmin(); }
  catch (x) { $('cErr').textContent = 'Não consegui mudar o perfil: ' + errMsg(x); sel.disabled = false; sel.value = papelDe(c); }
});
function senhaProvisoria() { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', l = 'abcdefghijkmnpqrstuvwxyz', d = '23456789'; const r = s => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return r(L) + r(l) + r(l) + r(l) + '-' + r(d) + r(d) + r(d) + r(d) + '-' + r(L) + r(l) + r(l); }
$('fConv').addEventListener('submit', async e => {
  e.preventDefault(); $('cErr').textContent = ''; $('cRes').hidden = true;
  const em = $('cEmail').value.trim().toLowerCase(), nome = $('cNome').value.trim(), senha = $('cSenha').value.trim(), fl = flagsDe($('cPapel').value);
  if (!/^[^\s@\/]+@[^\s@\/]+\.[^\s@\/]+$/.test(em)) { $('cErr').textContent = 'Informe um e-mail válido.'; return; }
  if (senha.length < 8) { $('cErr').textContent = 'A senha provisória precisa ter pelo menos 8 caracteres.'; return; }
  $('btnConv').disabled = true;
  try {
    await Store.salvarConvite(em, { nome, ativo: true, ...fl });
    let criada = true;
    try { await Store.criarContaFuncionario(em, senha); }
    catch (x) { if (x && x.code === 'auth/email-already-in-use') criada = false; else throw x; }
    if (criada) {
      await Store.salvarConvite(em, { nome, ativo: true, ...fl, conta_admin: true, trocar_senha: true });
      $('cRes').innerHTML = '<b class="ok-txt">Acesso criado.</b> Passe para ' + esc(nome || em) + ':<br>Site: <code>' + esc(location.origin + location.pathname) + '</code><br>E-mail: <code>' + esc(em) + '</code><br>Senha provisória: <code>' + esc(senha) + '</code><br><span class="hint">No primeiro login ele cria a senha dele.</span>';
    } else {
      $('cRes').innerHTML = '<b>Acesso liberado.</b> Essa pessoa já tinha criado uma senha, então ela entra com a senha dela. Se ela não conseguir confirmar o e-mail, use <b>Dispensar confirmação</b> na lista abaixo.';
    }
    $('cRes').hidden = false; $('fConv').reset(); $('cSenha').value = senhaProvisoria(); carregarAdmin();
  } catch (x) { $('cErr').textContent = 'Não consegui criar o acesso: ' + (x && x.code && x.code.startsWith('auth/') ? authErr(x) : errMsg(x)); }
  finally { $('btnConv').disabled = false; }
});
$('cSenha').value = senhaProvisoria();

// ---------- uso do banco (estimativa) ----------
// Cupons novos guardam o tamanho exato; os antigos usam uma média. O Firestore também conta índices,
// por isso soma-se uma folga. É uma estimativa: o número oficial fica no console do Google Cloud.
const MEDIA_FOTO = 250 * 1024, GIB = 1024 * 1024 * 1024;
const mb = b => b < 1048576 ? Math.max(1, Math.round(b / 1024)).toLocaleString('pt-BR') + ' KB' : (b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: b < 10485760 ? 1 : 0 }) + ' MB';
function mostrarUso() {
  let u = null; try { u = JSON.parse(localStorage.getItem('rg.uso') || 'null'); } catch (_) {}
  if (!u) { $('usoQuando').textContent = 'Ainda não calculado'; return; }
  const pct = u.total / GIB;
  $('usoMB').textContent = mb(u.total); $('usoFill').style.width = Math.min(100, Math.max(pct * 100, u.total ? 0.5 : 0)) + '%';
  $('usoBar').classList.toggle('warn', pct >= .7 && pct < .9); $('usoBar').classList.toggle('over', pct >= .9);
  $('usoFotos').textContent = u.fotos + ' · ' + mb(u.bytesFotos); $('usoLanc').textContent = u.lanc;
  // previsão: ritmo dos últimos 3 meses
  if (u.porMes > 0) { const meses = (GIB - u.total) / u.porMes; $('usoPrev').textContent = meses > 120 ? 'mais de 10 anos' : meses >= 24 ? 'cerca de ' + Math.round(meses / 12) + ' anos' : 'cerca de ' + Math.max(0, Math.round(meses)) + ' meses'; }
  else $('usoPrev').textContent = '—';
  $('usoQuando').textContent = 'Calculado em ' + new Date(u.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + ' · ' + (pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
}
$('btnUso').addEventListener('click', async () => {
  const msg = $('usoMsg'); $('btnUso').disabled = true; msg.textContent = 'Calculando…';
  try {
    const us = await Store.listarUsuarios(); let fotos = 0, bytesFotos = 0, lanc = 0, bytesLanc = 0, recentes = 0;
    const limite3m = new Date(); limite3m.setMonth(limite3m.getMonth() - 3); const lim = iso(limite3m);
    for (const u of us) {
      const ls = await Store.todosLancamentos(u.uid);
      for (const x of ls) {
        lanc++; const t = 600 + ((x.thumb && x.thumb.length) || 0) + JSON.stringify({ d: x.descricao || x.posto, n: x.nf }).length;
        let f = 0; if (x.cupom) { fotos += x.cupom.paginas || 1; f = x.cupom.bytes || (x.cupom.paginas || 1) * MEDIA_FOTO; bytesFotos += f; }
        bytesLanc += t; if (x.data >= lim) recentes += t + f;
      }
    }
    const total = Math.round((bytesFotos + bytesLanc + us.length * 2048) * 1.1);
    try { localStorage.setItem('rg.uso', JSON.stringify({ quando: Date.now(), total, fotos, bytesFotos, lanc, porMes: recentes * 1.1 / 3 })); } catch (_) {}
    mostrarUso(); msg.textContent = 'Estimativa feita a partir dos lançamentos. O número oficial aparece no console do Google Cloud.';
  } catch (e) { msg.textContent = 'Não consegui calcular: ' + errMsg(e); }
  finally { $('btnUso').disabled = false; }
});

// ---------- exportações ----------
function baixar(nome, conteudo, tipo) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000); }
const csvCel = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
$('btnCsv').addEventListener('click', async () => {
  const msg = $('expMsg'); msg.textContent = 'Montando planilha…';
  try {
    const us = await Store.listarUsuarios(); const linhas = [['Funcionário', 'E-mail', 'Fatura', 'Data', 'Categoria', 'Descrição', 'Valor (R$)', 'Cupom/NF', 'Comprovante anexado']];
    for (const u of us) {
      const { start, end } = cycleRange(curKey, u.fech || 25);
      const ls = (await Store.lancamentosPeriodo(u.uid, iso(start), iso(end))).map(norm).sort((a, b) => a.data.localeCompare(b.data));
      for (const x of ls) linhas.push([u.nome || '', u.email || '', curKey, br(x.data), x.categoria, x.descricao, n2(x.valor), x.nf || '', x.cupom ? 'Sim' : 'Não']);
    }
    baixar('Despesas-' + curKey + '-todos.csv', '﻿' + linhas.map(l => l.map(csvCel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
    msg.textContent = (linhas.length - 1) + ' lançamentos exportados. Abre direto no Excel.';
  } catch (e) { msg.textContent = 'Não consegui exportar: ' + errMsg(e); }
});
async function backup(comFotos) {
  const msg = $('expMsg'); msg.textContent = 'Preparando backup…';
  try {
    const out = { app: 'relatorio-despesas-web', versao: APPVER, gerado_em: new Date().toISOString(), convites: await Store.listarConvites(), usuarios: [] };
    const us = await Store.listarUsuarios(); let i = 0;
    for (const u of us) {
      msg.textContent = 'Backup: ' + (++i) + ' de ' + us.length + ' funcionários…';
      const ls = await Store.todosLancamentos(u.uid);
      const lancamentos = [];
      for (const x of ls) {
        const y = { ...x }; delete y.thumb; delete y.pendente;
        for (const k of ['criado_em', 'alterado_em']) if (y[k] && y[k].toDate) y[k] = y[k].toDate().toISOString();
        if (comFotos && x.cupom) { y.cupom_imagens = []; for (let k = 1; k <= x.cupom.paginas; k++) { const c = await Store.lerCupom(u.uid, x.id, k); if (c) y.cupom_imagens.push('data:image/jpeg;base64,' + (await blobToDataUrl(new Blob([c.bytes]))).split(',')[1]); } }
        lancamentos.push(y);
      }
      const pf = { ...u }; if (pf.alterado_em && pf.alterado_em.toDate) pf.alterado_em = pf.alterado_em.toDate().toISOString();
      out.usuarios.push({ ...pf, lancamentos });
    }
    out.convites.forEach(c => { for (const k of ['criado_em', 'alterado_em']) if (c[k] && c[k].toDate) c[k] = c[k].toDate().toISOString(); });
    baixar('backup-relatorio-despesas-' + iso(new Date()) + (comFotos ? '-com-fotos' : '') + '.json', JSON.stringify(out, null, comFotos ? 0 : 2), 'application/json');
    msg.textContent = 'Backup gerado. Guarde o arquivo em local seguro (ele contém dados dos funcionários).';
  } catch (e) { msg.textContent = 'Não consegui gerar o backup: ' + errMsg(e); }
}
$('btnBkData').addEventListener('click', () => backup(false));
$('btnBkFull').addEventListener('click', () => backup(true));

// ======================================================================
// Links que chegam por e-mail (?mode=verifyEmail|resetPassword&oobCode=...)
// ======================================================================
function tratarLinkDeEmail() {
  const q = new URLSearchParams(location.search); const mode = q.get('mode'), code = q.get('oobCode');
  if (!mode || !code) return false;
  const limpar = () => history.replaceState(null, '', location.pathname);
  authMode('action'); $('pAction').hidden = false; $('fNova').hidden = true; $('aCont').hidden = true; $('aMsg').textContent = 'Verificando o link…';
  let emailReset = '';
  $('btnAContinuar').onclick = () => { limpar(); if (emailReset) { $('lEmail').value = emailReset; } if (!loginLigado) ligarLogin(); else if (me) entrarNoSistema(me); else authMode('login'); };
  if (mode === 'verifyEmail') {
    Store.aplicarCodigo(code).then(() => { $('aMsg').innerHTML = '<span class="ok-txt"><b>E-mail confirmado!</b></span> Toque em Continuar para entrar.'; })
      .catch(e => { $('aMsg').textContent = e && e.code === 'auth/invalid-action-code' ? 'Este link já foi usado ou expirou. Se o e-mail já foi confirmado, é só continuar. Se não, entre e toque em Reenviar e-mail.' : 'Não consegui confirmar: ' + authErr(e); })
      .finally(() => { $('aCont').hidden = false; });
  } else if (mode === 'resetPassword') {
    Store.emailDoCodigoSenha(code).then(em => { emailReset = em; $('aMsg').innerHTML = 'Crie uma nova senha para <b>' + esc(em) + '</b>.'; $('fNova').hidden = false; })
      .catch(e => { $('aMsg').textContent = 'Este link já foi usado ou expirou. Volte ao login e use Esqueci a senha de novo.'; $('aCont').hidden = false; });
    $('fNova').onsubmit = async ev => {
      ev.preventDefault(); $('nErr').textContent = ''; const s1 = $('nSenha').value, s2 = $('nSenha2').value;
      if (s1.length < 8) { $('nErr').textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
      if (s1 !== s2) { $('nErr').textContent = 'As duas senhas não são iguais.'; return; }
      try { await Store.trocarSenha(code, s1); $('fNova').hidden = true; $('aMsg').innerHTML = '<span class="ok-txt"><b>Senha alterada.</b></span> Toque em Continuar e entre com a nova senha.'; $('aCont').hidden = false; }
      catch (e) { $('nErr').textContent = authErr(e); }
    };
  } else { $('aMsg').textContent = 'Link não reconhecido.'; $('aCont').hidden = false; }
  return true;
}

// ======================================================================
// Início
// ======================================================================
const cfg = window.FIREBASE_CONFIG || {};
if (!cfg.apiKey || cfg.apiKey === 'COLE_AQUI') { authMode('noconfig'); }
else {
  try { Store.iniciar(cfg); if (!tratarLinkDeEmail()) ligarLogin(); } catch (e) { authMode('noconfig'); $('pNoConfig').innerHTML = '<p class="bad-txt">Erro na configuração do Firebase: ' + esc(e.message) + '</p>'; }
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
