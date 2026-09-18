// ==============================================================================
// autoRedact — Caviardage automatique des zones sensibles d'une photo
// ==============================================================================
// Stratégie 100 % on-device (aucun envoi réseau de l'image) :
//   1. Visages — MediaPipe Face Detector (IA embarquée, wasm, lazy-loaded)
//   2. Bandes de texte sensibles — heuristique : détecte les lignes de texte
//      denses (nom, numéro, MRZ passeport) par projection horizontale du
//      contraste, puis élargit chaque bande pour couvrir label + valeur.
//
// Sortie : zones en coordonnées de l'image originale (px), prêtes pour le
// canvas de caviardage. L'utilisateur garde la main (ajout/suppression).
// ==============================================================================

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

/**
 * Heuristique « bandes de texte » : binarise l'image, projette l'alternance
 * sombre/clair par ligne et retient les bandes à forte densité de texte
 * (nom, numéro de carte, MRZ passeport…). Retourne les zones élargies.
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

/** Analyse complète : visages (IA) + bandes de texte (heuristique). */
export async function autoDetectZones(
  img: HTMLImageElement
): Promise<{ zones: RedactionZone[]; faces: number; textBands: number }> {
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

  // 2) Bandes de texte sensibles (heuristique, toujours exécutée)
  const bands = detectTextBands(img);

  // Fusion PAR CATÉGORIE (jamais visage+texte ensemble, sinon une seule
  // méga-zone recouvrirait toute la carte) puis concaténation.
  const mergedFaces = mergeZones(faceZones, 4);
  const mergedBands = mergeZones(bands, 8);

  return { zones: [...mergedFaces, ...mergedBands], faces, textBands: bands.length };
}
