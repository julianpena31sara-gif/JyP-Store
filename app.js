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

/* Rutas de marca (logo y banner). El sistema detecta cuál existe. */
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
  color: '#0d8bf0',
  pass: 'admin123'
};

/* ---------- ESTADO ---------- */
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

async function preloadImageCache(){
  const urls = new Set();
  state.products.forEach(p => (p.img || []).forEach(u => urls.add(u)));
  state.tempImages.forEach(u => urls.add(u));
  await Promise.all([...urls].map(probeImage));
}

function getValidImages(p){
  const arr = p.img || [];
  const valid = arr.filter(u => imageCache.get(u) !== false);
  return valid.length ? valid : [PH];
}

/* =========================================================
   COLORES — soportan agotados
   ========================================================= */
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

/* ---------- PERSISTENCIA ---------- */
function save(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch { toast('Espacio lleno. Usa URLs de imágenes en vez de subir archivos.'); }
}

async function load(){
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
    } else {
      state.products = demoProducts();
      save();
    }
  } catch(e){ console.warn('Error cargando datos', e); }
}

function migrateProducts(){
  // Asegura que siempre haya productos demo cargados
  if (!state.settings._migrated_jyp1){
    const demo = demoProducts();
    demo.forEach(d => {
      if (!state.products.find(p => p.id === d.id)){
        state.products.push(d);
      }
    });
    state.settings._migrated_jyp1 = true;
    save();
  }
}

/* =========================================================
   PRODUCTOS DE EJEMPLO
   ========================================================= */
function demoProducts(){
  const airpodsImgs          = Array.from({length:15}, (_,i) => `img/airpods/${i+1}.jpg`);
  const watchImgs            = Array.from({length:15}, (_,i) => `img/smartwatch/${i+1}.jpg`);
  const zapateroImgs         = Array.from({length:15}, (_,i) => `img/zapatero/${i+1}.jpg`);
  const secadorImgs          = Array.from({length:15}, (_,i) => `img/secador/${i+1}.jpg`);
  const intercomunicadorImgs = Array.from({length:15}, (_,i) => `img/intercomunicador/${i+1}.jpg`);
  const parlanteImgs         = Array.from({length:15}, (_,i) => `img/parlante/${i+1}.jpg`);
  const baofengImgs          = Array.from({length:15}, (_,i) => `img/baofeng/${i+1}.jpg`);
  const taladroImgs          = Array.from({length:15}, (_,i) => `img/taladro/${i+1}.jpg`);

  return [
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
- Producto incompleto · 10 días (producto completo y en buen estado)
- Mal funcionamiento · 10 días (producto completo y en buen estado)
- Producto roto · 10 días (producto completo y en buen estado)
- Producto diferente · 10 días
  Si el cliente recibe un producto distinto al solicitado, se gestionará el cambio solo si no ha sido usado.`,
      precio: 70000,
      compara: 129900,
      costo: 0,
      sku: '2174138',
      categoria: 'Tecnología',
      stock: 20,
      tallas: [],
      colores: ['Blanco'],
      img: airpodsImgs,
      badge: 'Más vendido',
      destacado: true,
      activo: true
    },
    {
      id: 'smart-watch-ac10-serie-10',
      nombre: 'Smart Watch AC10 Serie 10',
      desc: `SMART WATCH AC10 SERIE 10

DISEÑO Y PANTALLA
- Pantalla: TFT táctil de 1.44 pulgadas
- Resolución: 240 x 240 píxeles
- Formato: Reloj inteligente unisex
- Correa: Silicona intercambiable

CONECTIVIDAD
- Tecnología inalámbrica: Bluetooth 4.0 o superior
- Compatibilidad: Android 5.0 / iOS 9.0 y versiones superiores
- Aplicación recomendada: FitPro / HiWatch (según versión)

BATERÍA Y CARGA
- Capacidad: 150 mAh
- Autonomía: 2 a 5 días dependiendo del uso
- Tipo de carga: Magnética
- Cable incluido: USB
- Tiempo de carga: 1.5 a 2 horas

FUNCIONES PRINCIPALES
- Notificaciones de llamadas, mensajes y aplicaciones
- Monitoreo de frecuencia cardíaca
- Medición de presión arterial y oxígeno en sangre (SpO2)
- Registro automático del sueño
- Modos deportivos: caminata, carrera, ciclismo
- Control remoto de música y cámara del teléfono
- Alarmas, recordatorios de sedentarismo y clima

VARIANTES DISPONIBLES
- Naranja
- Blanco
- Negro

CONTENIDO DEL EMBALAJE
- 1 Smart Watch AC10
- 1 Cable de carga magnética USB
- 1 Manual de usuario

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 56000,
      compara: 99900,
      costo: 0,
      sku: '1498729',
      categoria: 'Tecnología',
      stock: 15,
      tallas: [],
      colores: ['Naranja', 'Blanco', 'Negro'],
      img: watchImgs,
      badge: 'Nuevo',
      destacado: false,
      activo: true
    },
    {
      id: 'zapatero-6-niveles-2195373',
      nombre: 'Zapatero 6 Niveles Doble 10 Secciones',
      desc: `ZAPATERO 6 NIVELES DOBLE 10 SECCIONES — ID: 2195373

Mantén tu calzado organizado y protegido con este Zapatero Organizador de 2 Columnas y 6 Niveles con Puertas Plegables. Su diseño moderno permite almacenar varios pares de zapatos ocupando poco espacio, convirtiéndose en la opción ideal para dormitorios, closets, entradas o apartamentos.

CARACTERÍSTICAS
- Diseño de 2 columnas y 6 niveles
- Puertas plegables de fácil apertura
- Protege el calzado del polvo y la suciedad
- Gran capacidad de almacenamiento
- Estructura resistente y estable
- Separadores en tela microperforada
- Puertas plásticas blandas HDPE

ESPECIFICACIONES TÉCNICAS
- Tipo: Zapatero organizador
- Diseño: 2 columnas
- Niveles: 6
- Tipo de puertas: Plegables
- Material: Plástico resistente
- Uso: Interior
- Requiere ensamblaje: Sí

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 60000,
      compara: 109900,
      costo: 0,
      sku: '2195373',
      categoria: 'Hogar',
      stock: 12,
      tallas: [],
      colores: [],
      img: zapateroImgs,
      badge: 'Nuevo',
      destacado: false,
      activo: true
    },
    {
      id: 'secador-redden-proluxe-2140718',
      nombre: 'Secador Redden Proluxe 5000W',
      desc: `SECADOR REDDEN PROLUXE 5000W — ID: 2140718

El secador REDDEN Proluxe es una herramienta diseñada para lograr un secado rápido y eficiente con resultados tipo salón desde casa. Su alta potencia permite reducir el tiempo de secado, facilitando el peinado y dejando un acabado más uniforme.

CARACTERÍSTICAS
- Potencia aproximada: 5000W
- Incluye difusor
- Incluye boquillas concentradoras
- Control de temperatura
- Función aire frío
- Tecnología de calor uniforme
- Diseño ergonómico
- Uso doméstico y semiprofesional

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 70000,
      compara: 129900,
      costo: 0,
      sku: '2140718',
      categoria: 'Hogar',
      stock: 15,
      tallas: [],
      colores: [],
      img: secadorImgs,
      badge: 'Nuevo',
      destacado: false,
      activo: true
    },
    {
      id: 'intercomunicador-q58-2216196',
      nombre: 'Intercomunicador Q58',
      desc: `INTERCOMUNICADOR Q58 — ID: 2216196

El intercomunicador para casco Q58 Max ofrece comunicación inalámbrica, reproducción de música y gestión de llamadas durante recorridos en motocicleta. Integra pantalla informativa, controles físicos de fácil acceso, reducción inteligente de ruido y función de mezcla entre intercomunicación y audio. Su diseño resistente al agua y al polvo permite utilizarlo con mayor confianza en diferentes condiciones de conducción.

CARACTERÍSTICAS
- Comunicación inalámbrica entre cascos
- Reproducción de música
- Gestión de llamadas
- Pantalla informativa
- Controles físicos de fácil acceso
- Reducción inteligente de ruido
- Diseño resistente al agua y al polvo

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 80000,
      compara: 139900,
      costo: 0,
      sku: '2216196',
      categoria: 'Tecnología',
      stock: 10,
      tallas: [],
      colores: [],
      img: intercomunicadorImgs,
      badge: 'Nuevo',
      destacado: false,
      activo: true
    },
    {
      id: 'parlante-jbl-boombox-3-1583443',
      nombre: 'Parlante Jbl Boombox 3',
      desc: `PARLANTE JBL BOOMBOX 3 — ID: 1583443

El JBL Boombox 3 AAA ofrece un sonido natural, con una gran claridad y precisión, que se dispersa de manera uniforme. Un parlante que asegura potencia y calidad por igual en la reproducción de contenidos multimedia. (Réplica)

CARACTERÍSTICAS
- Sonido natural, claro y preciso
- Dispersión uniforme del sonido
- Subwoofer integrado
- Tweeter integrado
- Alto rendimiento incluso a volumen elevado
- Diseño versátil y funcional

ESPECIFICACIONES
- Medidas aproximadas: 34 x 20 x 10 cm

VARIANTES DISPONIBLES
- Camuflado
- Negro
- Azul
- Rojo (Agotado)

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 100000,
      compara: 189900,
      costo: 0,
      sku: '1583443',
      categoria: 'Audio',
      stock: 10,
      tallas: [],
      colores: [
        { nombre: 'Camuflado', agotado: false },
        { nombre: 'Negro',     agotado: false },
        { nombre: 'Azul',      agotado: false },
        { nombre: 'Rojo',      agotado: true }
      ],
      img: parlanteImgs,
      badge: 'Nuevo',
      destacado: false,
      activo: true
    },
    {
      id: 'radio-walkietalkie-baofeng-2249709',
      nombre: 'Radio Walkietalkie Baofeng 2 Radios',
      desc: `RADIO WALKIE TALKIE BAOFENG BF-888S — ID: 2249709

El Baofeng BF-888S es un radiotransmisor portátil de mano diseñado para ofrecer comunicación clara, estable y de largo alcance en cualquier entorno. Este kit incluye dos radios completamente equipados.

DISEÑO Y CONSTRUCCIÓN
- Formato: Radiotransmisor portátil de mano
- Estructura reforzada resistente
- Antena extraíble tipo flexible
- Clip de cinturón incluido
- Color: Negro

CONECTIVIDAD Y FRECUENCIA
- Rango de frecuencia: 400 - 470 MHz (UHF)
- Canales disponibles: 16 canales programables
- Subtonos: 50 CTCSS y 105 DCS
- Potencia: Hasta 5W
- Alcance: 2 a 5 km en campo abierto

FUNCIONES PRINCIPALES
- Comunicación bidireccional de voz
- Función VOX manos libres
- Alarma de emergencia
- Bloqueo de teclado
- Ahorro de batería

ALIMENTACIÓN
- Batería recargable de iones de litio
- Base de carga doble incluida
- Autonomía: 8 - 12 horas
- Tiempo de carga: 4 a 5 horas

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
      precio: 75000,
      compara: 149900,
      costo: 0,
      sku: '2249709',
      categoria: 'Tecnología',
      stock: 12,
      tallas: [],
      colores: ['Negro'],
      img: baofengImgs,
      badge: 'Nuevo',
      destacado: false,
      activo: true
    },
    {
      id: 'kit-taladro-813-mandril-2167630',
      nombre: 'Kit Taladro 813 Mandril Metalico De 12',
      desc: `KIT TALADRO 813 MANDRIl METÁLICO — ID: 2167630

Ten siempre la herramienta adecuada para cualquier reparación, instalación o proyecto con este completo Kit de Herramientas Inalámbricas 48V. Diseñado para el hogar, taller y bricolaje, incorpora un potente taladro inalámbrico con mandril metálico de 1/2 pulgada.

TALADRO INALÁMBRICO
- Taladro inalámbrico percutor
- Mandril metálico de alta resistencia
- Capacidad de 1/2 pulgada (13 mm)
- 2 baterías recargables incluidas (48V)
- Cargador incluido
- Diseño ergonómico y práctico

CONTENIDO DEL KIT
- 1 Taladro inalámbrico percutor
- 2 Baterías recargables de 48V
- 1 Cargador de baterías
- 1 Martillo
- 1 Alicate de punta
- 1 Alicate universal
- 1 Llave ajustable
- 1 Cinta métrica
- Juego de brocas
- Puntas para atornillar
- Destornilladores de precisión
- 1 Maletín organizador portátil

USOS RECOMENDADOS
- Instalaciones y reparaciones en el hogar
- Ensamble de muebles
- Mantenimiento de taller
- Trabajos de bricolaje

--------------------------------------------------
GARANTÍAS
- Producto incompleto · 10 días
- Mal funcionamiento · 10 días
- Producto roto · 10 días
- Producto diferente · 10 días`,
      precio: 175000,
      compara: 329900,
      costo: 0,
      sku: '2167630',
      categoria: 'Herramientas',
      stock: 8,
      tallas: [],
      colores: [],
      img: taladroImgs,
      badge: 'Nuevo',
      destacado: false,
      activo: true
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

/**
 * Aplica el logo y el banner si existen en img/marca/.
 */
async function applyBrand(){
  // --- LOGO ---
  const logoUrl = await findFirstExisting(BRAND_PATHS.logo);
  const brandLogo  = $('brandLogo');
  const brandText  = $('brandText');
  const footLogo   = $('footLogo');
  const footText   = $('footText');

  if (logoUrl){
    if (brandLogo){
      brandLogo.src = logoUrl;
      brandLogo.classList.remove('hidden');
    }
    if (brandText) brandText.classList.add('hidden');
    if (footLogo){
      footLogo.src = logoUrl;
      footLogo.classList.remove('hidden');
    }
    if (footText) footText.classList.add('hidden');
  }

  // --- BANNER ---
  const bannerUrl = await findFirstExisting(BRAND_PATHS.banner);
  const heroSection = $('heroSection');
  const heroBanner  = $('heroBanner');

  if (bannerUrl && heroSection && heroBanner){
    heroBanner.style.backgroundImage = `url('${bannerUrl}')`;
    heroBanner.classList.remove('hidden');
    heroSection.classList.add('has-banner');
  }
}

/* ---------- NAV DINÁMICO ---------- */
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
  tool:    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'
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

  grid.innerHTML = list.map(p => {
    const img = getValidImages(p)[0];
    const off = p.compara && p.compara > p.precio
      ? Math.round((1 - p.precio / p.compara) * 100) : 0;
    const agotado = Number(p.stock) === 0;
    const badgeHtml = p.badge
      ? `<span class="tag-badge ${badgeColor(p.badge)}">${esc(p.badge)}</span>`
      : off ? `<span class="tag-badge orange">-${off}%</span>` : '';
    const specs = (p.desc || '').split('\n').filter(l => l.trim().startsWith('-')).slice(0,2)
      .map(l => l.replace(/^-\s*/,'').split(':')[0]).join(' · ');

    return `
    <article class="card-prod">
      <div class="prod-img" data-open="${p.id}">
        <img src="${esc(img)}" alt="${esc(p.nombre)}" loading="lazy"
             onerror="this.onerror=null;this.src='${PH}'">
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

/* ---------- PRODUCTO DETALLE ---------- */
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
}

function renderDetail(){
  const p = state.currentProduct;
  if (!p) return;
  const imgs = getValidImages(p);
  const colors = parseColors(p.colores);
  const off = p.compara && p.compara > p.precio
    ? Math.round((1 - p.precio / p.compara) * 100) : 0;

  $('detailContent').innerHTML = `
    <div class="product-detail">
      <div class="detail-gal">
        <div class="main" id="mainImgWrap">
          <img id="mainImg" src="${esc(imgs[0])}" alt="${esc(p.nombre)}"
               onerror="this.onerror=null;this.src='${PH}'">
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
            onerror="this.onerror=null;this.src='${PH}'">`).join('')}</div>` : ''}
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
      const active = root.querySelector('[data-thumb].active');
      const idx = active ? +active.dataset.thumb : 0;
      openLightbox(imgs, idx);
    };
  }
}

function updateQty(){
  $('qtyVal').textContent = state.selQty;
  $('subtotalPrev').textContent = money(state.currentProduct.precio * state.selQty);
}

/* =========================================================
   LIGHTBOX
   ========================================================= */
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
      onerror="this.onerror=null;this.src='${PH}'">`
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
  const firstImg = getValidImages(p)[0];
  if (found) found.qty += qty;
  else state.cart.push({
    key, id: p.id, nombre: p.nombre, precio: Number(p.precio),
    img: firstImg,
    talla: talla||'', color: color||'', sku: p.sku||'', qty
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
      <img src="${esc(i.img)}" alt="" onerror="this.onerror=null;this.src='${PH}'">
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
    const validCount = getValidImages(p).filter(u => u !== PH).length;
    const totalCount = (p.img || []).length;
    return `
    <div class="mini-item">
      <img src="${esc(getValidImages(p)[0])}" onerror="this.onerror=null;this.src='${PH}'">
      <div class="mi-info">
        <h4>${esc(p.nombre)}</h4>
        <small>${money(p.precio)} · Stock: ${p.stock} · ${esc(p.categoria||'General')}
        ${p.activo === false ? ' · <b style="color:#ef4444">OCULTO</b>' : ''}
        · ${validCount}/${totalCount} img</small>
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
        <img src="${esc(im)}" onerror="this.onerror=null;this.src='${PH}'">
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
  ['pNombre','pCategoria','pPrecio','pCompara','pCosto','pSku','pDesc','pTallas','pColores','pImgUrl','pBadge','pFolder']
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

  await Promise.all(state.tempImages.map(probeImage));
  const validImgs = state.tempImages.filter(u => imageCache.get(u) !== false);
  const skipped = state.tempImages.length - validImgs.length;

  if (!validImgs.length) return toast('Ninguna imagen se pudo cargar. Verifica la ruta.');

  const data = {
    nombre,
    categoria: $('pCategoria').value.trim() || 'General',
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

  if (skipped > 0) toast(`${skipped} imagen(es) no encontradas, se omitieron`);

  save(); clearForm(); renderAdminProducts(); renderAll();
}

/* ---------- CARPETA DE IMÁGENES ---------- */
async function loadImagesFromFolder(){
  const folder = $('pFolder').value.trim().replace(/\/+$/,'');
  const count  = Math.max(1, Math.min(50, Number($('pFolderCount').value) || 12));

  if (!folder) return toast('Escribe la ruta de la carpeta (ej: img/airpods)');

  const candidates = Array.from({length:count}, (_,i) => `${folder}/${i+1}.jpg`);
  toast('Buscando imágenes...');
  await Promise.all(candidates.map(probeImage));
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

function doLogin(){
  const pass = $('adminPass').value;
  if (pass === state.settings.pass){
    sessionStorage.setItem('adminOK','1');
    $('adminPass').value = '';
    showAdminBody();
  } else toast('Contraseña incorrecta');
}

function showAdminBody(){
  $('adminLogin').classList.add('hidden');
  $('adminBody').classList.remove('hidden');
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
    if (sessionStorage.getItem('adminOK') === '1'){
      showAdminBody();
    } else {
      $('adminLogin').classList.remove('hidden');
      $('adminBody').classList.add('hidden');
      setTimeout(() => $('adminPass').focus(), 100);
    }
  };

  $('loginBtn2').onclick = doLogin;
  $('adminPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

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

async function init(){
  const grid = $('grid');
  if (grid) grid.innerHTML = '<div class="empty"><p>Cargando productos...</p></div>';

  await load();
  migrateProducts();
  await preloadImageCache();

  applySettings();
  await applyBrand();
  bindEvents();
  renderAll();
  renderThumbs();
}

init();
})();