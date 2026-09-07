import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import { NetBar, Sheet, useToast, useConfirm, useLocalState, ago } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useConfig, loadConfig } from '../lib/config.js';
import { useStaff, flush, logout, allPlayers, leaderboardLocal, applyRoster } from '../lib/staff.js';
import { themeVarsOf, coverBgOf } from './book/bookVals.js';

export default function Admin() {
  const nav = useNavigate();
  const toast = useToast();
  const ask = useConfirm();
  const { config } = useConfig();
  const staff = useStaff();
  const token = staff.session?.token;
  // 距离活动结束还有多少分钟。没法自动知道，给个可调的估值
  const [minutesLeft, setMinutesLeft] = useLocalState('mlg.minutesLeft', 33);

  // 各关忙闲随同步一起来，只有 id 和数字；名字图标从配置里补
  const load = useMemo(() => {
    const meta = new Map((config?.stations || []).map((st) => [st.id, st]));
    return (staff.load || []).map((x) => ({ ...x, ...(meta.get(x.id) || { name: x.id, icon: '📍' }) }));
  }, [staff.load, config]);

  const [busy, setBusy] = useState(null);
  const [drawResult, setDrawResult] = useState(null);
  const [awards, setAwards] = useState([]);
  const [awardSheet, setAwardSheet] = useState(null);
  const [picked, setPicked] = useState([]);        // 手动分配时勾选的人
  const [manualOpen, setManualOpen] = useState(false);

  const settings = config?.settings || {};
  const stations = config?.stations || [];
  const awardDefs = config?.awards || [];
  const resetPin = config?.resetPin || '3927';
  const players = useMemo(() => allPlayers(), [staff.players, staff.outbox]); // eslint-disable-line
  const board = useMemo(() => leaderboardLocal(), [staff.players, staff.outbox]); // eslint-disable-line

  /**
   * 容量体检：按「组数 × 8 关」的需求对上「各关每分钟能过几组」的供给。
   *
   * 全在客户端算 —— 关卡耗时在 /api/config 里本来就有，组数从花名册数，
   * 不用为这个多发一次请求。
   */
  const capacity = useMemo(() => {
    const sts = (config?.stations || []).filter((st) => st.minutes);
    if (sts.length === 0 || players.length === 0) return null;

    const teams = new Set();
    let loners = 0;
    for (const p of players) { if (p.teamId) teams.add(p.teamId); else loners++; }
    const groups = teams.size + loners;

    const per = sts.map((st) => ({
      name: st.name, cap: Math.floor(minutesLeft / st.minutes),
    }));
    const total = per.reduce((a, x) => a + x.cap, 0);
    // 人少的时候供给远大于需求，算出来会是「每组跑得完 18 关」这种
    // 显然不对的数 —— 一共就 8 关，封顶
    const avgRaw = groups > 0 ? total / groups : 0;
    return {
      groups, minutes: minutesLeft, total,
      avg: Math.round(Math.min(avgRaw, sts.length) * 10) / 10,
      enough: avgRaw >= sts.length,
      // 接待不下一半队伍的就是瓶颈，值得当场加人手
      tight: per.filter((x) => x.cap < groups * 0.5).sort((a, b) => a.cap - b.cap),
    };
  }, [config, players, minutesLeft]);

  /**
   * 每一组的关卡顺序，给主持人看的。
   *
   * 同队共用一条路线，所以按 team_id 归拢；solo 和还没编队的各算一组。
   * 每关标出已完成 / 下一站，一眼能看出谁卡在哪儿。
   */
  const routes = useMemo(() => {
    const meta = new Map((config?.stations || []).map((st) => [st.id, st]));
    const hexOf = new Map((config?.groupColors || []).map((c) => [c.key, c.hex]));
    const byGroup = new Map();
    for (const p of players) {
      if (!Array.isArray(p.route) || p.route.length === 0) continue;
      const key = p.teamId || `solo:${p.id}`;
      if (!byGroup.has(key)) {
        byGroup.set(key, {
          key,
          teamId: p.teamId,
          color: p.teamColor,
          symbol: p.teamSymbol,
          identity: p.identity,
          hex: hexOf.get(p.teamColor),
          members: [],
          route: p.route,
          done: new Set(),
        });
      }
      const g = byGroup.get(key);
      g.members.push(p);
      // 同队各人的盖章可能有先后，取并集当作这一组的进度
      for (const id of Object.keys(p.stations || {})) g.done.add(id);
    }
    return [...byGroup.values()].map((g) => ({
      ...g,
      label: g.members.map((m) => m.name).join(' · '),
      codes: g.members.map((m) => m.code).join('/'),
      steps: g.route.map((id) => ({
        id,
        name: meta.get(id)?.name || id,
        icon: meta.get(id)?.icon || '',
        done: g.done.has(id),
      })),
    })).sort((a, b) => a.codes.localeCompare(b.codes));
  }, [players, config]);

  /* -------------------------- 活动清单 -------------------------- */

  const [acts, setActs] = useState(null);      // null = 还没从配置载入
  const [actsDirty, setActsDirty] = useState(false);

  // 配置到了或被别处改过就重新载入；本地有未保存的改动时不覆盖，
  // 免得同工打了一半字被同步刷掉
  useEffect(() => {
    if (actsDirty) return;
    setActs((config?.activities || []).map((a) => ({ ...a })));
  }, [config, actsDirty]);

  // 每场活动已经有多少人盖过章 —— 删之前得让人看见代价
  const stampCount = useMemo(() => {
    const n = {};
    for (const p of players) {
      for (const id of Object.keys(p.stations || {})) n[id] = (n[id] || 0) + 1;
    }
    return n;
  }, [players]);

  const editAct = (i, patch) => {
    setActs((cur) => cur.map((a, k) => (k === i ? { ...a, ...patch } : a)));
    setActsDirty(true);
  };

  const moveAct = (i, d) => {
    setActs((cur) => {
      const next = [...cur];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
    setActsDirty(true);
  };

  async function removeAct(i) {
    const a = acts[i];
    const n = stampCount[a.id] || 0;
    const ok = await ask({
      title: `删掉「${a.name}」？`,
      danger: true,
      confirmText: '删掉',
      body: n > 0
        ? `已经有 ${n} 个人在这一场盖过章。删掉之后护照里不再有这一页，`
          + '那些记录还在数据库里但不会显示。确定要删吗？'
        : '还没有人在这一场盖过章，删掉没有影响。',
    });
    if (!ok) return;
    setActs((cur) => cur.filter((_, k) => k !== i));
    setActsDirty(true);
  }

  function addAct() {
    // id 一旦建立就不再改：盖过的章靠它认领归属。
    // 用时间戳生成，避免和已有的撞上
    const id = `act-${Date.now().toString(36)}`;
    setActs((cur) => [...cur, {
      id, icon: '📍', name: '', en: '', date: '', tag: '', host: '', desc: '',
      landmarkKey: '',
    }]);
    setActsDirty(true);
  }

  async function saveActs() {
    setBusy('acts');
    try {
      const res = await api('/api/admin/activities', {
        method: 'POST', body: { activities: acts }, token,
      });
      setActs(res.activities);
      setActsDirty(false);
      await loadConfig();          // 让本页的 config 立刻拿到新清单
      toast(`已保存 ${res.activities.length} 场活动`, 'ok');
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /* -------------------------- 活动配图 -------------------------- */

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
  async function shrink(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const max = 1280;
    const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * k));
    const h = Math.max(1, Math.round(bitmap.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  async function pickPhoto(i, file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast('只能选图片', 'err');
    setBusy(`photo-${i}`);
    try {
      const res = await api('/api/admin/upload', {
        method: 'POST', body: { data: await shrink(file) }, token,
      });
      editAct(i, { photo: res.url });
      toast(`配图已上传（${Math.round(res.bytes / 1024)}KB），记得保存`, 'ok');
    } catch (err) {
      toast(err.message || '上传失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /* ------------------------ 签证页模版 ------------------------ */

  const [tpl, setTpl] = useState(null);           // null = 还没从配置载入
  const [tplDirty, setTplDirty] = useState(false);
  const sources = config?.visaSources || [];

  useEffect(() => {
    if (tplDirty) return;
    if (config?.visaTemplate) setTpl(JSON.parse(JSON.stringify(config.visaTemplate)));
  }, [config, tplDirty]);

  const editTpl = (patch) => {
    setTpl((cur) => ({ ...cur, ...patch }));
    setTplDirty(true);
  };

  /**
   * 栏目表的增删改查。模版和「某场活动自己那套」用的是同一批函数 ——
   * 两边的数据结构本来就是同一个，分成两套只会写岔。
   *
   * rows 传进来，改完的 rows 传出去，谁来存由调用方决定。
   */
  const rowOps = (rows, save) => ({
    edit: (i, patch) => save(rows.map((r, k) => (k === i ? { ...r, ...patch } : r))),
    move: (i, d) => {
      const next = [...rows];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      save(next);
    },
    remove: (i) => save(rows.filter((_, k) => k !== i)),
    add: () => save([...rows, {
      key: `r${Date.now().toString(36)}`, label: '', src: 'text', text: '', accent: false,
    }]),
  });

  async function saveTpl() {
    setBusy('tpl');
    try {
      const res = await api('/api/admin/visa-template', { method: 'POST', body: tpl, token });
      setTpl(res.visaTemplate);
      setTplDirty(false);
      await loadConfig();
      toast('签证页模版已保存', 'ok');
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /* ---------------- 某场活动自己那套版式 / 页面链接 ---------------- */

  /** 从跟随模版切成自己一套：把模版整份抄一份给它，之后两边各走各的 */
  function detachPage(i) {
    editAct(i, { page: JSON.parse(JSON.stringify(tpl || config?.visaTemplate || {})) });
  }
  function attachPage(i) {
    editAct(i, { page: undefined });
  }
  const editPage = (i, patch) => {
    const cur = acts[i].page || {};
    editAct(i, { page: { ...cur, ...patch } });
  };

  const linkOps = (i) => {
    const links = acts[i].links || [];
    const save = (next) => editAct(i, { links: next });
    return {
      edit: (k, patch) => save(links.map((l, j) => (j === k ? { ...l, ...patch } : l))),
      remove: (k) => save(links.filter((_, j) => j !== k)),
      add: () => save([...links, { icon: '🔗', label: '', url: '' }]),
    };
  };

  /* -------------------------- 护照模版 -------------------------- */

  const [theme, setTheme] = useState(null);        // null = 还没从配置载入
  const [themeDirty, setThemeDirty] = useState(false);
  const presets = config?.themePresets || [];

  useEffect(() => {
    if (themeDirty) return;
    if (config?.theme) setTheme({ ...config.theme });
  }, [config, themeDirty]);

  const editTheme = (patch) => {
    setTheme((cur) => ({ ...cur, ...patch }));
    setThemeDirty(true);
  };

  const applyPreset = (pre) => {
    const { key, name, ...colors } = pre;
    editTheme({ ...colors, preset: key });
  };

  async function saveTheme() {
    setBusy('theme');
    try {
      const res = await api('/api/admin/theme', { method: 'POST', body: theme, token });
      setTheme(res.theme);
      setThemeDirty(false);
      await loadConfig();
      toast('模版已保存，所有人的护照都换了', 'ok');
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    } finally {
      setBusy(null);
    }
  }



  useEffect(() => {
    if (staff.session && staff.session.role !== 'admin') nav('/staff/scan', { replace: true });
  }, [staff.session, nav]);

  useEffect(() => {
    api('/api/awards').then((r) => setAwards(r.awards || [])).catch(() => {});
  }, []);

  async function patchSettings(patch, label) {
    setBusy(label);
    try {
      await api('/api/admin/settings', { method: 'POST', body: patch, token });
      await loadConfig();
      toast('设置已更新', 'ok');
    } catch (err) {
      toast(err.message || '更新失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  const unassigned = useMemo(() => players.filter((p) => !p.identity), [players]);

  // 同名的多半是「忘了密码又报了一次」。报名时已经拦过一道，
  // 但选手可能点了「不是我」，所以这里再列出来让同工核对。
  const duplicates = useMemo(() => {
    const byName = {};
    players.forEach((p) => { (byName[p.name] = byName[p.name] || []).push(p); });
    return Object.entries(byName)
      .filter(([, list]) => list.length > 1)
      .map(([name, list]) => ({ name, list: list.sort((a, b) => a.code.localeCompare(b.code)) }));
  }, [players]);

  /** mode='fill' 只补没身份的人；'all' 全部重新洗牌 */
  async function draw(mode) {
    const n = mode === 'all' ? players.length : unassigned.length;
    if (n === 0) return toast(mode === 'all' ? '还没有人报名' : '所有人都已经分配过了', 'warn');
    const ok = await ask(mode === 'all'
      ? { title: '全部重新洗牌？', danger: true, confirmText: `重新洗牌 ${players.length} 人`,
          body: `已经找到队友的人会被打散重来，场上正在进行的组队会全部作废。\n开场前彩排完再用这个。` }
      : { title: `为 ${n} 人分配身份？`, confirmText: `分配这 ${n} 人`,
          body: '只给还没有身份的人分配，已经分好的人完全不受影响。' });
    if (!ok) return;

    setBusy('draw');
    try {
      const res = await api('/api/admin/draw', { method: 'POST', body: { mode }, token, timeout: 20000 });
      setDrawResult(res);
      applyRoster(res.players, res.epoch, res.serverTs);
      toast(`已为 ${res.assigned} 人分配身份` + (res.skipped ? `，${res.skipped} 人保持原样` : ''), 'ok');
    } catch (err) {
      toast(err.message || '分配失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /** 把勾选的人编成一队 */
  async function assignPicked(identity) {
    if (picked.length === 0) return toast('先勾选选手', 'warn');
    setBusy('team');
    try {
      const res = await api('/api/admin/team', {
        method: 'POST', body: { playerIds: picked, identity }, token,
      });
      applyRoster(res.players, res.epoch, res.serverTs);
      const names = res.members.map((m) => m.name).join('、');
      const extra = res.rebalanced > 0 ? `，原队伍剩下的人已自动降级` : '';
      toast(`${names} → ${res.identity.toUpperCase()}${res.teamId ? ` · ${res.teamId}` : ''}${extra}`, 'ok');
      setPicked([]);
    } catch (err) {
      toast(err.message || '分配失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function unassignPicked() {
    if (picked.length === 0) return toast('先勾选选手', 'warn');
    if (!(await ask({ title: `把 ${picked.length} 人退回未分配？`, danger: true, confirmText: '退回未分配',
                      body: '他们会失去身份、队伍和颜色符号，可以重新分配。积分不受影响。' }))) return;
    setBusy('team');
    try {
      const res = await api('/api/admin/unassign', { method: 'POST', body: { playerIds: picked }, token });
      applyRoster(res.players, res.epoch, res.serverTs);
      toast(`${picked.length} 人已退回未分配`, 'ok');
      setPicked([]);
    } catch (err) {
      toast(err.message || '操作失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  /** 把勾选的人的密码统一重置成 3927 */
  async function resetPinPicked() {
    if (picked.length === 0) return toast('先勾选选手', 'warn');
    const names = picked.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);
    const ok = await ask({
      title: `重置 ${picked.length} 人的密码？`,
      confirmText: `重置为 ${resetPin}`,
      body: `${names.join('、')}\n\n密码会统一变成 ${resetPin}，原密码立即失效。` +
            '\n告诉他们用原来的编号 + 这个密码找回护照，不要重新报名。',
    });
    if (!ok) return;
    setBusy('pin');
    try {
      const res = await api('/api/admin/reset-pin', { method: 'POST', body: { playerIds: picked }, token });
      applyRoster(res.players, res.epoch, res.serverTs);
      toast(`${res.players.map((p) => p.code + ' 号').join('、')} 的密码已重置为 ${res.pin}`, 'ok', 6000);
      setPicked([]);
    } catch (err) {
      toast(err.message || '重置失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  const togglePick = (id) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  async function setAward(awardId, playerId) {
    try {
      const res = await api('/api/admin/award', { method: 'POST', body: { awardId, playerId }, token });
      setAwards(
        (res.awards || []).map((a) => ({
          awardId: a.award_id,
          player: players.find((p) => p.id === a.player_id) || null,
        }))
      );
      toast('奖项已保存', 'ok');
      setAwardSheet(null);
    } catch (err) {
      toast(err.message || '保存失败', 'err');
    }
  }

  function download(path, filename) {
    // 带鉴权头的下载没法直接用 <a href>，先取回 blob 再存
    setBusy(filename);
    fetch(path, { headers: { authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) throw new Error('下载失败'); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('已下载 ' + filename, 'ok');
      })
      .catch((err) => toast(err.message, 'err'))
      .finally(() => setBusy(null));
  }

  async function reset() {
    const confirmed = await ask({
      title: '⚠️ 重置游戏数据',
      danger: true,
      confirmText: '我确认要重置',
      requireText: 'RESET',
      body: '这会清空全部积分、盖章、盲盒和 Token 记录。\n重置前会自动备份到服务器。',
    });
    if (!confirmed) return;

    const keepPlayers = await ask({
      title: '选手名单怎么处理？',
      body: '积分记录无论如何都会清空，这一步只决定选手名单。',
      choices: [
        { value: 'keep', label: '保留选手，只清积分', primary: true },
        { value: 'wipe', label: '连选手名单一起删掉', danger: true },
      ],
    });
    if (!keepPlayers) return;
    setBusy('reset');
    try {
      await api('/api/admin/reset', {
        method: 'POST', body: { confirm: 'RESET', keepPlayers: keepPlayers === 'keep' }, token,
      });
      await flush({ full: true });
      await loadConfig();
      toast('已重置，旧数据已自动备份到服务器', 'ok');
    } catch (err) {
      toast(err.message || '重置失败', 'err');
    } finally {
      setBusy(null);
    }
  }

  const stateMeta = {
    lobby: { label: '入场 / 报名中', icon: '🚪', hint: '选手可以自助报名、改头像。身份还没抽。' },
    running: { label: '游戏进行中', icon: '🎮', hint: '报名通道已自动关闭，选手端全面只读，只剩各站记分。' },
    ended: { label: '已结束', icon: '🏁', hint: '可以颁奖了，选手可以生成分享徽章。' },
  };

  return (
    <div className="page page--wide">
      <NetBar
        online={staff.online}
        connected={staff.connected}
        syncing={staff.syncing}
        pending={staff.outbox.length}
        lastSyncedAt={staff.lastSyncedAt}
      />

      <div className="row-between" style={{ marginBottom: 14 }}>
        <div>
          <div className="eyebrow">Control Room</div>
          <h1>总控台</h1>
        </div>
        <button className="btn btn--sm btn--ghost" onClick={() => { logout(); nav('/staff'); }}>退出</button>
      </div>

      <div className="cols-2">
      {/* 概览 */}
      <div className="card row-between" style={{ marginBottom: 12 }}>
        {[
          { label: '已报名', value: players.length },
          { label: '已抽身份', value: players.filter((p) => p.identity).length },
          { label: '总记分', value: players.reduce((s, p) => s + p.stationsDone, 0) },
          { label: '待同步', value: staff.outbox.length },
        ].map((s) => (
          <div key={s.label} className="center grow">
            <div className="bold mono" style={{ fontSize: 21, color: 'var(--gold)' }}>{s.value}</div>
            <div className="tiny dim">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 游戏状态 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🎮 游戏状态</div>
        <div className="row" style={{ gap: 8 }}>
          {Object.entries(stateMeta).map(([k, m]) => (
            <button
              key={k}
              className={`btn btn--sm grow ${settings.gameState === k ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => patchSettings({ gameState: k }, 'state')}
              disabled={busy === 'state'}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <div className="tiny dim">{stateMeta[settings.gameState]?.hint}</div>
      </div>

      {/* 各关忙闲 */}
      {load.length > 0 && settings.gameState === 'running' && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="section-title">📍 各关排队情况</div>
          <div className="tiny dim">
            「在等」是下一站指向这一关的人数。开赛时后台已按各关耗时排过班，
            这里用来盯有没有意外堵住 —— 某一关持续高于其他关，
            多半是那边流程比预计的慢，可以加人手或加一套道具并行。
          </div>
          {capacity && (
            <div className="tiny" style={{
              padding: '8px 10px', border: '1px solid rgba(255,255,255,.12)',
              borderRadius: 4, lineHeight: 1.8,
            }}>
              <b>容量体检</b>：场上 {capacity.groups} 组，按各关耗时估算，
              剩余 {capacity.minutes} 分钟内合计能接待约 <b>{capacity.total}</b> 组次
              —— 平均每组跑得完 <b>{capacity.avg}</b> 关
              {capacity.enough ? '（八关都跑得完）' : '，八关跑不完'}。
              {' '}
              <button
                className="btn btn--sm btn--ghost"
                style={{ padding: '0 6px', height: 20, fontSize: 11, verticalAlign: 'middle' }}
                onClick={() => setMinutesLeft((m) => (m <= 10 ? 45 : m - 5))}
                title="按一下减 5 分钟，到 10 分钟后回到 45"
              >
                改时间
              </button>
              {capacity.tight.length > 0 && (
                <>
                  <br />
                  <span style={{ color: 'var(--red)' }}>
                    瓶颈：{capacity.tight.map((t) => `${t.name}（只接待得下 ${t.cap} 组）`).join('、')}
                  </span>
                </>
              )}
            </div>
          )}
          <div className="stack-sm">
            {[...load].sort((a, b) => b.waiting - a.waiting).map((st) => {
              const max = Math.max(1, ...load.map((x) => x.waiting));
              const hot = st.waiting >= 4 && st.waiting === max;
              return (
                <div key={st.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 'none', width: 92 }} className="small">
                    {st.icon} {st.name}
                  </div>
                  <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,.07)', borderRadius: 999 }}>
                    <div style={{
                      width: `${Math.round((st.waiting / max) * 100)}%`, height: '100%', borderRadius: 999,
                      background: hot ? 'var(--red)' : 'var(--gold)', transition: 'width .3s ease',
                    }} />
                  </div>
                  <div className="tiny" style={{ flex: 'none', width: 86, textAlign: 'right', color: hot ? 'var(--red)' : undefined }}>
                    在等 {st.waiting} · 完成 {st.done}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 活动清单 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🗓 活动清单</div>
        <div className="tiny dim">
          护照里一场活动一页签证，参加了就盖章。这里改完立刻生效，
          同工端和所有人的护照都会跟着变，不用重启。
        </div>

        <div className="stack-sm">
          {(acts || []).map((a, i) => (
            <div key={a.id} className="card card--tight stack-sm">
              <div className="row" style={{ gap: 6 }}>
                <input
                  className="input" style={{ flex: '0 0 46px', textAlign: 'center' }}
                  value={a.icon} maxLength={4} aria-label="图标"
                  onChange={(e) => editAct(i, { icon: e.target.value })}
                />
                <input
                  className="input grow" value={a.name} maxLength={20} placeholder="活动名"
                  onChange={(e) => editAct(i, { name: e.target.value })}
                />
                <button className="btn btn--sm btn--ghost" disabled={i === 0}
                  onClick={() => moveAct(i, -1)} title="上移">↑</button>
                <button className="btn btn--sm btn--ghost" disabled={i === (acts || []).length - 1}
                  onClick={() => moveAct(i, 1)} title="下移">↓</button>
                <button className="btn btn--sm btn--ghost" onClick={() => removeAct(i)} title="删除">✕</button>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <input className="input grow" value={a.date} maxLength={20} placeholder="日期（留空显示「待定」）"
                  onChange={(e) => editAct(i, { date: e.target.value })} />
                <input className="input grow" value={a.tag} maxLength={12} placeholder="类型"
                  onChange={(e) => editAct(i, { tag: e.target.value })} />
              </div>
              <div className="row" style={{ gap: 6 }}>
                <input className="input grow" value={a.en} maxLength={40} placeholder="英文名（选填）"
                  onChange={(e) => editAct(i, { en: e.target.value })} />
                <input className="input grow" value={a.host} maxLength={20} placeholder="负责人"
                  onChange={(e) => editAct(i, { host: e.target.value })} />
              </div>
              <input className="input" value={a.desc} maxLength={200} placeholder="这场活动是什么（显示在签证页上）"
                onChange={(e) => editAct(i, { desc: e.target.value })} />

              {/* 配图：贴在签证页右栏最上面。上传完还要点保存才算数 */}
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <div style={{
                  flex: '0 0 68px', height: 44, border: '1px solid var(--line)',
                  borderRadius: 3, overflow: 'hidden', background: 'var(--ink-3)',
                  backgroundImage: a.photo ? `url("${a.photo}")` : 'none',
                  backgroundSize: 'cover', backgroundPosition: 'center',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {!a.photo && <span className="tiny dim">无图</span>}
                </div>
                <label className="btn btn--sm btn--ghost" style={{ cursor: 'pointer' }}>
                  {busy === `photo-${i}` ? '上传中…' : a.photo ? '换一张' : '＋ 配图'}
                  <input
                    type="file" accept="image/*" hidden
                    disabled={busy === `photo-${i}`}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // 清空 value：同一张图选第二次也要能触发 change
                      e.target.value = '';
                      pickPhoto(i, f);
                    }}
                  />
                </label>
                {a.photo && (
                  <button className="btn btn--sm btn--ghost" onClick={() => editAct(i, { photo: '' })}>
                    去掉
                  </button>
                )}
                <div className="tiny dim grow">签证页右上角那张图，横构图最好看</div>
              </div>

              {/* 页面链接：签证页底下那一排可点的小图标 */}
              <details className="stack-sm">
                <summary className="tiny dim" style={{ cursor: 'pointer' }}>
                  🔗 页面链接（{(a.links || []).length}）
                  —— 相册、报名表、场地地图，点一下直接打开
                </summary>
                <div className="stack-sm" style={{ marginTop: 6 }}>
                  {(a.links || []).map((l, k) => (
                    <div key={k} className="row" style={{ gap: 6 }}>
                      <input className="input" style={{ flex: '0 0 46px', textAlign: 'center' }}
                        value={l.icon} maxLength={4} aria-label="图标"
                        onChange={(e) => linkOps(i).edit(k, { icon: e.target.value })} />
                      <input className="input" style={{ flex: '0 0 92px' }}
                        value={l.label} maxLength={12} placeholder="名字"
                        onChange={(e) => linkOps(i).edit(k, { label: e.target.value })} />
                      <input className="input grow" value={l.url} maxLength={300}
                        placeholder="https://…" inputMode="url"
                        onChange={(e) => linkOps(i).edit(k, { url: e.target.value })} />
                      <button className="btn btn--sm btn--ghost"
                        onClick={() => linkOps(i).remove(k)} title="删掉">✕</button>
                    </div>
                  ))}
                  {(a.links || []).length < 6 && (
                    <button className="btn btn--sm btn--ghost" onClick={() => linkOps(i).add()}>
                      + 加一个链接
                    </button>
                  )}
                  <div className="tiny dim">
                    地址要以 http:// 或 https:// 开头。只填名字不填地址的那一条会被丢掉。
                  </div>
                </div>
              </details>

              {/* 这一页的版式：跟随模版，或者自己一套 */}
              <details className="stack-sm">
                <summary className="tiny dim" style={{ cursor: 'pointer' }}>
                  🎫 这一页的版式 —— {a.page ? <b style={{ color: 'var(--gold)' }}>自己一套</b> : '跟随模版'}
                </summary>
                <div className="stack-sm" style={{ marginTop: 6 }}>
                  {!a.page ? (
                    <>
                      <div className="tiny dim">
                        这一页现在长得和「🎫 签证页模版」一样，改模版它就跟着变。
                      </div>
                      <button className="btn btn--sm btn--ghost" onClick={() => detachPage(i)}>
                        改成自己一套
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="tiny dim">
                        这一页已经脱离模版了 —— 之后改模版<b>不会</b>再动到它。
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <input className="input grow" value={a.page.banner ?? ''} maxLength={16}
                          placeholder="横幅上那个词"
                          onChange={(e) => editPage(i, { banner: e.target.value })} />
                        <input className="input grow" value={a.page.stationLabel ?? ''} maxLength={30}
                          placeholder="右栏标题"
                          onChange={(e) => editPage(i, { stationLabel: e.target.value })} />
                      </div>
                      <input className="input" value={a.page.annotationLabel ?? ''} maxLength={30}
                        placeholder="备注标题"
                        onChange={(e) => editPage(i, { annotationLabel: e.target.value })} />
                      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
                        {[['showPhoto', '显示配图'], ['showAnnotation', '显示备注'], ['showLinks', '显示链接']]
                          .map(([k, label]) => (
                            <label key={k} className="tiny row" style={{ gap: 5, alignItems: 'center' }}>
                              <input type="checkbox" checked={a.page[k] !== false}
                                onChange={(e) => editPage(i, { [k]: e.target.checked })} />
                              {label}
                            </label>
                          ))}
                      </div>
                      <RowEditor
                        dense
                        rows={a.page.rows || []}
                        sources={sources}
                        ops={rowOps(a.page.rows || [], (rows) => editPage(i, { rows }))}
                      />
                      <button className="btn btn--sm btn--ghost" onClick={() => attachPage(i)}>
                        回到跟随模版（自己这套会丢掉）
                      </button>
                    </>
                  )}
                </div>
              </details>

              <div className="tiny dim">
                id <code>{a.id}</code> · 已有 {stampCount[a.id] || 0} 人盖章
                {stampCount[a.id] ? '（删掉之后这些记录会失去归属）' : ''}
              </div>
            </div>
          ))}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--sm btn--ghost grow" onClick={addAct}>+ 加一场活动</button>
          <button
            className="btn btn--sm btn--primary grow"
            disabled={busy === 'acts' || !actsDirty}
            onClick={saveActs}
          >
            {busy === 'acts' ? '保存中…' : actsDirty ? '保存' : '已保存'}
          </button>
        </div>
      </div>

      {/* 签证页模版 */}
      {tpl && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="section-title">🎫 签证页模版</div>
          <div className="tiny dim">
            现在护照上那一页就是这份模版。改它，所有<b>跟随模版</b>的活动一起变；
            某一场想长得不一样，去「活动清单」里把那一场改成「自己一套」——
            之后改模版就不会再动到它。
          </div>

          <div className="row" style={{ gap: 6 }}>
            <label className="stack-sm grow" style={{ gap: 3 }}>
              <div className="tiny dim">横幅上那个词</div>
              <input className="input" value={tpl.banner} maxLength={16}
                onChange={(e) => editTpl({ banner: e.target.value })} />
            </label>
            <label className="stack-sm grow" style={{ gap: 3 }}>
              <div className="tiny dim">右栏标题（活动名上面）</div>
              <input className="input" value={tpl.stationLabel} maxLength={30}
                onChange={(e) => editTpl({ stationLabel: e.target.value })} />
            </label>
          </div>
          <label className="stack-sm" style={{ gap: 3 }}>
            <div className="tiny dim">备注标题（活动说明上面）</div>
            <input className="input" value={tpl.annotationLabel} maxLength={30}
              onChange={(e) => editTpl({ annotationLabel: e.target.value })} />
          </label>

          <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
            {[
              ['showPhoto', '显示配图'],
              ['showAnnotation', '显示备注'],
              ['showLinks', '显示页面链接'],
            ].map(([k, label]) => (
              <label key={k} className="tiny row" style={{ gap: 5, alignItems: 'center' }}>
                <input type="checkbox" checked={tpl[k] !== false}
                  onChange={(e) => editTpl({ [k]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>

          <div className="tiny dim" style={{ marginTop: 4 }}>
            左边那片栏目。「固定文字」是同工填的死字，其余都按人算 ——
            姓名、编号、出席与否每个人不一样，填不出来。
          </div>
          <RowEditor
            rows={tpl.rows || []}
            sources={sources}
            ops={rowOps(tpl.rows || [], (rows) => editTpl({ rows }))}
          />

          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--sm btn--ghost grow" disabled={!tplDirty}
              onClick={() => { setTpl(JSON.parse(JSON.stringify(config.visaTemplate))); setTplDirty(false); }}>
              还原
            </button>
            <button className="btn btn--sm btn--primary grow"
              disabled={busy === 'tpl' || !tplDirty} onClick={saveTpl}>
              {busy === 'tpl' ? '保存中…' : tplDirty ? '保存模版' : '已保存'}
            </button>
          </div>
        </div>
      )}

      {/* 护照模版 */}
      {theme && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="section-title">🎨 护照模版</div>
          <div className="tiny dim">
            改的是所有人手机上那本护照的样子。保存之后立刻生效，不用重启，
            也不用让人重新打开页面。
          </div>

          {/* 预览：跟真页面用同一套算法算颜色，所见即所得 */}
          <div
            style={{
              ...themeVarsOf(theme),
              display: 'flex', gap: 8, padding: 10, borderRadius: 6,
              background: '#141110', border: '1px solid var(--line)',
            }}
          >
            {/* 封面 */}
            <div style={{
              flex: '0 0 92px', height: 132, background: coverBgOf(theme),
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 6, position: 'relative',
            }}>
              <div style={{ position: 'absolute', inset: 6, border: '1px solid rgba(var(--pp-gold-2-rgb),.45)' }} />
              <div style={{ fontSize: 7, letterSpacing: '.3em', color: 'var(--pp-gold-2)' }}>
                {theme.coverIssuer}
              </div>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                border: '1px solid rgba(var(--pp-gold-2-rgb),.6)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: 'var(--pp-gold)', fontFamily: "'EB Garamond',serif",
              }}>M</div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.14em', color: 'var(--pp-gold)' }}>
                {theme.coverTitle}
              </div>
              <div style={{ fontSize: 7, letterSpacing: '.24em', color: 'rgba(var(--pp-gold-rgb),.78)' }}>
                {theme.coverEn}
              </div>
            </div>

            {/* 签证页 */}
            <div style={{
              flex: 1, minWidth: 0, height: 132, background: theme.paper,
              display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 7px',
                borderBottom: '1px solid rgba(var(--pp-ink-rgb),.4)',
              }}>
                <div style={{
                  width: 14, height: 14, border: '1px solid rgba(var(--pp-ink-rgb),.35)',
                  color: 'var(--pp-ink)', fontSize: 8, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>T</div>
                <div style={{ flex: 1, fontSize: 7, letterSpacing: '.16em', color: 'var(--pp-ink)' }}>
                  🎓 迎新之夜
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pp-ink)' }}>06</div>
              </div>
              <div style={{ padding: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', height: 16, background: '#ece5d6', border: '1px solid rgba(var(--pp-ink-rgb),.35)' }}>
                  <div style={{
                    flex: '0 0 38%', display: 'flex', alignItems: 'center', paddingLeft: 5,
                    fontSize: 8, letterSpacing: '.2em', color: 'var(--pp-ink)',
                  }}>VISA</div>
                  <div style={{
                    flex: 1, background: 'var(--pp-ink)', display: 'flex', alignItems: 'center',
                    justifyContent: 'flex-end', paddingRight: 5,
                    fontSize: 6, letterSpacing: '.16em', color: 'var(--pp-gold)',
                  }}>{theme.visaBrand}</div>
                </div>
                <div style={{ fontSize: 6, letterSpacing: '.12em', color: 'rgba(var(--pp-text-rgb),.55)' }}>
                  ANNOTATION 备注
                </div>
                <div style={{ fontSize: 8, lineHeight: 1.6, color: 'var(--pp-text)' }}>
                  新学年的第一场。分数会归零，但今晚认识的人还在。
                </div>
              </div>
              {/* 水印：用护照里真实那张图，浓度就是滑块的值 */}
              <div style={{
                position: 'absolute', right: '4%', top: '18%', width: '38%', bottom: '10%',
                backgroundImage: 'url("/wm/city-chambers.png")', backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
                opacity: theme.watermark, pointerEvents: 'none',
              }} />
              <div style={{
                position: 'absolute', right: 8, bottom: 6, width: 40, height: 40,
                borderRadius: '50%', border: `2px solid ${theme.stamp}`, color: theme.stamp,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', opacity: 0.9, transform: 'rotate(-12deg)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>✓</div>
                <div style={{ fontSize: 5.5, fontWeight: 700, marginTop: 1 }}>已参加</div>
              </div>
            </div>
          </div>

          {/* 预设 */}
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {presets.map((pre) => (
              <button
                key={pre.key}
                className={`btn btn--sm ${theme.preset === pre.key ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => applyPreset(pre)}
              >
                <span style={{
                  display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
                  background: pre.ink, border: `1px solid ${pre.gold}`, marginRight: 5,
                  verticalAlign: 'middle',
                }} />
                {pre.name}
              </button>
            ))}
          </div>

          {/* 四个色 */}
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {[
              ['ink', '主色', '抬头、边框、签证横幅'],
              ['gold', '烫金', '封面的字和线'],
              ['paper', '纸色', '内页的底'],
              ['text', '正文', '正文黑'],
              ['stamp', '盖章', '「已参加」那个章'],
            ].map(([key, label, hint]) => (
              <label key={key} className="stack-sm" style={{ gap: 3 }} title={hint}>
                <div className="tiny dim">{label}</div>
                <div className="row" style={{ gap: 5, alignItems: 'center' }}>
                  <input
                    type="color" value={theme[key] || '#000000'}
                    onChange={(e) => editTheme({ [key]: e.target.value, preset: 'custom' })}
                    style={{
                      width: 34, height: 28, padding: 0, border: '1px solid var(--line)',
                      background: 'none', cursor: 'pointer',
                    }}
                  />
                  <code className="tiny dim">{theme[key]}</code>
                </div>
              </label>
            ))}
          </div>

          {/* 水印浓度 */}
          <label className="stack-sm" style={{ gap: 4 }}>
            <div className="tiny dim">
              水印浓度 <b>{Number(theme.watermark).toFixed(2)}</b>
              —— 每页底下那张地标图。调太浓会压住正文，所以上限卡在 0.30
            </div>
            <input
              type="range" min="0" max="0.3" step="0.01"
              value={theme.watermark}
              onChange={(e) => editTheme({ watermark: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          </label>

          {/* 印在护照上的字 */}
          <div className="stack-sm">
            <div className="tiny dim">
              印在护照上的字。别的团契要用这本册子，改的就是这几行 ——
              代码里没有写死任何一处。
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" value={theme.coverTitle} maxLength={12}
                placeholder="封面大字" aria-label="封面大字"
                onChange={(e) => editTheme({ coverTitle: e.target.value })} />
              <input className="input grow" value={theme.coverEn} maxLength={20}
                placeholder="封面英文" aria-label="封面英文"
                onChange={(e) => editTheme({ coverEn: e.target.value })} />
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" value={theme.coverIssuer} maxLength={20}
                placeholder="签发机构" aria-label="签发机构"
                onChange={(e) => editTheme({ coverIssuer: e.target.value })} />
              <input className="input grow" value={theme.coverSub} maxLength={24}
                placeholder="封面副题" aria-label="封面副题"
                onChange={(e) => editTheme({ coverSub: e.target.value })} />
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input grow" value={theme.visaBrand} maxLength={24}
                placeholder="签证横幅英文" aria-label="签证横幅英文"
                onChange={(e) => editTheme({ visaBrand: e.target.value })} />
              <input className="input grow" value={theme.visaBrandCn} maxLength={16}
                placeholder="签证横幅中文" aria-label="签证横幅中文"
                onChange={(e) => editTheme({ visaBrandCn: e.target.value })} />
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn--sm btn--ghost grow"
              disabled={!themeDirty}
              onClick={() => { setTheme({ ...config.theme }); setThemeDirty(false); }}
            >
              还原
            </button>
            <button
              className="btn btn--sm btn--primary grow"
              disabled={busy === 'theme' || !themeDirty}
              onClick={saveTheme}
            >
              {busy === 'theme' ? '保存中…' : themeDirty ? '保存模版' : '已保存'}
            </button>
          </div>
        </div>
      )}

      {/* 每组的关卡顺序 */}
      {routes.length > 0 && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="section-title">🗺 每组的关卡顺序</div>
          <div className="tiny dim">
            同队共用一条路线。划掉的是已经盖过章的，<b style={{ color: 'var(--gold)' }}>高亮</b>的是下一站
            —— 有人来问「我该去哪」，或者想知道谁卡住了，看这里。
          </div>
          <div className="stack-sm" style={{ maxHeight: '46vh', overflowY: 'auto' }}>
            {routes.map((g) => {
              const nextIdx = g.steps.findIndex((x) => !x.done);
              return (
                <div key={g.key} style={{
                  padding: '7px 9px', border: '1px solid rgba(255,255,255,.09)', borderRadius: 4,
                }}>
                  <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                    <span className="small bold">{g.label}</span>
                    <span className="tiny dim">{g.codes} 号</span>
                    {g.identity && (
                      <span className="tiny" style={{ color: g.hex || 'var(--dim)' }}>
                        {g.symbol} {String(g.identity).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {g.steps.map((st, i) => (
                      <span
                        key={st.id}
                        className="tiny"
                        style={{
                          padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap',
                          background: i === nextIdx ? 'rgba(230,205,145,.18)' : 'transparent',
                          border: i === nextIdx ? '1px solid var(--gold)' : '1px solid transparent',
                          color: st.done ? 'rgba(255,255,255,.28)' : i === nextIdx ? 'var(--gold)' : undefined,
                          textDecoration: st.done ? 'line-through' : 'none',
                        }}
                      >
                        {i + 1}.{st.icon}{st.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 身份分配 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">🪪 身份分配 / 组队</div>
        <div className="small muted" style={{ lineHeight: 1.65 }}>
          把选手打散成 Solo / Duo / Trio，同色同符号的人需要在场内互相寻找。
          系统同时给每组分配不同的首站，避免开局全挤在一个关卡。
        </div>

        {/* 花名册是空的时候，要说清楚是「还没人报名」还是「本机数据没同步下来」，
            不能只把按钮禁用掉 —— 那看起来就像功能坏了 */}
        {players.length === 0 ? (
          <div className="card card--flat card--tight stack-sm">
            <div className="small bold" style={{ color: 'var(--yellow)' }}>
              本机花名册是空的
            </div>
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              可能是还没有人报名，也可能是这台设备的数据没同步下来（比如后台刚重置过）。
              先点下面刷新确认一下。
            </div>
            <button
              className="btn btn--sm btn--full"
              onClick={async () => { await flush({ full: true }); toast('已重新拉取花名册', 'ok'); }}
              disabled={staff.syncing}
            >
              {staff.syncing ? '同步中…' : '↻ 重新拉取花名册'}
            </button>
          </div>
        ) : (
          <>
            <div className="row-between card card--flat card--tight">
              <div>
                <div className="small bold">未分配 {unassigned.length} 人</div>
                <div className="tiny dim">已分配 {players.length - unassigned.length} 人</div>
              </div>
              <button
                className="btn btn--primary"
                onClick={() => draw('fill')}
                disabled={busy === 'draw' || unassigned.length === 0}
              >
                {busy === 'draw' ? '分配中…'
                  : unassigned.length === 0 ? '全部已分配'
                  : `一键分配这 ${unassigned.length} 人`}
              </button>
            </div>
            <div className="tiny dim">
              陆续有人报名时点这个：只给还没身份的人分配，<span className="bold">已经找到队友的人不受影响</span>。
              {unassigned.length === 0 && ' 现在每个人都有身份了，新人报名后这里会重新亮起来。'}
            </div>
          </>
        )}

        <div className="divider" />

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn--ghost grow" onClick={() => setManualOpen(true)}>
            ✋ 手动勾选分配
          </button>
          <button
            className="btn btn--danger grow"
            onClick={() => draw('all')}
            disabled={busy === 'draw' || players.length === 0}
          >
            🔄 全部重新洗牌
          </button>
        </div>

        {drawResult && (
          <div className="card card--flat card--tight">
            <div className="small bold">
              本次：Solo {drawResult.counts.solo} · Duo {drawResult.counts.duo} 组 · Trio {drawResult.counts.trio} 组
            </div>
            <div className="tiny dim" style={{ marginTop: 4 }}>
              共 {drawResult.groups.length} 组
              {drawResult.skipped ? `，另有 ${drawResult.skipped} 人保持原有身份` : ''}
              。选手端会自动弹出身份卡。
            </div>
          </div>
        )}
      </div>

      {/* 疑似重复报名 */}
      {duplicates.length > 0 && (
        <div className="card stack" style={{ marginBottom: 12, borderColor: 'rgba(247,201,72,.45)' }}>
          <div className="section-title">⚠️ 疑似重复报名</div>
          <div className="small muted" style={{ lineHeight: 1.65 }}>
            下面这些名字出现了不止一次，多半是有人忘了密码又报了一遍。
            核对之后：把要保留的那个号的密码重置成 {resetPin} 交还给本人，多余的空号可以不管（不影响排行榜，只是多几个 0 分）。
          </div>
          {duplicates.map((d) => (
            <div key={d.name} className="card card--flat card--tight">
              <div className="small bold" style={{ marginBottom: 6 }}>{d.name} · {d.list.length} 个号</div>
              <div className="stack-sm">
                {d.list.map((p) => (
                  <button
                    key={p.id}
                    className="lb-row"
                    onClick={() => nav(`/staff/p/${p.id}`)}
                    style={{ width: '100%', textAlign: 'left' }}
                  >
                    <Avatar config={p.avatar} size={30} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="tiny mono">{p.code} 号 · 密码 {p.pin || '—'}</div>
                      <div className="tiny dim">
                        {p.stationsDone}/{p.stationsTotal} 关 · {p.total} 分
                        {p.total === 0 && p.stationsDone === 0 ? ' · 空号' : ''}
                      </div>
                    </div>
                    <span className="dim">›</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 参数 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">⚙️ 游戏参数</div>

        <Toggle
          label="开放报名"
          hint="关闭后新人无法自助报名"
          value={settings.registrationOpen}
          onChange={(v) => patchSettings({ registrationOpen: v }, 'reg')}
        />
        <Toggle
          label="公开排行榜"
          hint="关闭后选手端看不到排名"
          value={settings.leaderboardPublic}
          onChange={(v) => patchSettings({ leaderboardPublic: v }, 'lb')}
        />

        <NumberList
          label="人生盲盒红线"
          hint="总分跨过这些分数时必须去抽盲盒"
          value={settings.lifeEventThresholds || []}
          onChange={(v) => patchSettings({ lifeEventThresholds: v }, 'th')}
        />
        <NumberList
          label="记分档位"
          hint="各站的 勉强 / 正常 / 出色 对应分值"
          value={settings.scoreTiers || []}
          onChange={(v) => patchSettings({ scoreTiers: v }, 'tiers')}
        />
      </div>

      {/* 奖项 */}
      {settings.gameState === 'ended' && (
        <div className="card stack" style={{ marginBottom: 12 }}>
          <div className="section-title">🏆 颁奖</div>
          {awardDefs.map((a) => {
            const won = awards.find((w) => w.awardId === a.id);
            return (
              <button
                key={a.id}
                className="card card--tight row"
                onClick={() => setAwardSheet(a)}
                style={{ textAlign: 'left', width: '100%', gap: 10 }}
              >
                <span style={{ fontSize: 22 }}>{a.icon}</span>
                <div className="grow">
                  <div className="small bold">{a.name}</div>
                  <div className="tiny dim">{won?.player ? `🎉 ${won.player.name}` : a.desc}</div>
                </div>
                <span className="dim">›</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 数据 */}
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="section-title">💾 数据</div>
        <button className="btn btn--full" onClick={() => download('/api/admin/export.csv', 'mini-life-game.csv')} disabled={!!busy}>
          📊 导出成绩 CSV（Excel 可直接打开）
        </button>
        <button className="btn btn--full" onClick={() => download('/api/admin/backup.json', 'mlg-backup.json')} disabled={!!busy}>
          🗄 下载完整备份 JSON
        </button>
        <div className="tiny dim">服务器每 60 秒也会自动做一次本地快照备份。</div>
        <button className="btn btn--danger btn--full" onClick={reset} disabled={!!busy} style={{ marginTop: 6 }}>
          ⚠️ 重置游戏数据
        </button>
      </div>

      {/* 花名册 */}
      <div className="card stack">
        <div className="row-between">
          <div className="section-title" style={{ margin: 0 }}>👥 全部选手</div>
          <button className="btn btn--sm btn--ghost" onClick={() => flush({ full: true })}>↻</button>
        </div>
        <div className="stack-sm">
          {board.map((p) => (
            <button key={p.id} className="lb-row" onClick={() => nav(`/staff/p/${p.id}`)} style={{ width: '100%', textAlign: 'left' }}>
              <div className="lb-rank">{p.rank}</div>
              <Avatar config={p.avatar} size={34} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="small bold">{p.name}</div>
                <div className="tiny dim mono">
                  {p.code} 号 · {p.stationsDone}/{p.stationsTotal ?? stations.length}
                  {p.identity && ` · ${p.identity}`}
                  {p.teamSymbol && ` ${p.teamSymbol}`}
                </div>
              </div>
              <div className="lb-score">{p.total}</div>
            </button>
          ))}
          {board.length === 0 && <div className="center small dim" style={{ padding: 20 }}>还没有人报名</div>}
        </div>
      </div>

      </div>

      <ManualAssignSheet
        open={manualOpen}
        onClose={() => { setManualOpen(false); setPicked([]); }}
        players={players}
        picked={picked}
        togglePick={togglePick}
        onAssign={assignPicked}
        onUnassign={unassignPicked}
        onResetPin={resetPinPicked}
        busy={busy === 'team' || busy === 'pin'}
        colors={config?.groupColors || []}
        resetPin={resetPin}
      />

      <Sheet open={!!awardSheet} onClose={() => setAwardSheet(null)} title={awardSheet ? `${awardSheet.icon} ${awardSheet.name}` : ''}>
        <div className="stack-sm">
          <div className="small muted">{awardSheet?.desc}</div>
          <button className="btn btn--ghost btn--full" onClick={() => setAward(awardSheet.id, null)}>清除该奖项</button>
          {board.map((p) => (
            <button key={p.id} className="lb-row" onClick={() => setAward(awardSheet.id, p.id)} style={{ width: '100%' }}>
              <Avatar config={p.avatar} size={32} />
              <div className="grow small bold" style={{ textAlign: 'left' }}>{p.name}</div>
              <div className="lb-score">{p.total}</div>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/** 手动勾选分配：勾几个人，按身份成组。人数会自动推荐对应身份。 */
function ManualAssignSheet({ open, onClose, players, picked, togglePick, onAssign, onUnassign, onResetPin, busy, colors, resetPin }) {
  const [q, setQ] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const unassignedCount = useMemo(() => players.filter((p) => !p.identity).length, [players]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return players
      .filter((p) => (onlyUnassigned ? !p.identity : true))
      .filter((p) => !kw || p.name.toLowerCase().includes(kw) || p.code.includes(kw))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [players, q, onlyUnassigned]);

  // 身份和人数必须严格对应：Duo 就是 2 人、Trio 就是 3 人。
  // 人数不对时按钮直接禁用，并在下面写清楚还差几个。
  const NEED = { solo: 1, duo: 2, trio: 3 };
  const suggested = Object.keys(NEED).find((k) => NEED[k] === picked.length) || null;

  return (
    <Sheet open={open} onClose={onClose} title="✋ 手动勾选分配">
      <div className="stack">
        <div className="small muted">
          勾选要编在一起的人，再选身份。同一队会拿到相同的颜色 + 符号，需要在场内互相寻找。
        </div>

        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜名字或编号…" />
          {/* 按钮写的是「点了会怎样」，不是「现在是什么」。
              原来反过来写，读着像「点它就只看未分配」，一点却变成了看全部。
              带上人数，当前在看哪一批一眼就知道。 */}
          <button
            className="btn btn--sm btn--ghost"
            onClick={() => setOnlyUnassigned((v) => !v)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {onlyUnassigned ? `看全部 ${players.length} 人` : `只看未分配 ${unassignedCount} 人`}
          </button>
        </div>

        <div className="stack-sm" style={{ maxHeight: '38vh', overflowY: 'auto' }}>
          {list.length === 0 && (
            <div className="center small dim" style={{ padding: 18 }}>
              {players.length === 0
                ? '本机花名册是空的，先回上一层点「重新拉取花名册」'
                : onlyUnassigned ? '所有人都已经分配过了，点右上角「看全部」可以重新编队' : '没有符合的人'}
            </div>
          )}
          {list.map((p) => {
            const on = picked.includes(p.id);
            const color = colors.find((c) => c.key === p.teamColor);
            return (
              <button
                key={p.id}
                className="lb-row"
                onClick={() => togglePick(p.id)}
                style={{ width: '100%', textAlign: 'left', borderColor: on ? 'var(--gold)' : undefined,
                         background: on ? 'rgba(232,197,106,.12)' : undefined }}
              >
                <span style={{ width: 20, fontSize: 15 }}>{on ? '☑️' : '⬜️'}</span>
                <Avatar config={p.avatar} size={30} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold">{p.name}</div>
                  <div className="tiny dim mono">
                    {p.code} 号
                    {p.identity
                      ? ` · ${p.identity.toUpperCase()}${p.teamSymbol && color ? ` ${color.name}${p.teamSymbol}` : ''}`
                      : ' · 未分配'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="card card--flat card--tight center">
          <div className="small">
            已勾选 <span className="gold bold">{picked.length}</span> 人
            {suggested
              ? <span className="muted"> · 可编成 {suggested.toUpperCase()}</span>
              : picked.length > 3
                ? <span style={{ color: 'var(--yellow)' }}> · 一队最多 3 人</span>
                : null}
          </div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          {[['solo', 'SOLO', '独行'], ['duo', 'DUO', '双人'], ['trio', 'TRIO', '三人']].map(([k, en, cn]) => {
            const need = NEED[k];
            const ok = picked.length === need;
            const diff = need - picked.length;
            return (
              <button
                key={k}
                className={`btn btn--sm grow ${ok ? 'btn--primary' : 'btn--ghost'}`}
                disabled={busy || !ok}
                onClick={() => onAssign(k)}
                title={ok ? '' : `${en} 需要 ${need} 人`}
                style={{ flexDirection: 'column', gap: 1, minHeight: 46, padding: '4px 6px' }}
              >
                <span style={{ fontSize: 12.5 }}>{en} {cn}</span>
                <span className="tiny" style={{ opacity: ok ? 0.6 : 0.75, fontWeight: 400 }}>
                  {ok ? `${need} 人` : diff > 0 ? `还差 ${diff} 人` : `多了 ${-diff} 人`}
                </span>
              </button>
            );
          })}
        </div>

        {/* 只在请求进行中禁用。原来没勾人时也 disabled，点了完全没反馈 ——
            处理函数里那句「先勾选选手」的提示永远走不到。
            人数写进按钮，为什么点不动一目了然。 */}
        <button className="btn btn--ghost btn--full" disabled={!!busy} onClick={onResetPin}>
          🔑 重置密码为 {resetPin}{picked.length > 0 ? `（${picked.length} 人）` : ''}
        </button>
        <div className="tiny dim" style={{ marginTop: -4 }}>
          有人忘了密码就用这个，让他用原编号找回，别重新报名 —— 重新报名会多出一个空号，分数也对不上。
        </div>
        <button className="btn btn--ghost btn--full" disabled={!!busy} onClick={onUnassign}>
          退回未分配{picked.length > 0 ? `（${picked.length} 人）` : ''}
        </button>
        {picked.length === 0 && (
          <div className="tiny dim" style={{ marginTop: -4 }}>
            上面这两个都要先勾人。想退回已经分好队的人，先点搜索框右边的
            「看全部」—— 默认只列出还没分配的。
          </div>
        )}
        <button className="btn btn--full" onClick={onClose}>完成</button>
      </div>
    </Sheet>
  );
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <div className="row-between">
      <div className="grow">
        <div className="small bold">{label}</div>
        <div className="tiny dim">{hint}</div>
      </div>
      <button
        className={`btn btn--sm ${value ? 'btn--primary' : 'btn--ghost'}`}
        onClick={() => onChange(!value)}
        style={{ minWidth: 62 }}
      >
        {value ? '开' : '关'}
      </button>
    </div>
  );
}

function NumberList({ label, hint, value, onChange }) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value.join(',')]); // eslint-disable-line

  function commit() {
    const parsed = text
      .split(/[,，\s]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    if (parsed.length) onChange(parsed);
  }

  return (
    <div className="field">
      <div className="small bold">{label}</div>
      <div className="tiny dim" style={{ marginBottom: 4 }}>{hint}</div>
      <div className="row" style={{ gap: 8 }}>
        <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} inputMode="numeric" />
        <button className="btn btn--sm" onClick={commit}>保存</button>
      </div>
    </div>
  );
}

/**
 * 签证页栏目表的编辑器。
 *
 * 模版和「某场活动自己那套」共用它 —— 两边的数据结构本来就是同一个。
 * 定义在模块作用域而不是 Admin 里面：写在组件里的话每次渲染都是一个
 * 新的组件类型，React 会整棵重建，打一个字就丢一次焦点。
 */
function RowEditor({ rows, ops, sources, dense = false }) {
  return (
    <div className="stack-sm">
      {rows.map((r, i) => (
        <div key={r.key || i} className="card card--tight stack-sm" style={{ padding: dense ? 8 : undefined }}>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input grow" value={r.label} maxLength={40} placeholder="栏目标题，例如 VISA TYPE 类型"
              onChange={(e) => ops.edit(i, { label: e.target.value })}
            />
            <button className="btn btn--sm btn--ghost" disabled={i === 0}
              onClick={() => ops.move(i, -1)} title="上移">↑</button>
            <button className="btn btn--sm btn--ghost" disabled={i === rows.length - 1}
              onClick={() => ops.move(i, 1)} title="下移">↓</button>
            <button className="btn btn--sm btn--ghost" onClick={() => ops.remove(i)} title="删掉这一栏">✕</button>
          </div>
          {/* 来源和「加重」排一行，内容单独一行 —— 三样挤一行在 400px 的
              手机上会把右边两样压成一条竖缝 */}
          <div className="row" style={{ gap: 6, alignItems: 'center' }}>
            <select
              className="input grow" style={{ minWidth: 0 }} value={r.src}
              onChange={(e) => ops.edit(i, { src: e.target.value })}
            >
              {sources.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
            <label
              className="tiny dim row"
              style={{ gap: 4, flex: '0 0 auto', alignItems: 'center', whiteSpace: 'nowrap' }}
              title="用主色印，比其它栏目重"
            >
              <input type="checkbox" checked={!!r.accent}
                onChange={(e) => ops.edit(i, { accent: e.target.checked })} />
              加重
            </label>
          </div>
          {r.src === 'text' ? (
            <input
              className="input" value={r.text || ''} maxLength={40} placeholder="印在这一栏的字"
              onChange={(e) => ops.edit(i, { text: e.target.value })}
            />
          ) : (
            <div className="tiny dim">
              {sources.find((s) => s.key === r.src)?.hint || '这一栏的内容按人算，不用填'}
            </div>
          )}
        </div>
      ))}
      <button className="btn btn--sm btn--ghost" onClick={ops.add}>+ 加一栏</button>
    </div>
  );
}
