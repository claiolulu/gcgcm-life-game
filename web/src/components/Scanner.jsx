import React, { useEffect, useRef, useState } from 'react';

/**
 * 扫码器。优先用浏览器原生 BarcodeDetector（Android Chrome 上又快又省电），
 * 不支持就动态加载 jsQR 兜底（iOS Safari 走这条路）。
 *
 * 注意：getUserMedia 只在安全上下文（HTTPS / localhost）下可用。
 * 因此本项目按公网 HTTPS 部署 —— http 的局域网地址是调不出摄像头的。
 * 无论如何，手动输入短码的通道永远保留。
 */
export default function Scanner({ onResult, active = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastRef = useRef({ text: '', at: 0 });
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let detector = null;
    let jsQR = null;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          window.isSecureContext
            ? '这个浏览器不支持调用摄像头，请用下面的手动输入'
            : '当前不是 HTTPS 环境，浏览器禁止访问摄像头。请改用 https 地址，或用下面的手动输入'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true'); // iOS 不全屏接管
        await video.play();
        setReady(true);

        if ('BarcodeDetector' in window) {
          try {
            const formats = await window.BarcodeDetector.getSupportedFormats?.();
            if (!formats || formats.includes('qr_code')) {
              detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            }
          } catch { detector = null; }
        }
        if (!detector) {
          jsQR = (await import('jsqr')).default;
        }

        loop();
      } catch (err) {
        setError(
          err?.name === 'NotAllowedError'
            ? '没有摄像头权限。请在浏览器设置里允许，或用下面的手动输入'
            : '摄像头打不开，请用下面的手动输入'
        );
      }
    }

    function hit(text) {
      const now = Date.now();
      // 同一个码 2 秒内只触发一次，避免连续回调
      if (lastRef.current.text === text && now - lastRef.current.at < 2000) return;
      lastRef.current = { text, at: now };
      navigator.vibrate?.(60);
      onResult?.(text);
    }

    async function loop() {
      if (cancelled) return;
      const video = videoRef.current;

      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes?.[0]?.rawValue) hit(codes[0].rawValue);
          } else if (jsQR) {
            const canvas = canvasRef.current;
            const w = 420;
            const h = Math.round((video.videoHeight / video.videoWidth) * w) || 420;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const found = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (found?.data) hit(found.data);
          }
        } catch { /* 单帧失败无所谓，下一帧继续 */ }
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active, onResult]);

  if (error) {
    return (
      <div className="card center" style={{ padding: '24px 16px' }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>📷</div>
        <div className="small muted">{error}</div>
      </div>
    );
  }

  return (
    <div className="scanner">
      <video ref={videoRef} muted playsInline />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div className="scanner__frame" />
      {ready && <div className="scanner__laser" />}
    </div>
  );
}
