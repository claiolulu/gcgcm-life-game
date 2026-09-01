import React from 'react';

/**
 * 护照册的视觉层 —— 由 Claude Design 的 `Life Passport v5 Classic.dc.html`
 * 机械转换而来，样式 1:1 保留，不要手改这里的内联样式。
 * 所有数据通过 `v`（见 bookVals.js）注入；这一层不含任何业务逻辑，也不做任何写操作。
 */
export default function PassportBookView({ v }) {
  return (
      <div style={{height: "100dvh", boxSizing: "border-box", paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(130% 100% at 50% 0%,#26201d,#141110 70%)", fontFamily: "'Noto Serif SC','EB Garamond',serif"}}>
        <div style={{width: "100%", maxWidth: v.stageMax, height: "100%", position: "relative", overflow: "hidden", background: "#5c1a22", containerType: "size", perspective: "1500px"}}>
          <div className="book-flip" style={{position: "absolute", inset: "0", animation: v.pageAnim}}>
          {v.isPortrait ? (
            <>
              <div style={{position: "absolute", inset: "0", display: "flex", flexDirection: "column", animation: "pageIn .25s ease both"}}>
                {v.isCover ? (
                  <>
                    <div onClick={v.pageTap} style={{cursor: "pointer", flex: "1", minHeight: "0", position: "relative", background: "linear-gradient(155deg,#6b2129 0%,#5c1a22 45%,#48131a 100%)", padding: "34px 30px 26px", display: "flex", flexDirection: "column", alignItems: "center"}}>
                      <div style={{position: "absolute", inset: "0", pointerEvents: "none", opacity: ".28", background: "repeating-linear-gradient(45deg,rgba(255,255,255,.06) 0 1px,transparent 1px 4px),repeating-linear-gradient(-45deg,rgba(0,0,0,.1) 0 1px,transparent 1px 4px)"}} />
                      <div style={{position: "absolute", left: "0", top: "0", bottom: "0", width: "22px", background: "linear-gradient(90deg,rgba(0,0,0,.4),transparent)"}} />
                      <div style={{position: "absolute", inset: "14px", border: "1px solid rgba(198,164,95,.45)", pointerEvents: "none"}} />
                      <div style={{position: "absolute", inset: "19px", border: "1px solid rgba(198,164,95,.2)", pointerEvents: "none"}} />
                      <div style={{position: "relative", textAlign: "center", fontFamily: "'EB Garamond',serif", fontSize: "11px", letterSpacing: ".42em", color: "#c6a45f", textIndent: ".42em"}}>
                        GCGCM
                      </div>
                      <div style={{position: "relative", marginTop: "9px", fontSize: "13px", letterSpacing: ".5em", color: "rgba(198,164,95,.72)", textIndent: ".5em"}}>
                        迷 你 人 生 国
                      </div>
                      <div style={{position: "relative", marginTop: "11%", width: "132px", height: "132px", display: "flex", alignItems: "center", justifyContent: "center"}}>
                        <div style={{position: "absolute", inset: "0", borderRadius: "50%", border: "1px solid rgba(198,164,95,.5)", background: "repeating-conic-gradient(from 0deg,rgba(198,164,95,.16) 0 2deg,transparent 2deg 9deg)"}} />
                        <div style={{position: "absolute", inset: "16px", borderRadius: "50%", border: "1px solid rgba(198,164,95,.34)"}} />
                        <div style={{position: "relative", width: "70px", height: "70px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "radial-gradient(circle at 38% 32%,rgba(198,164,95,.4),rgba(198,164,95,.1))", border: "1px solid rgba(198,164,95,.6)"}}>
                          <div style={{fontFamily: "'EB Garamond',serif", fontSize: "30px", letterSpacing: ".04em", color: "#e6cd91"}}>
                            M
                          </div>
                        </div>
                      </div>
                      <div style={{position: "relative", textAlign: "center", marginTop: "10%"}}>
                        <div style={{fontSize: "36px", fontWeight: "700", letterSpacing: ".3em", color: "#e6cd91", textIndent: ".3em"}}>
                          人生护照
                        </div>
                        <div style={{marginTop: "16px", fontFamily: "'EB Garamond',serif", fontSize: "14px", letterSpacing: ".34em", color: "rgba(230,205,145,.78)", textIndent: ".34em"}}>
                          PASSPORT
                        </div>
                      </div>
                      <div style={{flex: "1", minHeight: "14px"}} />
                      <div style={{position: "relative", width: "100%", display: "flex", flexDirection: "column", gap: "14px", alignItems: "center"}}>
                        <div style={{fontFamily: "'Courier Prime',monospace", fontSize: "11px", letterSpacing: ".2em", color: "rgba(230,205,145,.55)"}}>
                          {v.passportNo}
                        </div>
                        <div style={{width: "100%", padding: "13px", textAlign: "center", fontFamily: "'EB Garamond',serif", fontSize: "11px", letterSpacing: ".26em", textIndent: ".26em", color: "rgba(230,205,145,.45)"}}>
                          TAP TO OPEN 轻触翻开
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
                {v.isPaper ? (
                  <>
                    <div onClick={v.pageTap} style={{flex: "1", minHeight: "0", position: "relative", overflow: "hidden", background: v.paper, display: "flex", flexDirection: "column"}}>
                      <div style={{position: "absolute", inset: "0", pointerEvents: "none", opacity: v.guilloche, background: "repeating-conic-gradient(from 0deg at 22% 28%,rgba(92,26,34,.05) 0 1.4deg,transparent 1.4deg 7deg),repeating-conic-gradient(from 0deg at 78% 74%,rgba(44,74,90,.045) 0 1.4deg,transparent 1.4deg 7deg),repeating-linear-gradient(28deg,rgba(92,26,34,.035) 0 1px,transparent 1px 6px)"}} />
                      <div style={{position: "absolute", left: "6%", right: "6%", top: "14%", bottom: "16%", pointerEvents: "none", opacity: ".13", backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "contain", backgroundImage: v.watermark}} />
                      <div style={{position: "absolute", left: "0", top: "0", bottom: "0", width: "30px", pointerEvents: "none", zIndex: "2", background: "linear-gradient(90deg,rgba(60,40,30,.2),transparent)"}} />
                      <div style={{position: "relative", zIndex: "5", flex: "none", display: "flex", alignItems: "center", gap: "6px", padding: "12px 10px 8px", borderBottom: "1px solid rgba(92,26,34,.4)"}}>
                        <button onClick={v.goBoard} data-tour="board" style={{flex: "none", width: "30px", height: "30px", border: "1px solid rgba(92,26,34,.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#5c1a22"}} style-active="background:rgba(92,26,34,.1)">
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" stroke-linejoin="round">
                            <path d="M8 4h8v5a4 4 0 01-8 0V4z" />
                            <path d="M8 5H5.5a2.5 2.5 0 000 5H8M16 5h2.5a2.5 2.5 0 010 5H16M12 13v4M9 20h6M10 20l.6-3h2.8l.6 3" />
                          </svg>
                        </button>
                        <button onClick={v.goTeam} data-tour="team" title="我的队友" style={{flex: "none", height: "30px", padding: "0 5px", border: `1px solid ${v.teamBadge ? v.teamBadge.hex : "rgba(92,26,34,.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", whiteSpace: "nowrap", lineHeight: 1, color: v.teamBadge ? v.teamBadge.hex : "rgba(92,26,34,.5)"}}>
                          {v.teamBadge ? (
                            <>
                              <span style={{fontSize: "11.5px"}}>{v.teamBadge.symbol}</span>
                              <span style={{fontSize: "11.5px", letterSpacing: ".08em", fontFamily: "'EB Garamond',serif"}}>{v.teamBadge.en}</span>
                            </>
                          ) : (
                            <span style={{fontSize: "11.5px", opacity: .7}}>🪪 待分配</span>
                          )}
                        </button>
                        <div title="同步状态" style={{flex: "none", display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap", marginLeft: "5px", color: v.syncHex}}>
                          <span style={{fontFamily: "'EB Garamond',serif", fontSize: "8px", fontWeight: 700, letterSpacing: ".1em"}}>
                            {v.syncLabel}
                          </span>
                        </div>
                        <div style={{flex: "1", minWidth: "0", textAlign: "center"}}>
                          <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9.5px", letterSpacing: ".18em", color: "#5c1a22", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                            {v.kicker}
                          </div>
                          <div style={{marginTop: "2px", fontFamily: "'Courier Prime',monospace", fontSize: "8.5px", letterSpacing: ".1em", color: "rgba(42,35,32,.5)"}}>
                            {v.corner}
                          </div>
                        </div>
                        <div style={{flex: "none", display: "flex", alignItems: "baseline", gap: "2px", marginRight: "6px", lineHeight: 1, color: "#5c1a22"}}>
                          <div style={{fontFamily: "'Courier Prime',monospace", fontSize: "19px", fontWeight: 700}}>
                            {v.totalPad}
                          </div>
                          <div style={{fontFamily: "'EB Garamond',serif", fontSize: "8px", letterSpacing: ".08em", opacity: .5}}>
                            PTS
                          </div>
                        </div>
                        <button onClick={v.goGrace} data-tour="grace" style={{flex: "none", width: "30px", height: "30px", borderRadius: "50%", border: "1px solid rgba(156,124,60,.75)", background: "radial-gradient(circle at 36% 30%,#e6cd91,#b9913f)", display: "flex", alignItems: "center", justifyContent: "center", filter: v.coinFilter}} style-active="transform:translateY(1px)">
                          <span style={{fontFamily: "'EB Garamond',serif", fontSize: "12px", color: "#5c1a22"}}>
                            G
                          </span>
                        </button>
                        <button onClick={v.goGuide} data-tour="guide" style={{flex: "none", width: "30px", height: "30px", border: "1px solid rgba(92,26,34,.35)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'EB Garamond',serif", fontSize: "15px", color: "#5c1a22"}} style-active="background:rgba(92,26,34,.1)">
                          ?
                        </button>
                      </div>
                      {v.isInside ? (
                        <>
                          <div style={{position: "relative", zIndex: "4", flex: "1", minHeight: "0", overflow: "auto", padding: "24px 22px 20px", display: "flex", flexDirection: "column", gap: "22px"}}>
                            <div style={{display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", textAlign: "center"}}>
                              <div style={{width: "74px", height: "74px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center"}}>
                                <div style={{position: "absolute", inset: "0", borderRadius: "50%", border: "1px solid rgba(92,26,34,.45)", background: "repeating-conic-gradient(from 0deg,rgba(92,26,34,.12) 0 2deg,transparent 2deg 10deg)"}} />
                                <div style={{fontFamily: "'EB Garamond',serif", fontSize: "24px", color: "#5c1a22"}}>
                                  M
                                </div>
                              </div>
                              <div>
                                <div style={{fontSize: "19px", fontWeight: "700", letterSpacing: ".22em", color: "#5c1a22", textIndent: ".22em"}}>
                                  欢迎你
                                </div>
                                <div style={{marginTop: "8px", fontFamily: "'EB Garamond',serif", fontSize: "10px", letterSpacing: ".24em", color: "rgba(42,35,32,.55)", textIndent: ".24em"}}>
                                  WELCOME ABOARD
                                </div>
                              </div>
                            </div>
                            <div style={{position: "relative", padding: "22px 18px", borderTop: "1px solid rgba(92,26,34,.35)", borderBottom: "1px solid rgba(92,26,34,.35)"}}>
                              <div style={{fontSize: "20px", fontWeight: "600", lineHeight: "2.1", color: "#2a2320", textAlign: "center", textWrap: "pretty"}}>
                                你们要彼此接纳，
                                <br />
                                如同基督接纳你们一样。
                              </div>
                              <div style={{marginTop: "18px", fontFamily: "'EB Garamond',serif", fontStyle: "italic", fontSize: "14px", lineHeight: "1.85", color: "rgba(42,35,32,.7)", textAlign: "center", textWrap: "pretty"}}>
                                Welcome one another, as Christ has welcomed you.
                              </div>
                              <div style={{marginTop: "18px", fontFamily: "'EB Garamond',serif", fontSize: "10px", letterSpacing: ".22em", color: "#5c1a22", textAlign: "center", textIndent: ".22em"}}>
                                罗马书 15:7 · ROMANS 15:7
                              </div>
                            </div>
                            <div style={{fontSize: "13.5px", lineHeight: "2.05", color: "rgba(42,35,32,.75)", textWrap: "pretty"}}>
                              本护照由 GCGCM 签发，有效期无尽无穷。持照人将以此身份通行各关卡；无论积分多少，你在这里的位置都不因表现改变。
                            </div>
                            <div style={{marginTop: "auto", display: "flex", alignItems: "center", gap: "12px"}}>
                              <div style={{flex: "1", height: "1px", background: "rgba(92,26,34,.35)"}} />
                              <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9px", letterSpacing: ".2em", color: "rgba(92,26,34,.65)"}}>
                                GCGCM
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                      {v.isNotes ? (
                        <>
                          <div style={{position: "relative", zIndex: "4", flex: "1", minHeight: "0", overflow: "auto", padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: "14px"}}>
                            <div style={{display: "flex", flexDirection: "column", gap: "9px"}}>
                              <div style={{display: "flex", flexDirection: "column", gap: "16px"}}>
                                {(v.intro || []).map((p, i) => (
                                  <div key={i}>
                                    {p.h ? (
                                      <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9.5px", letterSpacing: ".2em", color: "rgba(92,26,34,.55)", marginBottom: "6px"}}>{p.h}</div>
                                    ) : null}
                                    <div style={{fontSize: "13.5px", lineHeight: "2", color: "#2a2320", textWrap: "pretty"}}>{p.t}</div>
                                  </div>
                                ))}
                                <button onClick={v.startTour} style={{marginTop: "4px", padding: "14px", background: "#5c1a22", border: "1px solid rgba(198,164,95,.6)", color: "#e6cd91", fontFamily: "'EB Garamond',serif", fontSize: "12px", letterSpacing: ".22em", textIndent: ".22em"}}>
                                  HOW TO PLAY 看怎么玩
                                </button>
                              </div>

                            </div>
                            <div style={{display: "flex", alignItems: "center", gap: "16px", paddingTop: "4px"}}>
                              <button onClick={v.openQr} style={{flex: "none", width: "84px", height: "84px", padding: "6px", background: "#fff", border: "1px solid rgba(92,26,34,.45)"}} style-active="opacity:.85">
                                {v.qrReady ? (
                                  <>
                                    <div style={{width: "100%", height: "100%"}}>
                                      {v.qrThumb}
                                    </div>
                                  </>
                                ) : null}
                                {v.qrLoading ? (
                                  <>
                                    <div style={{width: "100%", height: "100%", background: "repeating-linear-gradient(45deg,rgba(42,35,32,.14) 0 3px,transparent 3px 6px)"}} />
                                  </>
                                ) : null}
                              </button>
                              <div style={{flex: "1", minWidth: "0"}}>
                                <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9px", letterSpacing: ".16em", color: "rgba(42,35,32,.55)"}}>
                                  MACHINE READABLE 扫码记分
                                </div>
                                <div style={{marginTop: "8px", fontFamily: "'Courier Prime',monospace", fontWeight: "700", fontSize: "12px", letterSpacing: ".16em", color: "#5c1a22"}}>
                                  {v.passportNo}
                                </div>
                                <div style={{marginTop: "8px", display: "flex", alignItems: "center", gap: "10px"}}>
                                  <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9px", letterSpacing: ".16em", color: "#5c1a22"}}>
                                    VISAS {v.doneCount}/8
                                  </div>
                                  <div style={{flex: "1", height: "6px", background: "rgba(92,26,34,.12)", border: "1px solid rgba(92,26,34,.28)"}}>
                                    <div style={{width: `${v.pct}%`, height: "100%", background: "linear-gradient(90deg,#9c7c3c,#c6a45f)"}} />
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div style={{marginTop: "auto", paddingTop: "12px", borderTop: "1px solid rgba(92,26,34,.22)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px"}}>
                              <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9px", letterSpacing: ".16em", color: "rgba(42,35,32,.55)"}}>
                                ISSUED BY GCGCM
                              </div>
                              <div style={{fontFamily: "'Courier Prime',monospace", fontSize: "9px", letterSpacing: ".08em", color: "rgba(42,35,32,.5)"}}>
                                VALID: ETERNAL 无尽无穷
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                      {v.isClosing ? (
                        <>
                          <div style={{position: "relative", zIndex: "4", flex: "1", minHeight: "0", overflow: "auto", padding: "20px 20px 18px", display: "flex", flexDirection: "column", gap: "18px"}}>
                            <div style={{position: "relative", padding: "22px 16px", borderTop: "1px solid rgba(92,26,34,.35)", borderBottom: "1px solid rgba(92,26,34,.35)"}}>
                              <div style={{fontSize: "19.5px", fontWeight: "600", lineHeight: "2.1", color: "#2a2320", textAlign: "center", textWrap: "pretty"}}>
                                你们要彼此相爱，
                                <br />
                                像我爱你们一样。
                              </div>
                              <div style={{marginTop: "16px", fontFamily: "'EB Garamond',serif", fontStyle: "italic", fontSize: "13.5px", lineHeight: "1.85", color: "rgba(42,35,32,.7)", textAlign: "center", textWrap: "pretty"}}>
                                Love one another, as I have loved you.
                              </div>
                              <div style={{marginTop: "16px", fontFamily: "'EB Garamond',serif", fontSize: "10px", letterSpacing: ".22em", color: "#5c1a22", textAlign: "center", textIndent: ".22em"}}>
                                约翰福音 15:12 · JOHN 15:12
                              </div>
                            </div>
                            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px"}}>
                              {(v.summaryRows || []).map((s, i) => (
                                <React.Fragment key={i}>
                                  <div style={{borderBottom: "1px solid rgba(92,26,34,.22)", paddingBottom: "5px"}}>
                                    <div style={{fontFamily: "'EB Garamond',serif", fontSize: "8px", letterSpacing: ".14em", color: "rgba(42,35,32,.55)"}}>
                                      {s.label}
                                    </div>
                                    <div style={{marginTop: "4px", fontFamily: "'Courier Prime',monospace", fontWeight: "700", fontSize: "12px", color: "#2a2320"}}>
                                      {s.value}
                                    </div>
                                  </div>
                                </React.Fragment>
                              ))}
                            </div>
                            <div style={{fontSize: "13.5px", fontWeight: "600", lineHeight: "2.05", color: "#2a2320", textWrap: "pretty"}}>
                              今晚八个关卡走完，你的护照盖满了章。最终排名可以点左上角的奖杯查看。分数会归零，名次会被忘记，但今晚认识的人还在。愿你在这座城市里不是一个人。
                            </div>
                            <button onClick={v.share} style={{marginTop: "auto", padding: "15px", background: "#5c1a22", border: "1px solid rgba(198,164,95,.6)", color: "#e6cd91", fontFamily: "'EB Garamond',serif", fontSize: "12px", letterSpacing: ".24em", textIndent: ".24em"}} style-active="opacity:.85">
                              {v.shareLabel}
                            </button>
                            <button onClick={v.goBoard} style={{marginTop: "10px", padding: "14px", background: "transparent", border: "1px solid rgba(92,26,34,.45)", color: "#5c1a22", fontFamily: "'EB Garamond',serif", fontSize: "12px", letterSpacing: ".24em", textIndent: ".24em"}}>
                              LEADERBOARD 查看排名
                            </button>
                          </div>
                        </>
                      ) : null}
                      {v.isGrace ? (
                        <>
                          <div style={{position: "relative", zIndex: "4", flex: "1", minHeight: "0", overflow: "auto", padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: "18px", alignItems: "center"}}>
                            <button onClick={v.closeAside} style={{alignSelf: "flex-start", padding: "8px 14px", border: "1px solid rgba(92,26,34,.4)", color: "#5c1a22", fontFamily: "'EB Garamond',serif", fontSize: "10px", letterSpacing: ".2em", textIndent: ".2em"}} style-active="background:rgba(92,26,34,.1)">
                              ← BACK 返回
                            </button>
                            <div style={{width: "104px", height: "104px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", filter: v.coinFilter}}>
                              <div style={{position: "absolute", inset: "0", borderRadius: "50%", border: "1px solid rgba(156,124,60,.7)", background: "radial-gradient(circle at 36% 30%,rgba(198,164,95,.5),rgba(156,124,60,.14))"}} />
                              <div style={{position: "absolute", inset: "11px", borderRadius: "50%", border: "1px solid rgba(156,124,60,.45)", background: "repeating-conic-gradient(from 0deg,rgba(156,124,60,.14) 0 2deg,transparent 2deg 9deg)"}} />
                              <div style={{position: "relative", textAlign: "center"}}>
                                <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9px", letterSpacing: ".18em", color: "#5c1a22"}}>
                                  GRACE
                                </div>
                                <div style={{marginTop: "4px", fontSize: "17px", fontWeight: "700", color: "#5c1a22"}}>
                                  恩典
                                </div>
                              </div>
                            </div>
                            <div style={{textAlign: "center"}}>
                              <div style={{fontSize: "19px", fontWeight: "700", letterSpacing: ".06em", color: v.tokenTitleFg}}>
                                {v.tokenTitle}
                              </div>
                              <div style={{marginTop: "10px", fontSize: "13.5px", fontWeight: "600", lineHeight: "2", color: v.tokenBodyFg, textWrap: "pretty"}}>
                                {v.tokenBody}
                              </div>
                            </div>
                            <div style={{width: "100%", display: "flex", flexDirection: "column", gap: "11px"}}>
                              {(v.helpOpts || []).map((o, i) => (
                                <React.Fragment key={i}>
                                  <div style={{padding: "12px 0", borderTop: "1px solid rgba(92,26,34,.25)", display: "flex", gap: "12px", alignItems: "flex-start"}}>
                                    <span style={{flex: "none", fontFamily: "'EB Garamond',serif", fontSize: "11px", letterSpacing: ".1em", color: "#9c7c3c", paddingTop: "2px"}}>
                                      {o.n}
                                    </span>
                                    <div style={{minWidth: "0"}}>
                                      <div style={{fontFamily: "'EB Garamond',serif", fontSize: "10px", letterSpacing: ".18em", color: "#5c1a22"}}>
                                        {o.en}
                                      </div>
                                      <div style={{marginTop: "6px", fontSize: "13px", fontWeight: "600", lineHeight: "1.9", color: "#2a2320"}}>
                                        {o.cn}
                                      </div>
                                    </div>
                                  </div>
                                </React.Fragment>
                              ))}
                            </div>
                            {v.tokenUsed ? (
                              <>
                                <div style={{width: "100%", padding: "18px", background: "#5c1a22", animation: "fadeIn .4s ease both"}}>
                                  <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9px", letterSpacing: ".2em", color: "#c6a45f"}}>
                                    GRACE CARD 恩典卡 · {v.usedAt}
                                  </div>
                                  <div style={{marginTop: "12px", fontSize: "19px", fontWeight: "700", lineHeight: "1.8", color: "#f0e2c4"}}>
                                    「我的恩典够你用的」
                                  </div>
                                  <div style={{marginTop: "10px", fontFamily: "'EB Garamond',serif", fontStyle: "italic", fontSize: "13px", lineHeight: "1.8", color: "rgba(240,226,196,.75)"}}>
                                    My grace is sufficient for thee.
                                  </div>
                                </div>
                              </>
                            ) : null}
                            {v.tokenAvailable ? (
                              <>
                                <button onClick={v.askToken} style={{width: "100%", marginTop: "auto", padding: "15px", background: "#5c1a22", border: "1px solid rgba(198,164,95,.6)", color: "#e6cd91", fontFamily: "'EB Garamond',serif", fontSize: "12px", letterSpacing: ".24em", textIndent: ".24em"}} style-active="opacity:.85">
                                  USE TOKEN 递出代币
                                </button>
                              </>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                      {v.isGuide ? (
                        <>
                          <div style={{position: "relative", zIndex: "4", flex: "1", minHeight: "0", overflow: "auto", padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: "14px"}}>
                            <button onClick={v.closeAside} style={{alignSelf: "flex-start", padding: "8px 14px", border: "1px solid rgba(92,26,34,.4)", color: "#5c1a22", fontFamily: "'EB Garamond',serif", fontSize: "10px", letterSpacing: ".2em", textIndent: ".2em"}} style-active="background:rgba(92,26,34,.1)">
                              ← BACK 返回
                            </button>
                            {(v.guide || []).map((g, i) => (
                              <React.Fragment key={i}>
                                <div style={{padding: "14px 0", borderBottom: "1px solid rgba(92,26,34,.2)"}}>
                                  <div style={{display: "flex", alignItems: "baseline", gap: "10px"}}>
                                    <span style={{flex: "none", fontFamily: "'EB Garamond',serif", fontSize: "11px", color: "#9c7c3c"}}>
                                      {g.n}
                                    </span>
                                    <span style={{fontSize: "16px", fontWeight: "700", letterSpacing: ".04em", color: "#5c1a22"}}>
                                      {g.cn}
                                    </span>
                                    <span style={{fontFamily: "'EB Garamond',serif", fontSize: "9px", letterSpacing: ".18em", color: "rgba(42,35,32,.45)"}}>
                                      {g.en}
                                    </span>
                                  </div>
                                  <div style={{marginTop: "8px", paddingLeft: "21px", fontSize: "13px", fontWeight: "600", lineHeight: "1.95", color: "#2a2320", textWrap: "pretty"}}>
                                    {g.body}
                                  </div>
                                </div>
                              </React.Fragment>
                            ))}
                            <div style={{marginTop: "16px", padding: "15px 16px", background: "rgba(44,74,90,.08)", borderLeft: "2px solid #2c4a5a"}}>
                              <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9.5px", letterSpacing: ".2em", color: "#2c4a5a"}}>
                                LIFE EVENT 人生盲盒
                              </div>
                              <div style={{marginTop: "8px", fontSize: "13px", fontWeight: "600", lineHeight: "1.95", color: "#2a2320"}}>
                                总分首次跨过 15 / 30 / 50 分时，必须暂停挑战，前往场地中央抽一张盲盒卡：Good Fortune、Bad Luck、Unexpected、Extreme。
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                      {v.isBoard ? (
                        <>
                          <div style={{position: "relative", zIndex: "4", flex: "1", minHeight: "0", overflow: "auto", padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: "12px"}}>
                            <button onClick={v.closeAside} style={{alignSelf: "flex-start", padding: "8px 14px", border: "1px solid rgba(92,26,34,.4)", color: "#5c1a22", fontFamily: "'EB Garamond',serif", fontSize: "10px", letterSpacing: ".2em", textIndent: ".2em"}} style-active="background:rgba(92,26,34,.1)">
                              ← BACK 返回
                            </button>
                            {(v.boardRows || []).map((row, i) => (
                              <React.Fragment key={i}>
                                <div style={{display: "flex", alignItems: "center", gap: "12px", padding: "12px 10px", background: row.bg, borderBottom: "1px solid rgba(92,26,34,.18)"}}>
                                  <span style={{fontFamily: "'Courier Prime',monospace", fontSize: "11px", width: "22px", color: row.fg, opacity: ".75"}}>
                                    {row.rank}
                                  </span>
                                  <span style={{flex: "1", minWidth: "0", fontSize: "14.5px", fontWeight: "600", color: row.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                    {row.name}
                                  </span>
                                  {row.hasTag ? (
                                    <>
                                      <span style={{flex: "none", padding: "2px 7px", border: `1px solid ${row.tagBd}`, fontFamily: "'EB Garamond',serif", fontSize: "8px", letterSpacing: ".12em", color: row.tagFg, whiteSpace: "nowrap"}}>
                                        {row.tag}
                                      </span>
                                    </>
                                  ) : null}
                                  <span style={{fontFamily: "'EB Garamond',serif", fontSize: "9px", letterSpacing: ".14em", color: row.fg, opacity: ".55"}}>
                                    {row.identity}
                                  </span>
                                  <span style={{fontFamily: "'Courier Prime',monospace", fontSize: "14px", color: row.fg}}>
                                    {row.score}
                                  </span>
                                </div>
                              </React.Fragment>
                            ))}
                            <div style={{marginTop: "18px", padding: "15px 16px", border: "1px solid rgba(92,26,34,.28)"}}>
                              <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9.5px", letterSpacing: ".2em", color: "#5c1a22"}}>
                                AWARDS 颁奖
                              </div>
                              <div style={{marginTop: "8px", fontSize: "13px", fontWeight: "600", lineHeight: "1.95", color: "#2a2320"}}>
                                除最高积分奖外，另颁 The Connector、The Creative 等迎新向奖项，最后进入福音反思环节。
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                      <div style={{position: "relative", zIndex: "7", flex: "none", padding: "9px 16px 10px", display: "flex", alignItems: "center", gap: "13px", borderTop: "1px solid rgba(92,26,34,.2)"}}>
                        <div style={{flex: "1", minWidth: "0"}}>
                          <div style={{fontFamily: "'Courier Prime',monospace", fontWeight: "700", fontSize: "9.5px", letterSpacing: ".12em", color: "#5c1a22"}}>
                            {v.passportNo}
                          </div>
                          <div style={{marginTop: "3px", fontFamily: "'EB Garamond',serif", fontSize: "7.5px", letterSpacing: ".16em", color: "rgba(92,26,34,.42)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis"}}>
                            {v.watermarkName}
                          </div>
                        </div>
                        <div style={{flex: "none", fontFamily: "'Courier Prime',monospace", fontSize: "9px", color: "rgba(42,35,32,.45)"}}>
                          {v.pageNo}
                        </div>
                        <button onClick={v.openQr} style={{flex: "none", width: "30px", height: "30px", padding: "2px", background: "#fff", border: "1px solid rgba(92,26,34,.35)"}} style-active="opacity:.8">
                          {v.qrReady ? (
                            <>
                              <div style={{width: "100%", height: "100%"}}>
                                {v.qrThumb}
                              </div>
                            </>
                          ) : null}
                          {v.qrLoading ? (
                            <>
                              <div style={{width: "100%", height: "100%", background: "repeating-linear-gradient(45deg,rgba(42,35,32,.16) 0 2px,transparent 2px 4px)"}} />
                            </>
                          ) : null}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
          {v.isLandscape ? (
            <>
              <div onClick={v.pageTap} style={{position: "absolute", left: "50%", top: "50%", width: v.lsW, height: v.lsH, transform: v.lsTransform, display: "flex", flexDirection: "column", background: v.paper, overflow: "hidden", animation: "pageIn .25s ease both"}}>
                <button onClick={v.openQr} title="放大二维码" style={{position: "absolute", right: "10px", bottom: "10px", zIndex: 6, width: "30px", height: "30px", padding: "3px", background: "#fff", border: "1px solid rgba(92,26,34,.4)", lineHeight: 0, boxShadow: "0 2px 8px rgba(60,40,30,.25)"}}>
                  <div style={{width: "100%", height: "100%"}}>{v.qrThumb}</div>
                </button>
                <div style={{position: "absolute", inset: "0", pointerEvents: "none", opacity: v.guilloche, background: "repeating-conic-gradient(from 0deg at 18% 30%,rgba(92,26,34,.05) 0 1.4deg,transparent 1.4deg 7deg),repeating-conic-gradient(from 0deg at 82% 70%,rgba(44,74,90,.045) 0 1.4deg,transparent 1.4deg 7deg),repeating-linear-gradient(28deg,rgba(92,26,34,.032) 0 1px,transparent 1px 6px)"}} />
                <div style={{position: "absolute", right: "3%", top: "12%", width: "40%", bottom: "14%", pointerEvents: "none", opacity: ".11", backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "contain", backgroundImage: v.watermark}} />
                <div style={{position: "absolute", left: "0", right: "0", bottom: "0", height: "30px", pointerEvents: "none", zIndex: "2", background: "linear-gradient(0deg,rgba(60,40,30,.18),transparent)"}} />
                <div style={{position: "relative", zIndex: "5", flex: "none", display: "flex", alignItems: "center", gap: "6px", padding: "9px 10px 7px", borderBottom: "1px solid rgba(92,26,34,.4)"}}>
                  <button onClick={v.goBoard} style={{flex: "none", width: "30px", height: "30px", border: "1px solid rgba(92,26,34,.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#5c1a22"}} style-active="background:rgba(92,26,34,.1)">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" stroke-linejoin="round">
                      <path d="M8 4h8v5a4 4 0 01-8 0V4z" />
                      <path d="M8 5H5.5a2.5 2.5 0 000 5H8M16 5h2.5a2.5 2.5 0 010 5H16M12 13v4M9 20h6M10 20l.6-3h2.8l.6 3" />
                    </svg>
                  </button>
                  <button onClick={v.goTeam} data-tour="team" title="我的队友" style={{flex: "none", height: "30px", padding: "0 5px", border: `1px solid ${v.teamBadge ? v.teamBadge.hex : "rgba(92,26,34,.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", whiteSpace: "nowrap", lineHeight: 1, color: v.teamBadge ? v.teamBadge.hex : "rgba(92,26,34,.5)"}}>
                    {v.teamBadge ? (
                      <>
                        <span style={{fontSize: "10px"}}>{v.teamBadge.symbol}</span>
                        <span style={{fontSize: "10px", letterSpacing: ".08em", fontFamily: "'EB Garamond',serif"}}>{v.teamBadge.en}</span>
                      </>
                    ) : (
                      <span style={{fontSize: "10px", opacity: .7}}>🪪 待分配</span>
                    )}
                  </button>
                  <div title="同步状态" style={{flex: "none", display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap", marginLeft: "5px", color: v.syncHex}}>
                    <span style={{fontFamily: "'EB Garamond',serif", fontSize: "7px", fontWeight: 700, letterSpacing: ".1em"}}>
                      {v.syncLabel}
                    </span>
                  </div>
                  <div style={{flex: "1", minWidth: "0", display: "flex", alignItems: "baseline", justifyContent: "center", gap: "12px"}}>
                    <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9.5px", letterSpacing: ".18em", color: "#5c1a22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>
                      {v.kicker}
                    </div>
                    <div style={{flex: "none", width: "9px", height: "13px", border: "1px solid rgba(42,35,32,.35)", animation: "rotHint 3s ease-in-out infinite"}} />
                    <div style={{flex: "none", fontFamily: "'Courier Prime',monospace", fontSize: "8.5px", letterSpacing: ".1em", color: "rgba(42,35,32,.5)"}}>
                      {v.corner}
                    </div>
                  </div>
                  <div style={{flex: "none", display: "flex", alignItems: "baseline", gap: "2px", marginRight: "6px", lineHeight: 1, color: "#5c1a22"}}>
                    <div style={{fontFamily: "'Courier Prime',monospace", fontSize: "16px", fontWeight: 700}}>
                      {v.totalPad}
                    </div>
                    <div style={{fontFamily: "'EB Garamond',serif", fontSize: "7px", letterSpacing: ".08em", opacity: .5}}>
                      PTS
                    </div>
                  </div>
                  <button onClick={v.goGrace} style={{flex: "none", width: "30px", height: "30px", borderRadius: "50%", border: "1px solid rgba(156,124,60,.75)", background: "radial-gradient(circle at 36% 30%,#e6cd91,#b9913f)", display: "flex", alignItems: "center", justifyContent: "center", filter: v.coinFilter}} style-active="transform:translateY(1px)">
                    <span style={{fontFamily: "'EB Garamond',serif", fontSize: "11px", color: "#5c1a22"}}>
                      G
                    </span>
                  </button>
                  <button onClick={v.goGuide} style={{flex: "none", width: "30px", height: "30px", border: "1px solid rgba(92,26,34,.35)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'EB Garamond',serif", fontSize: "14px", color: "#5c1a22"}} style-active="background:rgba(92,26,34,.1)">
                    ?
                  </button>
                </div>
                {v.isData ? (
                  <>
                    <div style={{position: "relative", zIndex: "4", flex: "1", minHeight: "0", display: "flex", gap: "18px", padding: "13px 20px 0"}}>
                      <div style={{flex: "none", width: "126px", display: "flex", flexDirection: "column", gap: "10px"}}>
                        <div style={{position: "relative", padding: "5px", background: "#fff", border: "1px solid rgba(92,26,34,.45)"}}>
                          <div style={{width: "100%", aspectRatio: ".78", background: "linear-gradient(170deg,#e9e3d6,#d8d0c0)", position: "relative", overflow: "hidden"}}>
                            {v.photo}
                            <div style={{position: "absolute", inset: "0", background: "linear-gradient(128deg,rgba(255,255,255,.34) 0 20%,transparent 32% 68%,rgba(255,255,255,.18) 80%)"}} />
                          </div>
                        </div>
                      </div>
                      <div style={{flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "11px", overflow: "auto", paddingBottom: "8px"}}>
                        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px"}}>
                          <div>
                            <div style={{fontFamily: "'EB Garamond',serif", fontSize: "8px", letterSpacing: ".16em", color: "rgba(42,35,32,.55)"}}>
                              SURNAME 姓
                            </div>
                            <input value={v.surname} onChange={v.setSurname} placeholder="ZHANG" style={{width: "100%", marginTop: "4px", padding: "3px 0", background: "transparent", border: "none", borderBottom: "1px solid rgba(92,26,34,.3)", fontFamily: "'Courier Prime',monospace", fontSize: "13px", letterSpacing: ".06em", color: "#2a2320", outline: "none"}} />
                          </div>
                          <div>
                            <div style={{fontFamily: "'EB Garamond',serif", fontSize: "8px", letterSpacing: ".16em", color: "rgba(42,35,32,.55)"}}>
                              GIVEN NAMES 名
                            </div>
                            <input value={v.given} onChange={v.setGiven} placeholder="WEI" style={{width: "100%", marginTop: "4px", padding: "3px 0", background: "transparent", border: "none", borderBottom: "1px solid rgba(92,26,34,.3)", fontFamily: "'Courier Prime',monospace", fontSize: "13px", letterSpacing: ".06em", color: "#2a2320", outline: "none"}} />
                          </div>
                          <div>
                            <div style={{fontFamily: "'EB Garamond',serif", fontSize: "8px", letterSpacing: ".16em", color: "rgba(42,35,32,.55)"}}>
                              NICKNAME 昵称
                            </div>
                            <input value={v.name} onChange={v.setName} placeholder="\u8f93\u5165\u540d\u5b57" style={{width: "100%", marginTop: "4px", padding: "3px 0", background: "transparent", border: "none", borderBottom: "1px solid rgba(92,26,34,.3)", fontSize: "14px", color: "#2a2320", outline: "none"}} />
                          </div>
                        </div>
                        <div>
                          <div style={{fontFamily: "'EB Garamond',serif", fontSize: "8px", letterSpacing: ".16em", color: "rgba(42,35,32,.55)"}}>
                            CLASS 身份
                          </div>
                          <div style={{marginTop: "5px", display: "flex", gap: "8px"}}>
                            {(v.identities || []).map((idt, i) => (
                              <React.Fragment key={i}>
                                <button onClick={idt.pick} style={{flex: "1", padding: "7px 2px", background: idt.bg, border: `1px solid ${idt.bd}`, color: idt.fg, fontFamily: "'EB Garamond',serif", fontSize: "10px", letterSpacing: ".18em", textIndent: ".18em"}}>
                                  {idt.en}
                                </button>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 18px"}}>
                          {(v.fields || []).map((f, i) => (
                            <React.Fragment key={i}>
                              <div style={{borderBottom: "1px solid rgba(92,26,34,.22)", paddingBottom: "5px"}}>
                                <div style={{fontFamily: "'EB Garamond',serif", fontSize: "8px", letterSpacing: ".14em", color: "rgba(42,35,32,.55)"}}>
                                  {f.label}
                                </div>
                                <div style={{marginTop: "4px", fontFamily: "'Courier Prime',monospace", fontWeight: "700", fontSize: "11.5px", letterSpacing: ".04em", color: f.fg}}>
                                  {f.value}
                                </div>
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                        <div>
                          <div style={{fontFamily: "'EB Garamond',serif", fontSize: "8px", letterSpacing: ".14em", color: "rgba(42,35,32,.55)"}}>
                            SIGNATURE 持照人签名
                          </div>
                          <div style={{marginTop: "14px", height: "1px", background: "rgba(42,35,32,.35)"}} />
                        </div>
                      </div>
                    </div>
                    {v.mrzOn ? (
                      <>
                        <div style={{position: "relative", zIndex: "4", flex: "none", marginTop: "10px", padding: "9px 20px 11px", background: "#eae3d2", borderTop: "1px solid rgba(92,26,34,.4)", overflow: "hidden"}}>
                          <div style={{fontFamily: "'Courier Prime',monospace", fontWeight: "700", fontSize: "11px", lineHeight: "1.7", letterSpacing: ".1em", color: "#2a2320", whiteSpace: "nowrap"}}>
                            {v.mrz1}
                          </div>
                          <div style={{fontFamily: "'Courier Prime',monospace", fontWeight: "700", fontSize: "11px", lineHeight: "1.7", letterSpacing: ".1em", color: "#2a2320", whiteSpace: "nowrap"}}>
                            {v.mrz2}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </>
                ) : null}
                {v.isVisa && !v.visaBlank ? (
                  <>
                    <div onClick={v.stampTap} style={{position: "relative", zIndex: "4", flex: "1", minHeight: "0", display: "flex", flexDirection: "column", padding: "11px 18px 0", cursor: "pointer"}}>
                      <div style={{flex: "none", position: "relative", height: "44px", overflow: "hidden", background: "#ece5d6", border: "1px solid rgba(92,26,34,.35)"}}>
                        <div style={{position: "absolute", inset: "0", left: "38%", background: "#5c1a22", clipPath: "polygon(14% 0,100% 0,100% 100%,0 100%)"}} />
                        <div style={{position: "absolute", left: "0", top: "0", bottom: "0", width: "44%", background: "linear-gradient(120deg,rgba(44,74,90,.22),rgba(92,26,34,.12))"}} />
                        <div style={{position: "relative", height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px"}}>
                          <div style={{fontFamily: "'EB Garamond',serif", fontSize: "19px", letterSpacing: ".34em", color: "#5c1a22", textIndent: ".34em"}}>
                            VISA
                          </div>
                          <div style={{textAlign: "right"}}>
                            <div style={{fontFamily: "'EB Garamond',serif", fontSize: "12px", letterSpacing: ".24em", color: "#e6cd91", textIndent: ".24em"}}>
                              MINI LIFE GAME
                            </div>
                            <div style={{marginTop: "2px", fontSize: "9.5px", letterSpacing: ".18em", color: "rgba(230,205,145,.78)"}}>
                              迷你人生游戏
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{flex: "1", minHeight: "0", display: "flex", gap: "16px", padding: "11px 2px 0", overflow: "auto"}}>
                        <div style={{flex: "1", minWidth: "0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", alignContent: "start"}}>
                          {(v.visaFields || []).map((vf, i) => (
                            <React.Fragment key={i}>
                              <div style={{borderBottom: "1px solid rgba(92,26,34,.18)", paddingBottom: "3px"}}>
                                <div style={{fontFamily: "'EB Garamond',serif", fontSize: "7.5px", letterSpacing: ".14em", color: "rgba(42,35,32,.55)"}}>
                                  {vf.label}
                                </div>
                                <div style={{marginTop: "3px", fontFamily: "'Courier Prime',monospace", fontWeight: "700", fontSize: "11px", letterSpacing: ".03em", color: vf.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
                                  {vf.value}
                                </div>
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                        <div style={{flex: "none", width: "40%", display: "flex", flexDirection: "column", gap: "9px"}}>
                          <div>
                            <div style={{fontFamily: "'EB Garamond',serif", fontSize: "7.5px", letterSpacing: ".14em", color: "rgba(42,35,32,.55)"}}>
                              STATION 关卡
                            </div>
                            <div style={{marginTop: "3px", fontSize: "19px", fontWeight: "700", lineHeight: "1.25", color: "#5c1a22"}}>
                              {v.visaCn}
                            </div>
                            <div style={{marginTop: "3px", fontFamily: "'EB Garamond',serif", fontSize: "9px", letterSpacing: ".16em", color: "rgba(42,35,32,.6)"}}>
                              {v.visaEn}
                            </div>
                          </div>
                          <div>
                            <div style={{fontFamily: "'EB Garamond',serif", fontSize: "7.5px", letterSpacing: ".14em", color: "rgba(42,35,32,.55)"}}>
                              ANNOTATION 备注
                            </div>
                            <div style={{marginTop: "4px", fontSize: "11.5px", fontWeight: "600", lineHeight: "1.75", color: "#2a2320", textWrap: "pretty"}}>
                              {v.visaAnnotation}
                            </div>
                          </div>
                        </div>
                      </div>
                      {v.checking ? (
                        <div style={{position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", zIndex: 6, padding: "7px 14px", borderRadius: "2px", background: "rgba(92,26,34,.08)", fontFamily: "'EB Garamond',serif", fontSize: "9.5px", letterSpacing: ".2em", color: "rgba(92,26,34,.5)", whiteSpace: "nowrap", pointerEvents: "none"}}>
                          CHECKING 查询中…
                        </div>
                      ) : null}
                      {v.visaStamped ? (
                        <>
                          <div style={{position: "absolute", top: v.stampTop, left: v.stampLeft, transform: `rotate(${v.stampRot})`, pointerEvents: "none"}}>
                            <div style={{width: "98px", height: "98px", borderRadius: "50%", border: `2.5px solid ${v.stampColor}`, display: "flex", alignItems: "center", justifyContent: "center", color: v.stampColor, opacity: ".9", animation: "stampIn .45s ease both"}}>
                              <div style={{width: "82px", height: "82px", borderRadius: "50%", border: `1px solid ${v.stampColor}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px"}}>
                                <div style={{fontFamily: "'EB Garamond',serif", fontSize: "7.5px", letterSpacing: ".2em", textIndent: ".2em"}}>
                                  GCGCM {v.stampNo}
                                </div>
                                <div style={{fontFamily: "'Courier Prime',monospace", fontSize: "23px", fontWeight: "700", lineHeight: "1"}}>
                                  +{v.visaScore}
                                </div>
                                <div style={{fontSize: "9.5px", fontWeight: "700", letterSpacing: ".08em"}}>
                                  {v.stampLabel}
                                </div>
                                <div style={{fontFamily: "'Courier Prime',monospace", fontSize: "6.5px", letterSpacing: ".06em"}}>
                                  {v.stampDate}
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                    <div style={{position: "relative", zIndex: "4", flex: "none", padding: "6px 18px 9px", background: "#eae3d2", borderTop: "1px solid rgba(92,26,34,.4)", overflow: "hidden"}}>
                      <div style={{fontFamily: "'Courier Prime',monospace", fontWeight: "700", fontSize: "10.5px", lineHeight: "1.65", letterSpacing: ".1em", color: "#2a2320", whiteSpace: "nowrap"}}>
                        {v.mrz1}
                      </div>
                      <div style={{fontFamily: "'Courier Prime',monospace", fontWeight: "700", fontSize: "10.5px", lineHeight: "1.65", letterSpacing: ".1em", color: "#2a2320", whiteSpace: "nowrap"}}>
                        {v.mrz2}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
          </div>
          {v.askingToken ? (
            <>
              <div onClick={v.closeModal} style={{position: "absolute", inset: "0", zIndex: "41", background: "rgba(20,17,16,.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: "22px", animation: "fadeIn .18s ease both"}}>
                <div onClick={v.stop} style={{width: "100%", maxWidth: "330px", background: "#f3ede0", border: "1px solid rgba(198,164,95,.7)", padding: "24px 20px 18px", textAlign: "center"}}>
                  <div style={{fontFamily: "'EB Garamond',serif", fontSize: "9.5px", letterSpacing: ".24em", color: "#9c7c3c"}}>
                    HELP TOKEN
                  </div>
                  <div style={{marginTop: "12px", fontSize: "18px", fontWeight: "700", color: "#5c1a22"}}>
                    递出 Help Token？
                  </div>
                  <div style={{marginTop: "11px", fontSize: "13px", fontWeight: "600", lineHeight: "1.95", color: "rgba(42,35,32,.75)", textWrap: "pretty"}}>
                    全场只有一枚。递出后工作人员提供 Hint / Helper 或 Second Chance（二选一），并换取一张恩典卡。使用后不可再用。
                  </div>
                  <div style={{marginTop: "18px", display: "flex", flexDirection: "column", gap: "9px"}}>
                    <button onClick={v.useToken} style={{padding: "14px", background: "#5c1a22", color: "#e6cd91", fontFamily: "'EB Garamond',serif", fontSize: "12px", letterSpacing: ".24em", textIndent: ".24em"}} style-active="opacity:.85">
                      YES 确认使用
                    </button>
                    <button onClick={v.closeModal} style={{padding: "11px", fontFamily: "'EB Garamond',serif", fontSize: "11px", letterSpacing: ".16em", color: "rgba(42,35,32,.55)"}}>
                      NOT YET 再撑一会儿
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
          {v.qrBig ? (
            <>
              <div onClick={v.closeModal} style={{position: "absolute", inset: "0", zIndex: "41", background: "rgba(20,17,16,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "18px", padding: "24px", animation: "fadeIn .18s ease both"}}>
                <div style={{padding: "14px", background: "#fff"}}>
                  {v.qrReady ? (
                    <>
                      <div style={{width: "200px", height: "200px"}}>
                        {v.qrBigImg}
                      </div>
                    </>
                  ) : null}
                </div>
                <div style={{fontFamily: "'Courier Prime',monospace", fontSize: "13px", letterSpacing: ".18em", color: "#e6cd91"}}>
                  {v.passportNo}
                </div>
                <div style={{fontSize: "12.5px", color: "rgba(240,226,196,.6)"}}>
                  出示给工作人员扫描记分
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
  );
}
