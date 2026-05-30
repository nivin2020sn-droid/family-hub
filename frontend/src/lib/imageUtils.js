// Resize an image file to a square avatar (default 256px) and return a
// base64 data URL. Keeps payloads under ~30 KB for typical phone photos so
// they fit comfortably in the family_members document.
export async function fileToAvatarDataUrl(file, { size = 256, quality = 0.85 } = {}) {
  if (!file) return null;
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("UNSUPPORTED_TYPE");
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });

  // Decode → centre-crop → resize → re-encode JPEG.
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("DECODE_FAILED"));
    i.src = dataUrl;
  });

  const minSide = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - minSide) / 2;
  const sy = (img.naturalHeight - minSide) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", quality);
}
