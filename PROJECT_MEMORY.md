# Mini Life Game · 共享项目记忆

最后更新：2026-09-18（Europe/London）
本次核对代码基线：`98cdae5` 之后的两个提交（照片图库、使用情况统计），已推送到 `origin/passport-checkin`。这只是核对时的提交，不要求开发始终停留在该提交。
用途：让 Claude Code、Codex 和人工维护者从同一份项目现状继续工作。代码是事实来源；本文件是交接摘要，不替代源码或 Git 历史。

## 1. 项目定位与当前进度

项目已从“一晚迎新游戏”转为 GCGCM 的长期活动打卡护照。主流程是领取护照 → 活动报名 → 同工扫码盖章 → 查看参与记录/排行 → 生成分享图。

当前代码已实现：

- 参与者：领取/找回护照、同名确认、4 位密码管理、姓名/姓/名/头像/联系方式与个人配色维护；这些资料不再被活动状态锁定。
- 护照：封面、欢迎、导航、身份资料、每场活动的信息页及附加页、结语；排行榜/使用说明浮层。页数动态生成，不是固定八关。
- 活动：`upcoming/live/done` 状态、报名与取消、配图/链接/签发机构、用户角色可见范围；总控台拖拽排序同步到护照装订顺序。
- 用户：总控可将角色设为普通/同工，可重置密码、查看报名和参与记录、二次确认删除。用户搜索支持名字、编号和联系方式；联系方式独立展示，列表限高内部滚动。
- 投稿：Visa 顶部上传入口，文字与多张照片；参与者只看/撤回自己的素材；管理员画布素材库可导入文字和图片。
- 画布：首张信息页始终保留；附加照片/总结页可增删、改名和排序；照片页默认带多图图库，支持设备多选上传、从参与者素材库连续加入、排序/移除及精选数量/列数设置；组件移动/缩放/旋转/删除、文字原位编辑、齿轮样式面板、撤销/重做、自动吸附参考线、全屏编辑、双指缩放和平移。
- 分享图：生成 PNG，系统文件分享、下载及平台提示。iPhone 网页不能静默写相册，使用系统分享面板的“存储图像”或长按图片；不保证所有社交 App 都提供直接分享目标。
- 离线：PWA 缓存、参与者快照、同工花名册和操作 outbox、恢复网络重试、Socket.IO 实时信号与断线轮询。
- 使用统计：参与者端埋点（打开页面、翻签证页、排名榜、报名、开/关通知、点开通知等）批量上报；总控台「📈 使用情况」看每日活跃（登录用户/未登录访客）、每日操作次数、功能排行和每场活动转化。原始记录保留 180 天后自动删除，不记 IP、位置和填写内容；护照「使用说明」第 6 条向参与者说明。
- 报名码分享：签证页可放「报名二维码」块（默认版式自带），参与者点开是分享面板（大码可长按保存、系统分享带图、复制链接），朋友扫码进报名页；码中间压活动图标或护照徽章。同工保存活动（活动页手动保存 / 画板保存）后主动问要不要发通知。
- 报名落地页的「打开我的护照」链接会带活动 id，复用护照已有的深链逻辑，直接定位到这场活动第一张 Visa 页；标签不符、护照里没有该页时仍打开普通护照，避免跳回报名页的循环。
- 护照附页：默认主翻页每场只装订 Visa 信息页。Visa 右上角问号左边的「详情页」按钮全局展开/收起照片与总结附页：浅色为收起，深色填充为展开；切换后在按钮下方显示同方向的气泡提示（约 3 秒），选择保存在当前浏览器。收起时，有附页的 Visa 首页画板右下角显示「活动回顾」，点击会展开并直达该活动第一张附页；展开时附页进入正常主翻页，回顾按钮隐藏。收起时若正在附页，会回到该活动信息页；画板预览展示固定按钮位置，引导和使用说明有说明。附页数据不随收起删除。
- 安装与通知引导：新手引导按 iPhone / 安卓教「添加到桌面」（安卓有安装事件时给一键按钮），通知那一步带「开启通知」按钮；第一次引导结束后主动问一次开不开通知。使用说明最后一条也按系统写添加方法。

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
| 报名码 / 添加到桌面 | `web/src/lib/activityQr.js`（`joinUrlFor` 报名链接、中间带图标的 H 级二维码并缓存）；`web/src/lib/install.js`（平台判断、截安卓 `beforeinstallprompt`、iPhone/安卓教程文字）；块渲染在 `VisaBlocks.jsx` 的 `QrBody` |
| 使用统计 | `server/src/usage.js`（事件白名单、英国时间分天、单设备限流、180 天清理、报表 SQL）；`web/src/lib/track.js`（队列 + sendBeacon + 离线补发、路由级埋点）；`web/src/pages/Usage.jsx`（管理员报表页） |
| 其他页面 | `Register.jsx`、`Join.jsx`、`Badge.jsx`、`Leaderboard.jsx`、`StaffLogin.jsx`、`StaffScan.jsx`、`StaffPlayer.jsx` |
| 通用组件/样式 | `ImeInput.jsx`、`Avatar*.jsx`、`Scanner.jsx`、`ui.jsx`；`styles.css` 与 `fonts.css` |
| 构建/PWA | `web/vite.config.js`、`web/scripts/make-icons.mjs`、`web/public/staff.webmanifest` |
| 部署 | `scripts/start-local-server.sh`（`npm start`）、`Dockerfile`、`fly.toml` |
| 历史设计资产 | `design/` 是原始设计/转换材料，不是当前应用渲染入口 |

技术栈：Node.js ESM + Express 4 + better-sqlite3 + Socket.IO；React 18 + React Router 6 + Vite 5 + vite-plugin-pwa。二维码使用 qrcode/jsQR。当前本机核对运行环境 Node 22。

主要前端路径：`/`、`/register`、`/join/:id`、`/passport`、`/leaderboard`、`/badge`、`/staff`、`/staff/scan`、`/staff/p/:id`、`/staff/admin`、`/staff/admin/a/:id`、`/staff/admin/a/:id/design`、`/staff/admin/usage`。

## 3. 数据模型与不可破坏的规则

- SQLite 默认目录 `server/data/`，数据库 `game.db`；`MLG_DATA_DIR` 可覆盖，生产卷要保存整个目录（包括 `uploads/` 与 `backups/`）。WAL、外键开启。
- `players`：稳定 id/顺序 code、找回 pin、参与者 token、name、role、surname/given、avatar JSON、contact、theme JSON、notes、时间戳。
- `events`：追加事件，`station` 或 `adjust`，`station_id` 沿用旧命名但现在表示活动 id。`opId` 是事件主键；同一用户同一活动的 station 唯一索引防止并发重复盖章。不能改成覆盖“当前分数”的模式。
- 管理员可在活动签到名单或用户详情确认后撤销指定活动的一枚章；服务端先快照，再在事务里删该 `station` 事件、触碰用户更新时间，并在 `revoked_events` 留下原事件 JSON 与 opId 墓碑，防止旧离线操作重放。报名记录不删，可用新 opId 重新签到。该操作需在线且只有 admin 可用。
- 常规同工打卡传 `checkin: true`、1 分；底层仍支持 score/adjust。当前统计按事件派生，不能假定所有历史分值都是 1。
- 删除活动保留历史章；已删除或角色不可见活动的章不计入该用户当前场次/分数。恢复同 id 活动可重新关联。活动 id 是历史锚，不能随改名或排序改变。
- `settings._activities` 保存完整活动数组；排序就是数组顺序，服务端重写 `order`。API 是整份替换，多编辑器同时保存可能覆盖彼此，保存前需留意最新配置。
- 活动第一页用 `activity.blocks`，后续页用 `extraPages[{id,title,kind,blocks}]`。`blocks` 缺省意味着生成默认版式，`[]` 意味着明确留白，两者不能混同。
- 附加分享页另有 `requireCheckin` 布尔开关（缺省 false）；画板可逐页设置。参与者未在该活动盖章时，该页只显示锁定提示，不渲染正文和照片；活动信息首页始终可见，活动 `done` 且本人未盖章时灰置并标「未参加」。报名二维码块仍只在 `upcoming` 显示。**这是 UI 可见性，不是保密边界**：公开 `/api/config` 与 `/uploads` 仍可直接读取原始配置和图片；若需强保密，要另设计鉴权接口和受保护的图片服务。
- 区块类型：banner/fields/station/note/photo/links/text/image/icon/gallery/qr。`qr` 是这场活动的报名二维码：码里的链接由前端按活动 id + `/api/config` 的 `shareOrigin` 现算（`/join/:id?from=share`），块上只存 `icon`（空 = 跟活动图标，`M` = 护照徽章，其它为 emoji）和 `label`（≤16 字，空回到「扫码报名」），服务端强制不挂外链。默认版式按栏目行数把它放进栏目下方空位；**已经排过版（`blocks` 是数组）的活动不会自动出现**，要在画板「＋ 新增」里加。`gallery` 最多保存 100 个安全图片地址，首屏 1–8 张、2–4 列；护照先显示精选缩略图和总数，点击进入全屏网格/大图浏览。坐标与宽高是页面百分比，字号按页高 cqh；页面比例 `PAGE_ASPECT = 1.9`。页眉、水印、二维码、章与 MRZ footer 是固定模板。服务端保存时剔除旧 mrz 区块。
- fields 的 `src` 来自 `VISA_ROW_SOURCES`：固定文字、持照人信息、活动数据、报名/盖章信息。不能把示例持照人值当作所有人的固定正文。
- `signups`：activity/player 组合主键，报名与实际盖章分离。仅 upcoming 可报名/取消；同一时刻最多一个 live。全局 gameState 是兼容派生值，不再是报名/个人资料锁定开关。
- `activity_materials`：归属 activity/player，text/image，时间戳。用户只能访问本人投稿；全体素材库仅 admin。单人每活动最多 30 项，文字最多 1000 字符。
- `usage_events`：`ts`、`day`（Europe/London 日期，`MLG_TZ` 可覆盖）、`player_id`（外键 ON DELETE SET NULL：删人后次数保留但不再指向这个人）、`device`（浏览器随机设备号；服务端自记事件为空串）、`event`、`activity_id`、`label`。事件名必须在 `USAGE_EVENTS`（前端可报）或 `SERVER_EVENTS`（目前只有 `notif_sent`，label 存发出的设备数）里。活跃用户 = 当天 distinct `player_id`；访客 = 当天从没带过 player 的设备；操作次数不含 `open`。`POST /api/t` 无鉴权，单批 50 条、单设备 10 分钟 600 条；`GET /api/admin/usage?days=7|30|90|180` 仅 admin。不进每分钟 JSON 快照，也不随 `resetAll` 清空。
- 图像压缩后提交 data URL；服务端验证真实文件头，压缩后上限 2MB；内容哈希文件名避免重复存储。图片位于 `/uploads/`，不能跟随前端构建清除。
- 参与者 `role=normal/staff` 只控制活动可见性，不能获得后台权限。后台 session 的 staff/admin 是另一套 PIN 鉴权。`audience=all/normal/staff`；直接活动/报名/素材接口也检查范围，但公开 `/api/config` 仍含活动配置，不能把 audience 当成保密数据隔离。
- 删除用户：UI 二次确认，服务端先备份，外键级联删事件/报名/投稿，epoch 增加以清除同工旧花名册；现有实现不会自动删除磁盘图片。
- 会话 localStorage 键为 `mlg.player` / `mlg.staff`；IndexedDB `mlg` 的 kv/outbox 有 localStorage 降级。outbox 重试必须复用 opId；epoch 不同强制全量，增量同步不能遗留被删用户。
- 服务端合并 400ms 内 tick 信号，config/settings 原因不能被普通 update 覆盖；客户端收到后按需拉取。Socket 断线以 10 秒轮询兜底。

## 4. UI 与回归注意点

- 护照内部横版页在竖屏旋转 90°、横屏不旋转，当前 CSS 是按真实可见视口完整 contain；比例不同会留黑边。不要按物理屏幕尺寸补偿普通浏览器地址栏。独立 PWA 才计算 screenGap。
- 地标水印：`web/src/lib/visaWatermark.js` 现有 14 张候选（原 11 张 + AI 生成的中央车站、人民宫、格拉斯哥墓园 v2 3 张）；较大的首版文件保留但不在候选池。v2 图片素材增加简洁云朵和透明留白，但在 Visa 页上要占更大空间：共用 `visaWatermarkPlacement` 将 3 张 v2 的显示框设为页面宽 72%，原 11 张仍为 40%；画板预览与最终护照使用同一布局。每张 Visa 信息/附加页由 `visaWatermarkKey(activityId, pageId)` 稳定选一张；刷新不重抽，不写活动数据库。欢迎/导航/资料页及说明/参与记录沿用原固定水印。弱网只预取本人的 Visa 页实际会用到的候选与其余固定 3 张，不把所有 14 张放进 PWA 预缓存。
- 护照 VISAS 进度口径：分母是该用户当前可见活动数，分子只数这些活动里已有参与章的场数；历史上已删除或对本人不可见的章不得使进度出现 5/4。导航/活动介绍页不展示进度条或大号成员二维码；进度条在「参与记录」，使用说明解释右下角可点开的个人护照码。
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

生产式本地服务默认 `http://127.0.0.1:3000`，服务前端 `web/dist`。本机启动一律用根目录 `npm start` 或 `bash scripts/start-local-server.sh`：脚本将 `MLG_DATA_DIR` 强制设为项目 `server/data` 的绝对路径，并打开 `MLG_REQUIRE_EXISTING_DB=1`。该保护会在数据库不存在、没有用户/活动或完整性检查失败时拒绝启动，不会自动建空库。首次安装或隔离测试不要打开此保护；容器的 `/data` 部署仍需独立配置和核对。后端逻辑修改要重启进程；前端修改要重新 build。未构建前端时首页可能 503。

开发热更新：`npm run dev:server` 与 `npm run dev:web` 分别运行，Vite 默认 5173，代理 API/socket/health 到 3000；涉及上传图片开发浏览时留意 Vite 当前没有单独 `/uploads` 代理。

测试：`npm test` 自动启动隔离 3199 服务与 `server/data-test/`，迁移测试另用专用库。`TEST_PORT` 可覆盖。不能将独立测试脚本的 BASE 指向线上服务；它们有清库动作。

环境变量：`PORT`、`MLG_DATA_DIR`、`WEB_DIST`（隔离视觉构建）、`NODE_ENV`、`STAFF_PIN`、`ADMIN_PIN`。后台 PIN 环境变量优先于已存数据库值；开发 fallback 见 `db.js` 的 `seedSettings()`，只用于本地开发。**仓库是公开的，代码里的默认值绝不能改成线上实际 PIN**（2026-09-15 发现过一次，推送前已恢复），真实值也不写进本文件。PIN 相关风险已与用户确认，线上 PIN 暂不更换。生产缺失会产生随机 fallback。实际部署仍优先使用明确环境变量，不要用 fallback 猜生产配置。

部署背景：本项目通过本机 3000 + Cloudflare named tunnel `gcgcm-life-game` 提供 `game.claiolulu.com`；同一后端支持 `staff.claiolulu.com` 首页跳转 `/staff` 与独立工作人员 manifest。2026-09-13 已实际重启并复核：两个域名返回 200、两个 PIN 登录返回预期角色、花名册人数未变。

部署机制上有两件必须知道的事：

- **前端不需要重启**。服务以 `express.static` 从磁盘读 `web/dist`，`vite build` 完成即生效。**服务端改动必须重启**才生效 —— 曾出现前端已是新版、服务端还跑着十几小时前进程的情况，导致纪元修复和新块类型都没生效。
- 目前进程由维护者手动启动（带 `STAFF_PIN`/`ADMIN_PIN` 环境变量执行 `npm start`，隧道 `cloudflared tunnel run gcgcm-life-game` 单独启动）。若由助手在独立会话中代启，它会过继给 launchd：机器重启、合盖或手动 kill 之后不会自行恢复，也没有开机自启。活动前应由维护者在自己的终端启动，或另行配置常驻服务。

- 旧的 `scripts/tunnel.sh`（会宽匹配 pkill node、快速隧道）与 `render.yaml`、`server/seed.mjs` 已于 2026-09-17 删除，不要恢复。
- 凭据在机器 `~/.cloudflared/`，域名配置 `scripts/.tunnel-host` 被 Git 忽略。换机器 clone 仓库不会带来隧道授权或数据。
- Fly 配置已在仓库，存在不等于当前部署在这些平台。Fly `internal_port=3000`、实际 `primary_region=ams`，需同区持久卷；部分注释仍称 lhr 或 PIN 要删库才生效，代码行为优先。
- 数据每分钟 JSON 快照，重置/用户删除前备份，进程正常退出也备份；备份含敏感信息，不能提交。现有 JSON 导出不代表有完备的一键恢复 UI。
- 部署需用户授权。确认构建、具体服务与数据目录、实际 PIN 来源、健康检查、公网入口与页面新版本后才能记“已部署”。不要靠进程号或静态资源 hash 长期记部署身份。
- **重启后必须核对进程实际打开的 SQLite 文件**（如 `lsof -p <pid>` 的 `game.db` 路径），并用已登录的 `/api/staff/sync` 核对花名册人数；只检查预期路径上的数据库计数是不够的。2026-09-17 一次重启沿用错误的 `MLG_DATA_DIR` 指向另一份空库，健康检查仍为 200，导致页面暂时看不到用户；已纠正为项目 `server/data` 的绝对路径。不要把另一份空库误当作生产数据或用其覆盖原库。
- `city.claiolulu.com` 是独立 `3d-city` 项目，不是这个仓库的 Passport 页面；不要在本项目顺手修改或重启它。

## 6. 本次核对、已知问题与下一步

2026-09-12：`npm test` 通过 210 项（迁移 27、流程 139、并发 11、权限/只读不变式 33），0 失败。第一次受运行环境限制无法监听端口，允许启动隔离服务后重跑通过。没有进行本次手机/桌面视觉测试，未执行前端构建或部署。

已发现但本次没有修复：

1.–2. （2026-09-17 已解决：README 按打卡护照重写；`server/seed.mjs` 已删除。）
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
11. **签证页的块层整层是 `pointerEvents: 'none'`**（`VisaBlocks` 的最外层 —— 否则一张铺满页面的背景图会把翻页点击整个吃掉）。后果是块里任何需要接收手势的东西**默认都不是命中目标**：手指落下去目标是上面那层翻页层，挂在块里的监听一次都不会被调用，浏览器自己的原生滚动也同样滚不动。需要交互的块必须自己把 `pointer-events` 改回 `auto`（可继承属性，后代能要回来），而且只在真的需要时要 —— 大块地方常开会吞掉翻页。`ScrollBox` 现在只在溢出时开。
    - 排查这类问题**不能用 `el.dispatchEvent()`**：直接派发绕过命中测试，盒子被盖住也照样「通过」。要用 `document.elementFromPoint(x, y)` 取目标再派发，并断言命中的就是目标元素本身或其后代。
12. **旋转判定要用变换矩阵，不要比宽高。** 护照整册可能被整体缩放以适配屏幕，那时布局宽高和屏幕宽高对不上，比绝对差会把「转了」判成「没转」。取累计矩阵里局部 (0,1) 的落点 `(c,d)`：`|c| > |d|` 即转了 90°；`hypot(c,d)` 就是缩放系数，手势位移要除掉它才跟手。
13. **竖屏下签证页整页是 `rotate(90deg)`**，浏览器会把手势映射回元素自己的坐标系：块内滚动在屏幕上变成横向，手指竖划毫无反应。`ScrollBox` 里的 `useCrossAxisScroll` 在旋转时接管手势（两个方向都当滚动），并吞掉随后那次 click 以免被当成翻页；没旋转时完全不插手，把惯性和回弹留给原生滚动。三个坑连在一起：
    - **用 touch 事件，不要用 pointer 事件。** pointer 那条路要求 `touch-action: none` 在 touchstart **之前**就已经挂在元素上，否则浏览器当场把这一下判给自己平移并发 `pointercancel` 掐断 `pointermove`；在 `pointerdown` 里补 `sync()` 来不及，手势仲裁早于它。非被动 `touchmove` 里 `preventDefault()` 不吃这一套。`touch-action` 仍然照设，属双保险。
    - 拦要拦在**第一下** `touchmove`，等过了抖动阈值再拦就晚了。
    - 旋转时原生惯性被 `preventDefault` 关掉了，得自己补一段（0.94 衰减，到头即停不回弹），否则手指一松就死住。
    - 转屏后必须重算，而且**不能只靠 ResizeObserver**：这个块的布局尺寸在两种朝向下完全一样（页面恒为 1.9:1，变的只是 transform），RO 永远不触发。靠 `resize`/`orientationchange`，且要补一帧加一次延时等 React 把新 transform 渲上去。
    - `pointerdown` 里再 `sync()` 一次，以按下那一刻为准，别信缓存的判定。
14. **可见范围有三种模式：`all` / `signed` / `tags`**，`tags` 模式下由 `audienceTags[]` 列出命中哪些标签（命中任一即可见）。判定函数分两条 —— `activityVisibleTo(a, tagSet, signedIds)` 管护照可见和计分；`activityOpenForSignup(a, tagSet)` 把 `signed` 当所有人可见，**扫码落地页和报名接口必须用它**，否则没报名的人看不到也报不进来，那一档就成了一把锁死的门。同工对 `signed` 一律可见（要核对名单、要盖章）。
    - **一个人可以挂多个标签。** 有效标签集 = `{role}` ∪ `player_tags` 里的自建标签（`playerTagSet` / 前端 `playerTags`）。内置的 `normal` / `staff` 仍由 `players.role` 派生，不进 `tags` 表 —— 那一列还被导出、花名册和角色下拉用着，动它风险大。
    - **`audience` 的旧单值 `'normal'` / `'staff'` 会被 `normalizeAudience` 迁成 `tags` 模式**挂同名内置标签。读（`getActivities`）和写（`POST /api/admin/activities`）**必须用同一个函数**：各写一套的话，跑着旧前端的总控台提交上来的旧值会被静默归成 `'all'`，「同工专属」就变成谁都能看见。
    - **删标签必须同时从活动的 `audienceTags` 里摘掉。** 留着失效 id 的后果是这场活动**谁都看不见**（没人命中），而总控台里照样显示正常。摘空了要退回 `'all'`。同理，`audience: 'tags'` 但一个都没勾也规整回 `'all'`。
    - 标签的增删改名会改一批人的可见活动而不动 players 行 → **必须递增纪元**。给单个人挂标签只影响他自己 → `touchPlayer` 即可，走增量同步。
15. **`audience` 从来不是保密机制。** `/api/config` 无鉴权且下发全部活动，「同工专属」的内容本来就在公开载荷里，前端只是不显示。要做成外人真拿不到，得把配置改成按人下发，会动到缓存、纪元同步和离线预缓存。
16. **护照册的装订列表必须由调用方传进 `buildVals`**，不能在里面重新取 `config.activities`。这里原来有个一直存在的 bug：导航用 `PassportBook` 过滤后的页表，渲染用 `buildVals` 内部未过滤的页表，两份不一致 —— 只要有活动设了可见范围，页码就错位指到别的页，`VISAS x/y` 的分母也把看不见的算进去。等于「同工专属」在护照册里从来没真正生效过。
17. **`NetBar` 的 `online` 必须传，或者别传。** 它以前写成 `!online` 就显示「📴 离线模式」，于是六处 `<NetBar />`（活动详情、扫码落地页）因为 `online === undefined` 常驻一条假的离线提示，看起来像整个站挂了。现在 `undefined` 按 `navigator.onLine` 算。
18. **扫码落地页 `GET /api/activity/:id` 不按可见范围拦。** 它是报名入口：拦住的话标签不符的人、以及任何还没登录（按普通成员算）的扫码者只会看到一个打不开的死页。而 `/api/config` 本来就无鉴权下发全部活动，拦这一下没有任何保密作用。够不够资格用响应里的 `eligible` 表达，前端把报名按钮换成说明；真正拦在 `POST /signup`（403，不是 404）。取消报名**不看标签** —— 已经报上的人永远能把自己撤下来。
19. **分享域名走 `config.shareOrigin`，不要用 `window.location.origin`。** 同工在 `staff.claiolulu.com` 上操作总控台，用当前 origin 拼出来的二维码会把参与者领到同工端入口。服务端按请求的 Host 把 `staff.` 换成 `game.`，可用 `MLG_SHARE_ORIGIN` 覆盖；返回空串表示「前端用自己的 origin」，本地开发和局域网不受影响。
20. **别只 `await flush()` 就读结论 —— 用 `settleOps(opIds)`。** `queueOp` 自己会触发一次后台同步，而 `flush()` 碰到已有一次在飞时是**直接搭车返回**的；那一次的 outbox 快照可能还不包含后排队的操作，于是 await 回来时它其实还没发出去，`issueFor` 查不到问题，调用方就把它当成功报出去。批量签到时这会变成「1 人签到成功」而服务端一个章都没记。`settleOps` 循环同步到这些 op 真的离开待发队列为止，返回还没结论的那些（网络不通就是这种情况）。
21. **标签颜色存在服务端的 `tags.color`，不要在前端按 id 哈希算。** 哈希算色会撞色（十种颜色、几个标签就很容易两个一样），按顺序算则删一个标签后面的全变色。新建时服务端挑一个「眼下没人用」的色板颜色；保存时提交里带了合法 `#rrggbb` 就用，没带或不合法就沿用原色。内置两个固定：普通成员 `#9aa8bd`、同工 `#e8c56a`（色板里刻意不放这两个）。前端用 `tagChipStyle(color, on)` 算 rgba，不用 CSS `color-mix`（旧 iPhone 的 Safari 不认）。
    - 老库迁移：`CREATE TABLE IF NOT EXISTS` 不会给已存在的 tags 表补列，`db.js` 在准备语句**之前**手动 `ALTER TABLE tags ADD COLUMN color`，并给没颜色的标签按顺序发色 —— 放在准备语句之后的话 `SELECT color` 会让服务直接起不来。
22. **文字长度上限前后端必须是同一个数，而且截断不能无声。** 画布文字块上限 `TEXT_BLOCK_MAX = 3000`，服务端 `server/src/index.js` 与前端 `web/src/lib/config.js` 各定义一份，改一边必须改另一边（服务端有测试钉住 3000）。按码点截（`[...str]`），不按 UTF-16 截，免得劈开 emoji。前端 `InlineValue` 超限时当场标红（`data-over`），失焦截断后通过 `onTextChange` 的第三个参数 `{ truncated, max }` 通知，画布弹提示。其他字段的上限（活动名 20、类型 12、负责人 20、英文名 40、签发机构 24、描述 200、链接 300、附加页标题 24、横幅 16/24/16、栏目标题 40、固定文字 40、站点/备注标签 30）服务端与前端 `maxLength` 已对齐；画布里描述的内联编辑原来默认 1000，已改为 200。
23. **排行榜口径 ≠ 护照口径。** 同工专属活动（可见范围**只**限定「同工」一个标签；同工 + 其他标签不算）不计入排行榜的总数、场次和分母，但护照里本人的总数和场次照常算。服务端在 `leaderboard()` 里把这类活动从 live 集合剔除，`rankOf` 从它取，所以「我的名次」一致。总控台本地名次 `leaderboardLocal(activities)` 必须同口径：花名册里的 total 是护照口径，要减掉 —— **只对同工角色减**（同工专属只有同工看得见，普通成员的护照口径本来就没算）；结果放在 `boardTotal / boardDone / boardStationsTotal`，原字段不动。「👥 用户」列表的名次、分数、场次用排行榜口径；人员详情里的「已参加」用护照口径。
24. **通知推送的密钥（VAPID）由服务端第一次用到时自己生成，存在 settings 表的 `_vapid`，不要换。** 换了之后所有已订阅的设备立刻失效，每个人都得重新点一次 🔔。私钥只在 `server/src/push.js` 里用：不打印、不下发、不写文件；`/api/config` 里不能出现它（有测试）。按用户要求由服务端生成，不走「用户手动生成再传环境变量」那条路。注意完整备份（`/api/admin/backup.json`）会带上 settings 表，和 `_secret` 一样属于管理员才能拿到的敏感内容。
25. **通知只能手动发，不能跟着活动保存自动发。** 活动详情页是边改边自动保存的，自动发的话改一个字就推一条。发给谁由同工每次选：`all` 全部领了护照的人 / `signed` 报了名的人 / `tags` 挂着所选任一标签的人。服务端**不认识的范围按 `signed` 处理**（宁可少发，不要因为一个错字发给所有人），选 `tags` 却没选标签返回 400。
26. 翻页热区是按**元素自己的盒子**算左右四分之一，而各类页面的盒子宽度不同（横屏下身份页那类 `book-flip` 是全屏 812 宽，欢迎页那类只有居中 430 宽）。换算成屏幕坐标时别想当然。2026-09-15 起手机上（屏幕短边 ≤ 540px）竖版页也铺满屏幕，横屏两侧不再有点不到的黑边；电脑/平板上竖版页仍是居中 430px，两侧空白照旧不翻页。
29. **竖版页宽度由 CSS 变量 `--book-portrait-max` 决定**（`bookVals.js` 的 `stageMax`，默认 430px；`styles.css` 在 `(orientation: landscape) and (max-height: 540px)` 或 `(orientation: portrait) and (max-width: 540px)` 时设为 100%）。用 CSS 变量而不是 JS 判断，转屏时不需要重渲染。设计稿里有**按宽度算的百分比外边距**（封面徽章 `marginTop: 11%`、书名 `10%`）：页面变宽它就变大，横屏手机上会把封面下半截挤出屏幕。封面在横屏手机上用 `.pp-cover*` 类按 `cqh` 收紧（需要 `!important` 压过内联样式），竖屏和电脑仍是内联原值。以后给竖版页加内容，别用百分比 margin/padding。
30. **`html { -webkit-text-size-adjust: 100% }` 不能删。** iPhone Safari 横屏时会自动放大「像大段正文」的字号，转回竖屏常常不缩回来（用户反馈「横屏再竖屏字体变了、不重新适配」）。竖版页横屏铺满后更容易触发。Chromium 模拟器复现不了，只能靠这条样式兜住，真机要复查。
31. **平台判断先认安卓，再用「自称 Mac + 有触点」认 iPad。** 反过来的话，模拟器和部分安卓平板会被当成 iPad，教程写成 iPhone 的。`beforeinstallprompt` 在页面很早就会触发，监听必须在模块顶层（`install.js` 被 `bookVals.js` 静态引入）。iPhone 没有安装接口，只能教「分享 → 添加到主屏幕」，而且 **iPhone 只有从桌面图标打开才收得到通知**。
32. **弹通知权限、弹安装框都必须在用户点击里。** 所以新手引导不能自动请求权限，只能在步骤里放按钮（`Tour` 的 `step.action` / `step.nextLabel`）；第一次引导结束后先用自己的确认框问，用户点「开启通知」才调 `push.toggle()`。每台设备只问一次（`localStorage` 的 `mlg.notifyAsked.v1`）；已开启、浏览器不支持、iPhone 还没添加到桌面都不问。
33. **保存后问推送只在手动保存时问。** 活动详情页 `save()` 成功返回 true，只有 💾 按钮走 `saveAndAsk`；自动保存不问（否则改一个字问一次）。画板保存后选「去写通知」跳 `/staff/admin/a/:id#notify`，详情页用回调 ref 等推送卡片挂上再滚动并聚焦标题。
34. **报名码二维码用 H 级纠错，中间徽章占宽 24%（含白边约 28%）。** 已用 jsQR 对 360/900px、长短活动 id 实测盖上徽章后都能解码。点阵固定近黑色，不随护照主题变色；徽章颜色写死在 `activityQr.js`。报名码和护照页脚的「护照码」是两回事，分享面板里写明了，别合并。
35. **使用统计里「未登录的人」不是系统外的访客**：是打开了不用登录的页面（活动报名页、领护照页）但当时没登录护照的设备，比如扫了海报/朋友分享的报名码还没领护照、换手机还没找回。分享码进来的记 `share_visit`（活动转化表「其中扫分享码」列），另有 `qr_open`、`qr_share`、`install` 事件。
36. **参与者端的新页面、弹层一律读主题变量，不要写死颜色。** `lib/passportScreen.js` 在非 `/staff` 路由把 `--ink/--gold/--text…`（纸色底 + 护照主色）和 `--pp-*` 挂在 `<html>` 上，所以 `.card/.btn/.sheet` 这类通用组件自动跟配色，挂在 body 上的弹层也能读 `--pp-*`。注意 `--gold` 在参与者端是**深色**的护照主色，配它的文字要用 `var(--pp-paper)`，别写死深色字。同工端（`/staff`）不挂，保持深色总控台。页面自己别再往 `<html>` 挂同一套变量（徽章页原来就这么做，会和全局的各挂各撤冲突）。
37. **报名码只在活动「还没到」时显示**（`QrBody` 读 `blockData.activityState`）。进行中=报名已截止、已办完都隐藏；改回「还没到」会重新出现。画板里始终画出来（变淡）。
38. **护照页外围必须是黑底**：`html.book-locked` 下 html/body 背景固定 `#000`。参与者端全局配色会把 `--ink`（body 底色）换成纸色，不固定的话 iPhone 底部安全区会露出一条白边。
27. **埋点走 `sendBeacon`，所以 `POST /api/t` 收的是 `text/plain`，护照令牌放在 body 的 `t` 字段**（beacon 带不了 Authorization 头）。不要改成 `application/json` 的 Blob，各浏览器对非简单类型 beacon 的处理不一致；服务端两种都认。`track(event, { once: true })` 的去重键带当天日期，同一天同样的事只记一次。新增事件名要前后端一起加 —— 服务端不认识的会被静默丢掉，报表里就是没有。
28. **公网健康检查用 `curl`，不要用 Python `urllib`。** Cloudflare 按浏览器特征拦 urllib 默认 UA，三个域名一律回 `403 error code: 1010`，看起来像全站挂了；2026-09-15 重启核对时遇到过，换 curl 全部正常。

## 7. 每次开发的更新协议

开发开始：先读本文件，检查 Git 最新状态及相关源码。另一个助手可能刚提交新内容，不能用本文件旧基线覆盖它。

开发结束/中断交接：

1. 更新“最后更新”和核对基线（必要时注明工作区尚未提交），修正对应功能/数据/API/运行章节。
2. 更新验证与部署证据：命令/检查范围、结果；明确未测/失败/未部署。不要存真实用户内容、凭据或完整日志。
3. 更新已知问题与下一步，已解决项从未完成列表移除；保留用户最新产品决定与尚未解决的具体阻塞。
4. 在下面添加简短开发记录。最近记录保持精简，较旧的琐碎记录交给 Git，不无限复制聊天历史。
5. 检查 `git diff --check` 和链接；最终回复说明记忆已同步。提交/推送/部署是否执行仍由当前用户请求决定。

### 开发记录

**2026-09-20 画布改字点框外不再回退** —— 已提交，前端构建已上线（无服务端改动）。
- 根因：画布的 `pointerdown` 会先把 `inlineText` 清成 null，输入框在 blur 之前就被卸载，
  只挂 `onBlur` 的提交根本没跑，React 再按旧的 `b.text` 重绘 —— 看着就是「点框外就回退」。
- `InlineValue` 改成卸载时也提交一次（`commitRef` + `useEffect` 清理）。注意 React 在跑清理
  之前就把 `ref` 清成 null 了，所以另存一份 `nodeRef` 才读得到 DOM 里那段文字。
- `patch()` 按块 id 找到它**自己所属的那一页**再打补丁：提交可能发生在切页之后，
  照当前页打会落到新页上，字同样会丢。
- 切页和点保存前先 `flushInlineEdit()`（手动 blur）把提交做成同步的，不赌 React 那一拍。
- 验证：总结页标题、照片页标题、总结页正文，分别用「点画布空白」和「切页签」退出，
  文字都留住并能存到服务端；`npm test` 全过（27 / 248 / 11 / 33）。

**2026-09-20 画板：图库上传没反应、改了被回退、页签拖动排序** —— 已提交，前端构建已上线（无服务端改动）。
- 图库连传多张一直没反应：`onChange` 先读 `e.target.files` 再 `e.target.value = ''`，
  而清空 input 会把同一个 FileList 一起清空，传下去的是空列表，于是静默 return。
  改成先拷成数组（参与者投稿那个输入框同样处理）。失败时也不再只报个数，带上第一条原因。
- `photo.js` 的 `shrink()` 加解码兜底：`createImageBitmap` 失败就退回 `<img>`，
  HEIC / 老 Safari 至少能给出明确提示而不是静默失败。
- 画板里所有 ref 改成「先算好、同步写 ref，再 setState」（`setBlocks` / `patch` / `bump` /
  `renamePage` / `setPageCheckin` / `patchActivity`）。原来 ref 是在 setState 的 updater 里改的，
  updater 要等 React 渲染才跑 —— 在画布上打完字立刻点「保存」，`save()` 读到的还是上一版，
  存上去是旧文字，服务端再把旧值画回来，看着就是「总结页标题改不了」。
- 页签支持拖动排序（信息页钉在第一格），松手才重排一次；原来的 ← → 按钮保留。
- 验证：`npm test` 全过（27 / 248 / 11 / 33）；隔离实例里连传 3 张进图库成功、
  画布改标题后立刻保存（抓到的请求体带新文字）、拖动页签改顺序并存到服务端、信息页拖不动。

**2026-09-20 签证页支持视频、图片点开看大图，修编辑被回退** —— 已提交；前端构建已上线，**服务端要重启**（视频上传接口是新的）。
- 视频：新块 `video`（src/poster/fit/radius/loop/muted/autoplay，autoplay 强制连带 muted）。
  上传走 `POST /api/admin/upload/video`，原始二进制（不走 base64 JSON）、上限 40MB、按内容哈希存进
  `uploads/`，靠头几个字节认 mp4 / webm / mov，不转码。`safeVideo()` 只放行本机上传和 https。
  护照里 `preload="metadata"`，翻到那页不下载整段；画板里不播，只显示首帧加「▶ 视频」。
  PWA：`/uploads/*.mp4|webm|mov` 改成 NetworkOnly —— Service Worker 缓存答不了 206，拖进度条会坏。
- 图片放大：`image` 和 `photo` 块在护照里点一下开大图弹层（复用图库那套样式），画板里不放大。
  这两类块连同视频一起加进「可接收点击」的名单。
- 编辑被回退：`ActivityDesign` / `ActivityDetail` 原来靠 `dirty` 这个 state 决定要不要拿服务端数据回填，
  它比按键慢一拍 —— 保存请求飞在路上时打的字会被响应里那份盖掉。改成 `editVersion` / `savedVersion`
  两个 ref 比对（同步、不受渲染时序影响）；保存回来发现版本变了就不重画，并提示「你刚打的字还留着」。
- 附页标题（活动总结那个）改不动：那个输入框是普通受控 `input`，中文选字期间会被 React 重写，
  换成 `ImeInput`（其它中文输入框早就用它了）。
- 验证：`npm test` 全过（27 / 248 / 11 / 33）；隔离实例用一段真实 mov 走通上传→放进签证页→护照里播放
  （readyState 4、可拖动）、图片点开放大、附页改名存到服务端、以及「保存飞行中继续打字不被回退」。

**2026-09-20 提示条不再压住弹层按钮** —— 已提交，前端构建已上线（无服务端改动，未重启）。
- 根因：`.toast-wrap` 是 `z-index: 80` 的底部固定层，弹层（`.sheet` / `.sheet-backdrop`，60/61）在它下面，
  而弹层的按钮都贴着底部 —— 活动页点「保存」后那句「已保存」正好盖住确认框的「去写通知」。
- 改法：`Sheet` 打开时给 `document.body` 加 `has-sheet`（按嵌套层数计数，套弹层也对），
  CSS 里 `body.has-sheet .toast-wrap` 改挂顶部；提示条仍在最上层，不会被背板盖掉。
- 另外 `saveAndAsk()` 改成静默保存 —— 紧跟着弹的确认框里已经写了「活动信息已经保存」。
- 验证：浏览器实测弹层开着时提示层在 12–58px、弹层按钮在 700px，不重叠；关掉后回到底部，
  body 上的标记也撤掉。`npm test` 全过（27 / 239 / 11 / 33）。

**2026-09-20 扫码报名放开到活动开始 / 结束之后** —— 已提交（`9d665fe`）并上线。另一会话（Codex）当时未提交的附页开关 / 撤销签到 / v2 水印放大等改动，按用户「一起提交重启」一并提交为 `b95373f`（展示稿产物 .codex-build / .codex-finalizer / outputs 已加进 .gitignore，未入库）。重启前备份 `server/data/pre-latesignup-2026-09-20.db`；旧进程 17262 → 新进程经 `scripts/start-local-server.sh` 启动，打开的仍是项目 `server/data/game.db`，`signups` 自动补上 `late` 列，推送公钥指纹不变，23 用户 / 12 报名 / 32 事件未变，game/staff/city 三个公网入口正常，隧道未动。线上已结束活动的报名接口返回「可以补登记」。尚未推送到 GitHub。
- `signups` 加 `late` 列（schema.sql + db.js 里在准备语句前 ALTER，老库自动补）。
- `activityRegistration()` 三种状态都收报名：live/done 返回 `late: true` 和各自的话术；
  `POST /api/activity/:id/signup` 不再 409，按 late 落库并回传；`DELETE` 也不再看状态
  （能报就能撤，盖过章的人撤报名不影响那一章）。
- `GET /api/admin/activity/:id/signups` 每行带 `late`；总控台「已报名」列表标黄字「· 补报名」，
  管理员用原有的「签到」按钮手动补章。
- 签证页报名码改成只在 `state === 'done'` 时隐藏（进行中继续显示）。
- 测试：`npm test` 全过（迁移 27、流程 239、并发 11、只读 33）；另起 3233 隔离实例用真实前端核对了
  进行中/已结束两种报名话术和总控台的「补报名」标记。


#### 2026-09-18 · 沐恩团契展示稿（非应用代码）

- 为用户制作两页 PowerPoint：第一页将参考背景原有「茶歇时间 / Tea Break」文字区域替换为「沐恩团契 / MUEN FELLOWSHIP」，保留周围黄色手绘旅行背景；第二页「团契护照」，左侧酒红护照本配参考图中的 Q 版人物，右侧将身份页与活动签证页上下拼接。
- 交付文件：`outputs/muen-fellowship-passport-slides-v4.pptx`。参考图以嵌入图片保存，文字与护照封面元素可编辑。
- 验证：Artifact Tool 包完整性、布局和重新导入均通过；已渲染并目视检查两页。未改动应用代码、配置、数据库或部署。

#### 2026-09-18 · 配图/图片块支持裁剪位置与放大（滑杆 + 画布内拖动）

- 需求背景：用户反馈签证页上的图放进去之后不能选「显示图的哪一部分」，`backgroundPosition` 之前写死 `center`；随后又要求能直接在图上拖动，以及能放大缩小。
- 新增三个字段，`image`（自己传的图）和 `photo`（活动配图）两种块都支持：`posX`/`posY`（0–100，默认 50，语义同 CSS `background-position` 百分比）、`zoom`（0.5–4，默认 1）。齿轮面板里是「左右 / 上下 / 放大」三条滑杆。
- **`zoom` 必须落在 `background-size` 上，不能用 `transform: scale`。** 第一版用 transform，缩小时用户立刻发现「被裁掉的上下没回来」——transform 缩的是**已经裁好的那张画面**，裁掉的边角永远回不来。现在 `VisaBlocks.jsx` 的 `CroppedImage` 自己算：拿图的原始长宽比（`useImageAspect`，按 src 缓存）和框的实际像素（ResizeObserver），算出 cover/contain 的基准高度再乘 zoom，写成 `background-size: Wpx Hpx`。于是缩小 = 图真的变小，原来裁掉的部分重新露出来，四周留白。长宽比或框尺寸还没拿到时退回纯 CSS 的 `cover`/`contain`，与旧行为一致，所以 zoom=1 时和改动前像素一致，老活动不会变样。
- 外面那层 `overflow: hidden` 要留着（配图是在白边框内侧那层），放大后才不会糊出框外。渲染画板与护照共用同一个 `CroppedImage`。
- 极端比例（很高的竖图放在很扁的框里）靠缩放不一定能露全，滑杆下限 25% 未必够——那种情况用下拉框的「完整显示（会留白）」，那条路是按 contain 算基准的。
- 画布内直接拖动（`ActivityDesign.jsx` 的 `imagePan`）：已选中的图片/配图块，身上直接拖改的是 posX/posY，不再是挪块本身——挪块改用选中框上方原有的 ✥ 手柄（未选中时行为不变，仍是 `blockTouch` 挪块）。手指往哪边拖图就往哪边走。换算时把屏幕位移按块自身旋转角度转回本地坐标系，除以块自身像素宽高（不是画布宽高），再除以 zoom，这样放大后跟手速度不变。
- **坑：两种块长得一样，但是两套代码路径。** `image` 的图源是 `b.src`，`photo`（齿轮面板标题写的是「配图」）的图源是活动数据的 `data.photo`。第一轮只改了 `image`，用户手机上测的恰好是「配图」块，现象就是「改了等于没改」——面板里既没滑杆也拖不动。`gallery`（图库）目前仍固定 `center`，未动。
- **`zoom` 支持缩小（0.25–4）。** 一度收成「只能放大」是判断错误：用户第一次试 60% 时问「上下内容怎么没了」，我以为留白没意义就把下限收到 1，用户随即明确要求要能缩小。缩小必然在图周围留白（配图块露白边框底色，图片块透出页面底色），这是 cover 基准下的必然结果，不是 bug，**不要再自作主张把下限收回去**。滑杆叫「缩放」25–400%，服务端 `num(b?.zoom, 0.25, 4, 1)`。
- ~~`zoom` 下限是 1，不给缩小。~~ 基准是 cover（刚好填满框），任何小于 1 的值都会让图比框小、四周留白，用户第一次试到 60% 就来问「上下内容怎么没了」。要看整张图是 `fit: 'contain'`（完整显示）那条路，不是缩小。滑杆 100–400%，服务端 `num(b?.zoom, 1, 4, 1)`，`croppedImageStyle` 再 `Math.max(1, …)` 夹一道，防止旧草稿里残留的小值。
- 顺手修：齿轮面板的 `fit` 下拉框原来写 `value={b.fit}`，块上没存 `fit` 时（默认版式生成的配图块就可能没有）整个下拉显示空白；改成 `value={b.fit || 'cover'}`。
- 验证：`npm test` 隔离库全过（27 + 237 + 11 + 33，0 失败）；`npm --prefix web run build` 生产构建通过。**未做真机的拖动手感、放大后拖动、旋转块拖动、缩放画布后拖动的视觉检查。**
- 部署：**已完整上线（2026-09-18，用户授权后执行）**。前端重建，`/staff` 引用 `index-CCqw8RG_.js`；Node 从 PID 72746 重启为 **PID 17262**（`scripts/start-local-server.sh`，PIN 从原进程继承，隧道未动）。重启前备份 `server/data/pre-imagecrop-deploy-2026-09-18.db`（integrity ok，17 人 / 24 事件）。重启后核对：新进程打开的确实是项目 `server/data/game.db`、`/healthz` 200、staff/admin 两个 PIN 登录角色正确、`POST /api/staff/sync` 花名册 17 人与重启前一致、库内 17 人 / 24 事件 / 5 报名不变；公网 game `/passport`、staff `/staff` 均 200。`npm test` 全过。**未做真机视觉检查，也没做保存往返的实测（没有往生产活动配置写测试数据）——posX/posY/zoom 能否真的存住要由用户在画板上保存一次确认。** 工作区改动未提交。
- **服务端没重启时的症状记一下**：画板上拖得动、看得见，一保存就回到居中原大小——`cleanBlocks` 白名单不认识的字段是静默丢弃，没有任何报错（同 9 号坑）。这次用户连着报了两次「保存又回到默认位置」才定位到。

#### 2026-09-18 · 旋转吸附到 15° 一档

- 用户反馈徒手拖旋转手柄回不到正好 0°（`round` 是 0.1 精度，肉眼对不准），并要求磁吸开关也管旋转。
- `rotateDrag` 接上已有的 `nearestSnap`：吸附开时按 `ROTATE_SNAPS`（-180..180 每 15° 一格，含 0 / ±90 / ±180）吸，容差 6°；吸附关时行为不变，仍是连续角度。
- 顺手：旋转值先绕回 -180..180 再存。服务端 `num(b?.rot, -180, 180, 0)` 是**夹住**不是绕回，不绕的话一直往一个方向转会卡死在 180。
- 验证：生产构建通过（`/staff` 引用 `index-EnoMARj8.js`，`/healthz` 200）。未做真机旋转手感检查。旋转本身是老字段，不受服务端未重启影响。

#### 2026-09-18 · 详情页提示改为按钮下方气泡

- 切换「详情页」不再调用全局 Toast，改由 Visa 页眉按钮下方显示带小尖角的纸色状态气泡，随横版纸一起旋转，文字与按钮同方向，约 3.2 秒消失。`openReview` 直达附页改为用展开后的目标索引设置页码，避免较后面活动的附页被收起态总页数截断（`PassportBook.jsx`、`PassportBookView.jsx`、`bookVals.js`）。
- 验证：隔离目录及生产 Vite 构建通过，`git diff --check` 通过。未做手机真机视觉/点击检查。
- 部署：**已执行（2026-09-18）**。仅重建生产前端；Node 未重启，仍打开项目 `server/data/game.db`。本机 `/healthz`、公网 game `/passport`、staff `/staff` 和新资源 `index-yAp5Zatk.js` 均为 200，两处公网 HTML 均引用新资源；未改数据库。

#### 2026-09-18 · 详情页状态颜色与活动回顾互斥

- 「详情页」收起态为浅色、展开态为深色填充；有附页的 Visa 首页仅在收起态显示「活动回顾」。点击回顾会展开详情页并直接定位到该活动第一张附页；已展开时回顾入口隐藏。新手引导和使用说明同步修正文案（`PassportBook.jsx`、`PassportBookView.jsx`、`bookVals.js`）。
- 验证：隔离目录和生产 Vite 构建通过，`git diff --check` 通过；未做手机真机视觉/点击检查。
- 部署：**已执行（2026-09-18）**。仅重建生产前端，Node 未重启且仍打开项目 `server/data/game.db`；本机 `/healthz`、公网 game `/passport`、staff `/staff` 与新资源 `index-DEyGmdIq.js` 均为 200，两处公网 HTML 均引用该资源。未改数据库。

#### 2026-09-18 · 详情页开关改为文字按钮

- Visa 页右上角原 ▤ 图标改成填充色「详情页」按钮；每次切换用应用内浮动提示明确显示“详情页已展开”或“详情页已收起”及对翻页的影响。新手引导、使用说明同步改用文字按钮描述。
- 验证：隔离目录 Vite 生产构建通过；差异空白检查通过。未做手机真机或浏览器视觉检查。
- 部署：**已执行（2026-09-18）**。运行 `npm --prefix web run build`，公网 game `/passport` 与 staff `/staff` 均返回 200，HTML 均引用新资源 `index-DLOt0RIe.js`，该资源和本机 `/healthz` 均返回 200。Node 服务未重启，进程仍打开项目 `server/data/game.db`；未修改数据库。未做手机真机视觉检查。

#### 2026-09-18 · Visa 附页全局展开与回顾入口

- 页表默认只装订各活动信息页，展开时才加入照片/总结附页；护照用浏览器本地开关统一控制所有活动，并在切换时按活动/页 id 重定位，收起当前附页会回到该活动首页。预取仍覆盖全部附页水印。
- Visa 横版页右上角问号左边新增 ▤ 开关；展开后有附页的 Visa 首页右下角显示「活动回顾」按钮，点它跳到该活动第一张附页。按钮固定样式在正式护照和画板预览共用，画板预览不可点。新手引导与使用说明说明开关和入口。
- 验证：隔离目录 Vite 生产构建通过；页表开/关映射检查（2 场、3 张附页）通过；差异空白检查通过。未做手机真机或浏览器视觉检查。
- 部署：**已执行（2026-09-18）**。只运行生产前端构建，Node 仍为原进程（未重启）、仍打开项目 `server/data/game.db`；公网 game/staff 均 200，护照页引用新 bundle `index-CyoFR6Dg.js` 且资源 200，`/healthz` 200。部署后数据库完整性检查 ok、当前用户 17 人 / 活动 4 场；本次没有写数据库，不把它与前一日的 5 场历史计数当作本次变化。未做手机真机视觉检查。

#### 2026-09-17 · 报名页直达 Visa 与管理员撤销签到

- `Join.jsx` 的已登录「打开我的护照」带 `?activity=<id>`，复用 `PassportBook.jsx` 已有的活动深链；标签不符时仍打开普通护照，避免回跳循环。
- 活动详情已签到行、总控台用户详情已参加行增加「撤销签到」按钮与确认；仅管理员能用。`server/src/index.js` 新增精确到活动/用户的 DELETE 接口；`schema.sql` 新增 `revoked_events`，`db.js` 快照纳入撤销审计，`game.js` 拒绝已撤销 opId 重放。报名记录不变，撤销后可重新签到。旧的「撤不掉」文案同步改掉。
- 验证：`npm test` 隔离库全过（新增普通同工拒绝、管理员撤销、分数/章消失、离线重放拒绝、再次签到）；隔离目录 Vite 构建通过；`git diff --check` 通过。未做手机或浏览器视觉测试。
- 部署：**已执行（2026-09-17 22:53 Europe/London）**。重启前将正式库备份为 `server/data/pre-checkin-deploy-2026-09-17T22-52.db`，备份 `integrity_check=ok`，17 用户 / 32 事件 / 4 报名 / 10 素材 / 5 活动与原库一致。原服务 PID 59793 打开的确是项目 `server/data/game.db`；从该进程继承原 PIN 并先核对 staff/admin 登录角色，再只重启 Node 为 PID 72746（隧道未动），启动脚本强制正式库绝对路径及已有库守卫。新进程 `lsof`、`/healthz`、PIN 登录都正确，新 `revoked_events` 表存在且为空；最终计数不变。随后生产 `npm --prefix web run build` 成功，公网 game/staff 均 200，护照页引用 `index-BStPUQwo.js` 且资源 200；新撤销接口用不存在的目标探测，staff 403、admin 404，没有改真实签到。未做真机视觉检查。部署脚本第一次误探 `/api/health`（实际是 `/healthz`）报告超时，但新服务已正常启动；按正确路径复核后确认不是服务故障。

**2026-09-17 冗余清理（用户要求「都清理掉吧，v1水印图也删」）** —— 已提交推送（`6feefd6` 用户的水印/签到页锁/启动守卫，`562a43d` 清理），已构建前端并重启 node 上线：重启前备份 `server/data/pre-cleanup-restart-2026-09-17.db`；新进程经 `scripts/start-local-server.sh` 启动、打开的是项目 `server/data/game.db`，推送公钥指纹不变，管理员登录正常，`/api/staff/sync` 花名册 17 人、活动 4 场，game/staff/city 三个公网入口正常，隧道未动。
- 删除：`web/src/components/RowEditor.jsx`（无引用）、`server/seed.mjs` 与 `npm run seed`、`render.yaml`、`scripts/tunnel.sh`、v1 水印 `web/public/wm/{central-station,necropolis,peoples-palace}.png` 及 `design/wm/src/` 同名原图、16 份旧 `server/data/pre-*.db` 快照（保留 `pre-start-guard-2026-09-17.db`、`pre-share-gate-2026-09-17T14-06-55.db`、`pre-deeplink-2026-09-15T17-03-25.db`）。
- 服务端行为：`getActivities` 空数组不再回填 6 个出厂活动（只有设置里根本没有活动清单时才用 `config.js` 的 `ACTIVITIES`）；`MLG_REQUIRE_EXISTING_DB` 守卫改为「至少 1 个用户 + 活动清单是数组（可空）」；启动清理旧设置加入 `registrationOpen`。排行榜隐藏时的响应去掉 `teams`。这些**需要重启 node 才生效**。
- 死注释/死代码：`game.js` 未用 import 与旧关卡注释；`index.js` 排路线注释；`VisaBlocks.jsx` 的 `identity`/`team` 栏目分支；`PassportBook.jsx` 盲盒/游戏注释；`styles.css` 抽卡动画与组队排行榜样式注释；`test-flow.mjs` setup 去掉旧字段；`fly.toml` PIN 注释改为 secrets 用法；`generated-to-watermark.py` 只处理 v2 三张。
- 文档：README 全文重写为当前打卡护照（去掉游戏手册、seed、Render/tunnel.sh、抽卡/组队 API；水印改为 `visaWatermark.js` 14 张）。
- 验证：`npm test` 全过（迁移 27、流程 232、并发 11、只读 33）；隔离目录 `vite build` 成功后删除。未做真机测试。


#### 2026-09-17 · 新版水印在 Visa 页占更大空间

- 用户澄清「适当缩放」是要水印在 Visa 页面占更多空间。新增 `visaWatermarkPlacement` 共用布局：3 张 `-v2` 的显示框宽度由 40% 提升到 72%（上下也加大），画板预览与正式护照一致；旧 11 张及非 Visa 页的固定水印布局不变。图片素材本身及云朵保持不变。
- 验证：布局函数检查、`git diff --check`、生产 `npm --prefix web run build` 均通过；公网 `/passport` 已引用新 bundle `index-aRvbvBRF.js`。未做真机视觉检查；服务端与数据库未改、未重启。

#### 2026-09-17 · 新增水印缩小并补云朵

- 用内置图像生成工具以 `design/wm/src/grid.png` 为风格参考，分别编辑新增的中央车站、人民宫、墓园原图：主体缩小约三分之一，周围留透明空白并加入简洁轮廓云；v2 源图在 `design/wm/src/*-v2.png`。`design/wm/generated-to-watermark.py` 对 v2 不再自动裁透明边，否则会把主体放大回去；酒红色 PNG8 在 `web/public/wm/*-v2.png`（三张合计约 148KB）。
- `web/src/lib/visaWatermark.js` 候选池改用 v2 文件名，v1 文件保留但不再引用；用户缓存中的旧图不会盖掉新版。14 张候选路径校验通过，隔离构建通过；生产 `npm run build` 后公网护照页引用新 bundle，三张 v2 水印 URL 均为 200。未做真机视觉检查；服务端和数据库未改。

#### 2026-09-17 · Visa 每页格拉斯哥地标水印

- 用内置图像生成工具，以 `design/wm/src/grid.png` 为风格参考，新增中央车站、人民宫、墓园 3 张透明插画原图到 `design/wm/src/`；`design/wm/generated-to-watermark.py` 将它们压成与旧素材相同的酒红色透明 PNG8，产物在 `web/public/wm/`。现共 14 张候选。生成图是风格化插画，并非建筑测绘图。
- `web/src/lib/visaWatermark.js` 按活动 id + 页 id 稳定选图，既用于 `bookVals.js` 正式护照，也用于 `VisaPageFrame.jsx` 画板预览；`ActivityDesign.jsx` 传入当前页 id。`PassportBook.jsx` 空闲时只预取本人的页面实际用到的水印。旧活动数据里的 `landmarkKey` 保留但不再决定 Visa 水印。
- 验证：14 个候选文件齐全；样例信息页/附加页映射到不同图且重复调用稳定；隔离构建与生产 `npm run build` 均通过。公网护照页引用新 JS，三张新水印 URL 均返回 200。未做真机视觉检查；服务端与数据库未改。

#### 2026-09-17 · 护照二维码提示与可见活动进度

- `PassportBookView.jsx`：导航/活动介绍页移除大号「MEMBER CODE 同工扫码盖章」区和原进度条；使用说明的「两种二维码」说明底部增加靠右、可点击放大的个人护照码提示；参与记录顶部显示「已参加x/x场活动」和进度条（不写 VISAS、可见活动）。各页固定的页脚/右下角护照码仍保留。
- `bookVals.js`：VISAS 分子改为当前可见活动中已有参与章的场数，分母仍为可见活动数；首次/最近章日期也只取当前可见活动。页眉与身份页 MRZ 中标为 VISAS 的数字改用同一场数，不再误把积分当签证数。历史章仍在数据中，不删除。
- 验证：隔离前端构建通过；用含隐藏历史章的样例调用 `buildVals` 得到 1/2、50%、页眉 01；`npm run build` 已写入线上 `web/dist`，公网护照页引用新 bundle、健康 200。未做真机视觉/点击检查；服务端和数据库未改。
- 文案跟进：按用户要求将参与记录的进度文字精确改为「已参加x/x场活动」；重新构建并确认公网护照页引用新 JS。统计口径不变，未做真机视觉检查。

#### 2026-09-17 · 报名页隐藏底部护照/徽章导航

- `web/src/App.jsx` 的 `BottomNav` 对 `/join/:id` 不再渲染底栏「护照 / 徽章」。报名卡片里按状态提供的报名、领/找回护照以及「打开我的护照」操作保留。
- `npm run build` 通过并写入线上读取的 `web/dist`；公网报名页引用新 JS bundle，健康检查 200。仅前端更新，服务端和数据库未改；未做真机视觉点击检查。

#### 2026-09-17 · 报名码弹层直接打开链接；Visa 内容差异排查

- `VisaBlocks.jsx` 报名二维码弹层增加「直接打开报名页」链接，复用二维码本身的 `joinUrl`；`styles.css` 将其放在分享、复制按钮上方。活动开始后隐藏二维码的规则不变。
- 只读排查 Visa 与总控台差异：参与者和画板均用 `resolveBlocks` 渲染已存 `activity.blocks`，画板修改须点保存后经 `/api/admin/activities` 整份写入；参与者配置先读本机缓存，再从 `/api/config` 更新，断网时可能暂显旧内容。当前线上 4 场活动中两场 `done`、两场 `upcoming`；所有附加页的 `requireCheckin` 当前均未开启，因此现有活动不存在该开关导致的锁页。两场已结束活动对未签到者会按新规则灰置并标「未参加」。用户尚未说明具体哪场、哪项内容不同，无法仅凭服务器数据确定设备上看到的差异；未改活动数据。
- 验证与部署：先在隔离 `/private/tmp/mlg-visa-link-check` 构建通过；随后应用户反馈，`npm run build` 写入生产 `web/dist`。公网首页引用新 JS/CSS 资源，公网 JS 内已包含「直接打开报名页」，健康检查 200。后端未重启、数据库未改。未做真机视觉/点击检查；PWA 若仍用旧缓存，需关闭后重新打开或刷新。

#### 2026-09-17 · 防止本机服务误连空库

- 根因：上次人工重启沿用错误的 `MLG_DATA_DIR`；原服务允许在不存在的目录自动建库，HTTP 健康仍成功。现在 `scripts/start-local-server.sh` 固定项目 `server/data` 的绝对路径并设置生产校验开关；根目录 `npm start`、`scripts/tunnel.sh` 改走这个脚本。`server/src/db.js` 在保护模式下先用只读连接核对已有数据库、非空用户/活动、`quick_check`，失败即退出，且不会创建缺失目录。
- 验证：隔离副本上错目录被拒且未建目录、空库被拒、有效库通过；`npm test` 全部通过（首次沙箱无端口权限失败，获准运行后通过）。
- 部署：重启前备份 `server/data/pre-start-guard-2026-09-17.db`（`integrity_check=ok`，17 用户、4 活动）；已用受保护脚本重启本机服务。实际打开路径由 `lsof` 确认为项目 `server/data/game.db`；管理员登录后的只读同步返回 17 用户，公网活动接口 4 场，game/staff 健康均为 200。未修改活动或用户数据；容器部署未改、未验证。

#### 2026-09-17 · 活动数据反馈排查（只读）

- 用户反馈纠正空库后「活动数据也不对」。只读核对当前进程仍打开项目 `server/data/game.db`；本地当前库、部署前 `pre-share-gate-2026-09-17T14-06-55.db`、9 月 15 日 `pre-deeplink` 备份的 `_activities` 哈希一致，均为 4 场。公网 `/api/config` 也返回 4 场（2 场 done、2 场 upcoming）。错误目录里的空库为 6 场出厂默认活动、0 用户；未将其数据写回原库。
- 尚未确定用户所指的是场次、状态、详情内容、排序、报名数还是个人可见范围；未修改活动配置或恢复备份，待用户指出具体异常再定位。

#### 2026-09-17 · 活动分享页按签到可见、已结束未参加状态

- `ActivityDesign.jsx` 的每张附加照片/总结页加「仅已签到的人可看」开关，随撤销/重做和保存一起存；`server/src/index.js` 清洗为布尔值，旧页缺省公开。
- `bookVals.js` / `PassportBookView.jsx`：未盖章且开关开启时不渲染该页块，只显示锁定说明；活动 `done` 且本人未盖章时，信息页正文灰置、标「未参加」。报名二维码的 `upcoming` 可见、`live/done` 隐藏逻辑保持原样。
- 验证：`npm run build` 通过，`npm test` 303/303（迁移 27、流程 232、并发 11、只读 33）；新增服务端测试覆盖逐页开关保存及旧页默认公开。未做真机触摸/视觉检查。
- 部署与故障纠正：先备份项目内 SQLite 到 `server/data/pre-share-gate-2026-09-17T14-06-55.db`（完整性正常，17 位用户）。第一次重启时错误沿用 `MLG_DATA_DIR=/Users/claio/Desktop/Code/claude`，服务实际打开了该目录中新建的空库；当时只检查了项目内原库和 HTTP 健康，错误报告了部署成功，用户页面因此短暂显示为空。收到反馈后确认原库与备份均有 17 位用户，未被删除；重启为项目 `server/data` 的绝对路径（PID 39846）。`lsof` 已确认进程打开项目内 `game.db`；已登录的 `/api/staff/sync` 返回完整 17 位花名册；本机及 game/staff 公网健康均为 200。另一份空库未清理或覆盖。未修改生产活动配置，也未做真机视觉检查。强保密未实现，公开配置和图片直链仍可访问。

#### 2026-09-15 · 修手机上护照下沿出现白边

- 问题（用户手机反馈）：护照页下沿多出一条白色边框。原因是上一轮「护照配色全局应用到参与者端」把 body 的底色 `--ink` 换成了纸色，护照册自己盖着黑底，但 iPhone 底部 Home 条那一截和 Safari 工具栏后面露的是 html/body 底色。
- 改动（`styles.css`）：护照页挂载期间的 `html.book-locked` 与其 body 背景固定为 `#000`；报名页、徽章页等其他参与者页面仍是纸色。
- 验证：隔离实例 3231 手机尺寸浏览器——`/passport` 的 html、body 背景均为 rgb(0,0,0)；跳到报名页后 book-locked 撤掉、body 为纸色；从报名页「打开我的护照」回来又是黑色。Chromium 模拟不出 iPhone 底部安全区，**真机未确认**。
- 部署：已执行，仅前端构建到 `web/dist`，线上 bundle 与本地一致、CSS 含新规则；服务端未改未重启。

#### 2026-09-15 · 点活动通知直接定位到护照里的签证页

- 需求：通知点开要快速定位到对应活动页，而不是跳到报名页。
- 改动：服务端通知链接改为 `/passport?activity=<id>&from=push`（`index.js`）。`PassportBook.jsx` 读到参数先存 `sessionStorage` 的 `mlg.deepActivity`（刚打开时护照资料未载入，本页会先跳首页、首页再送回 /passport，参数在这一来一回里丢失——实测第一次打开停在封面），等护照资料和活动配置都到了再定位到该活动第一张签证页、记 `notif_open`、去掉地址参数；这次不自动弹新手引导。活动在本人护照里看不到（按标签发给全部人等）时退回 `/join/:id?from=push`。`App.jsx` 的 `PlayerRoute` 没登录时带着活动参数去报名页而不是首页。旧通知里的 `/join/...?from=push` 链接照旧可用。
- 验证：`npm test` 302/302。隔离实例 3230 浏览器（手机尺寸）四种情况：清掉 IndexedDB 与本机缓存后第一次打开对所有人可见的活动 → 直接落在该活动签证页、地址参数已去掉、未弹引导、记了 notif_open；有缓存时打开另一场 → 落在该场签证页；同工专属活动（参与者看不到）→ 报名页；完全未登录 → 报名页。先后发现并修掉两个时序问题（参数在重定向中丢失、活动配置未到就判定看不到）。系统通知真实点击（Service Worker 打开窗口）未在真机验证。
- **部署：已执行。** 备份 `server/data/pre-deeplink-*.db`（integrity_check=ok）；只重启 node，环境变量逐一相同、推送公钥未变、计数一致、隧道未动、启动日志无报错；前端构建后线上 bundle 与本地一致并含新逻辑。

#### 2026-09-15 · 签证页移除默认地标水印

- 需求：有些签证页还带着默认水印，移除。原因是出厂那几场活动带 `landmarkKey`（格拉斯哥地标图），同工新建的活动没有，于是有的签证页有底纹、有的没有（线上是迎新之夜和 City Walk 两场有）。
- 改动：`bookVals.js` 签证页 `landmarkKey` 一律为 null（欢迎/导航/资料页和说明、排行浮层的 3 张水印照旧）；`VisaPageFrame.jsx`（护照与画板共用的签证页框）删掉地标水印层；`PassportBook.jsx` 不再预取活动地标图。活动数据里的 `landmarkKey` 保留未删，只是不再渲染。
- 验证：隔离实例 3229（出厂 6 场都带 landmarkKey）桌面浏览器——资料页仍有 university 水印；两张签证页无任何 `/wm/` 背景；页面只请求了 cathedral / university / wellington 三张水印图；画板里签证页也无水印。未做真机检查。
- 部署：已执行，仅前端构建到 `web/dist`，线上 bundle 与本地一致；服务端未改未重启。

#### 2026-09-15 · 护照配色全局应用到参与者端；报名码在报名截止后自动隐藏

- 需求：①护照主题色要全局应用，新加的页面/弹层都没跟用户选的配色；②签证页的扫码报名在活动结束后自动关闭。
- 配色（新增 `web/src/lib/passportScreen.js`）：`App.jsx` 的 `PassportScreenTheme` 在所有非 `/staff` 路由把变量挂到 `<html>`——基础色 `--ink/--gold/--text…` 换成纸色底和护照主色（`.card/.btn/.sheet/输入框` 自动跟上），同时挂 `--pp-*`，挂在 body 上的弹层（报名码分享面板、图库大图）直接读到；加 `html.pp-themed` / `paper-screen`。只在有登录令牌时用本人配色，否则用全局默认。原来徽章页自己挂这套，已删掉它自己的 effect（两处各挂各撤会把全局类撤掉）。`styles.css` 补 `html.pp-themed` 下的主按钮文字（纸色，原来写死深棕字在深色底上看不清）、提示条、弹层遮罩、图库底色。报名码中间徽章从块上读 `--pp-ink/--pp-gold` 画（`activityQr.js` 接收颜色，缓存键含颜色）。
- 报名码自动隐藏：`blockData` 带 `activityState`；`QrBody` 在活动不是「还没到」（进行中=报名截止、已办完）时护照上不渲染、不生成码；画板里照样画出但变淡并写「报名截止后自动隐藏」；属性面板说明规则。
- 验证：隔离实例 3228 设一套深蓝配色的测试参与者，浏览器量计算样式——报名页底色/正文/主按钮（纸色字、深蓝渐变）跟配色；报名码分享面板卡片纸色、标题与主按钮深蓝、遮罩深蓝半透明；复制后提示条深蓝底纸色字；上传弹层纸色；进出徽章页后全局配色仍在；清掉登录令牌后领护照页回到全局默认主色；同工总控台不挂任何变量、保持深色。活动改为已办完后该场签证页不再有报名码，另一场照常显示且码中心徽章像素为主题深蓝；画板中该块透明度 0.45 并有提示。未做真机检查。
- **线上效果提醒**：部署时线上 4 场里 2 场「已办完」（报名码自动隐藏），另外 2 场「还没到」照常显示报名码。
- 部署：已执行，仅前端构建到 `web/dist`，线上 bundle 与本地一致并含新逻辑和样式；服务端未改未重启。

#### 2026-09-15 · 总控台用户列表手机上出现两根滚动条

- 问题：用户列表（`.list-cap`，右侧有 `ScrollRail` 自画滑杆）在手机上滚动时，系统又浮出一根细滚动条，界面上两根并排。原来只靠 `::-webkit-scrollbar { width: 0 }` 隐藏，iPhone Safari 不认。
- 改动（`styles.css`）：`.list-cap` 加 `scrollbar-width: none` 与 `::-webkit-scrollbar { display: none }`；再用裁剪兜底——`.list-cap` 向右伸出 14px（`margin-right: -14px`、`padding-right` 8→22px），外层 `.list-scroll` 加 `overflow: hidden` 把伸出的一截（系统条画在那里）裁掉，内容位置不变，自画滑杆在外层里照常显示。签证页长文字块 `.scroll-box__body` 同样补 `scrollbar-width: none`（未加裁剪）。
- 验证：隔离实例 3228、25 个用户，浏览器量尺寸——手机 390 宽：外层 overflow hidden、列表向右伸出 14px、卡片离可见边缘 8px（与改前一致）、自画滑杆显示在外层内、原生滚动条宽 0、无横向溢出；电脑 1280 宽两列、间距一致。Chromium 模拟不出 iOS 浮动滚动条，**真机未确认**。
- 部署：已执行，仅前端构建到 `web/dist`，线上 bundle 与本地一致；服务端未改未重启。

#### 2026-09-15 · 总控台活动清单：搜索、筛选、排序、限高滚动

- 需求：活动一直新增，清单会越来越长；加筛选和排序，应对十几场以上。
- 改动（`Admin.jsx`、`styles.css`）：清单上方加工具条——搜索（活动名/类型/负责人/日期）、排序（护照顺序、日期新→旧/旧→新、报名人数、盖章人数、名称；日期待定始终排最后）、按可见范围筛（所有人可见 / 报名可见 / 各标签）、状态胶囊（全部 / 未结束 / 还没到 / 进行中 / 已办完，带数量）；显示「n / 总数」和重置；筛完为空给「清除筛选」。列表 `max-height: min(64vh, 660px)` 内部滚动。状态、可见范围、排序存本机 `localStorage` 的 `mlg.admin.activityView.v1`，搜索词不存；记住的标签被删除时当作不筛。
- **拖动排序只在「护照顺序」且无任何筛选时可用**：拖动逻辑按整份清单的下标换位，在筛过或重排的列表里拖会换错护照装订顺序，所以其它情况下拖动柄禁用并提示。
- 验证：隔离实例 3227、14 场测试活动浏览器检查——默认 14 场可滚动、可拖；「未结束」10 场且拖动禁用；搜「祷告」1 场；日期新→旧顺序正确、待定在后；按「同工」标签 2 场；组合筛选为空显示提示，清除后恢复 14 场并可拖；刷新后排序保持、搜索清空；手机 390 宽搜索整行、两个下拉并排、无横向溢出。未做真机检查。
- 部署：已执行，仅前端构建到 `web/dist`，线上 bundle 与本地一致并含新逻辑和样式；服务端未改未重启。

#### 2026-09-15 · 活动详情页顶部在手机上重新排版

- 问题（用户手机截图）：窄屏时「← 总控台 + 活动名」一行，下面「设计这一页 / 保存 / 删除」换行后靠右挂着、宽窄不一；另外可见范围说明里直接露出 `**命中任一**` 的星号。
- 改动：`ActivityDetail.jsx` 顶部改用 `.detail-head` 结构（去掉内联布局），`styles.css` 新增 `.detail-head*`：宽屏标题在左、按钮在右；≤640px 时按钮单独一行、三等分（设计按钮略宽）铺满，与下面卡片左右对齐，标题字号 `clamp(22px, 5.4vw, 34px)` 并省略号截断。说明文案星号改为 `<b>`。
- 验证：隔离实例 3226 浏览器量尺寸——390 宽按钮行 16→374px 与卡片 16→374px 对齐、按钮文字无截断；375 宽同样对齐；1280 宽标题与按钮同一行。加粗文案所在的「仅指定标签」提示在测试活动上未显示，未截图（页面已无 `**`）。未做真机检查。
- 部署：已执行，仅前端构建到 `web/dist`，线上 bundle 与本地一致、CSS 含新规则；服务端未改未重启。

#### 2026-09-15 · 活动报名码分享、保存后问推送、添加到桌面与通知引导、横转竖字号

- 需求（一条消息里的五件事 + 追加一件）：①画布加「活动报名二维码」块并进默认模版，参与者在签证页分享给别人报名，码中间放特别图标；②活动页手动保存后主动问要不要推送；③统计里的「访客」是谁；④引导按 iOS/安卓教添加到桌面；⑤第一次看引导就问要不要开通知；⑥横屏再竖屏字号变大不恢复。
- 服务端：`BLOCK_KINDS` 加 `qr`（只存 icon/label，强制不挂外链）；`USAGE_EVENTS` 加 `qr_open`、`qr_share`、`share_visit`、`install`；`/api/admin/usage` 的活动行加 `shareVisits`。`test-flow.mjs` 第 22 节加报名码块保存检查。
- 前端：新增 `lib/activityQr.js`、`lib/install.js`；`VisaBlocks.jsx` 的 `QrBody`（小码 + 分享面板）；`bookVals.js` 默认版式按栏目行数放报名码、`blockData` 带 `joinUrl`、使用说明末条按系统写添加到桌面；`ActivityDesign.jsx` 新增块和属性面板、保存后问推送并跳 `#notify`；`ActivityDetail.jsx` 手动保存后问推送、推送卡片可定位；`Tour.jsx` 支持 `step.action` / `step.nextLabel`；`PassportBook.jsx` 引导加添加到桌面一步、通知一步带开启按钮、第一次引导后主动问；`Join.jsx` 记 `?from=share`；`Usage.jsx`「访客」改名「未登录的人」并加「其中扫分享码」列；`styles.css` 报名码块与面板样式、`text-size-adjust: 100%`。
- 验证：`npm test` 302/302（迁移 27、流程 231、并发 11、只读 33）。node 里用 jsQR 对盖上徽章的码实测（3 种 id 长度 × 360/900px）全部解码成功。隔离实例 3224 浏览器（安卓 UA 手机尺寸）：签证页报名码可点、分享面板显示活动图标徽章，浏览器 BarcodeDetector 解出 `…/join/freshers?from=share`，复制链接有提示并记 `qr_open`/`qr_share`，关闭不误翻页；默认位置与栏目重叠 0（先测出贴边 1px，已下移 1%）；引导第 2 步显示安卓教程，模拟安装事件后「一键添加到桌面」可用并记 `install`；通知一步有「开启通知 / 以后再说」（预览浏览器通知权限默认拒绝，用替身对象验证），跳过后弹「要打开活动通知吗？」且只问一次；画板保存后问推送，「去写通知」跳到 `#notify` 并聚焦标题；活动页手动保存问、自动保存不问。**未验证**：真机 iPhone 的字号修复、真实权限弹窗与系统分享面板、iOS 教程步骤实机截图、使用说明浮层第 7 条的截图（入口不在当前护照页上，逻辑与引导共用平台判断）。
- **部署：已执行（2026-09-15 14:57）。** 备份 `server/data/pre-qr-2026-09-15T14-56-51.db`（integrity_check=ok）；工作区核对只有本次 15 个文件；只重启 node，环境变量逐一相同、推送公钥未变、各表计数前后一致、隧道 PID 未变、启动日志无报错；前端构建后线上 bundle 与本地一致且含新功能；curl：game 200、staff 302、city 200；staff 域名下发的 `shareOrigin` 为 game 域名。
- **线上数据变更：已执行（2026-09-15 15:04，用户确认「你添加进去」）。** 线上 4 场活动都已排过版，不会自动出现报名码，所以直接在 `settings._activities` 里给每场首页 `blocks` 末尾追加一个 `qr` 块（id `qr`，icon 空、label「扫码报名」），其余字段逐场比对确认完全不变。位置按各场现有版式避让：两场放栏目最后一行右侧空格 `x31 y62.6 w20 h16`；有 -8.8° 斜放大图的那场收窄为 `w18`（按旋转后边缘计算留出约 2% 空隙）；栏目上移且右格有图标的那场放左列下方 `x4.5 y69 w20 h16`。先在线上库的本地副本上跑同一脚本并在画板里逐场截图、检测无文字重叠，副本随后删除。写入前备份 `server/data/pre-qr-blocks-2026-09-15T15-03-57.db`（integrity_check=ok）。服务端每次从库里读活动配置，无需重启；线上 `/api/config` 已读到 4 个 qr 块。没有广播 config，已经开着护照的人重新打开后才看到。**注意：如果有同工开着旧的活动编辑页直接保存，整份替换可能把这个块覆盖掉。**

#### 2026-09-15 · 手机上竖版页铺满屏幕

- 需求：封面、欢迎、导航、结语、说明/排行浮层这些竖版页在手机上也全屏平铺，其余保持一致。
- 实际问题：竖屏手机本来就铺满；**横着拿手机**时竖版页固定 430px 宽居中，两侧各约 200px 黑边，而横版签证页是铺满的。
- 改动：`bookVals.js` 的 `stageMax` 改读 `--book-portrait-max`（默认 430px）；`styles.css` 在手机尺寸（短边 ≤ 540px）设为 100%。铺宽后封面的百分比外边距把下半截挤出屏幕，给 `PassportBookView.jsx` 封面加 `.pp-cover*` 类，仅横屏手机按 `cqh` 收紧（见注意点 29）。
- 验证：隔离实例 3224 浏览器量尺寸——844×390 与 932×430 舞台满屏，封面徽章保持圆形、「轻触翻开」在屏幕内；欢迎、导航、结语、排行浮层、身份资料页和新手引导横屏正常；竖屏 390×844 封面尺寸与改前逐像素一致；电脑 1280×800 仍为居中 430px。「使用说明」浮层两次都没点开（翻页动画中），与排行浮层共用同一舞台，未单独截图。未做真机检查。
- 部署：已执行，前端构建到 `web/dist`，线上 bundle 与本地一致并含新样式；服务端未改、未重启。

#### 2026-09-15 · 自建使用情况统计（保留半年）

- 需求：想知道每天多少人在用、点了什么。用户选择自建、原始记录保留半年。身份口径是助手的默认（用户未另行指定）：登录的人记护照 id，没登录的记随机设备号；不记 IP、位置、UA 和任何填写内容。
- 服务端：`schema.sql` 新表 `usage_events`；新模块 `server/src/usage.js`；`index.js` 加 `POST /api/t`、`GET /api/admin/usage`，启动时和每 6 小时删除 180 天前的记录；发通知时记 `notif_sent`，通知链接改为 `/join/:id?from=push`。
- 前端：`lib/track.js`；`App.jsx` 路由级埋点与 `/staff/admin/usage`；埋点接入 `PassportBook`（翻页/签证页/排名榜/说明/护照码/自定义/上传/引导）、`Join`（报名页、报名/取消、点开通知后去掉参数）、`Register`（领取/找回/领完顺手报名）、`push.js`（开/关通知）、`Badge`（分享/保存）。`Admin.jsx` 页头「📈 使用情况」；`Usage.jsx` 报表：7/30/90/180 天范围、4 个指标、每日活跃叠加柱状图（可切表格）、每日操作次数、功能排行、活动转化表。`bookVals.js` 使用说明加第 6 条隐私说明。图表蓝 `#3987e5` / 橙 `#d95926` 在面板底色上通过调色板校验。
- 验证：`npm test` 301/301（迁移 27、流程 230、并发 11、只读 33；流程第 30 节覆盖白名单、去重口径、鉴权、单批上限、删人后置空）。隔离库冒烟：英国时区分天与夏令时切换、180 天清理、各范围日期连续、单设备限流、表里无 IP/UA 列。隔离实例 3223 + 示例数据浏览器检查：桌面与手机竖屏报表布局、悬停提示、叠加柱缝隙、表格横向滚动、总控台入口按钮；真实前端链路（`?from=push` 进报名页 → 护照）入库数与期望逐项一致。未做真机检查。
- **部署：已执行（2026-09-15 12:19）。** 备份 `server/data/pre-usage-2026-09-15T12-19-41.db`（integrity_check=ok）。只重启 node：四个环境变量从旧进程带过去并逐一核对相同，推送公钥未变，各表计数重启前后一致，两条隧道 PID 未变，启动日志无报错；前端构建后线上 bundle 与本地一致。curl 复核 game 200、staff 302、city 200，`POST /api/t` 空批次 200，`/api/admin/usage` 无令牌 401。上线时 `usage_events` 0 行。
- 提交：按用户要求和照片图库分成两个提交并推送。推送前把图库那组改动里 7 处管理员默认值恢复为原开发值（线上 PIN 由环境变量提供，不受影响）。
- 下一步：过几天回看数据是否合理；可选扩展是按标签看活跃、导出 CSV。

#### 2026-09-15 · 照片页多图图库与对应画板编辑

- 需求：照片分享页在照片很多时仍能方便看完，并在编辑画板提供对应编辑能力。
- 参与者端（`VisaBlocks.jsx`、`styles.css`）：新增 `gallery` 共用画布块。护照页先按设置显示 1–8 张精选缩略图，最后一格标出剩余数量，并提供「查看全部 n 张」；完整相册是脱离旋转书页的全屏网格，点图进入大图，可前后切换、回到缩略图、关闭，键盘支持 Esc/左右键。图库仅自身接收点击，其余区域仍可翻页。
- 画板（`ActivityDesign.jsx`）：新建照片页默认使用图库；也可从 palette 新增图库。可从设备一次选多张（逐张上传、部分失败保留成功项），或在参与者素材库连续把照片加入当前图库；属性面板可调首屏张数、每行列数、上/下排序与移除。原有自由摆放单张图片保留。
- 服务端（`index.js`）：块白名单加入 `gallery`；最多保留 100 张，经既有 `safePhoto` 逐张过滤；首屏数量收进 1–8、列数收进 2–4，图库不接受外链跳转。`test-flow.mjs` 增加保存、危险地址过滤和范围收敛回归。
- 验证：`npm run build` 通过；`npm test` 286/286（迁移 27、流程 215、并发 11、只读 33）。隔离端口 3227、临时空库浏览器验证：桌面画板能创建图库并显示多图上传/精选/列数/排序/移除控件；参与者端精选区显示 `+6` 与「查看全部 12 张」，全屏网格、大图前后切换和返回缩略图正常；手机竖屏 390×844 检查网格与大图布局正常。测试只用临时数据，实例已停止；未做真机触摸验证。
- **部署：已执行（2026-09-15 12:00–12:07）。** 重启前备份 `server/data/pre-gallery-2026-09-15T12-00-20.db`；`npm run build` 通过，线上 bundle 含「查看全部」。按监听 3000 精确停止旧 Node，具名 `gcgcm-life-game` 隧道保持原 PID。第一次用普通 `nohup` 启动的子进程在命令结束后被运行环境回收，game/staff 短暂 502；随即改用 `subprocess.Popen(..., start_new_session=True)` 独立启动并恢复。
  - **认证事故与修复：**旧进程的生产 PIN 只在进程环境里，退出后无法再取；错误地从数据库 `_adminPin` 恢复成开发默认值，导致总控台密码从用户设定的值变回默认。12:07 按用户确认把 `_adminPin` 持久更新为用户设定的值，并以对应的 `ADMIN_PIN` 重启；验证新 PIN → admin、旧开发默认值 → PIN 不正确，工作人员原 PIN 仍返回 `staff`。修复前另备份 `server/data/pre-adminpin-fix-2026-09-15T12-07-00.db`。以后重启前必须在旧进程仍存活时保存所有生产环境值，绝不能用数据库 fallback 猜生产 PIN。
  - 最终 game/staff/city 均 200，数据库 `integrity_check=ok`；期间新增了一条真实参与记录，最终计数为用户 15 / 事件 30 / 报名 3 / 素材 10 / 标签 1 / 挂载 11 / 订阅 1。重启时工作区已有另一任务尚未提交的 `schema.sql` 使用统计表修改，因此启动迁移创建了空的 `usage_events` 表（0 行）；未覆盖或继续修改那组工作。

#### 2026-09-13 · 可滚文本块、图标块、两个静默失败的修复

- 变化（`4698244` → `f2b56fd`，共 8 笔）：
  - 人员面板加搜索（名字/编号/联系方式）、改名「用户」、列表封高、联系方式与护照姓名单独成栏并可点复制、弹层改左上角返回。
  - 活动拖拽重写：整个过程不动数组，只改 transform，松手才提交；被拖的行跟手，越过半行才让位。原来「碰到就换位」会在边界上来回抖。
  - 画布：点进文字时光标落到文末（程序聚焦 contentEditable 默认在最前面）；新增可配链接、可调大小的「图标」块；文字块和备注块装不下就能滚，右边一根滑杆示意。
  - 服务端：保存活动时递增纪元；`BLOCK_KINDS` 增加 `'icon'`。
- 验证：`node run-tests.mjs` 215/215 通过（迁移 27、流程 144、并发 11、只读 33）。前端 `vite build` 通过。用线上库副本在隔离端口 3210 上逐项手测：搜索三种字段、滑杆比例与到底态、拖拽换位时机（0.2/0.45/0.55 行不动，0.9 行让一格）、光标位置（敲字落在文末、进入编辑后仍可点中间改）、图标块存取与 `javascript:` 链接被清空、可滚文本块的让道只在溢出时生效。剪贴板真实路径无法在无焦点的浏览器面板里验证，改用替换 `navigator.clipboard` 的行为测试。
- 部署：**已执行**。线上服务于 13:58 重启（此前跑的是 00:20 的旧进程，两处服务端修复都没生效）。重启前完整备份到 `server/data/pre-restart-*.db`。两个域名、两个 PIN、13 名用户数据均已复核。
- 追加（同日）：签证页竖屏下滚不动 —— 整页 `rotate(90deg)` 把块内滚动映射成了屏幕横向。补 `useCrossAxisScroll`（见注意点 11）。
  - 第一版只挂了 pointer 处理器，脚本测试通过但**真手指下仍然滚不动**：缺 `touch-action: none`，浏览器把手势判给自己并发 `pointercancel`。
  - 补上之后横屏回归：`touch-action` 留在 `none` 不撤，处理器照样插手，原生惯性滚动被废。原因是转屏时 `sync()` 没机会重跑。改为 `resize`/`orientationchange` 各触发一轮（当场 + 下一帧 + 250ms），并在 `pointerdown` 里重算。
  - 验证（隔离端口 3210，线上库副本，同一个未重挂载的 DOM 节点上来回转屏）：竖屏 `touch-action: none`、判定已旋转，`scrollTop` 60 起，竖划上推 40 → 100、下拉 40 → 20、横划右推 40 → 100、左推 40 → 20（两轴对称）；转横屏后内联 `touch-action` 自动清空、计算值回到 `auto`、处理器不再插手；转回竖屏又恢复接管。轻点仍能穿透去翻页（1 次 click），滑动后那次 click 被吞（0 次）。`npm test` 215/215 通过，`vite build` 通过。
  - 顺带查明：翻页热区按元素自身盒子算，横屏下窄页两侧约 190px 是死区（记为注意点 17，未处理）。
- 再追加（同日，第三轮）：用户反馈真机仍然滚不动。排查顺序：本地 dist 重建后哈希不变（是新的）→ 线上 `index.html` 引用的 bundle 与本地字节一致、且能在压缩产物里读到这次的改动 → 排除部署与 SW 缓存（`registerType: 'autoUpdate'`）→ 确认没有别的全局手势处理器抢。结论是机制本身依赖了一个真机上不成立的前提（见注意点 13 第一条）。改用非被动 `touchstart`/`touchmove` + `preventDefault()`，并补惯性。
  - **这一轮暴露了验证方法的缺口**：Browser 面板即使按手机尺寸模拟，注入的仍是鼠标事件，而处理器第一行就跳过 `pointerType === 'mouse'`，所以真触屏那条路一次都没被测到过，前两轮的「通过」是假的。之后测触屏交互必须自己构造 `TouchEvent` + `new Touch(...)`，并检查 `defaultPrevented` 确认平移真被拦下。
  - 另一个坑：Browser 面板整体隐藏时 `document.visibilityState === 'hidden'`，`requestAnimationFrame` **一次都不触发**，任何 rAF 驱动的动画都测不出来（看着像没实现）。验惯性时临时用 `setTimeout` 垫片顶掉 rAF。
  - 验证（端口 3210，线上库副本，合成 TouchEvent）：竖屏两轴对称，60 起，竖划上推 40 → 100、下拉 40 → 20、横划同样，四次 `defaultPrevented` 均为 true；惯性 132 →164→191→213.5→231.5→ 到底 232.5 停住不回弹；轻点仍穿透去翻页（1 次 click），滑动后那次 click 被吞（0 次）；双指不接管（`scrollTop` 不变、不拦）；转横屏后同一未重挂载的节点上 `touch-action` 自动清空、计算值回到 `auto`、不拦平移也不改 `scrollTop`。`npm test` 215/215，`vite build` 通过。
  - 部署：前端**已生效**（`express.static` 从磁盘读 `web/dist`，`vite build` 完线上即换新 bundle，无需重启；上一条记录里「线上还没部署」的说法是错的）。服务端未改，未重启。
  - 真机仍需用户确认 —— 本环境无法注入真实触摸输入，手势仲裁那一层只能在真手机上验。
- 再追加（同日，第四轮）：用户第三次反馈真机滚不动。**根因终于找到，而且和手势仲裁无关**：签证页块层整层 `pointerEvents: 'none'`，滚动盒子从来就不是命中目标（见注意点 11）。前三轮每次都用 `el.dispatchEvent()` 把事件直接打在盒子上，绕过了命中测试，所以次次假通过 —— 真手指连这个元素都碰不到。修法是 `ScrollBox` 在溢出时把 `pointer-events` 改回 `auto`，装得下时保持穿透。顺带这也让**横屏的原生滚动**第一次真正可用（此前横屏同样滚不动，只是没人提）。
  - 同时改掉旋转判定：原来比布局宽高与屏幕宽高的绝对差，改用变换矩阵（见注意点 12）。是在面板改尺寸动画中途量到 `屏上 60×181 / 布局 570×195` 才发现整体缩放会让旧判法失效。
  - 挂载时的补测从 `requestAnimationFrame` 改为同时挂 `setTimeout` 兜底：后台标签页里 rAF 一次都不触发，首屏若赶在 transform 落定之前跑就永远纠不回来。
  - 验证（端口 3210，线上库副本，**真实那一页**：第一次团契 → 额外页「活动总结 2」的 400 字 `text` 块，可滚 89px）：命中测试落在盒子里（修前落在翻页层）；事件经 `elementFromPoint` 取目标后派发，竖划 ±30 与横划 ±30 四向都对、`defaultPrevented` 均为 true；到顶夹在 0、到底夹在 88.5（max 89）；轻点仍穿透翻页（1 次 click），滑动后 click 被吞（0 次）；从盒子上冒泡的 click 仍能翻页（所以即使溢出块压住翻页热区也不会吃掉翻页）；装得下的盒子 `pointer-events` 保持 `none`；横屏未旋转、不拦平移也不改 `scrollTop`，`pointer-events` 为 `auto` 交给原生。`npm test` 215/215，`vite build` 通过。
  - 数据事实（排查时查明）：线上唯一会溢出的长文本就是上面那个 400 字块，其余 `note` 都是空的（`note` 内容来自盖章记录，配置里为空）。
- 下一步：
  - 线上总控台若仍显示旧分数，需重新登录或保存一次活动来触发全量同步（纪元修复只管以后）。
  - 用户提出的测试账号清理尚未执行 —— 等用户确认具体删哪几个，删除不可逆。
  - 消息推送做过可行性评估：微信内置浏览器不支持 Web Push；用户已澄清走手机浏览器，安卓可直接推，iPhone 必须先加到主屏幕。建议先做安装引导、看实际装机率再决定。未动工。
  - `README.md` 与 `server/seed.mjs` 的过时问题仍未修。

#### 2026-09-15 · 新手引导更新内容，配色跟随护照主题

- 需求：引导内容跟上最近加的功能；引导的主题颜色随护照。
- 内容（`PassportBook.jsx` 的 `tourSteps`，现 7 步）：你的护照 → 签证页（新增：长文字可滑动看、有些活动只对报名的人或某个小组显示）→ 资料页（盖完章记为「已参加」）→ **活动通知（新，高亮 🔔，讲清安卓 Chrome 直接开、iPhone 要先添加到主屏幕）** → 个性化（配色连这份说明也跟着换）→ 参与记录（前三名有奖杯）→ 使用说明。护照顶部 🔔 加了 `data-tour="notify"` 锚点。
- 配色：`Tour.jsx` 原来写死酒红 / 米白 / 金色。改为引用护照主题变量（`--pp-paper / --pp-text / --pp-ink / --pp-gold / --pp-gold-2` 及对应 `-rgb`）。**引导挂在护照册外面，拿不到册子最外层注入的变量**，所以 `PassportBook` 把 `v.themeVars` 传给 `Tour`，铺在引导最外层。暗色遮罩刻意不跟主题（它的作用是把别处压暗）。
- 验证：隔离实例（3226，手机视口），先把玩家主题设成明显非默认的配色（墨绿 / 青 / 淡黄 / 深蓝）—— 默认纸色和原来写死的值一样，不换配色证明不了「跟随」。引导卡片底色、文字、NEXT 按钮底色与字色与主题**逐项一致**；7 步标题顺序正确，最后「DONE 知道了」，走完引导关闭；「活动通知」一步截图可见高亮圈在 🔔 上（脚本里数值比对那一项没取到值，结论以截图为准）。只改前端，`npm test` 未重跑（服务端未改）。
- 部署：只改前端，随 `vite build` 已生效。
- 未改：INDEX 导航页的说明文字（用户之前要求保持简单介绍）。

#### 2026-09-15 · 「已签到」改叫「已参加」；推送加「已参加的人」

- 需求：有些人报了名但没来，状态叫「已参加」更准；推送再加一个发给已参加的人。
- 活动详情的「📋 已报名」框：状态文字 已签到 → 已参加（标题「已报名（n）· 已参加 m」、行上「已参加 ✓」、签到后提示「XX 已参加」、批量提示「n 人都已标为已参加」、全签完按钮「都已参加」）。**动作按钮「签到」「一键全签到」不改。**
- 推送范围加 `attended`：这一场盖过章的人（`events` 里 kind=station 的去重 player_id），不管有没有报名。服务端 `PUSH_AUDIENCES = ['all','signed','attended','tags']`，预览多返回 `attended`；前端卡片四个选项（手机宽度下按钮行换行）。
- 验证：`npm test` **284/284**（流程 213，新增 3 条：没报名但盖过章的人算已参加、已报名数不受影响、发给已参加只发那一台；原先写死「已参加 1 人」的预期不对 —— 前面小节在同一场给别人也盖过章 —— 改为断言设备数与开通知人数）。隔离实例（3225，手机视口）浏览器验证：标题与行状态文字、签到后提示与计数、「都已参加」、四个推送选项与「已参加的人」的说明和预览。
- **部署：已执行（2026-09-15 11:30）。** 备份 `server/data/pre-attended-2026-09-15T11-30-34.db`；公钥指纹前后一致；计数一致（用户 15 / 事件 29 / 报名 3 / 素材 10 / 标签 1 / 挂载 11 / **订阅 1** —— 线上已经有一台真机开启了通知）；三个域名 200；前端 bundle 与本地一致。

#### 2026-09-15 · 通知推送

- 需求：新活动出现或报名的活动有更新时，手机弹通知；「帮我生成密钥，然后每个活动加入通知推送的按钮」。中途用户先说「只对报名的人推送」，随后又改为「推送时给选项：全部人 / 已报名的人 / 标签用户」—— 以最后这版为准。
- 服务端：新增依赖 `web-push`；`schema.sql` 新表 `push_subs`（一台设备一行，endpoint 为主键，挂在 player 上，删人级联删）；`server/src/push.js`（密钥生成与保存、`sendToPlayers`：404/410 自动删失效订阅，测试环境只数设备不发网络请求）。接口：`GET /api/push/key`（公钥）、`POST /api/push/subscribe` / `unsubscribe`（选手令牌，只能退自己名下的）、`GET /api/admin/activity/:id/notify?tags=`（预览三种范围各几人、几人开了通知、几台设备）、`POST /api/admin/activity/:id/notify`（管理员；见注意点 25）。点通知打开 `/join/:id`。
- 前端：`web/public/push-sw.js`（push / notificationclick），通过 `vite.config.js` 的 `workbox.importScripts` 引进生成的 SW —— **离线缓存那套没改**。`web/src/lib/push.js`（能力判断、开启 / 关闭、`usePush`；已订阅的设备每次打开顺手再报一次，换人登录或数据恢复后能对上）。护照顶部排行榜按钮旁加 🔔（开 / 关；iPhone 未添加到主屏幕、浏览器不支持、被拒绝时各给一句能照做的提示）。活动详情加「📣 通知推送」卡片：标题 / 内容预填、发给谁三选一（没人报名时默认「全部人」，有人报名后默认「已报名的人」）、按标签可多选、实时预览人数设备数、发送前确认、结果如实报成功 / 失败条数。
- 手机支持：安卓 Chrome 直接在网页里开，关掉浏览器也能收到；iPhone（任何浏览器）必须先「添加到主屏幕」并从图标打开（iOS 16.4+）；权限只能由用户点按钮触发。
- 验证：`npm test` **273/273**（流程 209，推送相关 20 条：公钥可取且固定、公开配置不含私钥、未登录不能订阅、非法订阅被拒、三种范围的预览与发送设备数、按标签没选被拒、不认识的范围按已报名、默认已报名、普通同工与选手令牌不能发、不能替别人退订、退订后设备数减少）。另起**非测试模式**隔离实例走真实发送路径：密钥首次生成后固定、存库、日志不含私钥；向假地址真发一次如实报 `failed: 1`、服务不崩。浏览器验证：三个范围按钮、默认选择、预览文字、按标签没选时禁用发送、确认框与结果提示；护照 🔔 存在，权限被拒时给出引导。**真机上的授权弹窗和实际收到通知本环境验证不了**，需要用户在安卓 Chrome 上点 🔔 开启后，从活动页发一条试试。
- **部署：已执行（2026-09-15 11:16 首次、11:20 改为三种范围）。** 两次重启前分别备份 `server/data/pre-push-2026-09-15T11-16-54.db`、`server/data/pre-pushaudience-2026-09-15T11-20-09.db`。线上 `/api/push/key` 返回 87 位公钥，第二次重启前后公钥指纹一致（没有重新生成），日志里「已生成推送密钥对」只出现一次；公开配置不含私钥；未登录发通知 401；计数前后一致（用户 15 / 事件 29 / 报名 3 / 素材 10 / 标签 1 / 挂载 11 / 订阅 0）；game / staff / city 均 200，两个 cloudflared 未受影响；`push-sw.js` 线上 200，前端 bundle 与本地一致。
- 下一步：用户在真机上开 🔔 并试发一条；iPhone 用户需要「添加到主屏幕」的引导（目前只有点 🔔 时的一句提示，没有专门的安装引导页）。

#### 2026-09-15 · 手机上改字时再点一下就退出、调不出粘贴

- 用户报：手机上在文本框里调不出粘贴 / 复制菜单；补充说「再次点击就关掉了输入变成移动了」。
- 根因（在未修复的构建上实测确认）：`ScrollBox` 在文字**装得下**时是 `pointer-events: none`（护照上不挡翻页），这个值**会继承**给里面的改字区 `.visa-inline-input`。于是短文字块进入改字后，改字区 `pointer-events: none`、而且只有文字那么高（实测 11px / 块 45px），点在字上或字下方都穿过去落到块外层 → `blockTouch` 当成拖动、`preventDefault` 关掉改字，系统长按菜单自然出不来。长文字块（装不下时 `pointer-events: auto`）不受影响，所以之前没暴露。
- 改动：
  - `.visa-inline-input` 加 `pointer-events: auto`（子元素可以把继承来的 none 改回来）。
  - 文字块的改字区 `minHeight: 100%`，点在块内任何位置都是在改字；移动用 ✥ 把手。
  - ⚙ 面板的文字块加一个普通多行输入框（`ImeInput as="textarea"`，中文输入法安全）：系统长按菜单在它上面一定可用；`maxLength` 3000，粘贴超出时提示超了多少字。
  - 画布编辑器是**手动保存**（顶部「保存」/ ⌘S），不是自动保存 —— 测试时离开页面前不点保存，改动就没了，这不是 bug。
- 验证：隔离实例（3223，手机视口）。修复后：改字区 `pointer-events: auto`、高度 45 / 45；点在字上、点在字下方都命中改字区；再点两次仍在改字、块没被挪动；✥ 仍能挪。面板输入框显示原文，输入后画布跟着变、字数计数更新，粘贴 3100 字提示「超出了 119 字」；点保存后服务端存下补上的内容。`npm test` 259/259。**真机上的系统长按菜单本环境模拟不了**，面板输入框是为此准备的可靠路径。
- 部署：只改前端，随 `vite build` 已生效。

#### 2026-09-15 · 画布里长文字块拖不动

- 用户报：文字框点中了就是在滑动，不知道怎么移动这个框。
- 原因：之前为了护照上长文字能滑动，`ScrollBox` 在装不下时把 `pointer-events` 打开、自己成为滚动区。画布编辑器复用同一个组件，于是装不下的文字块里手指一按，浏览器就开始滚它并发 `pointercancel`，外层块的拖动被掐断。装得下的块不受影响，所以只有长文字块拖不动。
- 改动：
  - `ScrollBox` 加 `interactive` 参数；`VisaBlocks` 的文字块和备注块传 `interactive={!editing || inlineEditing}` —— 画布里没在改字时不接手势（拖动交给外层块），进入改字模式后恢复可滚；护照页 `editing` 为 false，行为不变。
  - 画布选中工具条在 ⚙ 🗑 前面加移动把手 ✥（复用已有的 `drag(e, b, 'move')`）：点一下文字块会直接进改字模式，这时在字上拖是选字 / 滚动，按住 ✥ 才能移动，拖动时顺带退出改字。
- 验证：隔离实例（3222，手机视口，放一个装不下的文字块）。未选中时滚动区 `pointer-events: none`、手指命中块本身而不是滚动区，直接拖从 10%,20% 挪到 30%,37.5%；轻点进入改字、滚动区恢复 `auto`；改字模式下拖 ✥ 从 30%,37.5% 挪到 44.1%,54.3% 并退出改字。截图可见 ✥ ⚙ 🗑 工具条。`npm test` 259/259。
- 部署：只改前端，随 `vite build` 已生效。

#### 2026-09-15 · 同工专属活动不计入排行榜

- 需求：「同工专属活动不算到排名榜里面」。
- 口径（见注意点 23）：同工专属 = 可见范围只限定「同工」；只影响排行榜，护照照常算。
- 服务端：`game.js` 新增 `isStaffOnlyActivity`，`leaderboard()` 剔除这类活动；`rankOf` 随之一致。前端：`config.js` 同名函数；`staff.js` 的 `leaderboardLocal(activities)` 同口径（只对同工减）；`Admin.jsx` 用户列表的名次/分数/场次改用排行榜口径；`StaffPlayer.jsx` 的「第 N 名」传入活动配置，并把 `config` 补进 useMemo 依赖（配置晚到时名次会停在旧口径）。
- 验证：`npm test` **259/259**（流程 188，新增 6 条：同工专属章不计入榜上总数、也不计入场次和分母、「同工 + 其他标签」照常计入、剔除后总数相同则名次并列、护照总数照常含同工专属、「我的名次」与榜一致）。隔离实例（3221）：服务端榜与总控台用户列表都是 普通小李 #1 3 分 3/5、同工小王 #2 2 分 2/5、普通小张 #3 1 分 1/5；人员详情里同工小王「第 2 名」、已参加 3/6。
- 线上影响（先在线上库快照上用新代码只读算过，再重启）：线上同工专属活动只有「第一次团契」；同工角色 7 人，其中 6 人各在榜上少 1 分；普通成员盖在它上面的 2 个章本来就不计分，不受影响。名次分布从「#1 4 | #2 3 | #3 2 | 八人并列 #4 1 分 | 四人并列 #12 0 分」变为「#1 3 | 两人并列 #2 2 分 | 四人并列 #4 1 分 | 八人并列 #8 0 分」。
- **部署：已执行（2026-09-15 10:40）。** 备份 `server/data/pre-staffboard-2026-09-15T10-40-56.db`；按监听 3000 定位线上 node，原样取环境重启。重启后线上榜分布与快照模拟**完全一致**；计数前后一致（用户 15 / 事件 25 / 报名 3 / 素材 10 / 标签 1 / 挂载 11）；game / staff / city 均 200，两个 cloudflared 未受影响；前端 bundle 与本地一致。

#### 2026-09-15 · 活动页加「未报名」框

- 需求：每个活动再加一个「未报名」框，包括其他用户和搜索栏，可以点签到，签完这个人到「已报名 · 已签到」里。
- 做法：在「📋 已报名」框下面加「🙋 未报名（n）」框，列出**既没报名、也还没在这一场盖章**的人；搜索（名字 / 编号 / 联系方式 / 标签名）；每人一个「签到」按钮，走同一个 `checkIn`（`queueOp` + `settleOps`）。盖完章这个人就满足「已盖章」，自动从未报名消失、出现在已报名框（标「· 未报名」、「已签到 ✓」），已报名框标题的已签到数 +1。不在可见范围里的人不列出，框里写明「另有 n 人不在这场的可见范围里」。**这一框不做一键全签到** —— 会给所有没来的人都盖章，而且撤不掉。只改 `ActivityDetail.jsx`。
- 验证：隔离实例（3220）。圣经学习：未报名（3）= 路人甲 / 路人乙 / 诗班丙（报了名的和已盖章的都不在）；搜「乙」只剩路人乙；点路人甲签到 → 提示「路人甲 已签到」，未报名变（2），已报名框出现「路人甲 · 未报名 | 已签到 ✓」，标题已签到 1 → 2。限定「诗班」的活动：未报名只列诗班丙并提示另有 4 人。`npm test` 252/252。
  - 顺带查清：上一轮造测试数据时迎新之夜的章被拒，是那次造数脚本的问题，不是系统问题 —— 这次同样的盖章返回 ok，线上迎新之夜也已有 5 个章。
- 部署：只改前端，随 `vite build` 已生效，服务端不用重启。

#### 2026-09-15 · 文字块被无声截断；排行榜前三改奖杯

- 用户报：活动页文字框粘贴的内容有一部分不见了。查明是**画布文字块**：服务端 `.slice(0, 400)` 无声截断，而前端画布编辑器默认放行 1000，页面上看着都在、保存后后半截没了。线上第一次团契「活动总结 2」的文字块正好 400 字，结尾停在「5. 团契教材：」—— 第 5 条往后丢失。所有备份里这一块都是 400 字（第一次保存就被截了），**无法恢复**，需用户从原文重新粘贴剩余部分。
- 改动（见注意点 22）：文字块上限 400 → 3000，前后端同一个数、按码点截；`InlineValue` 超限当场标红，失焦截断后画布弹「这一块最多 3000 字，超出的部分已经去掉了…」；块属性面板（选中块后点 ⚙ 打开）显示「字数 n / 3000」，满了变色；画布里描述的内联编辑补上 200 的上限；活动页描述框加「n / 200」计数，粘贴超出时提示超出了多少字。保存活动接口的请求体上限是 512kb，一个 3000 字的块约 9KB，不会撞上。
- 排行榜（用户中途追加）：前三名只放奖杯、不写文字。新增 `components/Trophy.jsx`（自绘 SVG，金/银/铜；`tone="paper"` 在护照纸色底上压深颜色）。护照里的排行榜：名次列前三换成奖杯，删掉「THE CHAMPION 冠军 / THE CONNECTOR 联结者 / THE CREATIVE 创意奖」文字标签；`/leaderboard` 页：前三名的数字换成奖杯。**按名次值给奖杯，不按列表位置** —— 原来按位置发标签，并列第一的两人里第二个拿到的是「联结者」。总控台「👥 用户」列表仍显示数字（那是人员列表不是排行榜）。
  - 注意：`PassportBookView.jsx` 是从 Claude Design 转出来又手改过的文件，重新跑 `design/convert.py` 会把这次改动冲掉。
- 验证：`npm test` **252/252**（流程 181，新增 2 条：3000 字原样保存；超出截到 3000 且结尾 emoji 不被劈开）。隔离实例（3219）浏览器验证：画布里写到 3010 字当场标红、失焦后截到 3000 并弹提示、标红消失；块属性面板显示「字数 2990 / 3000」；描述框粘贴 250 字提示「超出了 106 字…」、计数「56 / 200」；造了并列数据（两人并列第一、一人第三、两人第四），护照排行榜与 `/leaderboard` 页都是 金、金、铜、04/4，无任何文字标签。
- **部署：已执行（2026-09-15 09:41）。** 备份 `server/data/pre-textlimit-2026-09-15T09-41-45.db`，按监听 3000 端口定位线上 node 并原样取环境重启；计数前后一致（用户 15 / 事件 25 / 报名 3 / 素材 10 / 标签 1 / 挂载 11），game / staff / city 三个域名均 200，两个 cloudflared 未受影响，线上 bundle 与本地一致。

#### 2026-09-14 · 已报名框漏掉了已盖章的人

- 用户报：第一次团契很多人盖了章，「已报名」框里却都不显示。原因是上一版把框改成「只列报名者」时，**已签到数也只数报名者身上的章**，而第一次团契 0 报名 / 8 个章（迎新之夜 0 / 5）—— 框里空着、显示「已签到 0」。
- 改法：名单 = 报名者（按报名顺序）+ **没报名但已盖章的人**（按盖章时间，名字后标「· 未报名」）；标题「已报名（报名数）· 已签到（这一场所有的章）」；既没报名也没盖章的人仍不列出（用户上一轮的要求）。空状态只在「没人报名也没人盖章」时出现。框内说明改成「没报名的人盖了章也会列在这里；还没盖章的，扫他的码或去『👥 用户』里标记」。
  - 注意：`checkInRoster` 的 useMemo 在 `attended` 声明之前，不能在回调里引用 `attended`（const 暂时性死区，渲染时直接抛错），所以未报名已盖章的人是从 `players` 直接筛的；JSX 里用 `attended.length` 没问题。
- 验证：线上库 `.backup()` 快照起隔离实例（3218），四场活动逐一核对，框标题和行数与库里计数完全一致 —— 第一次团契 0 报名 / 已签到 8 / 8 行，周天干饭 1 / 2 / 2 行，迎新之夜 0 / 5 / 5 行，CIty Walk 1 / 3 / 3 行。`npm test` 250/250。验完停实例、删副本。
- 部署：只改前端，随 `vite build` 已生效，服务端不用重启。

#### 2026-09-14 · 标签配色

- 需求：「给不同标签不同颜色」。
- 服务端：`tags` 表加 `color` 列（schema + `db.js` 老库迁移与回填）；`TAG_PALETTE` 十色、`pickTagColor`、`normalizeTagColor`；`POST /api/admin/tags` 处理颜色（见注意点 21）；`/api/config` 的 `tags` 带 `color`，另下发 `tagPalette`。
- 前端：`tagChipStyle` / `tagPalette`；花名册标签片、用户详情「身份与标签」两组按钮、活动列表徽标（改成每个标签一片各自上色）、活动可见范围的标签片，全部按标签色显示；标签编辑器每行前面一个色点，点一下换下一个颜色，改完随「保存标签改动」一起提交。去掉了原来把标签名拼成一串的紫色徽标样式。
- 验证：`npm test` **250/250**（流程 179，新增 6 条：新标签自动配色且不撞色、内置带色、下发色板、改名不带色则保持原色、手动换色大写也认、非法颜色不入库沿用原色）。迁移先在线上库 `.backup()` 快照上演练（隔离目录、端口 3217）：日志「已为 tags 表添加 color 列」、团契得到 `#7eb8ff`、六张表计数前后一致。浏览器在该副本上验证：花名册片、活动徽标、详情与可见范围标签片均按色显示，点色点换成绿色保存后服务端存 `#7ed9a3`、花名册跟着变。演练完停实例、删副本。
- **部署：已执行（2026-09-14 07:59）。** 备份 `server/data/pre-tagcolor-2026-09-14T07-59-00.db`；按监听 3000 端口的进程定位线上 node（`pgrep` 会误中测试实例，`lsof -ti:3000` 不加 `-sTCP:LISTEN` 会连 cloudflared 一起抓到），原样取环境重启。线上日志「已为 tags 表添加 color 列」；线上 tags：普通成员 `#9aa8bd` | 同工 `#e8c56a` | 团契 `#7eb8ff`；计数前后一致（用户 14 / 事件 24 / 报名 2 / 素材 10 / 标签 1 / 挂载 10）；game / staff / city 三个域名均 200，两个 cloudflared 进程未受影响。

#### 2026-09-13 · 活动页签到管理

- 需求：「活动内部也给一个签到的管理，每个人都有一个签到的按钮，还有一键全签到」。
- ~~最初做在「📣 报名」区~~ —— 用户说看不到。原因：那块包在 `signups.length > 0` 里，而线上实际用法是**不报名直接来盖章**（第一次团契 0 报名 / 8 章，迎新之夜 0 报名 / 4 章），两场活动整块不显示，另两场也只各列 1 人。用户明确要求签到**和「👥 已参加」放在同一个框**。
- 现状：「👥 已参加」框列出**所有在这场可见范围里的人**（不只是报名者），报名的排前面并标「已报名」；每人一个「签到」按钮，已签的显示时间和盖章人；顶部搜索（名字 / 编号 / 联系方式 / **标签名**）+「一键全签到（n）」，**只作用于当前搜到的人** —— 搜「团契」再点就是给一整组签到。不在可见范围的人不列出，并提示「另有 n 人不在这场的可见范围里」（按服务端已保存的那份活动判，不按草稿）。排序只看报没报名和编号，**不按签到状态排**，免得点一行它就跳到底下、门口往下点点错人。报名区撤回只读的「来了 ✓ / 待到场」。
- **再改（同日，按用户要求）**：框名从「👥 已参加」改成 **「📋 已报名（n）· 已签到 m」**，**只列报名了这一场的人**；「📣 报名」区里那份「来了 ✓ / 待到场」名单与之重复，已删除（报名区只留二维码和链接）。没报名就来的人不在这里，要扫码或去「👥 用户」标记 —— 这是用户的取舍，框内文案写明了。报名之后活动才被限定标签的人，行上显示「标签不符」而不给按钮，一键全签到也跳过他们。搜索和「一键全签到只作用于搜到的人」保留。
  - 验证：隔离实例 3216，报一/报二（团契、已报名）、报三（已报名、无标签）、路人（未报名），freshers 报名后限定团契。框里只有三个报名者、路人不出现；报三显示「标签不符」；一键全签到（2）→「2 人已全部签到」，标题从已签到 0 变 2；报名区不再有名单。`npm test` 244/244。只改前端。
- 顺带修掉：这个文件里 `<Avatar avatar={...}>` 一直写错（组件的 prop 是 `config`），报名和已参加名单里的头像从来没显示过。
- 签到就是盖章，走同工端那条 `queueOp` 通道（离线排得住、重复点也只算一次）。
- **顺带修掉一个虚报 bug（见注意点 20）**：原来 `await flush()` 之后读 `issueFor`，会搭上正在飞的那次同步而漏掉后排队的操作，把失败报成成功 —— 实测「1 人签到成功，1 人没成」而服务端一个章都没记。新增 `settleOps` 并让 `ActivityDetail` 和 `Admin.markDone` 都改用它。
- 验证：隔离实例（3214）。正常路径：4 人报名 → 单个签到 1 人 → 一键全签到 3 人 → 「都签到了」、已参加区变 4。失败路径（报完名才把活动限定到没人有的标签）：一键全签到报「0 人签到成功，2 人没成：戊、己（退修会 的可见范围不包含这个人的标签）」，与库里 0 个章一致；修之前同样场景会虚报「1 人签到成功」。`npm test` 244/244。
- 部署：只改前端，随 `vite build` 已生效，服务端不用重启。
- 验证（合并进已参加框之后）：隔离实例 3215，6 人（3 人挂「团契」、1 人报名）。freshers：6 人全列出、报名者置顶、头像正常；搜「团契」→ 3 人 →一键全签到只签这 3 人，提示「3 人已全部签到」，行位置不跳；报名区已无签到按钮。bible-study（仅团契）：只列 3 人并提示另有 3 人不在可见范围。`npm test` 244/244。只改前端，随构建生效。

#### 2026-09-13 · 落地页假离线、复制二维码、分享域名

- 起因：用户报 `https://staff.claiolulu.com/join/act-mu04gbhz` 显示「离线」。查出来是**两个互不相干的 bug 叠在一起**：
  1. `<NetBar />` 在 Join / ActivityDetail 共六处没传 prop，`online === undefined` 被 `!online` 当成离线 —— 那条「📴 离线模式」是**假的，而且一直都在**（总控台的活动详情页也挂着）。
  2. 那场活动（周天干饭）可见范围限定了「团契」标签，而落地页也过标签检查，匿名扫码按普通成员算 → 服务端 404 → 页面打不开。
- 改动：
  - `NetBar` 的 `online` 为 `undefined` 时按 `navigator.onLine` 算（见注意点 17）。
  - 落地页不再按可见范围拦，改用响应里的 `eligible`（见注意点 18）；Join 页面在 `eligible === false` 时照常显示活动信息，把报名按钮换成「只对特定标签的成员开放」+ 找回护照入口；错误页区分「连不上服务器」和「服务端说没这场活动」，并加重试按钮。
  - `POST /signup` 标签不符从 404 改 403 并给出能照做的话；取消报名不再看标签。
  - 新增 `config.shareOrigin`（见注意点 19），活动详情的二维码与链接都用它。
  - 新增「复制二维码」按钮：`canvas.toBlob` → `ClipboardItem`。**不能先 await toBlob**，Safari 要求 `clipboard.write` 在手势那一刻同步发起，所以把 Promise 直接交给 `ClipboardItem`（它接受 Promise）。复制不了就退回复制链接，再不行提示长按保存。
- 验证：`npm test` **244/244**（流程 173，把原来那条「同工专属活动对匿名隐藏」改成了「落地页照样打得开 + eligible 为 false + 报名 403」）。线上实测：`/api/activity/act-mu04gbhz` 从 404 变 200 且 `eligible:false`；`shareOrigin` 在 staff 子域上是 `https://game.claiolulu.com`、在 game 域和 localhost 上是空串；浏览器打开那个链接已无离线条、显示「只对特定标签的成员开放」。二维码按钮在隔离实例上验证：链接用分享域名、PNG 7135 字节、成功路径提示正确（真机剪贴板权限本环境给不了焦点，用桩验的是我的代码路径）。
- 部署：服务端已于 20:20 重启（备份 `server/data/pre-share-2026-09-13T20-20-39.db`，数据对账一致）；之后只改了前端，随 `vite build` 已生效，无需再重启。cloudflared 这次没被带走（两个进程已彼此独立）。

#### 2026-09-13 · 用户标签：一人可挂多个，活动按标签可见

- 需求：「一个人可以 tag 多个角色」+「增加一个用户标签的新增和删除编辑」。确认取**自建标签、可多选**那一步（不是只把现有两档改成多选）。
- 数据模型：新增 `tags` 和 `player_tags` 两张表（见 `schema.sql`）。**没有动 `players.role`** —— 内置的普通/同工继续由它派生，当两个内置标签用。有效标签集 = `{role}` ∪ 自建标签。
- 可见范围从单值枚举改成 `{ audience: 'all'|'signed'|'tags', audienceTags: string[] }`，旧值自动迁移（见注意点 14）。
- 服务端：`playerTagSet`；`activityVisibleTo` / `activityOpenForSignup` 改按标签集求交；`stationById` / `liveStationIds` / `playerState` / `roster` / `leaderboard` / `applyOp` 全线接上（花名册和排行榜用新增的 `allPlayerTags` 一次拉全按人分组，不逐人查）；`viewerTags(req)` 给匿名和同工令牌也算出标签集。
- 新接口：`POST /api/admin/tags`（整份提交，一次事务；清单里没有的就是删除，外键级联清挂载；删完还会把失效 id 从活动上摘掉并按需退回 `'all'`；递增纪元）、`POST /api/admin/player/:id/tags`（整份替换某人的自建标签，`touchPlayer`）。`/api/config` 下发 `tags`（内置 + 自建）。
- 前端：`lib/config.js` 镜像同一套规则，`activitiesForRole` → **`activitiesForPlayer(config, me)`**（要同时用角色、标签、报名记录），四个调用点跟着改；`PassportBook` 的 `useMemo` 键加上 `tagKey`（`me.tags` 也是每轮换引用的数组）。
- 总控台：用户面板加「🏷 用户标签」卡片（新增 / 就地改名 / 删除 + 撤销，删除有确认框并说明后果）；花名册行显示标签片，**搜索框把标签名也算进去**（敲标签名等于按标签筛人，没再单独做筛选控件）；用户详情里点按钮挂/取标签，可多选；活动详情的可见范围改成「所有人 / 仅指定标签 / 仅报名的人」+ 标签多选；活动列表徽标直接写出标签名（紫色，和「报名可见」的绿色区分）。
- 验证：`npm test` **242/242**（迁移 27、流程 171、并发 11、只读 33）。流程里为标签新增 18 条，覆盖：内置标签清单、新增、保留名/同名被拒、一人挂多个、命中任一即可见、无标签的人看不到、盖章被拒且理由提标签、改名不丢挂载、删除清挂载 + 递增纪元 + 活动退回 `'all'`、空勾退回 `'all'`。另起隔离实例（端口 3212，空库，一次性测试 PIN）做端到端 UI：新增→保存→改名→给张三挂两个标签（花名册出现两个标签片）→按标签名搜索命中→活动设为「仅指定标签」并勾选→徽标显示标签名→张三 0/6 / 李四 0/5→UI 删标签（确认框文案正确）→标签片消失、活动退回所有人、两人都变 0/6。测完停实例、删库、删临时文件；线上与 3210 未受影响。
- **部署：前端已生效，服务端未重启 —— 现在这个组合是坏的。** 线上总控台已经是新前端，会调 `POST /api/admin/tags`（旧服务端 404）、提交 `audience:'tags'`（旧服务端白名单不认，静默归成「所有人可见」）。必须由用户用自己的 PIN 重启才可用。
- 追加（同日）：用户反馈「新增的标签在用户角色看不到，活动里又没有普通/同工可选」。**根因是线上没重启**（旧服务端 `/api/config` 不下发 `tags`、`/api/admin/tags` 404，所以标签建不出来、活动那边一个可选项都没有）。同时这句话点出一个真实的设计问题：角色是下拉、标签是另一张卡，一个人的归属被拆在两处，看起来就像新标签进不了角色。
  - 用户详情里两者**合成一张「身份与标签」卡**：前两个内置身份做成二选一的方角片（写 `players.role`），后面自建标签是可多选的圆角片，中间一道竖线分开，文案写明「前两个二选一」。原来的角色下拉去掉了。想让一个人同时吃到两边的活动，就在活动可见范围里把两个标签都勾上。
  - `allTags()` 加兜底：服务端没下发清单时至少返回内置那两个 —— 否则「前端已更新、服务端还没重启」时活动里连普通/同工都选不了，看起来像功能坏了。
  - 验证：隔离实例（3212，空库）上把王五设成 同工 + 学生 + 诗班（一个内置 + 两个自建同时挂上），活动可见范围里内置与自建混选并存成 `tags ["staff","tag-…"]`。`npm test` 242/242。
- **部署：已执行（2026-09-13 20:05）。** 线上 node 于 20:05 重启到新代码；重启前用 `.backup()` 备份到 `server/data/pre-tags-2026-09-13T20-04-10.db`。数据对账一致：用户 14 / 事件 21 / 报名 2 / 素材 8，四场活动的可见范围都仍是 `all`（没有被误改）。`/api/config` 已下发 `tags`，`/api/admin/tags` 从 404 变 401。
  - **重启姿势（下次照这个来）**：不要跑 `./scripts/tunnel.sh` —— 它用的是 `cloudflared tunnel --url` 快速隧道（随机域名），会把 `game.claiolulu.com` 换掉。线上跑的是**具名隧道**：`cloudflared tunnel --no-autoupdate --edge-ip-version 4 run --url http://localhost:3000 gcgcm-life-game`。
  - **踩到的坑**：原来 node 和 cloudflared 都是 `tunnel.sh` 的子进程，`kill` 掉 node，父脚本连带把 cloudflared 也收了，域名 530（error 1033）约一分钟。现在两者是各自独立的 detached 进程（`start_new_session=True`），停一个不会带走另一个。日志在 scratchpad 的 `live-server.log` / `cloudflared.log`。
  - PIN 全程没有被打印或落盘：从旧进程的环境里原样取出再传给新进程。
- **教训：冒烟测试模块时必须显式带隔离的 `MLG_DATA_DIR`。** 这次为了验模块能加载跑了 `node -e "import('./server/src/db.js')"`，而 `db.js` 默认数据目录就是 `server/data` —— 线上库。它 import 时会执行 `schema.sql`，于是在生产库上建了 `tags` / `player_tags` 两张空表。这次是纯增量 DDL、没有数据损伤（事件 21→21，用户 13→14 那一个是同工自己建的「测试阿May」），但 `rebuildIfLegacy()` 同样在 import 路径上，条件凑巧满足就会在生产数据上重建表。
- 未做：同工代报名（上一轮就记着的缺口）；标签排序的拖动（`tags.sort` 列已经有了，目前按提交顺序写）。

#### 2026-09-13 · 活动新增「仅报名的人可见」

- 需求：用户要「活动再加个对参加人员可以见的选项」。系统里「参加」有两种已存在的含义（报了名 / 已盖章），确认取**报了名**那一种。
- 变化：`audience` 从三档扩到四档，新增 `signed`。
  - `game.js`：`activityVisibleTo(a, role, signedIds)` 加第三参；新增只看角色的 `activityRoleVisibleTo`（给报名入口用，防死锁）；`signupSetOf`；`stationById` / `liveStationIds` 跟着带 signedIds；`playerState` 改为进函数体再算 `live`（默认参数求值早于函数体，拿不到报名集合）；`roster` / `leaderboard` 用新增的 `allSignups` 一次拉全按人分组，避免逐人查。
  - `applyOp`：盖章按这个人的报名判，拒绝理由区分「没报名」和「角色不符」。
  - `index.js`：素材三个接口走完整规则；**落地页 `GET /api/activity/:id` 和报名/取消报名走 `activityRoleVisibleTo`**。
  - 前端：`config.js` 镜像同一套规则，`activitiesForRole` 加 `signedIds`；四个调用点传 `me.signups`；`PassportBook` 用拼接字符串当 `useMemo` 键（signups 是数组，每轮同步换引用，否则整本书版式每次重算）。
  - 总控台：下拉新增「仅报名的人」并给出说明；列表徽标「报名可见」（绿色，和角色那两档区分）；用户详情里不可标记时说明「未报名 · 报名后才能标记」。
- **顺带修掉一个既有 bug**（见注意点 16）：`buildVals` 内部重新取 `config.activities`，导致导航页表与渲染页表不一致；「同工专属」在护照册里其实一直没生效。改为由 `PassportBook` 把过滤后的列表传进去。
- 验证：`npm test` 225/225（迁移 27、流程 154、并发 11、只读 33）。流程里新增 10 条，覆盖：能存成 signed、没报名时不进分母、没报名盖不上且理由提「报名」、**落地页 200**、**没报名也能报上名**、报名后进分母、报名后能盖章、章计入总分。另起隔离实例（端口 3211，线上库 `.backup()` 副本，一次性测试 PIN）做端到端：把 CIty Walk 设为 signed 后，玩家分母 3→2、护照册里这一页消失；报名后以 NO.03 连同附加照片页出现在正确位置；总控台徽标与下拉选项、说明文案均正常。测完已停实例、删副本与临时令牌文件；线上与 3210 未受影响。
- **部署：前端已生效，服务端未重启 —— 这是一个当前存在的坑。** `express.static` 从磁盘读 `web/dist`，`vite build` 完线上立刻换新 bundle，所以总控台**现在就能看到**「仅报名的人」这个选项；但线上服务进程还是 9/12 起的旧代码，白名单里没有 `signed`，选了会被**静默降级成「所有人」**（正是注意点 9 那个坑）。必须由用户用自己的 PIN 重启（`STAFF_PIN=… ADMIN_PIN=… ./scripts/tunnel.sh`）；我没有也不应持有那两个 PIN，用不带 PIN 的方式重启会随机生成新 PIN、把同工挡在外面。
- 未做 / 已知缺口：
  - 没报名的人到了现场，同工在总控台**标不了「已参加」**（服务端会拒，UI 也会说明原因）。要支持「同工代报名」是另一件事，没做，等用户决定。
  - `buildVals` 那个装订列表的 bug 是前端逻辑，现有测试都在服务端，没有自动化回归覆盖；这次靠端到端手测确认。

#### 2026-09-12 · 建立跨助手项目记忆

- 变化：梳理当前后端、迁移/模型、前端路由与数据层、护照/编辑器、PWA、测试和部署脚本；创建 `CLAUDE.md`、`AGENTS.md`、项目 Skill 与本文件；README 增加当前交接入口及旧版说明警告。
- 同步基线：`f733896` 用户搜索/联系方式展示已纳入现状；没有改动业务代码。
- 验证：当前业务测试 210/210 通过；本地健康 ok；文档本地链接与空白检查通过。官方 quick_validate.py 因已有 Python 环境缺 PyYAML 无法运行，未安装依赖；使用系统 Ruby YAML 解析器补检 frontmatter、字段、命名、description 与未完成占位符，均通过。
- 部署：未执行，本次文档变动不需要重启应用。
- 下一步：后续开发按本文件协议更新；过时 README 和 seed 的修复需单独排入开发任务。
