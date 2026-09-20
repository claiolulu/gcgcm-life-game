// 活动页的水印取决于活动和页 id，同一页在刷新、翻页及不同用户手机上都固定。
// 新增地标只需加入这里和 web/public/wm/，不修改已存活动配置。
export const VISA_WATERMARK_KEYS = [
  'city-chambers', 'clyde-auditorium', 'cathedral', 'university', 'clyde-arc',
  'riverside', 'george-square', 'botanic', 'crane', 'kelvingrove', 'wellington',
  'central-station-v2', 'peoples-palace-v2', 'necropolis-v2',
];

export function visaWatermarkKey(activityId, pageId = 'info') {
  if (!activityId) return null;
  let hash = 2166136261;
  for (const char of `${activityId}:${pageId}`) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return VISA_WATERMARK_KEYS[(hash >>> 0) % VISA_WATERMARK_KEYS.length];
}

// 新版图片本身留白更多，因此在页面里用更大的显示区域；旧图保持原布局。
export function visaWatermarkPlacement(key) {
  return key?.endsWith('-v2')
    ? { right: '3%', top: '8%', width: '72%', bottom: '8%' }
    : { right: '3%', top: '12%', width: '40%', bottom: '14%' };
}
