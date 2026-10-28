const router = require('express').Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { db, ErroHttp, raiz } = require('../db/conexao');

const pastaUploads = path.join(raiz, 'uploads');
fs.mkdirSync(pastaUploads, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, pastaUploads),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) =>
        file.mimetype.startsWith('image/') ? cb(null, true) : cb(new ErroHttp(400, 'Envie apenas imagens.'))
});

router.get('/os/:id/anexos', (req, res) => {
    res.json(db.prepare('SELECT * FROM anexos WHERE os_id = ? ORDER BY id DESC').all(req.params.id));
});

router.post('/os/:id/anexos', upload.single('foto'), (req, res) => {
    if (!req.file) throw new ErroHttp(400, 'Nenhuma foto enviada.');
    if (!db.prepare('SELECT 1 FROM ordens_servico WHERE id = ?').get(req.params.id)) {
        fs.unlink(req.file.path, () => {});
        throw new ErroHttp(404, 'OS não encontrada.');
    }
    const caminho = `/uploads/${req.file.filename}`;
    const r = db.prepare('INSERT INTO anexos (os_id, caminho_arquivo) VALUES (?, ?)').run(req.params.id, caminho);
    res.json({ id: r.lastInsertRowid, caminho_arquivo: caminho, mensagem: 'Foto anexada com sucesso!' });
});

router.delete('/anexos/:id', (req, res) => {
    const anexo = db.prepare('SELECT * FROM anexos WHERE id = ?').get(req.params.id);
    if (!anexo) throw new ErroHttp(404, 'Anexo não encontrado.');
    db.prepare('DELETE FROM anexos WHERE id = ?').run(anexo.id);
    try { fs.unlinkSync(path.join(raiz, anexo.caminho_arquivo.replace(/^\/+/, ''))); }
    catch (e) { if (e.code !== 'ENOENT') console.error('Aviso ao apagar arquivo:', e.message); }
    res.json({ mensagem: 'Foto removida com sucesso!' });
});

module.exports = router;
