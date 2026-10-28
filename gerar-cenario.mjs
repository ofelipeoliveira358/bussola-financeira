// Bússola Financeira: gera cenario.json (versão 2) no GitHub Actions.
// Busca as fontes pelo servidor (sem bloqueio de CORS e sem intermediários), valida,
// preserva o último valor válido de cada fonte e só grava se houver dados suficientes.
// Node 20+, sem dependências. Nenhuma chave ou dado pessoal é usado.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const ARQ = process.env.CENARIO_ARQ || 'cenario.json';
const TEMPO = 20000;
const UA = 'BussolaFinanceira/2 (+GitHub Actions; uso pessoal)';

/* ---------- utilitários puros (testados em testar-gerador.mjs) ---------- */
export function agoraBR(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export const sgsData = d => { const [dd, mm, yy] = String(d).split('/'); return yy ? `${yy}-${mm}-${dd}` : String(d); };
export function parseSGS(a) {
  if (!Array.isArray(a)) throw new Error('formato inesperado');
  const pts = a.map(o => [sgsData(o?.data), parseFloat(o?.valor)]).filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p[0]) && isFinite(p[1])).sort((x, y) => x[0].localeCompare(y[0]));
  if (!pts.length) throw new Error('resposta vazia');
  return pts;
}
export function selicDe(pts, hoje) {
  const ok = pts.filter(p => p[0] <= hoje); if (!ok.length) throw new Error('sem dado até hoje');
  const v = ok[ok.length - 1][1]; let i = ok.length - 1; while (i > 0 && ok[i - 1][1] === v) i--;
  return { v, ref: ok[ok.length - 1][0], vigenteDesde: i > 0 ? ok[i][0] : null, ant: i > 0 ? { v: ok[i - 1][1], ref: ok[i - 1][0] } : null, hist: ok };
}
export function focusDe(r, ano) {
  const v = Array.isArray(r?.value) ? r.value.filter(o => /^\d{4}-\d{2}-\d{2}/.test(o?.Data || '') && isFinite(+o?.Mediana)) : null;
  if (!v) throw new Error('formato inesperado'); if (!v.length) throw new Error('resposta vazia');
  const doAno = a => v.filter(o => String(o.DataReferencia) === String(a)).sort((x, y) => y.Data.localeCompare(x.Data));
  const atual = doAno(ano), prox = doAno(ano + 1);
  if (!atual.length) throw new Error('sem projeção para ' + ano);
  return { v: +atual[0].Mediana, ref: atual[0].Data.slice(0, 10), ant: atual[1] ? { v: +atual[1].Mediana, ref: atual[1].Data.slice(0, 10) } : null, prox: prox[0] ? { ano: ano + 1, v: +prox[0].Mediana } : null, ano };
}
export function dolarDe(r) {
  const q = r?.USDBRL, v = parseFloat(q?.bid), vr = parseFloat(q?.pctChange), ts = +q?.timestamp * 1000;
  if (!isFinite(v) || !(v > 0)) throw new Error('formato inesperado');
  const cot = isFinite(ts) && ts > 0 ? ts : Date.parse(String(q?.create_date || '').replace(' ', 'T') + '-03:00');
  if (!isFinite(cot)) throw new Error('sem horário da cotação');
  return { v, var: isFinite(vr) ? vr : null, cot, ref: agoraBR(cot) };
}
export function indiceDe(r, nome) {
  const res = r?.chart?.result?.[0], m = res?.meta;
  const v = +m?.regularMarketPrice, t = +m?.regularMarketTime * 1000, prev = +m?.chartPreviousClose || +m?.previousClose;
  if (!isFinite(v) || !(v > 0) || !isFinite(t)) throw new Error(`${nome}: formato inesperado`);
  return { v, ref: agoraBR(t), cot: t, var: isFinite(prev) && prev > 0 ? (v - prev) / prev * 100 : null };
}
const ent = t => String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export const RX_MERCADO = /(bolsa|ibovespa|d[oó]lar|juros|selic|copom|infla[cç][aã]o|ipca|tesouro|mercado|banco central|fiscal|d[ií]vida p[uú]blica|arcabou[cç]o|\bpib\b|desemprego|emprego|c[aâ]mbio|a[cç][oõ]es|investiment|renda fixa|cdb|poupan[cç]a|imposto|petrobras|\bb3\b|\bfed\b|economia|or[cç]amento|meta fiscal)/i;
export function parseRSS(xml, fonte) {
  const itens = [];
  for (const m of String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const b = m[0], tag = t => (b.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i')) || [])[1];
    let titulo = ent(tag('title')), url = ent(tag('link')), f = fonte;
    const src = ent(tag('source')); if (src) { f = src; titulo = titulo.replace(new RegExp(`\\s+-\\s+${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), ''); }
    const ts = Date.parse(ent(tag('pubDate')));    // RFC 822 com fuso: convertido corretamente
    if (titulo && /^https:\/\//.test(url) && isFinite(ts)) itens.push({ titulo, url, fonte: f, ts });
  }
  return itens;
}
export function juntarNoticias(...listas) {
  const vistos = new Set(), out = [];
  for (const n of listas.flat()) {
    if (!n?.titulo || !/^https:\/\//.test(n.url || '') || !RX_MERCADO.test(n.titulo)) continue;
    const k = n.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 70);
    if (vistos.has(k)) continue; vistos.add(k); out.push(n);
  }
  return out.sort((a, b) => b.ts - a.ts);
}
export function validarSaida(c) {
  const nucleo = ['selic', 'cdi', 'ipca12', 'focusIpca', 'dolarBcb'];
  const frescos = nucleo.filter(k => c.estado?.[k]?.ok && c.fontes?.[k]);
  if (frescos.length < 3) throw new Error(`só ${frescos.length} de ${nucleo.length} fontes principais responderam; cenário não publicado`);
  for (const [k, r] of Object.entries(c.fontes)) if (!isFinite(+r.v) || !/^\d{4}-\d{2}(-\d{2})?$/.test(r.ref) || isNaN(Date.parse(r.at))) throw new Error(`registro inválido: ${k}`);
  return true;
}

/* ---------- busca ---------- */
async function obter(url, tipo = 'json') {
  const c = new AbortController(), t = setTimeout(() => c.abort(), TEMPO);
  let r;
  try { r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': UA, Accept: tipo === 'json' ? 'application/json' : 'application/rss+xml, application/xml, text/xml' } }); }
  catch (e) { throw new Error(e?.name === 'AbortError' ? `tempo esgotado (${TEMPO / 1000} s)` : `sem conexão (${e?.cause?.code || e.message})`); }
  finally { clearTimeout(t); }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const txt = await r.text();
  if (!txt.trim()) throw new Error('resposta vazia');
  if (tipo !== 'json') return txt;
  try { return JSON.parse(txt); } catch { throw new Error('resposta não é JSON válido'); }
}
const sgs = (cod, n) => obter(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cod}/dados/ultimos/${n}?formato=json`).then(parseSGS);
const FONTES = {
  selic: { fonte: 'Banco Central · SGS 432', url: 'https://www.bcb.gov.br/controleinflacao/historicotaxasjuros', buscar: async () => selicDe(await sgs(432, 20), agoraBR()) },
  cdi: { fonte: 'Banco Central · SGS 4389', url: 'https://www.bcb.gov.br/estabilidadefinanceira/historicotaxasjuros', buscar: async () => { const p = await sgs(4389, 20); return { v: p.at(-1)[1], ref: p.at(-1)[0], hist: p }; } },
  ipcaMes: { fonte: 'IBGE via Banco Central · SGS 433', url: 'https://www.ibge.gov.br/explica/inflacao.php', buscar: async () => { const p = await sgs(433, 13); return { v: p.at(-1)[1], ref: p.at(-1)[0].slice(0, 7), hist: p.map(x => [x[0].slice(0, 7), x[1]]) }; } },
  ipca12: { fonte: 'IBGE via Banco Central · SGS 13522', url: 'https://www.ibge.gov.br/explica/inflacao.php', buscar: async () => { const p = await sgs(13522, 13); return { v: p.at(-1)[1], ref: p.at(-1)[0].slice(0, 7), hist: p.map(x => [x[0].slice(0, 7), x[1]]) }; } },
  focusIpca: { fonte: 'Banco Central · Boletim Focus', url: 'https://www.bcb.gov.br/publicacoes/focus', buscar: () => focus('IPCA') },
  focusSelic: { fonte: 'Banco Central · Boletim Focus', url: 'https://www.bcb.gov.br/publicacoes/focus', buscar: () => focus('Selic') },
  dolarBcb: { fonte: 'Banco Central · SGS 1', url: 'https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes', buscar: async () => { const p = await sgs(1, 20); return { v: p.at(-1)[1], ref: p.at(-1)[0], hist: p }; } },
  dolar: { fonte: 'AwesomeAPI (USD-BRL)', url: 'https://docs.awesomeapi.com.br/api-de-moedas', buscar: async () => dolarDe(await obter('https://economia.awesomeapi.com.br/json/last/USD-BRL')) },
};
async function focus(ind) {
  const y = +agoraBR().slice(0, 4);
  const f = `Indicador eq '${ind}' and baseCalculo eq 0 and (DataReferencia eq '${y}' or DataReferencia eq '${y + 1}')`;
  return focusDe(await obter(`https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=12&$format=json&$select=Data,DataReferencia,Mediana&$orderby=Data%20desc&$filter=${encodeURIComponent(f)}`), y);
}
// Índices de bolsa: Yahoo Finance (não oficial). Entram só se a resposta for válida; senão, ficam indisponíveis.
const MERCADO = {
  ibov: { simbolos: ['^BVSP'], fonte: 'Yahoo Finance (não oficial, indicativo)', url: 'https://finance.yahoo.com/quote/%5EBVSP' },
  ifix: { simbolos: ['IFIX.SA', '^IFIX'], fonte: 'Yahoo Finance (não oficial, indicativo)', url: 'https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/indice-de-fundos-de-investimentos-imobiliarios-ifix.htm' },
};
const FEEDS = [
  ['g1 Economia', 'https://g1.globo.com/rss/g1/economia/'],
  ['InfoMoney', 'https://www.infomoney.com.br/feed/'],
  ['Google Notícias', 'https://news.google.com/rss/search?q=Ibovespa+OR+Selic+OR+d%C3%B3lar+OR+Copom+OR+infla%C3%A7%C3%A3o+OR+%22Tesouro+Direto%22+OR+fiscal+OR+PIB&hl=pt-BR&gl=BR&ceid=BR:pt-419'],
];

async function main() {
  const agora = new Date().toISOString();
  let ant = null; try { ant = JSON.parse(await readFile(ARQ, 'utf8')); } catch { }
  const anterior = ant?.versao === 2 ? ant : { fontes: {}, mercado: {}, noticias: [] };
  const saida = { versao: 2, geradoEm: agora, fontes: {}, estado: {}, mercado: {}, noticias: [] };
  await Promise.all(Object.entries(FONTES).map(async ([k, f]) => {
    const t0 = Date.now();
    try { saida.fontes[k] = { ...(await f.buscar()), at: agora, fonte: f.fonte, url: f.url }; saida.estado[k] = { ok: true, em: agora, ms: Date.now() - t0 }; }
    catch (e) { saida.estado[k] = { ok: false, em: agora, erro: e.message, ms: Date.now() - t0 }; if (anterior.fontes?.[k]) saida.fontes[k] = anterior.fontes[k]; }   // preserva o último válido
  }));
  for (const [k, m] of Object.entries(MERCADO)) {
    let ok = false, erro = '';
    for (const s of m.simbolos) {
      try { saida.mercado[k] = { ...indiceDe(await obter(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=5d&interval=1d`), s), at: agora, fonte: m.fonte, url: m.url }; ok = true; break; }
      catch (e) { erro = `${s}: ${e.message}`; }
    }
    saida.estado['mercado.' + k] = ok ? { ok: true, em: agora } : { ok: false, em: agora, erro };
    if (!ok && anterior.mercado?.[k]) saida.mercado[k] = anterior.mercado[k];
  }
  const lidas = [];
  for (const [fonte, url] of FEEDS) {
    try { const itens = parseRSS(await obter(url, 'xml'), fonte); lidas.push(...itens); saida.estado['noticias.' + fonte] = { ok: true, em: agora, itens: itens.length }; }
    catch (e) { saida.estado['noticias.' + fonte] = { ok: false, em: agora, erro: e.message }; }
  }
  const limite = Date.now() - 4 * 864e5;
  saida.noticias = juntarNoticias(lidas, anterior.noticias || []).filter(n => n.ts >= limite).slice(0, 40);
  for (const [k, e] of Object.entries(saida.estado)) console.log(`${e.ok ? 'OK   ' : 'FALHA'} ${k}${e.ms != null ? ` (${e.ms} ms)` : ''}${e.erro ? ' — ' + e.erro : ''}${e.itens != null ? ` — ${e.itens} itens` : ''}`);
  validarSaida(saida);   // lança erro e não grava nada se faltar o essencial
  await writeFile(ARQ, JSON.stringify(saida, null, 1) + '\n');
  console.log(`cenario.json gravado: ${Object.keys(saida.fontes).length} indicadores, ${Object.keys(saida.mercado).length} índices, ${saida.noticias.length} notícias.`);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(e => { console.error('ERRO: ' + e.message + '\nO cenario.json anterior foi mantido.'); process.exit(1); });
