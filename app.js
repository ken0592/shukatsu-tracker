const storageKey = "shukatsu-tracker-entries";
const mascotPositionKey = "shukatsu-tracker-mascot-position";
const activeStatuses = ["気になる", "応募予定", "応募済み", "ES提出済み", "Webテスト", "一次面接", "二次面接", "最終面接", "結果待ち", "選考通過", "インターン選考通過", "インターン参加決定"];
const finishedStatuses = ["内定", "落選", "辞退", "参加済み"];
const celebrationStatuses = ["内定", "選考通過", "インターン選考通過", "インターン参加決定"];
const rejectionStatuses = ["落選"];
const sampleCompanyNames = ["株式会社サンプル商事", "ミライテック株式会社", "東都キャリア株式会社"];
const initialCalendarDate = new Date();
const commonIndustries = ["IT・通信", "メーカー", "商社", "金融", "コンサル", "広告・メディア", "人材", "不動産・建設", "インフラ", "小売・サービス","製薬"];
const quoteMonthDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const quoteEntries = window.SHUKATSU_DAILY_QUOTES || [];
const dailyQuotes = buildDailyQuotes();
const defaultMascotImage = "./assets/mascot-summer-smile.png";
const mascotImageVariants = {
  spring: {
    normal: ["./assets/mascot-spring-open.png", "./assets/mascot-spring-smile.png"],
    angry: "./assets/mascot-spring-angry.png"
  },
  summer: {
    normal: ["./assets/mascot-summer-open.png", "./assets/mascot-summer-smile.png"],
    angry: "./assets/mascot-summer-angry.png"
  },
  autumn: {
    normal: ["./assets/mascot-autumn-open.png", "./assets/mascot-autumn-smile.png"],
    angry: "./assets/mascot-autumn-angry.png"
  },
  winter: {
    normal: ["./assets/mascot-winter-open.png", "./assets/mascot-winter-smile.png"],
    angry: "./assets/mascot-winter-angry.png"
  }
};

ensureMascotDom();

const appConfig = window.SHUKATSU_CONFIG || {};
const hasCloudConfig = Boolean(appConfig.supabaseUrl && appConfig.supabaseAnonKey && window.supabase);
const supabaseClient = hasCloudConfig
  ? window.supabase.createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey)
  : null;

const state = {
  entries: [],
  filter: "all",
  searchQuery: "",
  industryFilter: "all",
  deadlineFilter: "all",
  priorityFilter: "all",
  mode: hasCloudConfig ? "cloud" : "local",
  session: null,
  loading: true,
  editingId: null,
  calendarYear: initialCalendarDate.getFullYear(),
  calendarMonth: initialCalendarDate.getMonth()
};

const els = {
  openFormButton: document.querySelector("#openFormButton"),
  closeFormButton: document.querySelector("#closeFormButton"),
  clearSampleButton: document.querySelector("#clearSampleButton"),
  signOutButton: document.querySelector("#signOutButton"),
  signInButton: document.querySelector("#signInButton"),
  signUpButton: document.querySelector("#signUpButton"),
  refreshButton: document.querySelector("#refreshButton"),
  importLocalButton: document.querySelector("#importLocalButton"),
  authForm: document.querySelector("#authForm"),
  authPanel: document.querySelector("#authPanel"),
  accountPanel: document.querySelector("#accountPanel"),
  localPanel: document.querySelector("#localPanel"),
  appContent: document.querySelector("#appContent"),
  dailyQuote: document.querySelector("#dailyQuote"),
  authEmailInput: document.querySelector("#authEmailInput"),
  authPasswordInput: document.querySelector("#authPasswordInput"),
  authMessage: document.querySelector("#authMessage"),
  userEmailLabel: document.querySelector("#userEmailLabel"),
  syncStatus: document.querySelector("#syncStatus"),
  entryDialog: document.querySelector("#entryDialog"),
  entryForm: document.querySelector("#entryForm"),
  entryFormTitle: document.querySelector("#entryFormTitle"),
  saveEntryButton: document.querySelector("#saveEntryButton"),
  deadlineCount: document.querySelector("#deadlineCount"),
  eventCount: document.querySelector("#eventCount"),
  activeCount: document.querySelector("#activeCount"),
  deadlineList: document.querySelector("#deadlineList"),
  eventList: document.querySelector("#eventList"),
  companyList: document.querySelector("#companyList"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarMonthLabel: document.querySelector("#calendarMonthLabel"),
  prevCalendarButton: document.querySelector("#prevCalendarButton"),
  nextCalendarButton: document.querySelector("#nextCalendarButton"),
  todayCalendarButton: document.querySelector("#todayCalendarButton"),
  companySearchInput: document.querySelector("#companySearchInput"),
  industryFilterInput: document.querySelector("#industryFilterInput"),
  deadlineFilterInput: document.querySelector("#deadlineFilterInput"),
  priorityFilterInput: document.querySelector("#priorityFilterInput"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  filterButtons: document.querySelectorAll(".filter-button"),
  mascot: document.querySelector("#mascot"),
  mascotBubble: document.querySelector("#mascotBubble"),
  celebrationOverlay: document.querySelector("#celebrationOverlay"),
  celebrationConfetti: document.querySelector("#celebrationConfetti"),
  celebrationTitle: document.querySelector("#celebrationTitle"),
  celebrationMessage: document.querySelector("#celebrationMessage"),
  closeCelebrationButton: document.querySelector("#closeCelebrationButton"),
  toast: document.querySelector("#toast")
};

const mascotState = {
  x: 28,
  y: 140,
  vx: 0.075,
  vy: 0.055,
  lastTime: 0,
  wanderTimer: null,
  bubbleTimer: null,
  celebrationTimer: null,
  isDragging: false,
  didDrag: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  dragStartX: 0,
  dragStartY: 0,
  hasCustomPosition: false,
  reducedMotion: window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
};

bindEvents();
init();

function bindEvents() {
  els.openFormButton.addEventListener("click", () => {
    if (state.mode === "cloud" && !state.session) {
      showToast("ログインすると追加できます。");
      return;
    }

    openEntryDialog();
  });

  els.closeFormButton.addEventListener("click", () => {
    resetEntryForm();
    els.entryDialog.close();
  });

  els.clearSampleButton.addEventListener("click", handleClearEntries);
  els.entryForm.addEventListener("submit", handleEntrySubmit);
  els.authForm.addEventListener("submit", (event) => event.preventDefault());
  els.signInButton.addEventListener("click", handleSignIn);
  els.signUpButton.addEventListener("click", handleSignUp);
  els.signOutButton.addEventListener("click", handleSignOut);
  els.refreshButton.addEventListener("click", loadCloudEntries);
  els.importLocalButton.addEventListener("click", handleImportLocalEntries);
  els.mascot.addEventListener("click", () => {
    if (mascotState.didDrag) {
      mascotState.didDrag = false;
      return;
    }
    showMascotBubble("応援してる！");
  });
  els.closeCelebrationButton.addEventListener("click", closeCelebration);
  els.celebrationOverlay.addEventListener("click", (event) => {
    if (event.target === els.celebrationOverlay) closeCelebration();
  });
  els.prevCalendarButton.addEventListener("click", () => moveCalendarMonth(-1));
  els.nextCalendarButton.addEventListener("click", () => moveCalendarMonth(1));
  els.todayCalendarButton.addEventListener("click", resetCalendarMonth);
  els.companySearchInput.addEventListener("input", () => {
    state.searchQuery = els.companySearchInput.value.trim();
    renderCompanyList();
  });
  els.industryFilterInput.addEventListener("change", () => {
    state.industryFilter = els.industryFilterInput.value;
    renderCompanyList();
  });
  els.deadlineFilterInput.addEventListener("change", () => {
    state.deadlineFilter = els.deadlineFilterInput.value;
    renderCompanyList();
  });
  els.priorityFilterInput.addEventListener("change", () => {
    state.priorityFilter = els.priorityFilterInput.value;
    renderCompanyList();
  });
  els.clearFiltersButton.addEventListener("click", clearCompanyFilters);

  els.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      els.filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderCompanyList();
    });
  });

  document.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-id]");
    if (editButton) {
      handleEditEntry(editButton.dataset.editId);
      return;
    }

    const button = event.target.closest("[data-delete-id]");
    if (!button) return;
    handleDeleteEntry(button.dataset.deleteId);
  });
}

function ensureMascotDom() {
  if (!document.querySelector("#mascot")) {
    const mascot = document.createElement("button");
    mascot.className = "mascot";
    mascot.id = "mascot";
    mascot.type = "button";
    mascot.setAttribute("aria-label", "応援キャラクター");
    mascot.innerHTML = `
      <span class="mascot-fallback" aria-hidden="true">祝</span>
      <img src="${getMascotImageSrc()}" alt="" />
      <span class="mascot-bubble" id="mascotBubble">今日もいける！</span>
    `;
    document.body.append(mascot);
  }

  if (!document.querySelector("#celebrationOverlay")) {
    const overlay = document.createElement("div");
    overlay.className = "celebration-overlay";
    overlay.id = "celebrationOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="celebration-confetti" id="celebrationConfetti" aria-hidden="true"></div>
      <section class="celebration-card" role="dialog" aria-modal="true" aria-labelledby="celebrationTitle">
        <span class="celebration-character-fallback" aria-hidden="true">祝</span>
        <img class="celebration-character" src="${getMascotImageSrc()}" alt="" />
        <p class="eyebrow">Congratulations</p>
        <h2 id="celebrationTitle">おめでとう！</h2>
        <p id="celebrationMessage">ここまでの積み重ね、ちゃんと届いた。</p>
        <button class="primary-button" id="closeCelebrationButton" type="button">よし、次へ</button>
      </section>
    `;
    document.body.append(overlay);
  }
}

async function init() {
  initMascot();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }

  if (!hasCloudConfig) {
    state.entries = loadLocalEntries();
    state.loading = false;
    render();
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    setAuthMessage(error.message);
  }

  state.session = data?.session || null;
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (session) {
      await loadCloudEntries();
    } else {
      state.entries = [];
      state.loading = false;
      render();
    }
  });

  if (state.session) {
    await loadCloudEntries();
  } else {
    state.entries = [];
    state.loading = false;
    render();
  }
}

async function handleSignIn() {
  const credentials = getAuthCredentials();
  if (!credentials) return;

  setAuthBusy(true);
  highlightSignInButton(false);
  setAuthMessage("ログイン中です...");
  const { error } = await supabaseClient.auth.signInWithPassword(credentials);
  setAuthBusy(false);

  if (error) {
    setAuthMessage(error.message);
    return;
  }

  setAuthMessage("");
  showToast("ログインしました。");
}

async function handleSignUp() {
  const credentials = getAuthCredentials();
  if (!credentials) return;

  setAuthBusy(true);
  highlightSignInButton(false);
  setAuthMessage("登録中です...");
  const { data, error } = await supabaseClient.auth.signUp(credentials);
  setAuthBusy(false);

  if (error) {
    setAuthMessage(error.message);
    return;
  }

  if (data.session) {
    setAuthMessage("");
    showToast("登録しました。");
    return;
  }

  highlightSignInButton(true);
  setAuthMessage("確認メールを送りました。メールのリンクを押したあと、この画面で「確認後にログイン」を押してください。");
}

async function handleSignOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showToast(error.message);
    return;
  }
  highlightSignInButton(false);
  showToast("ログアウトしました。");
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  const formData = new FormData(els.entryForm);
  const existingEntry = state.editingId
    ? state.entries.find((entry) => entry.id === state.editingId)
    : null;
  const entry = {
    id: existingEntry?.id || createId(),
    companyName: String(formData.get("companyName")).trim(),
    industry: String(formData.get("industry")).trim(),
    trackType: String(formData.get("trackType")),
    status: String(formData.get("status")),
    deadline: String(formData.get("deadline")),
    eventDate: String(formData.get("eventDate")),
    eventType: String(formData.get("eventType")),
    priority: String(formData.get("priority")),
    mypageId: String(formData.get("mypageId")).trim(),
    officialUrl: String(formData.get("officialUrl")).trim(),
    logoUrl: String(formData.get("logoUrl")).trim(),
    mypageUrl: String(formData.get("mypageUrl")).trim(),
    esContent: String(formData.get("esContent")).trim(),
    interviewNotes: String(formData.get("interviewNotes")).trim(),
    memo: String(formData.get("memo")).trim(),
    createdAt: existingEntry?.createdAt || new Date().toISOString()
  };

  if (!entry.companyName) {
    showToast("企業名を入力してください。");
    return;
  }

  const celebration = getEntryCelebration(entry, existingEntry);

  if (state.mode === "cloud") {
    if (!state.session) {
      showToast("ログインすると保存できます。");
      return;
    }

    const saved = existingEntry ? await updateCloudEntry(entry) : await createCloudEntry(entry);
    if (!saved) return;
    if (existingEntry) {
      state.entries = state.entries.map((item) => (item.id === saved.id ? saved : item));
    } else {
      state.entries.unshift(saved);
    }
  } else {
    if (existingEntry) {
      state.entries = state.entries.map((item) => (item.id === entry.id ? entry : item));
    } else {
      state.entries.unshift(entry);
    }
    saveLocalEntries(state.entries);
  }

  resetEntryForm();
  els.entryDialog.close();
  render();
  if (celebration) {
    showCelebration(entry, celebration);
  } else {
    showToast(existingEntry ? "更新しました。" : "保存しました。");
  }
}

function handleEditEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    showToast("編集するデータが見つかりません。");
    return;
  }

  openEntryDialog(entry);
}

async function handleDeleteEntry(id) {
  const shouldDelete = window.confirm("このデータを削除しますか？");
  if (!shouldDelete) return;

  if (state.mode === "cloud") {
    const { error } = await supabaseClient.from("entries").delete().eq("id", id);
    if (error) {
      showToast(error.message);
      return;
    }
  }

  state.entries = state.entries.filter((entry) => entry.id !== id);
  if (state.mode === "local") saveLocalEntries(state.entries);
  if (state.editingId === id) {
    resetEntryForm();
    els.entryDialog.close();
  }
  render();
}

async function handleClearEntries() {
  const shouldClear = window.confirm("登録したデータをすべて削除しますか？");
  if (!shouldClear) return;

  if (state.mode === "cloud") {
    const ids = state.entries.map((entry) => entry.id);
    if (ids.length > 0) {
      const { error } = await supabaseClient.from("entries").delete().in("id", ids);
      if (error) {
        showToast(error.message);
        return;
      }
    }
  }

  state.entries = [];
  if (state.mode === "local") saveLocalEntries(state.entries);
  render();
  resetEntryForm();
  els.entryDialog.close();
  showToast("削除しました。");
}

async function handleImportLocalEntries() {
  const localEntries = readSavedLocalEntries();
  if (localEntries.length === 0 || !state.session) return;

  const shouldImport = window.confirm("この端末に残っているデータをクラウドへ移しますか？");
  if (!shouldImport) return;

  const payload = localEntries.map((entry) => toDbEntry(entry));
  const { error } = await supabaseClient.from("entries").upsert(payload, { onConflict: "id" });
  if (error) {
    showToast(error.message);
    return;
  }

  localStorage.removeItem(storageKey);
  await loadCloudEntries();
  showToast("端末データをクラウドへ移しました。");
}

async function loadCloudEntries() {
  if (!state.session) return;

  state.loading = true;
  renderMode();
  const { data, error } = await supabaseClient.from("entries").select("*").order("created_at", { ascending: false });
  state.loading = false;

  if (error) {
    showToast(error.message);
    render();
    return;
  }

  state.entries = data.map(fromDbEntry);
  render();
}

async function createCloudEntry(entry) {
  const { data, error } = await supabaseClient.from("entries").insert(toDbEntry(entry)).select("*").single();
  if (error) {
    showToast(error.message);
    return null;
  }
  return fromDbEntry(data);
}

async function updateCloudEntry(entry) {
  const { id, user_id, created_at, ...changes } = toDbEntry(entry);
  const { data, error } = await supabaseClient.from("entries").update(changes).eq("id", id).select("*").single();
  if (error) {
    showToast(error.message);
    return null;
  }
  return fromDbEntry(data);
}

function render() {
  renderMode();
  renderDailyQuote();
  renderSummary();
  renderDeadlineList();
  renderEventList();
  renderFilterOptions();
  renderCompanyList();
  renderCalendar();
}

function renderDailyQuote() {
  const today = new Date();
  const quote = getQuoteForDate(today);
  const noteMarkup = quote.note ? `<span class="quote-note">（${escapeHtml(quote.note)}）</span>` : "";
  els.dailyQuote.innerHTML = `
    <div>
      <p class="eyebrow">Today's Quote</p>
      <h2>今日の偉人の格言</h2>
    </div>
    <figure>
      <blockquote>「${escapeHtml(quote.message)}」</blockquote>
      <figcaption><span>${formatQuoteDate(today)}</span> ・ <cite>${escapeHtml(quote.author)}</cite>${noteMarkup}</figcaption>
    </figure>
  `;
}

function renderMode() {
  const waitingForLogin = state.mode === "cloud" && !state.session;
  els.authPanel.hidden = !waitingForLogin;
  els.accountPanel.hidden = state.mode !== "cloud" || !state.session;
  els.localPanel.hidden = state.mode !== "local";
  els.appContent.hidden = waitingForLogin;
  els.openFormButton.disabled = waitingForLogin || state.loading;
  els.signOutButton.hidden = state.mode !== "cloud" || !state.session;
  els.importLocalButton.hidden = state.mode !== "cloud" || !state.session || readSavedLocalEntries().length === 0;

  if (state.mode === "local") {
    els.syncStatus.textContent = "端末保存";
    els.syncStatus.className = "sync-pill local";
  } else if (state.session) {
    els.syncStatus.textContent = state.loading ? "同期中" : "クラウド同期";
    els.syncStatus.className = "sync-pill cloud";
    els.userEmailLabel.textContent = state.session.user.email || "ログイン中";
  } else {
    els.syncStatus.textContent = "ログイン待ち";
    els.syncStatus.className = "sync-pill";
  }
}

function renderSummary() {
  els.deadlineCount.textContent = getUpcomingDeadlines().length;
  els.eventCount.textContent = getUpcomingEvents().length;
  els.activeCount.textContent = state.entries.filter(isActive).length;
}

function renderDeadlineList() {
  const deadlines = getUpcomingDeadlines();
  if (deadlines.length === 0) {
    els.deadlineList.innerHTML = emptyState("近い締切はありません");
    return;
  }

  els.deadlineList.innerHTML = deadlines
    .map((entry) => {
      return `
        <article class="list-item">
          <div class="list-title-row">
            <strong>${escapeHtml(entry.companyName)}</strong>
            ${statusTag(entry.status)}
          </div>
          <div class="meta-row">
            <span>${escapeHtml(entry.trackType)}</span>
            <span>${formatDate(entry.deadline)} 締切</span>
            <span>志望度 ${escapeHtml(entry.priority)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderEventList() {
  const events = getUpcomingEvents();
  if (events.length === 0) {
    els.eventList.innerHTML = emptyState("近い予定はありません");
    return;
  }

  els.eventList.innerHTML = events
    .map((entry) => {
      return `
        <article class="list-item">
          <div class="list-title-row">
            <strong>${escapeHtml(entry.companyName)}</strong>
            <span class="tag green">${escapeHtml(entry.eventType)}</span>
          </div>
          <div class="meta-row">
            <span>${formatDate(entry.eventDate)}</span>
            <span>${escapeHtml(entry.trackType)}</span>
            <span>${escapeHtml(entry.status)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderCompanyList() {
  const entries = state.entries
    .filter(matchesListFilter)
    .filter(matchesSearchQuery)
    .filter(matchesIndustryFilter)
    .filter(matchesDeadlineFilter)
    .filter(matchesPriorityFilter)
    .sort(sortCompanyEntries);

  if (entries.length === 0) {
    els.companyList.innerHTML = emptyState("条件に合う企業がありません。内定・落選の企業も「全部」または「結果済み」に残ります。");
    return;
  }

  els.companyList.innerHTML = entries
    .map((entry) => {
      return `
        <article class="company-card">
          <div class="company-title-row">
            <div class="company-identity">
              ${companyIconMarkup(entry)}
              <div>
                <strong>${escapeHtml(entry.companyName)}</strong>
                <div class="meta-row">
                  ${entry.industry ? `<span>${escapeHtml(entry.industry)}</span>` : ""}
                  <span>${escapeHtml(entry.trackType)}</span>
                  <span>${escapeHtml(entry.eventType)}</span>
                  <span>志望度 ${escapeHtml(entry.priority)}</span>
                </div>
              </div>
            </div>
            <div class="card-actions">
              <button class="edit-button" data-edit-id="${entry.id}" type="button">編集</button>
              <button class="delete-button" data-delete-id="${entry.id}" type="button">削除</button>
            </div>
          </div>
          <div class="meta-row">
            ${statusTag(entry.status)}
            ${entry.deadline ? `<span>${formatDate(entry.deadline)} 締切</span>` : ""}
            ${entry.eventDate ? `<span>${formatDate(entry.eventDate)} 予定</span>` : ""}
          </div>
          ${entry.mypageId ? `<div class="credential-line"><strong>マイページID</strong><span>${escapeHtml(entry.mypageId)}</span></div>` : ""}
          ${entry.officialUrl ? `<a class="mypage-link" href="${escapeAttribute(entry.officialUrl)}" target="_blank" rel="noopener noreferrer">企業公式サイトを開く</a>` : ""}
          ${entry.mypageUrl ? `<a class="mypage-link" href="${escapeAttribute(entry.mypageUrl)}" target="_blank" rel="noopener noreferrer">企業マイページを開く</a>` : ""}
          ${entry.esContent ? noteBlock("ES", entry.esContent) : ""}
          ${entry.interviewNotes ? noteBlock("面接対策", entry.interviewNotes) : ""}
          ${entry.memo ? `<p class="memo">${escapeHtml(entry.memo)}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderCalendar() {
  const year = state.calendarYear;
  const month = state.calendarMonth;
  const todayKey = toDateInputValue(new Date());
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const firstDay = monthStart.getDay();
  const daysInMonth = monthEnd.getDate();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  els.calendarMonthLabel.textContent = `${year}年${month + 1}月`;
  const cells = weekdays.map((day) => `<div class="calendar-weekday">${day}</div>`);

  for (let blank = 0; blank < firstDay; blank += 1) {
    cells.push('<div class="calendar-cell"></div>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = toDateInputValue(new Date(year, month, day));
    const cellClass = dateKey === todayKey ? "calendar-cell today" : "calendar-cell";
    const dots = calendarItemsFor(dateKey)
      .slice(0, 3)
      .map((item) => `<span class="calendar-dot ${item.kind}">${escapeHtml(item.label)}</span>`)
      .join("");

    cells.push(`
      <div class="${cellClass}">
        <span class="calendar-date">${day}</span>
        ${dots}
      </div>
    `);
  }

  els.calendarGrid.innerHTML = cells.join("");
}

function moveCalendarMonth(delta) {
  const nextMonth = new Date(state.calendarYear, state.calendarMonth + delta, 1);
  state.calendarYear = nextMonth.getFullYear();
  state.calendarMonth = nextMonth.getMonth();
  renderCalendar();
}

function resetCalendarMonth() {
  const today = new Date();
  state.calendarYear = today.getFullYear();
  state.calendarMonth = today.getMonth();
  renderCalendar();
}

function openEntryDialog(entry = null) {
  state.editingId = entry?.id || null;
  els.entryFormTitle.textContent = entry ? "企業・選考を編集" : "企業・選考を追加";
  els.saveEntryButton.textContent = entry ? "更新" : "保存";
  fillEntryForm(entry);

  if (typeof els.entryDialog.showModal === "function") {
    els.entryDialog.showModal();
  } else {
    els.entryDialog.setAttribute("open", "");
  }
}

function fillEntryForm(entry) {
  const values = normalizeEntry(entry || {});
  setFormValue("companyName", entry ? values.companyName : "");
  setFormValue("industry", entry ? values.industry : "");
  setFormValue("mypageId", entry ? values.mypageId : "");
  setFormValue("officialUrl", entry ? values.officialUrl : "");
  setFormValue("logoUrl", entry ? values.logoUrl : "");
  setFormValue("mypageUrl", entry ? values.mypageUrl : "");
  setFormValue("trackType", values.trackType);
  setFormValue("status", values.status);
  setFormValue("deadline", entry ? values.deadline : "");
  setFormValue("eventDate", entry ? values.eventDate : "");
  setFormValue("eventType", values.eventType);
  setFormValue("priority", values.priority);
  setFormValue("esContent", entry ? values.esContent : "");
  setFormValue("interviewNotes", entry ? values.interviewNotes : "");
  setFormValue("memo", entry ? values.memo : "");
}

function setFormValue(name, value) {
  const field = els.entryForm.elements.namedItem(name);
  if (field) field.value = value;
}

function resetEntryForm() {
  state.editingId = null;
  els.entryForm.reset();
  els.entryFormTitle.textContent = "企業・選考を追加";
  els.saveEntryButton.textContent = "保存";
}

function renderFilterOptions() {
  const selected = state.industryFilter;
  const industries = Array.from(
    new Set([...commonIndustries, ...state.entries.map((entry) => entry.industry).filter(Boolean)])
  ).sort((a, b) => a.localeCompare(b, "ja"));

  els.industryFilterInput.innerHTML = [
    '<option value="all">すべて</option>',
    ...industries.map((industry) => `<option value="${escapeAttribute(industry)}">${escapeHtml(industry)}</option>`)
  ].join("");

  if (selected !== "all" && industries.includes(selected)) {
    els.industryFilterInput.value = selected;
  } else {
    state.industryFilter = "all";
    els.industryFilterInput.value = "all";
  }
}

function clearCompanyFilters() {
  state.searchQuery = "";
  state.industryFilter = "all";
  state.deadlineFilter = "all";
  state.priorityFilter = "all";
  els.companySearchInput.value = "";
  els.industryFilterInput.value = "all";
  els.deadlineFilterInput.value = "all";
  els.priorityFilterInput.value = "all";
  renderCompanyList();
}

function loadLocalEntries() {
  const savedEntries = readSavedLocalEntries();
  return savedEntries;
}

function readSavedLocalEntries() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed)
      ? parsed.map(normalizeEntry).filter((entry) => !sampleCompanyNames.includes(entry.companyName))
      : [];
  } catch {
    return [];
  }
}

function saveLocalEntries(entries) {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

function toDbEntry(entry) {
  return {
    id: entry.id,
    user_id: state.session.user.id,
    company_name: entry.companyName,
    industry: entry.industry,
    mypage_id: entry.mypageId,
    official_url: entry.officialUrl,
    logo_url: entry.logoUrl,
    track_type: entry.trackType,
    status: entry.status,
    deadline: entry.deadline || null,
    event_date: entry.eventDate || null,
    event_type: entry.eventType,
    priority: entry.priority,
    mypage_url: entry.mypageUrl,
    es_content: entry.esContent,
    interview_notes: entry.interviewNotes,
    memo: entry.memo,
    created_at: entry.createdAt || new Date().toISOString()
  };
}

function fromDbEntry(row) {
  return normalizeEntry({
    id: row.id,
    companyName: row.company_name,
    industry: row.industry || "",
    mypageId: row.mypage_id || "",
    officialUrl: row.official_url || "",
    logoUrl: row.logo_url || "",
    trackType: row.track_type,
    status: row.status,
    deadline: row.deadline || "",
    eventDate: row.event_date || "",
    eventType: row.event_type,
    priority: row.priority,
    mypageUrl: row.mypage_url || "",
    esContent: row.es_content || "",
    interviewNotes: row.interview_notes || "",
    memo: row.memo || "",
    createdAt: row.created_at
  });
}

function normalizeEntry(entry) {
  return {
    id: entry.id || createId(),
    companyName: entry.companyName || "",
    industry: entry.industry || "",
    mypageId: entry.mypageId || "",
    officialUrl: entry.officialUrl || "",
    logoUrl: entry.logoUrl || "",
    trackType: entry.trackType || "本選考",
    status: entry.status || "気になる",
    deadline: entry.deadline || "",
    eventDate: entry.eventDate || "",
    eventType: entry.eventType || "面接",
    priority: entry.priority || "未定",
    mypageUrl: entry.mypageUrl || "",
    esContent: entry.esContent || "",
    interviewNotes: entry.interviewNotes || "",
    memo: entry.memo || "",
    createdAt: entry.createdAt || new Date().toISOString()
  };
}

function getAuthCredentials() {
  const email = els.authEmailInput.value.trim();
  const password = els.authPasswordInput.value;

  if (!email || !password) {
    setAuthMessage("メールアドレスとパスワードを入力してください。");
    return null;
  }

  if (password.length < 6) {
    setAuthMessage("パスワードは6文字以上にしてください。");
    return null;
  }

  return { email, password };
}

function setAuthBusy(isBusy) {
  els.signInButton.disabled = isBusy;
  els.signUpButton.disabled = isBusy;
}

function setAuthMessage(message) {
  els.authMessage.textContent = message;
}

function highlightSignInButton(shouldHighlight) {
  els.signInButton.classList.toggle("needs-attention", shouldHighlight);
  els.signInButton.textContent = shouldHighlight ? "確認後にログイン" : "ログイン";
}

function initMascot() {
  bindMascotImageFallbacks();
  bindMascotDrag();
  setMascotImage("normal");
  if (!loadMascotPosition()) {
    placeMascotAtHome();
  }
  applyMascotPosition();

  window.addEventListener("resize", clampMascotPosition);

  if (!mascotState.reducedMotion) {
    mascotState.wanderTimer = window.setInterval(wanderMascotNearHome, 9000);
  }
}

function bindMascotDrag() {
  els.mascot.addEventListener("pointerdown", handleMascotPointerDown);
  els.mascot.addEventListener("pointermove", handleMascotPointerMove);
  els.mascot.addEventListener("pointerup", handleMascotPointerUp);
  els.mascot.addEventListener("pointercancel", handleMascotPointerUp);
}

function handleMascotPointerDown(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;

  const rect = els.mascot.getBoundingClientRect();
  mascotState.isDragging = true;
  mascotState.didDrag = false;
  mascotState.dragOffsetX = event.clientX - rect.left;
  mascotState.dragOffsetY = event.clientY - rect.top;
  mascotState.dragStartX = event.clientX;
  mascotState.dragStartY = event.clientY;
  els.mascot.classList.add("is-dragging");
  els.mascot.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function handleMascotPointerMove(event) {
  if (!mascotState.isDragging) return;

  const distance = Math.hypot(event.clientX - mascotState.dragStartX, event.clientY - mascotState.dragStartY);
  if (distance > 4) mascotState.didDrag = true;

  const bounds = getMascotBounds();
  const previousX = mascotState.x;
  mascotState.x = clampNumber(event.clientX - mascotState.dragOffsetX, bounds.minX, bounds.maxX);
  mascotState.y = clampNumber(event.clientY - mascotState.dragOffsetY, bounds.minY, bounds.maxY);
  mascotState.vx = mascotState.x < previousX ? -1 : 1;
  mascotState.hasCustomPosition = true;
  applyMascotPosition();
  event.preventDefault();
}

function handleMascotPointerUp(event) {
  if (!mascotState.isDragging) return;

  mascotState.isDragging = false;
  els.mascot.classList.remove("is-dragging");
  if (els.mascot.hasPointerCapture?.(event.pointerId)) {
    els.mascot.releasePointerCapture(event.pointerId);
  }
  if (mascotState.didDrag) saveMascotPosition();
}

function setMascotImage(mood = "normal") {
  const src = getMascotImageSrc(mood);
  document.querySelectorAll(".mascot img, .celebration-character").forEach((image) => {
    image.hidden = false;
    image.src = src;
    image.closest(".mascot, .celebration-card")?.classList.remove("image-missing");
  });
}

function getMascotImageSrc(mood = "normal") {
  const seasonImages = mascotImageVariants[getCurrentSeason()] || mascotImageVariants.summer;
  if (mood === "angry") return seasonImages.angry || defaultMascotImage;

  const candidates = seasonImages.normal || [defaultMascotImage];
  return candidates[Math.floor(Math.random() * candidates.length)] || defaultMascotImage;
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function bindMascotImageFallbacks() {
  document.querySelectorAll(".mascot img, .celebration-character").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      image.closest(".mascot, .celebration-card")?.classList.add("image-missing");
    });
  });
}

function placeMascotAtHome() {
  const bounds = getMascotBounds();
  mascotState.x = bounds.maxX - 4;
  mascotState.y = bounds.maxY - 4;
}

function wanderMascotNearHome() {
  if (mascotState.isDragging || mascotState.hasCustomPosition) return;

  const bounds = getMascotBounds();
  const previousX = mascotState.x;
  const xRange = Math.min(40, Math.max(0, bounds.maxX - bounds.minX));
  const yRange = Math.min(28, Math.max(0, bounds.maxY - bounds.minY));

  mascotState.x = bounds.maxX - Math.random() * xRange;
  mascotState.y = bounds.maxY - Math.random() * yRange;
  mascotState.vx = mascotState.x < previousX ? -1 : 1;
  applyMascotPosition();
}

function setMascotVelocity() {
  if (mascotState.hasCustomPosition) {
    clampMascotPosition();
    return;
  }

  const previousX = mascotState.x;
  const bounds = getMascotBounds();
  mascotState.x = bounds.maxX - Math.random() * Math.min(52, bounds.maxX - bounds.minX);
  mascotState.y = bounds.maxY - Math.random() * Math.min(36, bounds.maxY - bounds.minY);
  mascotState.vx = mascotState.x < previousX ? -1 : 1;
  applyMascotPosition();
}

function clampMascotPosition() {
  const bounds = getMascotBounds();
  mascotState.x = Math.min(Math.max(mascotState.x, bounds.minX), bounds.maxX);
  mascotState.y = Math.min(Math.max(mascotState.y, bounds.minY), bounds.maxY);
  applyMascotPosition();
  if (mascotState.hasCustomPosition) saveMascotPosition();
}

function getMascotBounds() {
  const size = getMascotSize();
  return {
    minX: 10,
    minY: 74,
    maxX: Math.max(10, window.innerWidth - size.width - 18),
    maxY: Math.max(74, window.innerHeight - size.height - 72)
  };
}

function getMascotSize() {
  const rect = els.mascot.getBoundingClientRect();
  return {
    width: rect.width || 112,
    height: rect.height || 132
  };
}

function applyMascotPosition() {
  els.mascot.style.transform = `translate3d(${mascotState.x}px, ${mascotState.y}px, 0)`;
  els.mascot.classList.toggle("facing-left", mascotState.vx < 0);
}

function loadMascotPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(mascotPositionKey) || "null");
    if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return false;

    const bounds = getMascotBounds();
    mascotState.x = clampNumber(saved.x, bounds.minX, bounds.maxX);
    mascotState.y = clampNumber(saved.y, bounds.minY, bounds.maxY);
    mascotState.hasCustomPosition = true;
    return true;
  } catch {
    return false;
  }
}

function saveMascotPosition() {
  try {
    localStorage.setItem(mascotPositionKey, JSON.stringify({ x: mascotState.x, y: mascotState.y }));
  } catch {
    // 保存できない環境でも、ドラッグ自体はその場で使えるようにする。
  }
}

function getEntryCelebration(entry, existingEntry) {
  if (!celebrationStatuses.includes(entry.status) && !rejectionStatuses.includes(entry.status)) return null;
  if (existingEntry && existingEntry.status === entry.status) return null;

  if (entry.status === "落選") {
    return {
      title: "なんて見る目のない企業なの！！",
      message: `${entry.companyName}はここで切り替え。もっと合う企業に、こっちから会いにいこう。`,
      bubble: "見る目ない！",
      mood: "angry",
      toast: `${entry.companyName}、見る目ない！`
    };
  }

  if (entry.status === "内定") {
    return {
      title: "内定おめでとう！！！",
      message: `${entry.companyName}、本当におめでとう。ここまで積み上げた準備と粘り、ちゃんと届いた。`,
      bubble: "内定だー！",
      mood: "normal"
    };
  }

  if (entry.status === "インターン選考通過") {
    return {
      title: ["インターン", "選考通過！"],
      message: `${entry.companyName}のインターン選考通過、おめでとう。次もこの勢いでいこう。`,
      bubble: "通過！",
      mood: "normal"
    };
  }

  if (entry.status === "インターン参加決定") {
    return {
      title: ["インターン", "参加決定！"],
      message: `${entry.companyName}のインターン参加決定、おめでとう。ここから一気にチャンスを広げよう。`,
      bubble: "参加決定！",
      mood: "normal"
    };
  }

  if (entry.trackType === "インターン") {
    return {
      title: ["インターン", "選考通過！"],
      message: `${entry.companyName}のインターン選考通過、おめでとう。次もこの勢いでいこう。`,
      bubble: "通過！",
      mood: "normal"
    };
  }

  return {
    title: "選考通過おめでとう！",
    message: `${entry.companyName}の選考通過、おめでとう。次のステージに進んだ。`,
    bubble: "通過した！",
    mood: "normal"
  };
}

function showCelebration(entry, celebration) {
  setMascotImage(celebration.mood || "normal");
  renderCelebrationTitle(celebration.title);
  els.celebrationMessage.textContent = celebration.message;
  createConfetti(celebration.mood);
  els.celebrationOverlay.classList.toggle("is-rejection", celebration.mood === "angry");
  els.celebrationOverlay.hidden = false;
  document.body.classList.add("is-celebrating");
  els.mascot.classList.add("is-celebrating");
  showMascotBubble(celebration.bubble);
  setMascotVelocity();

  window.clearTimeout(mascotState.celebrationTimer);
  mascotState.celebrationTimer = window.setTimeout(closeCelebration, 9000);
  showToast(celebration.toast || `${entry.companyName}、おめでとう！`);
}

function renderCelebrationTitle(title) {
  const lines = Array.isArray(title) ? title : [title];
  els.celebrationTitle.innerHTML = lines
    .map((line) => `<span class="celebration-title-line">${escapeHtml(line)}</span>`)
    .join("");
}

function closeCelebration() {
  els.celebrationOverlay.hidden = true;
  els.celebrationConfetti.textContent = "";
  els.celebrationOverlay.classList.remove("is-rejection");
  document.body.classList.remove("is-celebrating");
  els.mascot.classList.remove("is-celebrating");
  window.clearTimeout(mascotState.celebrationTimer);
  setMascotImage("normal");
}

function createConfetti(mood = "normal") {
  const colors = mood === "angry"
    ? ["#ef4444", "#f97316", "#facc15", "#7f1d1d", "#ffffff"]
    : ["#facc15", "#fb7185", "#60a5fa", "#34d399", "#f97316", "#a78bfa", "#ffffff"];
  const fragment = document.createDocumentFragment();
  els.celebrationConfetti.textContent = "";

  for (let index = 0; index < 110; index += 1) {
    const piece = document.createElement("span");
    piece.style.setProperty("--x", `${Math.random() * 100}vw`);
    piece.style.setProperty("--y", `${-12 - Math.random() * 32}vh`);
    piece.style.setProperty("--fall", `${72 + Math.random() * 40}vh`);
    piece.style.setProperty("--drift", `${-90 + Math.random() * 180}px`);
    piece.style.setProperty("--spin", `${180 + Math.random() * 720}deg`);
    piece.style.animationDelay = `${Math.random() * 0.9}s`;
    piece.style.animationDuration = `${2.6 + Math.random() * 1.8}s`;
    piece.style.background = colors[index % colors.length];
    if (index % 9 === 0) piece.className = "spark";
    fragment.append(piece);
  }

  els.celebrationConfetti.append(fragment);
}

function showMascotBubble(message) {
  els.mascotBubble.textContent = message;
  els.mascot.classList.add("show-bubble");
  window.clearTimeout(mascotState.bubbleTimer);
  mascotState.bubbleTimer = window.setTimeout(() => {
    els.mascot.classList.remove("show-bubble");
  }, 2600);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function getUpcomingDeadlines() {
  return state.entries
    .filter((entry) => entry.deadline && isWithinDays(entry.deadline, 14))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

function getUpcomingEvents() {
  return state.entries
    .filter((entry) => entry.eventDate && isWithinDays(entry.eventDate, 30))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

function matchesSearchQuery(entry) {
  if (!state.searchQuery) return true;
  const query = state.searchQuery.toLowerCase();
  const target = [
    entry.companyName,
    entry.industry,
    entry.trackType,
    entry.status,
    entry.priority,
    entry.mypageId,
    entry.officialUrl,
    entry.logoUrl,
    entry.mypageUrl,
    entry.esContent,
    entry.interviewNotes,
    entry.memo
  ]
    .join(" ")
    .toLowerCase();
  return target.includes(query);
}

function matchesIndustryFilter(entry) {
  return state.industryFilter === "all" || entry.industry === state.industryFilter;
}

function matchesDeadlineFilter(entry) {
  if (state.deadlineFilter === "all") return true;
  if (state.deadlineFilter === "none") return !entry.deadline;
  if (state.deadlineFilter === "hasDeadline") return Boolean(entry.deadline);
  if (!entry.deadline) return false;

  const today = startOfDay(new Date());
  const target = startOfDay(new Date(`${entry.deadline}T00:00:00`));
  const diff = (target - today) / 86400000;

  if (state.deadlineFilter === "within7") return diff >= 0 && diff <= 7;
  if (state.deadlineFilter === "within14") return diff >= 0 && diff <= 14;
  if (state.deadlineFilter === "overdue") return diff < 0;
  return true;
}

function matchesPriorityFilter(entry) {
  return state.priorityFilter === "all" || entry.priority === state.priorityFilter;
}

function matchesListFilter(entry) {
  if (state.filter === "all") return true;
  if (state.filter === "active") return isActive(entry);
  if (state.filter === "finished") return isFinished(entry);
  return entry.trackType === state.filter;
}

function calendarItemsFor(dateKey) {
  const items = [];
  state.entries.forEach((entry) => {
    if (entry.deadline === dateKey) {
      items.push({ kind: "deadline", label: `${entry.companyName} 締切` });
    }
    if (entry.eventDate === dateKey) {
      items.push({ kind: "event", label: `${entry.companyName} ${entry.eventType}` });
    }
  });
  return items;
}

function isActive(entry) {
  return activeStatuses.includes(entry.status) || !finishedStatuses.includes(entry.status);
}

function isFinished(entry) {
  return finishedStatuses.includes(entry.status);
}

function isWithinDays(dateValue, days) {
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(`${dateValue}T00:00:00`));
  const diff = (target - today) / 86400000;
  return diff >= 0 && diff <= days;
}

function sortByClosestDate(a, b) {
  const aDate = a.eventDate || a.deadline || "9999-12-31";
  const bDate = b.eventDate || b.deadline || "9999-12-31";
  return aDate.localeCompare(bDate);
}

function sortCompanyEntries(a, b) {
  if (state.deadlineFilter !== "all") {
    const aDeadline = a.deadline || "9999-12-31";
    const bDeadline = b.deadline || "9999-12-31";
    return aDeadline.localeCompare(bDeadline);
  }
  return sortByClosestDate(a, b);
}

function buildDailyQuotes() {
  const quotes = {};
  let sequence = 0;

  quoteMonthDays.forEach((daysInMonth, monthIndex) => {
    const month = monthIndex + 1;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      quotes[key] = quoteEntries[sequence] || {
        message: "今日の一歩を、未来の自分に渡そう。",
        author: "KEN AOKI",
        note: ""
      };
      sequence += 1;
    }
  });

  quotes["01-10"] = {
    message: "就活は団体戦",
    author: "KEN AOKI",
    note: ""
  };

  return quotes;
}

function getQuoteForDate(date) {
  return dailyQuotes[toMonthDayKey(date)] || dailyQuotes["01-01"];
}

function toMonthDayKey(date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatQuoteDate(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function companyIconMarkup(entry) {
  const logoSources = companyLogoSources(entry);
  const logoImage = logoSources.length > 0
    ? `<img src="${escapeAttribute(logoSources[0])}" data-logo-index="0" data-logo-sources="${escapeAttribute(JSON.stringify(logoSources))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="useNextLogoSource(this)">`
    : "";

  return `
    <div class="company-icon" style="--company-color: ${companyColor(entry.companyName)}">
      ${logoImage}
      <span>${escapeHtml(companyIconText(entry.companyName))}</span>
    </div>
  `;
}

function useNextLogoSource(image) {
  let sources = [];
  try {
    sources = JSON.parse(image.dataset.logoSources || "[]");
  } catch {
    sources = [];
  }

  const nextIndex = Number(image.dataset.logoIndex || "0") + 1;
  if (nextIndex < sources.length) {
    image.dataset.logoIndex = String(nextIndex);
    image.src = sources[nextIndex];
    return;
  }

  image.remove();
}

function companyLogoSources(entry) {
  const sources = [];
  const manualLogo = normalizeExternalUrl(entry.logoUrl);
  const officialUrl = parseExternalUrl(entry.officialUrl);
  const mypageUrl = parseExternalUrl(entry.mypageUrl);

  if (manualLogo) sources.push(manualLogo);
  if (officialUrl) {
    addDomainLogoSources(sources, officialUrl.hostname);
  }

  if (mypageUrl) {
    recruitingLogoDomains(mypageUrl.hostname).forEach((domain) => addDomainLogoSources(sources, domain));
  }

  if (officialUrl) {
    addOriginIconSources(sources, officialUrl.origin);
  }

  if (mypageUrl) {
    addDomainLogoSources(sources, mypageUrl.hostname);
    addOriginIconSources(sources, mypageUrl.origin);
  }

  return Array.from(new Set(sources));
}

function addDomainLogoSources(sources, hostname) {
  const domain = normalizeHostname(hostname);
  if (!domain) return;

  sources.push(`https://logo.clearbit.com/${domain}`);
  sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
}

function addOriginIconSources(sources, origin) {
  if (!origin) return;
  sources.push(`${origin}/apple-touch-icon.png`);
  sources.push(`${origin}/favicon.svg`);
  sources.push(`${origin}/favicon.ico`);
}

function recruitingLogoDomains(hostname) {
  const domain = normalizeHostname(hostname);
  if (!domain) return [];

  if (domain.endsWith(".snar.jp")) {
    const slug = domain.split(".")[0];
    if (!slug || slug === "www") return [];
    return [`${slug}.com`, `${slug}.co.jp`, `${slug}.jp`];
  }

  return [];
}

function normalizeExternalUrl(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  try {
    const url = new URL(rawValue);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function parseExternalUrl(value) {
  const normalized = normalizeExternalUrl(value);
  return normalized ? new URL(normalized) : null;
}

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function companyIconText(companyName) {
  const cleaned = String(companyName)
    .replace(/^株式会社/, "")
    .replace(/^有限会社/, "")
    .replace(/^合同会社/, "")
    .replace(/^Inc\.?\s*/i, "")
    .replace(/^Co\.?\s*/i, "")
    .trim();
  const source = cleaned || companyName || "?";
  return Array.from(source).slice(0, 2).join("").toUpperCase();
}

function companyColor(companyName) {
  const text = String(companyName || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 360;
  }
  return `hsl(${hash}, 72%, 42%)`;
}

function statusTag(status) {
  const className = ["落選", "辞退"].includes(status)
    ? "red"
    : ["内定", "参加済み", "選考通過", "インターン選考通過", "インターン参加決定"].includes(status)
      ? "green"
      : ["結果待ち", "Webテスト"].includes(status)
        ? "yellow"
        : "";

  const isMultiline = statusLabelParts(status).length > 1;
  return `<span class="tag ${className} ${isMultiline ? "multiline" : ""}">${statusLabelMarkup(status)}</span>`;
}

function statusLabelMarkup(status) {
  const parts = statusLabelParts(status);
  if (parts.length <= 1) return escapeHtml(status);

  return `<span class="status-label-multiline">${parts.map((part) => `<span>${escapeHtml(part)}</span>`).join("")}</span>`;
}

function statusLabelParts(status) {
  const partsByStatus = {
    "インターン選考通過": ["インターン", "選考通過"],
    "インターン参加決定": ["インターン", "参加決定"],
    "ES提出済み": ["ES", "提出済み"]
  };
  return partsByStatus[status] || [status];
}

function noteBlock(title, value) {
  const preview = value.length > 160 ? `${value.slice(0, 160)}...` : value;
  return `
    <div class="note-block">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(preview)}</p>
    </div>
  `;
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) =>
    (Number(character) ^ (Math.random() * 16) >> (Number(character) / 4)).toString(16)
  );
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
