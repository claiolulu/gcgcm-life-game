import React, { useEffect, useState } from 'react';
import { Sheet, useToast } from '../../components/ui.jsx';
import ImeInput from '../../components/ImeInput.jsx';
import { api } from '../../lib/api.js';
import { shrink } from '../../lib/photo.js';

/** 参与者给当前活动提交文字/照片。弹层保持正向，不跟横版护照一起旋转。 */
export default function ActivityContributionSheet({ activity, token, onClose }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activity || !token) return;
    let alive = true;
    setText('');
    setFiles([]);
    setLoading(true);
    api(`/api/activity/${activity.id}/materials/mine`, { token })
      .then((res) => { if (alive) setItems(res.materials || []); })
      .catch((err) => { if (alive) toast(err.message || '素材读取失败', 'err'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activity?.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseFiles(selected) {
    const incoming = Array.from(selected || []).filter((file) => file.type.startsWith('image/'));
    if (!incoming.length) return;
    const remaining = Math.max(0, 30 - items.length - (text.trim() ? 1 : 0) - files.length);
    const available = Math.min(9 - files.length, remaining);
    if (available <= 0) return toast(files.length >= 9 ? '一次最多选择 9 张照片' : '最多保留 30 项上传内容', 'err');
    setFiles((cur) => [...cur, ...incoming.slice(0, available)]);
    if (incoming.length > available) toast(`本次已选前 ${available} 张，单次最多 9 张`, 'err');
  }

  async function submit() {
    const cleanText = text.trim();
    if (!cleanText && !files.length) return toast('请写一段文字或选择照片', 'err');
    const total = files.length + (cleanText ? 1 : 0);
    if (items.length + total > 30) return toast('最多保留 30 项上传内容，请先撤回部分内容', 'err');
    setBusy(true);
    setProgress({ done: 0, total });
    let done = 0;
    try {
      // 每张照片单独压缩和提交，避免多张大图挤爆手机内存或请求上限；
      // 已成功的照片会立即从待传队列移除，网络中断也不会重复上传。
      if (cleanText) {
        const res = await api(`/api/activity/${activity.id}/materials`, {
          method: 'POST', token, body: { text: cleanText }, timeout: 20000,
        });
        setItems((cur) => [...(res.materials || []), ...cur]);
        setText('');
        done += 1;
        setProgress({ done, total });
      }
      for (const file of files) {
        const imageData = await shrink(file, 1600, 0.84);
        const res = await api(`/api/activity/${activity.id}/materials`, {
          method: 'POST', token, body: { imageData }, timeout: 30000,
        });
        setItems((cur) => [...(res.materials || []), ...cur]);
        setFiles((cur) => cur.filter((candidate) => candidate !== file));
        done += 1;
        setProgress({ done, total });
      }
      toast(`已提交 ${total} 项素材`, 'ok');
    } catch (err) {
      toast(done ? `已成功上传 ${done} 项，其余请重试` : (err.message || '上传失败'), 'err');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function remove(item) {
    try {
      await api(`/api/activity/${activity.id}/materials/${item.id}`, { method: 'DELETE', token });
      setItems((cur) => cur.filter((x) => x.id !== item.id));
      toast('已撤回', 'ok');
    } catch (err) {
      toast(err.message || '撤回失败', 'err');
    }
  }

  return (
    <Sheet open={!!activity} onClose={onClose} title={`${activity?.name || '活动'} · 上传素材`}
      className="sheet--activity-contribute" backLabel="返回">
      <div className="stack activity-contribute">
        <div className="small muted activity-contribute__intro">
          写下感想、见证或活动总结，也可以上传照片。只有管理员能在该活动的画布素材库中查看。
        </div>

        <div className="activity-contribute__compose">
          <label className="stack-sm activity-contribute__editor">
            <span className="label">文字（可选）</span>
            <ImeInput as="textarea" className="input" rows={5} maxLength={1000} value={text}
              placeholder="写下想放进活动页面的内容……"
              onValue={setText} />
            <span className="tiny dim" style={{ textAlign: 'right' }}>{text.length}/1000</span>
          </label>

          <div className="stack-sm activity-contribute__media">
            <label className="activity-contribute__picker">
              <span className="activity-contribute__picker-icon">＋</span>
              <span className="grow">
                <b>{files.length ? `已选择 ${files.length} 张照片` : '选择多张照片'}</b>
                <span className="tiny dim" style={{ display: 'block', marginTop: 3 }}>一次最多 9 张，上传前自动压缩</span>
              </span>
              <input type="file" accept="image/*" multiple hidden disabled={busy}
                onChange={(e) => { chooseFiles(e.target.files); e.target.value = ''; }} />
            </label>

            <button className="btn btn--primary btn--full" disabled={busy} onClick={submit}>
              {busy && progress
                ? `正在上传 ${Math.min(progress.done + 1, progress.total)}/${progress.total}…`
                : '提交给活动同工'}
            </button>

            {files.length ? (
              <div className="activity-contribute__selected" aria-label="待上传照片">
                {files.map((file, index) => (
                  <SelectedPhoto key={`${file.name}-${file.size}-${file.lastModified}-${index}`} file={file}
                    onRemove={() => setFiles((cur) => cur.filter((_, i) => i !== index))} />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="activity-contribute__mine">
          <div className="row-between">
            <div className="section-title" style={{ margin: 0 }}>我已上传</div>
            <span className="tiny dim">{items.length}/30</span>
          </div>
          {loading ? <div className="small dim">正在读取…</div> : null}
          {!loading && items.length === 0 ? <div className="small dim">还没有上传内容</div> : null}
          <div className="activity-contribute__mine-list">
            {items.map((item) => (
              <div className="activity-contribute__item" key={item.id}>
                {item.kind === 'image'
                  ? <img src={item.content} alt="我上传的活动素材" />
                  : <div className="activity-contribute__text">{item.content}</div>}
                <button className="btn btn--sm btn--ghost" onClick={() => remove(item)}>撤回</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function SelectedPhoto({ file, onRemove }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="activity-contribute__selected-card">
      {src ? <img src={src} alt={file.name} /> : null}
      <button type="button" aria-label={`移除 ${file.name}`} onClick={onRemove}>×</button>
      <span title={file.name}>{file.name}</span>
    </div>
  );
}
