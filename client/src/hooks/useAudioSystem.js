// useAudioSystem.js – kokoaa pelin äänijärjestelmän yhteen hookkiin.
//
// Sisältää:
//   - soundTheme ("modern" | "off") + setSoundTheme (persistoi localStorageen)
//   - musicOn (boolean) + setMusicOn (persistoi)
//   - musicTrack (number) + setMusicTrack (persistoi)
//   - audioStarted (boolean) – true kun käyttäjä on klikkannut ensimmäisen napin
//   - sounds (objekti play*-funktioilla, tai stub jos sound off)
//   - useEffect joka käynnistää/pysäyttää musiikin tilan muuttuessa
//   - useEffect joka soittaa "btn click"-äänen ensimmäisestä pointerdownista
//
// Kutsutaan App.jsx:stä yhden kerran. Palauttaa objektin jonka kentät
// menevät edelleen sub-komponenteille.

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSounds, useMusic, MUSIC_TRACKS } from "../audio/index.js";

// Stub-objekti kun ääni on pois päältä – sama API kuin oikeassa sounds-objektissa
const SILENT_SOUNDS = {
  init: async () => {},
  reinit: async () => {},
  playByLength: () => {},
  playCombo: () => {},
  playWrong: () => {},
  playTick: () => {},
  playCountdown: () => {},
  playGo: () => {},
  playEnding: () => {},
  playChomp: () => {},
  playBtn: () => {},
  playSlide: () => {},
  playChessMove: () => {},
  playChessPlace: () => {},
};

export function useAudioSystem() {
  // ---- State ----
  const [soundTheme, _setSoundTheme] = useState(() => {
    const s = localStorage.getItem("piilosana_sound");
    return s === "modern" || s === "off" ? s : "modern";
  });
  const [musicOn, _setMusicOn] = useState(
    () => localStorage.getItem("piilosana_music") !== "off"
  );
  const [musicTrack, _setMusicTrack] = useState(() => {
    const saved = localStorage.getItem("piilosana_music_track");
    if (saved !== null) return parseInt(saved);
    // Random track on first visit
    const r = Math.floor(Math.random() * MUSIC_TRACKS.length);
    localStorage.setItem("piilosana_music_track", String(r));
    return r;
  });
  const [audioStarted, setAudioStarted] = useState(false);

  // ---- Persistoivat setterit ----
  const setSoundTheme = useCallback((next) => {
    _setSoundTheme(next);
    localStorage.setItem("piilosana_sound", next);
  }, []);
  const setMusicOn = useCallback((next) => {
    _setMusicOn(next);
    localStorage.setItem("piilosana_music", next ? "on" : "off");
  }, []);
  const setMusicTrack = useCallback((next) => {
    _setMusicTrack(next);
    localStorage.setItem("piilosana_music_track", String(next));
  }, []);

  // ---- Sounds & music engine ----
  const rawSounds = useSounds(soundTheme);
  const music = useMusic(musicTrack);

  // Wrap soundsit niin että "off" palauttaa stubin
  const sounds = useMemo(() => {
    return soundTheme === "off" ? SILENT_SOUNDS : rawSounds;
  }, [soundTheme, rawSounds]);

  // ---- Re-init synths when sound theme changes ----
  // (vain kun ei "off" – ei tarvitse alustaa stubia)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (soundTheme !== "off") rawSounds.reinit();
  }, [soundTheme]);

  // ---- Music playback effect ----
  // Käynnistä/pysäytä musiikki kun musicOn tai musicTrack muuttuu, mutta vain
  // jos audioStarted on true (käyttäjä on antanut autoplay-luvan).
  const prevTrackRef = useRef(musicTrack);
  useEffect(() => {
    if (!audioStarted) return;
    if (musicOn) {
      if (prevTrackRef.current !== musicTrack) {
        prevTrackRef.current = musicTrack;
        music.restart();
      } else {
        music.start();
      }
    } else {
      music.stop();
    }
    return () => music.stop();
  }, [musicOn, music, audioStarted, musicTrack]);

  // ---- Global button-sound effect ----
  // Ensimmäinen pointerdown <button>:lla aktivoi audion ja soittaa btn-äänen.
  useEffect(() => {
    const handler = (e) => {
      if (e.target.closest("button")) {
        setAudioStarted(true);
        sounds.init().then(() => sounds.playBtn()).catch(() => {});
      }
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [sounds]);

  return {
    // State
    soundTheme,
    musicOn,
    musicTrack,
    audioStarted,
    // Setters
    setSoundTheme,
    setMusicOn,
    setMusicTrack,
    // Engines
    sounds,
    music,
    // Constants for UI (esim. MultiplayerHero näyttää track-nimet)
    musicTracks: MUSIC_TRACKS,
  };
}
