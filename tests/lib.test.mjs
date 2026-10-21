import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { cluster, bias, category, keepFootball } from '../scripts/lib.mjs';

const feeds = [{ name: 'A', bias: 'izq' }, { name: 'B', bias: 'cen-izq' }, { name: 'C', bias: 'cen' }, { name: 'D', bias: 'der' }];
test('barra de sesgo: centro-izquierda no cuenta como centro; duplicados y desconocidos aparte', () => {
  const r = bias([{ medio: 'A' }, { medio: 'A' }, { medio: 'B' }, { medio: 'C' }, { medio: 'D' }, { medio: 'Z' }], feeds);
  assert.deepEqual([r.medios, r.izquierda, r.centro, r.derecha, r.desconocidos], [5, 50, 25, 25, 1]);
  assert.equal(bias([{ medio: 'A' }, { medio: 'Z' }], feeds).suficiente, false);
});
test('agrupa el mismo hecho y separa temas distintos', () => {
  const t = Date.now(), g = cluster([
    { titulo: 'El Gobierno aprueba el decreto de vivienda en el Consejo de Ministros', fecha: t },
    { titulo: 'Consejo de Ministros aprueba decreto de vivienda del Gobierno', fecha: t - 1 },
    { titulo: 'Alcaraz gana el torneo de Valencia', fecha: t - 2 }]);
  assert.deepEqual(g.map(x => x.length).sort(), [1, 2]);
});
const fc = (n, titulo) => ({ cat: 'futbol', fuentes: Array.from({ length: n }, (_, i) => ({ medio: 'M' + i, titulo })) });
test('fútbol: umbral alto en general, menor en España y fichajes, descarta juveniles', () => {
  assert.equal(keepFootball(fc(3, 'Gol de la Bundesliga')), false);
  assert.equal(keepFootball(fc(4, 'Gol de la Bundesliga')), true);
  assert.equal(keepFootball(fc(2, 'El Real Madrid gana en LaLiga')), true);
  assert.equal(keepFootball(fc(3, 'Fichaje bomba por un delantero')), true);
  assert.equal(keepFootball(fc(6, 'Real Madrid juvenil gana la copa')), false);
});
test('categorías', () => {
  assert.equal(category('Zelenski pide más defensa aérea'), 'geopolitica');
  assert.equal(category('El Ibex 35 cierra al alza'), 'economia');
  assert.equal(category('Tema sin palabras clave', 'espana'), 'espana');
});
test('ninguna clave secreta en los archivos públicos', () => {
  const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  for (const f of walk('public')) assert.doesNotMatch(readFileSync(f, 'utf8'), /ghp_|github_pat_|sk-ant-/);
});
