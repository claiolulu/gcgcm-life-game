import webpush from 'web-push';
import { getSetting, setSetting, stmts } from './db.js';

/**
 * Web Push 的密钥对（VAPID）。
 *
 * 第一次用到时由服务端自己生成，存进 settings 表的 _vapid —— 和登录用的 _secret
 * 放在一起，数据目录不进仓库。**私钥只在这个文件里用：不打印、不下发、不写文件。**
 * 下发给浏览器的只有公钥（/api/push/key）。
 *
 * 密钥一旦生成就不要换：换了之后所有已订阅的设备都会失效，得每个人重新点一次开启。
 */
let configured = false;

function ensureKeys() {
  let keys = getSetting('_vapid');
  if (!keys?.publicKey || !keys?.privateKey) {
    keys = webpush.generateVAPIDKeys();
    setSetting('_vapid', keys);
    console.log('[push] 已生成推送密钥对，存入数据库（私钥不会打印）');
  }
  if (!configured) {
    // subject 是推送服务出问题时联系我们的方式，填网站地址即可
    webpush.setVapidDetails(process.env.MLG_VAPID_SUBJECT || 'https://game.claiolulu.com',
      keys.publicKey, keys.privateKey);
    configured = true;
  }
  return keys;
}

export function vapidPublicKey() {
  return ensureKeys().publicKey;
}

/**
 * 给一批人的所有设备发同一条通知。
 *
 * 推送服务回 404 / 410 说明这台设备的订阅已经失效（关了通知、清了浏览器数据、
 * 换了手机），顺手删掉，下次就不再白发。
 *
 * 测试环境不真的发网络请求（测试不该依赖外网），只数设备。
 */
export async function sendToPlayers(playerIds, payload) {
  const want = new Set(playerIds);
  const subs = stmts.allPushSubs.all().filter((s) => want.has(s.player_id));
  if (process.env.NODE_ENV === 'test') {
    return { devices: subs.length, sent: subs.length, failed: 0, removed: 0, dryRun: true };
  }
  ensureKeys();
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let removed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 60 * 60 * 24, timeout: 10000 },
      );
      sent += 1;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        stmts.deletePushSub.run(s.endpoint);
        removed += 1;
      } else {
        failed += 1;
      }
    }
  }));
  return { devices: subs.length, sent, failed, removed };
}
