// Testes do gerador com respostas simuladas (não acessam a internet).
// Rodam antes de cada geração no GitHub Actions; se algum falhar, nada é publicado.
import assert from 'node:assert/strict';
import { parseSGS, selicDe, focusDe, dolarDe, indiceDe, parseRSS, juntarNoticias, validarSaida, agoraBR } from './gerar-cenario.mjs';

let n = 0; const t = (nome, f) => { f(); n++; console.log('ok', nome); };

t('SGS: datas dd/mm/aaaa e valores em texto', () => { const p = parseSGS([{ data: '27/10/2026', valor: '13.65' }, { data: '24/10/2026', valor: '13.64' }]); assert.deepEqual(p, [['2026-10-24', 13.64], ['2026-10-27', 13.65]]); });
t('SGS: resposta vazia é erro', () => assert.throws(() => parseSGS([]), /vazia/));
t('SGS: formato errado é erro', () => assert.throws(() => parseSGS({ erro: 1 }), /formato/));
t('SGS: valores inválidos descartados', () => assert.throws(() => parseSGS([{ data: 'x', valor: 'abc' }]), /vazia/));
t('Selic: ignora datas futuras e acha a vigência', () => { const s = selicDe([['2026-09-16', 14], ['2026-09-17', 13.75], ['2026-10-27', 13.75], ['2026-11-30', 13.75]], '2026-10-28'); assert.equal(s.v, 13.75); assert.equal(s.ref, '2026-10-27'); assert.equal(s.vigenteDesde, '2026-09-17'); assert.equal(s.ant.v, 14); });
t('Focus: compara com a semana anterior, não com o dia anterior', () => { const f = focusDe({ value: [{ Data: '2026-10-23', DataReferencia: '2026', Mediana: 5.1891 }, { Data: '2026-10-22', DataReferencia: '2026', Mediana: 5.2141 }, { Data: '2026-10-16', DataReferencia: '2026', Mediana: 5.25 }, { Data: '2026-10-23', DataReferencia: '2027', Mediana: 4.3 }] }, 2026); assert.equal(f.v, 5.1891); assert.equal(f.ant.v, 5.25); assert.equal(f.ant.ref, '2026-10-16'); assert.equal(f.prox.v, 4.3); assert.equal(f.ref, '2026-10-23'); });
t('Focus: sem o ano corrente é erro', () => assert.throws(() => focusDe({ value: [{ Data: '2026-10-23', DataReferencia: '2027', Mediana: 4 }] }, 2026), /sem projeção/));
t('Dólar: horário da cotação vem da fonte', () => { const d = dolarDe({ USDBRL: { bid: '5.3810', pctChange: '-1.9', timestamp: '1761339540', create_date: '2025-10-24 17:59:00' } }); assert.equal(d.v, 5.381); assert.equal(d.cot, 1761339540000); assert.equal(d.ref, '2025-10-24'); });
t('Dólar: sem cotação é erro', () => assert.throws(() => dolarDe({ USDBRL: { bid: 'x' } }), /formato/));
t('Índice: variação do dia usa o pregão anterior, não o início do período', () => { const d = s => Date.parse(s) / 1000; const i = indiceDe({ chart: { result: [{ meta: { regularMarketPrice: 171006.1, regularMarketTime: d('2026-10-28T20:58:00Z'), chartPreviousClose: 206488 }, timestamp: [d('2026-10-26T13:00:00Z'), d('2026-10-27T13:00:00Z'), d('2026-10-28T13:00:00Z')], indicators: { quote: [{ close: [175000, 172000, 171006.1] }] } }] } }, '^BVSP'); assert.equal(i.ref, '2026-10-28'); assert.ok(Math.abs(i.var - (171006.1 / 172000 - 1) * 100) < 1e-9); });
t('RSS: fuso horário convertido, CDATA e fonte do Google Notícias', () => {
  const x = `<rss><channel><item><title><![CDATA[Copom mantém Selic - Valor Econômico]]></title><link>https://news.google.com/a</link><pubDate>Wed, 28 Oct 2026 16:00:00 GMT</pubDate><source url="https://valor.globo.com">Valor Econômico</source></item><item><title>Dólar cai &amp; bolsa sobe</title><link>https://g1.globo.com/b</link><pubDate>Wed, 28 Oct 2026 10:00:00 -0300</pubDate></item><item><title>Sem data</title><link>https://x.com/c</link></item></channel></rss>`;
  const it = parseRSS(x, 'Google Notícias');
  assert.equal(it.length, 2); assert.equal(it[0].titulo, 'Copom mantém Selic'); assert.equal(it[0].fonte, 'Valor Econômico');
  assert.equal(it[0].ts, Date.UTC(2026, 9, 28, 16)); assert.equal(it[1].ts, Date.UTC(2026, 9, 28, 13)); assert.equal(it[1].titulo, 'Dólar cai & bolsa sobe');
});
t('Notícias: sem duplicidade, só mercado, mais recentes primeiro', () => { const j = juntarNoticias([{ titulo: 'Dólar sobe', url: 'https://a', ts: 1 }, { titulo: 'Dólar sobe!', url: 'https://b', ts: 2 }, { titulo: 'Receita de bolo', url: 'https://c', ts: 3 }, { titulo: 'Selic em pauta', url: 'https://d', ts: 4 }]); assert.deepEqual(j.map(x => x.titulo), ['Selic em pauta', 'Dólar sobe']); });
t('Validação: menos de 3 fontes principais não publica', () => assert.throws(() => validarSaida({ fontes: { selic: { v: 1, ref: '2026-10-27', at: '2026-10-28T10:00:00Z' } }, estado: { selic: { ok: true } } }), /não publicado/));
t('Validação: dados preservados de falha não contam como frescos', () => { const r = { v: 1, ref: '2026-10-27', at: '2026-10-28T10:00:00Z' }; assert.throws(() => validarSaida({ fontes: { selic: r, cdi: r, ipca12: { ...r, ref: '2026-09' } }, estado: { selic: { ok: true }, cdi: { ok: false }, ipca12: { ok: false } } }), /não publicado/); });
t('Validação: 3 fontes frescas publicam', () => { const r = { v: 1, ref: '2026-10-27', at: '2026-10-28T10:00:00Z' }; assert.ok(validarSaida({ fontes: { selic: r, cdi: r, ipca12: { ...r, ref: '2026-09' } }, estado: { selic: { ok: true }, cdi: { ok: true }, ipca12: { ok: true } } })); });
t('Data de Brasília', () => assert.equal(agoraBR(Date.UTC(2026, 9, 29, 2)), '2026-10-28'));
console.log(`${n} testes do gerador aprovados`);
