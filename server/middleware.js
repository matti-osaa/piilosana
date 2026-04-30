// middleware.js – kevyet Express-middlewaret havaittavuuteen.
//
// - requestId: arpoo jokaiselle pyynnölle uniikin id:n (req.id), välittää
//   X-Request-Id -headerin. Hyödyllinen kun debugaa logeja.
// - accessLog: yhden rivin loki per pyyntö: METHOD path status duration ms.
//   Skippaa health/ready -reitit ettei ole turhaa kohinaa.
// - errorHandler: varmistaa että poikkeukset palauttavat 500 + JSON-virheen
//   sen sijaan että kaataa palvelimen tai antaa Expressin oletusvastauksen.
//
// Käyttö index.js:ssä:
//   app.use(requestId);
//   app.use(accessLog);
//   ... muut reitit ...
//   app.use(errorHandler);  // VIIMEISENÄ kaikkien reittien jälkeen

const SKIP_LOG_PATHS = new Set(["/health", "/ready", "/api/version"]);

let counter = 0;
function nextId() {
  counter = (counter + 1) % 10_000;
  return Date.now().toString(36) + "-" + counter.toString(36);
}

export function requestId(req, res, next) {
  const id = req.headers["x-request-id"] || nextId();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
}

export function accessLog(req, res, next) {
  if (SKIP_LOG_PATHS.has(req.path)) {
    return next();
  }
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const id = req.id ? `[${req.id}] ` : "";
    console.log(
      `${id}${req.method} ${req.originalUrl || req.url} ${res.statusCode} ${durMs.toFixed(1)}ms`
    );
  });
  next();
}

// Express-error-handlerit tunnistetaan 4-arity allekirjoituksesta.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const id = req.id ? `[${req.id}] ` : "";
  console.error(`${id}Unhandled error:`, err);
  if (res.headersSent) {
    // Vastaus on jo lähtenyt – Express sulkee yhteyden, mitään ei voi tehdä
    return;
  }
  res.status(err.status || 500).json({
    error: err.message || "Sisäinen virhe",
    requestId: req.id,
  });
}
