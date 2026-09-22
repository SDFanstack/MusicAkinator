const MAX_ATTEMPTS = 3;
const STATS_KEY = 'elixirmix-stats-v1';

const el = {
  trackCount: document.getElementById('trackCount'),
  playerFrame: document.getElementById('playerFrame'),
  overlay: document.getElementById('overlay'),
  attempts: document.getElementById('attempts'),
  searchInput: document.getElementById('searchInput'),
  guessForm: document.getElementById('guessForm'),
  guessBtn: document.getElementById('guessBtn'),
  suggestions: document.getElementById('suggestions'),
  feedback: document.getElementById('feedback'),
  startBtn: document.getElementById('startBtn'),
  nextBtn: document.getElementById('nextBtn'),
  statRacha: document.getElementById('statRacha'),
  statMejor: document.getElementById('statMejor'),
  statAciertos: document.getElementById('statAciertos'),
};

let tracks = [];
let bag = [];
let current = null;
let attempts = 0;
let guessed = false;

let stats = loadStats();

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY)) || { racha: 0, mejorRacha: 0, aciertos: 0 };
  } catch (e) {
    return { racha: 0, mejorRacha: 0, aciertos: 0 };
  }
}

function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function renderStats() {
  el.statRacha.textContent = stats.racha;
  el.statMejor.textContent = stats.mejorRacha;
  el.statAciertos.textContent = stats.aciertos;
}

function normalize(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickField(row, candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const key = keys.find((k) => k.trim().toLowerCase() === candidate.toLowerCase());
    if (key && row[key]) return row[key].trim();
  }
  return '';
}

function extractId(uri) {
  if (!uri) return null;
  const match = uri.match(/track[:/]([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function refillBag() {
  bag = shuffle(tracks.map((_, i) => i));
}

function nextIndex() {
  if (!bag.length) refillBag();
  return bag.pop();
}

function loadPlaylist() {
  Papa.parse('playlist.csv', {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete(results) {
      tracks = results.data
        .map((row) => {
          const name = pickField(row, ['Track Name', 'Name', 'Titulo', 'Título']);
          const artist = pickField(row, ['Artist Name(s)', 'Artist Name', 'Artist', 'Artista']);
          const uri = pickField(row, ['Track URI', 'Spotify URI', 'URI']);
          return { name, artist, id: extractId(uri) };
        })
        .filter((t) => t.name && t.id);

      if (!tracks.length) {
        el.trackCount.textContent = 'No se pudo leer playlist.csv — revisa el archivo';
        el.startBtn.disabled = true;
        return;
      }

      el.trackCount.textContent = `${tracks.length} canciones cargadas`;
      el.startBtn.disabled = false;
    },
    error() {
      el.trackCount.textContent = 'No se pudo cargar playlist.csv';
      el.startBtn.disabled = true;
    },
  });
}

function updateAttemptsUI() {
  const dots = el.attempts.querySelectorAll('.attempts__dot');
  dots.forEach((dot, i) => dot.classList.toggle('spent', i < attempts));
}

function startRound() {
  current = tracks[nextIndex()];
  attempts = 0;
  guessed = false;

  el.feedback.textContent = '';
  el.feedback.className = 'feedback';
  el.suggestions.innerHTML = '';
  el.searchInput.value = '';
  el.searchInput.disabled = false;
  el.guessBtn.disabled = false;
  el.nextBtn.hidden = true;
  el.startBtn.hidden = true;
  el.overlay.classList.remove('revealed');
  updateAttemptsUI();

  el.playerFrame.src = `https://open.spotify.com/embed/track/${current.id}?utm_source=generator&theme=0`;
  el.searchInput.focus();
}

function reveal(success) {
  guessed = true;
  el.overlay.classList.add('revealed');
  el.searchInput.disabled = true;
  el.guessBtn.disabled = true;
  el.suggestions.innerHTML = '';
  el.nextBtn.hidden = false;

  if (success) {
    el.feedback.textContent = `Acertaste: "${current.name}" — ${current.artist}`;
    el.feedback.className = 'feedback feedback--hit';
    stats.aciertos += 1;
    stats.racha += 1;
    stats.mejorRacha = Math.max(stats.mejorRacha, stats.racha);
  } else {
    el.feedback.textContent = `Era "${current.name}" — ${current.artist}`;
    el.feedback.className = 'feedback feedback--reveal';
    stats.racha = 0;
  }
  saveStats();
  renderStats();
}

function submitGuess(rawValue) {
  if (guessed || !current) return;
  const guess = normalize(rawValue);
  if (!guess) return;

  const target = normalize(current.name);
  const isCorrect = guess === target || target.includes(guess) || guess.includes(target);

  if (isCorrect) {
    reveal(true);
    return;
  }

  attempts += 1;
  updateAttemptsUI();

  if (attempts >= MAX_ATTEMPTS) {
    reveal(false);
  } else {
    el.feedback.textContent = `No es esa. Fallo ${attempts} de ${MAX_ATTEMPTS}.`;
    el.feedback.className = 'feedback feedback--miss';
  }
}

function renderSuggestions(query) {
  el.suggestions.innerHTML = '';
  if (!query || guessed) return;

  const matches = tracks
    .filter((t) => normalize(t.name).includes(query) || normalize(t.artist).includes(query))
    .slice(0, 8);

  matches.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = `${t.name} — ${t.artist}`;
    li.tabIndex = 0;
    const choose = () => {
      el.searchInput.value = t.name;
      el.suggestions.innerHTML = '';
      submitGuess(t.name);
    };
    li.addEventListener('click', choose);
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') choose();
    });
    el.suggestions.appendChild(li);
  });
}

el.searchInput.addEventListener('input', () => {
  renderSuggestions(normalize(el.searchInput.value));
});

el.guessForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitGuess(el.searchInput.value);
});

el.startBtn.addEventListener('click', startRound);
el.nextBtn.addEventListener('click', startRound);

renderStats();
loadPlaylist();
