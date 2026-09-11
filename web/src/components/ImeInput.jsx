import React, { useEffect, useRef, useState } from 'react';

/**
 * 中文输入法安全的受控输入框。
 *
 * 拼音组合期间只更新本地草稿，不让父级画布跟着每个字母重绘；选字完成后
 * 再提交完整文字。这样 React 不会把正在输入的 DOM 值重写，光标也不会跳回开头。
 */
export default function ImeInput({ as = 'input', value = '', onValue, onBlur, ...props }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const ref = useRef(null);
  const composing = useRef(false);

  useEffect(() => {
    if (!composing.current && document.activeElement !== ref.current) {
      setDraft(String(value ?? ''));
    }
  }, [value]);

  const Tag = as;
  return (
    <Tag
      {...props}
      ref={ref}
      value={draft}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(e) => {
        composing.current = false;
        const next = e.currentTarget.value;
        setDraft(next);
        onValue?.(next);
      }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (!composing.current) onValue?.(next);
      }}
      onBlur={(e) => {
        if (draft !== String(value ?? '')) onValue?.(draft);
        onBlur?.(e);
      }}
    />
  );
}
