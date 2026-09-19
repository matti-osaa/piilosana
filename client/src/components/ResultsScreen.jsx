// ResultsScreen – moninpelin tulosnäkymä pelin jälkeen.
//
// Näyttää: voitto/häviö-banneri, ranking (top 5), löydetyt sanat (battle vs.
// classic eri tavalla), missatut sanat (vain classic), ja toiminta-
// nappirivi (Uusi peli / Harjoittele / Valikko).
//
// Vanhempi (App.jsx) hoitaa tilan ja päätökset (rankingin laskenta, isWinner,
// myRank). Komponentti ei tunne sound/socket/storage-yksityiskohtia.
//
// Props (data):
//   S, t                           teema + käännökset
//   isWinner                       boolean – päihitin kaikki
//   myRank                         oma sija (0 = 1.)
//   isHost                         saanko aloittaa uuden pelin
//   gameMode                       "classic" | "battle" | ...
//   multiRankings                  [{ playerId, nickname, score, wordsFound }]
//   multiAllFoundWords             { [playerId]: ["kissa", ...] }
//   multiValidWords                [...] – kaikki sanat ruudukosta (classic)
//   playerId                       oma id (rankingin korostus)
//   wordColor(length)              funktio joka palauttaa värin pituuden mukaan
//   DEFS                           sanaston mahdolliset määritelmät
//   showDef(word, event)           avaa määritelmän
//   roomLang                       huoneen kieli (vaikuttaa "missed long" -tekstiin)
//   Icon                           teeman ikoni-komponentti
//
// Props (callbacks):
//   onPlayAgain
//   onSwitchToSolo
//   onReturnToMenu

import { GlossyButton, GLOSSY } from "./GlossyButton.jsx";
import { heroPanel, sectionPanel, wordChip, alpha } from "./panelStyle.js";

export function ResultsScreen({
  S,
  t,
  isWinner,
  myRank,
  isHost,
  gameMode,
  multiRankings,
  multiAllFoundWords,
  multiValidWords,
  playerId,
  wordColor,
  DEFS,
  showDef,
  roomLang,
  Icon,
  onPlayAgain,
  onSwitchToSolo,
  onReturnToMenu,
  ConfettiCelebration,
}) {
  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "20px",
        animation: "fadeIn 1s ease",
        position: "relative",
      }}
    >
      <ConfettiCelebration isWinner={isWinner} />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          ...heroPanel(S, isWinner ? S.yellow : S.green),
          maxWidth: "600px",
        }}
      >
        {/* Mitali isolle 1.-3. sijalle */}
        {myRank === 0 && (
          <div style={{ fontSize: "36px", marginBottom: "8px", animation: "pop 0.6s ease" }}>🏆</div>
        )}
        {myRank === 1 && (
          <div style={{ fontSize: "36px", marginBottom: "8px", animation: "pop 0.6s ease" }}>🥈</div>
        )}
        {myRank === 2 && (
          <div style={{ fontSize: "36px", marginBottom: "8px", animation: "pop 0.6s ease" }}>🥉</div>
        )}

        {/* Otsikko: "Voitit!" tai sija */}
        <div
          style={{
            fontSize: "16px",
            color: isWinner ? S.yellow : myRank <= 2 ? S.yellow : S.green,
            marginBottom: "4px",
            animation: myRank <= 2 ? "pop 0.6s ease" : "none",
          }}
        >
          {isWinner ? t.youWon : myRank === 1 ? "2." : myRank === 2 ? "3." : t.gameOver}
        </div>

        <p style={{ fontSize: "13px", color: S.green, marginBottom: "12px" }}>
          {t.results}
        </p>

        {/* Ranking – top 5 */}
        {multiRankings &&
          multiRankings.slice(0, 5).map((p, i) => {
            const medals = ["🥇", "🥈", "🥉"];
            const isMe = p.playerId === playerId;
            return (
              <div
                key={i}
                style={{
                  fontSize: i === 0 ? "15px" : "13px",
                  color: isMe
                    ? S.yellow
                    : i === 0
                    ? S.yellow
                    : i < 3
                    ? S.yellow
                    : S.green,
                  padding: i === 0 ? "10px 12px" : "8px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background:
                    i === 0
                      ? `${S.yellow}2a`
                      : isMe
                      ? `${S.green}26`
                      : "transparent",
                  border: i === 0 ? `1.5px solid ${S.yellow}` : isMe ? `1.5px solid ${S.green}` : "1.5px solid transparent",
                  animation: isMe || i === 0 ? "pop 0.4s ease" : "none",
                  borderRadius: "8px",
                  marginBottom: "2px",
                  fontWeight: i < 3 ? "600" : "normal",
                }}
              >
                <span>
                  {medals[i] || `${i + 1}.`} {p.nickname}
                </span>
                <span style={{ fontWeight: "bold" }}>
                  {p.score}p{" "}
                  <span style={{ fontWeight: "normal", fontSize: "12px", opacity: 0.7 }}>
                    ({p.wordsFound} {t.words})
                  </span>
                </span>
              </div>
            );
          })}

        {/* Classic mode: kokonaisprosentti */}
        {gameMode === "classic" && multiValidWords.length > 0 && (
          <div style={{ fontSize: "13px", color: S.textSoft || "#88ccaa", marginTop: "8px" }}>
            {(() => {
              const allF = new Set();
              Object.values(multiAllFoundWords).forEach((ws) => ws.forEach((w) => allF.add(w)));
              return `${allF.size} / ${multiValidWords.length} ${t.words} (${Math.round(
                (allF.size / multiValidWords.length) * 100
              )}%)`;
            })()}
          </div>
        )}

        {/* Battle mode: löydetyt sanat (ei missed-listaa) */}
        {gameMode === "battle" &&
          multiRankings &&
          (() => {
            const allFound = new Set();
            Object.values(multiAllFoundWords).forEach((ws) => ws.forEach((w) => allFound.add(w)));
            const foundWords = [...allFound].sort(
              (a, b) => b.length - a.length || a.localeCompare(b)
            );
            const nickMap = {};
            if (multiRankings) multiRankings.forEach((p) => { nickMap[p.playerId] = p.nickname; });
            return (
              foundWords.length > 0 && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px",
                    border: `2px solid ${S.purple}`,
                    background: S.dark,
                    boxShadow: `4px 4px 0 ${alpha(S.purple, "55")}`,
                    textAlign: "left",
                    animation: "fadeIn 0.8s ease",
                    borderRadius: "12px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      color: S.purple,
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontWeight: "600",
                    }}
                  >
                    <Icon icon="swords" color={S.purple} size={2} />
                    LÖYDETYT ({foundWords.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                    {foundWords.map((w, i) => {
                      const finders = Object.entries(multiAllFoundWords)
                        .filter(([, ws]) => ws.includes(w))
                        .map(([pid]) => nickMap[pid] || "?");
                      return (
                        <span
                          key={i}
                          onClick={(e) => showDef(w, e)}
                          style={{
                            fontSize: "14px",
                            ...wordChip(wordColor(w.length)),
                            cursor: DEFS && DEFS[w.toLowerCase()] ? "pointer" : "default",
                            textDecoration: DEFS && DEFS[w.toLowerCase()] ? "underline dotted" : "none",
                            textUnderlineOffset: "3px",
                          }}
                          title={finders.join(", ")}
                        >
                          {w.toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )
            );
          })()}

        {/* Classic-tyyppinen: löydetyt + missed */}
        {gameMode !== "battle" &&
          multiValidWords.length > 0 &&
          (() => {
            const allFound = new Set();
            Object.values(multiAllFoundWords).forEach((ws) => ws.forEach((w) => allFound.add(w)));
            const foundWords = [...allFound].sort((a, b) => b.length - a.length || a.localeCompare(b));
            const missedWords = [...multiValidWords]
              .filter((w) => !allFound.has(w))
              .sort((a, b) => b.length - a.length || a.localeCompare(b));
            const nickMap = {};
            if (multiRankings) multiRankings.forEach((p) => { nickMap[p.playerId] = p.nickname; });
            return (
              <>
                {foundWords.length > 0 && (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "12px",
                      border: `2px solid ${S.green}`,
                      background: S.dark,
                      boxShadow: `4px 4px 0 ${alpha(S.green, "55")}`,
                      textAlign: "left",
                      animation: "fadeIn 0.8s ease",
                      borderRadius: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        color: S.green,
                        marginBottom: "8px",
                        fontWeight: "600",
                      }}
                    >
                      LÖYDETYT ({foundWords.length})
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                      {foundWords.map((w, i) => {
                        const finders = Object.entries(multiAllFoundWords)
                          .filter(([, ws]) => ws.includes(w))
                          .map(([pid]) => nickMap[pid] || "?");
                        return (
                          <span
                            key={i}
                            onClick={(e) => showDef(w, e)}
                            style={{
                              fontSize: "14px",
                              ...wordChip(wordColor(w.length)),
                              cursor: DEFS && DEFS[w.toLowerCase()] ? "pointer" : "default",
                              textDecoration: DEFS && DEFS[w.toLowerCase()] ? "underline dotted" : "none",
                              textUnderlineOffset: "3px",
                            }}
                            title={finders.join(", ")}
                          >
                            {w.toUpperCase()}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {missedWords.length > 0 && (
                  <div
                    style={{
                      marginTop: "10px",
                      padding: "12px",
                      border: `2px solid ${"#ff5a5a"}`,
                      background: S.dark,
                      boxShadow: `4px 4px 0 ${alpha("#ff5a5a", "55")}`,
                      textAlign: "left",
                      maxHeight: "180px",
                      overflowY: "auto",
                      animation: "fadeIn 1s ease",
                      borderRadius: "12px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "14px",
                        color: "#ff6666",
                        marginBottom: "8px",
                        fontWeight: "600",
                      }}
                    >
                      JÄIVÄT LÖYTÄMÄTTÄ ({missedWords.length})
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                      {missedWords.map((w, i) => (
                        <span
                          key={i}
                          onClick={(e) => showDef(w, e)}
                          style={{
                            fontSize: "14px",
                            ...wordChip("#ff5a5a"),
                            cursor: DEFS && DEFS[w.toLowerCase()] ? "pointer" : "default",
                            textDecoration: DEFS && DEFS[w.toLowerCase()] ? "underline dotted" : "none",
                            textUnderlineOffset: "3px",
                          }}
                        >
                          {w.toUpperCase()}
                        </span>
                      ))}
                    </div>
                    {roomLang === "fi" && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: S.textMuted,
                          marginTop: "8px",
                          fontStyle: "italic",
                        }}
                      >
                        {t.missedLong || "Laudalta löytyi myös pidempiä sanoja"}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}

        {/* Toiminta-napit */}
        <div
          style={{
            marginTop: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {isHost && (
            <GlossyButton S={S} size="md" width="280px" color={GLOSSY.green} label={t.newCustom} onClick={onPlayAgain} />
          )}
          <GlossyButton S={S} size="md" width="280px" color={GLOSSY.blue} label={t.practice} onClick={onSwitchToSolo} />
          <GlossyButton S={S} size="sm" width="280px" color={GLOSSY.gray} label={t.menu} onClick={onReturnToMenu} />
        </div>
      </div>
    </div>
  );
}
