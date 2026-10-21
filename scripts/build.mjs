import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cluster, bias, category, keepFootball, score, outletsOf } from './lib.mjs';

const now = Date.now(), H = 3600e3;
const feeds = JSON.parse(await readFile('feeds.json', 'utf8'));
const agencias = new Set(feeds.filter(f => f.tipo === 'agencia').map(f => f.name));
const SITE = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/?$/, '/') : '';
const TOPIC = process.env.NTFY_TOPIC, TOKEN = process.env.GITHUB_TOKEN;
const dec = s => (s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (x, n) => x.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i'))?.[1];

function parse(xml, f) {
  const out = [];
  for (const b of xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || []) {
    const titulo = dec(tag(b, 'title')), url = dec(tag(b, 'link')) || b.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    const fecha = Date.parse(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date') || '');
    if (!titulo || !url || !isFinite(fecha) || fecha > now + H) continue;
    out.push({ medio: f.name, titulo, url, fecha, resumen: dec(tag(b, 'description') || tag(b, 'summary')).slice(0, 400) });
  }
  return out;
}

const errores = []; let items = [];
await Promise.all(feeds.map(async f => {
  try {
    const r = await fetch(f.url, { headers: { 'user-agent': 'Newspaper/2.0 (lector RSS)' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    items.push(...parse(await r.text(), f));
  } catch (e) { errores.push(`${f.name}: ${e.message}`); }
}));

let prev = null;
if (SITE) try { const r = await fetch(SITE + 'data/news.json?' + now, { signal: AbortSignal.timeout(15000) }); if (r.ok) prev = await r.json(); } catch {}
const prevById = new Map((prev?.clusters || []).map(c => [c.id, c]));
for (const c of prev?.clusters || []) items.push(...c.fuentes);
const byUrl = new Map(); for (const i of items) if (!byUrl.has(i.url) && i.fecha > now - 48 * H) byUrl.set(i.url, i);
items = [...byUrl.values()].map(i => ({ ...i, cat: category(i.titulo + ' ' + (i.resumen || ''), feeds.find(f => f.name === i.medio)?.cat) }));

const cl = cluster(items).map(g => {
  g.sort((a, b) => a.fecha - b.fecha);
  const porMedio = new Map(); for (const i of g) if (!porMedio.has(i.medio)) porMedio.set(i.medio, i); // un voto por medio
  const fuentes = [...porMedio.values()].map(({ medio, titulo, url, fecha, resumen }) => ({ medio, titulo, url, fecha, resumen }));
  const cnt = {}; for (const i of g) cnt[i.cat] = (cnt[i.cat] || 0) + 1;
  const cat = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
  const c = { id: createHash('sha1').update(g[0].url).digest('hex').slice(0, 10), cat, primera: g[0].fecha, ultima: g.at(-1).fecha, titular: g.at(-1).titulo, fuentes };
  c.bias = bias(fuentes, feeds); c.score = score(c, agencias);
  return c;
}).filter(keepFootball).sort((a, b) => b.ultima - a.ultima).slice(0, 150);

// --- Artículos propios: solo con las fuentes recuperadas y validados antes de publicarse ---
const SYS = `Eres redactor de Newspaper. Recibes titulares y resúmenes numerados de varios medios sobre un mismo hecho. Escribe en español, claro y sin adjetivos ideológicos. Usa SOLO lo que dicen las fuentes: no inventes datos, cifras, citas ni contexto. Distingue hechos que varias fuentes respaldan, informaciones de una sola fuente o sin confirmar, y desacuerdos entre medios. Atribuye declaraciones a quien las hace. No copies frases largas literales. Responde SOLO un JSON: {"titular":str,"entradilla":str,"resumen":str,"que_sabemos":[{"t":str,"f":[n]}],"no_confirmado":[{"t":str,"f":[n]}],"desacuerdos":[{"t":str,"f":[n]}]} donde f son los números de las fuentes que respaldan cada frase. Listas vacías si no procede.`;
const okF = (f, n) => Array.isArray(f) && f.length && f.every(x => Number.isInteger(x) && x >= 1 && x <= n);
function validar(a, n) {
  if (!a || typeof a.titular !== 'string' || typeof a.entradilla !== 'string') return null;
  const lim = k => (Array.isArray(a[k]) ? a[k] : []).filter(x => x && typeof x.t === 'string' && okF(x.f, n)).slice(0, 8);
  const r = { tipo: 'ia', titular: a.titular.slice(0, 200), entradilla: a.entradilla.slice(0, 600), resumen: String(a.resumen || '').slice(0, 500), que_sabemos: lim('que_sabemos'), no_confirmado: lim('no_confirmado'), desacuerdos: lim('desacuerdos'), generado: now };
  return r.que_sabemos.length ? r : null;
}
async function redactar(c) {
  const lista = c.fuentes.map((s, i) => `[${i + 1}] ${s.medio} (${new Date(s.fecha).toISOString()}): ${s.titulo}. ${s.resumen || ''}`).join('\n');
  const r = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model: 'openai/gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYS }, { role: 'user', content: lista }] }),
  });
  if (r.status === 429) throw Object.assign(new Error('cuota agotada'), { cuota: true });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return validar(JSON.parse((await r.json()).choices[0].message.content), c.fuentes.length);
}
let nIA = 0;
for (const c of [...cl].sort((a, b) => b.score - a.score)) {
  const p = prevById.get(c.id);
  if (p?.articulo?.tipo === 'ia' && p.fuentes.length === c.fuentes.length) { c.articulo = p.articulo; continue; }
  c.articulo = { tipo: 'basico' };
  if (TOKEN && nIA < 10 && outletsOf(c) >= 2) {
    try { nIA++; c.articulo = (await redactar(c)) || c.articulo; } catch (e) { errores.push('IA: ' + e.message); if (e.cuota) nIA = 99; }
  }
}

// --- Avisos ntfy y resumen de las 08:00 (Europe/Madrid) ---
async function ntfy(title, message, click) {
  const r = await fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify({ topic: TOPIC, title, message, click, tags: ['newspaper'] }) });
  if (!r.ok) throw new Error('ntfy HTTP ' + r.status);
}
const hoy = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
const hora = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(now);
let digestDate = prev?.digestDate; const avisados = prev?.avisados || [];
if (TOPIC && prev) {
  try {
    for (const c of cl.filter(c => !avisados.includes(c.id) && !prevById.has(c.id) && outletsOf(c) >= 3).slice(0, 3)) {
      await ntfy(c.titular.slice(0, 120), `${outletsOf(c)} medios · izq ${c.bias.izquierda}% · centro ${c.bias.centro}% · der ${c.bias.derecha}%`, `${SITE}#/n/${c.id}`);
      avisados.push(c.id);
    }
    if (hora === 8 && digestDate !== hoy) {
      const top = cl.filter(c => c.ultima > now - 10 * H).sort((a, b) => b.score - a.score).slice(0, 3);
      if (top.length) { await ntfy('Resumen de las 08:00', top.map(c => `• ${c.titular} (${outletsOf(c)} medios)`).join('\n'), `${SITE}#/n/${top[0].id}`); digestDate = hoy; }
    }
  } catch (e) { errores.push('Avisos: ' + e.message); }
}
await mkdir('public/data', { recursive: true });
await writeFile('public/data/news.json', JSON.stringify({ v: 2, generado: now, errores, clusters: cl, digestDate, avisados: avisados.slice(-200) }));
console.log(`${cl.length} noticias, ${errores.length} avisos de error`);
