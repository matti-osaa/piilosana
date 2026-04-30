// AuthPanel — kirjautumis- ja tunnusten hallinnan paneeli.
//
// Renderöi yhden seuraavista näkymistä riippuen authUser- ja authMode-
// tilasta:
//   - Logged in -näkymä: nickname + email + "Vaihda salasana" / "Kirjaudu ulos"
//   - Logged in + changePassword: salasanan vaihto -lomake
//   - Logged out + login: kirjautumislomake
//   - Logged out + register: rekisteröitymislomake
//   - Logged out + forgot: salasanan palautus -lomake
//
// Lopussa Google Sign-In -widget jos googleClientId on annettu.
//
// Komponentti on puhdas: kaikki muutokset menevät callbackien kautta.
// Vanhempi (App.jsx) hoitaa async-fetchit ja virhetilan päivityksen.
//
// Props (data):
//   S, t, lang, Icon
//   authUser              { nickname, email } | null
//   authMode              "login" | "register" | "forgot" | "changePassword"
//   authError, authSuccess, authLoading
//   googleClientId        Google OAuth client id (tai null jos disabled)
//
// Props (callbacks):
//   onModeChange(mode)    vaihda lomakkeen tila + nollaa virheet
//   onLogin(nick, pw)
//   onRegister(nick, pw, email, email2)
//   onForgotPassword(email)
//   onChangePassword(currentPw, newPw)
//   onGoogleLogin(credential)
//   onLogout
//   onClose

const TEXTS = {
  fi: {
    login: "KIRJAUDU",
    register: "LUO TUNNUS",
    nickname: "NIMIMERKKI",
    password: "SALASANA",
    email: "SÄHKÖPOSTI",
    optional: "vapaaehtoinen",
    confirmEmail: "VAHVISTA SÄHKÖPOSTI",
    pwSentInfo: "Salasana lähetetään sähköpostiisi muistiksi",
    forgot: "Unohtuiko salasana?",
    backToLogin: "Takaisin kirjautumiseen",
    forgotIntro: "Syötä sähköpostisi niin lähetämme uuden salasanan.",
    sendNewPw: "LÄHETÄ UUSI SALASANA",
    or: "tai",
    googleInfo:
      "Google jakaa vain nimesi ja sähköpostisi. Emme näe salasanaasi emmekä pääse Google-tilillesi. ",
    learnMore: "Lue lisää",
    logout: "KIRJAUDU ULOS",
    changePassword: "VAIHDA SALASANA",
    currentPassword: "NYKYINEN SALASANA",
    newPassword: "UUSI SALASANA",
    back: "Takaisin",
  },
  sv: {
    login: "LOGGA IN",
    register: "REGISTRERA",
    nickname: "SMEKNAMN",
    password: "LÖSENORD",
    email: "E-POST",
    optional: "valfritt",
    confirmEmail: "BEKRÄFTA E-POST",
    pwSentInfo: "Lösenordet skickas till din e-post",
    forgot: "Glömt lösenord?",
    backToLogin: "Tillbaka till inloggning",
    forgotIntro: "Ange din e-post så skickar vi ett nytt lösenord.",
    sendNewPw: "SKICKA NYTT LÖSENORD",
    or: "eller",
    googleInfo:
      "Google delar bara ditt namn och e-post. Vi ser aldrig ditt lösenord eller kommer åt ditt Google-konto. ",
    learnMore: "Läs mer",
    logout: "LOGGA UT",
    changePassword: "ÄNDRA LÖSENORD",
    currentPassword: "NUVARANDE LÖSENORD",
    newPassword: "NYTT LÖSENORD",
    back: "Tillbaka",
  },
  en: {
    login: "LOG IN",
    register: "REGISTER",
    nickname: "NICKNAME",
    password: "PASSWORD",
    email: "EMAIL",
    optional: "optional",
    confirmEmail: "CONFIRM EMAIL",
    pwSentInfo: "Password will be sent to your email for safekeeping",
    forgot: "Forgot password?",
    backToLogin: "Back to login",
    forgotIntro: "Enter your email and we'll send a new password.",
    sendNewPw: "SEND NEW PASSWORD",
    or: "or",
    googleInfo:
      "Google only shares your name and email. We never see your password or access your Google account. ",
    learnMore: "Learn more",
    logout: "LOG OUT",
    changePassword: "CHANGE PASSWORD",
    currentPassword: "CURRENT PASSWORD",
    newPassword: "NEW PASSWORD",
    back: "Back",
  },
};

export function AuthPanel({
  S,
  t,
  lang,
  Icon,
  authUser,
  authMode,
  authError,
  authSuccess,
  authLoading,
  googleClientId,
  onModeChange,
  onLogin,
  onRegister,
  onForgotPassword,
  onChangePassword,
  onGoogleLogin,
  onLogout,
  onClose,
}) {
  const txt = TEXTS[lang] || TEXTS.fi;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "500px",
        padding: "18px",
        border: `2px solid ${S.yellow}`,
        background: S.dark,
        boxShadow: `0 0 20px ${S.yellow}33`,
        animation: "fadeIn 0.3s ease",
        marginBottom: "8px",
        zIndex: 100,
        position: "relative",
      }}
    >
      {authUser ? (
        <LoggedInView
          S={S}
          txt={txt}
          Icon={Icon}
          authUser={authUser}
          authMode={authMode}
          authError={authError}
          authSuccess={authSuccess}
          authLoading={authLoading}
          onModeChange={onModeChange}
          onChangePassword={onChangePassword}
          onLogout={onLogout}
          onClose={onClose}
        />
      ) : (
        <LoggedOutView
          S={S}
          txt={txt}
          authMode={authMode}
          authError={authError}
          authSuccess={authSuccess}
          authLoading={authLoading}
          googleClientId={googleClientId}
          onModeChange={onModeChange}
          onLogin={onLogin}
          onRegister={onRegister}
          onForgotPassword={onForgotPassword}
          onGoogleLogin={onGoogleLogin}
          onClose={onClose}
        />
      )}
    </div>
  );
}

function LoggedInView({
  S,
  txt,
  Icon,
  authUser,
  authMode,
  authError,
  authSuccess,
  authLoading,
  onModeChange,
  onChangePassword,
  onLogout,
  onClose,
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: S.font,
          fontSize: "13px",
          color: S.green,
          marginBottom: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        <Icon icon="person" color={S.green} size={2} />
        {authUser.nickname}
      </div>
      {authUser.email && (
        <div
          style={{
            fontFamily: S.font,
            fontSize: "13px",
            color: S.textMuted,
            marginBottom: "12px",
          }}
        >
          {authUser.email}
        </div>
      )}

      {authMode === "changePassword" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            await onChangePassword(fd.get("currentPassword"), fd.get("newPassword"));
          }}
          style={{ textAlign: "left" }}
        >
          <Input
            S={S}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            placeholder={txt.currentPassword}
          />
          <Input
            S={S}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength="4"
            placeholder={txt.newPassword}
          />
          {authError && <Error S={S}>{authError}</Error>}
          {authSuccess && <Success S={S}>{authSuccess}</Success>}
          <SubmitButton S={S} loading={authLoading}>
            {txt.changePassword}
          </SubmitButton>
          <BackButton S={S} onClick={() => onModeChange("login")}>
            ← {txt.back}
          </BackButton>
        </form>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <button
            onClick={() => onModeChange("changePassword")}
            style={{
              fontFamily: S.font,
              fontSize: "13px",
              color: S.yellow,
              background: "transparent",
              border: `2px solid ${S.yellow}`,
              padding: "6px 16px",
              cursor: "pointer",
            }}
          >
            {txt.changePassword}
          </button>
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            style={{
              fontFamily: S.font,
              fontSize: "13px",
              color: S.red || "#ff4444",
              background: "transparent",
              border: `2px solid ${S.red || "#ff4444"}`,
              padding: "6px 16px",
              cursor: "pointer",
            }}
          >
            {txt.logout}
          </button>
          <button
            onClick={onClose}
            style={{
              fontFamily: S.font,
              fontSize: "16px",
              color: S.green,
              background: "transparent",
              border: `2px solid ${S.green}`,
              padding: "8px 18px",
              cursor: "pointer",
              marginTop: "8px",
              width: "100%",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

function LoggedOutView({
  S,
  txt,
  authMode,
  authError,
  authSuccess,
  authLoading,
  googleClientId,
  onModeChange,
  onLogin,
  onRegister,
  onForgotPassword,
  onGoogleLogin,
  onClose,
}) {
  return (
    <div>
      {/* Mode toggle: Login / Register */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          <ModeButton S={S} active={authMode === "login"} onClick={() => onModeChange("login")}>
            {txt.login}
          </ModeButton>
          <ModeButton
            S={S}
            active={authMode === "register"}
            onClick={() => onModeChange("register")}
          >
            {txt.register}
          </ModeButton>
        </div>
        <button
          onClick={onClose}
          style={{
            fontFamily: S.font,
            fontSize: "16px",
            color: S.green,
            background: "transparent",
            border: `2px solid ${S.green}`,
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {authMode === "forgot" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            await onForgotPassword(fd.get("email"));
          }}
        >
          <div
            style={{
              fontFamily: S.font,
              fontSize: "13px",
              color: S.textMuted,
              marginBottom: "10px",
              lineHeight: "1.6",
            }}
          >
            {txt.forgotIntro}
          </div>
          <Input S={S} name="email" type="email" autoComplete="email" placeholder={txt.email} />
          {authError && <Error S={S}>{authError}</Error>}
          {authSuccess && <Success S={S}>{authSuccess}</Success>}
          <SubmitButton S={S} loading={authLoading}>
            {txt.sendNewPw}
          </SubmitButton>
          <BackButton S={S} onClick={() => onModeChange("login")}>
            ← {txt.backToLogin}
          </BackButton>
        </form>
      ) : (
        <form
          autoComplete="on"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const nick = fd.get("nickname"),
              pw = fd.get("password");
            if (authMode === "login") {
              await onLogin(nick, pw);
            } else {
              await onRegister(nick, pw, fd.get("email") || "", fd.get("email2") || "");
            }
          }}
        >
          <Input
            S={S}
            name="nickname"
            type="text"
            autoComplete="username"
            maxLength="12"
            placeholder={txt.nickname}
          />
          <Input
            S={S}
            name="password"
            type="password"
            autoComplete={authMode === "register" ? "new-password" : "current-password"}
            minLength="4"
            placeholder={txt.password}
          />
          {authMode === "register" && (
            <>
              <Input
                S={S}
                name="email"
                type="email"
                autoComplete="email"
                placeholder={`${txt.email} (${txt.optional})`}
              />
              <Input
                S={S}
                name="email2"
                type="email"
                autoComplete="email"
                placeholder={txt.confirmEmail}
              />
              <div
                style={{
                  fontFamily: S.font,
                  fontSize: "13px",
                  color: S.textMuted,
                  marginBottom: "8px",
                  lineHeight: "1.6",
                }}
              >
                {txt.pwSentInfo}
              </div>
            </>
          )}
          {authError && <Error S={S}>{authError}</Error>}
          <SubmitButton S={S} loading={authLoading}>
            {authMode === "login" ? txt.login : txt.register}
          </SubmitButton>
          {authMode === "login" && (
            <BackButton S={S} onClick={() => onModeChange("forgot")}>
              {txt.forgot}
            </BackButton>
          )}
        </form>
      )}

      {/* Google Sign-In */}
      {googleClientId && (
        <div
          style={{
            marginTop: "12px",
            paddingTop: "12px",
            borderTop: `1px solid ${S.border}`,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontFamily: S.font,
              fontSize: "13px",
              color: S.textMuted,
              marginBottom: "8px",
            }}
          >
            {txt.or}
          </div>
          <div
            id="google-signin-btn"
            ref={(el) => {
              if (el && window.google?.accounts?.id) {
                el.innerHTML = "";
                window.google.accounts.id.initialize({
                  client_id: googleClientId,
                  callback: (response) => onGoogleLogin(response.credential),
                });
                window.google.accounts.id.renderButton(el, {
                  theme: "filled_black",
                  size: "large",
                  width: 280,
                  text: "signin_with",
                  shape: "rectangular",
                });
              }
            }}
          />
          <div
            style={{
              fontFamily: S.font,
              fontSize: "13px",
              color: S.textMuted,
              marginTop: "10px",
              lineHeight: "1.8",
              maxWidth: "280px",
              textAlign: "center",
            }}
          >
            {txt.googleInfo}
            <a
              href="https://support.google.com/accounts/answer/112802"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: S.green, textDecoration: "underline" }}
            >
              {txt.learnMore}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Sisäisiä apukomponentteja =====

function Input({ S, ...rest }) {
  return (
    <input
      style={{
        fontFamily: S.font,
        fontSize: "13px",
        padding: "8px",
        width: "100%",
        boxSizing: "border-box",
        background: S.inputBg || S.dark,
        color: S.green,
        border: `2px solid ${S.border}`,
        marginBottom: "8px",
      }}
      {...rest}
    />
  );
}

function ModeButton({ S, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: S.font,
        fontSize: "13px",
        color: active ? S.bg : S.yellow,
        background: active ? S.yellow : "transparent",
        border: `2px solid ${S.yellow}`,
        padding: "5px 12px",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SubmitButton({ S, loading, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        fontFamily: S.font,
        fontSize: "13px",
        color: S.bg,
        background: S.yellow,
        border: "none",
        padding: "8px 20px",
        cursor: "pointer",
        boxShadow: "3px 3px 0 #cc8800",
        width: "100%",
      }}
    >
      {loading ? "..." : children}
    </button>
  );
}

function BackButton({ S, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: S.font,
        fontSize: "13px",
        color: S.textMuted,
        background: "transparent",
        border: "none",
        padding: "8px",
        cursor: "pointer",
        marginTop: "6px",
        width: "100%",
        textAlign: "center",
      }}
    >
      {children}
    </button>
  );
}

function Error({ S, children }) {
  return (
    <div
      style={{
        fontFamily: S.font,
        fontSize: "13px",
        color: S.red || "#ff4444",
        marginBottom: "8px",
      }}
    >
      {children}
    </div>
  );
}

function Success({ S, children }) {
  return (
    <div
      style={{
        fontFamily: S.font,
        fontSize: "13px",
        color: S.green,
        marginBottom: "8px",
      }}
    >
      {children}
    </div>
  );
}
