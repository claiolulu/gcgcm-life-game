import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

/**
 * 护照二维码。
 * 载荷只放短码（MLG:XXXXXX）而不是长 URL —— 点阵密度低，
 * 教堂灯光暗、屏幕有划痕、隔着防窥膜也能一次扫上。
 * 纠错等级 H：即使被手指遮住一角依然可读。
 */
export default function QRCard({ code, size = 220 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !code) return;

    QRCode.toCanvas(
      canvas,
      `MLG:${code}`,
      {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: size * 2, // 2 倍位图，高 DPI 屏不糊
        color: { dark: '#0d1220ff', light: '#ffffffff' },
      },
      (err) => {
        if (err) return console.error('[qr]', err);
        // qrcode 会把 canvas 的行内 style 覆盖成位图尺寸（这里是 2 倍），
        // 渲染完必须改回显示尺寸，否则会撑破容器。
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      }
    );
  }, [code, size]);

  return (
    <div className="qr-plate" style={{ width: size + 28, maxWidth: '100%' }}>
      <canvas ref={ref} style={{ width: size, height: size }} />
    </div>
  );
}
