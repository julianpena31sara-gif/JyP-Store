/* =========================================================
   J&P Store — Lógica de la tienda
   ========================================================= */
(() => {
'use strict';

/* ---------- CONFIGURACIÓN ---------- */
const LS_KEY = 'jyp_store_v1';
const PH = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#050505"/><text x="50%" y="55%" font-size="60" text-anchor="middle" fill="#1a1a1a">IMG</text></svg>'
);

const MAX_IMG_CANDIDATES = 8;

const BRAND_PATHS = {
  logo: [
    'img/marca/logo.png',
    'img/marca/logo.jpg',
    'img/marca/logo.webp',
    'img/marca/logo.svg'
  ],
  banner: [
    'img/marca/banner.jpg',
    'img/marca/banner.png',
    'img/marca/banner.webp'
  ],
  favicon: [
    'img/marca/favicon.png',
    'img/marca/favicon.jpg',
    'img/marca/favicon.svg',
    'img/marca/favicon.ico',
    'favicon.ico'
  ]
};

const DEFAULT_SETTINGS = {
  nombre: 'J&P Store',
  slogan: 'TODO LO QUE NECESITAS, EN UN SOLO LUGAR',
  heroText: 'En J&P Store encuentras todo lo que necesitas, en un solo lugar: tecnología, hogar, herramientas y mucho más, con envío seguro y la confianza que buscas.',
  whatsapp: '573167913339',
  currency: 'COP',
  shipping: 10000,
  freeFrom: 0,
  color: '#0d8bf0'
};

const state = {
  settings: { ...DEFAULT_SETTINGS },
  products: [],
  orders: [],
  cart: [],
  activeCat: 'Todos',
  searchQuery: '',
  tempImages: [],
  editingId: null,
  selRecaudo: 'Con Recaudo',
  selCarrier: 'Interrapidisimo',
  currentProduct: null,
  selTalla: '',
  selColor: '',
  selQty: 1,
  lbImages: [],
  lbIndex: 0
};

/* ---------- CACHÉ DE IMÁGENES ---------- */
const imageCache = new Map();

function probeImage(url){
  if (!url) return Promise.resolve(false);
  if (url.startsWith('data:')){ imageCache.set(url, true); return Promise.resolve(true); }
  if (imageCache.has(url)) return Promise.resolve(imageCache.get(url));
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => { imageCache.set(url, true);  resolve(true); };
    img.onerror = () => { imageCache.set(url, false); resolve(false); };
    img.src = url;
  });
}

async function findFirstExisting(paths){
  for (const p of paths){
    const ok = await probeImage(p);
    if (ok) return p;
  }
  return null;
}

function getPrimaryImage(p){
  return (p.img && p.img[0]) || PH;
}

function getKnownValidImages(p){
  const arr = p.img || [];
  const valid = arr.filter(u => imageCache.get(u) !== false);
  return valid.length ? valid : [PH];
}

/* ---------- COLORES ---------- */
function parseColor(c){
  if (typeof c === 'string'){
    const m = c.match(/^(.*?)\s*\(agotado\)\s*$/i);
    if (m) return { nombre: m[1].trim(), agotado: true };
    return { nombre: c.trim(), agotado: false };
  }
  return { nombre: c.nombre, agotado: !!c.agotado };
}

function parseColors(colores){
  return (colores || []).map(parseColor).filter(c => c.nombre);
}

function colorsToInput(colores){
  return parseColors(colores).map(c =>
    c.agotado ? `${c.nombre} (agotado)` : c.nombre
  ).join(', ');
}

/* ---------- UTILIDADES ---------- */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function money(n){
  n = Number(n) || 0;
  try {
    return new Intl.NumberFormat('es-CO', {
      style:'currency', currency:'COP',
      minimumFractionDigits:0, maximumFractionDigits:0
    }).format(n);
  } catch { return '$' + n.toLocaleString('es-CO'); }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

let toastTimer;
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function shadeColor(hex, percent){
  let r = parseInt(hex.slice(1,3),16),
      g = parseInt(hex.slice(3,5),16),
      b = parseInt(hex.slice(5,7),16);
  r = Math.max(0, Math.min(255, r + Math.round(255*percent/100)));
  g = Math.max(0, Math.min(255, g + Math.round(255*percent/100)));
  b = Math.max(0, Math.min(255, b + Math.round(255*percent/100)));
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function provClass(prov){
  const p = (prov || '').toLowerCase().trim();
  if (p === 'dtech') return 'dtech';
  if (p === 'itm')   return 'itm';
  if (p === 'emdel') return 'emdel';
  return '';
}

/* ---------- MANEJADOR DE ERROR DE IMAGEN ---------- */
window.handleImgError = function(imgEl){
  const pid = imgEl.dataset.pid;
  const idx = Number(imgEl.dataset.idx || 0);
  const p = state.products.find(x => x.id === pid);
  if (!p || !p.img || !p.img.length){
    imgEl.onerror = null;
    imgEl.src = PH;
    return;
  }
  const next = idx + 1;
  if (next < Math.min(p.img.length, MAX_IMG_CANDIDATES)){
    imgEl.dataset.idx = next;
    imgEl.src = p.img[next];
  } else {
    imgEl.onerror = null;
    imgEl.src = PH;
  }
};

/* ---------- PERSISTENCIA ---------- */
function save(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch { toast('Espacio lleno. Usa URLs de imágenes en vez de subir archivos.'); }
}

function load(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw){
      const d = JSON.parse(raw);
      Object.assign(state, {
        settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
        products: d.products || [],
        orders:   d.orders   || [],
        cart:     d.cart     || []
      });
      delete state.settings.pass;
    } else {
      state.products = demoProducts();
      save();
    }
  } catch(e){ console.warn('Error cargando datos', e); }
}

/**
 * MIGRACIÓN v3:
 * - Asigna proveedor a productos existentes sin proveedor
 * - Actualiza badge del walkie talkie a "Más vendido"
 * - Agrega los 4 productos nuevos de Emdel
 */
function migrateProducts(){
  const providerMap = {
    'airpods-pro-3-anc-2174138':     'Dtech',
    'smart-watch-ac10-serie-10':     'Dtech',
    'zapatero-6-niveles-2195373':    'Dtech',
    'secador-redden-proluxe-2140718':'Dtech',
    'intercomunicador-q58-2216196':  'Dtech',
    'parlante-jbl-boombox-3-1583443':'Dtech',
    'radio-walkietalkie-baofeng-2249709':'Dtech',
    'kit-taladro-813-mandril-2167630':'Dtech',
    'afnan-9pm-premium-1607165':     'Itm',
    'lattafa-khamrah-1589189':       'Itm',
    'asad-elixir-2258500':           'Itm',
    '212-vip-black-1551986':         'Itm'
  };

  state.products.forEach(p => {
    if (!p.proveedor && providerMap[p.id]){
      p.proveedor = providerMap[p.id];
    }
  });

  const wt = state.products.find(p => p.id === 'radio-walkietalkie-baofeng-2249709');
  if (wt && wt.badge !== 'Más vendido'){
    wt.badge = 'Más vendido';
  }

  if (!state.settings._migrated_jyp3){
    const demo = demoProducts();
    demo.forEach(d => {
      if (!state.products.find(p => p.id === d.id)){
        state.products.push(d);
      }
    });
    state.settings._migrated_jyp3 = true;
  }

  save();
}

/* =========================================================
   PRODUCTOS
   ========================================================= */
function demoProducts(){
  const mk = folder => Array.from({length:15}, (_,i) => `img/${folder}/${i+1}.jpg`);

  return [
    /* ---------- AIRPODS ---------- */
    {
      id: 'airpods-pro-3-anc-2174138',
      nombre: 'Audifonos Airpods Pro 3 ANC',
      desc: `AUDIFONOS AIRPODS PRO 3 ANC — ID: 2174138

DISEÑO Y CONSTRUCCIÓN
- Tipo: Auriculares inalámbricos TWS (True Wireless Stereo)
- Formato: In-ear (intraauricular)
- Material del cuerpo: Plástico ABS y policarbonato
- Almohadillas: Silicona desmontable
- Estuche de carga: Diseño compacto con tapa abatible

CONECTIVIDAD
- Tecnología inalámbrica: Bluetooth
- Compatibilidad: Smartphones Android, iPhone, tablets y dispositivos Bluetooth
- Alcance estimado: Hasta 10 metros en espacios abiertos

ALIMENTACIÓN
- Batería integrada en cada auricular
- Batería integrada en estuche de carga
- Recarga mediante puerto de carga del estuche
- Indicador LED frontal de estado de carga

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 70000, compara: 129900, costo: 0,
      sku: '2174138', categoria: 'Tecnología', proveedor: 'Dtech', stock: 20,
      tallas: [], colores: ['Blanco'], img: mk('airpods'),
      badge: 'Más vendido', destacado: true, activo: true
    },

    /* ---------- SMART WATCH ---------- */
    {
      id: 'smart-watch-ac10-serie-10',
      nombre: 'Smart Watch AC10 Serie 10',
      desc: `SMART WATCH AC10 SERIE 10

DISEÑO Y PANTALLA
- Pantalla: TFT táctil de 1.44 pulgadas
- Resolución: 240 x 240 píxeles
- Correa: Silicona intercambiable

CONECTIVIDAD
- Tecnología inalámbrica: Bluetooth 4.0 o superior
- Compatibilidad: Android 5.0 / iOS 9.0 y superiores
- App: FitPro / HiWatch

BATERÍA Y CARGA
- Capacidad: 150 mAh
- Autonomía: 2 a 5 días
- Carga: Magnética (cable USB incluido)
- Tiempo: 1.5 a 2 horas

FUNCIONES
- Notificaciones de llamadas y apps
- Frecuencia cardíaca y SpO2
- Registro del sueño
- Modos deportivos
- Control de música y cámara

VARIANTES
- Naranja · Blanco · Negro

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 56000, compara: 99900, costo: 0,
      sku: '1498729', categoria: 'Tecnología', proveedor: 'Dtech', stock: 15,
      tallas: [], colores: ['Naranja', 'Blanco', 'Negro'], img: mk('smartwatch'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* ---------- ZAPATERO ---------- */
    {
      id: 'zapatero-6-niveles-2195373',
      nombre: 'Zapatero 6 Niveles Doble 10 Secciones',
      desc: `ZAPATERO 6 NIVELES DOBLE 10 SECCIONES — ID: 2195373

Mantén tu calzado organizado y protegido con este Zapatero Organizador de 2 Columnas y 6 Niveles con Puertas Plegables.

CARACTERÍSTICAS
- Diseño de 2 columnas y 6 niveles
- Puertas plegables
- Protege del polvo
- Estructura resistente
- Separadores en tela microperforada
- Puertas plásticas blandas HDPE

ESPECIFICACIONES
- Tipo: Zapatero organizador
- Niveles: 6
- Material: Plástico resistente
- Uso: Interior
- Requiere ensamblaje: Sí

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 60000, compara: 109900, costo: 0,
      sku: '2195373', categoria: 'Hogar', proveedor: 'Dtech', stock: 12,
      tallas: [], colores: [], img: mk('zapatero'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* ---------- SECADOR ---------- */
    {
      id: 'secador-redden-proluxe-2140718',
      nombre: 'Secador Redden Proluxe 5000W',
      desc: `SECADOR REDDEN PROLUXE 5000W — ID: 2140718

Secador profesional de alto rendimiento para resultados tipo salón desde casa.

CARACTERÍSTICAS
- Potencia: 5000W
- Incluye difusor
- Boquillas concentradoras
- Control de temperatura
- Función aire frío
- Calor uniforme
- Diseño ergonómico
- Uso doméstico y semiprofesional

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 70000, compara: 129900, costo: 0,
      sku: '2140718', categoria: 'Hogar', proveedor: 'Dtech', stock: 15,
      tallas: [], colores: [], img: mk('secador'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* ---------- INTERCOMUNICADOR ---------- */
    {
      id: 'intercomunicador-q58-2216196',
      nombre: 'Intercomunicador Q58',
      desc: `INTERCOMUNICADOR Q58 — ID: 2216196

Comunicación inalámbrica, música y gestión de llamadas para cascos de motocicleta.

CARACTERÍSTICAS
- Comunicación inalámbrica entre cascos
- Reproducción de música
- Gestión de llamadas
- Pantalla informativa
- Reducción inteligente de ruido
- Resistente al agua y al polvo

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 80000, compara: 139900, costo: 0,
      sku: '2216196', categoria: 'Tecnología', proveedor: 'Dtech', stock: 10,
      tallas: [], colores: [], img: mk('intercomunicador'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* ---------- PARLANTE JBL ---------- */
    {
      id: 'parlante-jbl-boombox-3-1583443',
      nombre: 'Parlante Jbl Boombox 3',
      desc: `PARLANTE JBL BOOMBOX 3 — ID: 1583443

Sonido natural, claro y preciso con dispersión uniforme. (Réplica)

CARACTERÍSTICAS
- Sonido natural y preciso
- Dispersión uniforme
- Subwoofer integrado
- Tweeter integrado
- Alto rendimiento a volumen elevado
- Diseño versátil

ESPECIFICACIONES
- Medidas: 34 x 20 x 10 cm

VARIANTES
- Camuflado · Negro · Azul
- Rojo (Agotado)

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 100000, compara: 189900, costo: 0,
      sku: '1583443', categoria: 'Audio', proveedor: 'Dtech', stock: 10,
      tallas: [],
      colores: [
        { nombre: 'Camuflado', agotado: false },
        { nombre: 'Negro',     agotado: false },
        { nombre: 'Azul',      agotado: false },
        { nombre: 'Rojo',      agotado: true }
      ],
      img: mk('parlante'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* ---------- BAOFENG WALKIE TALKIE ---------- */
    {
      id: 'radio-walkietalkie-baofeng-2249709',
      nombre: 'Radio Walkietalkie Baofeng 2 Radios',
      desc: `RADIO WALKIE TALKIE BAOFENG BF-888S — ID: 2249709

Radiotransmisor portátil de mano con comunicación clara, estable y de largo alcance. Kit con 2 radios completos.

DISEÑO
- Formato: Portátil de mano
- Estructura reforzada
- Antena extraíble flexible
- Clip de cinturón incluido
- Color: Negro

CONECTIVIDAD
- Rango: 400 - 470 MHz (UHF)
- Canales: 16 programables
- Subtonos: 50 CTCSS y 105 DCS
- Potencia: Hasta 5W
- Alcance: 2 a 5 km en campo abierto

ALIMENTACIÓN
- Batería recargable Li-ion
- Base de carga doble incluida
- Autonomía: 8 - 12 horas

CONTENIDO
- 2 Radios Baofeng BF-888S
- 2 Baterías, 2 Antenas, 2 Clips
- 2 Cargadores + Base doble
- 1 Manual

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 75000, compara: 149900, costo: 0,
      sku: '2249709', categoria: 'Tecnología', proveedor: 'Dtech', stock: 12,
      tallas: [], colores: ['Negro'], img: mk('baofeng'),
      badge: 'Más vendido', destacado: false, activo: true
    },

    /* ---------- KIT TALADRO ---------- */
    {
      id: 'kit-taladro-813-mandril-2167630',
      nombre: 'Kit Taladro 813 Mandril Metalico De 12',
      desc: `KIT TALADRO 813 MANDRIl METÁLICO — ID: 2167630

Kit de herramientas inalámbricas 48V con taladro percutor y maletín organizador.

TALADRO
- Inalámbrico percutor
- Mandril metálico de 1/2" (13mm)
- 2 baterías recargables 48V
- Cargador incluido
- Diseño ergonómico

CONTENIDO
- 1 Taladro percutor
- 2 Baterías 48V + Cargador
- 1 Martillo
- 1 Alicate de punta + 1 universal
- 1 Llave ajustable
- 1 Cinta métrica
- Brocas y puntas
- Destornilladores de precisión
- 1 Maletín organizador

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 175000, compara: 329900, costo: 0,
      sku: '2167630', categoria: 'Herramientas', proveedor: 'Dtech', stock: 8,
      tallas: [], colores: [], img: mk('taladro'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* ---------- PERFUMES ---------- */

    /* AFNAN 9PM */
    {
      id: 'afnan-9pm-premium-1607165',
      nombre: 'Afnan 9pm Premium',
      desc: `AFNAN 9PM PREMIUM — ID: 1607165

Fragancia masculina oriental que combina frescura cítrica con calidez amaderada y especiada.

PIRÁMIDE OLFATIVA
- Salida: Manzana, canela, lavanda, bergamota
- Corazón: Flor de azahar, lirio de los valles
- Fondo: Ámbar, vainilla, haba tonka

CARACTERÍSTICAS
- Familia: Oriental amaderada
- Presentación: 100 ml
- Concentración: Eau de Parfum
- Género: Masculino
- Duración: 8 a 12 horas
- Estela: Intensa

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 85000, compara: 169900, costo: 0,
      sku: '1607165', categoria: 'Perfumes', proveedor: 'Itm', stock: 10,
      tallas: [], colores: [], img: mk('afnan'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* LATTAFA KHAMRAH */
    {
      id: 'lattafa-khamrah-1589189',
      nombre: 'Lattafa Khamrah Caja',
      desc: `LATTAFA KHAMRAH CAJA — ID: 1589189

Fragancia unisex envolvente con especias dulces, notas gourmand y maderas.

PIRÁMIDE OLFATIVA
- Salida: Canela, nuez moscada, bergamota
- Corazón: Dátiles, praliné, naranja
- Fondo: Vainilla, haba tonka, benjuí, mirra, amberwood

CARACTERÍSTICAS
- Familia: Especiada gourmand
- Presentación: 100 ml (con caja)
- Concentración: Eau de Parfum
- Género: Unisex
- Duración: 10 a 14 horas
- Estela: Muy intensa

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 80000, compara: 159900, costo: 0,
      sku: '1589189', categoria: 'Perfumes', proveedor: 'Itm', stock: 10,
      tallas: [], colores: [], img: mk('khamrah'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* ASAD ELIXIR */
    {
      id: 'asad-elixir-2258500',
      nombre: 'Asad Elixir',
      desc: `LATTAFA ASAD ELIXIR — ID: 2258500

Versión intensificada del icónico Asad. Potencia del tabaco y café con dulzura de vainilla y fondo amaderado.

PIRÁMIDE OLFATIVA
- Salida: Piña, pimienta negra, bergamota
- Corazón: Café, tabaco, incienso, iris
- Fondo: Vainilla, benjuí, ámbar, cedro, cuero, pachulí

CARACTERÍSTICAS
- Familia: Amaderada especiada
- Presentación: 100 ml
- Concentración: Eau de Parfum
- Género: Masculino
- Duración: 10 a 14 horas
- Estela: Potente y duradera

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 85000, compara: 179900, costo: 0,
      sku: '2258500', categoria: 'Perfumes', proveedor: 'Itm', stock: 10,
      tallas: [], colores: [], img: mk('asad'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* 212 VIP BLACK */
    {
      id: '212-vip-black-1551986',
      nombre: '212 Vip Black',
      desc: `212 VIP BLACK — ID: 1551986

Fragancia masculina moderna, nocturna y sofisticada.

PIRÁMIDE OLFATIVA
- Salida: Absenta, lavanda, hinojo
- Corazón: Pimienta negra, cardamomo
- Fondo: Cuero, vainilla, almizcle, benjuí, ámbar

CARACTERÍSTICAS
- Familia: Aromática especiada
- Presentación: 100 ml
- Concentración: Eau de Parfum
- Género: Masculino
- Duración: 8 a 10 horas
- Estela: Intensa

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 70000, compara: 149900, costo: 0,
      sku: '1551986', categoria: 'Perfumes', proveedor: 'Itm', stock: 10,
      tallas: [], colores: [], img: mk('vip212'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* =========================================================
       NUEVOS — PROVEEDOR EMDEL
       ========================================================= */

    /* CANDADO BIOMÉTRICO */
    {
      id: 'candado-biometrico-digital-2113673',
      nombre: 'Candado Biometrico Digital',
      desc: `CANDADO BIOMÉTRICO DIGITAL — ID: 2113673

Candado inteligente con apertura por huella digital. Seguridad y practicidad en un diseño elegante y resistente.

DESCRIPCIÓN
El candado biométrico inteligente de impresión digital es la elección perfecta para quienes buscan seguridad y practicidad. Fabricado en acero inoxidable de alta calidad, garantiza durabilidad y resistencia en cualquier ambiente interior.

Olvídate de las llaves tradicionales que podrían perderse o ser robadas. Con este candado tendrás acceso rápido y seguro a tus pertenencias usando solo tu huella digital.

CARACTERÍSTICAS
- Apertura por huella digital (biométrica)
- Alarma integrada antirrobo: si alguien intenta forzar la apertura, la alarma se activa
- Estructura en acero inoxidable de alta calidad
- Diseño horizontal elegante
- Color: Negro
- Uso: Interior
- Sin necesidad de llaves

BENEFICIOS
- Acceso rápido y seguro
- Mayor durabilidad y resistencia
- Capa adicional de seguridad con alarma
- Ideal para armarios, lockers, maletas, casilleros, cajones

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 65000, compara: 129900, costo: 0,
      sku: '2113673', categoria: 'Seguridad', proveedor: 'Emdel', stock: 15,
      tallas: [], colores: [], img: mk('candado'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* ARO DE LUZ RGB */
    {
      id: 'aro-de-luz-rgb-33cm-273712',
      nombre: 'Aro De Luz Rgb 33 Cm',
      desc: `ARO DE LUZ RGB LED 33 CM — ID: 273712

Kit de aro de luz profesional para fotografía, selfies, vlogs y streaming. Incluye trípode ajustable de 2.1 metros.

DESCRIPCIÓN
La luz de anillo de fotografía es ideal para tomar mejores selfies y vlogs personales. Los kits de luz de anillo de selfie agregan suficiente luz a tu rostro cuando grabas video, hacen que tus líneas faciales sean más estereoscópicas y más claras.

Fabricado con materiales plásticos de alta transmisión de luz: ligero, temperatura de color constante y baja pérdida.

Esta luz de anillo admite alimentación enchufable: puedes conectarla con un cargador de celular (se recomienda uno de carga rápida original, no incluido). Puede ayudarte a tomar bellas imágenes incluso en lugares donde la alimentación es inconveniente.

CARACTERÍSTICAS
- Aro de luz de 33 cm de diámetro
- Color: Negro
- Iluminación RGB con múltiples colores
- Soporte para celular incluido
- Trípode de 2.1 m de altura ajustable
- Material: Plástico
- Medidas: 33 cm x 210 cm x 4 cm

CONTENIDO
- 1 Aro de luz RGB de 33 cm
- 1 Soporte para celular
- 1 Trípode de 2.1 m ajustable

IDEAL PARA
- Selfies y fotografías
- Grabación de videos y vlogs
- Streaming en vivo
- Maquillaje profesional
- Contenido para redes sociales

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 90000, compara: 179900, costo: 0,
      sku: '273712', categoria: 'Tecnología', proveedor: 'Emdel', stock: 12,
      tallas: [], colores: ['Negro'], img: mk('aro'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* GAFAS VR BOX */
    {
      id: 'gafas-vr-box-120378',
      nombre: 'Gafas Vr Box Realidad Virtual',
      desc: `GAFAS VR BOX — REALIDAD VIRTUAL — ID: 120378

Vive la experiencia de realidad virtual con estas gafas de diseño ergonómico y cómodo.

¡Experimenta lo nuevo en imagen! Descubre un nuevo nivel de calidad y detalle gracias a estas increíbles gafas. Videos, películas y juegos se ven increíbles. Además, con su banda ajustable no tendrás inconvenientes con la comodidad.

CARACTERÍSTICAS DEL PRODUCTO
- Material: Polímero ABS
- Banda ajustable para mayor comodidad
- Soportes espumados para mayor confort
- Compatible con iOS y Android
- Rango de operación: 10 metros
- Conexión: Bluetooth
- Batería: 2 AA

IDEAL PARA
- Ver películas en formato inmersivo
- Jugar videojuegos compatibles con realidad virtual
- Ver videos 360°
- Experiencias educativas interactivas
- Realidad virtual casera

CONTENIDO
- 1 Par de gafas VR Box
- Banda ajustable

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 55000, compara: 109900, costo: 0,
      sku: '120378', categoria: 'Tecnología', proveedor: 'Emdel', stock: 15,
      tallas: [], colores: [], img: mk('gafasvr'),
      badge: 'Nuevo', destacado: false, activo: true
    },

    /* BOMBILLO PARLANTE */
    {
      id: 'bombillo-parlante-bluetooth-362355',
      nombre: 'Bombillo Parlante Con Bluetooth',
      desc: `BOMBILLO PARLANTE CON BLUETOOTH — ID: 362355

Bombillo LED con parlante Bluetooth integrado. Ilumina y reproduce música al mismo tiempo con control remoto.

DESCRIPCIÓN
Bombillo LED parlante Bluetooth. Con este dispositivo puedes escuchar música, apagar o encender la luz con el control remoto y cambiar los diversos colores de luz.

CARACTERÍSTICAS
- Control vía Bluetooth
- Apariencia de lámpara LED
- Conexión inalámbrica Bluetooth
- Base E27 (tipo tornillo)
- Volumen ajustable
- Luz y música al mismo tiempo
- Luz brillante comparable a bombilla halógena de 50W
- Control remoto para cambiar colores y encender/apagar

ESPECIFICACIONES
- Color de la cáscara: Blanco
- Interfaz: E27
- Voltaje: AC100V ~ 240V / 50-60Hz
- Potencia: 12W
- Potencia LED: 6W
- Potencia del altavoz: 3W
- Respuesta de frecuencia: 135 Hz a 15 KHz
- Versión Bluetooth: 3.0
- Configuración: A2DP
- Rango: 10 m (33 ft)
- Color de luz: RGB 16 colores (control remoto)
- Amplificador: Clase D
- Distancia de transmisión BT: 5-10 metros
- Sin contraseña de conexión
- Temperatura de trabajo: -40 ~ 80 °C

IDEAL PARA
- Fiestas y reuniones
- Ambiente y decoración
- Uso en hogar, terraza, bar
- Regalo original

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 50000, compara: 99900, costo: 0,
      sku: '362355', categoria: 'Hogar', proveedor: 'Emdel', stock: 20,
      tallas: [], colores: [], img: mk('bombillo'),
      badge: 'Nuevo', destacado: false, activo: true
    }
  ];
}

/* =========================================================
   RENDER TIENDA
   ========================================================= */
function applySettings(){
  const s = state.settings;
  document.documentElement.style.setProperty('--primary', s.color);
  document.documentElement.style.setProperty('--primary-hover', shadeColor(s.color, -20));
  document.title = s.nombre + ' — Todo lo que necesitas, en un solo lugar';
  $('heroText').textContent = s.heroText;
  $('footCopy').textContent = s.nombre + ' · Todos los derechos reservados';
}

async function applyBrand(){
  try {
    const [logoUrl, bannerUrl, faviconUrl] = await Promise.all([
      findFirstExisting(BRAND_PATHS.logo),
      findFirstExisting(BRAND_PATHS.banner),
      findFirstExisting(BRAND_PATHS.favicon)
    ]);

    if (logoUrl){
      const brandLogo = $('brandLogo');
      const brandText = $('brandText');
      const footLogo  = $('footLogo');
      const footText  = $('footText');
      if (brandLogo){
        brandLogo.onload = () => brandLogo.style.opacity = 1;
        brandLogo.src = logoUrl;
        brandLogo.classList.remove('hidden');
      }
      if (brandText) brandText.classList.add('hidden');
      if (footLogo){
        footLogo.onload = () => footLogo.style.opacity = 1;
        footLogo.src = logoUrl;
        footLogo.classList.remove('hidden');
      }
      if (footText) footText.classList.add('hidden');
    }

    if (bannerUrl){
      const heroSection = $('heroSection');
      const heroBanner  = $('heroBanner');
      if (heroSection && heroBanner){
        const pre = new Image();
        pre.onload = () => {
          heroBanner.style.backgroundImage = `url('${bannerUrl}')`;
          heroBanner.classList.remove('hidden');
          heroSection.classList.add('has-banner');
        };
        pre.src = bannerUrl;
      }
    }

    if (faviconUrl) applyFavicon(faviconUrl);
  } catch(e){ console.warn('applyBrand error', e); }
}

function applyFavicon(url){
  if (!url) return;
  const ext = url.split('.').pop().toLowerCase();
  const typeMap = {
    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
    svg:'image/svg+xml', ico:'image/x-icon', webp:'image/webp'
  };
  const type = typeMap[ext] || 'image/png';

  let iconLink = document.getElementById('faviconLink');
  if (!iconLink){
    iconLink = document.createElement('link');
    iconLink.id = 'faviconLink';
    iconLink.rel = 'icon';
    document.head.appendChild(iconLink);
  }
  iconLink.type = type;
  iconLink.href = url;

  let appleLink = document.querySelector('link[rel="apple-touch-icon"]');
  if (!appleLink){
    appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    document.head.appendChild(appleLink);
  }
  appleLink.href = url;

  let shortcut = document.querySelector('link[rel="shortcut icon"]');
  if (!shortcut){
    shortcut = document.createElement('link');
    shortcut.rel = 'shortcut icon';
    document.head.appendChild(shortcut);
  }
  shortcut.href = url;
}

/* ---------- NAV ---------- */
const NAV_ICONS = {
  home:    '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  laptop:  '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="2" y1="20" x2="22" y2="20"/>',
  chip:    '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  mouse:   '<rect x="6" y="3" width="12" height="18" rx="6"/><line x1="12" y1="7" x2="12" y2="11"/>',
  gamepad: '<line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.6l-.9 8A4 4 0 0 0 5.78 21c1.66 0 3.15-1 3.83-2.53l.33-.72a2 2 0 0 1 1.82-1.15h.48a2 2 0 0 1 1.82 1.15l.33.72A4.28 4.28 0 0 0 18.22 21a4 4 0 0 0 3.98-4.4l-.9-8A4 4 0 0 0 17.32 5z"/>',
  volume:  '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  box:     '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  tag:     '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  star:    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  tool:    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  spray:   '<path d="M9 2h6v4H9z"/><path d="M9 6v14a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V6"/><line x1="17" y1="8" x2="21" y2="8"/><line x1="17" y1="12" x2="19" y2="12"/><line x1="17" y1="16" x2="21" y2="16"/>',
  shield:  '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>'
};

function iconForCategory(cat){
  const c = (cat || '').toLowerCase();
  if (c.includes('tecnolog') || c.includes('comput'))  return 'laptop';
  if (c.includes('component'))                          return 'chip';
  if (c.includes('perif'))                              return 'mouse';
  if (c.includes('gaming'))                             return 'gamepad';
  if (c.includes('audio'))                              return 'volume';
  if (c.includes('accesor'))                            return 'box';
  if (c.includes('hogar'))                              return 'box';
  if (c.includes('herramient'))                         return 'tool';
  if (c.includes('perfum') || c.includes('fraganc'))    return 'spray';
  if (c.includes('seguridad'))                          return 'shield';
  if (c.includes('oferta'))                             return 'tag';
  return 'star';
}

function renderNav(){
  const cats = [...new Set(
    state.products
      .filter(p => p.activo !== false)
      .map(p => (p.categoria || '').trim())
      .filter(Boolean)
  )];

  const items = [{ label: 'Todos', icon: 'home' }];
  cats.forEach(c => items.push({ label: c, icon: iconForCategory(c) }));

  $('mainNavWrap').style.display = items.length > 1 ? '' : 'none';

  $('mainNav').innerHTML = items.map(it => `
    <a href="#" class="nav-item ${it.label === state.activeCat ? 'active' : ''}" data-cat="${esc(it.label)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[it.icon]}</svg>
      ${esc(it.label)}
    </a>
  `).join('');
}

function renderGrid(){
  const q = state.searchQuery.toLowerCase().trim();
  let list = state.products.filter(p => p.activo !== false);
  if (state.activeCat !== 'Todos'){
    list = list.filter(p => (p.categoria || '').toLowerCase() === state.activeCat.toLowerCase());
  }
  if (q){
    list = list.filter(p =>
      (p.nombre + ' ' + (p.desc||'') + ' ' + (p.categoria||'') + ' ' + (p.sku||''))
        .toLowerCase().includes(q)
    );
  }

  const grid = $('grid');
  if (!list.length){
    grid.innerHTML = `<div class="empty">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <h3>No encontramos productos</h3>
      <p>Prueba con otra búsqueda o categoría.</p>
    </div>`;
    return;
  }

  grid.innerHTML = list.map((p, i) => {
    const img = getPrimaryImage(p);
    const off = p.compara && p.compara > p.precio
      ? Math.round((1 - p.precio / p.compara) * 100) : 0;
    const agotado = Number(p.stock) === 0;
    const badgeHtml = p.badge
      ? `<span class="tag-badge ${badgeColor(p.badge)}">${esc(p.badge)}</span>`
      : off ? `<span class="tag-badge orange">-${off}%</span>` : '';
    const specs = (p.desc || '').split('\n').filter(l => l.trim().startsWith('-')).slice(0,2)
      .map(l => l.replace(/^-\s*/,'').split(':')[0]).join(' · ');
    const priority = i < 4 ? 'high' : 'low';

    return `
    <article class="card-prod">
      <div class="prod-img is-loading" data-open="${p.id}">
        <img src="${esc(img)}" alt="${esc(p.nombre)}"
             data-pid="${p.id}" data-idx="0"
             loading="${i < 4 ? 'eager' : 'lazy'}"
             decoding="async"
             fetchpriority="${priority}"
             onload="this.parentElement.classList.remove('is-loading')"
             onerror="handleImgError(this)">
        ${badgeHtml}
      </div>
      <div class="prod-body">
        <h3 data-open="${p.id}">${esc(p.nombre)}</h3>
        ${specs ? `<p class="prod-specs">${esc(specs)}</p>` : ''}
        <div class="prices">
          <strong>${money(p.precio)}</strong>
          ${p.compara && p.compara > p.precio ? `<s>${money(p.compara)}</s>` : ''}
        </div>
        <button class="btn-add" data-add="${p.id}" type="button" ${agotado ? 'disabled' : ''}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          ${agotado ? 'Agotado' : 'Agregar al carrito'}
        </button>
      </div>
    </article>`;
  }).join('');
}

function badgeColor(label){
  const l = label.toLowerCase();
  if (l.includes('vendido'))  return 'blue';
  if (l.includes('nuevo'))    return 'green';
  if (l.includes('oferta'))   return 'orange';
  if (l.includes('últimas'))  return 'orange';
  return 'purple';
}

/* ---------- DETALLE ---------- */
function openProduct(id){
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  state.currentProduct = p;
  state.selTalla = (p.tallas && p.tallas[0]) || '';
  const colors = parseColors(p.colores);
  const firstAvailable = colors.find(c => !c.agotado);
  state.selColor = firstAvailable ? firstAvailable.nombre : '';
  state.selQty = 1;
  renderDetail();
  openOverlay('productModal');

  verifyProductImages(p).then(() => {
    if (state.currentProduct && state.currentProduct.id === id){
      refreshThumbs(p);
    }
  });
}

async function verifyProductImages(p){
  if (!p.img || !p.img.length) return;
  const toCheck = p.img.slice(0, MAX_IMG_CANDIDATES);
  await Promise.allSettled(toCheck.map(probeImage));
}

function refreshThumbs(p){
  const thumbsRow = document.querySelector('#detailContent .thumbs-row');
  if (!thumbsRow) return;
  const valid = p.img.filter(u => imageCache.get(u) === true);
  if (valid.length <= 1) return;

  const current = $('mainImg').src;
  thumbsRow.innerHTML = valid.map((im,i) => {
    const isActive = im === current || (i === 0 && !valid.includes(current));
    return `<img src="${esc(im)}" class="${isActive ? 'active' : ''}" data-thumb="${i}"
      loading="lazy" decoding="async"
      onerror="this.style.display='none'">`;
  }).join('');

  thumbsRow.querySelectorAll('[data-thumb]').forEach(t => {
    t.onclick = () => {
      $('mainImg').src = valid[+t.dataset.thumb];
      thumbsRow.querySelectorAll('[data-thumb]').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    };
  });

  state.currentProduct._validImgs = valid;
}

function renderDetail(){
  const p = state.currentProduct;
  if (!p) return;
  const known = p._validImgs && p._validImgs.length ? p._validImgs : null;
  const imgs = known || (p.img && p.img.length ? p.img.slice(0, 6) : [PH]);
  const colors = parseColors(p.colores);
  const off = p.compara && p.compara > p.precio
    ? Math.round((1 - p.precio / p.compara) * 100) : 0;

  $('detailContent').innerHTML = `
    <div class="product-detail">
      <div class="detail-gal">
        <div class="main" id="mainImgWrap">
          <img id="mainImg" src="${esc(imgs[0])}" alt="${esc(p.nombre)}"
               loading="eager" decoding="async" fetchpriority="high"
               data-pid="${p.id}" data-idx="0"
               onerror="handleImgError(this)">
          <div class="zoom-hint">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            Clic para ampliar
          </div>
        </div>
        ${imgs.length > 1 ? `<div class="thumbs-row">${imgs.map((im,i) =>
          `<img src="${esc(im)}" class="${i===0?'active':''}" data-thumb="${i}"
            loading="lazy" decoding="async"
            onerror="this.style.display='none'">`).join('')}</div>` : ''}
      </div>
      <div class="detail-info">
        <span class="hero-tag" style="margin:0;font-size:10px">${esc(p.categoria || 'General')}</span>
        <h2>${esc(p.nombre)}</h2>
        <div class="prices" style="margin:0">
          <strong style="font-size:28px">${money(p.precio)}</strong>
          ${p.compara && p.compara > p.precio ? `<s>${money(p.compara)}</s>` : ''}
          ${off ? `<span class="tag-badge orange" style="position:static;display:inline-block">-${off}%</span>` : ''}
        </div>
        ${p.sku ? `<div style="font-size:12px;color:var(--text-dim)">Código: ${esc(p.sku)}</div>` : ''}
        ${p.desc ? `<div class="desc">${esc(p.desc)}</div>` : ''}

        ${p.tallas && p.tallas.length ? `
          <div class="opt-group"><label>Talla</label>
            <div class="opts">${p.tallas.map(t =>
              `<button class="opt ${t===state.selTalla?'active':''}" data-talla="${esc(t)}" type="button">${esc(t)}</button>`
            ).join('')}</div></div>` : ''}

        ${colors.length ? `
          <div class="opt-group"><label>Color</label>
            <div class="opts">${colors.map(c => {
              const isActive = c.nombre === state.selColor && !c.agotado;
              return `<button class="opt ${isActive ? 'active' : ''} ${c.agotado ? 'agotado' : ''}"
                data-color="${esc(c.nombre)}"
                ${c.agotado ? 'disabled' : ''}
                type="button">
                ${esc(c.nombre)}${c.agotado ? '<span class="stock-tag">· Agotado</span>' : ''}
              </button>`;
            }).join('')}</div>
          </div>` : ''}

        <div class="opt-group"><label>Cantidad</label>
          <div class="qty">
            <button id="qtyMinus" type="button">−</button>
            <span id="qtyVal">1</span>
            <button id="qtyPlus" type="button">+</button>
          </div>
        </div>

        <div style="font-size:13px;color:var(--text-muted);font-weight:600">
          ${Number(p.stock) > 0 ? `Disponibles: ${p.stock} unidades` : 'Producto agotado'}
        </div>

        <button class="btn btn-primary btn-full btn-lg" id="addFromDetail" type="button">
          Agregar al carrito · <span id="subtotalPrev">${money(p.precio)}</span>
        </button>
      </div>
    </div>
  `;

  bindDetailEvents(imgs);
}

function bindDetailEvents(imgs){
  const root = $('detailContent');
  root.querySelectorAll('[data-thumb]').forEach(t => {
    t.onclick = () => {
      $('mainImg').src = imgs[+t.dataset.thumb];
      root.querySelectorAll('[data-thumb]').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    };
  });
  root.querySelectorAll('[data-talla]').forEach(b => {
    b.onclick = () => {
      state.selTalla = b.dataset.talla;
      root.querySelectorAll('[data-talla]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  root.querySelectorAll('[data-color]').forEach(b => {
    if (b.disabled) return;
    b.onclick = () => {
      state.selColor = b.dataset.color;
      root.querySelectorAll('[data-color]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });
  $('qtyMinus').onclick = () => { if (state.selQty > 1){ state.selQty--; updateQty(); } };
  $('qtyPlus').onclick  = () => { if (state.selQty < 99){ state.selQty++; updateQty(); } };
  $('addFromDetail').onclick = () => {
    addToCart(state.currentProduct, state.selTalla, state.selColor, state.selQty);
    closeOverlay('productModal');
    openCart();
  };

  const mainWrap = $('mainImgWrap');
  if (mainWrap){
    mainWrap.onclick = () => {
      const valid = (state.currentProduct._validImgs && state.currentProduct._validImgs.length)
        ? state.currentProduct._validImgs
        : getKnownValidImages(state.currentProduct);
      const active = root.querySelector('[data-thumb].active');
      const idx = active ? +active.dataset.thumb : 0;
      openLightbox(valid, idx);
    };
  }
}

function updateQty(){
  $('qtyVal').textContent = state.selQty;
  $('subtotalPrev').textContent = money(state.currentProduct.precio * state.selQty);
}

/* ---------- LIGHTBOX ---------- */
function openLightbox(images, startIndex = 0){
  state.lbImages = images;
  state.lbIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  renderLightbox();
  $('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox(){
  $('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

function renderLightbox(){
  const imgs = state.lbImages;
  const idx = state.lbIndex;
  if (!imgs.length) return;

  $('lightboxImg').src = imgs[idx];
  $('lightboxCounter').textContent = `${idx + 1} / ${imgs.length}`;

  $('lightboxThumbs').innerHTML = imgs.map((im,i) =>
    `<img src="${esc(im)}" class="${i===idx?'active':''}" data-lbthumb="${i}"
      loading="lazy" decoding="async"
      onerror="this.style.display='none'">`
  ).join('');
  $('lightboxThumbs').querySelectorAll('[data-lbthumb]').forEach(t => {
    t.onclick = () => { state.lbIndex = +t.dataset.lbthumb; renderLightbox(); };
  });

  const single = imgs.length <= 1;
  $('lightboxPrev').style.display = single ? 'none' : '';
  $('lightboxNext').style.display = single ? 'none' : '';
  $('lightboxThumbs').style.display = single ? 'none' : '';
}

function lightboxPrev(){
  if (state.lbImages.length <= 1) return;
  state.lbIndex = (state.lbIndex - 1 + state.lbImages.length) % state.lbImages.length;
  renderLightbox();
}
function lightboxNext(){
  if (state.lbImages.length <= 1) return;
  state.lbIndex = (state.lbIndex + 1) % state.lbImages.length;
  renderLightbox();
}

/* ---------- CARRITO ---------- */
function cartKey(id, talla, color){ return [id, talla||'', color||''].join('||'); }

function addToCart(p, talla, color, qty){
  const key = cartKey(p.id, talla, color);
  const found = state.cart.find(i => i.key === key);
  const firstImg = getPrimaryImage(p);
  if (found) found.qty += qty;
  else state.cart.push({
    key, id: p.id, nombre: p.nombre, precio: Number(p.precio),
    img: firstImg,
    talla: talla||'', color: color||'', sku: p.sku||'',
    proveedor: p.proveedor||'', qty
  });
  save(); renderCart(); toast('Producto agregado al carrito');
}

function changeQty(key, delta){
  const item = state.cart.find(i => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter(i => i.key !== key);
  save(); renderCart();
}

function removeItem(key){
  state.cart = state.cart.filter(i => i.key !== key);
  save(); renderCart();
}

const cartSubtotal = () => state.cart.reduce((a,i) => a + i.precio * i.qty, 0);

function calcShipping(sub){
  const s = state.settings;
  if (!state.cart.length) return 0;
  if (Number(s.freeFrom) > 0 && sub >= Number(s.freeFrom)) return 0;
  return Number(s.shipping) || 0;
}

function renderCart(){
  const count = state.cart.reduce((a,i) => a + i.qty, 0);
  $('cartBadge').textContent = count;
  $('cartBadge').style.display = count ? 'grid' : 'none';

  const body = $('cartBody');
  const foot = $('cartFoot');

  if (!state.cart.length){
    body.innerHTML = `<div class="empty" style="padding:60px 20px">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
      </svg>
      <h3>Tu carrito está vacío</h3>
      <p>Agrega productos para continuar.</p>
    </div>`;
    foot.innerHTML = '';
    return;
  }

  body.innerHTML = state.cart.map(i => `
    <div class="cart-item">
      <img src="${esc(i.img)}" alt="" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='${PH}'">
      <div class="ci-info">
        <h4>${esc(i.nombre)}</h4>
        ${(i.talla||i.color) ? `<div class="var">${esc([i.talla,i.color].filter(Boolean).join(' · '))}</div>` : ''}
        <div class="precio">${money(i.precio)}</div>
      </div>
      <div class="ci-actions">
        <button class="rm" data-rm="${i.key}" type="button" aria-label="Eliminar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
        <div class="mini-qty">
          <button data-dec="${i.key}" type="button">−</button>
          <span>${i.qty}</span>
          <button data-inc="${i.key}" type="button">+</button>
        </div>
      </div>
    </div>
  `).join('');

  const sub = cartSubtotal();
  const env = calcShipping(sub);

  foot.innerHTML = `
    <div class="totales">
      <div class="fila"><span>Subtotal</span><span>${money(sub)}</span></div>
      <div class="fila"><span>Envío</span><span>${env === 0 ? '<span class="envio-gratis">GRATIS</span>' : money(env)}</span></div>
      <div class="fila total"><span>Total</span><span>${money(sub + env)}</span></div>
    </div>
    <button class="btn btn-primary btn-full btn-lg" id="goCheckout" type="button">Continuar con el pedido</button>
    <button class="btn btn-ghost btn-full" id="clearCart" type="button" style="margin-top:8px">Vaciar carrito</button>
  `;

  $('goCheckout').onclick = () => { closeCart(); openCheckout(); };
  $('clearCart').onclick = () => {
    if (confirm('¿Vaciar el carrito?')){ state.cart = []; save(); renderCart(); }
  };
}

function openCart(){ $('cartDrawer').classList.add('open'); }
function closeCart(){ $('cartDrawer').classList.remove('open'); }

/* ---------- CHECKOUT ---------- */
function openCheckout(){
  if (!state.cart.length){ toast('Tu carrito está vacío'); return; }

  state.selRecaudo = 'Con Recaudo';
  state.selCarrier = 'Interrapidisimo';
  $$('#recaudoTabs .recaudo-tab').forEach(b => b.classList.toggle('active', b.dataset.recaudo === state.selRecaudo));
  $$('#carriers .carrier').forEach(b => b.classList.toggle('active', b.dataset.carrier === state.selCarrier));

  renderCheckoutResumen();
  openOverlay('checkoutModal');
}

function renderCheckoutResumen(){
  const sub = cartSubtotal();
  const env = calcShipping(sub);
  $('coResumen').innerHTML = `
    <div class="totales">
      <div class="fila"><span>${state.cart.reduce((a,i)=>a+i.qty,0)} producto(s)</span><span>${money(sub)}</span></div>
      <div class="fila"><span>Envío</span><span>${env === 0 ? '<span class="envio-gratis">GRATIS</span>' : money(env)}</span></div>
      <div class="fila total"><span>Total a pagar</span><span>${money(sub + env)}</span></div>
    </div>`;
}

function getPaymentLabel(recaudo){
  return recaudo === 'Con Recaudo' ? 'Pago contra entrega' : 'Pago anticipado';
}

/**
 * Construye el mensaje de WhatsApp con el proveedor por cada producto,
 * para que al crear el pedido en Dropi sepas a quién pedirlo.
 */
function buildOrderMessage(o){
  const L = [];
  L.push('NUEVO PEDIDO - ' + state.settings.nombre);
  L.push('================================');
  L.push('Cliente: ' + o.nombre);
  L.push('Teléfono: ' + o.telefono);
  L.push('Dirección: ' + o.direccion);
  L.push('Ciudad: ' + o.ciudad + (o.departamento ? ', ' + o.departamento : ''));
  if (o.notas) L.push('Notas: ' + o.notas);
  L.push('Pedido: ' + o.codigo);
  L.push('');
  L.push('--------------------------------');
  L.push('ENVÍO');
  L.push('Tipo: ' + o.recaudo);
  L.push('Pago: ' + getPaymentLabel(o.recaudo));
  L.push('Transportadora: ' + o.carrier);
  L.push('');
  L.push('--------------------------------');
  L.push('PRODUCTOS');
  o.items.forEach((it,i) => {
    L.push(`${i+1}. ${it.nombre}`);
    if (it.proveedor) L.push('   Proveedor: ' + it.proveedor);
    const v = [it.talla,it.color].filter(Boolean).join(' / ');
    if (v) L.push('   Variante: ' + v);
    L.push(`   Cantidad: ${it.qty} x ${money(it.precio)} = ${money(it.qty * it.precio)}`);
    if (it.sku) L.push('   Código: ' + it.sku);
  });
  L.push('--------------------------------');
  L.push('Subtotal: ' + money(o.subtotal));
  L.push('Envío: ' + (o.envio === 0 ? 'GRATIS' : money(o.envio)));
  L.push('TOTAL: ' + money(o.total));
  L.push('');
  L.push('Pedido generado desde la tienda online');
  return L.join('\n');
}

function enviarPedido(){
  const nombre = $('coNombre').value.trim();
  const tel    = $('coTel').value.trim();
  const dir    = $('coDir').value.trim();
  const ciudad = $('coCiudad').value.trim();
  const depto  = $('coDepto').value.trim();
  const notas  = $('coNotas').value.trim();

  if (!nombre) return toast('Escribe tu nombre');
  if (!tel)    return toast('Escribe tu teléfono');
  if (!dir)    return toast('Escribe tu dirección');
  if (!ciudad) return toast('Escribe tu ciudad');

  const sub = cartSubtotal();
  const env = calcShipping(sub);

  const order = {
    codigo: 'PED-' + Date.now().toString().slice(-6),
    fecha: new Date().toISOString(),
    nombre, telefono: tel, direccion: dir,
    ciudad, departamento: depto, notas,
    recaudo: state.selRecaudo,
    pago: getPaymentLabel(state.selRecaudo),
    carrier: state.selCarrier,
    items: JSON.parse(JSON.stringify(state.cart)),
    subtotal: sub, envio: env, total: sub + env,
    estado: 'pendiente'
  };

  const num = (state.settings.whatsapp || '').replace(/\D/g, '');
  if (!num) return toast('Falta configurar el WhatsApp');

  const url = `https://wa.me/${num}?text=${encodeURIComponent(buildOrderMessage(order))}`;
  window.open(url, '_blank');

  state.orders.unshift(order);
  state.cart = [];
  save(); renderCart();
  closeOverlay('checkoutModal');
  ['coNombre','coTel','coDir','coCiudad','coDepto','coNotas'].forEach(id => $(id).value = '');
  toast('Pedido enviado. Revisa WhatsApp.');
}

/* ---------- ADMIN ---------- */
function renderAdminProducts(){
  $('prodCount').textContent = state.products.length;
  const list = $('adminProdList');

  const cats = [...new Set(state.products.map(p => p.categoria).filter(Boolean))];
  $('catList').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');

  if (!state.products.length){
    list.innerHTML = `<p class="hint">Aún no tienes productos. Agrega el primero con el formulario de arriba.</p>`;
    return;
  }

  list.innerHTML = state.products.map(p => {
    const prov = p.proveedor || '';
    const provTag = prov
      ? `<span class="prov-tag ${provClass(prov)}">${esc(prov)}</span>`
      : '';
    return `
    <div class="mini-item">
      <img src="${esc(getPrimaryImage(p))}" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='${PH}'">
      <div class="mi-info">
        <h4>${esc(p.nombre)}</h4>
        <small>${money(p.precio)} · Stock: ${p.stock} · ${esc(p.categoria||'General')}${provTag}
        ${p.activo === false ? ' · <b style="color:#ef4444">OCULTO</b>' : ''}
        · ${(p.img||[]).length} img</small>
      </div>
      <div class="mi-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${p.id}" type="button">Editar</button>
        <button class="btn btn-danger btn-sm" data-del="${p.id}" type="button">Borrar</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editProduct(b.dataset.edit));
  list.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (confirm('¿Eliminar este producto?')){
      state.products = state.products.filter(x => x.id !== b.dataset.del);
      save(); renderAdminProducts(); renderAll();
      toast('Producto eliminado');
    }
  });
}

function renderAdminOrders(){
  const box = $('ordersList');
  if (!state.orders.length){
    box.innerHTML = `<p class="hint">Todavía no hay pedidos registrados. Cuando un cliente envíe su pedido por WhatsApp, aparecerá aquí.</p>`;
    return;
  }
  box.innerHTML = state.orders.map((o,idx) => `
    <div class="order-card">
      <div class="oc-head">
        <div>
          <strong>${esc(o.codigo)} · ${esc(o.nombre)}</strong><br>
          <small style="color:var(--text-muted);font-size:12px">${new Date(o.fecha).toLocaleString('es-CO')} · ${esc(o.telefono)}</small><br>
          <small style="color:var(--primary);font-size:11.5px;font-weight:700">${esc(o.recaudo||'')} · ${esc(o.carrier||'')}</small>
        </div>
        <span class="pill ${o.estado==='pendiente'?'pend':o.estado==='confirmado'?'conf':'env'}">${o.estado}</span>
      </div>
      <pre>${esc(buildOrderMessage(o))}</pre>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-wa btn-sm" data-resend="${idx}" type="button">Reenviar</button>
        <button class="btn btn-ghost btn-sm" data-copy="${idx}" type="button">Copiar</button>
        <button class="btn btn-ghost btn-sm" data-state="${idx}" type="button">Cambiar estado</button>
        <button class="btn btn-danger btn-sm" data-delorder="${idx}" type="button">Borrar</button>
      </div>
    </div>
  `).join('');

  box.querySelectorAll('[data-resend]').forEach(b => b.onclick = () => {
    const o = state.orders[+b.dataset.resend];
    const num = (state.settings.whatsapp || '').replace(/\D/g, '');
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(buildOrderMessage(o))}`, '_blank');
  });
  box.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
    const o = state.orders[+b.dataset.copy];
    navigator.clipboard.writeText(buildOrderMessage(o)).then(() => toast('Copiado al portapapeles'));
  });
  box.querySelectorAll('[data-state]').forEach(b => b.onclick = () => {
    const o = state.orders[+b.dataset.state];
    const ciclo = ['pendiente','confirmado','enviado'];
    o.estado = ciclo[(ciclo.indexOf(o.estado)+1) % ciclo.length];
    save(); renderAdminOrders();
  });
  box.querySelectorAll('[data-delorder]').forEach(b => b.onclick = () => {
    if (confirm('¿Eliminar este pedido del historial?')){
      state.orders.splice(+b.dataset.delorder, 1);
      save(); renderAdminOrders();
    }
  });
}

/* ---------- FORM PRODUCTO ---------- */
function renderThumbs(){
  $('pThumbs').innerHTML = state.tempImages.map((im,i) => {
    const exists = imageCache.get(im);
    const cls = exists === false ? 'thumb-edit broken' : 'thumb-edit';
    return `
      <div class="${cls}">
        <img src="${esc(im)}" loading="lazy" decoding="async"
             onerror="this.style.display='none'">
        <button type="button" data-rmimg="${i}">×</button>
      </div>`;
  }).join('');
  $('pThumbs').querySelectorAll('[data-rmimg]').forEach(b => b.onclick = () => {
    state.tempImages.splice(+b.dataset.rmimg, 1);
    renderThumbs();
  });
}

function clearForm(){
  state.editingId = null;
  state.tempImages = [];
  ['pNombre','pCategoria','pPrecio','pCompara','pCosto','pSku','pDesc','pTallas','pColores','pImgUrl','pBadge','pFolder','pProveedor']
    .forEach(id => $(id).value = '');
  $('pStock').value = 20;
  $('pFolderCount').value = 12;
  $('pDestacado').checked = false;
  $('pActivo').checked = true;
  $('formTitle').textContent = 'Agregar producto';
  renderThumbs();
}

function editProduct(id){
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  state.editingId = id;
  $('pNombre').value   = p.nombre || '';
  $('pCategoria').value = p.categoria || '';
  $('pPrecio').value   = p.precio || '';
  $('pCompara').value  = p.compara || '';
  $('pCosto').value    = p.costo || '';
  $('pSku').value      = p.sku || '';
  $('pProveedor').value = p.proveedor || '';
  $('pStock').value    = p.stock ?? 20;
  $('pDesc').value     = p.desc || '';
  $('pTallas').value   = (p.tallas||[]).join(', ');
  $('pColores').value  = colorsToInput(p.colores);
  $('pBadge').value    = p.badge || '';
  $('pDestacado').checked = !!p.destacado;
  $('pActivo').checked = p.activo !== false;
  state.tempImages = [...(p.img||[])];
  renderThumbs();
  $('formTitle').textContent = 'Editando: ' + p.nombre;
  document.querySelector('#adminModal .admin-scroll').scrollTop = 0;
}

async function saveProduct(){
  const nombre = $('pNombre').value.trim();
  const precio = Number($('pPrecio').value);

  if (!nombre) return toast('El nombre es obligatorio');
  if (!precio || precio <= 0) return toast('Ingresa un precio válido');
  if (!state.tempImages.length) return toast('Agrega al menos una imagen');

  const toCheck = state.tempImages.slice(0, MAX_IMG_CANDIDATES);
  await Promise.allSettled(toCheck.map(probeImage));
  const validImgs = state.tempImages.filter(u =>
    !u.startsWith('data:') ? imageCache.get(u) !== false : true
  );

  if (!validImgs.length) return toast('Ninguna imagen se pudo cargar. Verifica la ruta.');

  const data = {
    nombre,
    categoria: $('pCategoria').value.trim() || 'General',
    proveedor: $('pProveedor').value.trim(),
    precio,
    compara: Number($('pCompara').value) || 0,
    costo:   Number($('pCosto').value)   || 0,
    sku:     $('pSku').value.trim(),
    stock:   Number($('pStock').value)   || 0,
    desc:    $('pDesc').value.trim(),
    tallas:  $('pTallas').value.split(',').map(s => s.trim()).filter(Boolean),
    colores: $('pColores').value.split(',').map(s => s.trim()).filter(Boolean).map(parseColor),
    badge:   $('pBadge').value.trim(),
    img:     validImgs,
    destacado: $('pDestacado').checked,
    activo:    $('pActivo').checked
  };

  if (state.editingId){
    const i = state.products.findIndex(x => x.id === state.editingId);
    state.products[i] = { ...state.products[i], ...data };
    toast('Producto actualizado');
  } else {
    state.products.unshift({ id: uid(), ...data });
    toast('Producto agregado');
  }

  save(); clearForm(); renderAdminProducts(); renderAll();
}

/* ---------- CARPETA DE IMÁGENES ---------- */
async function loadImagesFromFolder(){
  const folder = $('pFolder').value.trim().replace(/\/+$/,'');
  const count  = Math.max(1, Math.min(50, Number($('pFolderCount').value) || 12));

  if (!folder) return toast('Escribe la ruta de la carpeta');

  const candidates = Array.from({length:count}, (_,i) => `${folder}/${i+1}.jpg`);
  toast('Buscando imágenes...');
  await Promise.allSettled(candidates.map(probeImage));
  const valid = candidates.filter(u => imageCache.get(u) === true);

  if (!valid.length) return toast('No se encontró ninguna imagen en esa carpeta');

  state.tempImages = [...state.tempImages, ...valid];
  renderThumbs();
  toast(`${valid.length} de ${count} imágenes encontradas`);
}

/* ---------- COMPRESIÓN ---------- */
function compressImage(file, maxW = 850, quality = 0.78){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxW){ height = Math.round(height * maxW / width); width = maxW; }
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- OVERLAYS ---------- */
function openOverlay(id){ $(id).classList.add('open'); }
function closeOverlay(id){ $(id).classList.remove('open'); }

function showAdminBody(){
  renderAdminProducts();
}

/* ---------- EVENTOS ---------- */
function bindEvents(){
  $('searchInput').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderGrid();
  });

  $('mainNav').addEventListener('click', e => {
    const a = e.target.closest('[data-cat]');
    if (!a) return;
    e.preventDefault();
    state.activeCat = a.dataset.cat;
    renderNav();
    renderGrid();
  });

  $('grid').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add){
      const p = state.products.find(x => x.id === add.dataset.add);
      if (!p) return;
      if ((p.tallas && p.tallas.length) || (parseColors(p.colores).length)){
        openProduct(p.id);
      } else {
        addToCart(p, '', '', 1);
        openCart();
      }
      return;
    }
    const op = e.target.closest('[data-open]');
    if (op) openProduct(op.dataset.open);
  });

  $('cartBtn').onclick = openCart;
  $('closeCart').onclick = closeCart;
  $('cartBody').addEventListener('click', e => {
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    const rm  = e.target.closest('[data-rm]');
    if (inc) changeQty(inc.dataset.inc, 1);
    if (dec) changeQty(dec.dataset.dec, -1);
    if (rm)  removeItem(rm.dataset.rm);
  });

  $$('#recaudoTabs .recaudo-tab').forEach(b => {
    b.onclick = () => {
      state.selRecaudo = b.dataset.recaudo;
      $$('#recaudoTabs .recaudo-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });

  $$('#carriers .carrier').forEach(b => {
    b.onclick = () => {
      state.selCarrier = b.dataset.carrier;
      $$('#carriers .carrier').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    };
  });

  $('enviarPedido').onclick = enviarPedido;

  document.addEventListener('click', e => {
    if (e.target.matches('[data-close]')){
      e.target.closest('.overlay').classList.remove('open');
    }
    if (e.target.classList.contains('overlay')){
      e.target.classList.remove('open');
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape'){
      if ($('lightbox').classList.contains('open')){
        closeLightbox();
      } else {
        $$('.overlay.open').forEach(o => o.classList.remove('open'));
        closeCart();
      }
    }
    if ($('lightbox').classList.contains('open')){
      if (e.key === 'ArrowLeft')  lightboxPrev();
      if (e.key === 'ArrowRight') lightboxNext();
    }
  });

  $('lightboxClose').onclick = closeLightbox;
  $('lightboxPrev').onclick  = lightboxPrev;
  $('lightboxNext').onclick  = lightboxNext;
  $('lightbox').addEventListener('click', e => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
  let lbTouchX = null;
  $('lightbox').addEventListener('touchstart', e => {
    lbTouchX = e.changedTouches[0].screenX;
  }, {passive:true});
  $('lightbox').addEventListener('touchend', e => {
    if (lbTouchX === null) return;
    const dx = e.changedTouches[0].screenX - lbTouchX;
    if (Math.abs(dx) > 50){
      if (dx > 0) lightboxPrev(); else lightboxNext();
    }
    lbTouchX = null;
  }, {passive:true});

  $('adminBtn').onclick = () => {
    openOverlay('adminModal');
    showAdminBody();
  };

  $$('.tab').forEach(t => {
    t.onclick = () => {
      $$('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      ['productos','pedidos'].forEach(k => {
        $('tab-' + k).classList.toggle('hidden', k !== t.dataset.tab);
      });
      if (t.dataset.tab === 'pedidos') renderAdminOrders();
    };
  });

  $('saveProd').onclick = saveProduct;
  $('cancelEdit').onclick = clearForm;
  $('loadFolder').onclick = loadImagesFromFolder;

  $('addImgUrl').onclick = async () => {
    const url = $('pImgUrl').value.trim();
    if (!url) return toast('Pega una URL o ruta válida');
    const exists = await probeImage(url);
    if (!exists) return toast('La imagen no se pudo cargar');
    state.tempImages.push(url);
    $('pImgUrl').value = '';
    renderThumbs();
  };
  $('pImgUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); $('addImgUrl').click(); }
  });

  $('pImgFile').addEventListener('change', async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    toast('Procesando imágenes...');
    for (const f of files){
      try {
        const data = await compressImage(f);
        imageCache.set(data, true);
        state.tempImages.push(data);
      } catch(err){ console.warn(err); }
    }
    renderThumbs();
    e.target.value = '';
    toast('Imágenes listas');
  });

  $('clearOrders').onclick = () => {
    if (!state.orders.length) return toast('No hay pedidos');
    if (confirm('¿Borrar todo el historial de pedidos?')){
      state.orders = []; save(); renderAdminOrders(); toast('Historial borrado');
    }
  };
}

/* ---------- INIT ---------- */
function renderAll(){
  renderNav();
  renderGrid();
  renderCart();
}

function init(){
  load();
  migrateProducts();
  applySettings();
  bindEvents();
  renderAll();
  applyBrand();
}

init();
})();