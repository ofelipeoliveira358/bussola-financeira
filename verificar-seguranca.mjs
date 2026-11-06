// Bússola Financeira: verificações de segurança do que vai ser publicado.
// Roda no GitHub Actions antes de publicar; se algo falhar, nada é publicado.
//   node verificar-seguranca.mjs            → só verifica
//   node verificar-seguranca.mjs --corrigir → recalcula os hashes da CSP no index.html (uso local, depois de editar o código)
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const HTML = process.env.HTML_ARQ || 'index.html';
const CEN = process.env.CENARIO_ARQ || 'cenario.json';

/* ---------- CSP: hashes dos scripts embutidos que executam ---------- */
// Scripts com type="application/json" (dados do Cenário) não executam e não entram na CSP.
export function scriptsExecutaveis(html) {
  const out = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1] || '';
    if (/\bsrc=/.test(attrs) || /type="application\/json"/.test(attrs) || /id="seg-boot"/.test(attrs)) continue;
    out.push(m[2]);
  }
  return out;
}
export const sha256b64 = t => 'sha256-' + createHash('sha256').update(t, 'utf8').digest('base64');
export function hashesCSP(html) {
  const m = html.match(/<script id="seg-boot">[\s\S]*?m\.content="([^"]*)"/);
  if (!m) throw new Error('index.html sem o script seg-boot com a CSP');
  return { csp: m[1], hashes: [...m[1].matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map(x => x[1]) };
}
export function conferirCSP(html) {
  const { csp, hashes } = hashesCSP(html), esperados = scriptsExecutaveis(html).map(sha256b64), erros = [];
  for (const h of esperados) if (!hashes.includes(h)) erros.push(`script embutido sem hash na CSP (${h.slice(0, 20)}…)`);
  for (const h of hashes) if (!esperados.includes(h)) erros.push(`hash sobrando na CSP (${h.slice(0, 20)}…)`);
  for (const proibido of ["'unsafe-eval'", " * ", "script-src *", 'data: https', "'strict-dynamic'"]) if (csp.includes(proibido)) erros.push(`CSP com ${proibido.trim()}`);
  if (/script-src[^;]*'unsafe-inline'/.test(csp)) erros.push("CSP permite 'unsafe-inline' em scripts");
  for (const d of ["default-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) if (!csp.includes(d)) erros.push(`CSP sem ${d}`);
  return erros;
}
export function corrigirCSP(html) {
  const { csp } = hashesCSP(html);
  const novos = scriptsExecutaveis(html).map(h => `'${sha256b64(h)}'`).join(' ');
  const nova = csp.replace(/script-src (?:'sha256-[A-Za-z0-9+/=]+' ?)*/, `script-src ${novos} `);
  return html.replace(`m.content="${csp}"`, `m.content="${nova}"`);
}

/* ---------- Bibliotecas: versão fixa e SRI presentes ---------- */
export function conferirBibliotecas(html) {
  const erros = [];
  if (/xlsx@0\.1[0-9]|sheetjs|XLSX\.read/i.test(html)) erros.push('referência à biblioteca SheetJS antiga');
  if (/pdfjs-dist@[0-4]\./.test(html)) erros.push('PDF.js abaixo da versão 5');
  const v = (html.match(/const PDF_VER = '([\d.]+)'/) || [])[1];
  if (!v) erros.push('versão do PDF.js não encontrada');
  for (const k of ['PDFJS_SRI', 'PDFW_SRI']) if (!new RegExp(`${k} = 'sha384-[A-Za-z0-9+/]{64}'`).test(html)) erros.push(`${k} ausente ou inválido`);
  if (!/isEvalSupported:false/.test(html)) erros.push('isEvalSupported:false removido');
  return erros;
}

/* ---------- Segredos ---------- */
const RX_SEGREDOS = [
  ['token do GitHub', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/],
  ['chave da Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['chave da OpenAI', /\bsk-(proj-)?[A-Za-z0-9]{32,}\b/],
  ['chave da AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['chave do Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['token do Slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['senha em texto', /\b(password|senha|passwd|secret|token)\s*[:=]\s*["'][^"'\s]{6,}["']/i],
];
export function procurarSegredos(texto, onde) {
  const achados = [];
  for (const [nome, rx] of RX_SEGREDOS) if (rx.test(texto)) achados.push(`${nome} em ${onde}`);
  return achados;
}

/* ---------- Dados pessoais no que é publicado ---------- */
const CHAVES_MERCADO = new Set(['formato', 'versao', 'geradoEm', 'fontes', 'estado', 'mercado', 'noticias']);
export function conferirPublicavel(dados, onde) {
  const erros = [];
  if (dados == null) return erros;
  for (const k of Object.keys(dados)) if (!CHAVES_MERCADO.has(k)) erros.push(`${onde}: campo inesperado "${k}"`);
  const t = JSON.stringify(dados);
  if (/"(ativos|lanc|lancamentos|dividas|metas|contas|bancos|pessoas|divisoes|carteira|patrimonio)"\s*:/.test(t)) erros.push(`${onde}: contém campos de dados pessoais`);
  if (/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(t)) erros.push(`${onde}: parece conter CPF`);
  for (const n of dados.noticias || []) { try { const u = new URL(n.url); if (u.protocol !== 'https:' || u.username || u.password) erros.push(`${onde}: notícia com endereço não https`); } catch { erros.push(`${onde}: notícia com endereço inválido`); } }
  return erros;
}

async function main() {
  const corrigir = process.argv.includes('--corrigir');
  let html = await readFile(HTML, 'utf8');
  if (corrigir) { html = corrigirCSP(html); await writeFile(HTML, html); console.log(`${HTML}: hashes da CSP atualizados.`); }
  const erros = [...conferirCSP(html), ...conferirBibliotecas(html)];
  // arquivos do repositório
  for (const f of await readdir('.', { withFileTypes: true })) {
    if (!f.isFile()) continue;
    if (/\.(json|html|mjs|js|md|yml|yaml|txt|csv)$/i.test(f.name)) erros.push(...procurarSegredos(await readFile(f.name, 'utf8'), f.name));
    if (/backup|extrato|fatura/i.test(f.name)) erros.push(`arquivo com nome de backup/extrato no repositório: ${f.name}`);
    if (/\.(ofx|qfx|xlsx?|pdf)$/i.test(f.name)) erros.push(`arquivo de extrato/planilha no repositório: ${f.name}`);
  }
  // histórico (quando disponível)
  try {
    const log = execFileSync('git', ['log', '--all', '-p', '--no-color'], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    erros.push(...procurarSegredos(log, 'histórico do git').map(e => e + ' (revogue a credencial: apagar o commit não basta)'));
  } catch { console.log('Histórico do git indisponível; só os arquivos atuais foram verificados.'); }
  // dados embutidos e cenario.json: só mercado
  const bloco = (html.match(/<script type="application\/json" id="cenario-embutido">([\s\S]*?)<\/script>/) || [])[1];
  if (bloco === undefined) erros.push('index.html sem o bloco cenario-embutido');
  else erros.push(...conferirPublicavel(JSON.parse(bloco), 'dados embutidos'));
  try { erros.push(...conferirPublicavel(JSON.parse(await readFile(CEN, 'utf8')), CEN)); } catch (e) { if (e.code !== 'ENOENT') erros.push(`${CEN} ilegível`); }
  if (erros.length) { console.error('Verificação de segurança FALHOU:\n- ' + erros.join('\n- ')); process.exit(1); }
  console.log('Verificação de segurança: ok (CSP, bibliotecas, segredos, dados publicados).');
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(e => { console.error('ERRO: ' + e.message); process.exit(1); });
