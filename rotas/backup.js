const router = require('express').Router();
const archiver = require('archiver');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { db, raiz } = require('../db/conexao');

// Gera uma cópia consistente do banco (mesmo com o sistema em uso) e zipa junto com as fotos
router.get('/backup', async (req, res, next) => {
    const copia = path.join(os.tmpdir(), `banco-backup-${Date.now()}.sqlite`);
    try {
        await db.backup(copia);
    } catch (e) { return next(e); }

    const limpar = () => fs.unlink(copia, () => {});
    const hoje = new Date().toISOString().slice(0, 10);
    res.attachment(`backup-sistema-os-${hoje}.zip`);

    const zip = archiver('zip', { zlib: { level: 9 } });
    zip.on('error', (err) => { limpar(); next(err); });
    res.on('close', limpar);
    zip.pipe(res);
    zip.file(copia, { name: 'banco.sqlite' });
    const uploads = path.join(raiz, 'uploads');
    if (fs.existsSync(uploads)) zip.directory(uploads, 'uploads');
    zip.finalize();
});

module.exports = router;
