// Bússola Financeira: abre o site PUBLICADO num navegador real (Chrome sem janela) e confere, no próprio endereço,
// que a CSP está bloqueando código não autorizado, que a criptografia, o leitor de planilhas e a conferência SRI do PDF.js
// funcionam, e que nenhum recurso legítimo foi bloqueado pela política.
//   node verificar-site.mjs https://usuario.github.io/projeto/
// --no-sandbox: o executor do GitHub (Ubuntu 24.04) não permite o sandbox do Chrome; só o próprio site é aberto.
// Usa só o Node (WebSocket nativo) e o Chrome já instalado no executor do GitHub. Sem dependências externas.
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const alvo = process.argv[2];
if (!alvo || !/^https?:\/\//.test(alvo)) { console.error('Uso: node verificar-site.mjs <endereço do site>'); process.exit(2); }
const candidatos = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const chrome = candidatos.find(c => existsSync(c));
if (!chrome) { console.log('::warning::Chrome não encontrado no executor: verificação no site não executada.'); process.exit(0); }

const porta = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${porta}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'bussola-'))}`, 'about:blank'], { stdio: 'ignore' });
const espera = ms => new Promise(r => setTimeout(r, ms));
const fim = code => { try { proc.kill('SIGKILL'); } catch {} process.exit(code); };
setTimeout(() => { console.error('::error::Tempo esgotado na verificação do site.'); fim(1); }, 90000);

let versao; for (let i = 0; i < 60 && !versao; i++) { try { versao = await (await fetch(`http://127.0.0.1:${porta}/json/version`)).json(); } catch { await espera(250); } }
if (!versao) { console.error('::error::Não foi possível iniciar o Chrome.'); fim(1); }
const url = alvo + (alvo.includes('?') ? '&' : '?') + 'verificar-seguranca=1&v=' + Date.now();
const aba = await (await fetch(`http://127.0.0.1:${porta}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
const ws = new WebSocket(aba.webSocketDebuggerUrl);
await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
let id = 0; const pend = new Map(), avisos = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  if (m.method === 'Log.entryAdded') avisos.push(m.params.entry.text || '');
  if (m.method === 'Runtime.exceptionThrown') avisos.push('ERRO: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || ''));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') avisos.push((m.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
};
const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await cmd('Log.enable'); await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Page.navigate', { url });
let ds = {};
for (let i = 0; i < 120; i++) {
  await espera(500);
  const r = await cmd('Runtime.evaluate', { expression: 'JSON.stringify(document.documentElement.dataset)', returnByValue: true });
  try { ds = JSON.parse(r?.result?.value || '{}'); } catch { ds = {}; }
  if (ds.atFim === '1') break;
}
const bloqueios = avisos.filter(t => /Content Security Policy|Refused to/i.test(t) && !/unsafe-eval|EvalError|'eval'/i.test(t));
const erros = avisos.filter(t => t.startsWith('ERRO:') && !/EvalError|unsafe-eval/.test(t));
console.log('Resultado no site publicado:', JSON.stringify(ds));
const falhas = [];
for (const k of ['atApp', 'atCsp', 'atCripto', 'atXlsx', 'atArmazenamento']) if (ds[k] !== 'aprovado') falhas.push(`${k}=${ds[k] ?? 'sem resultado'}`);
// SRI do PDF.js depende de baixar os arquivos do jsDelivr: falha de rede e arquivo adulterado aparecem igual para a página,
// então vira aviso (o navegador do usuário recusa o arquivo adulterado de qualquer forma).
if (ds.atPdfSri !== 'aprovado') console.log(`::warning::Conferência SRI do PDF.js não aprovada (${ds.atPdfSri ?? 'sem resultado'}): CDN indisponível ou arquivo diferente do publicado no npm.`);
if (bloqueios.length) falhas.push('recursos legítimos bloqueados pela CSP: ' + bloqueios.slice(0, 3).join(' | '));
if (erros.length) falhas.push('erros de script: ' + erros.slice(0, 3).join(' | '));
if (falhas.length) { console.error('::error::Verificação no site publicado falhou: ' + falhas.join('; ')); fim(1); }
console.log(`Site publicado: CSP efetiva, criptografia, leitor de planilhas e armazenamento aprovados${ds.atPdfSri === 'aprovado' ? ', SRI do PDF.js conferido' : ''}; nenhum recurso legítimo bloqueado.`);
fim(0);
