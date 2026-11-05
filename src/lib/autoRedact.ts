// ==============================================================================
// autoRedact — Caviardage automatique des zones sensibles d'une photo
// ==============================================================================
// Stratégie 100 % on-device (aucun envoi réseau de l'image — la photo ne
// quitte JAMAIS l'appareil avant d'être caviardée) :
//   1. Visages — MediaPipe Face Detector (IA embarquée, wasm, lazy-loaded)
//   2. Texte — OCR Tesseract (le MÊME moteur que Presidio Image Redactor,
//      compilé en WebAssembly via tesseract.js) : chaque ligne de texte
//      lue reçoit une boîte de caviardage précise, comme le ferait Presidio.
//      Sur une pièce d'identité, tout texte est sensible (nom, numéro, date,
//      adresse, MRZ) → on masque toutes les lignes détectées.
//   3. Repli — heuristique de bandes (projection de contraste) si l'OCR ne
//      lit rien (photo sombre, floue, angulée).
//
// Sortie : zones en coordonnées de l'image originale (px), prêtes pour le
// canvas de caviardage. L'utilisateur garde la main (ajout/suppression).
// ==============================================================================

import type { Worker as TessWorker } from 'tesseract.js';
import type { FaceDetector } from '@mediapipe/tasks-vision';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';

let detectorPromise: Promise<FaceDetector | null> | null = null;

/** Charge paresseusement le détecteur de visages MediaPipe (wasm + modèle). */
export function loadFaceDetector(): Promise<FaceDetector | null> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        const detector = await vision.FaceDetector.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU'
          },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.3
        });
        return detector;
      } catch (err) {
        console.warn('MediaPipe indisponible, heuristique seule:', err);
        return null;
      }
    })();
  }
  return detectorPromise;
}

// ── OCR Tesseract (presidio-like, wasm on-device) ────────────────────────────

let ocrWorkerPromise: Promise<TessWorker | null> | null = null;

/**
 * Charge paresseusement le worker OCR (fra+eng : documents camerounais
 * bilingues). Le worker, le noyau wasm et les modèles de langue sont
 * téléchargés une seule fois puis mis en cache par le navigateur.
 */
function loadOcrWorker(): Promise<TessWorker | null> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      try {
        // Le paquet est CommonJS : selon le bundler, les exports nommés sont
        // au premier niveau (ESM interop) ou sous `.default` (Vite/esbuild).
        type TessModule = typeof import('tesseract.js');
        const imported = (await import('tesseract.js')) as unknown as {
          createWorker?: TessModule['createWorker'];
          default?: TessModule & Record<string, unknown>;
        };
        const createWorker = imported.createWorker ?? imported.default?.createWorker;
        if (!createWorker) throw new Error('createWorker introuvable dans tesseract.js');
        return await createWorker(['fra', 'eng']);
      } catch (err) {
        console.warn('OCR Tesseract indisponible, bandes de repli:', err);
        return null;
      }
    })();
  }
  return ocrWorkerPromise;
}

export interface RedactionZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fusionne les zones qui se chevauchent (avec marge). */
function mergeZones(zones: RedactionZone[], margin = 6): RedactionZone[] {
  if (zones.length === 0) return [];
  const rects = zones.map(z => ({
    x1: z.x - margin, y1: z.y - margin,
    x2: z.x + z.w + margin, y2: z.y + z.h + margin
  }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
        if (overlap) {
          rects[i] = {
            x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1),
            x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2)
          };
          rects.splice(j, 1);
          changed = true;
        }
      }
    }
  }
  return rects.map(r => ({ x: Math.round(r.x1), y: Math.round(r.y1), w: Math.round(r.x2 - r.x1), h: Math.round(r.y2 - r.y1) }));
}

/** Part des pixels de l'image couverte par les zones (0..1). */
export function coveredRatio(zones: RedactionZone[], iw: number, ih: number): number {
  if (!iw || !ih || zones.length === 0) return 0;
  let area = 0;
  for (const z of zones) {
    const w = Math.min(Math.max(0, z.w), iw);
    const h = Math.min(Math.max(0, z.h), ih);
    area += w * h;
  }
  return Math.min(1, area / (iw * ih));
}

/** Recouvrement d'une zone par une autre, relatif à la surface de `z`. */
function overlapRatio(z: RedactionZone, other: RedactionZone): number {
  const x1 = Math.max(z.x, other.x);
  const y1 = Math.max(z.y, other.y);
  const x2 = Math.min(z.x + z.w, other.x + other.w);
  const y2 = Math.min(z.y + z.h, other.y + other.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const own = Math.max(1, z.w * z.h);
  return Math.min(1, inter / own);
}

/**
 * Ligne à haut risque : numéro long, date, MRZ ou libellé de champ sensible.
 * Ces valeurs partagent souvent leur ligne avec le libellé et peuvent déborder
 * de la boîte OCR (chiffres fins, cachet ou reflet par-dessus) → on masque
 * toute la largeur de l'image plutôt que la seule boîte détectée.
 */
const HIGH_RISK_KEYWORDS = /\bnum[eé]ro\b|\bn[°º]|\bdate\b|\bsignature\b|\bvalable\b|\bexpir\w*|\bd[ée]livr\w*/i;

export function isHighRiskLine(text: string): boolean {
  const digits = (text.match(/\d/g) || []).length;
  if (digits >= 5) return true; // n° CNI, passeport, permis, téléphone
  if (/\d{1,2}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*\d{2,4}/.test(text)) return true; // date
  if (text.includes('<')) return true; // bande MRZ des passeports
  if (HIGH_RISK_KEYWORDS.test(text)) return true;
  return false;
}

/**
 * OCR (Tesseract wasm, identique au moteur de Presidio Image Redactor) :
 * reconnaît le texte de l'image et retourne une boîte de caviardage par
 * LIGNE lue (bbox Tesseract), avec marges. `chars` = nombre de caractères
 * réellement reconnus (sert de critère de repli vers l'heuristique bandes).
 */
export async function detectOcrTextZones(
  img: HTMLImageElement | HTMLCanvasElement
): Promise<{ zones: RedactionZone[]; chars: number; highRisk: number }> {
  const src = img as HTMLImageElement;
  const iw = src.naturalWidth || (img as HTMLCanvasElement).width;
  const ih = src.naturalHeight || (img as HTMLCanvasElement).height;
  if (!iw || !ih) return { zones: [], chars: 0, highRisk: 0 };

  // Downscale pour la vitesse : l'OCR reste précis à ~1200 px de large,
  // et les boîtes sont re-mises à l'échelle de l'original ensuite.
  const MAX = 1200;
  const scale = Math.min(1, MAX / Math.max(iw, ih));
  let input: HTMLImageElement | HTMLCanvasElement = img;
  if (scale < 1) {
    const c = document.createElement('canvas');
    c.width = Math.round(iw * scale);
    c.height = Math.round(ih * scale);
    const ctx = c.getContext('2d');
    if (!ctx) return { zones: [], chars: 0, highRisk: 0 };
    ctx.drawImage(img, 0, 0, c.width, c.height);
    input = c;
  }

  const worker = await loadOcrWorker();
  if (!worker) return { zones: [], chars: 0, highRisk: 0 };

  // v7 : les blocs (bbox par ligne/mot) ne sont PAS générés par défaut —
  // il faut demander explicitement blocks: true.
  const { data } = await worker.recognize(input, {}, { blocks: true, text: true });

  // Chaque ligne lue → une zone (bbox Tesseract + mots exploitables).
  const boxes: RedactionZone[] = [];
  let chars = 0;
  let highRisk = 0;
  const lines = (data.blocks ?? []).flatMap(b => b.paragraphs ?? []).flatMap(p => p.lines ?? []);
  for (const line of lines) {
    const words = (line.words ?? []).filter(
      w => (w.text || '').trim().length > 0 && (w.confidence ?? 0) >= 35
    );
    if (words.length === 0) continue;
    const text = words.map(w => w.text).join('');
    chars += text.replace(/\s/g, '').length;
    const bw = (line.bbox.x1 - line.bbox.x0) / scale;
    const bh = (line.bbox.y1 - line.bbox.y0) / scale;
    const bx = line.bbox.x0 / scale;
    const by = line.bbox.y0 / scale;
    if (bw <= 0 || bh <= 0) continue;
    if (bw * bh > iw * ih * 0.5) continue; // boîte absurde (page entière)
    // Padding proportionnel : couvre hauts/descendants et la chasse du texte
    const padX = Math.max(4, bh * 0.25);
    const padY = Math.max(3, bh * 0.35);
    if (isHighRiskLine(text)) {
      highRisk++;
      boxes.push({ x: 0, y: by - padY, w: iw, h: bh + padY * 2 });
    } else {
      boxes.push({ x: bx - padX, y: by - padY, w: bw + padX * 2, h: bh + padY * 2 });
    }
  }

  // Fusion légère des lignes qui se touchent (label + valeur très proches).
  return { zones: mergeZones(boxes, 8), chars, highRisk };
}

/**
 * Heuristique « bandes de texte » (repli) : binarise l'image, projette
 * l'alternance sombre/clair par ligne et retient les bandes à forte densité
 * de texte. Retourne les zones élargies.
 */
export function detectTextBands(
  img: HTMLImageElement | HTMLCanvasElement
): RedactionZone[] {
  const src = img as HTMLImageElement;
  const iw = src.naturalWidth || (img as HTMLCanvasElement).width;
  const ih = src.naturalHeight || (img as HTMLCanvasElement).height;
  if (!iw || !ih) return [];

  const W = 320;
  const scale = W / iw;
  const w = W;
  const h = Math.max(1, Math.round(ih * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return []; // image cross-origin sans CORS
  }

  // Luminance moyenne → seuil de binarisation ADAPTATIF : un texte fin,
  // anti-aliasé sur fond clair (~210) reste détectable (coupure à ~72 % du fond)
  let lumSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    lumSum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const meanLum = lumSum / (data.length / 4);
  const darkCut = Math.min(150, meanLum * 0.72);

  // Score de « texturalité » par ligne : alternance sombre/clair = texte
  const rawScore = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let transitions = 0;
    let prev = (data[y * w * 4] + data[y * w * 4 + 1] + data[y * w * 4 + 2]) / 3 < darkCut ? 0 : 1;
    for (let x = 1; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const bin = lum < darkCut ? 0 : 1;
      if (bin !== prev) transitions++;
      prev = bin;
    }
    rawScore[y] = transitions / w;
  }

  // Lissage sur 3 lignes : rend les bandes contiguës malgré l'anti-aliasing
  const rowScore = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    const a = rawScore[Math.max(0, y - 1)];
    const b = rawScore[y];
    const c2 = rawScore[Math.min(h - 1, y + 1)];
    rowScore[y] = (a + b + c2) / 3;
  }

  // Bandes candidates : lignes contiguës au-dessus du seuil
  const THRESH = 0.065; // ~6,5 % de transitions/ligne : attrape aussi en-têtes
  // et lignes MRZ (texte espacé) sans faux positifs sur fonds unis
  const MIN_BAND_H = 2;
  const bands: Array<{ y1: number; y2: number; score: number }> = [];
  let start = -1;
  let acc = 0;
  for (let y = 0; y <= h; y++) {
    const s = y < h ? rowScore[y] : 0;
    const above = s >= THRESH;
    if (above && start === -1) { start = y; acc = s; }
    else if (above) { acc += s; }
    else if (start !== -1) {
      const bandH = y - start;
      if (bandH >= MIN_BAND_H) bands.push({ y1: start, y2: y, score: acc / bandH });
      start = -1; acc = 0;
    }
  }

  // Élargissement : couvrir la largeur réelle du texte + label/valeur adjacents
  const expandY = Math.round(h * 0.02);
  const zones: RedactionZone[] = bands.map(b => ({
    x: 0,
    y: Math.max(0, Math.round((b.y1 - expandY) / scale)),
    w: iw, // bande pleine largeur — les documents impriment le texte sur toute la carte
    h: Math.round((b.y2 - b.y1 + expandY * 2) / scale)
  }));

  // Filtre : ignore les bandes géantes (fond uni / zone photo dominante)
  const filtered = zones.filter(z => z.h < ih * 0.35);
  return mergeZones(filtered, Math.round(4 / scale) + 2);
}

export interface AutoDetectResult {
  zones: RedactionZone[];
  faces: number;
  /** Nombre de zones de texte finales (OCR et/ou bandes). */
  textBands: number;
  /** true si au moins une zone vient de l'OCR Tesseract. */
  ocrUsed: boolean;
  /** Caractères reconnus par l'OCR (0 si indisponible). */
  ocrChars: number;
  /** Lignes à haut risque (numéro, date, MRZ) masquées sur toute la largeur. */
  highRisk: number;
  /** Part de l'image couverte par l'ensemble des zones (0..1). */
  coverage: number;
}

/** Analyse complète : visages (IA) + texte (OCR Tesseract, repli bandes). */
export async function autoDetectZones(
  img: HTMLImageElement
): Promise<AutoDetectResult> {
  const faceZones: RedactionZone[] = [];
  let faces = 0;

  // 1) Visages — modèle IA (tolérant si le modèle échoue à charger)
  try {
    const detector = await loadFaceDetector();
    if (detector) {
      const result = detector.detect(img);
      for (const d of result.detections) {
        const bb = d.boundingBox;
        if (!bb) continue;
        // Élargir le visage : couvrir cheveux/menton/marges
        const padX = bb.width * 0.18;
        const padY = bb.height * 0.28;
        faceZones.push({
          x: bb.originX - padX,
          y: bb.originY - padY,
          w: bb.width + padX * 2,
          h: bb.height + padY * 2
        });
      }
      faces = result.detections.length;
    }
  } catch (err) {
    console.warn('Détection visages échouée:', err);
  }

  // 2) Texte — OCR (boîtes précises type Presidio) COMPLÉTÉ par les bandes.
  //    Les deux ne sont pas exclusifs : un OCR qui ne lit que quelques
  //    caractères (photo sombre, cachet, angle) laisserait sinon la carte à
  //    découvert. Le repli bandes reste donc calculé, et sert aussi de filet
  //    de sécurité quand la couverture OCR est faible.
  const src = img as HTMLImageElement;
  const iw = src.naturalWidth || 0;
  const ih = src.naturalHeight || 0;

  let textZones: RedactionZone[] = [];
  let ocrChars = 0;
  let highRisk = 0;
  let ocrUsed = false;

  let bands: RedactionZone[] = [];
  try {
    bands = detectTextBands(img);
  } catch (err) {
    console.warn('Détection de bandes échouée:', err);
  }

  try {
    const ocr = await detectOcrTextZones(img);
    ocrChars = ocr.chars;
    highRisk = ocr.highRisk;
    if (ocr.zones.length > 0) {
      textZones = ocr.zones;
      ocrUsed = true;
    }
  } catch (err) {
    console.warn('OCR échoué, repli bandes:', err);
  }

  const ocrCoverage = coveredRatio(textZones, iw, ih);
  const weakOcr = ocrChars < 20 || ocrCoverage < 0.04;
  if (weakOcr && bands.length > 0) {
    // N'ajoute que les bandes qui n'apportent pas déjà une information
    // redondante : évite d'empiler 20 zones inutiles sur les lignes lues.
    const extra = bands.filter(b => !textZones.some(t => overlapRatio(b, t) > 0.5));
    textZones = [...textZones, ...extra];
  }

  // Fusion PAR CATÉGORIE (jamais visage+texte ensemble, sinon une seule
  // méga-zone recouvrirait toute la carte) puis concaténation.
  const mergedFaces = mergeZones(faceZones, 4);
  const mergedText = mergeZones(textZones, 8);
  const zones = [...mergedFaces, ...mergedText];

  return {
    zones,
    faces,
    textBands: mergedText.length,
    ocrUsed,
    ocrChars,
    highRisk,
    coverage: coveredRatio(zones, iw, ih)
  };
}
