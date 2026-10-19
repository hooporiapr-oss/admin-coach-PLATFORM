/* ══════════════════════════════════════════════════════════════════
   QUÉ JUEGOS SE PUEDEN ESCOGER AL CREAR UN RETO

   Este admin lo usan los dos productos, pero los dos productos no
   tienen los mismos juegos. La portada de Hooporia enseña un solo
   tablero —el scrimmage de cuatro cuartos— y es el único que guarda
   cuarto a cuarto, con cp_record_quarter. Los demás escriben una
   sola corrida con record_official_run.

   Mientras la lista fue la misma para todo el mundo, un reto de
   Hooporia se podía crear sobre un camino que nadie ha andado de
   punta a punta: el enlace abre, el nene juega, y lo que se guarda
   no es lo que el informe sabe leer. Eso no se ve al crearlo. Se ve
   el día del partido.

   Lo que se comprueba aquí tiene dos caras, y la segunda importa
   tanto como la primera:

   1 · que una campaña de Hooporia sólo ofrezca el scrimmage.
   2 · que una de Cada Punto siga ofreciendo sus seis juegos. El
       arreglo de un producto no puede quitarle los juegos al otro,
       que ahí hay retos corriendo.

   Y una tercera, que es la que lo rompía antes de que existiera:
   una campaña recién creada, cuyo producto el admin todavía no ha
   aprendido, no puede caer en la lista equivocada.

   Se corre el código DE VERDAD, sacado de index.html, no una copia.

       node prueba-juegos.js
   ══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');

let fallos = 0;
const ok  = (m) => console.log('  ok   ' + m);
const mal = (m) => { fallos++; console.log('  MAL  ' + m); };
const eq  = (a, b, m) => (String(a) === String(b) ? ok(m + ' → ' + a)
  : mal(m + '\n         esperaba: ' + b + '\n         vino:     ' + a));

/* ── El código de verdad, en dos trozos ─────────────────────────── */
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
function trozo(desde, hasta, qué) {
  const a = html.indexOf(desde), b = html.indexOf(hasta);
  if (a < 0 || b < 0 || b < a) { console.error('no encuentro ' + qué); process.exit(1) }
  return html.slice(a, b);
}
const codigo =
  trozo('const SITES = {', 'function pointsFor(level)', 'el bloque de enlaces') +
  trozo('const JUEGOS_RETO = {', 'async function createChallenge()', 'la lista de juegos');

/* ── Un DOM del tamaño justo ─────────────────────────────────────
   Un <select> de verdad hace una cosa que importa: al reemplazarle
   las opciones, el valor pasa a ser el de la primera. Sin eso, la
   prueba diría que el juego escogido sigue siendo 'recall' cuando
   en el navegador ya sería otro. */
function unSelect() {
  const el = { valores: [], nombres: [], value: '',
               setAttribute(k, v){ this['_' + k] = v },
               getAttribute(k){ return this['_' + k] },
               textContent: '' };
  Object.defineProperty(el, 'innerHTML', {
    get(){ return this.valores.map((v, i) =>
             '<option value="' + v + '">' + this.nombres[i] + '</option>').join('') },
    set(h){
      this.valores = []; this.nombres = [];
      const re = /<option value="([^"]*)">([^<]*)<\/option>/g;
      let m; while ((m = re.exec(h))) { this.valores.push(m[1]); this.nombres.push(m[2]) }
      this.value = this.valores[0] || '';
    }
  });
  return el;
}

const campo = unSelect();            // #challengeGame
const camp  = { value: '' };         // #challengeCampaign
const nota  = { textContent: '', atributos: {},
                setAttribute(k, v){ this.atributos[k] = v },
                getAttribute(k){ return this.atributos[k] } };

const DOM = { challengeGame: campo, challengeCampaign: camp, gameNote: nota };
const contexto = {
  console: { log(){}, error(){} },
  document: { getElementById: (id) => DOM[id] || null },
  // t() devuelve la llave, que es lo que queremos comprobar: cuál
  // de las dos notas se pinta, no cómo está escrita.
  t: (k) => k
};
vm.createContext(contexto);
vm.runInContext(codigo, contexto, { filename: 'index.html (juegos del reto)' });
const { recordarProducto, pintarJuegosDelReto } = contexto;

const HOO = 'bbbb-hooporia';
const CP  = 'aaaa-cada-punto';
const NUEVA = 'cccc-sin-cargar';
recordarProducto(HOO, 'anotado');
recordarProducto(CP,  'cada-punto');

const pintar = (id) => { camp.value = id; pintarJuegosDelReto() };

console.log('\n1 · Hooporia: un tablero y nada más\n');
pintar(HOO);
eq(campo.valores.join(','), 'fortress-vr', 'la única opción es el scrimmage');
eq(campo.nombres[0], 'The Fortress — scrimmage, 4 quarters', 'y se llama por su nombre');
eq(campo.value, 'fortress-vr', 'que es con lo que se crearía el reto');
eq(nota.getAttribute('data-i18n'), 'gameNoteAnotado', 'con su nota, no la de la escuela');
eq(nota.textContent, 'gameNoteAnotado', 'y la nota pintada es ésa');

// Lo que ya no se puede escoger. Uno por uno, que una lista con el
// largo correcto y el contenido equivocado pasaría la de arriba.
['fortress', 'fortress131', 'recall', 'replay', 'rebound', 'cashrack', 'spots']
  .forEach(g => eq(campo.valores.indexOf(g), -1, 'ya no se ofrece ' + g));

console.log('\n2 · Cada Punto: intacto, que ahí hay retos corriendo\n');
pintar(CP);
eq(campo.valores.join(','),
   'fortress,recall,replay,rebound,fortress-vr,fortress131',
   'sus seis juegos, en su orden');
eq(nota.getAttribute('data-i18n'), 'gameNote', 'y su nota de siempre');

console.log('\n3 · Una campaña cuyo producto no se ha cargado\n');
pintar(NUEVA);
eq(campo.valores.length, 6, 'cae en cada-punto, que es lo que eran todas antes');
eq(nota.getAttribute('data-i18n'), 'gameNote', 'con su nota');

console.log('\n4 · Cambiar de campaña sin dejar un juego colgando\n');
/* Lo que no puede pasar: escoger The Recall en una campaña de Cada
   Punto, cambiar a una de Hooporia, y que el reto se cree con
   'recall' porque el valor viejo se quedó pegado al select. */
pintar(CP);
campo.value = 'recall';
pintar(HOO);
eq(campo.value, 'fortress-vr', 'el juego que ya no existe no se queda pegado');

/* Y al revés, lo que sí tiene que respetarse: si lo escogido sigue
   estando, cambiar de campaña no se lo cambia a nadie. */
pintar(CP);
campo.value = 'rebound';
pintar(CP);
eq(campo.value, 'rebound', 'lo escogido se respeta si sigue en la lista');

pintar(HOO);
campo.value = 'fortress-vr';
pintar(CP);
eq(campo.value, 'fortress-vr', 'y el scrimmage se respeta al pasar a Cada Punto');

console.log('\n5 · Y sin campaña escogida todavía\n');
pintar('');
eq(campo.valores.length, 6, 'la lista larga, que es la que no asume nada');

console.log('\n' + (fallos === 0
  ? '✓ cada producto ofrece lo suyo'
  : '✗ ' + fallos + ' fallo(s)'));
process.exit(fallos === 0 ? 0 : 1);
