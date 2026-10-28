const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { db, ErroHttp, movimentarEstoque, raiz } = require('../db/conexao');

const STATUS_VALIDOS = ['Orçamento', 'Em Andamento', 'Concluída'];

const SELECT_OS = `
    SELECT os.*,
           COALESCE(os.cliente_nome_salvo, c.nome, 'Cliente Não Identificado') AS cliente_nome,
           COALESCE(os.cliente_telefone_salvo, c.telefone, '') AS cliente_telefone,
           c.email AS cliente_email,
           COALESCE(os.cliente_endereco_salvo, c.endereco, '') AS cliente_endereco
    FROM ordens_servico os
    LEFT JOIN clientes c ON os.cliente_id = c.id`;

router.get('/os', (req, res) => {
    res.json(db.prepare(`${SELECT_OS} ORDER BY os.id DESC`).all());
});

router.get('/os/:id', (req, res) => {
    const os = db.prepare(`${SELECT_OS} WHERE os.id = ?`).get(req.params.id);
    if (!os) throw new ErroHttp(404, 'OS não encontrada.');
    const itens = db.prepare(`
        SELECT oi.*,
               COALESCE(oi.item_nome_salvo, cat.nome, 'Item Removido') AS item_nome,
               COALESCE(oi.item_tipo_salvo, cat.tipo, 'Serviço') AS item_tipo,
               COALESCE(oi.dias_garantia_salvo, cat.dias_garantia, 0) AS dias_garantia
        FROM os_itens oi LEFT JOIN catalogo cat ON oi.catalogo_id = cat.id
        WHERE oi.os_id = ?`).all(req.params.id);
    res.json({ ...os, itens });
});

// Cria a OS, os itens e a baixa de estoque numa única transação
router.post('/os', (req, res) => {
    const b = req.body;
    if (!b.defeito_relatado || !String(b.defeito_relatado).trim()) throw new ErroHttp(400, 'Informe o defeito relatado.');
    if (!b.data_entrada) throw new ErroHttp(400, 'Informe a data de entrada.');

    const osId = db.transaction(() => {
        const cli = db.prepare('SELECT * FROM clientes WHERE id = ?').get(b.cliente_id);
        const r = db.prepare(`
            INSERT INTO ordens_servico (cliente_id, cliente_nome_salvo, cliente_telefone_salvo, cliente_endereco_salvo,
                dispositivo_tipo, dispositivo_modelo, dispositivo_serial, data_entrada, previsao_entrega,
                defeito_relatado, laudo_tecnico, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Orçamento')`).run(
            b.cliente_id || null,
            b.cliente_nome || (cli ? cli.nome : 'Cliente Não Informado'),
            b.cliente_telefone || (cli ? cli.telefone : ''),
            b.cliente_endereco || (cli ? cli.endereco : ''),
            b.dispositivo_tipo || 'Outros', b.dispositivo_modelo || '', b.dispositivo_serial || '',
            b.data_entrada, b.previsao_entrega || null, b.defeito_relatado, b.laudo_tecnico || '');
        const id = Number(r.lastInsertRowid);

        const inserirItem = db.prepare(`
            INSERT INTO os_itens (os_id, catalogo_id, item_nome_salvo, item_tipo_salvo, dias_garantia_salvo, quantidade, valor_unitario)
            VALUES (?, ?, ?, ?, ?, ?, ?)`);

        for (const item of b.itens || []) {
            const qtd = parseInt(item.quantidade) || 0;
            if (qtd <= 0) throw new ErroHttp(400, 'Quantidade inválida em um dos itens.');
            // Nome, tipo e garantia vêm do catálogo (não confiamos no que o navegador mandou)
            const cat = db.prepare('SELECT * FROM catalogo WHERE id = ?').get(item.catalogo_id);
            if (!cat) throw new ErroHttp(400, 'Item do catálogo não encontrado.');
            inserirItem.run(id, cat.id, cat.nome, cat.tipo, cat.dias_garantia || 0, qtd, Number(item.valor_unitario) || 0);
            if (cat.tipo === 'Peça') movimentarEstoque(cat.id, -qtd, 'os', id);
        }
        return id;
    })();

    res.json({ id: osId, mensagem: 'Ordem de Serviço criada com sucesso!' });
});

router.put('/os/:id', (req, res) => {
    const b = req.body;
    const r = db.prepare(`
        UPDATE ordens_servico SET cliente_nome_salvo = ?, cliente_telefone_salvo = ?, cliente_endereco_salvo = ?,
            dispositivo_tipo = ?, dispositivo_modelo = ?, dispositivo_serial = ?,
            defeito_relatado = ?, laudo_tecnico = ?, previsao_entrega = ?
        WHERE id = ?`).run(
        b.cliente_nome_salvo, b.cliente_telefone_salvo, b.cliente_endereco_salvo,
        b.dispositivo_tipo, b.dispositivo_modelo, b.dispositivo_serial,
        b.defeito_relatado, b.laudo_tecnico, b.previsao_entrega || null, req.params.id);
    if (r.changes === 0) throw new ErroHttp(404, 'OS não encontrada.');
    res.json({ mensagem: 'OS atualizada com sucesso!' });
});

router.patch('/os/:id/status', (req, res) => {
    const { status, data_conclusao } = req.body;
    if (!STATUS_VALIDOS.includes(status)) throw new ErroHttp(400, 'Status inválido.');
    db.prepare('UPDATE ordens_servico SET status = ?, data_conclusao = ? WHERE id = ?')
      .run(status, status === 'Concluída' ? (data_conclusao || null) : null, req.params.id);
    res.json({ mensagem: 'Status atualizado com sucesso!' });
});

// Exclui a OS, devolve as peças ao estoque e apaga as fotos
router.delete('/os/:id', (req, res) => {
    const osId = req.params.id;
    let arquivos = [];

    db.transaction(() => {
        const itens = db.prepare(`
            SELECT oi.catalogo_id, oi.quantidade, oi.item_tipo_salvo, cat.tipo
            FROM os_itens oi LEFT JOIN catalogo cat ON cat.id = oi.catalogo_id WHERE oi.os_id = ?`).all(osId);
        for (const it of itens) {
            if ((it.item_tipo_salvo === 'Peça' || it.tipo === 'Peça') && it.catalogo_id) {
                movimentarEstoque(it.catalogo_id, it.quantidade, 'os-excluida', Number(osId));
            }
        }
        arquivos = db.prepare('SELECT caminho_arquivo FROM anexos WHERE os_id = ?').all(osId).map(a => a.caminho_arquivo);
        db.prepare('DELETE FROM anexos WHERE os_id = ?').run(osId);
        db.prepare('DELETE FROM os_itens WHERE os_id = ?').run(osId);
        const r = db.prepare('DELETE FROM ordens_servico WHERE id = ?').run(osId);
        if (r.changes === 0) throw new ErroHttp(404, 'OS não encontrada.');
    })();

    // Arquivos só são apagados depois que o banco confirmou
    for (const caminho of arquivos) {
        try { fs.unlinkSync(path.join(raiz, caminho.replace(/^\/+/, ''))); }
        catch (e) { if (e.code !== 'ENOENT') console.error('Aviso ao apagar arquivo:', e.message); }
    }
    res.json({ mensagem: 'Ordem de Serviço excluída e peças devolvidas ao estoque!' });
});

module.exports = router;
