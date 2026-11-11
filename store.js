// Camada de dados: tudo que fala com o Firebase fica aqui.
// Estrutura no Firestore:
//   convites/{email}                         { nome, ativo, admin }
//   usuarios/{uid}                           perfil { nome, cargo, emissor, cartao, placa, empresa, limite, fech, email }
//   usuarios/{uid}/lancamentos/{id}          { data:'AAAA-MM-DD', categoria, descricao, valor, nf, cupom:{paginas,tipo,nome}|null, thumb }
//   usuarios/{uid}/cupons/{id}_{n}           { img: Bytes(JPEG), w, h, lancamento }
(function () {
  'use strict';
  let auth = null, db = null, FV = null;

  const Store = {
    pronto: false,
    iniciar(config) {
      firebase.initializeApp(config);
      auth = firebase.auth();
      auth.languageCode = 'pt';
      db = firebase.firestore();
      FV = firebase.firestore.FieldValue;
      // guarda os dados no aparelho: funciona sem internet e sincroniza depois
      // usado só em testes locais (emulador do Firebase)
      if (config.emulador) { auth.useEmulator(config.emulador.auth); db.useEmulator(config.emulador.dbHost, config.emulador.dbPort); }
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      this.pronto = true;
    },

    // ---------- login ----------
    aoMudarLogin(cb) { return auth.onAuthStateChanged(u => cb(u ? { uid: u.uid, email: (u.email || '').toLowerCase(), verificado: u.emailVerified } : null)); },
    async entrar(email, senha) { await auth.signInWithEmailAndPassword(email.trim(), senha); },
    async criarConta(email, senha) {
      const c = await auth.createUserWithEmailAndPassword(email.trim(), senha);
      await c.user.sendEmailVerification();
    },
    async reenviarConfirmacao() { if (auth.currentUser) await auth.currentUser.sendEmailVerification(); },
    // depois que a pessoa clica no link do e-mail: atualiza o cadastro e o "crachá" de acesso
    async confirmarVerificacao() {
      const u = auth.currentUser; if (!u) return false;
      await u.reload();
      if (!auth.currentUser.emailVerified) return false;
      await auth.currentUser.getIdToken(true);
      return true;
    },
    async esqueciSenha(email) { await auth.sendPasswordResetEmail(email.trim()); },
    // links dos e-mails (confirmação e nova senha) tratados pelo próprio site
    async aplicarCodigo(codigo) { await auth.applyActionCode(codigo); },
    async emailDoCodigoSenha(codigo) { return await auth.verifyPasswordResetCode(codigo); },
    async trocarSenha(codigo, senha) { await auth.confirmPasswordReset(codigo, senha); },
    async sair() { await auth.signOut(); },

    // ---------- convites ----------
    async meuConvite(email) {
      try { const d = await db.collection('convites').doc(email.toLowerCase()).get(); return d.exists ? d.data() : null; }
      catch (e) { if (e.code === 'permission-denied') return null; throw e; }
    },
    async listarConvites() { const s = await db.collection('convites').get(); return s.docs.map(d => ({ email: d.id, ...d.data() })); },
    async salvarConvite(email, dados) {
      await db.collection('convites').doc(email.trim().toLowerCase()).set({ nome: dados.nome || '', ativo: !!dados.ativo, admin: !!dados.admin, alterado_em: FV.serverTimestamp() }, { merge: true });
    },
    async excluirConvite(email) { await db.collection('convites').doc(email.toLowerCase()).delete(); },

    // ---------- perfil ----------
    async perfil(uid) { const d = await db.collection('usuarios').doc(uid).get(); return d.exists ? d.data() : null; },
    salvarPerfil(uid, p) {
      const dados = { nome: p.nome || '', cargo: p.cargo || '', emissor: p.emissor || '', cartao: p.cartao || '', placa: p.placa || '', empresa: p.empresa || '',
        limite: Number(p.limite) || 500, fech: Math.round(Number(p.fech) || 25), email: (p.email || '').toLowerCase(), alterado_em: FV.serverTimestamp() };
      return db.collection('usuarios').doc(uid).set(dados);
    },
    async listarUsuarios() { const s = await db.collection('usuarios').get(); return s.docs.map(d => ({ uid: d.id, ...d.data() })); },

    // ---------- lançamentos ----------
    novoId(uid) { return db.collection('usuarios').doc(uid).collection('lancamentos').doc().id; },
    ouvirLancamentos(uid, de, ate, cb, erro) {
      return db.collection('usuarios').doc(uid).collection('lancamentos').where('data', '>=', de).where('data', '<=', ate)
        .onSnapshot({ includeMetadataChanges: true },
          s => cb(s.docs.map(d => ({ id: d.id, ...d.data(), pendente: d.metadata.hasPendingWrites })), s.metadata.fromCache),
          e => erro && erro(e));
    },
    async lancamentosPeriodo(uid, de, ate) {
      const s = await db.collection('usuarios').doc(uid).collection('lancamentos').where('data', '>=', de).where('data', '<=', ate).get();
      return s.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    async todosLancamentos(uid) { const s = await db.collection('usuarios').doc(uid).collection('lancamentos').get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); },
    // não espera o servidor: sem internet, fica guardado e sobe sozinho depois
    salvarLancamento(uid, id, x, novo) {
      const dados = { data: x.data, categoria: x.categoria || 'Outros', descricao: x.descricao, valor: Number(x.valor), nf: x.nf || '',
        cupom: x.cupom || null, thumb: x.thumb || null, origem: x.origem || 'web', alterado_em: FV.serverTimestamp() };
      if (novo) dados.criado_em = FV.serverTimestamp();
      return db.collection('usuarios').doc(uid).collection('lancamentos').doc(id).set(dados, { merge: true });
    },
    excluirLancamento(uid, id, paginas) {
      const u = db.collection('usuarios').doc(uid);
      const b = db.batch();
      b.delete(u.collection('lancamentos').doc(id));
      for (let k = 1; k <= (paginas || 0); k++) b.delete(u.collection('cupons').doc(id + '_' + k));
      return b.commit();
    },

    // ---------- cupons (foto guardada no próprio banco, até ~900 KB por página) ----------
    salvarCupom(uid, id, paginas, antigas) {
      const u = db.collection('usuarios').doc(uid);
      const ops = paginas.map((p, i) => u.collection('cupons').doc(id + '_' + (i + 1)).set({ img: firebase.firestore.Blob.fromUint8Array(p.bytes), w: p.w, h: p.h, lancamento: id }));
      for (let k = paginas.length + 1; k <= (antigas || 0); k++) ops.push(u.collection('cupons').doc(id + '_' + k).delete());
      return Promise.all(ops);
    },
    excluirCupom(uid, id, paginas) {
      const u = db.collection('usuarios').doc(uid); const ops = [];
      for (let k = 1; k <= (paginas || 0); k++) ops.push(u.collection('cupons').doc(id + '_' + k).delete());
      return Promise.all(ops);
    },
    async lerCupom(uid, id, k) {
      const d = await db.collection('usuarios').doc(uid).collection('cupons').doc(id + '_' + k).get();
      if (!d.exists) return null; const v = d.data();
      return { bytes: v.img.toUint8Array(), w: v.w, h: v.h };
    }
  };
  window.Store = Store;
})();
