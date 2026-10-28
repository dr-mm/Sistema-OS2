const express = require('express');
const path = require('path');
const multer = require('multer');
const { ErroHttp, raiz } = require('./db/conexao');

const app = express();
const PORT = 3000;
const HOST = '127.0.0.1'; // só acessível neste computador

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(raiz, 'public')));
app.use('/uploads', express.static(path.join(raiz, 'uploads')));

app.use('/api', require('./rotas/catalogo'));
app.use('/api', require('./rotas/clientes'));
app.use('/api', require('./rotas/os'));
app.use('/api', require('./rotas/anexos'));
app.use('/api', require('./rotas/backup'));

// Tratamento central de erros: sempre responde JSON { erro }
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof ErroHttp) return res.status(err.status).json({ erro: err.message });
    if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Foto maior que 10 MB.' : err.message;
        return res.status(400).json({ erro: msg });
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro interno: ' + err.message });
});

app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando em: http://localhost:${PORT}`);
});
