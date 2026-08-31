"""把 Claude Design 的 .dc 模板机械转换成 JSX，保证样式 1:1 还原。
  <sc-if value="{{ x }}">      -> {x ? (<>...</>) : null}
  <sc-for list="{{ xs }}" as="c"> -> {xs.map((c, i) => (<Fragment key={i}>...</Fragment>))}
  {{ expr }}                   -> {expr}（作用域内的循环变量原样保留，其余加 v. 前缀）
  style="a:b"                  -> style={{a:'b'}}（camelCase，支持插值）
"""
import re, sys, json
from html.parser import HTMLParser

VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
ATTR_MAP = {'class':'className','for':'htmlFor','tabindex':'tabIndex','colspan':'colSpan',
            'rowspan':'rowSpan','maxlength':'maxLength','autocomplete':'autoComplete',
            'readonly':'readOnly','contenteditable':'contentEditable','srcset':'srcSet',
            'crossorigin':'crossOrigin','stroke-width':'strokeWidth','stroke-linecap':'strokeLinecap',
            'fill-rule':'fillRule','clip-rule':'clipRule','stop-color':'stopColor','xmlns:xlink':'xmlnsXlink'}

class Node:
    def __init__(self, tag=None, attrs=None):
        self.tag, self.attrs, self.kids, self.text = tag, dict(attrs or {}), [], None

class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root'); self.stack=[self.root]
    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs); self.stack[-1].kids.append(n)
        if tag not in VOID: self.stack.append(n)
    def handle_startendtag(self, tag, attrs):
        self.stack[-1].kids.append(Node(tag, attrs))
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]; return
    def handle_data(self, data):
        if data.strip():
            n = Node('#text'); n.text = data; self.stack[-1].kids.append(n)
    def handle_comment(self, data): pass

def camel(p):
    if p.startswith('--'): return p
    return re.sub(r'-([a-z])', lambda m: m.group(1).upper(), p)

def expr(e, scope):
    """把 {{ }} 里的表达式解析成 JS，作用域外的标识符加 v. 前缀"""
    e = e.strip()
    if e in ('true','false'): return e
    if re.fullmatch(r'-?\d+(\.\d+)?', e): return e
    root = re.match(r'^([A-Za-z_$][\w$]*)', e)
    if root and root.group(1) not in scope:
        return 'v.' + e
    return e

def split_css(s):
    """按分号切分，忽略括号内的分号"""
    out, buf, depth = [], '', 0
    for ch in s:
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == ';' and depth == 0:
            out.append(buf); buf = ''
        else: buf += ch
    if buf.strip(): out.append(buf)
    return out

def style_obj(css, scope):
    props = {}
    for decl in split_css(css):
        if ':' not in decl: continue
        k, _, val = decl.partition(':')
        k, val = k.strip(), val.strip()
        if not k: continue
        parts = re.split(r'(\{\{.*?\}\})', val)
        if len(parts) == 1:
            js = json.dumps(val)
        elif len(parts) == 3 and parts[0]=='' and parts[2]=='':
            js = expr(parts[1][2:-2], scope)
        else:
            chunks = []
            for p in parts:
                if p.startswith('{{'): chunks.append('${' + expr(p[2:-2], scope) + '}')
                else: chunks.append(p.replace('`','\\`').replace('$','\\$'))
            js = '`' + ''.join(chunks) + '`'
        props[camel(k)] = js          # 重复属性后者覆盖（JSX 无法表达 CSS 回退）
    return '{' + ', '.join(f'{json.dumps(k) if not k.isidentifier() else k}: {v}' for k, v in props.items()) + '}'

def attr_val(name, raw, scope):
    parts = re.split(r'(\{\{.*?\}\})', raw)
    if len(parts) == 3 and parts[0]=='' and parts[2]=='':
        return '{' + expr(parts[1][2:-2], scope) + '}'
    if len(parts) == 1:
        return json.dumps(raw)
    chunks = []
    for p in parts:
        if p.startswith('{{'): chunks.append('${' + expr(p[2:-2], scope) + '}')
        else: chunks.append(p.replace('`','\\`').replace('$','\\$'))
    return '{`' + ''.join(chunks) + '`}'

def text_node(s, scope):
    parts = re.split(r'(\{\{.*?\}\})', s)
    out = []
    for p in parts:
        if p.startswith('{{'):
            out.append('{' + expr(p[2:-2], scope) + '}')
        else:
            t = p.replace('{','{"{"}').replace('}','{"}"}')
            if t.strip(): out.append(t)
    return ''.join(out)

def emit(n, scope, ind=0):
    pad = '  ' * ind
    if n.tag == '#text':
        t = text_node(n.text, scope)
        return pad + t + '\n' if t.strip() else ''
    if n.tag == '#root':
        return ''.join(emit(k, scope, ind) for k in n.kids)

    if n.tag == 'sc-if':
        cond = expr(re.sub(r'\{\{|\}\}', '', n.attrs.get('value','')).strip(), scope)
        inner = ''.join(emit(k, scope, ind+2) for k in n.kids)
        return f'{pad}{{{cond} ? (\n{pad}  <>\n{inner}{pad}  </>\n{pad}) : null}}\n'

    if n.tag == 'sc-for':
        lst = expr(re.sub(r'\{\{|\}\}', '', n.attrs.get('list','')).strip(), scope)
        as_ = n.attrs.get('as', 'item')
        if as_ == 'v': as_ = 'vf'   # 'v' 是 props 名，避免遮蔽造成误读
        raw_as = n.attrs.get('as', 'item')
        inner = ''.join(emit(k, scope | {raw_as}, ind+2) for k in n.kids)
        if raw_as != as_:
            inner = re.sub(r'\b' + raw_as + r'\.', as_ + '.', inner)
        return (f'{pad}{{({lst} || []).map(({as_}, i) => (\n'
                f'{pad}  <React.Fragment key={{i}}>\n{inner}{pad}  </React.Fragment>\n'
                f'{pad}))}}\n')

    bits = []
    for k, val in n.attrs.items():
        if k.startswith('hint-'): continue
        if val is None: val = ''
        if k == 'style':
            bits.append(f'style={{{style_obj(val, scope)}}}')
        elif k.startswith('sc-camel-'):
            # sc-camel-on-click -> onClick, sc-camel-view-box -> viewBox
            rest = k[len('sc-camel-'):]
            parts_ = rest.split('-')
            jsx_name = parts_[0] + ''.join(w.capitalize() for w in parts_[1:])
            bits.append(f'{jsx_name}={attr_val(k, val, scope)}')
        elif k.startswith('on'):
            bits.append(f'{camel("on-"+k[2:])[0].lower()+camel("on-"+k[2:])[1:]}={attr_val(k, val, scope)}')
        else:
            bits.append(f'{ATTR_MAP.get(k, camel(k) if "-" not in k or k.startswith("data-") or k.startswith("aria-") else k)}={attr_val(k, val, scope)}')
    attrs = (' ' + ' '.join(bits)) if bits else ''

    if n.tag in VOID or not n.kids:
        return f'{pad}<{n.tag}{attrs} />\n'
    inner = ''.join(emit(k, scope, ind+1) for k in n.kids)
    return f'{pad}<{n.tag}{attrs}>\n{inner}{pad}</{n.tag}>\n'


# ------------------------------------------------------------------
# 生成后的定制补丁。写在这里而不是手改产物，设计改版重跑也不会丢。
# ------------------------------------------------------------------
def remove_block_containing(jsx, needle, open_marker=None):
    """
    删掉包含 needle 的那个 <div> 区块。

    open_marker 给了就向上找它那一行做起点；不给则取 needle 前面最近的
    <div —— 对「只包一行文字」的叶子节点足够，也不用把一长串内联样式
    抄进来。定位到起点后按 <div/</div> 计数找配对的闭合标签。
    比写死一大段字符串耐改：设计稿里这块的文案或样式改了，删除依然成立。
    """
    i = jsx.find(needle)
    if i == -1:
        return jsx, False
    start = jsx.rfind(open_marker, 0, i) if open_marker else jsx.rfind('<div', 0, i)
    if start == -1:
        return jsx, False
    line_start = jsx.rfind('\n', 0, start) + 1

    depth, pos = 0, start
    while pos < len(jsx):
        o = jsx.find('<div', pos)
        c = jsx.find('</div>', pos)
        if c == -1:
            return jsx, False
        if o != -1 and o < c:
            # 自闭合的 <div ... /> 不进栈
            tag_end = jsx.find('>', o)
            if tag_end != -1 and jsx[tag_end - 1] == '/':
                pos = tag_end + 1
                continue
            depth += 1
            pos = o + 4
        else:
            depth -= 1
            pos = c + 6
            if depth == 0:
                end = jsx.find('\n', pos)
                return jsx[:line_start] + jsx[end + 1:], True
    return jsx, False


def apply_patches(jsx):
    n = 0

    # 1) 先整块删掉设计稿里的「GHOST IMAGE 副像」。
    #    真护照上的副像是防伪用的，这里只是把同一张头像缩小淡化再放一遍，
    #    信息量为零，还占掉资料页左栏本就不多的高度。
    jsx, hit = remove_block_containing(
        jsx, 'GHOST IMAGE',
        '<div style={{display: "flex", gap: "9px", alignItems: "flex-end"}}>')
    assert hit, "没找到 GHOST IMAGE 区块"
    n += 1

    # 2) 资料页的「PHOTO 贴照片」占位换成选手头像。
    #    设计稿用两个形状拼出一个人形剪影（圆脑袋 + 半圆肩膀），一起替换掉。
    #    删完副像之后全篇只剩这一对。
    ghost = (
        '<div style={{position: "absolute", left: "50%", top: "20%", width: "42%", '
        'aspectRatio: "1", transform: "translateX(-50%)", borderRadius: "50%", '
        'background: "rgba(92,26,34,.16)"}} />\n'
    )
    body = (
        '<div style={{position: "absolute", left: "50%", bottom: "0", width: "74%", '
        'height: "34%", transform: "translateX(-50%)", borderRadius: "50% 50% 0 0", '
        'background: "rgba(92,26,34,.16)"}} />\n'
    )
    placed = False
    for indent in ('                            ', '                              '):
        pair = indent + ghost.strip() + '\n' + indent + body.strip() + '\n'
        if pair in jsx:
            jsx = jsx.replace(pair, indent + '{v.photo}\n', 1)
            placed = True
            n += 1
            break
    assert placed, "没找到证件照占位"

    # 3) 去掉证件照下方的「PHOTO 贴照片」说明。
    #    设计稿里那是给空占位框的指示语，现在框里已经是本人头像了，
    #    再写「贴照片」反而像还没弄好。
    jsx, hit = remove_block_containing(jsx, 'PHOTO 贴照片')
    assert hit, "没找到「PHOTO 贴照片」说明"
    n += 1

    # 4) 翻页用的 3D 层。
    #    包住正反两种版式的页面、但不包弹层 —— 弹层不该跟着翻。
    #    必须单独包一层：横版页（资料页、关卡页）在竖屏下自身已经
    #    rotate(90deg)，把 rotateY 加到同一个元素上会和它复合，
    #    转出来的方向是歪的。
    #    翻页时 PassportBook 会克隆这一层做静态副本（见 .book-ghost），
    #    class 名是它找这一层的依据，别改。
    open_anchor = '          {v.isPortrait ? (\n'
    assert open_anchor in jsx, "没找到竖版页起点"
    jsx = jsx.replace(
        open_anchor,
        '          <div className="book-flip" style={{position: "absolute", inset: "0", '
        'animation: v.pageAnim}}>\n' + open_anchor,
        1)

    close_anchor = '          {v.askingToken ? (\n'
    assert close_anchor in jsx, "没找到弹层起点"
    jsx = jsx.replace(close_anchor, '          </div>\n' + close_anchor, 1)
    n += 1

    # 5) 舞台加透视，翻页才有近大远小。
    #    stage 里的两个弹层都是 position:absolute，不会被 perspective
    #    变成包含块坑到（fixed 定位才会）。
    stage = 'containerType: "size"}}>'
    assert stage in jsx, "没找到舞台容器"
    jsx = jsx.replace(stage, 'containerType: "size", perspective: "1500px"}}>', 1)
    n += 1

    # 2) 结语页：分享按钮旁边补一个「查看排名」，方便直接跳排行榜
    share_btn_end = '{v.shareLabel}\n'
    idx = jsx.find(share_btn_end)
    if idx != -1:
        close = jsx.find('</button>\n', idx)
        if close != -1:
            end = close + len('</button>\n')
            indent = ' ' * (len(jsx[:close].split('\n')[-1]))
            extra = (
                indent + '<button onClick={v.goBoard} style={{marginTop: "10px", padding: "14px", '
                'background: "transparent", border: "1px solid rgba(92,26,34,.45)", color: "#5c1a22", '
                'fontFamily: "\'EB Garamond\',serif", fontSize: "12px", letterSpacing: ".24em", '
                'textIndent: ".24em"}}>\n'
                + indent + '  LEADERBOARD 查看排名\n'
                + indent + '</button>\n'
            )
            jsx = jsx[:end] + extra + jsx[end:]
            n += 1

    # 3) 签证页：只在正在查询时给一个很轻的反馈；没盖章时不留任何常驻标识，
    #    保持签证页干净。点页面中间依然会触发查询（见 bookVals 的 stampTap）。
    marker = '{v.visaStamped ? ('
    i2 = jsx.find(marker)
    if i2 != -1:
        line_start = jsx.rfind('\n', 0, i2) + 1
        indent = jsx[line_start:i2]
        hint = (
            indent + '{v.checking ? (\n'
            + indent + '  <div style={{position: "absolute", left: "50%", top: "50%", '
            'transform: "translate(-50%,-50%)", zIndex: 6, padding: "7px 14px", '
            'borderRadius: "2px", background: "rgba(92,26,34,.08)", '
            'fontFamily: "\'EB Garamond\',serif", fontSize: "9.5px", letterSpacing: ".2em", '
            'color: "rgba(92,26,34,.5)", whiteSpace: "nowrap", pointerEvents: "none"}}>\n'
            + indent + '    CHECKING 查询中…\n'
            + indent + '  </div>\n'
            + indent + ') : null}\n'
        )
        jsx = jsx[:line_start] + hint + jsx[line_start:]
        n += 1

    # 4) 页眉：在排行榜（奖杯）图标旁边加一枚队伍徽记，点开看队友。
    #    竖版页 34px、横版页 30px 两处都要加。
    for size in ('34px', '30px'):
        marker = (
            '<button onClick={v.goBoard} style={{flex: "none", width: "' + size + '", height: "' + size + '"'
        )
        i4 = jsx.find(marker)
        if i4 == -1:
            continue
        close = jsx.find('</button>\n', i4)
        if close == -1:
            continue
        end = close + len('</button>\n')
        line_start = jsx.rfind('\n', 0, i4) + 1
        indent = jsx[line_start:i4]
        # 队名字号压小一点：页眉一共要塞七样东西，徽章是最大的非弹性元素，
        # 它多占一分，中间的页名就被截一分
        fs = '11.5px' if size == '34px' else '10px'
        ss = '8px' if size == '34px' else '7px'      # 状态字号，比队名再小一号
        badge = (
            indent + '<button onClick={v.goTeam} data-tour="team" title="我的队友" '
            'style={{flex: "none", height: "' + size + '", padding: "0 5px", '
            'border: `1px solid ${v.teamBadge ? v.teamBadge.hex : "rgba(92,26,34,.35)"}`, '
            'display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", '
            'whiteSpace: "nowrap", lineHeight: 1, '
            'color: v.teamBadge ? v.teamBadge.hex : "rgba(92,26,34,.5)"}}>\n'
            + indent + '  {v.teamBadge ? (\n'
            + indent + '    <>\n'
            + indent + '      <span style={{fontSize: "' + fs + '"}}>{v.teamBadge.symbol}</span>\n'
            # 颜色名用英文：场内喊「RED」比喊「赤队」快，颜色本身已经写在边框和字色上了
            + indent + '      <span style={{fontSize: "' + fs + '", letterSpacing: ".08em", fontFamily: "\'EB Garamond\',serif"}}>{v.teamBadge.en}</span>\n'
            + indent + '    </>\n'
            + indent + '  ) : (\n'
            + indent + '    <span style={{fontSize: "' + fs + '", opacity: .7}}>🪪 待分配</span>\n'
            + indent + '  )}\n'
            + indent + '</button>\n'
            # 同步状态紧挨着队伍徽章：只有英文单词 + 颜色，
            # 绿 LIVE / 黄 RECONNECTING / 红 OFFLINE。
            # 原来是底部一条浮动药丸，占着位置又要人低头去看
            + indent + '<div title="同步状态" style={{flex: "none", display: "flex", alignItems: "center", '
            'gap: "4px", whiteSpace: "nowrap", marginLeft: "5px", color: v.syncHex}}>\n'
            + indent + '  <span style={{fontFamily: "\'EB Garamond\',serif", fontSize: "' + ss + '", fontWeight: 700, letterSpacing: ".1em"}}>\n'
            + indent + '    {v.syncLabel}\n'
            + indent + '  </span>\n'
            + indent + '</div>\n'
        )
        jsx = jsx[:end] + badge + jsx[end:]
        n += 1

    # 5) 页眉：恩典代币（G）左边补一个当前总分。
    #    翻到任何一页都要能一眼看到自己多少分 —— 原来只有资料页和结语页有，
    #    闯关途中最想看的时候反而看不到。
    for size in ('34px', '30px'):
        # 注意：data-tour 属性是后面的补丁才加上去的，这里不能拿它当锚点
        marker = '<button onClick={v.goGrace} style={{flex: "none", width: "' + size + '"'
        i = jsx.find(marker)
        if i == -1:
            continue
        line_start = jsx.rfind('\n', 0, i) + 1
        indent = jsx[line_start:i]
        fs = '15px' if size == '34px' else '13px'
        sub = '7.5px' if size == '34px' else '7px'
        score = (
            indent + '<div style={{flex: "none", display: "flex", flexDirection: "column", alignItems: "center", '
            'lineHeight: 1, color: "#5c1a22"}}>\n'
            + indent + '  <div style={{fontFamily: "\'Courier Prime\',monospace", fontSize: "' + fs + '", fontWeight: 700}}>\n'
            + indent + '    {v.totalPad}\n'
            + indent + '  </div>\n'
            + indent + '  <div style={{fontFamily: "\'EB Garamond\',serif", fontSize: "' + sub + '", letterSpacing: ".14em", opacity: .55}}>\n'
            + indent + '    PTS\n'
            + indent + '  </div>\n'
            + indent + '</div>\n'
        )
        jsx = jsx[:line_start] + score + jsx[line_start:]
        n += 1

    # 页眉现在挤了七样东西（奖杯 / 队伍 / 状态 / 页名 / 分数 / 恩典 / 帮助），
    # 375px 的手机上中间的页名会被压成「WE…」。把元素间距收窄，
    # 空间还给页名 —— 那是唯一会变的信息，被截断最亏。
    before = jsx
    jsx = jsx.replace('gap: "12px", padding: "12px 16px 8px"', 'gap: "7px", padding: "12px 12px 8px"')
    jsx = jsx.replace('gap: "12px", padding: "9px 16px 7px"', 'gap: "7px", padding: "9px 12px 7px"')
    assert jsx != before, "没找到页眉容器"
    n += 1

    # 关卡顺序公布之前，签证页整页留空，只剩水印。
    #
    # 之前只是把关卡名换成「待公布」，但抬头、控制号、姓名、类型那一整套
    # 还在，看着像「这一关的信息加载失败了」。真护照没盖章的签证页本来
    # 就是空白的，空着反而对。
    #
    # 水印和页眉都在这一块之外，不受影响；翻页也照常 —— pageTap 挂在
    # 更外层的页面容器上。
    before = jsx
    jsx = jsx.replace('{v.isVisa ? (\n', '{v.isVisa && !v.visaBlank ? (\n', 1)
    assert jsx != before, "没找到签证页区块"
    n += 1

    # 5) 封面：去掉「OPEN 翻开」按钮，改成整页可点（见 bookVals 的 pageTap）。
    #    原地留一行很淡的提示，否则没人知道要点。
    i5 = jsx.find('OPEN 翻开')
    if i5 != -1:
        btn_start = jsx.rfind('<button', 0, i5)
        btn_end = jsx.find('</button>\n', i5)
        if btn_start != -1 and btn_end != -1:
            line_start = jsx.rfind('\n', 0, btn_start) + 1
            indent = jsx[line_start:btn_start]
            hint = (
                indent + '<div style={{width: "100%", padding: "13px", textAlign: "center", '
                'fontFamily: "\'EB Garamond\',serif", fontSize: "11px", letterSpacing: ".26em", '
                'textIndent: ".26em", color: "rgba(230,205,145,.45)"}}>\n'
                + indent + '  TAP TO OPEN 轻触翻开\n'
                + indent + '</div>\n'
            )
            jsx = jsx[:line_start] + hint + jsx[btn_end + len('</button>\n'):]
            n += 1

    # 封面原本没有任何点击处理器（只靠那个 OPEN 按钮），删掉按钮后必须给
    # 封面容器补上 pageTap，否则封面点不开。
    cover = jsx.find('{v.isCover ? (')
    if cover != -1:
        div = jsx.find('<div style={{flex: "1", minHeight: "0", position: "relative", background: "linear-gradient(155deg', cover)
        if div != -1:
            jsx = jsx[:div] + '<div onClick={v.pageTap} style={{cursor: "pointer", ' + jsx[div + len('<div style={{'):]
            n += 1


    # 6) 给页眉按钮打上导览锚点，新手引导要靠它定位高亮目标
    for handler, key in (('v.goBoard', 'board'), ('v.goGrace', 'grace'), ('v.goGuide', 'guide')):
        for size in ('34px', '30px'):
            needle = '<button onClick={' + handler + '} style={{flex: "none", width: "' + size + '"'
            i6 = jsx.find(needle)
            if i6 != -1:
                jsx = (jsx[:i6] + '<button onClick={' + handler + '} data-tour="' + key + '" '
                       'style={{flex: "none", width: "' + size + '"' + jsx[i6 + len(needle):])
                n += 1


    # 7) 导航页：三张功能卡片换成活动简介。
    #    功能介绍改由新手引导（高亮 + 悬浮框）承担，卡片入口在页眉本来就有。
    i7 = jsx.find('{(v.navCards || []).map((c, i) => (')
    if i7 != -1:
        # 找到包裹这个循环的容器起止
        loop_end = jsx.find('))}', i7)
        if loop_end != -1:
            loop_end += len('))}')
            line_start = jsx.rfind('\n', 0, i7) + 1
            indent = jsx[line_start:i7]
            intro = (
                indent + '<div style={{display: "flex", flexDirection: "column", gap: "16px"}}>\n'
                + indent + '  {(v.intro || []).map((p, i) => (\n'
                + indent + '    <div key={i}>\n'
                + indent + '      {p.h ? (\n'
                + indent + '        <div style={{fontFamily: "\'EB Garamond\',serif", fontSize: "9.5px", '
                'letterSpacing: ".2em", color: "rgba(92,26,34,.55)", marginBottom: "6px"}}>{p.h}</div>\n'
                + indent + '      ) : null}\n'
                + indent + '      <div style={{fontSize: "13.5px", lineHeight: "2", color: "#2a2320", textWrap: "pretty"}}>{p.t}</div>\n'
                + indent + '    </div>\n'
                + indent + '  ))}\n'
                + indent + '  <button onClick={v.startTour} style={{marginTop: "4px", padding: "14px", '
                'background: "#5c1a22", border: "1px solid rgba(198,164,95,.6)", color: "#e6cd91", '
                'fontFamily: "\'EB Garamond\',serif", fontSize: "12px", letterSpacing: ".22em", '
                'textIndent: ".22em"}}>\n'
                + indent + '    HOW TO PLAY 看怎么玩\n'
                + indent + '  </button>\n'
                + indent + '</div>\n'
            )
            jsx = jsx[:line_start] + intro + jsx[loop_end:]
            n += 1

    print(f'  应用了 {n} 处定制补丁')
    return jsx

src = open('markup.html', encoding='utf-8').read()
p = P(); p.feed(src)
body = emit(p.root, set(), 3)

body = apply_patches(body)

out = '''import React from 'react';

/**
 * 护照册的视觉层 —— 由 Claude Design 的 `Life Passport v5 Classic.dc.html`
 * 机械转换而来，样式 1:1 保留，不要手改这里的内联样式。
 * 所有数据通过 `v`（见 bookVals.js）注入；这一层不含任何业务逻辑，也不做任何写操作。
 */
export default function PassportBookView({ v }) {
  return (
'''.rstrip('\n') + '\n' + body + '''  );
}
'''
open('PassportBookView.jsx','w',encoding='utf-8').write(out)
print(f'生成 PassportBookView.jsx  {len(out):,} 字节')
