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

/** 视频上限，和服务端 VIDEO_MAX 保持一致 */
export const VIDEO_MAX_BYTES = 40 * 1024 * 1024;

/**
 * 上传一段活动短片。
 *
 * 和图片那条不一样：不压缩（浏览器里转码不现实），也不走 JSON ——
 * 直接把文件当请求体发过去。base64 会让体积涨三分之一，几十兆的片子
 * 编码本身就要卡住主线程几秒。
 *
 * 也不设超时：上传一段 30MB 的片子在会堂的 WiFi 上要好几分钟，
 * 8 秒就掐断的话永远传不上去。
 */
export async function uploadVideo(file, token) {
  if (!/^video\//.test(file?.type || '')) throw new Error('只能选视频');
  if (file.size > VIDEO_MAX_BYTES) {
    throw new Error(`视频 ${Math.round(file.size / 1048576)}MB，超过 40MB 上限。剪短一点，或者传到网盘再用页面链接挂过去。`);
  }
  const res = await fetch('/api/admin/upload/video', {
    method: 'POST',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) throw new Error(data?.error || `上传失败 (${res.status})`);
  return data;
}
