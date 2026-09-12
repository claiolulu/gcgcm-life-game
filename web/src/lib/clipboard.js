/**
 * 复制一段文字，尽量让它在现场那些浏览器上都能成。
 *
 * navigator.clipboard 只在安全上下文里存在（https 或 localhost）。同工用
 * 局域网地址（http://192.168.x.x）打开总控台时，它整个是 undefined —— 所以
 * 还留着一条老路：塞一个临时 textarea 再 execCommand('copy')。那个 API 早就
 * 标了废弃，但至今没有一个浏览器真的拿掉，而且不挑上下文。
 *
 * 返回成功与否，让调用方自己决定提示什么。
 */
export async function copyText(text) {
  const s = String(text ?? '').trim();
  if (!s) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch {
    // 有权限弹窗被拒、或者不在安全上下文，都落到下面那条路
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    // 不能用 display:none —— 选不中就复制不了。挪出视口即可
    ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, s.length);   // iOS 上光 select() 不够
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
