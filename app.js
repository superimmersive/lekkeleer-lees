const SENTENCES = [
  { af: "Die kat sit.", en: "The cat sits.", emoji: "🐱" },
  { af: "Die man staan.", en: "The man stands.", emoji: "🧍" },
  { af: "Die kat sit langs die man.", en: "The cat sits next to the man.", emoji: "🐱🧍" },
  { af: "Die kas is bruin.", en: "The cupboard is brown.", emoji: "🗄️" },
  { af: "Die mat is voor die kas.", en: "The mat is in front of the cupboard.", emoji: "🟫" },
  { af: "Die bad is vol.", en: "The bath is full.", emoji: "🛁" },
  { af: "Die kat sit op die mat.", en: "The cat sits on the mat.", emoji: "🐱" },
];

// TODO: move Azure TTS behind a backend before production use.
const AZURE_CONFIG = {
  key: "3YOctxgpAKK992nzHbyNsjZrgZ7m0XZJHP014ezUXurj6O9n1E71JQQJ99CCAC5RqLJXJ3w3AAAYACOGESVi",
  region: "westeurope",
  voices: {
    Adri: "af-ZA-AdriNeural",
    Willem: "af-ZA-WillemNeural",
  },
};

const MODE_TIPS = {
  listen:
    "🎤 Tik <strong>Begin Lees</strong> en lees die sin hardop — elke woord word groen! | Tap <strong>Begin Lees</strong> and read aloud!",
  listenNoSpeech:
    "😔 Spraakherkenning is slegs beskikbaar in Chrome. Gebruik Tik Modus.",
  tap:
    "👆 Tik <strong>Woord</strong> om een woord op 'n slag te leer. | Tap <strong>Word</strong> one at a time.",
  play:
    "🔊 Tik <strong>Speel</strong> om die sin te hoor. | Tap <strong>Play</strong> to hear the sentence.",
};

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
const hasSpeechRecognition = Boolean(SpeechRecognitionCtor);

const state = {
  current: 0,
  mode: "listen",
  listening: false,
  recognition: null,
  wordIndex: 0,
  expectedWord: 0,
  currentVoice: "Adri",
  currentSynth: null,
  sdkReady: false,
  sdkLoading: false,
  sdkResolvers: [],
  wordHighlightTimers: [],
  pendingSentenceCompletion: null,
  totals: {
    correct: 0,
    missed: 0,
  },
  sentence: {
    correct: 0,
    missed: 0,
  },
  completed: new Set(),
};

const els = {
  starsBar: document.getElementById("starsBar"),
  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  voiceButtons: Array.from(document.querySelectorAll("[data-voice]")),
  ttsStatus: document.getElementById("ttsStatus"),
  tipBar: document.getElementById("tipBar"),
  mainCard: document.getElementById("mainCard"),
  sentenceNum: document.getElementById("sentenceNum"),
  sentenceEmoji: document.getElementById("sentenceEmoji"),
  sentenceText: document.getElementById("sentenceText"),
  translation: document.getElementById("translation"),
  celebration: document.getElementById("celebration"),
  finalCorrect: document.getElementById("finalCorrect"),
  finalMissed: document.getElementById("finalMissed"),
  finalPct: document.getElementById("finalPct"),
  micStatus: document.getElementById("micStatus"),
  scoreChip: document.getElementById("scoreChip"),
  scoreCorrect: document.getElementById("scoreCorrect"),
  scoreMissed: document.getElementById("scoreMissed"),
  controls: document.getElementById("controls"),
  prevBtn: document.getElementById("prevBtn"),
  listenBtn: document.getElementById("listenBtn"),
  listenIcon: document.getElementById("listenIcon"),
  listenLabel: document.getElementById("listenLabel"),
  playBtn: document.getElementById("playBtn"),
  wordBtn: document.getElementById("wordBtn"),
  nextBtn: document.getElementById("nextBtn"),
  progressDots: document.getElementById("progressDots"),
  restartBtn: document.getElementById("restartBtn"),
};

const speechSynthesisService = {
  async loadSdk() {
    if (state.sdkReady) {
      return true;
    }

    return new Promise((resolve) => {
      state.sdkResolvers.push(resolve);
      if (state.sdkLoading) {
        return;
      }

      state.sdkLoading = true;
      const script = document.createElement("script");
      script.src = "https://aka.ms/csspeech/jsbrowserpackageraw";
      script.onload = () => {
        state.sdkReady = true;
        state.sdkLoading = false;
        state.sdkResolvers.forEach((callback) => callback(true));
        state.sdkResolvers = [];
      };
      script.onerror = () => {
        state.sdkLoading = false;
        state.sdkResolvers.forEach((callback) => callback(false));
        state.sdkResolvers = [];
      };
      document.head.appendChild(script);
    });
  },

  updateStatus(kind, message) {
    els.ttsStatus.className = `tts-status ${kind}`;
    els.ttsStatus.textContent = message;
  },

  async speak(text, rate = 1) {
    const sdkLoaded = await this.loadSdk();
    if (!sdkLoaded) {
      this.updateStatus("error", "⚠️ SDK laai fout");
      throw new Error("Azure SDK failed to load");
    }

    const SpeechSDK = window.SpeechSDK;
    const config = SpeechSDK.SpeechConfig.fromSubscription(AZURE_CONFIG.key, AZURE_CONFIG.region);
    config.speechSynthesisVoiceName = AZURE_CONFIG.voices[state.currentVoice];

    const synthesizer = new SpeechSDK.SpeechSynthesizer(config, null);
    state.currentSynth = synthesizer;

    const ratePercent = rate === 1 ? "+0%" : `${Math.round((rate - 1) * 100)}%`;
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='af-ZA'>
      <voice name='${AZURE_CONFIG.voices[state.currentVoice]}'>
        <prosody rate='${ratePercent}'>${escapeXml(text)}</prosody>
      </voice>
    </speak>`;

    this.updateStatus("busy", "🔊 ...");

    return new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (state.currentSynth === synthesizer) {
            state.currentSynth = null;
          }
          synthesizer.close();

          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            this.updateStatus("ok", "✅ Azure TTS");
            resolve(result);
            return;
          }

          this.updateStatus("error", "⚠️ Stem fout");
          reject(result);
        },
        (error) => {
          if (state.currentSynth === synthesizer) {
            state.currentSynth = null;
          }
          synthesizer.close();
          console.error("Azure TTS error:", error);
          this.updateStatus("error", "⚠️ Verbinding fout");
          reject(error);
        }
      );
    });
  },

  stop() {
    clearWordHighlightTimers();
    clearPendingSentenceCompletion();

    if (state.currentSynth) {
      try {
        state.currentSynth.close();
      } catch (error) {
        console.warn("Unable to stop synthesizer:", error);
      }
      state.currentSynth = null;
    }
  },
};

const recognitionService = {
  ensureReady() {
    if (!hasSpeechRecognition || state.recognition) {
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "af-ZA";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      processTranscript(transcript.toLowerCase().trim());
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        renderMicStatus("error", "🚫 Mikrofoon geweier. Gee toestemming in browser.");
      } else if (event.error === "no-speech") {
        renderMicStatus("ready", "🎤 Geen spraak — probeer weer...");
      } else {
        renderMicStatus("error", `⚠️ Fout: ${event.error}`);
      }
      stopListening();
    };

    recognition.onend = () => {
      if (!state.listening) {
        return;
      }

      try {
        recognition.start();
      } catch (error) {
        console.warn("Speech recognition restart failed:", error);
      }
    };

    state.recognition = recognition;
  },

  start() {
    this.ensureReady();
    if (!state.recognition) {
      return;
    }

    try {
      state.recognition.start();
    } catch (error) {
      console.warn("Speech recognition start failed:", error);
    }
  },

  stop() {
    if (!state.recognition) {
      return;
    }

    try {
      state.recognition.stop();
    } catch (error) {
      console.warn("Speech recognition stop failed:", error);
    }
  },
};

function init() {
  bindEvents();
  renderStars();
  renderVoiceButtons();
  setMode("listen");
}

function bindEvents() {
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.mode);
    });
  });

  els.voiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setVoice(button.dataset.voice);
    });
  });

  els.prevBtn.addEventListener("click", () => navigate(-1));
  els.nextBtn.addEventListener("click", () => navigate(1));
  els.listenBtn.addEventListener("click", toggleListen);
  els.playBtn.addEventListener("click", playAudio);
  els.wordBtn.addEventListener("click", readNextWord);
  els.restartBtn.addEventListener("click", restart);

  document.addEventListener("keydown", handleKeydown);
}

function handleKeydown(event) {
  if (els.celebration.classList.contains("show")) {
    return;
  }

  if (event.key === "ArrowRight") {
    navigate(1);
    return;
  }

  if (event.key === "ArrowLeft") {
    navigate(-1);
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    if (state.mode === "listen") {
      toggleListen();
    } else if (state.mode === "play") {
      playAudio();
    } else {
      readNextWord();
    }
  }
}

function getCurrentSentence() {
  return SENTENCES[state.current];
}

function getWordSpans() {
  return Array.from(els.sentenceText.querySelectorAll(".word-span"));
}

function setVoice(name) {
  state.currentVoice = name;
  renderVoiceButtons();
}

function renderVoiceButtons() {
  els.voiceButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.voice === state.currentVoice);
  });
}

function setMode(mode) {
  state.mode = mode;
  resetSentenceProgress();
  stopListening();
  speechSynthesisService.stop();
  renderModeButtons();
  renderControlVisibility();
  renderSentence();
  renderTip();
  renderMicStatusForMode();
  renderScoreChip();
  renderProgressDots();
}

function renderModeButtons() {
  els.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });
}

function renderControlVisibility() {
  els.listenBtn.classList.toggle("hidden", state.mode !== "listen");
  els.playBtn.classList.toggle("hidden", state.mode !== "play");
  els.wordBtn.classList.toggle("hidden", state.mode !== "tap");
  els.scoreChip.classList.toggle("hidden", state.mode !== "listen");
}

function renderSentence() {
  const sentence = getCurrentSentence();
  const words = sentence.af.split(" ");

  els.sentenceEmoji.textContent = sentence.emoji;
  els.sentenceNum.textContent = `${state.current + 1} / ${SENTENCES.length}`;
  els.translation.textContent = "";
  els.sentenceText.replaceChildren();

  words.forEach((word, index) => {
    const span = document.createElement("span");
    span.className = `word-span${state.mode === "listen" && index === 0 ? " active" : ""}`;
    span.textContent = word;
    span.dataset.index = String(index);
    span.dataset.word = normalizeWord(word);
    span.addEventListener("click", () => speakWord(span.dataset.word, span));
    els.sentenceText.appendChild(span);
  });
}

function renderTip() {
  if (state.mode === "listen") {
    els.tipBar.innerHTML = hasSpeechRecognition ? MODE_TIPS.listen : MODE_TIPS.listenNoSpeech;
    return;
  }

  els.tipBar.innerHTML = MODE_TIPS[state.mode];
}

function renderMicStatusForMode() {
  if (state.mode === "listen") {
    renderMicStatus("idle", hasSpeechRecognition ? "🎤 Gereed — tik Begin Lees!" : "Gebruik Chrome vir spraakherkenning");
    return;
  }

  if (state.mode === "tap") {
    renderMicStatus("idle", "👆 Tik Woord om te begin");
    return;
  }

  renderMicStatus("idle", "🔊 Tik Speel om te begin");
}

function renderMicStatus(status, message) {
  els.micStatus.className = `mic-status ${status}`;

  if (status === "hearing") {
    const wave = document.createElement("div");
    wave.className = "wave";
    for (let index = 0; index < 5; index += 1) {
      const bar = document.createElement("div");
      bar.className = "wave-bar";
      wave.appendChild(bar);
    }

    const label = document.createElement("span");
    label.textContent = "Hoor jou...";
    els.micStatus.replaceChildren(wave, label);
    return;
  }

  const dot = document.createElement("div");
  dot.className = "mic-dot";
  const label = document.createElement("span");
  label.textContent = message;
  els.micStatus.replaceChildren(dot, label);
}

function renderScoreChip() {
  if (state.mode !== "listen") {
    els.scoreChip.classList.add("hidden");
    return;
  }

  els.scoreChip.classList.remove("hidden");
  els.scoreCorrect.textContent = String(state.sentence.correct);
  els.scoreMissed.textContent = String(state.sentence.missed);
}

function renderStars() {
  els.starsBar.replaceChildren();

  for (let index = 0; index < SENTENCES.length; index += 1) {
    const star = document.createElement("span");
    star.className = "star";
    if (index < state.completed.size) {
      star.classList.add("earned");
    }
    star.textContent = "⭐";
    els.starsBar.appendChild(star);
  }
}

function renderProgressDots() {
  els.progressDots.replaceChildren();

  SENTENCES.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "dot";
    dot.classList.toggle("current", index === state.current);
    dot.classList.toggle("done2", state.completed.has(index));
    dot.addEventListener("click", () => {
      state.current = index;
      setMode(state.mode);
    });
    els.progressDots.appendChild(dot);
  });
}

function resetSentenceProgress() {
  state.wordIndex = 0;
  state.expectedWord = 0;
  state.sentence.correct = 0;
  state.sentence.missed = 0;
  clearPendingSentenceCompletion();
}

function clearPendingSentenceCompletion() {
  if (state.pendingSentenceCompletion) {
    clearTimeout(state.pendingSentenceCompletion);
    state.pendingSentenceCompletion = null;
  }
}

function clearWordHighlightTimers() {
  state.wordHighlightTimers.forEach((timer) => clearTimeout(timer));
  state.wordHighlightTimers = [];
}

function normalizeWord(word) {
  return word.replace(/[.,!?;:]/g, "").toLowerCase().trim();
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) => {
      if (rowIndex === 0) {
        return colIndex;
      }
      if (colIndex === 0) {
        return rowIndex;
      }
      return 0;
    })
  );

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      matrix[row][col] =
        a[row - 1] === b[col - 1]
          ? matrix[row - 1][col - 1]
          : 1 + Math.min(matrix[row - 1][col], matrix[row][col - 1], matrix[row - 1][col - 1]);
    }
  }

  return matrix[a.length][b.length];
}

function fuzzyMatch(spoken, expected) {
  if (spoken === expected) {
    return true;
  }

  return levenshtein(spoken, expected) <= (expected.length <= 3 ? 1 : 2);
}

function toggleListen() {
  if (!hasSpeechRecognition) {
    renderMicStatus("error", "😔 Gebruik Chrome op Android vir spraakherkenning.");
    return;
  }

  if (state.listening) {
    stopListening();
    return;
  }

  startListening();
}

function startListening() {
  recognitionService.ensureReady();
  speechSynthesisService.stop();
  resetSentenceProgress();
  state.listening = true;

  getWordSpans().forEach((span, index) => {
    span.className = `word-span ${index === 0 ? "active" : "pending"}`;
  });

  els.translation.textContent = "";
  els.mainCard.classList.add("listening");
  els.listenBtn.classList.add("active");
  els.listenIcon.textContent = "⏹";
  els.listenLabel.textContent = "Stop";
  renderScoreChip();
  renderMicStatus("ready", "🎤 Luister... Lees die sin hardop!");
  recognitionService.start();
}

function stopListening() {
  state.listening = false;
  recognitionService.stop();
  els.mainCard.classList.remove("listening");
  els.listenBtn.classList.remove("active");
  els.listenIcon.textContent = "🎤";
  els.listenLabel.textContent = "Begin Lees";
}

function processTranscript(transcript) {
  const spans = getWordSpans();
  const expectedWords = getCurrentSentence().af.split(" ").map(normalizeWord);
  const spokenWords = transcript.split(/\s+/).filter(Boolean);

  spokenWords.forEach((spokenWord) => {
    for (let lookAhead = 0; lookAhead < 3 && state.expectedWord + lookAhead < expectedWords.length; lookAhead += 1) {
      const index = state.expectedWord + lookAhead;
      if (!fuzzyMatch(spokenWord, expectedWords[index])) {
        continue;
      }

      for (let missedIndex = state.expectedWord; missedIndex < index; missedIndex += 1) {
        if (!spans[missedIndex].classList.contains("correct") && !spans[missedIndex].classList.contains("missed")) {
          spans[missedIndex].className = "word-span missed";
          state.sentence.missed += 1;
          state.totals.missed += 1;
        }
      }

      spans[index].className = "word-span correct";
      state.sentence.correct += 1;
      state.totals.correct += 1;
      state.expectedWord = index + 1;

      if (state.expectedWord < spans.length) {
        spans[state.expectedWord].className = "word-span active";
      } else {
        scheduleSentenceCompletion();
      }

      renderScoreChip();
      break;
    }
  });

  renderMicStatus("hearing", "");
}

function scheduleSentenceCompletion() {
  clearPendingSentenceCompletion();
  state.pendingSentenceCompletion = window.setTimeout(() => {
    state.pendingSentenceCompletion = null;
    sentenceComplete();
  }, 400);
}

function sentenceComplete() {
  stopListening();
  els.translation.textContent = getCurrentSentence().en;

  getWordSpans().forEach((span) => {
    if (!span.classList.contains("correct") && !span.classList.contains("missed")) {
      span.className = "word-span correct";
    }
  });

  awardStar();
  renderMicStatus("idle", "✅ Uitstekend! Gaan voort na die volgende sin.");
}

async function playAudio() {
  stopListening();
  speechSynthesisService.stop();
  resetSentenceProgress();

  const sentence = getCurrentSentence();
  const words = sentence.af.split(" ");
  const spans = getWordSpans();

  spans.forEach((span) => {
    span.className = "word-span";
  });

  const perWord = 480;
  words.forEach((_, index) => {
    const timer = window.setTimeout(() => {
      spans.forEach((span, spanIndex) => {
        span.classList.toggle("active", spanIndex === index);
        if (spanIndex < index) {
          span.classList.add("done");
        }
      });
    }, index * perWord);

    state.wordHighlightTimers.push(timer);
  });

  try {
    await speechSynthesisService.speak(sentence.af, 0.85);
  } catch (error) {
    return;
  }

  spans.forEach((span) => {
    span.classList.remove("active");
    span.classList.add("done");
  });

  els.translation.textContent = sentence.en;
  awardStar();
}

async function readNextWord() {
  stopListening();
  speechSynthesisService.stop();

  const spans = getWordSpans();
  if (state.wordIndex >= spans.length) {
    els.translation.textContent = getCurrentSentence().en;
    awardStar();
    state.wordIndex = 0;
    return;
  }

  const activeSpan = spans[state.wordIndex];
  spans.forEach((span, index) => {
    span.classList.toggle("active", index === state.wordIndex);
  });

  activeSpan.classList.add("done");
  state.wordIndex += 1;

  try {
    await speechSynthesisService.speak(activeSpan.dataset.word, 0.85);
  } catch (error) {
    return;
  }

  if (state.wordIndex === spans.length) {
    const timer = window.setTimeout(() => {
      els.translation.textContent = getCurrentSentence().en;
      awardStar();
    }, 400);
    state.wordHighlightTimers.push(timer);
  }
}

async function speakWord(word, span) {
  speechSynthesisService.stop();

  getWordSpans().forEach((wordSpan) => {
    if (wordSpan !== span) {
      wordSpan.classList.remove("active");
    }
  });

  span.classList.add("active");

  try {
    await speechSynthesisService.speak(word, 0.85);
  } catch (error) {
    return;
  }

  span.classList.remove("active");
}

function navigate(direction) {
  const nextIndex = state.current + direction;
  if (nextIndex < 0 || nextIndex >= SENTENCES.length) {
    return;
  }

  state.current = nextIndex;
  setMode(state.mode);
}

function awardStar() {
  if (state.completed.has(state.current)) {
    return;
  }

  state.completed.add(state.current);
  renderStars();
  renderProgressDots();

  if (state.completed.size === SENTENCES.length) {
    window.setTimeout(showCelebration, 900);
  }
}

function showCelebration() {
  confetti(70);

  const totalAttempts = state.totals.correct + state.totals.missed;
  const percentage = totalAttempts ? Math.round((state.totals.correct / totalAttempts) * 100) : 0;

  els.finalCorrect.textContent = String(state.totals.correct);
  els.finalMissed.textContent = String(state.totals.missed);
  els.finalPct.textContent = `${percentage}%`;

  [els.mainCard, els.controls, els.progressDots, els.micStatus, els.scoreChip].forEach((element) => {
    element.classList.add("hidden");
  });
  els.celebration.classList.add("show");
}

function restart() {
  state.current = 0;
  state.mode = "listen";
  state.completed.clear();
  state.totals.correct = 0;
  state.totals.missed = 0;
  resetSentenceProgress();
  stopListening();
  speechSynthesisService.stop();

  [els.mainCard, els.controls, els.progressDots, els.micStatus].forEach((element) => {
    element.classList.remove("hidden");
  });
  els.celebration.classList.remove("show");

  renderStars();
  setMode("listen");
}

function confetti(count) {
  const colors = ["#ffd93d", "#3b9ed4", "#2ecc71", "#ff6b9d", "#ff8c42", "#9b59b6"];

  for (let index = 0; index < count; index += 1) {
    const piece = document.createElement("div");
    piece.className = "confetti-p";
    piece.style.cssText = [
      `left:${Math.random() * 100}vw`,
      "top:-10px",
      `width:${6 + Math.random() * 8}px`,
      `height:${6 + Math.random() * 8}px`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `animation-duration:${1.5 + Math.random() * 2}s`,
      `animation-delay:${Math.random() * 0.8}s`,
    ].join(";");
    document.body.appendChild(piece);
    piece.addEventListener("animationend", () => piece.remove());
  }
}

function escapeXml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

document.addEventListener("DOMContentLoaded", init);
