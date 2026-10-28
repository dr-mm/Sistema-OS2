const router = require('express').Router();
const { db, ErroHttp, movimentarEstoque } = require('../db/conexao');

const ativos = 'COALESCE(ativo, 1) = 1';

router.get('/catalogo', (req, res) => {
    res.json(db.prepare(`SELECT * FROM catalogo WHERE ${ativos} ORDER BY nome ASC`).all());
});

router.post('/catalogo', (req, res) => {
    const { nome, tipo, preco, dias_garantia, estoque_atual } = req.body;
    if (!nome || !String(nome).trim()) throw new ErroHttp(400, 'Informe o nome do item.');
    const r = db.prepare(
        'INSERT INTO catalogo (nome, tipo, preco, dias_garantia, estoque_atual) VALUES (?, ?, ?, ?, ?)'
    ).run(String(nome).trim(), tipo, Number(preco) || 0, parseInt(dias_garantia) || 0,
          tipo === 'Peça' ? Math.max(0, parseInt(estoque_atual) || 0) : 0);
    res.json({ id: r.lastInsertRowid, mensagem: 'Item adicionado com sucesso!' });
});

router.put("/catalogo/:id", (req, res) => {
    const id = req.params.id;
    const { nome, tipo, preco, dias_garantia } = req.body;
    const garantia = parseInt(dias_garantia) || 0;
    const novoEstoque = tipo === 'Peça' ? Math.max(0, parseInt(req.body.estoque_atual) || 0) : 0;

    db.transaction(() => {
        const atual = db.prepare('SELECT estoque_atual FROM catalogo WHERE id = ?').get(id);
        if (!atual) throw new ErroHttp(404, 'Item não encontrado.');

        db.prepare('UPDATE catalogo SET nome = ?, tipo = ?, preco = ?, dias_garantia = ?, estoque_atual = ? WHERE id = ?')
          .run(nome, tipo, Number(preco) || 0, garantia, novoEstoque, id);

        // Ajuste manual de saldo fica registrado no histórico
        const diff = novoEstoque - (atual.estoque_atual || 0);
        if (diff !== 0) {
            db.prepare('INSERT INTO estoque_mov (catalogo_id, quantidade, motivo) VALUES (?, ?, ?)')
              .run(id, diff, 'ajuste');
        }

        // Orçamentos: acompanham preço, nome e garantia novos
        db.prepare(`UPDATE os_itens SET valor_unitario = ?, item_nome_salvo = ?, item_tipo_salvo = ?, dias_garantia_salvo = ?
                    WHERE catalogo_id = ? AND os_id IN (SELECT id FROM ordens_servico WHERE status = 'Orçamento')`)
          .run(Number(preco) || 0, nome, tipo, garantia, id);
        // Em andamento: só nome/garantia (preço acordado não muda)
        db.prepare(`UPDATE os_itens SET item_nome_salvo = ?, item_tipo_salvo = ?, dias_garantia_salvo = ?
                    WHERE catalogo_id = ? AND os_id IN (SELECT id FROM ordens_servico WHERE status = 'Em Andamento')`)
          .run(nome, tipo, garantia, id);
    })();

    res.json({ mensagem: 'Catálogo atualizado e orçamentos sincronizados com sucesso!' });
});

// Exclusão lógica: OS antigas continuam mostrando o nome do item
router.delete('/catalogo/:id', (req, res) => {
    db.prepare('UPDATE catalogo SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ mensagem: 'Item removido!' });
});

router.get('/estoque', (req, res) => {
    res.json(db.prepare(`SELECT * FROM catalogo WHERE tipo = 'Peça' AND ${ativos} ORDER BY nome ASC`).all());
});

router.post('/estoque/:id/entrada', (req, res) => {
    const quantidade = parseInt(req.body.quantidade) || 0;
    if (quantidade <= 0) throw new ErroHttp(400, 'Quantidade inválida.');
    db.transaction(() => movimentarEstoque(req.params.id, quantidade, 'entrada'))();
    res.json({ mensagem: 'Estoque reposto com sucesso!' });
});

router.get('/estoque/:id/historico', (req, res) => {
    res.json(db.prepare('SELECT * FROM estoque_mov WHERE catalogo_id = ? ORDER BY id DESC LIMIT 100').all(req.params.id));
});

module.exports = router;
