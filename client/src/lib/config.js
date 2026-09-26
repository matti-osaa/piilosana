// config.js – siirretty App.jsx:stä (vaihe 1a). Sovelluksen yleiset vakiot.

const VERSION = "2.2.0";
// Päivän piilosana pois valikosta toistaiseksi – vaihda true niin nappi, streak-varoitus ja popupit palaavat.
const DAILY_ENABLED = false;
const SERVER_URL = window.location.origin;

export { VERSION, DAILY_ENABLED, SERVER_URL };
