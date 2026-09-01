/**
 * 把选手身上挂着的状态，翻译成同工看得懂的一句话。
 *
 * 关键区分是「谁来执行」：
 *
 *   auto  —— 系统自己会处理（比如重感冒会把这一关的分自动封到 1 分），
 *            同工照常记分就行，知道有这回事即可。
 *   check —— 必须同工当场核实（比如「下一关要带一位新朋友」）。
 *            这类不提醒就等于没有 —— 卡抽了、分照给，规则等于没生效。
 *
 * 两种在界面上要长得不一样，否则同工扫一眼分不出哪条需要他动作。
 */
const KIND = {
  must_invite_stranger: {
    kind: 'check',
    icon: '🤝',
    action: '记分前先确认：他身边这位是刚认识的吗？没带人就先别记分。',
  },
  swap_queue: {
    kind: 'check',
    icon: '🔚',
    action: '这一关他要排到队伍最后。前面还有人的话，先让别人。',
  },
  cap_next: {
    kind: 'auto',
    icon: '🤒',
    action: '照常按表现记分，系统会自动封顶，不用你手动改。',
  },
};

const FALLBACK = { kind: 'auto', icon: '🌀', action: '' };

/** 给一条状态补上分类、图标和给同工的操作说明 */
export function describeModifier(m) {
  const meta = KIND[m.modifier] || FALLBACK;
  return { ...m, ...meta };
}

/** 这批状态里有没有需要同工当场核实的 */
export function needsCheck(modifiers = []) {
  return modifiers.some((m) => (KIND[m.modifier] || FALLBACK).kind === 'check');
}
