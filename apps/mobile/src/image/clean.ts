/**
 * On-device menu-image cleaning (SECURITY.md §3, §4 "DO").
 *
 * A menu photo is the ONLY user content we ever send off-device, and only after
 * it has been cleaned here. Cleaning has two jobs:
 *
 *   1. Strip EXIF/GPS metadata. We do this by RE-ENCODING the photo with
 *      expo-image-manipulator: decoding the source and writing a fresh JPEG
 *      produces a new compressed stream that carries NO EXIF/GPS block (no
 *      capture coordinates, timestamp, device serial, orientation tags, etc.).
 *      This is the documented behavior of the manipulator's save path on both
 *      iOS and Android — the output bitmap is encoded from pixels alone.
 *
 *   2. Shrink + compress so the upload is small and fast (and so any incidental
 *      high-frequency detail is degraded), while keeping the menu legible.
 *
 * The result is a `data:image/jpeg;base64,...` URL ready for the anonymous
 * `/scan` upload. Per SECURITY.md §1 the perception call carries ONLY this
 * cleaned image plus a static prompt — never account, allergies, location, or
 * free-text.
 *
 * Public surface is intentionally tiny: `cleanMenuImage` is the only function
 * wired into the scan flow today. `hasLikelyFaces` and `isLikelyMenu` are
 * documented stubs for the deferred face/person pre-flight (see below).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Longest-edge cap for the uploaded image, in pixels. Most menu text stays
 * readable for OCR/vision at this size, and the payload stays small. Aspect
 * ratio is always preserved (we only ever clamp the longer edge).
 */
const MAX_EDGE = 1280;

/**
 * JPEG quality for the re-encode (0..1). ~0.8 is a good legibility/size
 * tradeoff for text-heavy photos.
 */
const JPEG_QUALITY = 0.8;

/**
 * Clean a captured menu photo for upload.
 *
 * Re-encodes the image (which DROPS all EXIF/GPS metadata — see file header),
 * clamps the longest edge to {@link MAX_EDGE} preserving aspect ratio, and
 * compresses to a JPEG at {@link JPEG_QUALITY}. Returns a base64 `data:` URL.
 *
 * @param uri Local file URI of the freshly captured photo (e.g. `file://…`).
 * @returns A `data:image/jpeg;base64,…` URL safe to send to the anonymous
 *          `/scan` endpoint.
 * @throws If the manipulator cannot decode/encode the image, or if (defensively)
 *         no base64 payload is produced.
 */
export async function cleanMenuImage(
  uri: string,
  opts?: { targetAspect?: number },
): Promise<string> {
  // First render: decode the source so we can read its true pixel dimensions.
  // This render alone already re-encodes and therefore strips EXIF/GPS.
  const context = ImageManipulator.manipulate(uri);
  const decoded = await context.renderAsync();

  // FRAMING: the live camera preview fills the screen (cover), so it shows only the
  // CENTRE of the wider sensor frame. takePhoto() returns that full sensor frame, so
  // the saved photo looks "zoomed out" vs the preview. When the caller passes the
  // on-screen preview aspect (width/height), centre-crop the photo to it so the
  // analyzed image matches exactly what the user framed. (Gallery imports pass none.)
  let w = decoded.width;
  let h = decoded.height;
  const target = opts?.targetAspect;
  if (target && target > 0 && Number.isFinite(target)) {
    const current = w / h;
    let cropW = w;
    let cropH = h;
    if (current > target) {
      cropW = Math.round(h * target); // too wide -> trim sides
    } else if (current < target) {
      cropH = Math.round(w / target); // too tall -> trim top/bottom
    }
    if (cropW !== w || cropH !== h) {
      context.crop({
        originX: Math.round((w - cropW) / 2),
        originY: Math.round((h - cropH) / 2),
        width: cropW,
        height: cropH,
      });
      w = cropW;
      h = cropH;
    }
  }

  const longestEdge = Math.max(w, h);

  // Only downscale; never upscale a small photo (it would just add weight).
  if (longestEdge > MAX_EDGE) {
    if (w >= h) {
      // Passing a single dimension preserves aspect ratio in the v14 API.
      context.resize({ width: MAX_EDGE });
    } else {
      context.resize({ height: MAX_EDGE });
    }
  }

  // Final render reflects the resize (if any); save as a compressed JPEG.
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: JPEG_QUALITY,
    base64: true,
  });

  if (!result.base64) {
    // Defensive: with base64:true the manipulator always returns base64, but the
    // type is optional, so we fail loud rather than upload an empty payload.
    throw new Error('cleanMenuImage: image manipulator returned no base64 data');
  }

  return `data:image/jpeg;base64,${result.base64}`;
}

/**
 * Face/person pre-flight stub (SECURITY.md §3).
 *
 * Menu photos can incidentally capture faces/bystanders, which would be
 * special-category data we must NOT upload. The required behavior is to detect
 * faces/people on-device and then block or crop to the menu region before
 * cleaning.
 *
 * TODO(security, SECURITY.md §3): real detection needs an on-device vision
 * capability (e.g. ML Kit face/object detection or an on-device vision model)
 * and a physical device to validate against — it cannot be implemented or
 * meaningfully tested in the current JS-only/simulator setup, so it is
 * deferred. Until then this returns `false` (no claim of detection) and the
 * scan flow does not gate on it.
 *
 * @param _uri Local file URI of the candidate photo.
 * @returns Currently always `false` — detection is not yet implemented.
 */
export async function hasLikelyFaces(_uri: string): Promise<boolean> {
  // TODO(security, SECURITY.md §3): wire on-device face/person detection here.
  return false;
}

/**
 * "Is this actually a menu?" pre-flight stub (SECURITY.md §3).
 *
 * A cheap on-device sanity check (e.g. lightweight OCR confidence / text
 * density) so we don't burn a vision call — and don't upload an unrelated photo
 * — when the frame clearly isn't a menu.
 *
 * TODO(security, SECURITY.md §3): implement using an on-device OCR/text-density
 * heuristic. Deferred for the same device-validation reason as
 * {@link hasLikelyFaces}. Until then this returns `true` so the flow is not
 * blocked.
 *
 * @param _uri Local file URI of the candidate photo.
 * @returns Currently always `true` — the check is not yet implemented.
 */
export async function isLikelyMenu(_uri: string): Promise<boolean> {
  // TODO(security, SECURITY.md §3): implement on-device menu sanity check.
  return true;
}
