// MultiplayerLobby – moninpelin lobby-näkymät.
//
// Sisältää kolme komponenttia, jotka edustavat lobbyn eri vaiheita:
//   LobbyEnterName  – nimimerkin syöttö ennen lobbyä
//   LobbyChoose     – huoneluettelo + "luo huone" + "liity koodilla"
//   LobbyWaiting    – odottava lobby (host valitsee gamemoden, jakaa linkin
//                     ja painaa start-nappia kun pelaajia on tarpeeksi)
//
// Loading-tila ("LUODAAN HUONETTA…" / "LIITYTÄÄN HUONEESEEN…") jätetään
// App.jsx:ään, koska se on triviaali eikä hyödy omasta komponentista.
//
// Komponentit ovat puhtaita renderöijiä – kaikki state ja behavior tulee
// propseina/callbackeina vanhemmalta.

import { QRCodeSVG } from "qrcode.react";

// =====================================================================
// LobbyEnterName
// =====================================================================
//
// Props:
//   S, t, lang
//   nickname              syötteen nykyarvo
//   nicknameRef           ref jonka komponentti asettaa input-elementtiin
//   onNicknameChange(s)   asetin
//   onContinue            "JATKA" -nappi (paina vain jos nickname on epätyhjä)
//   onBack                "TAKAISIN" -nappi (palaa modeSelect-näkymään)

export function LobbyEnterName({
  S,
  t,
  lang,
  nickname,
  nicknameRef,
  onNicknameChange,
  onContinue,
  onBack,
}) {
  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "30px",
        animation: "fadeIn 0.5s ease",
      }}
    >
      <div
        style={{
          border: `3px solid ${S.green}`,
          padding: "24px",
          boxShadow: `0 0 20px ${S.green}44`,
          maxWidth: "600px",
        }}
      >
        <p
          style={{
            fontSize: "14px",
            lineHeight: "2",
            marginBottom: "16px",
            color: S.green,
          }}
        >
          {t.nickname}
        </p>
        <input
          ref={(el) => {
            if (nicknameRef) nicknameRef.current = el;
            if (el) el.focus();
          }}
          type="text"
          inputMode="text"
          maxLength="12"
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value.toUpperCase())}
          autoFocus
          placeholder={t.nickname}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nickname) onContinue();
          }}
          style={{
            fontFamily: S.font,
            fontSize: "18px",
            padding: "8px 12px",
            width: "100%",
            maxWidth: "500px",
            background: S.dark,
            color: S.green,
            border: `2px solid ${S.green}`,
            boxSizing: "border-box",
            marginBottom: "16px",
          }}
        />
        <br />
        <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
          <button
            onClick={() => nickname && onContinue()}
            style={{
              fontFamily: S.font,
              fontSize: "16px",
              color: S.bg,
              background: nickname ? S.green : S.border,
              border: "none",
              padding: "12px 28px",
              cursor: nickname ? "pointer" : "default",
              boxShadow: "4px 4px 0 #008844",
            }}
          >
            {lang === "en" ? "CONTINUE" : "JATKA"}
          </button>
          <button
            onClick={onBack}
            style={{
              fontFamily: S.font,
              fontSize: "13px",
              color: S.green,
              border: `2px solid ${S.green}`,
              background: "transparent",
              padding: "8px 20px",
              cursor: "pointer",
            }}
          >
            {t.back}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// LobbyChoose
// =====================================================================
//
// Props (data):
//   S, t, Icon, PixelFlag
//   socketConnected   onko socket auki (vaikuttaa nappeihin)
//   lobbyError        näytettävä virheteksti tai tyhjä
//   publicRooms       [{ roomCode, hostNickname, playerCount, maxPlayers, lang }]
//   roomCode          syöte "liity koodilla" -kentässä
//
// Props (callbacks):
//   onRoomCodeChange(s)
//   onJoinRoom(code)
//   onCreateRoom
//   onRefreshRooms
//   onBack

export function LobbyChoose({
  S,
  t,
  Icon,
  PixelFlag,
  socketConnected,
  lobbyError,
  publicRooms,
  roomCode,
  onRoomCodeChange,
  onJoinRoom,
  onCreateRoom,
  onRefreshRooms,
  onBack,
}) {
  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "30px",
        animation: "fadeIn 0.5s ease",
      }}
    >
      <div
        style={{
          border: `3px solid ${S.green}`,
          padding: "24px",
          boxShadow: `0 0 20px ${S.green}44`,
          maxWidth: "600px",
          borderRadius: "16px",
        }}
      >
        {lobbyError && (
          <p
            style={{
              fontSize: "13px",
              color: S.red,
              marginBottom: "8px",
            }}
          >
            {lobbyError}
          </p>
        )}
        {!socketConnected && (
          <p
            style={{
              fontSize: "13px",
              color: S.yellow,
              marginBottom: "12px",
              animation: "pulse 1s infinite",
            }}
          >
            {t.connecting}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <p
            style={{
              fontSize: "13px",
              lineHeight: "2",
              color: S.green,
              margin: 0,
            }}
          >
            {t.openGames}
          </p>
          <button
            onClick={onRefreshRooms}
            disabled={!socketConnected}
            style={{
              fontFamily: S.font,
              fontSize: "18px",
              color: S.green,
              border: `1px solid ${S.green}`,
              background: "transparent",
              padding: "4px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              borderRadius: "8px",
            }}
          >
            <Icon icon="refresh" color={S.green} size={2} />
          </button>
        </div>

        {/* Avoimet huoneet */}
        <div
          style={{
            background: S.dark,
            padding: "8px",
            border: `1px solid ${S.border}`,
            marginBottom: "16px",
            minHeight: "80px",
            maxHeight: "200px",
            overflowY: "auto",
            borderRadius: "10px",
          }}
        >
          {publicRooms.length === 0 && (
            <p
              style={{
                fontSize: "18px",
                color: S.textMuted,
                padding: "16px 0",
              }}
            >
              {t.noRooms}
            </p>
          )}
          {publicRooms.map((r, i) => (
            <div
              key={r.roomCode}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px",
                borderBottom:
                  i < publicRooms.length - 1
                    ? `1px solid ${S.border}`
                    : "none",
              }}
            >
              <div>
                <span
                  style={{
                    marginRight: "6px",
                    display: "inline-flex",
                    verticalAlign: "middle",
                  }}
                >
                  <PixelFlag lang={r.lang || "fi"} size={2} />
                </span>
                <span style={{ fontSize: "13px", color: S.yellow }}>
                  {r.hostNickname}
                </span>
                <span
                  style={{
                    fontSize: "18px",
                    color: "#888",
                    marginLeft: "8px",
                  }}
                >
                  {r.playerCount}/{r.maxPlayers}
                </span>
              </div>
              <button
                onClick={() => onJoinRoom(r.roomCode)}
                disabled={!socketConnected}
                style={{
                  fontFamily: S.font,
                  fontSize: "18px",
                  color: S.bg,
                  background: S.yellow,
                  border: "none",
                  padding: "6px 14px",
                  cursor: "pointer",
                  boxShadow: "2px 2px 0 #cc8800",
                  borderRadius: "8px",
                }}
              >
                {t.join}
              </button>
            </div>
          ))}
        </div>

        {/* Liity koodilla */}
        <div style={{ marginBottom: "12px" }}>
          <p
            style={{
              fontSize: "13px",
              color: S.textMuted,
              marginBottom: "6px",
            }}
          >
            {t.orJoinRoom}
          </p>
          <div
            style={{
              display: "flex",
              gap: "6px",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              maxLength="6"
              value={roomCode}
              onChange={(e) => onRoomCodeChange(e.target.value.toUpperCase())}
              placeholder={t.roomCode}
              onKeyDown={(e) => {
                if (e.key === "Enter" && roomCode.trim()) onJoinRoom(roomCode.trim());
              }}
              style={{
                fontFamily: S.font,
                fontSize: "14px",
                color: S.green,
                background: S.dark,
                border: `2px solid ${S.border}`,
                padding: "8px",
                width: "140px",
                textAlign: "center",
                outline: "none",
                letterSpacing: "2px",
                borderRadius: "8px",
              }}
            />
            <button
              onClick={() => {
                if (roomCode.trim()) onJoinRoom(roomCode.trim());
              }}
              disabled={!socketConnected || !roomCode.trim()}
              style={{
                fontFamily: S.font,
                fontSize: "13px",
                color: S.bg,
                background:
                  roomCode.trim() && socketConnected ? S.yellow : S.border,
                border: "none",
                padding: "8px 14px",
                cursor:
                  roomCode.trim() && socketConnected ? "pointer" : "default",
                borderRadius: "8px",
              }}
            >
              {t.joinGame}
            </button>
          </div>
        </div>

        {/* Luo huone / Takaisin */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            onClick={onCreateRoom}
            disabled={!socketConnected}
            style={{
              fontFamily: S.font,
              fontSize: "18px",
              color: S.bg,
              background: socketConnected ? S.green : S.border,
              border: "none",
              padding: "12px 20px",
              cursor: socketConnected ? "pointer" : "default",
              boxShadow: socketConnected ? "3px 3px 0 #008844" : "none",
              borderRadius: "10px",
            }}
          >
            {socketConnected ? t.createGame : t.connecting}
          </button>
          <button
            onClick={onBack}
            style={{
              fontFamily: S.font,
              fontSize: "18px",
              color: S.green,
              border: `2px solid ${S.green}`,
              background: "transparent",
              padding: "10px 20px",
              cursor: "pointer",
              borderRadius: "10px",
            }}
          >
            {t.back}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// LobbyWaiting
// =====================================================================
//
// Odottava lobby – peli ei ole vielä alkanut. Host näkee gamemoden,
// jakaa linkin/QR-koodin, ja painaa "ALOITA" kun pelaajia on >= 2.
// Vieraat näkevät pelaajalistan ja "Odotetaan hostia" -tekstin.
//
// Props (data):
//   S, t, lang, Icon
//   players               [{ playerId, nickname }]
//   playerId              oma id (oman rivin korostamiseksi)
//   roomCode              huoneen koodi (jaa linkki/qr)
//   linkCopied            boolean – näytä "Kopioitu!" jos äsken kopioitu
//   isHost                voinko muuttaa asetuksia ja aloittaa pelin
//   gameMode              "classic" | "battle"
//   gameTime              120 | 402
//   letterMult            boolean – kirjainkertoimet (vain classic-mode)
//
// Props (callbacks):
//   onCopyLink
//   onGameModeChange(m)
//   onGameTimeChange(s)
//   onLetterMultToggle
//   onStartGame(mode)
//   onExit

export function LobbyWaiting({
  S,
  t,
  lang,
  Icon,
  players,
  playerId,
  roomCode,
  linkCopied,
  isHost,
  gameMode,
  gameTime,
  letterMult,
  onCopyLink,
  onGameModeChange,
  onGameTimeChange,
  onLetterMultToggle,
  onStartGame,
  onExit,
}) {
  const shareUrl = roomCode
    ? `${window.location.origin}?room=${roomCode}`
    : "";

  return (
    <div
      style={{
        textAlign: "center",
        marginTop: "30px",
        animation: "fadeIn 0.5s ease",
      }}
    >
      <div
        style={{
          border: `1px solid ${S.yellow}44`,
          padding: "24px",
          boxShadow: `0 4px 24px ${S.yellow}22, 0 8px 32px #00000022`,
          maxWidth: "600px",
          borderRadius: "16px",
          background: `${S.dark}f0`,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <p
          style={{
            fontSize: "18px",
            lineHeight: "2",
            marginBottom: "12px",
            color: S.yellow,
          }}
        >
          {t.waiting}
        </p>
        <p
          style={{
            fontSize: "13px",
            lineHeight: "2",
            color: S.green,
            marginBottom: "12px",
          }}
        >
          {t.playersCount} ({players.length})
        </p>

        {/* Pelaajalista */}
        <div
          style={{
            background: `${S.dark}cc`,
            padding: "10px",
            border: `1px solid ${S.border}`,
            marginBottom: "16px",
            minHeight: "60px",
            borderRadius: "10px",
          }}
        >
          {players.map((p, i) => (
            <div
              key={i}
              style={{
                fontSize: "13px",
                color: p.playerId === playerId ? S.yellow : S.green,
                padding: "4px",
              }}
            >
              {i + 1}. {p.nickname}
              {p.playerId === playerId ? ` (${t.youTag})` : ""}
            </div>
          ))}
        </div>

        {/* Jaa linkki + QR */}
        {roomCode && (
          <div
            style={{
              marginBottom: "16px",
              padding: "14px",
              background: `${S.gridBg || S.dark}cc`,
              border: `1px solid ${S.border}`,
              borderRadius: "12px",
            }}
          >
            <p
              style={{
                fontSize: "13px",
                color: S.textSoft,
                marginBottom: "8px",
              }}
            >
              {t.inviteFriends}
            </p>
            <div
              style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "10px",
              }}
            >
              <input
                readOnly
                value={shareUrl}
                onClick={(e) => e.target.select()}
                style={{
                  fontFamily: S.font,
                  fontSize: "12px",
                  color: S.textSoft,
                  background: S.dark,
                  border: `1px solid ${S.border}`,
                  padding: "6px 8px",
                  flex: 1,
                  maxWidth: "280px",
                  outline: "none",
                }}
              />
              <button
                onClick={onCopyLink}
                style={{
                  fontFamily: S.font,
                  fontSize: "12px",
                  color: linkCopied ? S.bg : S.green,
                  background: linkCopied ? S.green : "transparent",
                  border: `2px solid ${S.green}`,
                  padding: "6px 12px",
                  cursor: "pointer",
                  minWidth: "80px",
                  transition: "all 0.2s",
                }}
              >
                {linkCopied ? t.copied : t.shareLink}
              </button>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <QRCodeSVG
                value={shareUrl}
                size={120}
                bgColor="transparent"
                fgColor={S.textSoft}
                level="L"
              />
              <p style={{ fontSize: "11px", color: S.textMuted }}>
                {t.scanToJoin}
              </p>
            </div>
          </div>
        )}

        {/* Host-asetukset */}
        {isHost && (
          <div style={{ marginBottom: "12px" }}>
            <p
              style={{
                fontSize: "13px",
                color: S.green,
                marginBottom: "8px",
              }}
            >
              {t.gameMode}
            </p>
            <div
              style={{ display: "flex", gap: "8px", justifyContent: "center" }}
            >
              <button
                onClick={() => onGameModeChange("classic")}
                style={{
                  fontFamily: S.font,
                  fontSize: "13px",
                  color: gameMode === "classic" ? S.bg : S.green,
                  background:
                    gameMode === "classic" ? S.green : "transparent",
                  border: `1px solid ${
                    gameMode === "classic" ? S.green : S.green + "66"
                  }`,
                  padding: "8px 16px",
                  cursor: "pointer",
                  borderRadius: "10px",
                  transition: "all 0.15s",
                }}
              >
                {t.classic}
              </button>
              <button
                onClick={() => onGameModeChange("battle")}
                style={{
                  fontFamily: S.font,
                  fontSize: "13px",
                  color: gameMode === "battle" ? S.bg : S.purple,
                  background:
                    gameMode === "battle" ? S.purple : "transparent",
                  border: `1px solid ${
                    gameMode === "battle" ? S.purple : S.purple + "66"
                  }`,
                  padding: "8px 16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "10px",
                  transition: "all 0.15s",
                }}
              >
                <Icon
                  icon="swords"
                  color={gameMode === "battle" ? S.bg : S.purple}
                  size={2}
                />
                {t.battle}
              </button>
            </div>
            {gameMode === "battle" && (
              <p
                style={{
                  fontSize: "13px",
                  color: S.purple,
                  marginTop: "8px",
                  lineHeight: "1.8",
                }}
              >
                {t.battleDesc}
              </p>
            )}

            <div style={{ marginTop: "12px" }}>
              <p
                style={{
                  fontSize: "13px",
                  color: S.green,
                  marginBottom: "8px",
                }}
              >
                {t.time}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={() => onGameTimeChange(120)}
                  style={{
                    fontFamily: S.font,
                    fontSize: "13px",
                    color: gameTime === 120 ? S.bg : S.green,
                    background: gameTime === 120 ? S.green : "transparent",
                    border: `1px solid ${
                      gameTime === 120 ? S.green : S.green + "66"
                    }`,
                    padding: "8px 16px",
                    cursor: "pointer",
                    borderRadius: "10px",
                    transition: "all 0.15s",
                  }}
                >
                  2 MIN
                </button>
                <button
                  onClick={() => onGameTimeChange(402)}
                  style={{
                    fontFamily: S.font,
                    fontSize: "13px",
                    color: gameTime === 402 ? S.bg : S.yellow,
                    background: gameTime === 402 ? S.yellow : "transparent",
                    border: `1px solid ${
                      gameTime === 402 ? S.yellow : S.yellow + "66"
                    }`,
                    padding: "8px 16px",
                    cursor: "pointer",
                    borderRadius: "10px",
                    transition: "all 0.15s",
                  }}
                >
                  {lang === "en" ? "6.7" : "6,7"} MIN
                </button>
              </div>
            </div>

            {gameMode !== "battle" && (
              <div style={{ marginTop: "12px" }}>
                <p
                  style={{
                    fontSize: "13px",
                    color: S.green,
                    marginBottom: "8px",
                  }}
                >
                  {t.letterMult}
                </p>
                <button
                  onClick={onLetterMultToggle}
                  style={{
                    fontFamily: S.font,
                    fontSize: "13px",
                    color: letterMult ? S.bg : S.yellow,
                    background: letterMult ? S.yellow : "transparent",
                    border: `2px solid ${S.yellow}`,
                    padding: "8px 16px",
                    cursor: "pointer",
                  }}
                >
                  {letterMult ? "✓ " : ""}
                  {t.letterMultBtn}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Aloita / odota */}
        {isHost && (
          <button
            onClick={() => onStartGame(gameMode)}
            disabled={players.length < 2}
            style={{
              fontFamily: S.font,
              fontSize: "16px",
              color: S.bg,
              background: players.length >= 2 ? S.green : S.border,
              border: "none",
              padding: "14px 28px",
              cursor: players.length >= 2 ? "pointer" : "default",
              borderRadius: "12px",
              boxShadow:
                players.length >= 2 ? `0 4px 12px ${S.green}33` : "none",
              fontWeight: "600",
              transition: "all 0.15s",
            }}
          >
            {t.startGame}
          </button>
        )}
        {isHost && players.length < 2 && (
          <p style={{ fontSize: "18px", color: "#666", marginTop: "8px" }}>
            {t.waitForPlayers}
          </p>
        )}
        {!isHost && (
          <p style={{ fontSize: "18px", color: "#666" }}>{t.waitForHost}</p>
        )}

        <button
          onClick={onExit}
          style={{
            fontFamily: S.font,
            fontSize: "13px",
            color: S.green,
            border: `1px solid ${S.green}44`,
            background: "transparent",
            padding: "10px 20px",
            cursor: "pointer",
            marginTop: "12px",
            borderRadius: "10px",
          }}
        >
          {t.exit}
        </button>
      </div>
    </div>
  );
}
