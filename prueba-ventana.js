/* ══════════════════════════════════════════════════════════════════
   LA VENTANA DEL JUEGO, DESDE EL ADMIN

   Un reto no existe para nadie hasta que tiene tres cosas:
   live = true, opens_at y closes_at. cp_reto_vivo las pide las tres.
   Sin ellas el enlace del jugador y el del padrino abren y no hacen
   nada, y no dicen por qué.

   El formulario no ponía ninguna. Se ponían a mano, en el editor de
   SQL de Supabase — y el día de un partido, con los nenes esperando,
   eso no es una opción.

   Tres cosas pueden salir mal aquí, y las tres son silenciosas:

   1 · LA ZONA. Un <input type="datetime-local"> habla en hora local
       y sin zona. Mandar esa cadena tal cual es mandar la hora de
       Puerto Rico haciéndola pasar por UTC: cuatro horas de
       corrimiento, y un partido que abre cuando ya terminó. Por eso
       la prueba se corre en America/Puerto_Rico y comprueba los
       números, no el ida y vuelta —que un ida y vuelta pasa igual de
       bien con el error puesto en los dos sentidos.

   2 · LA VENTANA AL REVÉS. Ya pasó una vez: closes_at quedó antes
       que opens_at. Ningún cuarto entra, las promesas cierran solas
       en cero, y no hay un error en ninguna pantalla. La base tiene
       su guardia desde entonces; esto lo dice con palabras antes de
       que suba un error de Postgres a un alert.

   3 · LA FILA QUE NO SE GUARDA. Una PATCH que RLS no deja pasar no
       es un error: la base responde con una lista vacía. La casilla
       de "vivo" volvía sola a su sitio y en pantalla no pasaba nada.

   Se corre el código DE VERDAD, sacado de index.html.

       node prueba-ventana.js
   ══════════════════════════════════════════════════════════════════ */
process.env.TZ = 'America/Puerto_Rico';   // antes de la primera fecha

const fs = require('fs');
const vm = require('vm');

let fallos = 0;
const ok  = (m) => console.log('  ok   ' + m);
const mal = (m) => { fallos++; console.log('  MAL  ' + m); };
const eq  = (a, b, m) => (String(a) === String(b) ? ok(m + ' → ' + a)
  : mal(m + '\n         esperaba: ' + b + '\n         vino:     ' + a));

if (new Date('2026-10-19T19:30').toISOString() !== '2026-10-19T23:30:00.000Z') {
  console.error('esta prueba necesita correr en America/Puerto_Rico (TZ)'); process.exit(1);
}

/* ── El código de verdad ────────────────────────────────────────── */
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const desde = html.indexOf('function ventanaAISO(v)');
const hasta = html.indexOf('async function loadChallenges()');
if (desde < 0 || hasta < 0) { console.error('no encuentro el bloque de la ventana'); process.exit(1) }

/* Un DOM de campos de formulario y poco más. */
const CAMPOS = {};
const campo = (id, v) => (CAMPOS[id] = { value: v === undefined ? '' : v, checked: !!v });
['challengeCampaign','challengeName','challengeGame','challengePledgeDeadline',
 'challengeRunDeadline','challengeOpensAt','challengeClosesAt'].forEach(id => campo(id));
CAMPOS.challengeLive = { checked: false, value: '' };
CAMPOS.createChallengeForm = { style: {} };

const avisos = [];
const llamadas = [];
let respuesta = [{ id: 'R1' }];          // lo que contesta la base

const contexto = {
  console: { log(){}, error(){} },
  alert: (m) => avisos.push(m),
  document: { getElementById: (id) => CAMPOS[id] || null },
  t: (k) => k,
  loadChallenges: () => {},
  supabaseQuery: async (tabla, metodo, cuerpo, filtro) => {
    llamadas.push({ tabla, metodo, cuerpo, filtro });
    return respuesta;
  }
};
vm.createContext(contexto);
vm.runInContext(html.slice(desde, hasta), contexto, { filename: 'index.html (ventana)' });
const { ventanaAISO, ventanaALocal, ventanaMal, seGuardo,
        createChallenge, setChallengeLive, guardarVentana } = contexto;

const limpiar = () => { avisos.length = 0; llamadas.length = 0; respuesta = [{ id: 'R1' }] };

// ── 1 · La zona ───────────────────────────────────────────────────
console.log('\n1 · La hora que se escribe y la hora que se guarda\n');
eq(ventanaAISO('2026-10-19T19:30'), '2026-10-19T23:30:00.000Z',
   'las 7:30 de la tarde en Loíza se guardan como 23:30 UTC');
eq(ventanaAISO('2026-10-19T19:30') === '2026-10-19T19:30', false,
   'y NO se manda la cadena tal cual, que serían cuatro horas de regalo');
eq(ventanaALocal('2026-10-19T23:30:00.000Z'), '2026-10-19T19:30',
   'y al volver a la pantalla se lee otra vez como las 7:30');
eq(ventanaAISO(''), null, 'un campo vacío es null, no una fecha inventada');
eq(ventanaALocal(null), '', 'y un null en la base es un campo vacío');

// ── 2 · Lo que no se deja salir ───────────────────────────────────
console.log('\n2 · Las ventanas que no pueden llegar a la base\n');
eq(ventanaMal('', '', true), 'liveNeedsWindow',
   'vivo y sin ventana — que es vivo y sin que nadie pueda jugar');
eq(ventanaMal('2026-10-19T19:00', '', false), 'windowNeedsBoth', 'sólo la hora de abrir');
eq(ventanaMal('', '2026-10-19T21:00', false), 'windowNeedsBoth', 'sólo la de cerrar');
eq(ventanaMal('2026-10-19T21:00', '2026-10-19T19:00', false), 'windowBackwards',
   'cerrar antes de abrir — el fallo que vació una recaudación');
eq(ventanaMal('2026-10-19T19:00', '2026-10-19T19:00', false), 'windowBackwards',
   'y abrir y cerrar a la misma hora, que la base tampoco lo acepta');
eq(ventanaMal('2026-10-19T19:00', '2026-10-19T21:00', true), null, 'una ventana buena pasa');
eq(ventanaMal('', '', false), null,
   'y sin ventana y sin vivo también: así se prepara un reto antes de abrirlo');

/* De aquí abajo se llama a las funciones de verdad, que son
   asíncronas. */
(async () => {
// ── 3 · Crear el reto ─────────────────────────────────────────────
console.log('\n3 · Lo que el formulario manda al crear\n');
limpiar();
CAMPOS.challengeCampaign.value = 'CAMP1';
CAMPOS.challengeName.value = 'Demo Hooporia';
CAMPOS.challengeGame.value = 'fortress-vr';
CAMPOS.challengeOpensAt.value = '2026-10-19T19:00';
CAMPOS.challengeClosesAt.value = '2026-10-19T21:00';
CAMPOS.challengeLive.checked = true;
await createChallenge();

eq(llamadas.length, 1, 'se crea el reto');
const cuerpo = llamadas[0] && llamadas[0].cuerpo || {};
eq(cuerpo.opens_at, '2026-10-19T23:00:00.000Z', 'con su hora de abrir, en UTC');
eq(cuerpo.closes_at, '2026-10-20T01:00:00.000Z', 'y la de cerrar — que cruza la medianoche UTC');
eq(cuerpo.live, true, 'y vivo, porque se marcó');
eq(cuerpo.game, 'fortress-vr', 'con el juego escogido');
eq(avisos.join('|'), 'challengeCreated', 'y sin quejas');
eq(CAMPOS.challengeOpensAt.value, '', 'el formulario se limpia para el siguiente');
eq(CAMPOS.challengeLive.checked, false, 'la casilla de vivo también');

console.log('\n3b · Y lo que no se crea\n');
limpiar();
CAMPOS.challengeName.value = 'Sin ventana';
CAMPOS.challengeOpensAt.value = '';
CAMPOS.challengeClosesAt.value = '';
CAMPOS.challengeLive.checked = true;
await createChallenge();
eq(llamadas.length, 0, 'vivo sin ventana no llega a la base');
eq(avisos[0], 'liveNeedsWindow', 'y se dice por qué');

limpiar();
CAMPOS.challengeLive.checked = false;
CAMPOS.challengeOpensAt.value = '2026-10-19T21:00';
CAMPOS.challengeClosesAt.value = '2026-10-19T19:00';
await createChallenge();
eq(llamadas.length, 0, 'ni una ventana que cierra antes de abrir');
eq(avisos[0], 'windowBackwards', 'con su aviso');

// ── 4 · La fila que no se guardó ──────────────────────────────────
console.log('\n4 · Cuando la base contesta "no actualicé nada"\n');
eq(seGuardo([{ id: 'R1' }]), true, 'una fila de vuelta es que sí');
eq(seGuardo([]), false, 'una lista vacía es que no');
eq(seGuardo(null), false, 'y nada de vuelta, tampoco');

limpiar(); respuesta = [];
await setChallengeLive('R1', true);
eq(avisos[0], 'notSaved', 'marcar vivo y que no se guarde ahora se dice');

limpiar();
await setChallengeLive('R1', true);
eq(avisos.length, 0, 'y cuando sí se guarda, no se molesta a nadie');
eq(llamadas[0].cuerpo.live, true, 'con lo que se pidió');

// ── 5 · La ventana ya creado el reto ──────────────────────────────
console.log('\n5 · Cambiar la ventana sin entrar en SQL\n');
CAMPOS['abre-R1'] = { value: '2026-10-19T19:00' };
CAMPOS['cierra-R1'] = { value: '2026-10-19T21:00' };

limpiar();
await guardarVentana('R1');
eq(llamadas.length, 1, 'se guarda');
eq(llamadas[0].cuerpo.opens_at, '2026-10-19T23:00:00.000Z', 'con la hora bien puesta');
eq(llamadas[0].filtro, '?select=*', 'y pidiendo la fila de vuelta, que es cómo se sabe');
eq(avisos[0], 'windowSaved', 'y se dice que se guardó');

limpiar();
CAMPOS['cierra-R1'].value = '2026-10-19T18:00';
await guardarVentana('R1');
eq(llamadas.length, 0, 'al revés no se guarda');
eq(avisos[0], 'windowBackwards', 'y se dice por qué');

limpiar(); respuesta = [];
CAMPOS['cierra-R1'].value = '2026-10-19T21:00';
await guardarVentana('R1');
eq(avisos[0], 'notSaved', 'y si RLS la corta, se dice también');

console.log('\n' + (fallos === 0
  ? '✓ la ventana se pone desde el admin'
  : '✗ ' + fallos + ' fallo(s)'));
process.exit(fallos === 0 ? 0 : 1);
})();
