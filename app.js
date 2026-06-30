const FIFA = {
  api: "https://api.fifa.com/api/v3",
  competitionId: "17",
  seasonId: "285023",
  language: "en"
};

const EASTERN_TIME_ZONE = "America/New_York";
const CURRENT_MATCH_WINDOW_MS = 3 * 60 * 60 * 1000;
const AUTO_REFRESH_INTERVAL_MS = 60 * 1000;

const DEFAULT_CALIBRATION = {
  drawThreshold: 1.1,
  tieBase: 0.24,
  diffMultiplier: 1,
  sampleSize: 0,
  note: "Default scouting model"
};

const COUNTRY_CODE_NAMES = {
  ARG: "Argentina", AUS: "Australia", AUT: "Austria", BEL: "Belgium", BIH: "Bosnia and Herzegovina",
  BRA: "Brazil", CAN: "Canada", CIV: "Cote d'Ivoire", COD: "DR Congo", COL: "Colombia",
  CPV: "Cape Verde", CRO: "Croatia", CUW: "Curacao", CZE: "Czechia", ECU: "Ecuador",
  EGY: "Egypt", ENG: "England", FRA: "France", GER: "Germany", GHA: "Ghana",
  HAI: "Haiti", IRN: "Iran", IRQ: "Iraq", JOR: "Jordan", JPN: "Japan",
  KOR: "Korea Republic", KSA: "Saudi Arabia", MEX: "Mexico", MAR: "Morocco", NED: "Netherlands",
  NOR: "Norway", NZL: "New Zealand", PAN: "Panama", PAR: "Paraguay", POR: "Portugal",
  QAT: "Qatar", RSA: "South Africa", SCO: "Scotland", SEN: "Senegal", ESP: "Spain",
  SUI: "Switzerland", SWE: "Sweden", TUN: "Tunisia", TUR: "Turkiye", URU: "Uruguay",
  USA: "United States", UZB: "Uzbekistan"
};

const METRICS = [
  ["technical", "Technical"],
  ["tactical", "Tactical"],
  ["physical", "Physical"],
  ["statistical", "Production"],
  ["consistency", "Consistency"],
  ["bigGame", "Big Game"],
  ["defensive", "Defending"],
  ["leadership", "Leadership"],
  ["analytics", "Analytics"]
];

const DEFAULT_WEIGHTS = {
  technical: 24,
  tactical: 15,
  physical: 11,
  statistical: 18,
  consistency: 8,
  bigGame: 12,
  defensive: 5,
  leadership: 5,
  analytics: 2
};

const ROLE_BASE = {
  GK: { technical: 64, tactical: 73, physical: 71, statistical: 61, consistency: 63, bigGame: 58, defensive: 84, leadership: 69, analytics: 60 },
  DEF: { technical: 66, tactical: 72, physical: 73, statistical: 60, consistency: 64, bigGame: 58, defensive: 82, leadership: 67, analytics: 62 },
  MID: { technical: 74, tactical: 76, physical: 67, statistical: 65, consistency: 66, bigGame: 59, defensive: 68, leadership: 66, analytics: 66 },
  FWD: { technical: 76, tactical: 70, physical: 72, statistical: 70, consistency: 64, bigGame: 60, defensive: 56, leadership: 63, analytics: 67 }
};

const STORAGE_KEYS = {
  weights: "wc_predictor_weights_v2",
  overrides: "wc_predictor_player_overrides_v1",
  cache: "wc_predictor_fifa_cache_v1",
  history: "wc_predictor_world_cup_history_v1"
};

const state = {
  fixtures: [],
  teams: new Map(),
  squads: new Map(),
  details: new Map(),
  weights: loadJson(STORAGE_KEYS.weights, DEFAULT_WEIGHTS),
  overrides: loadJson(STORAGE_KEYS.overrides, {}),
  selectedPlayers: [],
  selectedFixture: null,
  calibration: { ...DEFAULT_CALIBRATION },
  reviewRunId: 0,
  predictionRunId: 0,
  teamHistoryRunId: 0,
  starGoalsRunId: 0,
  refreshing: false,
  pageHiddenAt: null,
  tournamentScorers: [],
  teamHistoryCache: new Map(),
  fixtureTeamFilter: "",
  worldCupHistory: new Map(),
  historyLoaded: false
};

const els = {
  refreshBtn: document.getElementById("refreshBtn"),
  dataStatus: document.getElementById("dataStatus"),
  fixtureTeamFilter: document.getElementById("fixtureTeamFilter"),
  fixtureFilterStatus: document.getElementById("fixtureFilterStatus"),
  fixtureSelect: document.getElementById("fixtureSelect"),
  teamASelect: document.getElementById("teamASelect"),
  teamBSelect: document.getElementById("teamBSelect"),
  fixtureMeta: document.getElementById("fixtureMeta"),
  weightsGrid: document.getElementById("weightsGrid"),
  resetWeightsBtn: document.getElementById("resetWeightsBtn"),
  predictionText: document.getElementById("predictionText"),
  confidenceText: document.getElementById("confidenceText"),
  aProbLabel: document.getElementById("aProbLabel"),
  bProbLabel: document.getElementById("bProbLabel"),
  aProbBar: document.getElementById("aProbBar"),
  bProbBar: document.getElementById("bProbBar"),
  tieProbBar: document.getElementById("tieProbBar"),
  aProb: document.getElementById("aProb"),
  bProb: document.getElementById("bProb"),
  tieProb: document.getElementById("tieProb"),
  playerSelect: document.getElementById("playerSelect"),
  playerSliders: document.getElementById("playerSliders"),
  clearOverridesBtn: document.getElementById("clearOverridesBtn"),
  teamAPlayersTitle: document.getElementById("teamAPlayersTitle"),
  teamBPlayersTitle: document.getElementById("teamBPlayersTitle"),
  teamATable: document.getElementById("teamATable"),
  teamBTable: document.getElementById("teamBTable"),
  teamALoading: document.getElementById("teamALoading"),
  teamBLoading: document.getElementById("teamBLoading"),
  reviewStatus: document.getElementById("reviewStatus"),
  reviewMetrics: document.getElementById("reviewMetrics"),
  reviewReasons: document.getElementById("reviewReasons"),
  reviewTable: document.getElementById("reviewTable"),
  teamHistoryStatus: document.getElementById("teamHistoryStatus"),
  teamAHistoryTitle: document.getElementById("teamAHistoryTitle"),
  teamAHistorySummary: document.getElementById("teamAHistorySummary"),
  teamAHistoryMatches: document.getElementById("teamAHistoryMatches"),
  teamBHistoryTitle: document.getElementById("teamBHistoryTitle"),
  teamBHistorySummary: document.getElementById("teamBHistorySummary"),
  teamBHistoryMatches: document.getElementById("teamBHistoryMatches"),
  starGoalsStatus: document.getElementById("starGoalsStatus"),
  starGoalsList: document.getElementById("starGoalsList"),
  championStatus: document.getElementById("championStatus"),
  championList: document.getElementById("championList"),
  stageStatusLabel: document.getElementById("stageStatusLabel"),
  stageStatusCards: document.getElementById("stageStatusCards")
};

init();

function init() {
  renderWeights();
  bindEvents();
  const cached = loadJson(STORAGE_KEYS.cache, null);
  if (cached?.fixtures?.length) {
    hydrateFifaData(cached);
    setStatus(`Loaded saved FIFA data from ${formatDate(cached.savedAt)}`);
  } else {
    setStatus("Loading official FIFA data...");
    updatePredictionEmpty();
    renderStageStatusEmpty("Refresh FIFA data to see the current match.");
    renderTeamHistoriesEmpty("Refresh FIFA data to see each team's match history.");
    renderStarGoalsEmpty("Refresh FIFA data to see the tournament-wide top scorers.", "Waiting for FIFA data");
    renderChampionCandidatesEmpty("Refresh FIFA data to see the top World Cup champion candidates.", "Waiting for FIFA data");
  }
  window.setTimeout(() => refreshFifaData(), 300);
}

function bindEvents() {
  els.refreshBtn.addEventListener("click", refreshFifaData);
  els.fixtureTeamFilter.addEventListener("change", onFixtureTeamFilterChange);
  els.fixtureSelect.addEventListener("change", onFixtureChange);
  els.teamASelect.addEventListener("change", predictSelected);
  els.teamBSelect.addEventListener("change", predictSelected);
  els.resetWeightsBtn.addEventListener("click", () => {
    state.weights = { ...DEFAULT_WEIGHTS };
    saveJson(STORAGE_KEYS.weights, state.weights);
    renderWeights();
    predictSelected();
  });
  els.clearOverridesBtn.addEventListener("click", () => {
    state.overrides = {};
    saveJson(STORAGE_KEYS.overrides, state.overrides);
    renderPlayerEditor();
    predictSelected();
  });
  els.playerSelect.addEventListener("change", renderPlayerEditor);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      state.pageHiddenAt = Date.now();
      return;
    }
    if (state.pageHiddenAt && Date.now() - state.pageHiddenAt >= 60000) {
      refreshFifaData();
    }
    state.pageHiddenAt = null;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refreshFifaData();
  });
  window.setInterval(() => {
    if (document.visibilityState !== "hidden") refreshFifaData();
  }, AUTO_REFRESH_INTERVAL_MS);
}

async function refreshFifaData() {
  if (state.refreshing) return;
  state.refreshing = true;
  setStatus("Refreshing official FIFA fixtures...");
  setBusy(true);
  try {
    const seasons = await getWorldCupSeasons();
    const season = seasons.find((item) => text(item.Name).includes("2026")) || { IdSeason: FIFA.seasonId };
    FIFA.seasonId = season.IdSeason || FIFA.seasonId;
    const matchesUrl = `${FIFA.api}/calendar/matches?language=${FIFA.language}&count=140&idCompetition=${FIFA.competitionId}&idSeason=${FIFA.seasonId}`;
    const matches = await fetchJson(matchesUrl);
    const fixtures = (matches.Results || []).sort((a, b) => new Date(a.Date) - new Date(b.Date));
    state.teamHistoryCache.clear();
    await loadWorldCupHistory(seasons, true);
    const payload = {
      season,
      fixtures,
      savedAt: new Date().toISOString(),
      source: matchesUrl
    };
    saveJson(STORAGE_KEYS.cache, payload);
    hydrateFifaData(payload);
    setStatus(`Refreshed ${fixtures.length} FIFA fixtures`);
  } catch (error) {
    console.error(error);
    setStatus("Could not refresh FIFA data. Try again in a moment.");
    if (!state.fixtures.length) {
      updatePredictionEmpty();
      renderStageStatusEmpty("FIFA data could not be reached. Try refreshing again in a moment.");
      renderTeamHistoriesEmpty("FIFA data could not be reached. Try refreshing again in a moment.");
      renderStarGoalsEmpty("FIFA data could not be reached. Try refreshing again in a moment.", "FIFA data unavailable");
      renderChampionCandidatesEmpty("FIFA data could not be reached. Try refreshing again in a moment.", "FIFA data unavailable");
    }
  } finally {
    state.refreshing = false;
    setBusy(false);
  }
}

async function getWorldCupSeasons() {
  const url = `${FIFA.api}/seasons?idCompetition=${FIFA.competitionId}&language=${FIFA.language}&count=100`;
  const data = await fetchJson(url);
  return data.Results || [];
}

function hydrateFifaData(payload) {
  state.fixtures = payload.fixtures || [];
  state.teams = new Map();
  state.fixtures.forEach((fixture) => {
    addTeam(fixture.Home);
    addTeam(fixture.Away);
  });
  renderTeamOptions();
  renderFixtureOptions();
  hydrateWorldCupHistory();
  updateTournamentStarGoals();
  renderModelReviewWaiting();
  const visibleFixtures = filteredFixtures();
  const defaultFixture = preferredFixture(visibleFixtures);
  if (defaultFixture) {
    els.fixtureSelect.value = defaultFixture.IdMatch;
    selectFixture(defaultFixture);
  }
  runModelReview();
  if (!state.historyLoaded) refreshWorldCupHistoryInBackground();
}

function hydrateWorldCupHistory() {
  const cached = loadJson(STORAGE_KEYS.history, null);
  if (!cached?.teams) return;
  state.worldCupHistory = new Map(Object.entries(cached.teams));
  state.historyLoaded = true;
}

async function loadWorldCupHistory(seasons = [], force = false) {
  const cached = loadJson(STORAGE_KEYS.history, null);
  if (!force && cached?.teams) {
    state.worldCupHistory = new Map(Object.entries(cached.teams));
    state.historyLoaded = true;
    return;
  }
  const historicalSeasons = seasons
    .filter((season) => season.IdSeason !== FIFA.seasonId && !text(season.Name).includes("2026"))
    .sort((a, b) => new Date(b.StartDate || 0) - new Date(a.StartDate || 0))
    .slice(0, 8);
  const seasonMatches = await Promise.all(historicalSeasons.map(async (season, index) => {
    const url = `${FIFA.api}/calendar/matches?language=${FIFA.language}&count=120&idCompetition=${FIFA.competitionId}&idSeason=${season.IdSeason}`;
    try {
      const data = await fetchJson(url);
      return (data.Results || []).map((fixture) => ({ fixture, season, recencyWeight: 1 + Math.max(0, 8 - index) * 0.08 }));
    } catch {
      return [];
    }
  }));
  const teams = computeWorldCupHistory(seasonMatches.flat());
  state.worldCupHistory = new Map(Object.entries(teams));
  state.historyLoaded = true;
  saveJson(STORAGE_KEYS.history, {
    generatedAt: new Date().toISOString(),
    seasons: historicalSeasons.map((season) => ({ id: season.IdSeason, name: text(season.Name) })),
    teams
  });
}

async function refreshWorldCupHistoryInBackground() {
  try {
    const seasons = await getWorldCupSeasons();
    await loadWorldCupHistory(seasons);
    renderChampionCandidates();
    runModelReview();
    predictSelected();
  } catch (error) {
    console.warn("Historical World Cup data was unavailable", error);
  }
}

function computeWorldCupHistory(matchRows) {
  const teams = {};
  matchRows.forEach(({ fixture, recencyWeight }) => {
    if (!isHistoricalPlayed(fixture)) return;
    const home = fixture.Home;
    const away = fixture.Away;
    const stage = `${text(fixture.StageName)} ${text(fixture.GroupName)}`.toLowerCase();
    const knockoutWeight = /round|quarter|semi|final|third/.test(stage) && !/group|first/.test(stage) ? 1.35 : 1;
    addHistoryTeam(teams, home);
    addHistoryTeam(teams, away);
    updateHistoryTeam(teams[home.Abbreviation], home.Score, away.Score, recencyWeight, knockoutWeight);
    updateHistoryTeam(teams[away.Abbreviation], away.Score, home.Score, recencyWeight, knockoutWeight);
  });

  Object.values(teams).forEach((team) => {
    const games = Math.max(1, team.weightedGames);
    const pointsPerGame = team.points / games;
    const goalDiffPerGame = team.goalDiff / games;
    const knockoutBonus = Math.min(9, team.knockoutWins * 1.7 + team.knockoutDraws * 0.6);
    const participationBonus = Math.min(8, Math.log2(team.games + 1) * 1.8);
    team.score = clamp(43 + pointsPerGame * 7.5 + goalDiffPerGame * 3.2 + knockoutBonus + participationBonus, 38, 94);
  });
  return teams;
}

function isHistoricalPlayed(fixture) {
  return Boolean(
    fixture?.Home
    && fixture?.Away
    && fixture.Home.Score !== null
    && fixture.Home.Score !== undefined
    && fixture.Away.Score !== null
    && fixture.Away.Score !== undefined
  );
}

function addHistoryTeam(teams, team) {
  const abbr = team?.Abbreviation || team?.IdCountry;
  if (!abbr) return;
  if (!teams[abbr]) {
    teams[abbr] = {
      abbr,
      name: teamName(team),
      games: 0,
      weightedGames: 0,
      points: 0,
      goalDiff: 0,
      knockoutWins: 0,
      knockoutDraws: 0,
      score: 42
    };
  }
}

function updateHistoryTeam(team, own, opp, recencyWeight, knockoutWeight) {
  if (!team) return;
  const weighted = recencyWeight * knockoutWeight;
  team.games += 1;
  team.weightedGames += weighted;
  team.goalDiff += (number(own, 0) - number(opp, 0)) * weighted;
  if (own > opp) {
    team.points += 3 * weighted;
    if (knockoutWeight > 1) team.knockoutWins += recencyWeight;
  } else if (own === opp) {
    team.points += weighted;
    if (knockoutWeight > 1) team.knockoutDraws += recencyWeight;
  }
}

function addTeam(team) {
  if (!team?.IdTeam) return;
  state.teams.set(team.IdTeam, apiTeamToTeam(team));
}

function apiTeamToTeam(team) {
  const abbr = team?.Abbreviation || team?.IdCountry || "";
  return {
    id: team?.IdTeam || "",
    name: text(team?.TeamName) || team?.ShortClubName || countryNameFromAbbr(abbr) || abbr,
    abbr,
    country: team?.IdCountry || "",
    flag: team?.PictureUrl || ""
  };
}

function renderTeamOptions() {
  const teams = [...state.teams.values()].sort((a, b) => a.name.localeCompare(b.name));
  const html = teams.map((team) => `<option value="${team.id}">${escapeHtml(teamDisplay(team))}</option>`).join("");
  els.teamASelect.innerHTML = html;
  els.teamBSelect.innerHTML = html;
  els.fixtureTeamFilter.innerHTML = `<option value="">All teams</option>${html}`;
  if (state.fixtureTeamFilter && state.teams.has(state.fixtureTeamFilter)) {
    els.fixtureTeamFilter.value = state.fixtureTeamFilter;
  } else {
    state.fixtureTeamFilter = "";
    els.fixtureTeamFilter.value = "";
  }
}

function renderFixtureOptions() {
  const fixtures = filteredFixtures();
  els.fixtureSelect.innerHTML = fixtures.map((fixture) => {
    const home = fixtureTeamDisplay(fixture.Home);
    const away = fixtureTeamDisplay(fixture.Away);
    const date = formatDate(fixture.Date);
    const score = isPlayed(fixture) ? ` ${fixture.Home.Score}-${fixture.Away.Score}` : "";
    return `<option value="${fixture.IdMatch}">${escapeHtml(date)} | ${escapeHtml(home)} vs ${escapeHtml(away)}${score}</option>`;
  }).join("");
  if (!fixtures.length) {
    els.fixtureSelect.innerHTML = `<option value="">No published matches found</option>`;
  }
  renderFixtureFilterStatus(fixtures);
}

function filteredFixtures() {
  if (!state.fixtureTeamFilter) return state.fixtures;
  return state.fixtures.filter((fixture) => (
    fixture.Home?.IdTeam === state.fixtureTeamFilter
    || fixture.Away?.IdTeam === state.fixtureTeamFilter
  ));
}

function renderFixtureFilterStatus(fixtures = filteredFixtures()) {
  if (!state.fixtureTeamFilter) {
    els.fixtureFilterStatus.textContent = `Showing all ${fixtures.length} published matches`;
    return;
  }
  const team = state.teams.get(state.fixtureTeamFilter);
  const teamLabel = team?.abbr || team?.name || "team";
  const upcoming = fixtures.filter((fixture) => !isPlayed(fixture)).length;
  els.fixtureFilterStatus.textContent = `${fixtures.length} published ${teamLabel} match${fixtures.length === 1 ? "" : "es"} · ${upcoming} upcoming`;
}

function onFixtureTeamFilterChange() {
  state.fixtureTeamFilter = els.fixtureTeamFilter.value;
  renderFixtureOptions();
  const fixtures = filteredFixtures();
  const fixture = preferredFixture(fixtures);
  if (fixture) {
    els.fixtureSelect.value = fixture.IdMatch;
    selectFixture(fixture);
  } else {
    state.selectedFixture = null;
    els.fixtureMeta.textContent = "No FIFA fixtures are currently published for this team. Refresh FIFA data later to check for new knockout-stage matches.";
    updatePredictionEmpty();
  }
}

function onFixtureChange() {
  const fixture = state.fixtures.find((item) => item.IdMatch === els.fixtureSelect.value);
  if (fixture) selectFixture(fixture);
}

function selectFixture(fixture) {
  state.selectedFixture = fixture;
  if (fixture.Home?.IdTeam) els.teamASelect.value = fixture.Home.IdTeam;
  if (fixture.Away?.IdTeam) els.teamBSelect.value = fixture.Away.IdTeam;
  const stadium = text(fixture.Stadium?.Name);
  const city = text(fixture.Stadium?.CityName);
  const group = text(fixture.GroupName) || text(fixture.StageName);
  const actual = isPlayed(fixture) ? `Actual result: ${fixtureTeamDisplay(fixture.Home)} ${fixture.Home.Score}, ${fixtureTeamDisplay(fixture.Away)} ${fixture.Away.Score}.` : "No final score shown by FIFA yet.";
  els.fixtureMeta.textContent = `${formatDate(fixture.Date)}. ${group}. ${stadium}${city ? `, ${city}` : ""}. ${actual}`;
  predictSelected();
}

async function predictSelected() {
  const runId = ++state.predictionRunId;
  const teamA = state.teams.get(els.teamASelect.value);
  const teamB = state.teams.get(els.teamBSelect.value);
  const fixture = state.selectedFixture;
  if (!teamA || !teamB || teamA.id === teamB.id) {
    updatePredictionEmpty();
    renderStageStatusEmpty("Choose two different teams to see their current stage points.");
    renderTeamHistoriesEmpty("Choose two different teams to see each team's match history.");
    return;
  }
  updateTeamHistories(teamA, teamB);
  renderStageStatus(teamA, teamB);
  els.aProbLabel.textContent = `${teamA.abbr || "A"} win`;
  els.bProbLabel.textContent = `${teamB.abbr || "B"} win`;

  const [aReport, bReport] = await Promise.all([
    buildTeamReport(teamA, "A", selectedMatchOptions("A", fixture)),
    buildTeamReport(teamB, "B", selectedMatchOptions("B", fixture))
  ]);
  if (runId !== state.predictionRunId) return;
  renderTeamReport(aReport, "A");
  renderTeamReport(bReport, "B");
  renderPrediction(aReport, bReport);
  renderPlayerSelect(aReport, bReport);
}

async function updateTeamHistories(teamA, teamB) {
  const runId = ++state.teamHistoryRunId;
  els.teamHistoryStatus.textContent = "Loading 2026 World Cup histories...";
  renderTeamHistoryLoading(teamA, "A");
  renderTeamHistoryLoading(teamB, "B");

  try {
    const [teamAMatches, teamBMatches] = await Promise.all([
      loadTeamMatchHistory(teamA.id),
      loadTeamMatchHistory(teamB.id)
    ]);
    if (runId !== state.teamHistoryRunId) return;
    renderTeamHistory(teamA, teamAMatches, "A");
    renderTeamHistory(teamB, teamBMatches, "B");
    els.teamHistoryStatus.textContent = "2026 World Cup matches only";
  } catch (error) {
    console.warn("Team World Cup history was unavailable", error);
    if (runId !== state.teamHistoryRunId) return;
    renderTeamHistoriesEmpty("FIFA's match archive could not be reached. Try again in a moment.");
  }
}

function loadTeamMatchHistory(teamId) {
  if (state.teamHistoryCache.has(teamId)) return state.teamHistoryCache.get(teamId);
  const url = `${FIFA.api}/calendar/matches?language=${FIFA.language}&count=500&idTeam=${teamId}`;
  const request = fetchJson(url)
    .then((data) => data.Results || [])
    .catch((error) => {
      state.teamHistoryCache.delete(teamId);
      throw error;
    });
  state.teamHistoryCache.set(teamId, request);
  return request;
}

function renderTeamHistoryLoading(team, side) {
  const title = side === "A" ? els.teamAHistoryTitle : els.teamBHistoryTitle;
  const summary = side === "A" ? els.teamAHistorySummary : els.teamBHistorySummary;
  const matches = side === "A" ? els.teamAHistoryMatches : els.teamBHistoryMatches;
  title.textContent = `${teamDisplay(team)} match history`;
  summary.innerHTML = "";
  matches.innerHTML = `<div class="history-empty">Loading ${escapeHtml(team.abbr || team.name)} 2026 World Cup results...</div>`;
}

function renderTeamHistory(team, archive, side) {
  const title = side === "A" ? els.teamAHistoryTitle : els.teamBHistoryTitle;
  const summary = side === "A" ? els.teamAHistorySummary : els.teamBHistorySummary;
  const matches = side === "A" ? els.teamAHistoryMatches : els.teamBHistoryMatches;
  const sourceMatches = [...(archive || []), ...state.fixtures];
  const completed = sourceMatches
    .filter((match) => (
      isHistoricalResult(match)
      && is2026FifaWorldCupMatch(match)
      && [match.Home?.IdTeam, match.Away?.IdTeam].includes(team.id)
    ))
    .filter((match, index, rows) => rows.findIndex((item) => item.IdMatch === match.IdMatch) === index)
    .sort((a, b) => new Date(b.Date) - new Date(a.Date));
  const outcomes = completed.map((match) => teamHistoryOutcome(match, team.id));
  const wins = outcomes.filter((outcome) => outcome === "W").length;
  const draws = outcomes.filter((outcome) => outcome === "T").length;
  const losses = outcomes.filter((outcome) => outcome === "L").length;

  title.textContent = `${teamDisplay(team)} match history`;
  summary.innerHTML = `
    <div class="team-history-record">
      <div class="team-history-total">
        <span>Matches</span>
        <strong>${completed.length}</strong>
      </div>
      <div class="team-history-record-items">
        <span class="record-win"><b>W</b><strong>${wins}</strong><em>Wins</em></span>
        <span class="record-draw"><b>T</b><strong>${draws}</strong><em>Ties</em></span>
        <span class="record-loss"><b>L</b><strong>${losses}</strong><em>Losses</em></span>
      </div>
    </div>
  `;

  if (!completed.length) {
    matches.innerHTML = `<div class="history-empty">No completed 2026 FIFA World Cup matches were found for ${escapeHtml(teamDisplay(team))}.</div>`;
    return;
  }

  matches.innerHTML = completed.map((match) => {
    const outcome = teamHistoryOutcome(match, team.id);
    const competition = text(match.SeasonName) || text(match.CompetitionName) || "FIFA World Cup";
    return `
      <div class="team-history-match">
        <span class="team-history-result result-${outcome.toLowerCase()}">${outcome}</span>
        <div>
          <strong>${escapeHtml(matchHistoryScore(match))}</strong>
          <span>${escapeHtml(formatHistoryDate(match.Date))} · ${escapeHtml(competition)}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderTeamHistoriesEmpty(message) {
  els.teamHistoryStatus.textContent = "No history shown";
  ["A", "B"].forEach((side) => {
    const title = side === "A" ? els.teamAHistoryTitle : els.teamBHistoryTitle;
    const summary = side === "A" ? els.teamAHistorySummary : els.teamBHistorySummary;
    const matches = side === "A" ? els.teamAHistoryMatches : els.teamBHistoryMatches;
    title.textContent = `Team ${side} history`;
    summary.innerHTML = "";
    matches.innerHTML = `<div class="history-empty">${escapeHtml(message)}</div>`;
  });
}

async function updateTournamentStarGoals() {
  const runId = ++state.starGoalsRunId;
  els.starGoalsStatus.textContent = "Loading tournament scorers...";
  els.starGoalsList.innerHTML = `<div class="history-empty">Loading 2026 World Cup top scorers across all teams...</div>`;
  try {
    const scorers = await loadTournamentTopScorers();
    if (runId !== state.starGoalsRunId) return;
    state.tournamentScorers = scorers;
    renderTournamentStarGoals(scorers);
    renderChampionCandidates();
  } catch (error) {
    console.warn("Tournament top scorers unavailable", error);
    if (runId !== state.starGoalsRunId) return;
    state.tournamentScorers = [];
    renderStarGoalsEmpty("FIFA's tournament top-scorer data could not be reached. Try refreshing again in a moment.", "Scorers unavailable");
    renderChampionCandidates();
  }
}

async function loadTournamentTopScorers() {
  const url = `${FIFA.api}/topseasonplayerstatistics/season/${FIFA.seasonId}/topscorers?language=${FIFA.language}`;
  const data = await fetchJson(url);
  return (data.PlayerStatsList || [])
    .map((row) => {
      const player = row.PlayerInfo || {};
      const team = state.teams.get(player.IdTeam) || {
        id: player.IdTeam || "",
        name: countryNameFromAbbr(player.IdCountry) || player.IdCountry || "Unknown team",
        abbr: player.IdCountry || "",
        country: player.IdCountry || ""
      };
      return {
        id: player.IdPlayer || `${team.id}-${text(player.PlayerName)}`,
        name: text(player.PlayerName) || "Unknown player",
        shortName: text(player.PlayerName) || "Unknown",
        role: "",
        team,
        tournamentGoals: number(row.GoalsScored, 0),
        assists: number(row.Assists, 0),
        matchesPlayed: number(row.MatchesPlayed, 0)
      };
    })
    .filter((player) => player.tournamentGoals > 0);
}

function renderTournamentStarGoals(scorers) {
  const ranked = scorers
    .sort((a, b) => (
      b.tournamentGoals - a.tournamentGoals
      || a.shortName.localeCompare(b.shortName)
      || a.team.name.localeCompare(b.team.name)
    ))
    .slice(0, 5);

  if (!ranked.length) {
    renderStarGoalsEmpty("No player has scored in the 2026 FIFA World Cup yet.", "No goals yet");
    return;
  }

  els.starGoalsStatus.textContent = `Top ${ranked.length} tournament scorers`;
  els.starGoalsList.innerHTML = ranked.map((player, index) => `
    <article class="star-goal-row">
      <span class="star-goal-rank">Top ${index + 1}</span>
      <div class="star-goal-player">
        <strong>${escapeHtml(player.shortName || player.name)}</strong>
        <span>${escapeHtml(teamDisplay(player.team))}${player.role ? ` · ${escapeHtml(player.role)}` : ""}</span>
      </div>
      <div class="star-goal-total">
        <strong>${player.tournamentGoals}</strong>
        <span>${player.tournamentGoals === 1 ? "goal" : "goals"}</span>
      </div>
    </article>
  `).join("");
}

function renderStarGoalsEmpty(message, status = "Waiting for FIFA data") {
  els.starGoalsStatus.textContent = status;
  els.starGoalsList.innerHTML = `<div class="history-empty">${escapeHtml(message)}</div>`;
}

function renderChampionCandidates() {
  const completed = state.fixtures.filter((fixture) => isHistoricalResult(fixture) && hasFixtureTeams(fixture));
  if (!completed.length) {
    renderChampionCandidatesEmpty("No completed 2026 World Cup matches are official yet, so champion candidates will appear after results arrive.", "Waiting for results");
    return;
  }

  const eliminated = eliminatedTeamIds(completed);
  const candidates = buildChampionCandidates(completed, state.tournamentScorers, eliminated).slice(0, 5);
  if (!candidates.length) {
    renderChampionCandidatesEmpty("No active champion candidates are available yet. Refresh FIFA data again in a moment.", "No active candidates yet");
    return;
  }

  const hiddenLabel = eliminated.size ? ` · ${eliminated.size} eliminated team${eliminated.size === 1 ? "" : "s"} hidden` : "";
  els.championStatus.textContent = `Updated from ${completed.length} completed match${completed.length === 1 ? "" : "es"}${hiddenLabel}`;
  els.championList.innerHTML = candidates.map((candidate, index) => `
    <details class="champion-row ${index === 0 ? "champion-row-pick" : ""}">
      <summary class="champion-summary">
        <div class="champion-rank">
          <span>Top ${index + 1}</span>
          ${index === 0 ? "<b>Pick</b>" : ""}
        </div>
        <div class="champion-team">
          <strong>${escapeHtml(teamDisplay(candidate.team))}</strong>
          <span>Expand details</span>
        </div>
        <div class="champion-score">
          <strong>${candidate.championScore}%</strong>
          <span>champion score</span>
        </div>
      </summary>
      <div class="champion-details">
        <p>${escapeHtml(candidate.reason)}</p>
        <div class="champion-factor-grid">
          <em>${escapeHtml(candidate.pointsLabel)}</em>
          <em>${escapeHtml(candidate.goalsLabel)}</em>
          <em>${escapeHtml(candidate.starLabel)}</em>
          <em>${escapeHtml(candidate.strengthLabel)}</em>
        </div>
      </div>
    </details>
  `).join("");
}

function buildChampionCandidates(completed, scorers, eliminated = new Set()) {
  const stats = tournamentTeamStats(completed);
  const starStats = tournamentScorerStats(scorers);
  return [...stats.values()].filter((row) => !eliminated.has(row.team.id)).map((row) => {
    const played = Math.max(1, row.played);
    const ppg = row.points / played;
    const gfPerGame = row.goalsFor / played;
    const gaPerGame = row.goalsAgainst / played;
    const gdPerGame = row.goalDiff / played;
    const teamStars = starStats.get(row.team.id) || { goals: 0, playerCount: 0, topPlayer: "", topGoals: 0 };
    const currentResults = clamp(42 + ppg * 13 + gdPerGame * 5 + Math.min(8, row.played * 1.4), 35, 98);
    const goalPower = clamp(44 + gfPerGame * 13 + gdPerGame * 3, 35, 98);
    const defensivePower = clamp(78 - gaPerGame * 11 + gdPerGame * 2, 35, 96);
    const starPower = clamp(50 + teamStars.topGoals * 8 + teamStars.goals * 3 + Math.min(10, Math.max(0, teamStars.playerCount - 1) * 3), 45, 99);
    const teamStrength = worldCupPedigreeScore(row.team);
    const blendedScore = currentResults * 0.36
      + goalPower * 0.19
      + starPower * 0.20
      + teamStrength * 0.18
      + defensivePower * 0.07;
    const championScore = Math.round(clamp(blendedScore, 1, 99));
    return {
      ...row,
      championScore,
      currentResults,
      goalPower,
      starPower,
      teamStrength,
      defensivePower,
      reason: championReason(row, teamStars, ppg, gdPerGame),
      pointsLabel: `${row.points} pts / ${row.played} matches`,
      goalsLabel: `${row.goalsFor} goals · ${signedNumber(row.goalDiff)} GD`,
      starLabel: teamStars.topPlayer ? `${teamStars.topPlayer}: ${teamStars.topGoals} goals` : "No top scorer yet",
      strengthLabel: `Strength ${Math.round(teamStrength)}`
    };
  }).sort((a, b) => (
    b.championScore - a.championScore
    || b.points - a.points
    || b.goalDiff - a.goalDiff
    || b.goalsFor - a.goalsFor
    || a.team.name.localeCompare(b.team.name)
  ));
}

function eliminatedTeamIds(completed) {
  const eliminated = new Set();
  [...completed]
    .filter(isKnockoutFixture)
    .sort((a, b) => new Date(a.Date) - new Date(b.Date))
    .forEach((fixture) => {
      const winnerId = knockoutWinnerId(fixture);
      if (!winnerId) return;
      [fixture.Home?.IdTeam, fixture.Away?.IdTeam]
        .filter((teamId) => teamId && teamId !== winnerId)
        .forEach((teamId) => eliminated.add(teamId));
    });
  return eliminated;
}

function isKnockoutFixture(fixture) {
  const stageLabel = `${text(fixture?.StageName)} ${text(fixture?.GroupName)}`.toLowerCase();
  return /round|quarter|semi|final|third/.test(stageLabel)
    && !/group|first/.test(stageLabel);
}

function tournamentTeamStats(completed) {
  const stats = new Map();
  completed.forEach((fixture) => {
    const home = state.teams.get(fixture.Home.IdTeam) || apiTeamToTeam(fixture.Home);
    const away = state.teams.get(fixture.Away.IdTeam) || apiTeamToTeam(fixture.Away);
    ensureChampionTeamStats(stats, home);
    ensureChampionTeamStats(stats, away);
    updateTableRow(stats.get(home.id), fixture.Home.Score, fixture.Away.Score);
    updateTableRow(stats.get(away.id), fixture.Away.Score, fixture.Home.Score);
  });
  return stats;
}

function ensureChampionTeamStats(stats, team) {
  if (!team?.id || stats.has(team.id)) return;
  stats.set(team.id, {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0
  });
}

function tournamentScorerStats(scorers) {
  const stats = new Map();
  (scorers || []).forEach((player) => {
    if (!player.team?.id) return;
    if (!stats.has(player.team.id)) {
      stats.set(player.team.id, {
        goals: 0,
        playerCount: 0,
        topPlayer: "",
        topGoals: 0
      });
    }
    const row = stats.get(player.team.id);
    row.goals += number(player.tournamentGoals, 0);
    row.playerCount += 1;
    if (number(player.tournamentGoals, 0) > row.topGoals) {
      row.topGoals = number(player.tournamentGoals, 0);
      row.topPlayer = player.shortName || player.name || "";
    }
  });
  return stats;
}

function championReason(row, stars, ppg, gdPerGame) {
  if (stars.topPlayer && row.goalDiff > 0) return `${stars.topPlayer} is producing, and the team is winning the goal battle.`;
  if (ppg >= 2.2) return "Strong results so far make this team one of the safest picks.";
  if (gdPerGame >= 1) return "Goal difference is trending strongly in the right direction.";
  if (stars.topPlayer) return `${stars.topPlayer} gives this team a clear star-scorer threat.`;
  return "Balanced current results and team strength keep this team in the race.";
}

function renderChampionCandidatesEmpty(message, status = "Waiting for FIFA data") {
  els.championStatus.textContent = status;
  els.championList.innerHTML = `<div class="history-empty">${escapeHtml(message)}</div>`;
}

function is2026FifaWorldCupMatch(match) {
  const competition = `${text(match.CompetitionName)} ${text(match.SeasonName)}`.toLowerCase();
  return competition.includes("fifa world cup")
    && competition.includes("2026")
    && !competition.includes("qualif");
}

function teamHistoryOutcome(match, teamId) {
  if (match.Winner) return match.Winner === teamId ? "W" : "L";
  const teamIsHome = match.Home?.IdTeam === teamId;
  const teamScore = number(teamIsHome ? match.Home?.Score : match.Away?.Score, 0);
  const opponentScore = number(teamIsHome ? match.Away?.Score : match.Home?.Score, 0);
  if (teamScore === opponentScore) return "T";
  return teamScore > opponentScore ? "W" : "L";
}

function renderStageStatus(teamA, teamB) {
  const fixture = state.selectedFixture;
  const aStatus = teamStageStatus(teamA, fixture);
  const bStatus = teamStageStatus(teamB, fixture);
  const label = aStatus.stageLabel || bStatus.stageLabel || "Current stage";
  els.stageStatusLabel.textContent = label;
  els.stageStatusCards.innerHTML = [aStatus, bStatus].map((status) => `
    <article class="stage-card stage-card-${escapeHtml(status.tone)}">
      <div class="stage-card-head">
        <h3>${escapeHtml(teamDisplay(status.team))}</h3>
        <span class="stage-pass-badge">${escapeHtml(status.passLabel)}</span>
      </div>
      <div class="stage-points">
        <strong>${escapeHtml(status.pointsLabel)}</strong>
        <span>${escapeHtml(status.pointsCaption)}</span>
      </div>
      <div class="stage-detail-grid">
        <div><span>Rank</span><strong>${escapeHtml(status.rankLabel)}</strong></div>
        <div><span>Record</span><strong>${escapeHtml(status.recordLabel)}</strong></div>
        <div><span>Total goals</span><strong>${escapeHtml(status.totalGoalsLabel)}</strong></div>
      </div>
      <p>${escapeHtml(status.note)}</p>
    </article>
  `).join("");
}

function renderStageStatusEmpty(message) {
  els.stageStatusLabel.textContent = "Choose two teams";
  els.stageStatusCards.innerHTML = `<div class="history-empty">${escapeHtml(message)}</div>`;
}

function teamStageStatus(team, fixture) {
  const fixtureForTeam = fixture && [fixture.Home?.IdTeam, fixture.Away?.IdTeam].includes(team.id)
    ? fixture
    : fixtureForSelectedTeam(team.id);
  const groupName = text(fixtureForTeam?.GroupName);
  const stageName = text(fixtureForTeam?.StageName);
  const isGroup = /group/i.test(`${groupName} ${stageName}`);
  if (isGroup && groupName) return teamGroupStatus(team, fixtureForTeam, groupName, stageName);
  return teamKnockoutStatus(team, fixtureForTeam, stageName || groupName || "Current stage");
}

function fixtureForSelectedTeam(teamId) {
  const teamFixtures = state.fixtures.filter((fixture) => [fixture.Home?.IdTeam, fixture.Away?.IdTeam].includes(teamId));
  return nextFixture(teamFixtures) || teamFixtures.find(isPlayed) || teamFixtures[0] || null;
}

function teamGroupStatus(team, fixture, groupName, stageName) {
  const groupFixtures = state.fixtures.filter((item) => sameStageGroup(item, fixture, groupName));
  const table = groupTable(groupFixtures);
  const rows = [...table.values()].sort(compareTableRows);
  const row = table.get(team.id) || emptyTableRow(team);
  const rank = rows.findIndex((item) => item.team.id === team.id) + 1;
  const teamMatches = groupFixtures.filter((item) => [item.Home?.IdTeam, item.Away?.IdTeam].includes(team.id));
  const tournamentTotals = tournamentPoints(teamTournamentFixtures(team.id), team.id);
  const completed = teamMatches.filter(isHistoricalResult).length;
  const total = teamMatches.length || 3;
  const pass = groupPassLabel(rank, completed, total);
  return {
    team,
    tone: pass.tone,
    passLabel: pass.label,
    stageLabel: groupName || stageName || "Group stage",
    pointsLabel: `${row.points} pts`,
    pointsCaption: `${completed}/${total} group matches played`,
    rankLabel: rank ? `#${rank}` : "--",
    recordLabel: `${row.wins}W ${row.draws}T ${row.losses}L`,
    totalGoalsLabel: String(tournamentTotals.goalsFor),
    note: pass.note
  };
}

function groupPassLabel(rank, completed, total) {
  const inProgress = completed < total;
  if (rank && rank <= 2) {
    return {
      tone: "pass",
      label: inProgress ? "Pass now" : "Pass",
      note: inProgress ? "Currently in an automatic advancing position." : "Finished in an automatic advancing position."
    };
  }
  if (rank === 3) {
    return {
      tone: "watch",
      label: inProgress ? "Watch" : "Maybe pass",
      note: "Third-place teams may still advance in 2026, so this needs the wider third-place table."
    };
  }
  return {
    tone: "out",
    label: inProgress ? "Not pass now" : "Not pass",
    note: inProgress ? "Currently outside the passing positions." : "Finished outside the passing positions."
  };
}

function teamKnockoutStatus(team, fixture, stageName) {
  const allTeamMatches = state.fixtures.filter((item) => [item.Home?.IdTeam, item.Away?.IdTeam].includes(team.id));
  const points = tournamentPoints(allTeamMatches, team.id);
  let passLabel = "Upcoming";
  let tone = "watch";
  let note = "This stage has no points table; pass status updates after the match result is official.";
  if (fixture && isHistoricalResult(fixture) && [fixture.Home?.IdTeam, fixture.Away?.IdTeam].includes(team.id)) {
    const passed = knockoutWinnerId(fixture) === team.id;
    passLabel = passed ? "Pass" : "Not pass";
    tone = passed ? "pass" : "out";
    note = passed ? "Won this knockout match and moved to the next stage." : "Lost this knockout match and did not move to the next stage.";
  }
  return {
    team,
    tone,
    passLabel,
    stageLabel: stageName || "Current stage",
    pointsLabel: `${points.points} pts`,
    pointsCaption: "Total 2026 match points",
    rankLabel: "Knockout",
    recordLabel: `${points.wins}W ${points.draws}T ${points.losses}L`,
    totalGoalsLabel: String(points.goalsFor),
    note
  };
}

function teamTournamentFixtures(teamId) {
  return state.fixtures.filter((item) => [item.Home?.IdTeam, item.Away?.IdTeam].includes(teamId));
}

function sameStageGroup(match, fixture, groupName) {
  return /group/i.test(`${text(match.GroupName)} ${text(match.StageName)}`)
    && text(match.GroupName) === groupName
    && (!fixture?.StageName || text(match.StageName) === text(fixture.StageName) || /group/i.test(text(match.StageName)));
}

function groupTable(fixtures) {
  const table = new Map();
  fixtures.forEach((fixture) => {
    if (fixture.Home?.IdTeam) ensureTableRow(table, fixture.Home);
    if (fixture.Away?.IdTeam) ensureTableRow(table, fixture.Away);
    if (!isHistoricalResult(fixture)) return;
    updateTableRow(table.get(fixture.Home.IdTeam), fixture.Home.Score, fixture.Away.Score);
    updateTableRow(table.get(fixture.Away.IdTeam), fixture.Away.Score, fixture.Home.Score);
  });
  return table;
}

function ensureTableRow(table, apiTeam) {
  if (!apiTeam?.IdTeam || table.has(apiTeam.IdTeam)) return;
  table.set(apiTeam.IdTeam, {
    team: {
      id: apiTeam.IdTeam,
      name: teamName(apiTeam),
      abbr: apiTeam.Abbreviation || apiTeam.IdCountry || "",
      country: apiTeam.IdCountry || ""
    },
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0
  });
}

function emptyTableRow(team) {
  return {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0
  };
}

function updateTableRow(row, own, opp) {
  if (!row) return;
  const ownScore = number(own, 0);
  const oppScore = number(opp, 0);
  row.played += 1;
  row.goalsFor += ownScore;
  row.goalsAgainst += oppScore;
  row.goalDiff = row.goalsFor - row.goalsAgainst;
  if (ownScore > oppScore) {
    row.wins += 1;
    row.points += 3;
  } else if (ownScore === oppScore) {
    row.draws += 1;
    row.points += 1;
  } else {
    row.losses += 1;
  }
}

function compareTableRows(a, b) {
  return b.points - a.points
    || b.goalDiff - a.goalDiff
    || b.goalsFor - a.goalsFor
    || a.team.name.localeCompare(b.team.name);
}

function tournamentPoints(matches, teamId) {
  const row = emptyTableRow({ id: teamId, name: "", abbr: "" });
  matches.filter(isHistoricalResult).forEach((match) => {
    const isHome = match.Home?.IdTeam === teamId;
    updateTableRow(row, isHome ? match.Home?.Score : match.Away?.Score, isHome ? match.Away?.Score : match.Home?.Score);
  });
  return row;
}

function knockoutWinnerId(fixture) {
  if (fixture?.Winner) return fixture.Winner;
  const home = number(fixture?.Home?.Score, 0);
  const away = number(fixture?.Away?.Score, 0);
  if (home > away) return fixture.Home?.IdTeam;
  if (away > home) return fixture.Away?.IdTeam;
  const homePens = number(fixture?.HomeTeamPenaltyScore, null);
  const awayPens = number(fixture?.AwayTeamPenaltyScore, null);
  if (homePens !== null && awayPens !== null) return homePens > awayPens ? fixture.Home?.IdTeam : fixture.Away?.IdTeam;
  return "";
}

function matchHistoryScore(match) {
  const home = teamName(match.Home) || match.Home?.Abbreviation || "Home team";
  const away = teamName(match.Away) || match.Away?.Abbreviation || "Away team";
  const homeScore = number(match.Home?.Score, 0);
  const awayScore = number(match.Away?.Score, 0);
  const homePens = match.HomeTeamPenaltyScore;
  const awayPens = match.AwayTeamPenaltyScore;
  const penalties = homePens !== null && homePens !== undefined
    && awayPens !== null && awayPens !== undefined
    && number(homePens, 0) + number(awayPens, 0) > 0
    ? ` (pens ${homePens}-${awayPens})`
    : "";
  return `${home} ${homeScore}-${awayScore} ${away}${penalties}`;
}

function formatHistoryDate(value) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function selectedMatchOptions(matchSide, fixture = state.selectedFixture) {
  return {
    fixture,
    matchSide,
    beforeDate: fixture?.Date,
    excludeMatchId: fixture?.IdMatch,
    includeDetails: true
  };
}

async function buildTeamReport(team, side, options = {}) {
  const loadingEl = side === "A" ? els.teamALoading : els.teamBLoading;
  if (!options.quiet && loadingEl) loadingEl.textContent = "Loading squad";
  const squad = await loadSquad(team, { includeDetails: options.includeDetails !== false });
  if (!options.quiet && loadingEl) loadingEl.textContent = "";
  const scored = squad.map((player) => scorePlayer(player, team));
  scored.sort((a, b) => b.overall - a.overall);
  const xi = pickBestXi(scored);
  const depth = scored.filter((player) => !xi.some((starter) => starter.id === player.id)).slice(0, 7);
  const xiAvg = average(xi.map((player) => player.overall));
  const depthAvg = average(depth.map((player) => player.overall));
  const balance = teamBalanceScore(xi);
  const form = tournamentForm(team.id, options.beforeDate, options.excludeMatchId);
  const contextBoost = matchContextBoost(team, options.fixture, options.matchSide || side);
  const history = worldCupPedigreeScore(team);
  const starPower = teamStarPower(xi);
  const finalScore = clamp((xiAvg * 0.56) + (depthAvg * 0.09) + (balance * 0.04) + (form * 0.08) + (history * 0.15) + (starPower * 0.08) + contextBoost, 0, 100);
  return { team, players: scored, xi, depth, xiAvg, depthAvg, balance, form, history, starPower, contextBoost, finalScore };
}

async function loadSquad(team, options = {}) {
  const includeDetails = options.includeDetails !== false;
  let players = state.squads.get(team.id);
  if (players) {
    if (!includeDetails || players.every((player) => player.Detail)) return players;
    players = await Promise.all(players.map(async (player) => player.Detail ? player : { ...player, Detail: await loadPlayerDetail(player.IdPlayer) }));
    state.squads.set(team.id, players);
    return players;
  }
  const url = `${FIFA.api}/teams/${team.id}/squad?language=${FIFA.language}&idCompetition=${FIFA.competitionId}&idSeason=${FIFA.seasonId}`;
  try {
    const data = await fetchJson(url);
    const rawPlayers = data.Players || [];
    state.squads.set(team.id, rawPlayers);
    if (!includeDetails) return rawPlayers;
    players = await Promise.all(rawPlayers.map(async (player) => {
      const detail = await loadPlayerDetail(player.IdPlayer);
      return { ...player, Detail: detail };
    }));
    state.squads.set(team.id, players);
    return players;
  } catch (error) {
    console.warn(`Squad unavailable for ${team.name}`, error);
    const fallback = demoSquad(team.name, team.id);
    state.squads.set(team.id, fallback);
    return fallback;
  }
}

async function loadPlayerDetail(id) {
  if (!id) return {};
  if (state.details.has(id)) return state.details.get(id);
  const url = `${FIFA.api}/players/${id}?language=${FIFA.language}&idCompetition=${FIFA.competitionId}&idSeason=${FIFA.seasonId}`;
  try {
    const detail = await fetchJson(url);
    state.details.set(id, detail);
    return detail;
  } catch {
    state.details.set(id, {});
    return {};
  }
}

function scorePlayer(player, team) {
  const id = player.IdPlayer || player.id || `${team.id}-${player.JerseyNum || player.name}`;
  const role = roleCode(player);
  const base = { ...ROLE_BASE[role] };
  const age = playerAge(player);
  const caps = number(player.Detail?.InternationalCaps, 0);
  const careerGoals = number(player.Detail?.Goals, 0);
  const tournamentGoals = number(player.Goals, 0);
  const height = number(player.Height, null);
  const weight = number(player.Weight, null);
  const ageFit = agePrimeScore(age, role);
  const experience = clamp(48 + Math.log2(caps + 1) * 8.5, 45, 96);
  const goalsSignal = clamp(52 + Math.log2(careerGoals + 1) * 9 + tournamentGoals * 4, 45, 96);
  const bodyScore = physicalScore(role, height, weight, ageFit);
  const starScore = playerStarScore(role, caps, careerGoals, tournamentGoals);

  base.physical = blend(base.physical, bodyScore, 0.55);
  base.consistency = blend(base.consistency, experience, 0.62);
  base.bigGame = blend(base.bigGame, clamp(experience + tournamentGoals * 5, 45, 98), 0.45);
  base.leadership = blend(base.leadership, clamp(experience + (age ? Math.min(age, 34) - 24 : 0) * 1.3, 45, 96), 0.45);
  base.statistical = productionScore(role, goalsSignal, tournamentGoals, caps);
  base.analytics = analyticsProxy(role, base);
  base.tactical = blend(base.tactical, experience, 0.22);
  base.technical = blend(base.technical, ageFit, 0.08);
  if (starScore > 70) {
    const starLift = starScore - 70;
    base.technical = clamp(base.technical + starLift * 0.16, 0, 99);
    base.statistical = clamp(base.statistical + starLift * 0.24, 0, 99);
    base.bigGame = clamp(base.bigGame + starLift * 0.34, 0, 99);
    base.leadership = clamp(base.leadership + starLift * 0.14, 0, 99);
    base.analytics = clamp(base.analytics + starLift * 0.10, 0, 99);
  }

  const override = state.overrides[id] || {};
  const metrics = {};
  METRICS.forEach(([key]) => {
    metrics[key] = clamp(number(override[key], base[key]), 0, 100);
  });
  const overall = clamp(weightedScore(metrics, state.weights) + Math.max(0, starScore - 76) * 0.08, 0, 100);
  return {
    id,
    name: text(player.PlayerName) || text(player.ShortName) || player.name || "Unknown player",
    shortName: text(player.ShortName) || text(player.PlayerName) || player.name || "Unknown",
    jersey: player.JerseyNum || "",
    role,
    age,
    height,
    weight,
    caps,
    goals: careerGoals,
    tournamentGoals,
    starScore,
    metrics,
    overall
  };
}

function playerStarScore(role, caps, careerGoals, tournamentGoals) {
  const goalFactor = role === "FWD" ? 0.42 : role === "MID" ? 0.26 : role === "DEF" ? 0.12 : 0.05;
  const capSignal = clamp(caps * 0.28, 0, 32);
  const goalSignal = clamp(careerGoals * goalFactor, 0, 34);
  const worldCupSignal = clamp(tournamentGoals * 4.5, 0, 18);
  return clamp(48 + capSignal + goalSignal + worldCupSignal, 42, 99);
}

function teamStarPower(xi) {
  if (!xi.length) return 58;
  const sorted = [...xi].sort((a, b) => b.starScore - a.starScore);
  const topThree = average(sorted.slice(0, 3).map((player) => player.starScore));
  const best = sorted[0]?.starScore || 58;
  return clamp(topThree * 0.74 + best * 0.26, 45, 99);
}

function worldCupPedigreeScore(team) {
  if (!team?.abbr) return 42;
  const history = state.worldCupHistory.get(team.abbr);
  if (!history) return 41;
  return clamp(number(history.score, 42), 38, 94);
}

function productionScore(role, goalsSignal, tournamentGoals, caps) {
  if (role === "FWD") return clamp(goalsSignal + tournamentGoals * 2, 45, 98);
  if (role === "MID") return clamp(58 + Math.log2(caps + 1) * 5 + tournamentGoals * 3, 45, 94);
  if (role === "DEF") return clamp(56 + Math.log2(caps + 1) * 4 + tournamentGoals * 2, 45, 90);
  return clamp(56 + Math.log2(caps + 1) * 4, 45, 90);
}

function analyticsProxy(role, metrics) {
  const possessionValue = role === "MID" ? metrics.technical * 0.45 + metrics.tactical * 0.4 + metrics.statistical * 0.15
    : role === "FWD" ? metrics.technical * 0.35 + metrics.statistical * 0.45 + metrics.physical * 0.2
      : role === "DEF" ? metrics.defensive * 0.45 + metrics.tactical * 0.35 + metrics.physical * 0.2
        : metrics.defensive * 0.5 + metrics.tactical * 0.3 + metrics.physical * 0.2;
  return clamp(possessionValue, 0, 100);
}

function pickBestXi(players) {
  const buckets = {
    GK: players.filter((p) => p.role === "GK"),
    DEF: players.filter((p) => p.role === "DEF"),
    MID: players.filter((p) => p.role === "MID"),
    FWD: players.filter((p) => p.role === "FWD")
  };
  Object.values(buckets).forEach((bucket) => bucket.sort((a, b) => b.overall - a.overall));
  const xi = [
    ...buckets.GK.slice(0, 1),
    ...buckets.DEF.slice(0, 4),
    ...buckets.MID.slice(0, 3),
    ...buckets.FWD.slice(0, 3)
  ];
  const selected = new Set(xi.map((p) => p.id));
  players.forEach((player) => {
    if (xi.length < 11 && !selected.has(player.id)) {
      xi.push(player);
      selected.add(player.id);
    }
  });
  return xi;
}

function teamBalanceScore(xi) {
  const count = (role) => xi.filter((player) => player.role === role).length;
  const targetPenalty = Math.abs(count("GK") - 1) * 12 + Math.abs(count("DEF") - 4) * 4 + Math.abs(count("MID") - 3) * 4 + Math.abs(count("FWD") - 3) * 4;
  return clamp(86 - targetPenalty, 50, 94);
}

function tournamentForm(teamId, beforeDate = null, excludeMatchId = null) {
  const cutoff = beforeDate ? new Date(beforeDate) : new Date();
  const played = state.fixtures.filter((fixture) => (
    isHistoricalResult(fixture)
    && fixture.IdMatch !== excludeMatchId
    && new Date(fixture.Date) < cutoff
    && [fixture.Home?.IdTeam, fixture.Away?.IdTeam].includes(teamId)
  ));
  if (!played.length) return 62;
  let points = 0;
  let goalDiff = 0;
  played.forEach((fixture) => {
    const isHome = fixture.Home?.IdTeam === teamId;
    const own = number(isHome ? fixture.Home.Score : fixture.Away.Score, 0);
    const opp = number(isHome ? fixture.Away.Score : fixture.Home.Score, 0);
    goalDiff += own - opp;
    if (own > opp) points += 3;
    else if (own === opp) points += 1;
  });
  return clamp(54 + (points / played.length) * 10 + goalDiff * 2, 40, 94);
}

function matchContextBoost(team, fixture, side) {
  if (!fixture || !team) return 0;
  let boost = 0;
  if (fixture.Stadium?.IdCountry && team.country && fixture.Stadium.IdCountry === team.country) boost += 1.4;
  if (side === "A") boost += 0.25;
  return boost;
}

function renderPrediction(aReport, bReport) {
  const result = calculatePrediction(aReport, bReport, state.calibration);
  const confidence = result.pickCode === "TIE" ? result.tieProb : Math.max(result.aProb, result.bProb);
  els.predictionText.textContent = result.pickText;
  els.confidenceText.textContent = `Model confidence: ${(confidence * 100).toFixed(0)}%. Star players and previous World Cup performance now carry more weight.`;
  [els.aProbBar, els.tieProbBar, els.bProbBar].forEach((bar) => bar.parentElement.parentElement.classList.remove("is-pick"));
  const pickedBar = result.pickCode === "A" ? els.aProbBar : result.pickCode === "B" ? els.bProbBar : els.tieProbBar;
  pickedBar.parentElement.parentElement.classList.add("is-pick");
  updateBar(els.aProbBar, els.aProb, result.aProb);
  updateBar(els.bProbBar, els.bProb, result.bProb);
  updateBar(els.tieProbBar, els.tieProb, result.tieProb);
}

function calculatePrediction(aReport, bReport, calibration = DEFAULT_CALIBRATION) {
  const rawDiff = aReport.finalScore - bReport.finalScore;
  const diff = rawDiff * number(calibration.diffMultiplier, 1);
  const absDiff = Math.abs(diff);
  const tieBase = number(calibration.tieBase, DEFAULT_CALIBRATION.tieBase);
  const tieChance = clamp(tieBase - absDiff * 0.03, 0.07, 0.34);
  const nonTie = 1 - tieChance;
  const aShare = 1 / (1 + Math.exp(-diff / 4.2));
  let aProb = nonTie * aShare;
  let bProb = nonTie * (1 - aShare);
  let tieProb = tieChance;
  const total = aProb + bProb + tieProb;
  aProb /= total;
  bProb /= total;
  tieProb /= total;

  let pickCode = "TIE";
  if (absDiff >= number(calibration.drawThreshold, DEFAULT_CALIBRATION.drawThreshold)) {
    pickCode = diff > 0 ? "A" : "B";
  }
  return {
    rawDiff,
    diff,
    aProb,
    bProb,
    tieProb,
    pickCode,
    pickText: pickCode === "TIE" ? "Tie" : pickCode === "A" ? `${teamDisplay(aReport.team)} win` : `${teamDisplay(bReport.team)} win`
  };
}

function renderTeamReport(report, side) {
  const isA = side === "A";
  const title = isA ? els.teamAPlayersTitle : els.teamBPlayersTitle;
  const table = isA ? els.teamATable : els.teamBTable;
  title.textContent = `${teamDisplay(report.team)} Players`;
  const starters = new Set(report.xi.map((player) => player.id));
  table.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>XI</th><th>No.</th><th>Player</th><th>Role</th><th>Age</th><th>Caps</th><th>Goals</th><th>Star</th><th>Overall</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${report.players.map((player) => `
          <tr class="${starters.has(player.id) ? "selected-xi" : ""}">
            <td>${starters.has(player.id) ? "Yes" : ""}</td>
            <td>${escapeHtml(player.jersey)}</td>
            <td>${escapeHtml(player.shortName)}</td>
            <td><span class="role-pill">${player.role}</span></td>
            <td>${player.age || "--"}</td>
            <td>${player.caps || "--"}</td>
            <td>${player.goals || 0}</td>
            <td>${player.starScore.toFixed(0)}</td>
            <td class="score">${player.overall.toFixed(1)}</td>
            <td><button class="select-player-btn" type="button" data-player-id="${escapeHtml(player.id)}">Edit</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  table.querySelectorAll("[data-player-id]").forEach((button) => {
    button.addEventListener("click", () => {
      els.playerSelect.value = button.dataset.playerId;
      renderPlayerEditor();
      const assumptionsDetails = document.querySelector(".assumptions-panel details");
      if (assumptionsDetails) assumptionsDetails.open = true;
      document.querySelector(".assumptions-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderPlayerSelect(aReport, bReport) {
  state.selectedPlayers = [...aReport.players, ...bReport.players];
  const current = els.playerSelect.value;
  els.playerSelect.innerHTML = state.selectedPlayers
    .map((player) => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.shortName)} (${player.role})</option>`)
    .join("");
  if (state.selectedPlayers.some((player) => player.id === current)) els.playerSelect.value = current;
  renderPlayerEditor();
}

function renderModelReviewWaiting() {
  state.calibration = { ...DEFAULT_CALIBRATION };
  els.reviewStatus.textContent = "Checking completed matches";
  els.reviewMetrics.innerHTML = `
    <div class="review-metric"><span>Completed matches</span><strong>--</strong></div>
    <div class="review-metric"><span>Original accuracy</span><strong>--</strong></div>
    <div class="review-metric"><span>Calibrated accuracy</span><strong>--</strong></div>
    <div class="review-metric"><span>Adjustment</span><strong>--</strong></div>
  `;
  els.reviewReasons.innerHTML = "<p>Refresh FIFA data to compare predictions with real completed results.</p>";
  els.reviewTable.innerHTML = "";
}

async function runModelReview() {
  const runId = ++state.reviewRunId;
  const played = state.fixtures
    .filter((fixture) => isHistoricalResult(fixture) && fixture.Home?.IdTeam && fixture.Away?.IdTeam)
    .sort((a, b) => new Date(a.Date) - new Date(b.Date));

  if (!played.length) {
    state.calibration = { ...DEFAULT_CALIBRATION, note: "No completed matches yet" };
    els.reviewStatus.textContent = "No completed matches";
    els.reviewReasons.innerHTML = "<p>No completed FIFA matches are available in the current fixture data yet, so the default model is being used.</p>";
    els.reviewTable.innerHTML = "";
    return;
  }

  els.reviewStatus.textContent = `Reviewing ${played.length} completed matches`;
  const rows = [];
  for (const fixture of played) {
    if (runId !== state.reviewRunId) return;
    addTeam(fixture.Home);
    addTeam(fixture.Away);
    const home = state.teams.get(fixture.Home.IdTeam);
    const away = state.teams.get(fixture.Away.IdTeam);
    if (!home || !away) continue;
    try {
      const [aReport, bReport] = await Promise.all([
        buildTeamReport(home, "A", { quiet: true, includeDetails: false, fixture, matchSide: "A", beforeDate: fixture.Date, excludeMatchId: fixture.IdMatch }),
        buildTeamReport(away, "B", { quiet: true, includeDetails: false, fixture, matchSide: "B", beforeDate: fixture.Date, excludeMatchId: fixture.IdMatch })
      ]);
      const baseline = calculatePrediction(aReport, bReport, DEFAULT_CALIBRATION);
      const actual = actualOutcome(fixture);
      rows.push({
        fixture,
        aReport,
        bReport,
        baseline,
        actual,
        baselineCorrect: baseline.pickCode === actual
      });
    } catch (error) {
      console.warn("Model review skipped a match", fixture.IdMatch, error);
    }
  }

  if (runId !== state.reviewRunId) return;
  const calibration = deriveCalibration(rows);
  const adjustedRows = rows.map((row) => {
    const adjusted = calculatePrediction(row.aReport, row.bReport, calibration);
    return { ...row, adjusted, adjustedCorrect: adjusted.pickCode === row.actual };
  });
  state.calibration = calibration;
  renderModelReview(adjustedRows, calibration);
  predictSelected();
}

function deriveCalibration(rows) {
  if (!rows.length) return { ...DEFAULT_CALIBRATION, note: "No completed matches yet" };
  const actualDrawRate = rows.filter((row) => row.actual === "TIE").length / rows.length;
  const predictedDrawRate = rows.filter((row) => row.baseline.pickCode === "TIE").length / rows.length;
  const decisive = rows.filter((row) => row.baseline.pickCode !== "TIE");
  const decisiveCorrectRate = decisive.length ? decisive.filter((row) => row.baselineCorrect).length / decisive.length : 0.5;
  const sampleTrust = clamp(rows.length / 24, 0.25, 1);

  let startingDrawThreshold = DEFAULT_CALIBRATION.drawThreshold;
  let startingTieBase = DEFAULT_CALIBRATION.tieBase;
  if (actualDrawRate > predictedDrawRate + 0.08) {
    startingDrawThreshold = 2.8;
    startingTieBase = 0.39;
  } else if (predictedDrawRate > actualDrawRate + 0.08) {
    startingDrawThreshold = 1.9;
    startingTieBase = 0.30;
  }

  let startingDiffMultiplier = 1;
  if (decisiveCorrectRate < 0.52) startingDiffMultiplier = 0.82;
  else if (decisiveCorrectRate < 0.62) startingDiffMultiplier = 0.92;
  else if (decisiveCorrectRate > 0.74) startingDiffMultiplier = 1.06;

  let best = {
    drawThreshold: startingDrawThreshold,
    tieBase: startingTieBase,
    diffMultiplier: startingDiffMultiplier,
    score: -Infinity
  };
  const thresholds = [0.6, 0.8, 1.0, 1.1, 1.3, 1.5, 1.8, 2.2];
  const tieBases = [0.16, 0.20, 0.24, 0.28, 0.32];
  const multipliers = [0.90, 1.00, 1.10, 1.20, 1.30];

  thresholds.forEach((drawThreshold) => {
    tieBases.forEach((tieBase) => {
      multipliers.forEach((diffMultiplier) => {
        const candidate = { drawThreshold, tieBase, diffMultiplier };
        const correct = rows.filter((row) => calculatePrediction(row.aReport, row.bReport, candidate).pickCode === row.actual).length;
        const brier = average(rows.map((row) => brierScore(calculatePrediction(row.aReport, row.bReport, candidate), row.actual)));
        const distancePenalty = Math.abs(drawThreshold - DEFAULT_CALIBRATION.drawThreshold) * 0.01
          + Math.abs(tieBase - DEFAULT_CALIBRATION.tieBase) * 0.4
          + Math.abs(diffMultiplier - DEFAULT_CALIBRATION.diffMultiplier) * 0.08;
        const score = (correct / rows.length) - brier * 0.03 - distancePenalty * (1 - sampleTrust * 0.5);
        if (score > best.score) best = { ...candidate, score };
      });
    });
  });

  return {
    drawThreshold: blend(DEFAULT_CALIBRATION.drawThreshold, best.drawThreshold, sampleTrust),
    tieBase: blend(DEFAULT_CALIBRATION.tieBase, best.tieBase, sampleTrust),
    diffMultiplier: blend(DEFAULT_CALIBRATION.diffMultiplier, best.diffMultiplier, sampleTrust),
    sampleSize: rows.length,
    note: "Calibrated from completed FIFA matches"
  };
}

function brierScore(prediction, actual) {
  return ["A", "B", "TIE"].reduce((sum, code) => {
    const probability = code === "A" ? prediction.aProb : code === "B" ? prediction.bProb : prediction.tieProb;
    const target = actual === code ? 1 : 0;
    return sum + (probability - target) ** 2;
  }, 0);
}

function renderModelReview(rows, calibration) {
  const baselineAccuracy = accuracy(rows, "baselineCorrect");
  const adjustedAccuracy = accuracy(rows, "adjustedCorrect");
  const actualDraws = rows.filter((row) => row.actual === "TIE").length;
  els.reviewStatus.textContent = `Reviewed ${rows.length} completed matches`;
  els.reviewMetrics.innerHTML = `
    <div class="review-metric"><span>Completed matches</span><strong>${rows.length}</strong></div>
    <div class="review-metric"><span>Original accuracy</span><strong>${percent(baselineAccuracy)}</strong></div>
    <div class="review-metric"><span>Calibrated accuracy</span><strong>${percent(adjustedAccuracy)}</strong></div>
    <div class="review-metric"><span>Adjustment</span><strong>${calibration.diffMultiplier.toFixed(2)}x</strong></div>
  `;
  els.reviewReasons.innerHTML = reviewReasons(rows, calibration, actualDraws).map((reason) => `<p>${escapeHtml(reason)}</p>`).join("");
  els.reviewTable.innerHTML = `
    <table>
      <thead>
        <tr><th>Match</th><th>Actual</th><th>Original</th><th>Calibrated</th><th>Score gap</th></tr>
      </thead>
      <tbody>
        ${rows.slice(-12).reverse().map((row) => `
          <tr>
            <td>${escapeHtml(fixtureTeamDisplay(row.fixture.Home))} vs ${escapeHtml(fixtureTeamDisplay(row.fixture.Away))}</td>
            <td>${escapeHtml(outcomeLabel(row.actual, row.fixture))}</td>
            <td>${escapeHtml(outcomeLabel(row.baseline.pickCode, row.fixture))}${row.baselineCorrect ? " ✓" : ""}</td>
            <td>${escapeHtml(outcomeLabel(row.adjusted.pickCode, row.fixture))}${row.adjustedCorrect ? " ✓" : ""}</td>
            <td>${row.baseline.rawDiff.toFixed(1)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function reviewReasons(rows, calibration, actualDraws) {
  const missedDraws = rows.filter((row) => row.actual === "TIE" && row.baseline.pickCode !== "TIE").length;
  const falseDraws = rows.filter((row) => row.actual !== "TIE" && row.baseline.pickCode === "TIE").length;
  const closeMisses = rows.filter((row) => !row.baselineCorrect && Math.abs(row.baseline.rawDiff) < 3).length;
  const decisiveMisses = rows.filter((row) => !row.baselineCorrect && row.baseline.pickCode !== "TIE" && Math.abs(row.baseline.rawDiff) >= 3).length;
  const reasons = [];

  if (rows.length < 12) {
    reasons.push("The sample is still small, so the calibration is conservative and avoids overreacting to one surprising scoreline.");
  }
  if (missedDraws > falseDraws) {
    reasons.push(`The original model missed ${missedDraws} draw result${missedDraws === 1 ? "" : "s"}, so close score gaps now receive a higher tie probability.`);
  } else if (falseDraws > missedDraws) {
    reasons.push(`The original model predicted too many ties compared with ${actualDraws} real draw result${actualDraws === 1 ? "" : "s"}, so the tie threshold is tighter.`);
  }
  if (decisiveMisses) {
    reasons.push(`Favorites were not reliable enough in ${decisiveMisses} decisive-looking miss${decisiveMisses === 1 ? "" : "es"}, so team-score gaps are compressed to reduce overconfidence.`);
  }
  if (closeMisses) {
    if (falseDraws > missedDraws) {
      reasons.push(`${closeMisses} miss${closeMisses === 1 ? "" : "es"} came from matches the model saw as close; those are now kept lower confidence instead of automatically becoming ties.`);
    } else {
      reasons.push(`${closeMisses} miss${closeMisses === 1 ? "" : "es"} came from matches the model saw as close; those are now treated with more draw and underdog risk.`);
    }
  }
  reasons.push(`Current calibration: draw threshold ${calibration.drawThreshold.toFixed(1)}, tie base ${(calibration.tieBase * 100).toFixed(0)}%, score-gap multiplier ${calibration.diffMultiplier.toFixed(2)}x.`);
  return reasons;
}

function accuracy(rows, key) {
  return rows.length ? rows.filter((row) => row[key]).length / rows.length : 0;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function actualOutcome(fixture) {
  const home = number(fixture.Home?.Score, 0);
  const away = number(fixture.Away?.Score, 0);
  if (home > away) return "A";
  if (away > home) return "B";
  return "TIE";
}

function outcomeLabel(code, fixture) {
  if (code === "TIE") return "Tie";
  if (code === "A") return `${fixture.Home?.Abbreviation || "A"} win`;
  if (code === "B") return `${fixture.Away?.Abbreviation || "B"} win`;
  return code;
}

function renderPlayerEditor() {
  const player = state.selectedPlayers.find((item) => item.id === els.playerSelect.value);
  if (!player) {
    els.playerSliders.innerHTML = "<p>Select a player after loading two teams.</p>";
    return;
  }
  els.playerSliders.innerHTML = METRICS.map(([key, label]) => {
    const value = Math.round(player.metrics[key]);
    return `
      <div class="slider-row">
        <label>
          <span>${label}</span>
          <input type="range" min="0" max="100" value="${value}" data-metric="${key}">
        </label>
        <input type="number" min="0" max="100" value="${value}" data-number="${key}">
      </div>
    `;
  }).join("");
  els.playerSliders.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.metric || input.dataset.number;
      const value = clamp(number(input.value, 0), 0, 100);
      state.overrides[player.id] = { ...(state.overrides[player.id] || {}), [key]: value };
      saveJson(STORAGE_KEYS.overrides, state.overrides);
      const pair = els.playerSliders.querySelector(input.dataset.metric ? `[data-number="${key}"]` : `[data-metric="${key}"]`);
      if (pair) pair.value = value;
      predictSelected();
    });
  });
}

function renderWeights() {
  els.weightsGrid.innerHTML = METRICS.map(([key, label]) => `
    <div class="weight-row">
      <span>${label}</span>
      <input type="number" min="0" max="50" value="${number(state.weights[key], DEFAULT_WEIGHTS[key])}" data-weight="${key}">
    </div>
  `).join("");
  els.weightsGrid.querySelectorAll("[data-weight]").forEach((input) => {
    input.addEventListener("input", () => {
      state.weights[input.dataset.weight] = clamp(number(input.value, 0), 0, 50);
      saveJson(STORAGE_KEYS.weights, state.weights);
      predictSelected();
    });
  });
}

function demoSquad(teamName, teamId) {
  const names = ["Keeper", "Right Back", "Centre Back", "Stopper", "Left Back", "Anchor", "Playmaker", "Runner", "Right Wing", "Striker", "Left Wing", "Utility", "Prospect"];
  const roles = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD", "MID", "FWD"];
  return names.map((name, index) => ({
    IdPlayer: `${teamId}-${index}`,
    PlayerName: [{ Locale: "en-GB", Description: `${teamName} ${name}` }],
    ShortName: [{ Locale: "en-GB", Description: name }],
    JerseyNum: index + 1,
    PositionLocalized: [{ Locale: "en-GB", Description: roleName(roles[index]) }],
    BirthDate: `${1994 + (index % 8)}-04-10T00:00:00Z`,
    Height: roles[index] === "GK" ? 190 : 176 + (index % 13),
    Weight: 72 + (index % 20),
    Goals: roles[index] === "FWD" ? index % 4 : 0,
    Detail: { InternationalCaps: 12 + index * 4, Goals: roles[index] === "FWD" ? 4 + index : index % 3 }
  }));
}

function roleName(role) {
  return role === "GK" ? "Goalkeeper" : role === "DEF" ? "Defender" : role === "MID" ? "Midfielder" : "Forward";
}

function roleCode(player) {
  const label = `${text(player.RealPositionLocalized)} ${text(player.PositionLocalized)} ${player.Position ?? ""}`.toLowerCase();
  if (label.includes("goalkeeper") || player.Position === 0) return "GK";
  if (label.includes("defender") || player.Position === 1) return "DEF";
  if (label.includes("midfield") || player.Position === 2) return "MID";
  if (label.includes("forward") || player.Position === 3) return "FWD";
  return "MID";
}

function physicalScore(role, height, weight, ageFit) {
  let score = ageFit * 0.55 + 35;
  if (height) {
    if (role === "GK") score += (height - 182) * 0.65;
    else if (role === "DEF") score += (height - 178) * 0.35;
    else if (role === "FWD") score += Math.max(0, 184 - Math.abs(height - 184)) * 0.04;
  }
  if (weight) score += clamp((weight - 72) * 0.18, -4, 5);
  return clamp(score, 45, 96);
}

function agePrimeScore(age, role) {
  if (!age) return 66;
  const prime = role === "GK" ? 30 : role === "DEF" ? 28 : role === "MID" ? 27 : 26;
  return clamp(96 - Math.abs(age - prime) * 4.5, 45, 98);
}

function playerAge(player) {
  const value = player.BirthDate || player.Detail?.BirthDate;
  if (!value) return null;
  const born = new Date(value);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

function weightedScore(metrics, weights) {
  const totalWeight = Object.values(weights).reduce((sum, value) => sum + number(value, 0), 0) || 1;
  const total = METRICS.reduce((sum, [key]) => sum + metrics[key] * number(weights[key], 0), 0);
  return clamp(total / totalWeight, 0, 100);
}

function updatePredictionEmpty() {
  els.predictionText.textContent = "Choose two teams";
  els.confidenceText.textContent = "Select a FIFA fixture or choose two teams manually.";
  [els.aProbBar, els.tieProbBar, els.bProbBar].forEach((bar) => bar.parentElement.parentElement.classList.remove("is-pick"));
  updateBar(els.aProbBar, els.aProb, 0);
  updateBar(els.bProbBar, els.bProb, 0);
  updateBar(els.tieProbBar, els.tieProb, 0);
}

function updateBar(bar, label, value) {
  const percent = Math.round(value * 100);
  bar.style.width = `${percent}%`;
  label.textContent = `${percent}%`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function text(list) {
  if (!Array.isArray(list)) return "";
  return list.find((item) => item.Locale === "en-GB")?.Description || list[0]?.Description || "";
}

function countryNameFromAbbr(abbr) {
  return COUNTRY_CODE_NAMES[String(abbr || "").toUpperCase()] || "";
}

function teamDisplay(team) {
  if (!team) return "TBD";
  const name = team.name || countryNameFromAbbr(team.abbr) || "TBD";
  return team.abbr ? `${name} (${team.abbr})` : name;
}

function fixtureTeamDisplay(team) {
  if (!team) return "TBD";
  const abbr = team.Abbreviation || team.IdCountry || "";
  const name = teamName(team) || countryNameFromAbbr(abbr) || "TBD";
  return abbr ? `${name} (${abbr})` : name;
}

function teamName(team) {
  return text(team?.TeamName) || team?.ShortClubName || countryNameFromAbbr(team?.Abbreviation || team?.IdCountry) || team?.Abbreviation || "TBD";
}

function formatDate(value) {
  if (!value) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

function isPlayed(fixture) {
  return Boolean(
    hasMatchScore(fixture)
    && new Date(fixture.Date) < new Date()
  );
}

function hasMatchScore(fixture) {
  return Boolean(
    fixture?.Home
    && fixture?.Away
    && fixture.Home.Score !== null
    && fixture.Home.Score !== undefined
    && fixture.Away.Score !== null
    && fixture.Away.Score !== undefined
  );
}

function hasFixtureTeams(fixture) {
  return Boolean(fixture?.Home?.IdTeam && fixture?.Away?.IdTeam);
}

function hasOfficialFinalStatus(fixture) {
  if (!hasMatchScore(fixture)) return false;
  const matchStatus = Number(fixture.MatchStatus);
  const officialityStatus = Number(fixture.OfficialityStatus);
  return matchStatus === 0 || officialityStatus >= 2;
}

function isCurrentFixtureWindow(fixture) {
  const kickoff = new Date(fixture?.Date).getTime();
  const now = Date.now();
  return Number.isFinite(kickoff)
    && !hasOfficialFinalStatus(fixture)
    && kickoff <= now
    && now - kickoff <= CURRENT_MATCH_WINDOW_MS;
}

function isHistoricalResult(fixture) {
  return isPlayed(fixture) && (hasOfficialFinalStatus(fixture) || !isCurrentFixtureWindow(fixture));
}

function preferredFixture(fixtures = state.fixtures) {
  return currentFixture(fixtures)
    || nextFixture(fixtures)
    || latestPlayedFixture(fixtures)
    || fixtures.find(hasFixtureTeams)
    || fixtures[0]
    || null;
}

function currentFixture(fixtures = state.fixtures) {
  return fixtures.find((fixture) => hasFixtureTeams(fixture) && isCurrentFixtureWindow(fixture));
}

function nextFixture(fixtures = state.fixtures) {
  const now = new Date();
  return fixtures.find((fixture) => hasFixtureTeams(fixture) && new Date(fixture.Date) >= now)
    || fixtures.find((fixture) => hasFixtureTeams(fixture) && !isPlayed(fixture));
}

function latestPlayedFixture(fixtures = state.fixtures) {
  return [...fixtures]
    .filter(isHistoricalResult)
    .sort((a, b) => new Date(b.Date) - new Date(a.Date))[0];
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 60;
}

function blend(a, b, weightB) {
  return a * (1 - weightB) + b * weightB;
}

function number(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function signedNumber(value) {
  const n = number(value, 0);
  if (n > 0) return `+${n}`;
  return `${n}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setStatus(message) {
  els.dataStatus.textContent = message;
}

function setBusy(isBusy) {
  els.refreshBtn.disabled = isBusy;
  els.refreshBtn.textContent = isBusy ? "Refreshing..." : "Refresh FIFA data";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}
