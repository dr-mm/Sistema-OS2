const Database = require('better-sqlite3');
const path = require('path');

const raiz = path.join(__dirname, '..');
const db = new Database(path.join(raiz, 'banco.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Garante que a coluna existe (compatível com bancos antigos)
function garantirColuna(tabela, coluna, definicao) {
    const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name);
    if (!colunas.includes(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}

function migrar() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL, telefone TEXT, email TEXT, endereco TEXT
        );
        CREATE TABLE IF NOT EXISTS catalogo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL, tipo TEXT, preco REAL, dias_garantia INTEGER
        );
        CREATE TABLE IF NOT EXISTS ordens_servico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER, status TEXT DEFAULT 'Orçamento',
            data_entrada TEXT, previsao_entrega TEXT, data_conclusao TEXT,
            defeito_relatado TEXT, laudo_tecnico TEXT,
            FOREIGN KEY(cliente_id) REFERENCES clientes(id)
        );
        CREATE TABLE IF NOT EXISTS os_itens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            os_id INTEGER, catalogo_id INTEGER, quantidade INTEGER, valor_unitario REAL,
            FOREIGN KEY(os_id) REFERENCES ordens_servico(id),
            FOREIGN KEY(catalogo_id) REFERENCES catalogo(id)
        );
        CREATE TABLE IF NOT EXISTS anexos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            os_id INTEGER, caminho_arquivo TEXT,
            FOREIGN KEY(os_id) REFERENCES ordens_servico(id)
        );
        CREATE TABLE IF NOT EXISTS estoque_mov (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            catalogo_id INTEGER NOT NULL,
            quantidade INTEGER NOT NULL,
            motivo TEXT NOT NULL,
            os_id INTEGER,
            data TEXT DEFAULT (datetime('now','localtime'))
        );
    `);

    garantirColuna('clientes', 'ativo', 'INTEGER DEFAULT 1');
    garantirColuna('catalogo', 'estoque_atual', 'INTEGER DEFAULT 0');
    garantirColuna('catalogo', 'ativo', 'INTEGER DEFAULT 1');
    for (const c of ['cliente_nome_salvo', 'cliente_telefone_salvo', 'cliente_endereco_salvo',
                     'dispositivo_tipo', 'dispositivo_modelo', 'dispositivo_serial']) {
        garantirColuna('ordens_servico', c, 'TEXT');
    }
    garantirColuna('os_itens', 'item_nome_salvo', 'TEXT');
    garantirColuna('os_itens', 'item_tipo_salvo', 'TEXT');
    garantirColuna('os_itens', 'dias_garantia_salvo', 'INTEGER DEFAULT 0');

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_os_cliente ON ordens_servico(cliente_id);
        CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico(status);
        CREATE INDEX IF NOT EXISTS idx_itens_os ON os_itens(os_id);
        CREATE INDEX IF NOT EXISTS idx_itens_cat ON os_itens(catalogo_id);
        CREATE INDEX IF NOT EXISTS idx_anexos_os ON anexos(os_id);
        CREATE INDEX IF NOT EXISTS idx_mov_cat ON estoque_mov(catalogo_id);
    `);
}

migrar();

// Erro com código HTTP, tratado no middleware do server.js
class ErroHttp extends Error {
    constructor(status, mensagem) { super(mensagem); this.status = status; }
}

// Movimenta o estoque de uma peça e registra o histórico.
// delta < 0 = saída (bloqueia se faltar saldo); delta > 0 = entrada.
function movimentarEstoque(catalogoId, delta, motivo, osId = null) {
    if (!catalogoId || !delta) return;
    if (delta < 0) {
        const r = db.prepare(
            `UPDATE catalogo SET estoque_atual = estoque_atual + ? WHERE id = ? AND tipo = 'Peça' AND estoque_atual >= ?`
        ).run(delta, catalogoId, -delta);
        if (r.changes === 0) {
            const item = db.prepare('SELECT nome, estoque_atual FROM catalogo WHERE id = ?').get(catalogoId);
            throw new ErroHttp(400, item
                ? `Estoque insuficiente de "${item.nome}" (disponível: ${item.estoque_atual}).`
                : 'Item do catálogo não encontrado.');
        }
    } else {
        db.prepare(`UPDATE catalogo SET estoque_atual = estoque_atual + ? WHERE id = ?`).run(delta, catalogoId);
    }
    db.prepare('INSERT INTO estoque_mov (catalogo_id, quantidade, motivo, os_id) VALUES (?, ?, ?, ?)')
      .run(catalogoId, delta, motivo, osId);
}

module.exports = { db, ErroHttp, movimentarEstoque, raiz };
