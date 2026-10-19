/* ══════════════════════════════════════════════════════════════════
   EL BOTÓN QUE FACTURA — el lado del admin

   La llave de Stripe del servidor es de PRODUCCIÓN. O sea que este
   botón, mal hecho, manda una factura de verdad a un programa de
   verdad mientras alguien prueba cosas. Por eso son dos pasos: el
   primero pregunta qué saldría y lo enseña, el segundo confirma.

   Lo que se comprueba:

   1 · que el primer viaje NO lleve confirmar, y el segundo sí. Si el
       primero facturara, el aviso de confirmación llegaría tarde —
       estaría contando algo que ya pasó.
   2 · que decir que no en el aviso no mande nada. Un "cancelar" que
       factura igual es peor que no tener aviso.
   3 · que el navegador no mande el importe. El precio sale de la
       base; lo único que viaja de aquí es qué reto. Una página que
       puede decir cuánto cobrar es una página que puede cobrar mal.
   4 · que el aviso diga MODO PRODUCCIÓN cuando lo es, con el
       importe y el correo de quien lo va a recibir.
   5 · que cada negativa del servidor se traduzca a algo que se
       entienda — y que la de "sin promesas" no llegue nunca a
       ofrecer confirmar.

   Se corre el código DE VERDAD, sacado de index.html.

       node prueba-licencia-admin.js
   ══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');

let fallos = 0;
const ok  = (m) => console.log('  ok   ' + m);
const mal = (m) => { fallos++; console.log('  MAL  ' + m); };
const eq  = (a, b, m) => (JSON.stringify(a) === JSON.stringify(b)
  ? ok(m + ' → ' + JSON.stringify(a))
  : mal(m + '\n         esperaba: ' + JSON.stringify(b) +
            '\n         vino:     ' + JSON.stringify(a)));

/* ── El código de verdad ────────────────────────────────────────── */
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const desde = html.indexOf('const centavos =');
const hasta = html.indexOf('/* La ventana, ya creado el reto.');
if (desde < 0 || hasta < 0) { console.error('no encuentro el bloque de la licencia'); process.exit(1) }

/* ── Las piezas de fuera ────────────────────────────────────────── */
let viajes = [];        // cada fetch que sale
let respuestas = [];    // lo que contesta el servidor, en orden
let avisos = [];        // lo que se le enseña al usuario
let diceQueSi = true;   // lo que contesta el confirm
let recargas = 0;

const TEXTOS = {
  licBtn:'Facturar la licencia',
  licConfirm:'¿Facturar la licencia de este evento?\n\n{M} a {E}\n\nPlantilla: {R} · Promesas anotadas: {P}\nSe paga en {D} días.',
  licLive:'MODO PRODUCCIÓN — esto manda una factura de verdad, por correo, a un cliente de verdad.',
  licTest:'Modo de prueba — no se mueve dinero de verdad.',
  licDone:'Facturada. Stripe le mandó {M} a {E}.',
  licAlready:'Este evento ya tiene licencia. Un evento se factura una sola vez.',
  licNoPledges:'Este evento no recogió ni una promesa, así que no hay nada que facturar. Sin promesas, sin cargo — es lo que aceptó el programa.',
  licNoEmail:'No hay correo de este programa, así que no hay a quién facturarle.',
  licStripe:'Stripe no aceptó la factura, así que no se cobró nada y no quedó nada apuntado.',
  licNoEndpoint:'Ese servidor de pagos no tiene el endpoint de la licencia.',
  licUnreachable:'No se pudo llegar al servidor de pagos. No se facturó nada.',
  notSaved:'No se guardó nada.'
};

const contexto = {
  console: { log(){}, error(){} },
  t: (k) => TEXTOS[k] || k,
  alert: (m) => avisos.push(m),
  confirm: (m) => { avisos.push(m); return diceQueSi },
  loadChallenges: () => { recargas++ },
  currentToken: async () => 'TOKEN123',
  PAYMENT_SERVER: 'https://servidor-de-pagos',
  async fetch(url, opts) {
    viajes.push({ url, opts, body: JSON.parse(opts.body) });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return { status: r.code, async json(){ return r.j } };
  }
};
vm.createContext(contexto);
vm.runInContext(html.slice(desde, hasta), contexto, { filename: 'index.html (licencia)' });
/* Las funciones declaradas sí quedan en el contexto; un `const` del
   nivel de arriba, no — así es el lenguaje, no el vm. Así que se
   piden por su nombre en vez de sacarlas del objeto. */
const [facturarLicencia, licenciaProblema, centavos] =
  vm.runInContext('[facturarLicencia, licenciaProblema, centavos]', contexto);

const VISTA = { code: 200, j: {
  vista_previa: true, modo: 'live', challenge: 'Demo Hooporia', programa: 'Diamantes',
  roster: 12, promesas: 3, cobrable: true, amount_cents: 4900,
  program_name: 'John', program_email: 'coach@programa.com', dias: 7
}};
const HECHO = { code: 200, j: { ok: true, amount_cents: 4900,
  program_email: 'coach@programa.com', stripe_invoice_id: 'in_1',
  url: 'https://invoice.stripe.com/x' }};

const reset = (...rs) => { viajes = []; avisos = []; recargas = 0;
                           diceQueSi = true; respuestas = rs };

(async () => {

console.log('\n1 · Los centavos, dichos como dinero\n');
eq(centavos(4900), '$49.00', 'cuarenta y nueve');
eq(centavos(2900), '$29.00', 'veintinueve');
eq(centavos(0), '$0.00', 'y cero es cero, no vacío');

console.log('\n2 · Dos viajes, y el primero no factura\n');
reset(VISTA, HECHO);
await facturarLicencia('RETO1');
eq(viajes.length, 2, 'salen dos');
eq(viajes[0].body, { challenge_id:'RETO1', confirmar:false }, 'el primero pregunta');
eq(viajes[1].body, { challenge_id:'RETO1', confirmar:true  }, 'el segundo confirma');
eq(viajes[0].url, 'https://servidor-de-pagos/licencia', 'al endpoint de la licencia');
eq(viajes[0].opts.headers.Authorization, 'Bearer TOKEN123', 'con la sesión del admin');

/* Lo que NO viaja. El precio vive en la base; si el navegador
   pudiera mandarlo, cualquiera con la consola abierta podría
   facturar lo que quisiera. */
const claves = Object.keys(viajes[1].body).sort();
eq(claves, ['challenge_id','confirmar'], 'y no viaja nada más — ni el importe');

eq(recargas, 1, 'y la lista se vuelve a leer al terminar');
eq(/Facturada\. Stripe le mandó \$49\.00 a coach@programa\.com/.test(avisos[1]), true,
   'con un remate que dice qué salió y a dónde');

console.log('\n3 · El aviso, antes de que salga nada\n');
reset(VISTA, HECHO);
await facturarLicencia('RETO1');
const aviso = avisos[0];
eq(/\$49\.00 a coach@programa\.com/.test(aviso), true, 'dice cuánto y a quién');
eq(/Plantilla: 12/.test(aviso), true, 'con la plantilla con la que se decidió el precio');
eq(/Promesas anotadas: 3/.test(aviso), true, 'y las promesas que lo hacen cobrable');
eq(/Se paga en 7 días/.test(aviso), true, 'y los siete días');
eq(/MODO PRODUCCIÓN/.test(aviso), true, 'y avisa de que la llave es de producción');

reset(Object.assign({}, VISTA, { j: Object.assign({}, VISTA.j, { modo:'test' }) }), HECHO);
await facturarLicencia('RETO1');
eq(/MODO PRODUCCIÓN/.test(avisos[0]), false, 'en pruebas no asusta');
eq(/Modo de prueba/.test(avisos[0]), true, 'pero dice en qué modo está');

console.log('\n4 · Decir que no\n');
reset(VISTA);
diceQueSi = false;
await facturarLicencia('RETO1');
eq(viajes.length, 1, 'se queda en la pregunta');
eq(recargas, 0, 'y no pasa nada más');

console.log('\n5 · Cada negativa, dicha en cristiano\n');
const caso = async (r, espera, m) => {
  reset(r);
  await facturarLicencia('RETO1');
  eq(viajes.length, 1, m + ' — un solo viaje');
  eq(avisos[0], espera, m);
};
await caso({ code:422, j:{ error:'sin_promesas' } }, TEXTOS.licNoPledges,
           'sin promesas no se ofrece ni confirmar');
await caso({ code:409, j:{ error:'ya_facturada' } }, TEXTOS.licAlready,
           'ya facturada');
await caso({ code:422, j:{ error:'sin_correo' } }, TEXTOS.licNoEmail,
           'sin correo del programa');
await caso({ code:404, j:{} }, TEXTOS.licNoEndpoint,
           'y un servidor sin el endpoint se dice tal cual');
await caso({ code:403, j:{ error:'Not authorized' } }, TEXTOS.notSaved,
           'sin permiso');

console.log('\n6 · Si Stripe falla en el segundo viaje\n');
reset(VISTA, { code:502, j:{ error:'stripe', why:'tarjeta rechazada' } });
await facturarLicencia('RETO1');
eq(/no se cobró nada/.test(avisos[1]), true, 'se dice que no se cobró nada');
eq(/tarjeta rechazada/.test(avisos[1]), true, 'y lo que dijo Stripe');
eq(recargas, 1, 'y la lista se refresca igual, por si quedó algo a medias');

console.log('\n7 · Si no se llega al servidor\n');
reset(new Error('ECONNREFUSED'));
await facturarLicencia('RETO1');
eq(/No se facturó nada/.test(avisos[0]), true, 'se dice que no se facturó nada');

console.log('\n8 · Sin sesión\n');
reset(VISTA);
contexto.currentToken = async () => null;
await facturarLicencia('RETO1');
eq(viajes.length, 0, 'sin sesión no sale ni el primer viaje');

console.log('\n' + (fallos === 0
  ? '✓ el botón pregunta antes de cobrar, y no cobra solo'
  : '✗ ' + fallos + ' fallo(s)'));
process.exit(fallos === 0 ? 0 : 1);
})();
