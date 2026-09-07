import { api } from './api.js';

/**
 * 上传前先在浏览器里压一遍。
 *
 * 手机直出的照片是四五兆、四千像素宽，原样传上去护照页要加载好几秒，
 * 而签证页上那块图只有八十来像素高 —— 传原图纯粹是浪费所有人的流量。
 * 1280px / q0.82 之后一般在 200KB 上下，放大看也还清楚。
 *
 * imageOrientation 要显式给：手机竖着拍的照片方向记在 EXIF 里，
 * 不给的话画到 canvas 上会躺倒。
 */
export async function shrink(file, max = 1280, quality = 0.82) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

/** 压缩 + 上传，返回 { url, bytes }。地址是内容哈希，同一张图传几次都一样。 */
export async function uploadPhoto(file, token) {
  if (!/^image\//.test(file?.type || '')) throw new Error('只能选图片');
  return api('/api/admin/upload', { method: 'POST', body: { data: await shrink(file) }, token });
}
