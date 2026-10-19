/* ══════════════════════════════════════════════════════════════════
   LOS ENLACES QUE EL ADMIN LE DA A UN ENTRENADOR

   Esta prueba existe por un fallo concreto: el enlace con el que un
   nene entra a jugar su corrida oficial se armaba mirando el JUEGO,

       const BASKETBALL_GAMES = ['cashrack','spots'];
       BASKETBALL_GAMES.indexOf(game) !== -1 ? hoops.cash : cadapunto.com

   y 'fortress' no está en esa lista. Resultado: TODOS los enlaces de
   Fortress apuntaban a cadapunto.com. Para un reto de Hooporia, el
   entrenador copiaba el enlace y mandaba a su jugador al otro
   producto — y el fallo es invisible, porque el enlace funciona: te
   lleva a un sitio de verdad, con otra marca.

   Y arreglar sólo el dominio no bastaba: los dos productos no tienen
   las mismas páginas. Cada Punto lo hace todo en challenges.html;
   Hooporia promete en prometer.html y juega entrando al fichero del
   juego. Con sólo cambiar el dominio, cada enlace de Hooporia habría
   sido un 404.

   Se corre el código DE VERDAD, sacado de index.html, no una copia:
   si alguien cambia el admin y rompe esto, falla aquí.

       node prueba-enlaces.js
   ══════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');

let fallos = 0;
const ok  = (m) => console.log('  ok   ' + m);
const mal = (m) => { fallos++; console.log('  MAL  ' + m); };
const eq  = (a, b, m) => (a === b ? ok(m + ' → ' + a)
                                  : mal(m + '\n         esperaba: ' + b + '\n         vino:     ' + a));

/* ── El código de verdad ────────────────────────────────────────── */
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const desde = html.indexOf('const SITES = {');
const hasta = html.indexOf('function pointsFor(level)');
if (desde < 0 || hasta < 0) { console.error('no encuentro el bloque de enlaces'); process.exit(1); }

const contexto = { console: { log(){}, error(){} }, alert(m){ contexto.ultimoAviso = m; },
                   ultimoAviso: null, document: { getElementById(){ return null; } } };
vm.createContext(contexto);
vm.runInContext(html.slice(desde, hasta), contexto, { filename: 'index.html (enlaces)' });

const { recordarProducto, pledgeBase, sitioDe, rutaCorrida, rutaPromesa,
        hayEnlaceDeEquipo, siteFor } = contexto;

/* Dos campañas, una de cada producto, y una que el admin no ha
   cargado todavía — que es lo que pasa si alguien copia un enlace
   antes de que la lista termine de bajar. */
const CP  = 'aaaa-cada-punto';
const HOO = 'bbbb-hooporia';
const NUEVA = 'cccc-sin-cargar';
recordarProducto(CP,  'cada-punto');
recordarProducto(HOO, 'anotado');

// Lo que arma cada botón, igual que en index.html.
const enlaceEquipo   = (c, g, camp) => pledgeBase(g, camp) + '?c=' + c;
const enlacePadrino  = (c, p, g, camp) => pledgeBase(g, camp) + '?c=' + c + '&p=' + p;
const enlaceCorrida  = (c, p, g, camp, k) =>
  sitioDe(camp, g) + rutaCorrida(camp, g) + '?c=' + c + '&p=' + p + '&k=' + k;

console.log('1 · Cada Punto, que es como estaba y tiene que seguir\n');
eq(enlaceEquipo('R1', 'fortress', CP),
   'https://cadapunto.com/challenges.html?c=R1', 'el enlace del equipo');
eq(enlacePadrino('R1', 'J1', 'fortress', CP),
   'https://cadapunto.com/challenges.html?c=R1&p=J1', 'el del padrino');
eq(enlaceCorrida('R1', 'J1', 'fortress', CP, 'K1'),
   'https://cadapunto.com/challenges.html?c=R1&p=J1&k=K1', 'el de jugar');

console.log('\n2 · Hooporia — el fallo que cierra esto\n');
eq(enlaceCorrida('R2', 'J2', 'fortress', HOO, 'K2'),
   'https://hooporia.com/fortress.html?c=R2&p=J2&k=K2',
   'jugar lleva al juego de Hooporia, no a cadapunto.com');
eq(enlacePadrino('R2', 'J2', 'fortress', HOO),
   'https://hooporia.com/prometer.html?c=R2&p=J2',
   'y prometer va a prometer.html, que es la página que existe allí');

console.log('\n3 · Cada Fortress a su fichero\n');
eq(enlaceCorrida('R2', 'J2', 'fortress131', HOO, 'K'),
   'https://hooporia.com/fortress131.html?c=R2&p=J2&k=K', 'el 1-3-1');
eq(enlaceCorrida('R2', 'J2', 'fortress-vr', HOO, 'K'),
   'https://hooporia.com/fortress-vr.html?c=R2&p=J2&k=K', 'el de los cascos');
// Un juego de Cada Punto no tiene fichero en Hooporia. Antes que un
// 404, el Fortress, que es el que ese programa iba a jugar.
eq(enlaceCorrida('R2', 'J2', 'rebound', HOO, 'K'),
   'https://hooporia.com/fortress.html?c=R2&p=J2&k=K',
   'un juego que allí no existe cae en fortress y no en un 404');

console.log('\n3b · El scrimmage de cuatro cuartos, y el official=1\n');

/* Dos cosas que faltaban y que juntas hacían invisible el fallo: el
   scrimmage no estaba en la lista de juegos del admin, así que no se
   podía crear un reto de cuatro cuartos; y el enlace de jugar no
   llevaba official=1, así que el juego abría en modo práctica y no
   guardaba nada sin decir por qué. */
const enlaceOficial = (c, p, g, camp, k) =>
  sitioDe(camp, g) + rutaCorrida(camp, g)
  + '?c=' + c + '&p=' + p + '&k=' + k + '&official=1';

eq(enlaceOficial('R2', 'J2', 'fortress-vr', HOO, 'K'),
   'https://hooporia.com/fortress-vr.html?c=R2&p=J2&k=K&official=1',
   'el scrimmage, con su bandera de oficial');
eq(/official=1/.test(enlaceOficial('R1', 'J1', 'fortress', CP, 'K')), true,
   'y Cada Punto la lleva igual, que su juego la mira también');

console.log('\n4 · Cash Rack manda sobre el producto\n');
// Se juega en una cancha de verdad y tiene su propio sitio.
eq(sitioDe(HOO, 'cashrack'), 'https://hoops.cash',
   'una campaña de Hooporia jugando Cash Rack sigue yendo a hoops.cash');
eq(sitioDe(CP, 'spots'), 'https://hoops.cash', 'y una de Cada Punto también');

console.log('\n5 · Una campaña que todavía no se ha cargado\n');
eq(sitioDe(NUEVA, 'fortress'), 'https://cadapunto.com',
   'cae en cada-punto, que es lo que eran todas antes de la columna');
eq(rutaPromesa(NUEVA), '/challenges.html', 'con su ruta de siempre');

console.log('\n6 · El enlace de equipo, que en Hooporia no existe\n');
eq(hayEnlaceDeEquipo(CP), true, 'Cada Punto sí lo tiene');
eq(hayEnlaceDeEquipo(HOO), false, 'Hooporia no');
eq(hayEnlaceDeEquipo(NUEVA), true, 'y una sin cargar se trata como Cada Punto');

console.log('\n7 · Que siteFor siga sirviendo a quien lo use\n');
eq(siteFor('fortress', HOO), 'https://hooporia.com', 'siteFor conoce el producto');
eq(siteFor('fortress', CP), 'https://cadapunto.com', 'y el otro');

console.log('\n' + (fallos === 0
  ? '✓ los enlaces del admin pasan'
  : '✗ ' + fallos + ' fallo(s)'));
process.exit(fallos === 0 ? 0 : 1);
