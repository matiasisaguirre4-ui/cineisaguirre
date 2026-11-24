const modalSpeed = $('#modalSpeed');
const modalMode = $('#modalMode');
const modalVideo = $('#modalVideo');
const modalIframe = $('#modalIframe');
const playerArea = $('#playerArea');
const recapOverlay = $('#recapOverlay');
const recapClose = $('#recapClose');
const recapText = $('#recapText');
const shortcutInd = $('#shortcutInd');
const infoModal = $('#infoModal');
const infoBanner = $('#infoBanner');
const infoClose = $('#infoClose');
const infoTitle = $('#infoTitle');
const infoMeta = $('#infoMeta');
const infoOverview = $('#infoOverview');
const infoExtra = $('#infoExtra');
const infoPlayBtn = $('#infoPlayBtn');
const infoTrailerBtn = $('#infoTrailerBtn');
const episodesBox = $('#episodesBox');
const seasonSelect = $('#seasonSelect');
const episodeList = $('#episodeList');
const keyModal = $('#keyModal');
const tmdbKeyInput = $('#tmdbKeyInput');
const geminiKeyInput = $('#geminiKeyInput');
const keySave = $('#keySave');
const keyCancel = $('#keyCancel');
const toastContainer = $('#toastContainer');

/* ═══════════════════════════════════════════════════
   HELPERS & KEYS
   ═══════════════════════════════════════════════════ */
function getTmdbKey() { return localStorage.getItem('tmdb_api_key') || TMDB_DEFAULT || '' }
function getGeminiKey() { return localStorage.getItem('gemini_api_key') || '' }

function cleanName(fileName) {
  if (!fileName) return 'Sin título';
  let n = fileName;
  n = n.replace(/\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg|3gp)$/i, '');
  n = n.replace(/\b(2160|1080|720|480|360)[pPiI]\b/g, '');
  n = n.replace(/\b(HDRip|BRRip|BDRip|BluRay|WEB-?DL|WEB-?Rip|HDTV|DVDRip|CAMRip|TS|HC|HEVC|x264|x265|H\.?264|H\.?265|AAC|AC3|DTS|DUAL|LATINO|CASTELLANO|ESPAÑOL|MULTI|REMUX|AMZN|NF|DSNP|HMAX|APTCH)\b/gi, '');
  n = n.replace(/[\[\(].*?[\]\)]/g, '');
  n = n.replace(/\b(19|20)\d{2}\b/g, '');
  n = n.replace(/[._\-]+/g, ' ');
  n = n.replace(/\s{2,}/g, ' ').trim();
  return n || 'Sin título';
}

function formatSize(mb) {
  if (!mb) return '';
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function toast(msg, type = 'info', duration = 3400) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'success' ? ' success' : type === 'ai' ? ' ai' : '');
  t.textContent = msg;
  toastContainer.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350) }, duration);
}

/* ═══════════════════════════════════════════════════
   GEMINI API CLIENT
   ═══════════════════════════════════════════════════ */
async function askGemini(promptText, expectJson = false) {
  const key = getGeminiKey();
  if (!key) {
    toast('Configurá tu API Key de Gemini tocando 🔑', 'ai');
    btnKeys.click();
    return null;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: { temperature: 0.3 }
  };
  if (expectJson) body.generationConfig.responseMimeType = 'application/json';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Error API Gemini: ' + res.status);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/* ═══════════════════════════════════════════════════
   PROGRESS TRACKING
   ═══════════════════════════════════════════════════ */
function saveProgress(id, currentTime, duration) {
  if (!id || !duration || duration < 1) return;
  const pct = currentTime / duration;
  if (pct < 0.01 || pct > 0.95) { localStorage.removeItem(PROGRESS_PREFIX + id); return }
  localStorage.setItem(PROGRESS_PREFIX + id, JSON.stringify({ t: currentTime, d: duration, ts: Date.now() }));
}

function getProgress(id) {
  try { const d = localStorage.getItem(PROGRESS_PREFIX + id); return d ? JSON.parse(d) : null } catch { return null }
}

function getAllProgress() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(PROGRESS_PREFIX)) {
      try { out[k.slice(PROGRESS_PREFIX.length)] = JSON.parse(localStorage.getItem(k)) } catch { }
    }
  }
  return out;
}

function getContinueItems() {
  const prog = getAllProgress();
  const items = [];
  // Películas empezadas
  movies.forEach(m => {
    const p = prog[m.id];
    if (p && p.t / p.d >= 0.01 && p.t / p.d <= 0.95) {
      items.push({ type: 'movie', item: m, video: m, prog: p, ts: p.ts || 0 });
    }
  });
  // Episodios de series empezados
  seriesList.forEach(s => {
    (s.episodes || []).forEach((ep, idx) => {
      const p = prog[ep.id];
      if (p && p.t / p.d >= 0.01 && p.t / p.d <= 0.95) {
        items.push({ type: 'series', item: s, video: ep, epIndex: idx, prog: p, ts: p.ts || 0 });
      }
    });
  });
  return items.sort((a, b) => b.ts - a.ts);
}

/* ═══════════════════════════════════════════════════
   TMDB SEARCH & DETAILS
   ═══════════════════════════════════════════════════ */
async function fetchTmdb(query, isTv = false) {
  const key = getTmdbKey();
  if (!key) return null;
  const cacheKey = (isTv ? 'tv:' : 'mv:') + query;
  if (tmdbCache[cacheKey] !== undefined) return tmdbCache[cacheKey];
  try {
    const ep = isTv ? 'search/tv' : 'search/movie';
    const res = await fetch(`https://api.themoviedb.org/3/${ep}?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&language=es-MX`);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.results && data.results[0] ? data.results[0] : null;
    tmdbCache[cacheKey] = r;
    return r;
  } catch { return null }
}

async function fetchTmdbDetails(tmdbId, isTv = false) {
  const key = getTmdbKey();
  if (!key || !tmdbId) return null;
  const cKey = (isTv ? 'tv:' : 'mv:') + tmdbId;
  if (detailsCache[cKey]) return detailsCache[cKey];
  try {
    const ep = isTv ? 'tv' : 'movie';
    const res = await fetch(`https://api.themoviedb.org/3/${ep}/${tmdbId}?api_key=${encodeURIComponent(key)}&language=es-MX&append_to_response=videos,credits`);
    if (!res.ok) return null;
    const data = await res.json();
    const vids = data.videos?.results || [];
    const yt = vids.find(v => v.site === 'YouTube' && v.type === 'Trailer') || vids.find(v => v.site === 'YouTube');
    const director = isTv ? (data.created_by || []).map(c => c.name).join(', ') : (data.credits?.crew?.find(c => c.job === 'Director')?.name || '');
    const cast = (data.credits?.cast || []).slice(0, 5).map(c => c.name).join(', ');
    const runtime = isTv ? (data.episode_run_time?.[0] || 0) : (data.runtime || 0);
    const info = { trailerKey: yt?.key || null, director, cast, runtime };
    detailsCache[cKey] = info;
    return info;
  } catch { return null }
}

/* ═══════════════════════════════════════════════════
   RENDER: STATS & GENRE PILLS
   ═══════════════════════════════════════════════════ */
function renderStats() {
  if (!stats) { statsBadge.style.display = 'none'; return }
  const sCount = seriesList.length ? ` • 📺 ${seriesList.length} series` : '';
  statsMovies.textContent = `🎬 ${stats.totalMovies ?? movies.length} pelis${sCount}`;
  const used = stats.folderUsedGB != null ? stats.folderUsedGB.toFixed(1) : '?';
  const free = stats.driveFreeGB != null ? stats.driveFreeGB.toFixed(1) : '?';
  statsStorage.textContent = `💾 ${used} GB / ${free} GB libres`;
  statsBadge.style.display = '';
}

function renderGenrePills() {
  const genreIds = new Set();
  const pool = activeTab === 'series' ? seriesList : activeTab === 'movies' ? movies : [...movies, ...seriesList];
  pool.forEach(m => (m._tmdb?.genre_ids || []).forEach(id => { if (GENRE_MAP[id]) genreIds.add(id) }));
  controlsBar.style.display = '';
  genrePills.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'genre-pill' + (selectedGenre === 'all' ? ' active' : '');
  allBtn.textContent = `Todas (${pool.length})`;
  allBtn.onclick = () => { selectedGenre = 'all'; aiFilterIds = null; aiBannerBox.style.display = 'none'; renderGenrePills(); applyFiltersAndSort() };
  genrePills.appendChild(allBtn);

  Array.from(genreIds).sort((a, b) => GENRE_MAP[a].localeCompare(GENRE_MAP[b])).forEach(id => {
    const btn = document.createElement('button');
    btn.className = 'genre-pill' + (String(selectedGenre) === String(id) ? ' active' : '');
    btn.textContent = GENRE_MAP[id];
    btn.onclick = () => { selectedGenre = id; aiFilterIds = null; aiBannerBox.style.display = 'none'; renderGenrePills(); applyFiltersAndSort() };
    genrePills.appendChild(btn);
  });
}

/* ═══════════════════════════════════════════════════
   RENDER: CONTINUE WATCHING & SERIES ROW
   ═══════════════════════════════════════════════════ */
function renderContinue() {
  const list = getContinueItems();
  if (list.length === 0 || activeTab !== 'all') { continueSection.style.display = 'none'; return }
  continueSection.style.display = '';
  continueRow.innerHTML = '';
  const frag = document.createDocumentFragment();
  list.forEach(entry => {
    const pct = Math.round((entry.prog.t / entry.prog.d) * 100);
    const tmdb = entry.item._tmdb;
    const baseName = tmdb?.title || tmdb?.name || entry.item._clean;
    const label = entry.type === 'series' ? `${baseName} • T${entry.video.season}:E${entry.video.episode}` : baseName;

    const div = document.createElement('div');
    div.className = 'continue-card';
    div.tabIndex = 0;
    div.dataset.id = entry.item.id;
    div.dataset.kind = entry.type;

    let imgHtml = '';
    if (tmdb?.backdrop_path) imgHtml = `<img src="${TMDB_IMG}w500${tmdb.backdrop_path}" alt="${label}" loading="lazy">`;
    else if (tmdb?.poster_path) imgHtml = `<img src="${TMDB_IMG}w500${tmdb.poster_path}" alt="${label}" loading="lazy">`;
    else imgHtml = `<div class="cc-fallback">${label}</div>`;

    div.innerHTML = `${imgHtml}<div class="cc-overlay"><div class="cc-title">${label}</div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div>`;
    div.addEventListener('mouseenter', () => {
      const idx = focusPool.indexOf(div);
      if (idx !== -1) setFocusAt(idx, false);
      else scheduleHero(entry.item, entry.type === 'series');
    });
    div.addEventListener('click', () => {
      if (entry.type === 'series') openPlayer(entry.video, entry.item, entry.epIndex);
      else openPlayer(entry.video);
    });
    frag.appendChild(div);
  });
  continueRow.appendChild(frag);
}

function renderSeriesRow() {
  if (seriesList.length === 0 || activeTab !== 'all' || aiFilterIds) { seriesSection.style.display = 'none'; return }
  seriesSection.style.display = '';
  seriesRow.innerHTML = '';
  const frag = document.createDocumentFragment();
  seriesList.forEach(s => {
    const card = createCard(s, true);
    card.style.width = '175px';
    card.style.flexShrink = '0';
    frag.appendChild(card);
  });
  seriesRow.appendChild(frag);
}

/* ═══════════════════════════════════════════════════
   RENDER: CARDS & GRID
   ═══════════════════════════════════════════════════ */
function createCard(item, isSeries = false) {
  const div = document.createElement('div');
  div.className = 'card';
  div.tabIndex = 0;
  div.dataset.id = item.id;
  div.dataset.kind = isSeries ? 'series' : 'movie';
  const tmdb = item._tmdb;
  const title = tmdb?.title || tmdb?.name || item._clean;
  const subText = isSeries ? `${item.totalEpisodes || item.episodes?.length || 0} episodios` : formatSize(item.sizeMB);

  let progHtml = '';
  if (!isSeries) {
    const prog = getProgress(item.id);
    if (prog) { const pct = Math.round((prog.t / prog.d) * 100); progHtml = `<div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>` }
  }

  const badgeHtml = isSeries ? `<span class="card-badge-top">SERIE</span>` : '';

  if (tmdb?.poster_path) {
    div.innerHTML = `
      ${badgeHtml}
      <img src="${TMDB_IMG}w500${tmdb.poster_path}" alt="${title}" loading="lazy"
           onerror="this.nextElementSibling.style.display='flex';this.style.display='none'">
      <div class="card-fallback" style="display:none"><span class="fallback-icon">${isSeries ? '📺' : '🎬'}</span><span class="fallback-name">${title}</span><span class="fallback-size">${subText}</span></div>
      <div class="card-overlay"><span class="card-title">${title}</span>${tmdb.vote_average ? `<span class="card-rating">⭐ ${tmdb.vote_average.toFixed(1)}</span>` : ''}<span class="card-size">${subText}</span></div>${progHtml}`;
  } else {
    div.innerHTML = `${badgeHtml}<div class="card-fallback"><span class="fallback-icon">${isSeries ? '📺' : '🎬'}</span><span class="fallback-name">${title}</span><span class="fallback-size">${subText}</span></div>${progHtml}`;
  }

  div.addEventListener('mouseenter', () => {
    const idx = focusPool.indexOf(div);
    if (idx !== -1) setFocusAt(idx, false);
    else scheduleHero(item, isSeries);
  });
  div.addEventListener('click', () => {
    if (isSeries) openInfoModal(item, true);
    else openPlayer(item);
  });
  return div;
}

function renderGrid(list) {
  movieGrid.innerHTML = '';
  sectionCount.textContent = `${list.length} ${list.length === 1 ? 'título' : 'títulos'}`;
  if (list.length === 0) {
    movieGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="empty-icon">🔍</span><span class="empty-text">No se encontraron resultados</span></div>`;
    updateFocusPool();
    return;
  }
  const frag = document.createDocumentFragment();
  list.forEach(entry => frag.appendChild(createCard(entry.item, entry.isSeries)));
  movieGrid.appendChild(frag);
  updateFocusPool();
}

/* ═══════════════════════════════════════════════════
   RENDER: HERO DINÁMICO
   ═══════════════════════════════════════════════════ */
function scheduleHero(item, isSeries = false) {
  if (!item || heroItem?.item?.id === item.id) return;
  clearTimeout(heroTimer);
  heroTimer = setTimeout(() => setHero(item, isSeries), 100);
}

async function setHero(item, isSeries = false) {
  if (!item) return;
  heroItem = { item, isSeries };
  const tmdb = item._tmdb;
  const title = tmdb?.title || tmdb?.name || item._clean;
  heroTitle.textContent = title;
  heroOverview.textContent = tmdb?.overview || (isSeries ? `Serie disponible con ${item.totalEpisodes} episodios en Cine Isaguirre.` : `Disfrutá de "${title}" en Cine Isaguirre.`);
  heroBadge.textContent = isSeries ? 'SERIE' : 'HD';
  heroBadge.classList.toggle('series-badge', isSeries);
  heroSize.textContent = isSeries ? `${item.totalEpisodes || item.episodes?.length || 0} eps.` : formatSize(item.sizeMB);
  heroPlay.textContent = isSeries ? '▶ Ver episodios' : '▶ Reproducir ahora';

  if (tmdb?.vote_average) { heroRating.textContent = '⭐ ' + tmdb.vote_average.toFixed(1); heroRating.style.display = '' }
  else heroRating.style.display = 'none';

  const dateStr = tmdb?.release_date || tmdb?.first_air_date || '';
  if (dateStr) { heroYear.textContent = dateStr.split('-')[0]; heroYear.style.display = '' }
  else heroYear.style.display = 'none';

  heroGenres.innerHTML = '';
  (tmdb?.genre_ids || []).slice(0, 3).forEach(gid => {
    if (GENRE_MAP[gid]) {
      const span = document.createElement('span');
      span.className = 'hero-genre-pill';
      span.textContent = GENRE_MAP[gid];
      heroGenres.appendChild(span);
    }
  });

  let newBg = 'linear-gradient(135deg,#1a0a0a 0%,#0a0a1a 100%)';
  if (tmdb?.backdrop_path) newBg = `url("${TMDB_IMG}original${tmdb.backdrop_path}")`;
  else if (tmdb?.poster_path) newBg = `url("${TMDB_IMG}original${tmdb.poster_path}")`;
  if (hero.style.backgroundImage !== newBg) hero.style.backgroundImage = newBg;

  heroContent.style.display = '';

  heroTrailer.style.display = 'none';
  if (tmdb?.id) {
    const det = await fetchTmdbDetails(tmdb.id, isSeries);
    if (heroItem?.item?.id === item.id && det?.trailerKey) {
      heroTrailer.style.display = '';
      heroTrailer.onclick = () => openTrailer(item, det.trailerKey, isSeries);
    }
  }
}

/* ═══════════════════════════════════════════════════
   PLAYER, RECAP SIN SPOILERS Y SIGUIENTE EPISODIO
   ═══════════════════════════════════════════════════ */
function openPlayer(videoObj, seriesObj = null, epIndex = 0) {
  currentPlayObj = { video: videoObj, series: seriesObj, epIndex };
  playerOpen = true;
  recapOverlay.style.display = 'none';

  const title = seriesObj
    ? `${seriesObj._tmdb?.name || seriesObj._clean} — T${videoObj.season}:E${videoObj.episode}`
    : (videoObj._tmdb?.title || videoObj._clean);

  modalTitle.textContent = title;
  modalDownload.href = videoObj.streamUrl || '#';
  modalSpeed.style.display = '';
  modalMode.style.display = '';
  speedIdx = 0; modalSpeed.textContent = '⚡ 1x';
  playerMode = 'html5';

  // Botón Siguiente Episodio si es una serie y hay más capítulos
  if (seriesObj && seriesObj.episodes && epIndex < seriesObj.episodes.length - 1) {
    modalNextEp.style.display = '';
    modalNextEp.onclick = () => openPlayer(seriesObj.episodes[epIndex + 1], seriesObj, epIndex + 1);
  } else {
    modalNextEp.style.display = 'none';
  }

  // Botón Recap "Hasta donde me quedé" si tiene progreso guardado
  const prog = getProgress(videoObj.id);
  modalRecap.style.display = (prog && prog.t > 20) ? '' : 'none';

  applyPlayerMode(videoObj);
  playerModal.classList.add('active');
  document.body.style.overflow = 'hidden';

  if (prog && prog.t > 0) {
    modalVideo.addEventListener('loadedmetadata', function resume() {
      modalVideo.currentTime = prog.t;
      modalVideo.removeEventListener('loadedmetadata', resume);
    });
  }

  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (playerMode === 'html5' && modalVideo.duration) {
      saveProgress(videoObj.id, modalVideo.currentTime, modalVideo.duration);
      if (modalVideo.currentTime > 20) modalRecap.style.display = '';
    }
  }, SAVE_INTERVAL);
}

// ── Función 1 de Gemini: Recap Sin Spoilers hasta el minuto pausado ──
modalRecap.addEventListener('click', async () => {
  if (!currentPlayObj) return;
  const v = modalVideo;
  const curSec = v.currentTime || getProgress(currentPlayObj.video.id)?.t || 0;
  const durSec = v.duration || getProgress(currentPlayObj.video.id)?.d || 0;
  const pct = durSec > 0 ? Math.round((curSec / durSec) * 100) : 30;

  if (!v.paused) v.pause();
  recapOverlay.style.display = '';
  recapText.textContent = '✨ Gemini está recordando la historia hasta este minuto sin spoilers…';

  const item = currentPlayObj.series || currentPlayObj.video;
  const name = item._tmdb?.title || item._tmdb?.name || item._clean;
  const overview = item._tmdb?.overview || '';
  const epNote = currentPlayObj.series ? ` (Temporada ${currentPlayObj.video.season}, Episodio ${currentPlayObj.video.episode})` : '';

  const prompt = `Sos un asistente de cine. El usuario está retomando "${name}"${epNote} exactamente en el minuto ${formatTime(curSec)} (aproximadamente al ${pct}% de duración).
Sinopsis oficial: "${overview}".
Regla estricta: Hacé un resumen corto (3 a 4 oraciones en español rioplatense/latino) de qué venía pasando en la trama hasta aproximadamente ese punto (${pct}%) para refrescarle la memoria. PROHIBIDO contar giros o eventos que pasen después del ${pct}% o el final.`;

  try {
    const reply = await askGemini(prompt, false);
    if (reply) recapText.textContent = reply;
  } catch {
    recapText.textContent = '⚠️ No se pudo conectar con Gemini. Verificá tu API Key en 🔑.';
  }
});
recapClose.addEventListener('click', () => { recapOverlay.style.display = 'none' });

function openTrailer(item, youtubeKey, isSeries = false) {
  currentPlayObj = null; playerOpen = true;
  recapOverlay.style.display = 'none';
  modalRecap.style.display = 'none';
  modalNextEp.style.display = 'none';
  modalTitle.textContent = `Tráiler — ${item._tmdb?.title || item._tmdb?.name || item._clean}`;
  modalDownload.href = '#';
  modalSpeed.style.display = 'none';
  modalMode.style.display = 'none';
  modalVideo.style.display = 'none';
  modalVideo.pause(); modalVideo.removeAttribute('src');
  modalIframe.style.display = '';
  modalIframe.src = `https://www.youtube.com/embed/${youtubeKey}?autoplay=1&rel=0`;
  playerModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function applyPlayerMode(videoObj) {
  if (playerMode === 'html5') {
    modalVideo.style.display = ''; modalIframe.style.display = 'none';
    modalIframe.src = 'about:blank';
    modalVideo.src = videoObj.streamUrl || '';
    modalVideo.playbackRate = SPEEDS[speedIdx];
    modalSpeed.style.display = '';
    modalMode.textContent = '📺 Embed';
    modalVideo.onerror = () => {
      toast('Video HTML5 no disponible, cambiando a Embed…');
      playerMode = 'embed'; applyPlayerMode(videoObj);
    };
  } else {
    modalVideo.style.display = 'none'; modalIframe.style.display = '';
    modalSpeed.style.display = 'none';
    modalVideo.pause(); modalVideo.removeAttribute('src'); modalVideo.load();
    modalIframe.src = videoObj.embedUrl || 'about:blank';
    modalMode.textContent = '🎬 HTML5';
  }
}

function closePlayer() {
  if (currentPlayObj && playerMode === 'html5' && modalVideo.duration) {
    saveProgress(currentPlayObj.video.id, modalVideo.currentTime, modalVideo.duration);
  }
  clearInterval(progressTimer);
  playerOpen = false; currentPlayObj = null;
  recapOverlay.style.display = 'none';
  playerModal.classList.remove('active');
  modalVideo.pause(); modalVideo.removeAttribute('src'); modalVideo.load();
  modalIframe.src = 'about:blank';
  document.body.style.overflow = '';
  renderContinue();
  applyFiltersAndSort();
}

modalSpeed.addEventListener('click', () => {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  const spd = SPEEDS[speedIdx];
  modalVideo.playbackRate = spd;
  modalSpeed.textContent = `⚡ ${spd}x`;
  showIndicator('⚡', `${spd}x`);
});
modalMode.addEventListener('click', () => {
  if (!currentPlayObj) return;
  playerMode = playerMode === 'html5' ? 'embed' : 'html5';
  applyPlayerMode(currentPlayObj.video);
});
modalClose.addEventListener('click', closePlayer);
playerModal.addEventListener('click', e => { if (e.target === playerModal) closePlayer() });

/* ═══════════════════════════════════════════════════
   DETAILS & SERIES EPISODES MODAL
   ═══════════════════════════════════════════════════ */
async function openInfoModal(item, isSeries = false) {
  if (!item) return;
  infoItem = { item, isSeries };
  const tmdb = item._tmdb;
  const title = tmdb?.title || tmdb?.name || item._clean;
  infoTitle.textContent = title;
  infoOverview.textContent = tmdb?.overview || (isSeries ? `Serie disponible en Google Drive.` : `Archivo disponible en Google Drive (${item.fileName || title}).`);

  const bg = tmdb?.backdrop_path ? `${TMDB_IMG}original${tmdb.backdrop_path}` : (tmdb?.poster_path ? `${TMDB_IMG}original${tmdb.poster_path}` : '');
  infoBanner.style.backgroundImage = bg ? `url("${bg}")` : 'linear-gradient(135deg,#2a0a0a,#111)';

  const metaParts = [];
  if (tmdb?.vote_average) metaParts.push(`<span style="color:#46d369;font-weight:700">⭐ ${tmdb.vote_average.toFixed(1)}</span>`);
  const dateStr = tmdb?.release_date || tmdb?.first_air_date || '';
  if (dateStr) metaParts.push(`<span>📅 ${dateStr.split('-')[0]}</span>`);
  if (isSeries) metaParts.push(`<span>📺 ${item.episodes?.length || 0} episodios</span>`);
  else if (item.sizeMB) metaParts.push(`<span>💾 ${formatSize(item.sizeMB)}</span>`);
  const gNames = (tmdb?.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean).join(', ');
  if (gNames) metaParts.push(`<span>🎭 ${gNames}</span>`);
  infoMeta.innerHTML = metaParts.join(' • ');

  infoExtra.innerHTML = '';
  infoTrailerBtn.style.display = 'none';

  if (isSeries) {
    episodesBox.style.display = '';
    renderSeriesEpisodes(item);
    infoPlayBtn.textContent = '▶ Reproducir T1:E1';
    infoPlayBtn.onclick = () => { closeInfoModal(); if (item.episodes?.[0]) openPlayer(item.episodes[0], item, 0) };
  } else {
    episodesBox.style.display = 'none';
    infoPlayBtn.textContent = '▶ Reproducir ahora';
    infoPlayBtn.onclick = () => { closeInfoModal(); openPlayer(item) };
  }

  infoModal.classList.add('active');

  if (tmdb?.id) {
    const det = await fetchTmdbDetails(tmdb.id, isSeries);
    if (det && infoItem?.item?.id === item.id) {
      const lines = [];
      if (det.runtime) lines.push(`<strong>Duración:</strong> ${det.runtime} min`);
      if (det.director) lines.push(`<strong>${isSeries ? 'Creadores' : 'Dirección'}:</strong> ${det.director}`);
      if (det.cast) lines.push(`<strong>Reparto:</strong> ${det.cast}`);
      infoExtra.innerHTML = lines.join('<br>');
      if (det.trailerKey) {
        infoTrailerBtn.style.display = '';
        infoTrailerBtn.onclick = () => { closeInfoModal(); openTrailer(item, det.trailerKey, isSeries) };
      }
    }
  }
}

function renderSeriesEpisodes(seriesObj) {
  const eps = seriesObj.episodes || [];
  const seasons = [...new Set(eps.map(e => e.season || 1))].sort((a, b) => a - b);
  seasonSelect.innerHTML = '';
  seasons.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = `Temporada ${s}`;
    seasonSelect.appendChild(opt);
  });

  const drawSeason = (sNum) => {
    episodeList.innerHTML = '';
    eps.filter(e => (e.season || 1) === Number(sNum)).forEach(ep => {
      const globalIdx = eps.indexOf(ep);
      const prog = getProgress(ep.id);
      const pct = prog ? Math.round((prog.t / prog.d) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'ep-item';
      row.innerHTML = `
        <div class="ep-num">E${String(ep.episode).padStart(2, '0')}</div>
        <div class="ep-info">
          <div class="ep-name">${ep.name || ep.fileName}</div>
          <div class="ep-sub">${formatSize(ep.sizeMB)}</div>
        </div>
        ${pct > 0 ? `<div class="ep-prog"><div class="ep-prog-fill" style="width:${pct}%"></div></div>` : ''}
      `;
      row.onclick = () => { closeInfoModal(); openPlayer(ep, seriesObj, globalIdx) };
      episodeList.appendChild(row);
    });
  };

  seasonSelect.onchange = () => drawSeason(seasonSelect.value);
  drawSeason(seasons[0] || 1);
}

function closeInfoModal() { infoModal.classList.remove('active'); infoItem = null }
infoClose.addEventListener('click', closeInfoModal);
infoModal.addEventListener('click', e => { if (e.target === infoModal) closeInfoModal() });

/* ═══════════════════════════════════════════════════
   FUNCIONES 2 Y 3 DE GEMINI: BÚSQUEDA POR ESCENAS Y VOZ
   ═══════════════════════════════════════════════════ */
function buildCatalogSummaryForAI() {
  const all = [
    ...movies.map(m => ({ id: m.id, tipo: 'pelicula', titulo: m._tmdb?.title || m._clean, sinopsis: (m._tmdb?.overview || '').slice(0, 220) })),
    ...seriesList.map(s => ({ id: s.id, tipo: 'serie', titulo: s._tmdb?.name || s._clean, sinopsis: (s._tmdb?.overview || '').slice(0, 220) }))
  ];
  return JSON.stringify(all);
}

async function runGeminiSceneSearch(userQuery) {
  if (!userQuery.trim()) return;
  btnAiSearch.classList.add('ai-active');
  toast('✨ Gemini está buscando en tu catálogo…', 'ai');

  const prompt = `Tenés este catálogo disponible en Google Drive del usuario:
${buildCatalogSummaryForAI()}

Consulta del usuario: "${userQuery}"

Identificá qué películas o series del catálogo coinciden con la escena, personaje, trama o descripción pedida (usando tu conocimiento general sobre esas películas/series y sus sinopsis).
Devolvé EXCLUSIVAMENTE un JSON válido con este formato:
{"ids":["id1","id2"],"respuesta":"Explicación corta y directa en español de por qué coinciden"}`;

  try {
    const raw = await askGemini(prompt, true);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    aiFilterIds = Array.isArray(parsed.ids) ? parsed.ids : [];
    aiBannerText.innerHTML = `<strong>✨ Gemini:</strong> ${parsed.respuesta || 'Resultados encontrados en tu Drive.'}`;
    aiBannerBox.style.display = '';
    applyFiltersAndSort();
    if (aiFilterIds.length > 0) {
      const first = movies.find(m => m.id === aiFilterIds[0]) || seriesList.find(s => s.id === aiFilterIds[0]);
      if (first) setHero(first, seriesList.some(s => s.id === first.id));
    }
  } catch {
    toast('⚠️ Error al consultar Gemini. Revisá tu API Key en 🔑.');
  } finally {
    btnAiSearch.classList.remove('ai-active');
  }
}

btnAiSearch.addEventListener('click', () => {
  searchWrap.classList.add('open');
  const q = searchInput.value.trim();
  if (q) runGeminiSceneSearch(q);
  else {
    searchInput.focus();
    toast('Escribí una escena o personaje y tocá ✨ IA (o Enter)', 'ai');
  }
});

aiBannerClose.addEventListener('click', () => {
  aiFilterIds = null;
  aiBannerBox.style.display = 'none';
  searchInput.value = '';
  applyFiltersAndSort();
});

// ── Función 3: Asistente por Voz desde el sillón (Web Speech + Gemini) ──
function startVoiceAssistant() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    toast('Tu navegador no soporta reconocimiento de voz');
    return;
  }
  const rec = new SpeechRec();
  rec.lang = 'es-AR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  btnVoice.classList.add('listening');
  toast('🎤 Escuchando comando… (ej: "Poneme Terminator 2")', 'ai', 4000);

  rec.onresult = async (event) => {
    const spoken = event.results[0][0].transcript;
    toast(`🗣️ "${spoken}"`, 'ai');

    const prompt = `Sos el control por voz de Cine Isaguirre.
Catálogo disponible: ${buildCatalogSummaryForAI()}
El usuario dijo: "${spoken}"

Interpretá qué quiere hacer y devolvé EXCLUSIVAMENTE un JSON con uno de estos comandos:
- Reproducir una peli o serie: {"accion":"play","id":"ID_DEL_CATALOGO"}
- Abrir sección ("all", "movies" o "series"): {"accion":"tab","tab":"series"}
- Buscar escena/tema o filtrar: {"accion":"search","query":"texto a buscar"}
- Activar o desactivar modo TV: {"accion":"tv","estado":true}`;

    try {
      const raw = await askGemini(prompt, true);
      if (!raw) return;
      const cmd = JSON.parse(raw);
      if (cmd.accion === 'play' && cmd.id) {
        const mv = movies.find(m => m.id === cmd.id);
        if (mv) { openPlayer(mv); return }
        const sr = seriesList.find(s => s.id === cmd.id);
        if (sr) { openInfoModal(sr, true); return }
      } else if (cmd.accion === 'tab' && cmd.tab) {
        switchTab(cmd.tab);
      } else if (cmd.accion === 'tv') {
        applyTvMode(!!cmd.estado);
      } else if (cmd.accion === 'search' && cmd.query) {
        searchWrap.classList.add('open');
        searchInput.value = cmd.query;
        runGeminiSceneSearch(cmd.query);
      }
    } catch {
      // Fallback directo si no hay Gemini Key configurada
      searchWrap.classList.add('open');
      searchInput.value = spoken;
      applyFiltersAndSort();
    }
  };

  rec.onerror = () => toast('No se pudo escuchar el micrófono');
  rec.onend = () => btnVoice.classList.remove('listening');
  rec.start();
}
btnVoice.addEventListener('click', startVoiceAssistant);

/* ═══════════════════════════════════════════════════
   SHORTCUT INDICATOR & KEYBOARD
   ═══════════════════════════════════════════════════ */
let siTimer = null;
function showIndicator(icon, text) {
  shortcutInd.querySelector('.si-icon').textContent = icon;
  shortcutInd.querySelector('.si-text').textContent = text;
  shortcutInd.classList.add('show');
  clearTimeout(siTimer);
  siTimer = setTimeout(() => shortcutInd.classList.remove('show'), 700);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'BrowserBack') {
    if (keyModal.classList.contains('active')) { keyModal.classList.remove('active'); return }
    if (infoModal.classList.contains('active')) { closeInfoModal(); return }
    if (playerOpen) { closePlayer(); return }
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); searchWrap.classList.add('open'); searchInput.focus(); return;
  }

  if (e.target === searchInput && e.key === 'Enter') {
    const q = searchInput.value.trim();
    if (q.split(' ').length >= 3 || q.includes('?')) runGeminiSceneSearch(q);
    return;
  }

  if (playerOpen && playerMode === 'html5') {
    const v = modalVideo;
    switch (e.key) {
      case ' ': e.preventDefault(); if (v.paused) { v.play(); showIndicator('▶', 'Play') } else { v.pause(); showIndicator('⏸', 'Pausa') }; break;
      case 'f': case 'F': e.preventDefault(); if (!document.fullscreenElement) { playerArea.requestFullscreen?.(); showIndicator('⛶', 'Pantalla completa') } else { document.exitFullscreen?.(); showIndicator('⊡', 'Salir fullscreen') }; break;
      case 'm': case 'M': v.muted = !v.muted; showIndicator(v.muted ? '🔇' : '🔊', v.muted ? 'Silenciado' : 'Sonido'); break;
      case 'ArrowLeft': e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); showIndicator('⏪', '−10s'); break;
      case 'ArrowRight': e.preventDefault(); v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); showIndicator('⏩', '+10s'); break;
    }
    return;
  }

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || infoModal.classList.contains('active')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(e.key)) {
    e.preventDefault();
    navigateSpatial(e.key);
  }
});

/* ═══════════════════════════════════════════════════
   SPATIAL NAVIGATION (ACTUALIZA EL BANNER AL MOVERSE)
   ═══════════════════════════════════════════════════ */
function updateFocusPool() {
  focusPool = Array.from(document.querySelectorAll('.continue-card,#seriesRow .card,#movieGrid .card'));
  if (focusIndex >= focusPool.length) focusIndex = focusPool.length - 1;
  if (focusIndex >= 0 && focusPool[focusIndex]) focusPool[focusIndex].classList.add('focused');
}

function setFocusAt(idx, shouldScroll = true) {
  if (idx < 0 || idx >= focusPool.length) return;
  focusPool.forEach(el => el.classList.remove('focused'));
  focusIndex = idx;
  const el = focusPool[idx];
  el.classList.add('focused');
  if (shouldScroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });

  const isSeries = el.dataset.kind === 'series';
  const list = isSeries ? seriesList : movies;
  const found = list.find(x => String(x.id) === String(el.dataset.id));
  if (found) scheduleHero(found, isSeries);
}

function navigateSpatial(key) {
  updateFocusPool();
  if (focusPool.length === 0) return;
  if (focusIndex < 0) { setFocusAt(0); return }

  const gridCards = Array.from(movieGrid.querySelectorAll('.card'));
  let cols = 1;
  if (gridCards.length >= 2) {
    const r0 = gridCards[0].getBoundingClientRect();
    const r1 = gridCards[1].getBoundingClientRect();
    if (Math.abs(r0.top - r1.top) < 5) {
      cols = gridCards.filter(c => Math.abs(c.getBoundingClientRect().top - r0.top) < 5).length;
    }
  }

  const topCount = focusPool.length - gridCards.length;
  const inGrid = focusIndex >= topCount;

  switch (key) {
    case 'ArrowRight': setFocusAt(Math.min(focusIndex + 1, focusPool.length - 1)); break;
    case 'ArrowLeft': setFocusAt(Math.max(focusIndex - 1, 0)); break;
    case 'ArrowDown':
      if (!inGrid) setFocusAt(Math.min(topCount, focusPool.length - 1));
      else setFocusAt(Math.min(focusIndex + cols, focusPool.length - 1));
      break;
    case 'ArrowUp':
      if (inGrid && focusIndex - cols < topCount && topCount > 0) setFocusAt(0);
      else setFocusAt(Math.max(focusIndex - cols, 0));
      break;
    case 'Enter': case ' ':
      focusPool[focusIndex]?.click();
      break;
  }
}

/* ═══════════════════════════════════════════════════
   GAMEPAD API (REDRAGON HARROW)
   ═══════════════════════════════════════════════════ */
const GP_THRESHOLD = 0.5;
const GP_REPEAT_MS = 190;
let gpLastNav = 0;

function pollGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < gps.length; i++) {
    const gp = gps[i];
    if (!gp || !gp.connected) continue;
    const now = performance.now();
    const canNav = now - gpLastNav > GP_REPEAT_MS;
    const id = gp.index;
    if (!gpPrev[id]) gpPrev[id] = {};

    const pressed = (btnIdx) => {
      const cur = gp.buttons[btnIdx] && gp.buttons[btnIdx].pressed;
      const prev = gpPrev[id][btnIdx] || false;
      gpPrev[id][btnIdx] = cur;
      return cur && !prev;
    };

    if (pressed(0)) {
      if (infoModal.classList.contains('active')) infoPlayBtn.click();
      else if (playerOpen && playerMode === 'html5') {
        const v = modalVideo;
        if (v.paused) { v.play(); showIndicator('▶', 'Play') } else { v.pause(); showIndicator('⏸', 'Pausa') }
      } else navigateSpatial('Enter');
    }
    if (pressed(1)) {
      if (infoModal.classList.contains('active')) closeInfoModal();
      else if (playerOpen) closePlayer();
    }
    if (pressed(2) && playerOpen && playerMode === 'html5') {
      modalVideo.currentTime = Math.max(0, modalVideo.currentTime - 10); showIndicator('⏪', '−10s');
    }
    if (pressed(3)) {
      if (playerOpen && playerMode === 'html5') {
        modalVideo.currentTime = Math.min(modalVideo.duration || 0, modalVideo.currentTime + 10); showIndicator('⏩', '+10s');
      } else if (!playerOpen && heroItem) {
        openInfoModal(heroItem.item, heroItem.isSeries);
      }
    }
    // L1 / LB (4) = Activar asistente de voz desde el sillón
    if (pressed(4) && !playerOpen) startVoiceAssistant();

    // Start (9) = Fullscreen
    if (pressed(9) && playerOpen) {
      if (!document.fullscreenElement) playerArea.requestFullscreen?.();
      else document.exitFullscreen?.();
    }

    if (canNav && !playerOpen && !infoModal.classList.contains('active')) {
      let navKey = null;
      if (gp.buttons[12]?.pressed) navKey = 'ArrowUp';
      else if (gp.buttons[13]?.pressed) navKey = 'ArrowDown';
      else if (gp.buttons[14]?.pressed) navKey = 'ArrowLeft';
      else if (gp.buttons[15]?.pressed) navKey = 'ArrowRight';
      if (!navKey && gp.axes) {
        if (gp.axes[1] < -GP_THRESHOLD) navKey = 'ArrowUp';
        else if (gp.axes[1] > GP_THRESHOLD) navKey = 'ArrowDown';
        else if (gp.axes[0] < -GP_THRESHOLD) navKey = 'ArrowLeft';
        else if (gp.axes[0] > GP_THRESHOLD) navKey = 'ArrowRight';
      }
      if (navKey) { navigateSpatial(navKey); gpLastNav = now }
    }

    if (canNav && playerOpen && playerMode === 'html5') {
      let seek = 0;
      if (gp.buttons[14]?.pressed || (gp.axes && gp.axes[0] < -GP_THRESHOLD)) seek = -10;
      if (gp.buttons[15]?.pressed || (gp.axes && gp.axes[0] > GP_THRESHOLD)) seek = 10;
      if (seek !== 0) {
        modalVideo.currentTime = Math.max(0, Math.min(modalVideo.duration || 0, modalVideo.currentTime + seek));
        showIndicator(seek < 0 ? '⏪' : '⏩', `${seek > 0 ? '+' : ''}${seek}s`);
        gpLastNav = now;
      }
    }

    for (let b = 0; b < gp.buttons.length; b++)gpPrev[id][b] = gp.buttons[b]?.pressed;
    break;
  }
  requestAnimationFrame(pollGamepad);
}

window.addEventListener('gamepadconnected', e => toast(`🎮 Mando conectado: ${e.gamepad.id.substring(0, 30)}`, 'success'));
window.addEventListener('gamepaddisconnected', () => toast('🎮 Mando desconectado'));
requestAnimationFrame(pollGamepad);

/* ═══════════════════════════════════════════════════
   TABS, FILTER, SORT & SYNC
   ═══════════════════════════════════════════════════ */
window.addEventListener('scroll', () => { navbar.classList.toggle('scrolled', window.scrollY > 30) }, { passive: true });

function switchTab(tab) {
  activeTab = tab;
  selectedGenre = 'all';
  aiFilterIds = null;
  aiBannerBox.style.display = 'none';
  navTabs.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderContinue();
  renderSeriesRow();
  renderGenrePills();
  applyFiltersAndSort();
}

navTabs.addEventListener('click', e => {
  const btn = e.target.closest('.nav-tab');
  if (btn) switchTab(btn.dataset.tab);
});

logoHome.addEventListener('click', () => {
  searchInput.value = ''; searchWrap.classList.remove('open');
  sortOrder = 'default'; sortSelect.value = 'default';
  switchTab('all');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function applyTvMode(enabled) {
  document.body.classList.toggle('tv-mode', enabled);
  btnTvMode.classList.toggle('active', enabled);
  localStorage.setItem('cinei_tv_mode', enabled ? '1' : '0');
}
if (localStorage.getItem('cinei_tv_mode') === '1') applyTvMode(true);
btnTvMode.addEventListener('click', () => {
  const next = !document.body.classList.contains('tv-mode');
  applyTvMode(next);
  toast(next ? '📺 Modo Smart TV activado' : '💻 Modo Escritorio activado', 'success');
});

searchToggle.addEventListener('click', () => {
  searchWrap.classList.toggle('open');
  if (searchWrap.classList.contains('open')) searchInput.focus();
  else { searchInput.value = ''; aiFilterIds = null; aiBannerBox.style.display = 'none'; applyFiltersAndSort() }
});
let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  aiFilterIds = null; aiBannerBox.style.display = 'none';
  searchTimer = setTimeout(() => applyFiltersAndSort(), 180);
});

sortSelect.addEventListener('change', () => { sortOrder = sortSelect.value; applyFiltersAndSort() });

function applyFiltersAndSort() {
  const q = searchInput.value.toLowerCase().trim();
  let entries = [];
  if (activeTab === 'all' || activeTab === 'movies') {
    entries.push(...movies.map(m => ({ item: m, isSeries: false })));
  }
  if (activeTab === 'series' || aiFilterIds || q) {
    entries.push(...seriesList.map(s => ({ item: s, isSeries: true })));
  }

  if (aiFilterIds) {
    entries = entries.filter(e => aiFilterIds.includes(e.item.id));
  } else {
    entries = entries.filter(e => {
      if (selectedGenre !== 'all') {
        const gids = e.item._tmdb?.genre_ids || [];
        if (!gids.includes(Number(selectedGenre))) return false;
      }
      if (q) {
        const title = (e.item._tmdb?.title || e.item._tmdb?.name || e.item._clean).toLowerCase();
        return title.includes(q) || (e.item.fileName || '').toLowerCase().includes(q);
      }
      return true;
    });
  }

  if (sortOrder === 'rating') {
    entries.sort((a, b) => (b.item._tmdb?.vote_average || 0) - (a.item._tmdb?.vote_average || 0));
  } else if (sortOrder === 'year') {
    entries.sort((a, b) => ((b.item._tmdb?.release_date || b.item._tmdb?.first_air_date || '')).localeCompare(a.item._tmdb?.release_date || a.item._tmdb?.first_air_date || ''));
  } else if (sortOrder === 'az') {
    entries.sort((a, b) => (a.item._tmdb?.title || a.item._tmdb?.name || a.item._clean).localeCompare(b.item._tmdb?.title || b.item._tmdb?.name || b.item._clean));
  } else if (sortOrder === 'size') {
    entries.sort((a, b) => (b.item.sizeMB || 0) - (a.item.sizeMB || 0));
  }

  if (aiFilterIds) sectionTitle.textContent = '✨ Resultados recomendados por Gemini';
  else if (q) sectionTitle.textContent = `Resultados para "${searchInput.value.trim()}"`;
  else if (selectedGenre !== 'all') sectionTitle.textContent = GENRE_MAP[selectedGenre] || 'Catálogo';
  else if (activeTab === 'series') sectionTitle.textContent = 'Todas las Series';
  else if (activeTab === 'movies') sectionTitle.textContent = 'Todas las Películas';
  else sectionTitle.textContent = 'Catálogo de Películas';

  renderGrid(entries);
}

btnSync.addEventListener('click', async () => {
  if (btnSync.classList.contains('syncing')) return;
  btnSync.classList.add('syncing');
  toast('Sincronizando con Drive…');
  try {
    const res = await fetch(DATA_URL);
    const data = await res.json();
    parseData(data);
    await enrichTmdb();
    renderAll();
    toast('✅ Catálogo actualizado', 'success');
  } catch {
    toast('❌ Error al sincronizar');
  } finally {
    btnSync.classList.remove('syncing');
  }
});

/* ═══════════════════════════════════════════════════
   KEYS MODAL & HERO BUTTONS
   ═══════════════════════════════════════════════════ */
btnKeys.addEventListener('click', () => {
  tmdbKeyInput.value = getTmdbKey();
  geminiKeyInput.value = getGeminiKey();
  keyModal.classList.add('active');
});
keyCancel.addEventListener('click', () => keyModal.classList.remove('active'));
keySave.addEventListener('click', () => {
  const tVal = tmdbKeyInput.value.trim();
  const gVal = geminiKeyInput.value.trim();
  if (tVal) localStorage.setItem('tmdb_api_key', tVal); else localStorage.removeItem('tmdb_api_key');
  if (gVal) localStorage.setItem('gemini_api_key', gVal); else localStorage.removeItem('gemini_api_key');
  keyModal.classList.remove('active');
  btnKeys.classList.toggle('active', !!(tVal || gVal));
  tmdbCache = {}; init();
  toast('✅ Claves guardadas en este navegador', 'success');
});

heroPlay.addEventListener('click', () => {
  if (!heroItem) return;
  if (heroItem.isSeries) openInfoModal(heroItem.item, true);
  else openPlayer(heroItem.item);
});
heroInfo.addEventListener('click', () => {
  if (heroItem) openInfoModal(heroItem.item, heroItem.isSeries);
});

/* ═══════════════════════════════════════════════════
   DATA PARSING & INIT
   ═══════════════════════════════════════════════════ */
function parseData(data) {
  if (Array.isArray(data)) {
    movies = data; seriesList = []; stats = null;
  } else {
    stats = data.stats || null;
    movies = data.movies || data.data || [];
    seriesList = data.series || [];
  }
  movies.forEach(m => { m._clean = cleanName(m.fileName || m.name || '') });
  seriesList.forEach(s => { s._clean = cleanName(s.name || '') });
}

async function enrichTmdb() {
  const key = getTmdbKey();
  btnKeys.classList.toggle('active', !!(key || getGeminiKey()));
  if (key) {
    for (let i = 0; i < movies.length; i += 5) {
      const batch = movies.slice(i, i + 5);
      await Promise.all(batch.map(async m => { m._tmdb = await fetchTmdb(m._clean, false) }));
    }
    for (let i = 0; i < seriesList.length; i += 5) {
      const batch = seriesList.slice(i, i + 5);
      await Promise.all(batch.map(async s => { s._tmdb = await fetchTmdb(s._clean, true) }));
    }
  } else {
    movies.forEach(m => { m._tmdb = null });
    seriesList.forEach(s => { s._tmdb = null });
  }
}

function renderAll() {
  renderStats();
  renderContinue();
  renderSeriesRow();
  renderGenrePills();
  applyFiltersAndSort();
  const pool = [...movies.map(m => ({ item: m, isSeries: false })), ...seriesList.map(s => ({ item: s, isSeries: true }))];
  if (pool.length > 0) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setHero(pick.item, pick.isSeries);
  }
  updateFocusPool();
}

async function init() {
  loader.style.display = ''; catalogSection.style.display = 'none'; heroContent.style.display = 'none'; continueSection.style.display = 'none'; seriesSection.style.display = 'none'; controlsBar.style.display = 'none';
  try {
    const res = await fetch(DATA_URL);
    const data = await res.json();
    parseData(data);
  } catch {
    loader.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span><span class="empty-text">Error al cargar el catálogo. Reintentá más tarde.</span></div>`;
    return;
  }
  await enrichTmdb();
  loader.style.display = 'none';
  catalogSection.style.display = '';
  renderAll();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { }) });
}

init();
}) ();
</script >
</body >
</html >