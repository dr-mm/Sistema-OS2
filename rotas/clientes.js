const router = require('express').Router();
const { db, ErroHttp } = require('../db/conexao');

router.get('/clientes', (req, res) => {
    res.json(db.prepare('SELECT * FROM clientes WHERE COALESCE(ativo, 1) = 1 ORDER BY nome ASC').all());
});

router.post('/clientes', (req, res) => {
    const { nome, telefone, email, endereco } = req.body;
    if (!nome || !String(nome).trim()) throw new ErroHttp(400, 'Informe o nome do cliente.');
    const r = db.prepare('INSERT INTO clientes (nome, telefone, email, endereco, ativo) VALUES (?, ?, ?, ?, 1)')
                .run(String(nome).trim(), telefone, email, endereco);
    res.json({ id: r.lastInsertRowid, mensagem: 'Cliente cadastrado com sucesso!' });
});

router.put('/clientes/:id', (req, res) => {
    const { nome, telefone, email, endereco } = req.body;
    const id = req.params.id;
    db.transaction(() => {
        db.prepare('UPDATE clientes SET nome = ?, telefone = ?, email = ?, endereco = ? WHERE id = ?')
          .run(nome, telefone, email, endereco, id);
        // OS não concluídas acompanham os dados novos do cliente
        db.prepare(`UPDATE ordens_servico SET cliente_nome_salvo = ?, cliente_telefone_salvo = ?, cliente_endereco_salvo = ?
                    WHERE cliente_id = ? AND status != 'Concluída'`)
          .run(nome, telefone, endereco, id);
    })();
    res.json({ mensagem: 'Cliente atualizado e ordens em aberto sincronizadas com sucesso!' });
});

router.delete('/clientes/:id', (req, res) => {
    db.prepare('UPDATE clientes SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ mensagem: 'Cliente removido das listagens!' });
});

// Garantias ainda ativas do cliente
router.get('/clientes/:id/garantias', (req, res) => {
    const rows = db.prepare(`
        SELECT os.id AS os_id,
               COALESCE(os.data_conclusao, os.data_entrada) AS data_referencia,
               COALESCE(oi.item_nome_salvo, cat.nome) AS item_nome,
               COALESCE(oi.dias_garantia_salvo, cat.dias_garantia, 0) AS dias_garantia
        FROM ordens_servico os
        JOIN os_itens oi ON oi.os_id = os.id
        LEFT JOIN catalogo cat ON cat.id = oi.catalogo_id
        WHERE os.cliente_id = ? AND COALESCE(oi.dias_garantia_salvo, cat.dias_garantia, 0) > 0
        ORDER BY os.id DESC`).all(req.params.id);

    const hoje = new Date();
    const ativas = [];
    for (const item of rows) {
        if (!item.data_referencia) continue;
        const base = new Date(item.data_referencia + 'T00:00:00');
        const dias_restantes = item.dias_garantia - Math.floor((hoje - base) / 86400000);
        if (dias_restantes >= 0) ativas.push({ ...item, dias_restantes });
    }
    res.json(ativas);
});

module.exports = router;
