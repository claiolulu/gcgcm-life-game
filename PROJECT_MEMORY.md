# Mini Life Game · 共享项目记忆

最后更新：2026-09-13（Europe/London）  
本次核对代码基线：`passport-checkin` / `9a1b0c2`（见下方记录，提交后以实际哈希为准）。这只是核对时的提交，不要求开发始终停留在该提交。  
用途：让 Claude Code、Codex 和人工维护者从同一份项目现状继续工作。代码是事实来源；本文件是交接摘要，不替代源码或 Git 历史。

## 1. 项目定位与当前进度

项目已从“一晚迎新游戏”转为 GCGCM 的长期活动打卡护照。主流程是领取护照 → 活动报名 → 同工扫码盖章 → 查看参与记录/排行 → 生成分享图。

当前代码已实现：

- 参与者：领取/找回护照、同名确认、4 位密码管理、姓名/姓/名/头像/联系方式与个人配色维护；这些资料不再被活动状态锁定。
- 护照：封面、欢迎、导航、身份资料、每场活动的信息页及附加页、结语；排行榜/使用说明浮层。页数动态生成，不是固定八关。
- 活动：`upcoming/live/done` 状态、报名与取消、配图/链接/签发机构、用户角色可见范围；总控台拖拽排序同步到护照装订顺序。
- 用户：总控可将角色设为普通/同工，可重置密码、查看报名和参与记录、二次确认删除。用户搜索支持名字、编号和联系方式；联系方式独立展示，列表限高内部滚动。
- 投稿：Visa 顶部上传入口，文字与多张照片；参与者只看/撤回自己的素材；管理员画布素材库可导入文字和图片。
- 画布：首张信息页始终保留；附加照片/总结页可增删、改名和排序；组件移动/缩放/旋转/删除、文字原位编辑、齿轮样式面板、撤销/重做、自动吸附参考线、全屏编辑、双指缩放和平移。
- 分享图：生成 PNG，系统文件分享、下载及平台提示。iPhone 网页不能静默写相册，使用系统分享面板的“存储图像”或长按图片；不保证所有社交 App 都提供直接分享目标。
- 离线：PWA 缓存、参与者快照、同工花名册和操作 outbox、恢复网络重试、Socket.IO 实时信号与断线轮询。

已经移除：Solo/Duo/Trio 组队、路线排班、人生盲盒、Help Token/恩典站、奖项分配、全局可编辑护照/签证模板入口。不要仅凭旧 README 或残留注释把它们加回来。

用户设计要求：编辑中位置与样式、画布预览和最终展示一致；正文直接在画布原位编辑，齿轮面板负责 styling。手机工具不能遮挡内容或选中框；全屏编辑保持黑色背景并能看到实时样式变化；MRZ footer 是固定模板，不进入可编辑组件列表。

## 2. 代码地图

| 范围 | 主要入口与职责 |
| --- | --- |
| 应用路由 | `web/src/App.jsx`；参与者与工作人员路由守卫、全局提示/确认框 |
| 服务/API | `server/src/index.js`；Express、鉴权、输入清洗、上传、广播、静态文件与健康检查 |
| 数据与迁移 | `server/src/schema.sql` 是建表权威；`server/src/db.js` 负责启动迁移、SQL statements、settings、备份 |
| 派生状态/事件 | `server/src/game.js`；角色过滤、参与者状态、花名册、个人排行、幂等操作 |
| 出厂默认值 | `server/src/config.js`；品牌、六场初始活动、主题、Visa 栏目来源；已存数据库的活动不会随默认值自动覆盖 |
| 客户端数据 | `web/src/lib/player.js`、`staff.js`、`config.js`；React external store、快照与同步 |
| 网络/离线 | `web/src/lib/api.js`、`realtime.js`、`idb.js`、`session.js`；超时、轮询、IndexedDB 与 localStorage 兜底 |
| 护照渲染 | `web/src/pages/book/PassportBook.jsx` 为交互；`PassportBookView.jsx` 为展示；`bookVals.js` 为主题/绑定值/页面生成 |
| 共用画布渲染 | `VisaPageFrame.jsx`、`VisaBlocks.jsx`（`BlockBody`、`PassportMrz`）；编辑器与参与者页面共享 |
| 画布编辑 | `web/src/pages/ActivityDesign.jsx`；本地草稿、页面/区块、手势、样式面板、素材库、保存 |
| 活动/总控 | `ActivityDetail.jsx`、`Admin.jsx`；配置整份回传、活动状态、用户与统计 |
| 参与者上传 | `book/ActivityContributionSheet.jsx`；单次最多 9 张，逐张压缩/提交，部分失败保留待传照片 |
| 其他页面 | `Register.jsx`、`Join.jsx`、`Badge.jsx`、`Leaderboard.jsx`、`StaffLogin.jsx`、`StaffScan.jsx`、`StaffPlayer.jsx` |
| 通用组件/样式 | `ImeInput.jsx`、`Avatar*.jsx`、`Scanner.jsx`、`ui.jsx`；`styles.css` 与 `fonts.css` |
| 构建/PWA | `web/vite.config.js`、`web/scripts/make-icons.mjs`、`web/public/staff.webmanifest` |
| 部署 | `scripts/tunnel.sh`、`Dockerfile`、`fly.toml`、`render.yaml` |
| 历史设计资产 | `design/` 是原始设计/转换材料，不是当前应用渲染入口 |

技术栈：Node.js ESM + Express 4 + better-sqlite3 + Socket.IO；React 18 + React Router 6 + Vite 5 + vite-plugin-pwa。二维码使用 qrcode/jsQR。当前本机核对运行环境 Node 22。

主要前端路径：`/`、`/register`、`/join/:id`、`/passport`、`/leaderboard`、`/badge`、`/staff`、`/staff/scan`、`/staff/p/:id`、`/staff/admin`、`/staff/admin/a/:id`、`/staff/admin/a/:id/design`。

## 3. 数据模型与不可破坏的规则

- SQLite 默认目录 `server/data/`，数据库 `game.db`；`MLG_DATA_DIR` 可覆盖，生产卷要保存整个目录（包括 `uploads/` 与 `backups/`）。WAL、外键开启。
- `players`：稳定 id/顺序 code、找回 pin、参与者 token、name、role、surname/given、avatar JSON、contact、theme JSON、notes、时间戳。
- `events`：追加事件，`station` 或 `adjust`，`station_id` 沿用旧命名但现在表示活动 id。`opId` 是事件主键；同一用户同一活动的 station 唯一索引防止并发重复盖章。不能改成覆盖“当前分数”的模式。
- 常规同工打卡传 `checkin: true`、1 分；底层仍支持 score/adjust。当前统计按事件派生，不能假定所有历史分值都是 1。
- 删除活动保留历史章；已删除或角色不可见活动的章不计入该用户当前场次/分数。恢复同 id 活动可重新关联。活动 id 是历史锚，不能随改名或排序改变。
- `settings._activities` 保存完整活动数组；排序就是数组顺序，服务端重写 `order`。API 是整份替换，多编辑器同时保存可能覆盖彼此，保存前需留意最新配置。
- 活动第一页用 `activity.blocks`，后续页用 `extraPages[{id,title,kind,blocks}]`。`blocks` 缺省意味着生成默认版式，`[]` 意味着明确留白，两者不能混同。
- 区块类型：banner/fields/station/note/photo/links/text/image。坐标与宽高是页面百分比，字号按页高 cqh；页面比例 `PAGE_ASPECT = 1.9`。页眉、水印、二维码、章与 MRZ footer 是固定模板。服务端保存时剔除旧 mrz 区块。
- fields 的 `src` 来自 `VISA_ROW_SOURCES`：固定文字、持照人信息、活动数据、报名/盖章信息。不能把示例持照人值当作所有人的固定正文。
- `signups`：activity/player 组合主键，报名与实际盖章分离。仅 upcoming 可报名/取消；同一时刻最多一个 live。全局 gameState 是兼容派生值，不再是报名/个人资料锁定开关。
- `activity_materials`：归属 activity/player，text/image，时间戳。用户只能访问本人投稿；全体素材库仅 admin。单人每活动最多 30 项，文字最多 1000 字符。
- 图像压缩后提交 data URL；服务端验证真实文件头，压缩后上限 2MB；内容哈希文件名避免重复存储。图片位于 `/uploads/`，不能跟随前端构建清除。
- 参与者 `role=normal/staff` 只控制活动可见性，不能获得后台权限。后台 session 的 staff/admin 是另一套 PIN 鉴权。`audience=all/normal/staff`；直接活动/报名/素材接口也检查范围，但公开 `/api/config` 仍含活动配置，不能把 audience 当成保密数据隔离。
- 删除用户：UI 二次确认，服务端先备份，外键级联删事件/报名/投稿，epoch 增加以清除同工旧花名册；现有实现不会自动删除磁盘图片。
- 会话 localStorage 键为 `mlg.player` / `mlg.staff`；IndexedDB `mlg` 的 kv/outbox 有 localStorage 降级。outbox 重试必须复用 opId；epoch 不同强制全量，增量同步不能遗留被删用户。
- 服务端合并 400ms 内 tick 信号，config/settings 原因不能被普通 update 覆盖；客户端收到后按需拉取。Socket 断线以 10 秒轮询兜底。

## 4. UI 与回归注意点

- 护照内部横版页在竖屏旋转 90°、横屏不旋转，当前 CSS 是按真实可见视口完整 contain；比例不同会留黑边。不要按物理屏幕尺寸补偿普通浏览器地址栏。独立 PWA 才计算 screenGap。
- PWA manifest 声明 portrait，但不能保证 iPhone 浏览器取消系统横竖屏动画。用户之前多次调整方向方案，后续以当前 CSS、用户最新要求和真机结果为准，不照旧聊天直接改回锁屏方案。
- 翻页热点应与屏幕点击方向、实际坐标保持一致；翻页 ghost 不应捕获点击或重复提供 tour 锚点。
- 新手高亮用 `mlg.tourDone.v2` 持久记录，自动进入即标已看；`?` 可手动重开。不能改回每次打开网站都显示。
- 共用 `PassportMrz` 保持身份/Visa footer 的字号、字重一致，不能单独放大 Visa 字体或加入画布 palette。
- `ImeInput` 在 composition 期间保留本地草稿，结束再提交；不要每个拼音字符重建 DOM 或覆盖受控 value 导致光标跳首位。
- 编辑器本地修改需点击保存；撤销/重做包含多页与活动文字，历史上限 80。不要把“已选中”直接变成样式弹窗；文字原位编辑与 styling 分开。
- 双指缩放/平移时阻止区块误选中。全屏原生 API 不可用时使用 CSS fallback；样式面板必须在全屏容器内可见，且不给画布铺遮黑 backdrop。
- 触及布局/手势时至少检查：手机竖屏、短高横屏、普通浏览器工具栏、独立 PWA、桌面；选中文字与输入中文、缩放后拖拽/吸附、全屏齿轮/删除/保存、附加页翻页、上传返回与部分失败、长名字/长备注/长联系方式。记录真实做过哪些，不把构建成功称为视觉检验通过。

## 5. 运行、测试与部署交接

```bash
npm run install:all
npm run build
npm start
```

生产式本地服务默认 `http://127.0.0.1:3000`，服务前端 `web/dist`。后端逻辑修改要重启进程；前端修改要重新 build。未构建前端时首页可能 503。

开发热更新：`npm run dev:server` 与 `npm run dev:web` 分别运行，Vite 默认 5173，代理 API/socket/health 到 3000；涉及上传图片开发浏览时留意 Vite 当前没有单独 `/uploads` 代理。

测试：`npm test` 自动启动隔离 3199 服务与 `server/data-test/`，迁移测试另用专用库。`TEST_PORT` 可覆盖。不能将独立测试脚本的 BASE 指向线上服务；它们有清库动作。**不要运行当前过时的 `npm run seed` 去处理真实库。**

环境变量：`PORT`、`MLG_DATA_DIR`、`WEB_DIST`（隔离视觉构建）、`NODE_ENV`、`STAFF_PIN`、`ADMIN_PIN`。后台 PIN 环境变量优先于已存数据库值；开发 fallback 2026/stm2026 不是当前真实部署凭据。生产缺失会产生随机 fallback。实际密码只由部署环境/负责人管理，不写入共享记忆。

部署背景：本项目通过本机 3000 + Cloudflare named tunnel `gcgcm-life-game` 提供 `game.claiolulu.com`；同一后端支持 `staff.claiolulu.com` 首页跳转 `/staff` 与独立工作人员 manifest。2026-09-13 已实际重启并复核：两个域名返回 200、两个 PIN 登录返回预期角色、花名册人数未变。

部署机制上有两件必须知道的事：

- **前端不需要重启**。服务以 `express.static` 从磁盘读 `web/dist`，`vite build` 完成即生效。**服务端改动必须重启**才生效 —— 曾出现前端已是新版、服务端还跑着十几小时前进程的情况，导致纪元修复和新块类型都没生效。
- 目前进程由维护者手动启动（`STAFF_PIN=… ADMIN_PIN=… ./scripts/tunnel.sh`）。若由助手在独立会话中代启，它会过继给 launchd：机器重启、合盖或手动 kill 之后不会自行恢复，也没有开机自启。活动前应由维护者在自己的终端启动，或另行配置常驻服务。

- `scripts/tunnel.sh` 会构建、收旧进程、启动服务和隧道，并检查公网健康；有固定域名配置才使用 named tunnel，否则随机 trycloudflare。**脚本旧进程清理按宽模式匹配 node，可能误伤其他项目，运行前先检查目标进程，不要当成无副作用操作。**
- 凭据在机器 `~/.cloudflared/`，域名配置 `scripts/.tunnel-host` 被 Git 忽略。换机器 clone 仓库不会带来隧道授权或数据。
- Fly/Render 配置已在仓库，存在不等于当前部署在这些平台。Fly `internal_port=3000`、实际 `primary_region=ams`，需同区持久卷；部分注释仍称 lhr 或 PIN 要删库才生效，代码行为优先。
- 数据每分钟 JSON 快照，重置/用户删除前备份，进程正常退出也备份；备份含敏感信息，不能提交。现有 JSON 导出不代表有完备的一键恢复 UI。
- 部署需用户授权。确认构建、具体服务与数据目录、实际 PIN 来源、健康检查、公网入口与页面新版本后才能记“已部署”。不要靠进程号或静态资源 hash 长期记部署身份。
- `city.claiolulu.com` 是独立 `3d-city` 项目，不是这个仓库的 Passport 页面；不要在本项目顺手修改或重启它。

## 6. 本次核对、已知问题与下一步

2026-09-12：`npm test` 通过 210 项（迁移 27、流程 139、并发 11、权限/只读不变式 33），0 失败。第一次受运行环境限制无法监听端口，允许启动隔离服务后重跑通过。没有进行本次手机/桌面视觉测试，未执行前端构建或部署。

已发现但本次没有修复：

1. `README.md` 仍大篇幅介绍已移除的组队、盲盒、恩典站、旧八关与旧测试清库说明。应按当前长期打卡产品重写；其“测试会清真实库并重灌”已不成立。
2. `server/seed.mjs` 仍调用不存在的 `/api/admin/team`、旧站点与 life_event；可能先创建参与者再失败，不能当作可靠的演示初始化工具。
3. 若继续完善协作编辑，活动全量替换接口没有版本冲突控制；当前不要承诺多人同时编辑不覆盖。
4. 角色过滤用于体验/操作限制而非配置保密；若以后要求私密活动，需同时设计 `/api/config` 的服务端数据过滤。

最近用户需求（仅交接背景，不是本次新增授权）：角色列表普通/同工、用户确认删除、活动按角色可见、活动拖拉排序均已在代码中；用户搜索与联系方式展示、拖拽重写、图标块、可滚文本块也已完成。

2026-09-13 这一轮修掉的（原来不在上面的清单里，记下来避免再踩）：

5. **改活动之后各端分数不刷新**（`3635533`）。分数/场次是算出来的，算的时候要看活动清单；而花名册按 `players.updated_at` 增量同步。改活动不动任何一行 players，于是增量同步一个人都不返回，同工端一直显示旧分数，刷新无效、只有重登录才对。修法是保存活动时 `_epoch + 1`，沿用重置/删人已有的那套作废机制。回归测试见 `test-flow.mjs` 第 24 节。
6. **总控台「标为已参加」点了没反应**（`11bfc0d`）。服务端按角色可见性拒了（`stationById(id, role)`），而 `markDone` 只 await `queueOp`（那只保证进队列），照样弹成功。现在盖不上的按钮直接不给（`activityVisibleTo`，和服务端同一条规则），并且 `queueOp` 之后 flush、用 `issueFor(opId)` 查真结论。
7. **`navigator.clipboard?.writeText(...).then(...)`**（`911f08b`）。没有 clipboard 时 `?.` 返回 undefined，再 `.then` 抛 TypeError —— 正是最需要降级的场景下炸掉。统一走 `lib/clipboard.js`（带 textarea + execCommand 降级）。

新的注意点：

8. 画布里的 `cqh` 按**最近的容器查询容器**解析，而横版页自己是一个容器。新块若用 `cqh` 定尺寸，必须自己加 `containerType: 'size'`，否则会按整页高度算（图标块第一版就糊满了半张纸）。
9. 新增块类型必须**前后端一起改**：`BLOCK_KINDS` 不认识的 kind 会被静默降级成 `'text'`。前端先上线、服务端没重启时，新块一保存就变成空文字块，且编辑器是自动保存的，没有任何报错。
10. `ScrollBox` 的让道内边距只在真的溢出时加。全局 `box-sizing: border-box`，常驻 padding 会把每一个文字块收窄并重新折行，等于改动所有现成护照页的排版。
11. **竖屏下签证页整页是 `rotate(90deg)`**，浏览器会把手势映射回元素自己的坐标系：块内滚动在屏幕上变成横向，手指竖划毫无反应。`ScrollBox` 里的 `useCrossAxisScroll` 补了一条「转了 90° 时竖划也能滚」，并吞掉随后那次 click 以免被当成翻页。横屏不旋转，该逻辑整个不参与。以后在旋转页里做任何依赖手势方向的交互，都要先想这一层。

## 7. 每次开发的更新协议

开发开始：先读本文件，检查 Git 最新状态及相关源码。另一个助手可能刚提交新内容，不能用本文件旧基线覆盖它。

开发结束/中断交接：

1. 更新“最后更新”和核对基线（必要时注明工作区尚未提交），修正对应功能/数据/API/运行章节。
2. 更新验证与部署证据：命令/检查范围、结果；明确未测/失败/未部署。不要存真实用户内容、凭据或完整日志。
3. 更新已知问题与下一步，已解决项从未完成列表移除；保留用户最新产品决定与尚未解决的具体阻塞。
4. 在下面添加简短开发记录。最近记录保持精简，较旧的琐碎记录交给 Git，不无限复制聊天历史。
5. 检查 `git diff --check` 和链接；最终回复说明记忆已同步。提交/推送/部署是否执行仍由当前用户请求决定。

### 开发记录

#### 2026-09-13 · 可滚文本块、图标块、两个静默失败的修复

- 变化（`4698244` → `f2b56fd`，共 8 笔）：
  - 人员面板加搜索（名字/编号/联系方式）、改名「用户」、列表封高、联系方式与护照姓名单独成栏并可点复制、弹层改左上角返回。
  - 活动拖拽重写：整个过程不动数组，只改 transform，松手才提交；被拖的行跟手，越过半行才让位。原来「碰到就换位」会在边界上来回抖。
  - 画布：点进文字时光标落到文末（程序聚焦 contentEditable 默认在最前面）；新增可配链接、可调大小的「图标」块；文字块和备注块装不下就能滚，右边一根滑杆示意。
  - 服务端：保存活动时递增纪元；`BLOCK_KINDS` 增加 `'icon'`。
- 验证：`node run-tests.mjs` 215/215 通过（迁移 27、流程 144、并发 11、只读 33）。前端 `vite build` 通过。用线上库副本在隔离端口 3210 上逐项手测：搜索三种字段、滑杆比例与到底态、拖拽换位时机（0.2/0.45/0.55 行不动，0.9 行让一格）、光标位置（敲字落在文末、进入编辑后仍可点中间改）、图标块存取与 `javascript:` 链接被清空、可滚文本块的让道只在溢出时生效。剪贴板真实路径无法在无焦点的浏览器面板里验证，改用替换 `navigator.clipboard` 的行为测试。
- 部署：**已执行**。线上服务于 13:58 重启（此前跑的是 00:20 的旧进程，两处服务端修复都没生效）。重启前完整备份到 `server/data/pre-restart-*.db`。两个域名、两个 PIN、13 名用户数据均已复核。
- 追加（同日）：签证页竖屏下滚不动 —— 整页 `rotate(90deg)` 把块内滚动映射成了屏幕横向。补 `useCrossAxisScroll`：旋转时接受竖向拖动，滑动过就吞掉随后那次 click。实测竖屏 0 → 18.5（到底夹住）、反向回 0、不误翻页；横屏检测为未旋转、不插手，走原生。
- 下一步：
  - 线上总控台若仍显示旧分数，需重新登录或保存一次活动来触发全量同步（纪元修复只管以后）。
  - 用户提出的测试账号清理尚未执行 —— 等用户确认具体删哪几个，删除不可逆。
  - 消息推送做过可行性评估：微信内置浏览器不支持 Web Push；用户已澄清走手机浏览器，安卓可直接推，iPhone 必须先加到主屏幕。建议先做安装引导、看实际装机率再决定。未动工。
  - `README.md` 与 `server/seed.mjs` 的过时问题仍未修。

#### 2026-09-12 · 建立跨助手项目记忆

- 变化：梳理当前后端、迁移/模型、前端路由与数据层、护照/编辑器、PWA、测试和部署脚本；创建 `CLAUDE.md`、`AGENTS.md`、项目 Skill 与本文件；README 增加当前交接入口及旧版说明警告。
- 同步基线：`f733896` 用户搜索/联系方式展示已纳入现状；没有改动业务代码。
- 验证：当前业务测试 210/210 通过；本地健康 ok；文档本地链接与空白检查通过。官方 quick_validate.py 因已有 Python 环境缺 PyYAML 无法运行，未安装依赖；使用系统 Ruby YAML 解析器补检 frontmatter、字段、命名、description 与未完成占位符，均通过。
- 部署：未执行，本次文档变动不需要重启应用。
- 下一步：后续开发按本文件协议更新；过时 README 和 seed 的修复需单独排入开发任务。
