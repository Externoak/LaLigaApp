import { parseLineupFromHTML } from './onceParser';

// Regresión: la página de pretemporada ("once tipo y mapa rotacional") no
// tiene la lista .jugador.tipo_lista — los titulares vienen como wrappers de
// camiseta con data-onceFF="titular" y las alternativas como anchors pos-1+.
// El parser devolvía 0 jugadores y Onces Probables mostraba la formación vacía.

const fieldWrapper = ({ id, top, name, fullName, clase = 'campo', lesion = '-1', alternatives = [] }) => `
  <div class="jugador_${id} ${clase} camiseta-wrapper" style="left: 50%; top: ${top}%" data-onceFF="titular">
    <a class="camiseta" href="#">
      <div class="fotocontainer laliga">
        <img alt="${fullName}" class="img" src="x.png" />
      </div>
    </a>
    <div class="juggadores">
      <a class="juggador pos-0 flex-column" data-lesion="${lesion}" href="#">
        <span class="truncate-name mx-auto">${name}</span>
        <div class="view valores is-flex d-none"><span class="data-valor" data-valor="1">1,00M</span></div>
      </a>
      ${alternatives.map((alt, i) => `
        <a class="juggador pos-${i + 1} flex-column" data-lesion="-1" href="#">
          ${alt.bare ? alt.name : `<span class="truncate-name mx-auto">${alt.name}</span>`}
        </a>`).join('')}
    </div>
  </div>`;

const buildPreseasonHtml = () => `
  <html><body>
    <strong class="nombre-entrenador">Manuel Pellegrini</strong>
    <div class="tipo_lista_header jugador tipo_lista block-new"><span class="nombre">Jugador</span></div>
    ${fieldWrapper({ id: 3686, top: 87, clase: 'portero', name: 'Valles', fullName: 'Álvaro Valles', alternatives: [{ name: 'Pau López' }, { name: 'Guilherme', bare: true }] })}
    ${fieldWrapper({ id: 707, top: 70, name: 'D. Llorente', fullName: 'Diego Javier Llorente', alternatives: [{ name: 'Bartra' }] })}
    ${fieldWrapper({ id: 2632, top: 48, name: 'Fornals', fullName: 'Pablo Fornals', alternatives: [{ name: 'Deossa' }] })}
    ${fieldWrapper({ id: 9750, top: 27, name: 'Abde', fullName: 'Abde Ezzalzouli', lesion: '1' })}
    ${fieldWrapper({ id: 8405, top: 27, name: 'Antony', fullName: 'Antony', alternatives: [{ name: 'Ruibal' }] })}
    ${fieldWrapper({ id: 2153, top: 66, name: 'Bellerín', fullName: 'Héctor Bellerín', alternatives: [{ name: 'Ruibal' }] })}
  </body></html>`;

describe('parseLineupFromHTML — modo campo (once tipo de pretemporada)', () => {
    const result = parseLineupFromHTML(buildPreseasonHtml(), 'betis');

    test('extrae los titulares de los wrappers de camiseta', () => {
        expect(result).not.toBeNull();
        const names = result.players.starting.map((p) => p.nickname);
        expect(names).toEqual(expect.arrayContaining(['Valles', 'D. Llorente', 'Fornals', 'Abde', 'Antony', 'Bellerín']));
        expect(result.players.starting).toHaveLength(6);
    });

    test('usa el alt de la camiseta como nombre completo', () => {
        const fornals = result.players.starting.find((p) => p.nickname === 'Fornals');
        expect(fornals.name).toBe('Pablo Fornals');
    });

    test('deriva la posición de la clase portero y de la coordenada top', () => {
        const byNick = (n) => [...result.players.starting, ...result.players.bench].find((p) => p.nickname === n);
        expect(byNick('Valles').position).toBe('Portero');
        expect(byNick('D. Llorente').position).toBe('Defensa');
        expect(byNick('Fornals').position).toBe('Centrocampista');
        expect(byNick('Antony').position).toBe('Delantero');
    });

    test('las alternativas del mapa rotacional van al banquillo sin duplicados', () => {
        const benchNames = result.players.bench.map((p) => p.nickname);
        expect(benchNames).toEqual(expect.arrayContaining(['Pau López', 'Guilherme', 'Bartra', 'Deossa', 'Ruibal']));
        // Ruibal es alternativa en dos posiciones → una sola entrada
        expect(benchNames.filter((n) => n === 'Ruibal')).toHaveLength(1);
    });

    test('mapea data-lesion a estado (1 → duda)', () => {
        const abde = result.players.starting.find((p) => p.nickname === 'Abde');
        expect(abde.status).toBe('doubt');
    });
});

// Regresión: el nombre COMPLETO para el matcher debe salir del slug del href
// (/jugadores/{slug}), no solo del apellido de la camiseta. Así "Galilea"
// (apodo API "Einar") se casa vía el nombre completo "Einar Galilea".
const slugWrapper = ({ id, top, slug, display, clase = 'campo', alts = [] }) => `
  <div class="jugador_${id} ${clase} camiseta-wrapper" style="left: 50%; top: ${top}%" data-onceFF="titular">
    <a class="camiseta" href="https://www.futbolfantasy.com/jugadores/${slug}">
      <div class="fotocontainer laliga"><img class="img" src="x.png" /></div>
    </a>
    <div class="juggadores">
      <a class="juggador pos-0 flex-column" data-lesion="-1" href="https://www.futbolfantasy.com/jugadores/${slug}">
        <span class="truncate-name mx-auto">${display}</span>
      </a>
      ${alts.map((a, i) => `
        <a class="juggador pos-${i + 1} flex-column" data-lesion="-1" href="https://www.futbolfantasy.com/jugadores/${a.slug}">
          <span class="truncate-name mx-auto">${a.display}</span>
        </a>`).join('')}
    </div>
  </div>`;

describe('parseLineupFromHTML — nombre completo desde el slug del href', () => {
    // La camiseta NO lleva alt a propósito: forzamos que el nombre venga del slug.
    const html = `<html><body>
      ${slugWrapper({ id: 3174, top: 66, slug: 'einar-galilea', display: 'Galilea', alts: [{ slug: 'angel-recio', display: 'Recio' }] })}
      ${slugWrapper({ id: 7703, top: 48, slug: 'ramon-enriquez', display: 'Enríquez' })}
    </body></html>`;
    const result = parseLineupFromHTML(html, 'malaga');

    test('el titular usa el slug como nombre completo, apellido como nickname', () => {
        const galilea = result.players.starting.find((p) => p.nickname === 'Galilea');
        expect(galilea).toBeTruthy();
        expect(galilea.name).toBe('Einar Galilea');
        const enriquez = result.players.starting.find((p) => p.nickname === 'Enríquez');
        expect(enriquez.name).toBe('Ramon Enriquez');
    });

    test('las alternativas también obtienen el nombre completo del slug', () => {
        const recio = result.players.bench.find((p) => p.nickname === 'Recio');
        expect(recio).toBeTruthy();
        expect(recio.name).toBe('Angel Recio');
    });
});
