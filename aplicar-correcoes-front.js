// Aplica correções de segurança no public/index.html (XSS, botões com JSON no onclick, erro ao salvar OS).
// Uso: node aplicar-correcoes-front.js   (faz cópia em index.html.bak antes)
const fs = require('fs');
const arq = 'public/index.html';
if (!fs.existsSync(arq)) { console.error('Não achei ' + arq + '. Rode dentro da pasta do sistema.'); process.exit(1); }

let html = fs.readFileSync(arq, 'utf8');
if (html.includes('function esc(')) { console.log('As correções já foram aplicadas.'); process.exit(0); }
fs.writeFileSync(arq + '.bak', html);

// "§{" vira "${" (evita interpolação aqui dentro)
const D = s => s.replace(/§\{/g, '${');
const P = [
[String.raw`let catalogoGlobal = [];`,
 String.raw`function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
        let pecasGlobal = [];
        let catalogoGlobal = [];`],
// catálogo
[`<td><strong>§{item.nome}</strong></td>`, `<td><strong>§{esc(item.nome)}</strong></td>`],
[`onclick='abrirModalEditarCatalogo(§{JSON.stringify(item)})'`, `onclick="abrirModalEditarCatalogo(§{item.id})"`],
[`function abrirModalEditarCatalogo(item) {`, `function abrirModalEditarCatalogo(id) {\n            const item = catalogoGlobal.find(i => i.id == id); if (!item) return;`],
// estoque
[`const pecas = await res.json();`, `const pecas = await res.json();\n            pecasGlobal = pecas;`],
[`<td><strong>§{p.nome}</strong></td>`, `<td><strong>§{esc(p.nome)}</strong></td>`],
[String.raw`onclick="abrirModalEntradaEstoque(§{p.id}, '§{p.nome.replace(/'/g, "\\'")}', §{p.estoque_atual})"`, `onclick="abrirModalEntradaEstoque(§{p.id})"`],
[`function abrirModalEntradaEstoque(id, nome, estoqueAtual) {`, `function abrirModalEntradaEstoque(id) {\n            const p = pecasGlobal.find(x => x.id == id); if (!p) return;\n            const nome = p.nome, estoqueAtual = p.estoque_atual;`],
// clientes
[`<td><strong>§{c.nome}</strong></td>`, `<td><strong>§{esc(c.nome)}</strong></td>`],
[`<td>§{c.telefone || '-'}</td>`, `<td>§{esc(c.telefone || '-')}</td>`],
[`<td>§{c.endereco || '-'}</td>`, `<td>§{esc(c.endereco || '-')}</td>`],
[`onclick='abrirModalEditarCliente(§{JSON.stringify(c)})'`, `onclick="abrirModalEditarCliente(§{c.id})"`],
[String.raw`onclick="deletarCliente(§{c.id}, '§{c.nome.replace(/'/g, "\\'")}')"`, `onclick="deletarCliente(§{c.id})"`],
[`function abrirModalEditarCliente(c) {`, `function abrirModalEditarCliente(id) {\n            const c = clientesGlobal.find(x => x.id == id); if (!c) return;`],
[`async function deletarCliente(id, nome) {`, `async function deletarCliente(id) {\n            const nome = (clientesGlobal.find(x => x.id == id) || {}).nome || 'este cliente';`],
// nova OS
[`">§{c.nome}</option>`, `">§{esc(c.nome)}</option>`],
[`data-nome="§{item.nome}"`, `data-nome="§{esc(item.nome)}"`],
[`§{item.nome} - R$ §{Number(item.preco).toFixed(2)}§{infoEstoque}`, `§{esc(item.nome)} - R$ §{Number(item.preco).toFixed(2)}§{infoEstoque}`],
[`<strong>§{g.item_nome}</strong>`, `<strong>§{esc(g.item_nome)}</strong>`],
[`await fetch('/api/os', {`, `const respOS = await fetch('/api/os', {`],
[`alert('Ordem de Serviço criada com sucesso!');`, `if (!respOS.ok) {\n                const e = await respOS.json().catch(() => ({}));\n                alert('Não foi possível salvar: ' + (e.erro || respOS.status));\n                return;\n            }\n            alert('Ordem de Serviço criada com sucesso!');`],
// painel
[`<td>§{os.cliente_nome}</td>`, `<td>§{esc(os.cliente_nome)}</td>`],
[`<strong>§{detalheDisp}</strong>`, `<strong>§{esc(detalheDisp)}</strong>`],
[`SN: §{os.dispositivo_serial}`, `SN: §{esc(os.dispositivo_serial)}`],
[`<td>§{os.defeito_relatado}</td>`, `<td>§{esc(os.defeito_relatado)}</td>`],
// impressão
[`<p><strong>Nome:</strong> §{os.cliente_nome}</p>`, `<p><strong>Nome:</strong> §{esc(os.cliente_nome)}</p>`],
[`<p><strong>Telefone:</strong> §{os.cliente_telefone || '-'}</p>`, `<p><strong>Telefone:</strong> §{esc(os.cliente_telefone || '-')}</p>`],
[`<p><strong>Endereço:</strong> §{os.cliente_endereco || '-'}</p>`, `<p><strong>Endereço:</strong> §{esc(os.cliente_endereco || '-')}</p>`],
[`<p><strong>Tipo:</strong> §{os.dispositivo_tipo || '-'}</p>`, `<p><strong>Tipo:</strong> §{esc(os.dispositivo_tipo || '-')}</p>`],
[`<p><strong>Modelo:</strong> §{os.dispositivo_modelo || '-'}</p>`, `<p><strong>Modelo:</strong> §{esc(os.dispositivo_modelo || '-')}</p>`],
[`<p><strong>Nº de Série/IMEI:</strong> §{os.dispositivo_serial || '-'}</p>`, `<p><strong>Nº de Série/IMEI:</strong> §{esc(os.dispositivo_serial || '-')}</p>`],
[`<p><strong>Defeito:</strong> §{os.defeito_relatado}</p>`, `<p><strong>Defeito:</strong> §{esc(os.defeito_relatado)}</p>`],
[`<p><strong>Laudo:</strong> §{os.laudo_tecnico || 'Nenhum laudo registrado.'}</p>`, `<p><strong>Laudo:</strong> §{esc(os.laudo_tecnico || 'Nenhum laudo registrado.')}</p>`],
[`<td>§{item.item_nome} <small`, `<td>§{esc(item.item_nome)} <small`],
];

let ok = 0, falhas = [];
for (const [a, b] of P) {
  const velho = D(a), novo = D(b);
  if (!html.includes(velho)) { falhas.push(velho.slice(0, 70)); continue; }
  html = html.split(velho).join(novo); ok++;
}
fs.writeFileSync(arq, html);
console.log(`${ok} de ${P.length} correções aplicadas. Backup em ${arq}.bak`);
if (falhas.length) { console.log('Não encontrados (talvez já alterados):'); falhas.forEach(f => console.log(' - ' + f)); }
