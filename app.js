const storageKey = "shukatsu-tracker-entries";
const templateStorageKey = "shukatsu-tracker-templates";
const mascotPositionKey = "shukatsu-tracker-mascot-position";
const companyViewModeStorageKey = "shukatsu-tracker-company-view-mode";
const companyViewModes = ["normal", "medium", "compact"];
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
  templates: [],
  filter: "all",
  searchQuery: "",
  industryFilter: "all",
  deadlineFilter: "all",
  priorityFilter: "all",
  companyViewMode: companyViewModes.includes(localStorage.getItem(companyViewModeStorageKey))
    ? localStorage.getItem(companyViewModeStorageKey)
    : "normal",
  mode: hasCloudConfig ? "cloud" : "local",
  session: null,
  loading: true,
  cloudSortOrderAvailable: true,
  cloudTemplateSortOrderAvailable: true,
  editingId: null,
  detailEditingId: null,
  editingTemplateId: null,
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
  exportBackupButton: document.querySelector("#exportBackupButton"),
  importBackupButton: document.querySelector("#importBackupButton"),
  importBackupInput: document.querySelector("#importBackupInput"),
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
  companyDetailDialog: document.querySelector("#companyDetailDialog"),
  companyDetailForm: document.querySelector("#companyDetailForm"),
  closeDetailButton: document.querySelector("#closeDetailButton"),
  detailCompanyTitle: document.querySelector("#detailCompanyTitle"),
  detailCompanyMeta: document.querySelector("#detailCompanyMeta"),
  detailEsList: document.querySelector("#detailEsList"),
  addEsItemButton: document.querySelector("#addEsItemButton"),
  detailTemplateSelect: document.querySelector("#detailTemplateSelect"),
  insertTemplateButton: document.querySelector("#insertTemplateButton"),
  copyTemplateButton: document.querySelector("#copyTemplateButton"),
  detailEsSearchInput: document.querySelector("#detailEsSearchInput"),
  detailInterviewNotesInput: document.querySelector("#detailInterviewNotesInput"),
  detailMemoInput: document.querySelector("#detailMemoInput"),
  openBasicEditButton: document.querySelector("#openBasicEditButton"),
  templateForm: document.querySelector("#templateForm"),
  templateKindInput: document.querySelector("#templateKindInput"),
  templateTitleInput: document.querySelector("#templateTitleInput"),
  templateBodyInput: document.querySelector("#templateBodyInput"),
  templateBodyCount: document.querySelector("#templateBodyCount"),
  resetTemplateButton: document.querySelector("#resetTemplateButton"),
  saveTemplateButton: document.querySelector("#saveTemplateButton"),
  templateList: document.querySelector("#templateList"),
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
  viewModeButtons: document.querySelectorAll(".view-button"),
  mascot: document.querySelector("#mascot"),
  mascotBubble: document.querySelector("#mascotBubble"),
  celebrationOverlay: document.querySelector("#celebrationOverlay"),
  celebrationConfetti: document.querySelector("#celebrationConfetti"),
  celebrationEyebrow: document.querySelector("#celebrationEyebrow"),
  celebrationTitle: document.querySelector("#celebrationTitle"),
  celebrationMessage: document.querySelector("#celebrationMessage"),
  closeCelebrationButton: document.querySelector("#closeCelebrationButton"),
  mascotHelpPanel: document.querySelector("#mascotHelpPanel"),
  closeMascotHelpButton: document.querySelector("#closeMascotHelpButton"),
  mascotHelpForm: document.querySelector("#mascotHelpForm"),
  mascotHelpInput: document.querySelector("#mascotHelpInput"),
  mascotHelpLog: document.querySelector("#mascotHelpLog"),
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

const esDragState = {
  card: null,
  placeholder: null,
  pointerId: null,
  startX: 0,
  startY: 0,
  dragOffsetX: 0,
  dragOffsetY: 0,
  longPressTimer: null,
  isDragging: false
};

const companyDragState = {
  card: null,
  placeholder: null,
  pointerId: null,
  startX: 0,
  startY: 0,
  dragOffsetX: 0,
  dragOffsetY: 0,
  longPressTimer: null,
  isDragging: false,
  suppressClick: false
};

const templateDragState = {
  card: null,
  placeholder: null,
  pointerId: null,
  startX: 0,
  startY: 0,
  dragOffsetX: 0,
  dragOffsetY: 0,
  longPressTimer: null,
  isDragging: false
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
  els.refreshButton.addEventListener("click", loadCloudData);
  els.importLocalButton.addEventListener("click", handleImportLocalEntries);
  els.exportBackupButton.addEventListener("click", handleExportBackup);
  els.importBackupButton.addEventListener("click", () => els.importBackupInput.click());
  els.importBackupInput.addEventListener("change", handleImportBackup);
  els.mascot.addEventListener("click", () => {
    if (mascotState.didDrag) {
      mascotState.didDrag = false;
      return;
    }
    openMascotHelp();
  });
  els.closeMascotHelpButton.addEventListener("click", closeMascotHelp);
  els.mascotHelpForm.addEventListener("submit", handleMascotHelpSubmit);
  els.closeCelebrationButton.addEventListener("click", closeCelebration);
  els.celebrationOverlay.addEventListener("click", (event) => {
    if (event.target === els.celebrationOverlay) closeCelebration();
  });
  els.closeDetailButton.addEventListener("click", closeCompanyDetail);
  els.companyDetailForm.addEventListener("submit", handleDetailSubmit);
  els.addEsItemButton.addEventListener("click", () => addDetailEsItem());
  els.insertTemplateButton.addEventListener("click", insertSelectedTemplateIntoDetail);
  els.copyTemplateButton.addEventListener("click", copySelectedTemplate);
  els.openBasicEditButton.addEventListener("click", handleOpenBasicEditFromDetail);
  els.detailEsList.addEventListener("input", handleDetailEsInput);
  els.detailEsList.addEventListener("click", (event) => {
    const variantTab = event.target.closest("[data-es-variant-tab]");
    if (variantTab) {
      selectEsVariant(variantTab.closest(".es-editor-card"), variantTab.dataset.esVariantTab);
      return;
    }

    const addVariantButton = event.target.closest("[data-es-add-variant]");
    if (addVariantButton) {
      addEsVariant(addVariantButton.closest(".es-editor-card"));
      return;
    }

    const deleteVariantButton = event.target.closest("[data-es-delete-variant]");
    if (deleteVariantButton) {
      deleteEsVariant(deleteVariantButton.closest(".es-editor-card"));
      return;
    }

    const insertCardTemplateButton = event.target.closest("[data-es-insert-template]");
    if (insertCardTemplateButton) {
      insertTemplateIntoEsVariant(insertCardTemplateButton.closest("[data-es-variant-id]"));
      return;
    }

    const copyCardTemplateButton = event.target.closest("[data-es-copy-template]");
    if (copyCardTemplateButton) {
      copyTemplateFromEsVariant(copyCardTemplateButton.closest("[data-es-variant-id]"));
      return;
    }

    const toggleButton = event.target.closest("[data-es-toggle]");
    if (toggleButton) {
      toggleEsCard(toggleButton.closest(".es-editor-card"));
      return;
    }

    const deleteButton = event.target.closest("[data-es-delete]");
    if (!deleteButton) return;
    const card = deleteButton.closest(".es-editor-card");
    card?.remove();
    ensureDetailHasEsItem();
    updateDetailEsCharCounts();
  });
  els.detailEsList.addEventListener("pointerdown", handleEsReorderPointerDown);
  els.detailEsList.addEventListener("pointermove", handleEsReorderPointerMove);
  els.detailEsList.addEventListener("pointerup", finishEsReorder);
  els.detailEsList.addEventListener("pointercancel", cancelEsReorder);
  els.detailEsSearchInput.addEventListener("input", filterDetailEsCards);
  els.companyList.addEventListener("pointerdown", handleCompanyReorderPointerDown);
  els.companyList.addEventListener("pointermove", handleCompanyReorderPointerMove);
  els.companyList.addEventListener("pointerup", finishCompanyReorder);
  els.companyList.addEventListener("pointercancel", cancelCompanyReorder);
  els.templateForm.addEventListener("submit", handleTemplateSubmit);
  els.templateBodyInput.addEventListener("input", updateTemplateBodyCount);
  els.resetTemplateButton.addEventListener("click", resetTemplateForm);
  els.templateList.addEventListener("pointerdown", handleTemplateReorderPointerDown);
  els.templateList.addEventListener("pointermove", handleTemplateReorderPointerMove);
  els.templateList.addEventListener("pointerup", finishTemplateReorder);
  els.templateList.addEventListener("pointercancel", cancelTemplateReorder);
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

  els.viewModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCompanyViewMode(button.dataset.viewMode);
    });
  });

  document.addEventListener("click", (event) => {
    if (companyDragState.suppressClick) {
      companyDragState.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const detailButton = event.target.closest("[data-detail-id]");
    if (detailButton) {
      openCompanyDetail(detailButton.dataset.detailId);
      return;
    }

    const templateToggleButton = event.target.closest("[data-template-toggle]");
    if (templateToggleButton) {
      toggleTemplateCard(templateToggleButton.closest("[data-template-card]"));
      return;
    }

    const templateEditButton = event.target.closest("[data-template-edit-id]");
    if (templateEditButton) {
      handleEditTemplate(templateEditButton.dataset.templateEditId);
      return;
    }

    const templateCopyButton = event.target.closest("[data-template-copy-id]");
    if (templateCopyButton) {
      copyTemplateById(templateCopyButton.dataset.templateCopyId);
      return;
    }

    const templateDeleteButton = event.target.closest("[data-template-delete-id]");
    if (templateDeleteButton) {
      handleDeleteTemplate(templateDeleteButton.dataset.templateDeleteId);
      return;
    }

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
        <p class="eyebrow" id="celebrationEyebrow">Congratulations</p>
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
    state.templates = loadLocalTemplates();
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
      await loadCloudData();
    } else {
      state.entries = [];
      state.templates = [];
      state.loading = false;
      render();
    }
  });

  if (state.session) {
    await loadCloudData();
  } else {
    state.entries = [];
    state.templates = [];
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
  const esContent = String(formData.get("esContent")).trim();
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
    esContent,
    esItems: existingEntry?.esItems?.length ? existingEntry.esItems : normalizeEsItems([], esContent),
    interviewNotes: String(formData.get("interviewNotes")).trim(),
    memo: String(formData.get("memo")).trim(),
    createdAt: existingEntry?.createdAt || new Date().toISOString(),
    sortOrder: Number.isFinite(existingEntry?.sortOrder) ? existingEntry.sortOrder : nextCompanySortOrder()
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

function openCompanyDetail(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    showToast("詳細を開くデータが見つかりません。");
    return;
  }

  const values = normalizeEntry(entry);
  state.detailEditingId = values.id;
  els.detailCompanyTitle.textContent = values.companyName || "企業詳細";
  els.detailCompanyMeta.textContent = [
    values.industry,
    values.trackType,
    values.status,
    values.priority ? `志望度 ${values.priority}` : ""
  ].filter(Boolean).join(" ・ ");
  els.detailInterviewNotesInput.value = values.interviewNotes;
  els.detailMemoInput.value = values.memo;
  els.detailEsSearchInput.value = "";
  renderDetailEsItems(values.esItems.length > 0 ? values.esItems : [createEsItem()]);
  renderTemplateOptions();

  if (typeof els.companyDetailDialog.showModal === "function") {
    els.companyDetailDialog.showModal();
  } else {
    els.companyDetailDialog.setAttribute("open", "");
  }
}

function closeCompanyDetail() {
  state.detailEditingId = null;
  els.companyDetailForm.reset();
  els.detailEsSearchInput.value = "";
  els.detailEsList.textContent = "";
  els.companyDetailDialog.close();
}

function renderDetailEsItems(items) {
  els.detailEsList.innerHTML = items.map(esEditorCard).join("");
  updateDetailEsCharCounts();
  filterDetailEsCards();
}

function esEditorCard(item) {
  const value = normalizeEsItem(item);
  const title = esItemTitle(value);
  const activeVariant = getActiveEsVariant(value);
  const activeVariantId = activeVariant?.id || value.variants[0]?.id || "";
  const templateOptions = templateOptionsMarkup();
  const tabs = value.variants
    .map((variant) => {
      const active = variant.id === activeVariantId;
      return `
        <button class="es-variant-tab ${active ? "active" : ""}" data-es-variant-tab="${escapeAttribute(variant.id)}" type="button">
          ${escapeHtml(esVariantTitle(variant))}
        </button>
      `;
    })
    .join("");
  const panes = value.variants
    .map((variant) => {
      const active = variant.id === activeVariantId;
      return `
        <div class="es-variant-pane" data-es-variant-id="${escapeAttribute(variant.id)}" ${active ? "" : "hidden"}>
          <label>
            回答の見出し
            <input data-es-variant-label value="${escapeAttribute(variant.label)}" placeholder="例: 400字 / 600字 / 一次面接用" />
          </label>
          <div class="es-template-tools">
            <label>
              保存した型をこの回答に使う
              <select data-es-template-select ${state.templates.length === 0 ? "disabled" : ""}>
                ${templateOptions}
              </select>
            </label>
            <div class="es-template-actions">
              <button class="secondary-button small-button" data-es-insert-template type="button" ${state.templates.length === 0 ? "disabled" : ""}>この回答に入れる</button>
              <button class="secondary-button small-button" data-es-copy-template type="button" ${state.templates.length === 0 ? "disabled" : ""}>コピー</button>
            </div>
          </div>
          <label>
            回答
            <textarea class="es-answer-input" data-es-answer rows="9" placeholder="回答をここに書く">${escapeHtml(variant.answer)}</textarea>
            <span class="char-count" data-es-count>${formatCharCount(variant.answer)}</span>
          </label>
        </div>
      `;
    })
    .join("");

  return `
    <article class="es-editor-card" data-es-id="${escapeAttribute(value.id)}" data-active-variant-id="${escapeAttribute(activeVariantId)}">
      <div class="es-card-heading">
        <div class="es-card-title">
          <button class="es-drag-handle" data-es-drag-handle type="button" aria-label="長押ししてES質問を並べ替え">並べ替え</button>
          <button class="es-title-button" data-es-toggle type="button" aria-expanded="false">
            <strong data-es-title>${escapeHtml(title)}</strong>
            <span data-es-title-meta>${escapeHtml(esItemMeta(value))}</span>
          </button>
        </div>
        <button class="delete-button" data-es-delete type="button">削除</button>
      </div>
      <div class="es-card-body" data-es-body hidden>
        <label>
          質問
          <input class="es-question-input" data-es-question value="${escapeAttribute(value.question)}" placeholder="例: 学生時代に力を入れたことを教えてください。" />
        </label>
        <div class="es-variant-toolbar">
          <div class="es-variant-tabs" data-es-variant-tabs>${tabs}</div>
          <button class="secondary-button small-button" data-es-add-variant type="button">＋ 字数別回答</button>
        </div>
        <div class="es-variant-panes">${panes}</div>
        <button class="delete-button subtle-delete" data-es-delete-variant type="button">この回答だけ削除</button>
      </div>
    </article>
  `;
}

function addDetailEsItem(item = createEsItem()) {
  els.detailEsList.insertAdjacentHTML("beforeend", esEditorCard(item));
  updateDetailEsCharCounts();
  const lastCard = els.detailEsList.querySelector(".es-editor-card:last-child");
  setEsCardExpanded(lastCard, true);
  lastCard?.querySelector("[data-es-question]")?.focus();
}

function ensureDetailHasEsItem() {
  if (!els.detailEsList.querySelector(".es-editor-card")) {
    addDetailEsItem();
  }
}

function collectDetailEsItems() {
  return Array.from(els.detailEsList.querySelectorAll(".es-editor-card"))
    .map(collectEsItemFromCard)
    .filter((item) => item.question || item.variants.some((variant) => variant.label || variant.answer));
}

function collectEsItemFromCard(card) {
  const variants = Array.from(card.querySelectorAll("[data-es-variant-id]"))
    .map((pane) => ({
      id: pane.dataset.esVariantId || createId(),
      label: pane.querySelector("[data-es-variant-label]")?.value.trim() || "",
      answer: pane.querySelector("[data-es-answer]")?.value.trim() || ""
    }))
    .filter((variant) => variant.label || variant.answer);

  const normalized = normalizeEsItem({
    id: card.dataset.esId || createId(),
    question: card.querySelector("[data-es-question]")?.value.trim() || "",
    variants,
    activeVariantId: card.dataset.activeVariantId || variants[0]?.id || ""
  });
  return normalized;
}

function toggleEsCard(card) {
  if (!card) return;
  const body = card.querySelector("[data-es-body]");
  setEsCardExpanded(card, body?.hidden);
}

function setEsCardExpanded(card, expanded) {
  if (!card) return;
  const body = card.querySelector("[data-es-body]");
  const toggle = card.querySelector("[data-es-toggle]");
  if (!body || !toggle) return;
  body.hidden = !expanded;
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  card.classList.toggle("is-open", expanded);
}

function selectEsVariant(card, variantId) {
  if (!card || !variantId) return;
  card.dataset.activeVariantId = variantId;
  card.querySelectorAll("[data-es-variant-tab]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.esVariantTab === variantId);
  });
  card.querySelectorAll("[data-es-variant-id]").forEach((pane) => {
    pane.hidden = pane.dataset.esVariantId !== variantId;
  });
  updateEsCardSummary(card);
}

function addEsVariant(card) {
  if (!card) return;
  const item = collectEsItemFromCard(card);
  const variant = createEsVariant(`${item.variants.length + 1}案`, "");
  item.variants.push(variant);
  item.activeVariantId = variant.id;
  replaceEsCard(card, item, true);
  const replacement = els.detailEsList.querySelector(`[data-es-id="${cssEscape(item.id)}"]`);
  replacement?.querySelector(`[data-es-variant-id="${cssEscape(variant.id)}"] [data-es-variant-label]`)?.focus();
}

function deleteEsVariant(card) {
  if (!card) return;
  const item = collectEsItemFromCard(card);
  if (item.variants.length <= 1) {
    showToast("回答は最低1つ残します。");
    return;
  }

  item.variants = item.variants.filter((variant) => variant.id !== card.dataset.activeVariantId);
  item.activeVariantId = item.variants[0]?.id || "";
  replaceEsCard(card, item, true);
  showToast("この回答だけ削除しました。");
}

function replaceEsCard(card, item, expanded) {
  const html = esEditorCard(item);
  card.insertAdjacentHTML("afterend", html);
  const replacement = card.nextElementSibling;
  card.remove();
  setEsCardExpanded(replacement, expanded);
  updateDetailEsCharCounts();
  filterDetailEsCards();
}

function handleDetailEsInput(event) {
  const card = event.target.closest(".es-editor-card");
  updateDetailEsCharCounts();
  if (card) updateEsCardSummary(card);
  filterDetailEsCards();
}

function updateEsCardSummary(card) {
  if (!card) return;
  const item = collectEsItemFromCard(card);
  const title = card.querySelector("[data-es-title]");
  const meta = card.querySelector("[data-es-title-meta]");
  if (title) title.textContent = esItemTitle(item);
  if (meta) meta.textContent = esItemMeta(item);
  card.querySelectorAll("[data-es-variant-tab]").forEach((tab) => {
    const variant = item.variants.find((candidate) => candidate.id === tab.dataset.esVariantTab);
    if (variant) tab.textContent = esVariantTitle(variant);
  });
}

function filterDetailEsCards() {
  const query = normalizeSearchText(els.detailEsSearchInput.value);
  els.detailEsList.querySelectorAll(".es-editor-card").forEach((card) => {
    if (!query) {
      card.hidden = false;
      return;
    }
    const item = collectEsItemFromCard(card);
    const haystack = normalizeSearchText([
      item.question,
      ...item.variants.flatMap((variant) => [variant.label, variant.answer, `${countCharacters(variant.answer)}字`])
    ].join(" "));
    card.hidden = !haystack.includes(query);
  });
}

function handleEsReorderPointerDown(event) {
  const handle = event.target.closest("[data-es-drag-handle]");
  if (!handle) return;

  const card = handle.closest(".es-editor-card");
  if (!card) return;

  cancelEsReorder();
  esDragState.card = card;
  esDragState.pointerId = event.pointerId;
  esDragState.startX = event.clientX;
  esDragState.startY = event.clientY;
  esDragState.longPressTimer = window.setTimeout(startEsReorder, event.pointerType === "mouse" ? 160 : 320);
  card.classList.add("is-reorder-pending");
  capturePointer(els.detailEsList, event.pointerId);
  event.preventDefault();
}

function handleEsReorderPointerMove(event) {
  if (!esDragState.card || esDragState.pointerId !== event.pointerId) return;

  const moved = Math.hypot(event.clientX - esDragState.startX, event.clientY - esDragState.startY);
  if (!esDragState.isDragging && moved > 24) {
    cancelEsReorder(event);
    return;
  }

  if (!esDragState.isDragging) return;

  updateFloatingReorder(esDragState, event);
  const nextCard = findCardAfterPointer(els.detailEsList, ".es-editor-card:not(.is-reordering)", esDragState.card, event.clientX, event.clientY, "vertical");
  moveReorderCard(els.detailEsList, ".es-editor-card", esDragState.card, nextCard, esDragState.placeholder);
  event.preventDefault();
}

function moveReorderCard(container, selector, activeCard, nextCard, placeholder = null) {
  const movingNode = placeholder || activeCard;
  if (!activeCard || !movingNode || isSameInsertionPoint(container, selector, activeCard, movingNode, nextCard)) return false;

  if (nextCard) {
    container.insertBefore(movingNode, nextCard);
  } else {
    container.appendChild(movingNode);
  }
  return true;
}

function isSameInsertionPoint(container, selector, activeCard, movingNode, nextCard) {
  const cards = Array.from(container.children)
    .filter((card) => card === movingNode || (card.matches?.(selector) && card !== activeCard && !card.hidden));
  const currentIndex = cards.indexOf(movingNode);
  if (currentIndex === -1) return false;

  let targetIndex = nextCard ? cards.indexOf(nextCard) : cards.length;
  if (targetIndex === -1) return false;
  if (targetIndex > currentIndex) targetIndex -= 1;
  return targetIndex === currentIndex;
}

function startEsReorder() {
  if (!esDragState.card) return;

  esDragState.isDragging = true;
  esDragState.card.classList.remove("is-reorder-pending");
  esDragState.card.classList.add("is-reordering");
  els.detailEsList.classList.add("is-reordering-list");
  beginFloatingReorder(esDragState, els.detailEsList);
}

function finishEsReorder(event) {
  if (!esDragState.card || esDragState.pointerId !== event.pointerId) return;

  const wasDragging = esDragState.isDragging;
  resetEsReorderState(event.pointerId, wasDragging);
  if (wasDragging) showToast("ESの順番を入れ替えました。");
}

function cancelEsReorder(event = null) {
  if (!esDragState.card) return;
  resetEsReorderState(event?.pointerId);
}

function resetEsReorderState(pointerId = null, commit = false) {
  window.clearTimeout(esDragState.longPressTimer);
  finishFloatingReorder(esDragState, els.detailEsList, commit);
  esDragState.card?.classList.remove("is-reorder-pending", "is-reordering");
  els.detailEsList.classList.remove("is-reordering-list");
  releasePointer(els.detailEsList, pointerId);
  esDragState.card = null;
  esDragState.placeholder = null;
  esDragState.pointerId = null;
  esDragState.startX = 0;
  esDragState.startY = 0;
  esDragState.dragOffsetX = 0;
  esDragState.dragOffsetY = 0;
  esDragState.longPressTimer = null;
  esDragState.isDragging = false;
}

function handleCompanyReorderPointerDown(event) {
  const handle = event.target.closest("[data-company-reorder-handle]");
  if (!handle) return;

  const card = handle.closest("[data-company-card]");
  if (!card) return;

  cancelCompanyReorder();
  companyDragState.card = card;
  companyDragState.pointerId = event.pointerId;
  companyDragState.startX = event.clientX;
  companyDragState.startY = event.clientY;
  companyDragState.longPressTimer = window.setTimeout(startCompanyReorder, event.pointerType === "mouse" ? 140 : 300);
  card.classList.add("is-reorder-pending");
  capturePointer(els.companyList, event.pointerId);
}

function handleCompanyReorderPointerMove(event) {
  if (!companyDragState.card || companyDragState.pointerId !== event.pointerId) return;

  const moved = Math.hypot(event.clientX - companyDragState.startX, event.clientY - companyDragState.startY);
  if (!companyDragState.isDragging && moved > 24) {
    cancelCompanyReorder(event);
    return;
  }

  if (!companyDragState.isDragging) return;

  updateFloatingReorder(companyDragState, event);
  const layout = state.companyViewMode === "normal" ? "vertical" : "grid";
  const nextCard = findCardAfterPointer(els.companyList, "[data-company-card]:not(.is-reordering)", companyDragState.card, event.clientX, event.clientY, layout);
  moveReorderCard(els.companyList, "[data-company-card]", companyDragState.card, nextCard, companyDragState.placeholder);
  event.preventDefault();
}

function startCompanyReorder() {
  if (!companyDragState.card) return;

  companyDragState.isDragging = true;
  companyDragState.suppressClick = true;
  companyDragState.card.classList.remove("is-reorder-pending");
  companyDragState.card.classList.add("is-reordering");
  els.companyList.classList.add("is-reordering-list");
  beginFloatingReorder(companyDragState, els.companyList);
}

async function finishCompanyReorder(event) {
  if (!companyDragState.card || companyDragState.pointerId !== event.pointerId) return;

  const wasDragging = companyDragState.isDragging;
  resetCompanyReorderState(event.pointerId, wasDragging);
  if (wasDragging) {
    await persistCompanyOrderFromDom();
    showToast("企業の順番を入れ替えました。");
  }
}

function cancelCompanyReorder(event = null) {
  if (!companyDragState.card) return;
  resetCompanyReorderState(event?.pointerId);
}

function resetCompanyReorderState(pointerId = null, commit = false) {
  window.clearTimeout(companyDragState.longPressTimer);
  finishFloatingReorder(companyDragState, els.companyList, commit);
  companyDragState.card?.classList.remove("is-reorder-pending", "is-reordering");
  els.companyList.classList.remove("is-reordering-list");
  releasePointer(els.companyList, pointerId);
  companyDragState.card = null;
  companyDragState.placeholder = null;
  companyDragState.pointerId = null;
  companyDragState.startX = 0;
  companyDragState.startY = 0;
  companyDragState.dragOffsetX = 0;
  companyDragState.dragOffsetY = 0;
  companyDragState.longPressTimer = null;
  companyDragState.isDragging = false;
}

function handleTemplateReorderPointerDown(event) {
  const handle = event.target.closest("[data-template-reorder-handle]");
  if (!handle) return;

  const card = handle.closest("[data-template-card]");
  if (!card) return;

  cancelTemplateReorder();
  templateDragState.card = card;
  templateDragState.pointerId = event.pointerId;
  templateDragState.startX = event.clientX;
  templateDragState.startY = event.clientY;
  templateDragState.longPressTimer = window.setTimeout(startTemplateReorder, event.pointerType === "mouse" ? 140 : 300);
  card.classList.add("is-reorder-pending");
  capturePointer(els.templateList, event.pointerId);
  event.preventDefault();
}

function handleTemplateReorderPointerMove(event) {
  if (!templateDragState.card || templateDragState.pointerId !== event.pointerId) return;

  const moved = Math.hypot(event.clientX - templateDragState.startX, event.clientY - templateDragState.startY);
  if (!templateDragState.isDragging && moved > 24) {
    cancelTemplateReorder(event);
    return;
  }

  if (!templateDragState.isDragging) return;

  updateFloatingReorder(templateDragState, event);
  const nextCard = findCardAfterPointer(els.templateList, "[data-template-card]:not(.is-reordering)", templateDragState.card, event.clientX, event.clientY, "vertical");
  moveReorderCard(els.templateList, "[data-template-card]", templateDragState.card, nextCard, templateDragState.placeholder);
  event.preventDefault();
}

function startTemplateReorder() {
  if (!templateDragState.card) return;

  templateDragState.isDragging = true;
  templateDragState.card.classList.remove("is-reorder-pending");
  templateDragState.card.classList.add("is-reordering");
  els.templateList.classList.add("is-reordering-list");
  beginFloatingReorder(templateDragState, els.templateList);
}

async function finishTemplateReorder(event) {
  if (!templateDragState.card || templateDragState.pointerId !== event.pointerId) return;

  const wasDragging = templateDragState.isDragging;
  resetTemplateReorderState(event.pointerId, wasDragging);
  if (wasDragging) {
    await persistTemplateOrderFromDom();
    showToast("型の順番を入れ替えました。");
  }
}

function cancelTemplateReorder(event = null) {
  if (!templateDragState.card) return;
  resetTemplateReorderState(event?.pointerId);
}

function resetTemplateReorderState(pointerId = null, commit = false) {
  window.clearTimeout(templateDragState.longPressTimer);
  finishFloatingReorder(templateDragState, els.templateList, commit);
  templateDragState.card?.classList.remove("is-reorder-pending", "is-reordering");
  els.templateList.classList.remove("is-reordering-list");
  releasePointer(els.templateList, pointerId);
  templateDragState.card = null;
  templateDragState.placeholder = null;
  templateDragState.pointerId = null;
  templateDragState.startX = 0;
  templateDragState.startY = 0;
  templateDragState.dragOffsetX = 0;
  templateDragState.dragOffsetY = 0;
  templateDragState.longPressTimer = null;
  templateDragState.isDragging = false;
}

function findCardAfterPointer(container, selector, activeCard, pointerX, pointerY, layout = "vertical") {
  const cards = Array.from(container.querySelectorAll(selector))
    .filter((card) => card !== activeCard && !card.hidden)
    .map((card) => ({ card, rect: card.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  if (layout === "grid") {
    return findGridCardAfterPointer(cards, pointerX, pointerY);
  }

  return cards.reduce(
    (closest, item) => {
      const offset = pointerY - item.rect.top - item.rect.height / 2;
      return offset < 0 && offset > closest.offset ? { offset, card: item.card } : closest;
    },
    { offset: Number.NEGATIVE_INFINITY, card: null }
  ).card;
}

function findGridCardAfterPointer(cards, pointerX, pointerY) {
  const rows = groupGridRows(cards);
  if (rows.length === 0) return null;

  const targetRowIndex = rows.findIndex((row) => pointerY < row.centerY);
  const rowIndex = targetRowIndex === -1 ? rows.length - 1 : targetRowIndex;
  const row = rows[rowIndex];
  const nextInRow = row.items.find((item) => pointerX < item.rect.left + item.rect.width / 2);

  if (nextInRow) return nextInRow.card;
  return rows[rowIndex + 1]?.items[0]?.card || null;
}

function groupGridRows(cards) {
  const shortestHeight = cards.reduce((height, item) => Math.min(height, item.rect.height), Number.POSITIVE_INFINITY);
  const rowTolerance = Math.max(12, Number.isFinite(shortestHeight) ? shortestHeight * 0.35 : 12);
  const rows = [];

  cards.forEach((item) => {
    let row = rows.find((candidate) => Math.abs(candidate.top - item.rect.top) <= rowTolerance);
    if (!row) {
      row = { top: item.rect.top, bottom: item.rect.bottom, items: [] };
      rows.push(row);
    }
    row.top = Math.min(row.top, item.rect.top);
    row.bottom = Math.max(row.bottom, item.rect.bottom);
    row.items.push(item);
  });

  return rows
    .map((row) => ({
      ...row,
      centerY: row.top + (row.bottom - row.top) / 2,
      items: row.items.sort((a, b) => a.rect.left - b.rect.left)
    }))
    .sort((a, b) => a.centerY - b.centerY);
}

function beginFloatingReorder(dragState, container) {
  if (!dragState.card || dragState.placeholder) return;

  const rect = dragState.card.getBoundingClientRect();
  const placeholder = document.createElement("div");
  placeholder.className = "reorder-placeholder";
  placeholder.style.height = `${rect.height}px`;
  placeholder.style.minHeight = `${rect.height}px`;
  container.insertBefore(placeholder, dragState.card);

  dragState.placeholder = placeholder;
  dragState.dragOffsetX = dragState.startX - rect.left;
  dragState.dragOffsetY = dragState.startY - rect.top;

  dragState.card.classList.add("is-floating-reorder");
  dragState.card.style.position = "fixed";
  dragState.card.style.left = "0";
  dragState.card.style.top = "0";
  dragState.card.style.width = `${rect.width}px`;
  dragState.card.style.height = `${rect.height}px`;
  dragState.card.style.zIndex = "1000";
  dragState.card.style.pointerEvents = "none";
  dragState.card.style.transition = "box-shadow 160ms ease, opacity 160ms ease";
  updateFloatingReorder(dragState, { clientX: dragState.startX, clientY: dragState.startY });
  document.body.classList.add("is-reordering-active");
}

function updateFloatingReorder(dragState, event) {
  if (!dragState.card) return;
  const x = event.clientX - dragState.dragOffsetX;
  const y = event.clientY - dragState.dragOffsetY;
  dragState.card.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.03)`;
}

function finishFloatingReorder(dragState, container, commit) {
  const card = dragState.card;
  const placeholder = dragState.placeholder;
  if (!card) return;

  if (commit && placeholder?.parentNode === container) {
    container.insertBefore(card, placeholder);
  }
  placeholder?.remove();

  card.classList.remove("is-floating-reorder");
  card.style.position = "";
  card.style.left = "";
  card.style.top = "";
  card.style.width = "";
  card.style.height = "";
  card.style.zIndex = "";
  card.style.pointerEvents = "";
  card.style.transition = "";
  card.style.transform = "";
  document.body.classList.remove("is-reordering-active");
}

function capturePointer(element, pointerId) {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Some browsers refuse capture if the pointer already ended. Reordering still works without it.
  }
}

function releasePointer(element, pointerId) {
  if (pointerId === null || pointerId === undefined) return;
  try {
    if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Ignore stale pointer ids.
  }
}

async function persistCompanyOrderFromDom() {
  const visibleIds = Array.from(els.companyList.querySelectorAll("[data-company-card]")).map((card) => card.dataset.companyId);
  if (visibleIds.length === 0) return;

  const visibleSet = new Set(visibleIds);
  const currentOrder = [...state.entries].sort(sortCompanyEntries).map((entry) => entry.id);
  let visibleIndex = 0;
  const nextOrder = currentOrder.map((id) => (visibleSet.has(id) ? visibleIds[visibleIndex++] : id));
  const rank = new Map(nextOrder.map((id, index) => [id, index]));

  state.entries = state.entries.map((entry) => ({
    ...entry,
    sortOrder: rank.has(entry.id) ? rank.get(entry.id) : entry.sortOrder
  }));

  if (state.mode === "local") {
    saveLocalEntries(state.entries);
    return;
  }

  if (state.mode === "cloud" && state.session && state.cloudSortOrderAvailable) {
    await saveCloudCompanyOrder();
  }
}

async function saveCloudCompanyOrder() {
  const results = await Promise.all(
    state.entries.map((entry) => supabaseClient.from("entries").update({ sort_order: entry.sortOrder }).eq("id", entry.id))
  );
  const error = results.find((result) => result.error)?.error;
  if (!error) return;

  state.cloudSortOrderAvailable = false;
  showToast("SupabaseのSQLを更新すると、企業の並び順も端末間で保存できます。");
}

async function persistTemplateOrderFromDom() {
  const visibleIds = Array.from(els.templateList.querySelectorAll("[data-template-card]")).map((card) => card.dataset.templateId);
  if (visibleIds.length === 0) return;

  const rank = new Map(visibleIds.map((id, index) => [id, index]));
  state.templates = state.templates.map((template) => ({
    ...template,
    sortOrder: rank.has(template.id) ? rank.get(template.id) : template.sortOrder
  }));

  if (state.mode === "local") {
    saveLocalTemplates(state.templates);
    return;
  }

  if (state.mode === "cloud" && state.session && state.cloudTemplateSortOrderAvailable) {
    await saveCloudTemplateOrder();
  }
}

async function saveCloudTemplateOrder() {
  const results = await Promise.all(
    state.templates.map((template) => supabaseClient.from("es_templates").update({ sort_order: template.sortOrder }).eq("id", template.id))
  );
  const error = results.find((result) => result.error)?.error;
  if (!error) return;

  state.cloudTemplateSortOrderAvailable = false;
  showToast("SupabaseのSQLを更新すると、型の並び順も端末間で保存できます。");
}

async function handleDetailSubmit(event) {
  event.preventDefault();
  const existingEntry = state.entries.find((entry) => entry.id === state.detailEditingId);
  if (!existingEntry) {
    showToast("保存する企業が見つかりません。");
    return;
  }

  const esItems = collectDetailEsItems();
  const entry = normalizeEntry({
    ...existingEntry,
    esItems,
    esContent: esItemsToLegacyText(esItems),
    interviewNotes: els.detailInterviewNotesInput.value.trim(),
    memo: els.detailMemoInput.value.trim()
  });

  if (state.mode === "cloud") {
    if (!state.session) {
      showToast("ログインすると保存できます。");
      return;
    }

    const saved = await updateCloudEntry(entry);
    if (!saved) return;
    state.entries = state.entries.map((item) => (item.id === saved.id ? saved : item));
  } else {
    state.entries = state.entries.map((item) => (item.id === entry.id ? entry : item));
    saveLocalEntries(state.entries);
  }

  closeCompanyDetail();
  render();
  showToast("詳細を保存しました。");
}

function handleOpenBasicEditFromDetail() {
  const entry = state.entries.find((item) => item.id === state.detailEditingId);
  if (!entry) return;
  closeCompanyDetail();
  openEntryDialog(entry);
}

function updateDetailEsCharCounts() {
  els.detailEsList.querySelectorAll(".es-editor-card").forEach((card) => {
    card.querySelectorAll("[data-es-variant-id]").forEach((pane) => {
      const answer = pane.querySelector("[data-es-answer]");
      const count = pane.querySelector("[data-es-count]");
      if (count) count.textContent = formatCharCount(answer?.value || "");
    });
    updateEsCardSummary(card);
  });
}

function insertSelectedTemplateIntoDetail() {
  const template = state.templates.find((item) => item.id === els.detailTemplateSelect.value);
  if (!template) {
    showToast("使う型を選んでください。");
    return;
  }

  let card = document.activeElement?.closest?.(".es-editor-card");
  if (!card) card = els.detailEsList.querySelector(".es-editor-card:last-child");
  if (!card) {
    addDetailEsItem();
    card = els.detailEsList.querySelector(".es-editor-card:last-child");
  }

  setEsCardExpanded(card, true);
  let answer = card.querySelector(`[data-es-variant-id="${cssEscape(card.dataset.activeVariantId)}"] [data-es-answer]`);
  if (!answer) answer = card.querySelector("[data-es-answer]");
  const current = answer.value.trimEnd();
  answer.value = current ? `${current}\n\n${template.body}` : template.body;
  answer.focus();
  updateDetailEsCharCounts();
  showToast("型を回答に入れました。");
}

function insertTemplateIntoEsVariant(pane) {
  if (!pane) return;
  const template = getTemplateFromVariantPane(pane);
  if (!template) {
    showToast("この回答に入れる型を選んでください。");
    return;
  }

  const answer = pane.querySelector("[data-es-answer]");
  if (!answer) return;
  const current = answer.value.trimEnd();
  answer.value = current ? `${current}\n\n${template.body}` : template.body;
  answer.focus();
  updateDetailEsCharCounts();
  updateEsCardSummary(pane.closest(".es-editor-card"));
  showToast("この回答に型を入れました。");
}

async function copyTemplateFromEsVariant(pane) {
  if (!pane) return;
  const template = getTemplateFromVariantPane(pane);
  if (!template) {
    showToast("コピーする型を選んでください。");
    return;
  }
  const copied = await copyTextToClipboard(template.body);
  showToast(copied ? "型をコピーしました。この回答欄に貼り付けできます。" : "コピーできませんでした。");
}

function getTemplateFromVariantPane(pane) {
  const templateId = pane.querySelector("[data-es-template-select]")?.value;
  return state.templates.find((item) => item.id === templateId) || null;
}

async function copySelectedTemplate() {
  const template = state.templates.find((item) => item.id === els.detailTemplateSelect.value);
  if (!template) {
    showToast("コピーする型を選んでください。");
    return;
  }
  const copied = await copyTextToClipboard(template.body);
  showToast(copied ? "型をコピーしました。回答欄に貼り付けできます。" : "コピーできませんでした。本文を選択してコピーしてください。");
}

async function copyTemplateById(templateId) {
  const template = state.templates.find((item) => item.id === templateId);
  if (!template) return;
  const copied = await copyTextToClipboard(template.body);
  showToast(copied ? "型をコピーしました。" : "コピーできませんでした。本文を選択してコピーしてください。");
}

async function handleTemplateSubmit(event) {
  event.preventDefault();
  const existingTemplate = state.editingTemplateId
    ? state.templates.find((template) => template.id === state.editingTemplateId)
    : null;
  const template = normalizeTemplate({
    id: existingTemplate?.id || createId(),
    kind: els.templateKindInput.value,
    title: els.templateTitleInput.value.trim(),
    body: els.templateBodyInput.value.trim(),
    createdAt: existingTemplate?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sortOrder: Number.isFinite(existingTemplate?.sortOrder) ? existingTemplate.sortOrder : nextTemplateSortOrder()
  });

  if (!template.title || !template.body) {
    showToast("タイトルと本文を入力してください。");
    return;
  }

  if (state.mode === "cloud") {
    if (!state.session) {
      showToast("ログインすると保存できます。");
      return;
    }

    const savedResult = existingTemplate ? await updateCloudTemplate(template) : await createCloudTemplate(template);
    if (!savedResult) return;
    const saved = normalizeTemplate({
      ...savedResult,
      sortOrder: Number.isFinite(savedResult.sortOrder) ? savedResult.sortOrder : template.sortOrder
    });
    if (existingTemplate) {
      state.templates = state.templates.map((item) => (item.id === saved.id ? saved : item));
    } else {
      state.templates.unshift(saved);
    }
  } else {
    if (existingTemplate) {
      state.templates = state.templates.map((item) => (item.id === template.id ? template : item));
    } else {
      state.templates.unshift(template);
    }
    saveLocalTemplates(state.templates);
  }

  resetTemplateForm();
  renderTemplateList();
  renderTemplateOptions();
  showToast(existingTemplate ? "型を更新しました。" : "型を保存しました。");
}

function handleEditTemplate(id) {
  const template = state.templates.find((item) => item.id === id);
  if (!template) return;

  state.editingTemplateId = template.id;
  els.templateKindInput.value = template.kind;
  els.templateTitleInput.value = template.title;
  els.templateBodyInput.value = template.body;
  els.saveTemplateButton.textContent = "型を更新";
  updateTemplateBodyCount();
  els.templateTitleInput.focus();
}

async function handleDeleteTemplate(id) {
  const shouldDelete = window.confirm("この型を削除しますか？");
  if (!shouldDelete) return;

  if (state.mode === "cloud") {
    const { error } = await supabaseClient.from("es_templates").delete().eq("id", id);
    if (error) {
      showToast(error.message);
      return;
    }
  }

  state.templates = state.templates.filter((template) => template.id !== id);
  if (state.mode === "local") saveLocalTemplates(state.templates);
  if (state.editingTemplateId === id) resetTemplateForm();
  renderTemplateList();
  renderTemplateOptions();
  showToast("型を削除しました。");
}

function resetTemplateForm() {
  state.editingTemplateId = null;
  els.templateForm.reset();
  els.saveTemplateButton.textContent = "型を保存";
  updateTemplateBodyCount();
}

function updateTemplateBodyCount() {
  els.templateBodyCount.textContent = formatCharCount(els.templateBodyInput.value);
}

function handleExportBackup() {
  const backup = {
    app: "shukatsu-tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    mode: state.mode,
    entries: state.entries.map(normalizeEntry),
    templates: state.templates.map(normalizeTemplate)
  };
  const date = new Date();
  const filename = `shukatsu-backup-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}.json`;
  downloadTextFile(filename, JSON.stringify(backup, null, 2), "application/json");
  showToast("バックアップを書き出しました。");
}

async function handleImportBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    showToast("バックアップファイルを読めませんでした。");
    return;
  }

  if (!isValidBackup(backup)) {
    showToast("就活管理のバックアップファイルではありません。");
    return;
  }

  const shouldImport = window.confirm("バックアップを復元しますか？同じデータは上書きし、新しいデータは追加します。");
  if (!shouldImport) return;

  const entries = backup.entries.map(normalizeEntry);
  const templates = backup.templates.map(normalizeTemplate);

  if (state.mode === "cloud") {
    if (!state.session) {
      showToast("ログインすると復元できます。");
      return;
    }

    const entryPayload = entries.map(toDbEntry);
    const templatePayload = templates.map(toDbTemplate);
    if (entryPayload.length > 0) {
      const { error } = await supabaseClient.from("entries").upsert(entryPayload, { onConflict: "id" });
      if (error) {
        showToast(error.message);
        return;
      }
    }
    if (templatePayload.length > 0) {
      const { error } = await supabaseClient.from("es_templates").upsert(templatePayload, { onConflict: "id" });
      if (error) {
        showToast(error.message);
        return;
      }
    }
    await loadCloudData();
  } else {
    state.entries = mergeById(state.entries, entries).map(normalizeEntry);
    state.templates = mergeById(state.templates, templates).map(normalizeTemplate);
    saveLocalEntries(state.entries);
    saveLocalTemplates(state.templates);
    render();
  }

  showToast("バックアップを復元しました。");
}

function isValidBackup(value) {
  return Boolean(
    value &&
    value.app === "shukatsu-tracker" &&
    Array.isArray(value.entries) &&
    Array.isArray(value.templates)
  );
}

function mergeById(currentItems, importedItems) {
  const merged = new Map(currentItems.map((item) => [item.id, item]));
  importedItems.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
  await loadCloudData();
  showToast("端末データをクラウドへ移しました。");
}

async function loadCloudData() {
  if (!state.session) return;

  state.loading = true;
  renderMode();
  const [entriesResult, templatesResult] = await Promise.all([
    supabaseClient.from("entries").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("es_templates").select("*").order("updated_at", { ascending: false })
  ]);
  state.loading = false;

  if (entriesResult.error) {
    showToast(entriesResult.error.message);
  } else {
    state.entries = entriesResult.data.map(fromDbEntry);
  }

  if (templatesResult.error) {
    state.templates = [];
    showToast("SupabaseのSQLを更新すると、ESの型保存も使えます。");
  } else {
    state.templates = templatesResult.data.map(fromDbTemplate);
  }

  render();
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

async function createCloudTemplate(template) {
  const { data, error } = await supabaseClient.from("es_templates").insert(toDbTemplate(template)).select("*").single();
  if (error) {
    showToast(error.message);
    return null;
  }
  return fromDbTemplate(data);
}

async function updateCloudTemplate(template) {
  const { id, user_id, created_at, ...changes } = toDbTemplate(template);
  const { data, error } = await supabaseClient.from("es_templates").update(changes).eq("id", id).select("*").single();
  if (error) {
    showToast(error.message);
    return null;
  }
  return fromDbTemplate(data);
}

function render() {
  renderMode();
  renderDailyQuote();
  renderSummary();
  renderDeadlineList();
  renderEventList();
  renderFilterOptions();
  renderCompanyList();
  renderTemplateList();
  renderTemplateOptions();
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
  els.exportBackupButton.disabled = waitingForLogin || state.loading;
  els.importBackupButton.disabled = waitingForLogin || state.loading;
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
  const isCompact = state.companyViewMode === "compact";
  const isMedium = state.companyViewMode === "medium";
  const entries = state.entries
    .filter(matchesListFilter)
    .filter(matchesSearchQuery)
    .filter(matchesIndustryFilter)
    .filter(matchesDeadlineFilter)
    .filter(matchesPriorityFilter)
    .sort(sortCompanyEntries);

  updateCompanyViewButtons();
  els.companyList.classList.toggle("compact-view", isCompact);
  els.companyList.classList.toggle("medium-view", isMedium);

  if (entries.length === 0) {
    els.companyList.innerHTML = emptyState("条件に合う企業がありません。内定・落選の企業も「全部」または「結果済み」に残ります。");
    return;
  }

  if (isCompact) {
    els.companyList.innerHTML = entries
      .map((entry) => {
        return `
          <article class="company-compact-card" data-company-card data-company-id="${escapeAttribute(entry.id)}" title="${escapeAttribute(entry.companyName)}の詳細を開く">
            <button class="company-compact-main" data-detail-id="${escapeAttribute(entry.id)}" type="button">
              ${companyIconMarkup(entry)}
              <span>${escapeHtml(entry.companyName)}</span>
            </button>
            <button class="compact-reorder-button" data-company-reorder-handle type="button" aria-label="${escapeAttribute(entry.companyName)}を並べ替え">↕</button>
          </article>
        `;
      })
      .join("");
    return;
  }

  if (isMedium) {
    els.companyList.innerHTML = entries
      .map((entry) => {
        return `
          <article class="company-medium-card" data-company-card data-company-id="${escapeAttribute(entry.id)}">
            <div class="company-medium-main">
              ${companyIconMarkup(entry)}
              <div>
                <strong>${escapeHtml(entry.companyName)}</strong>
                <div class="meta-row">
                  ${statusTag(entry.status)}
                  ${entry.industry ? `<span>${escapeHtml(entry.industry)}</span>` : ""}
                </div>
              </div>
            </div>
            <div class="company-medium-details">
              <span>${escapeHtml(entry.trackType)} / ${escapeHtml(entry.eventType)}</span>
              ${entry.deadline ? `<span>${formatDate(entry.deadline)} 締切</span>` : ""}
              ${entry.eventDate ? `<span>${formatDate(entry.eventDate)} 予定</span>` : ""}
              <span>志望度 ${escapeHtml(entry.priority)}</span>
            </div>
            <div class="company-medium-actions">
              <button class="compact-reorder-button" data-company-reorder-handle type="button" aria-label="${escapeAttribute(entry.companyName)}を並べ替え">↕</button>
              <button class="detail-button" data-detail-id="${entry.id}" type="button">詳細</button>
              <button class="edit-button" data-edit-id="${entry.id}" type="button">編集</button>
            </div>
          </article>
        `;
      })
      .join("");
    return;
  }

  els.companyList.innerHTML = entries
    .map((entry) => {
      return `
        <article class="company-card" data-company-card data-company-id="${escapeAttribute(entry.id)}">
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
              <button class="reorder-button" data-company-reorder-handle type="button">並べ替え</button>
              <button class="detail-button" data-detail-id="${entry.id}" type="button">詳細</button>
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
          ${esPreviewBlock(entry)}
          ${entry.interviewNotes ? noteBlock("面接対策", entry.interviewNotes) : ""}
          ${entry.memo ? `<p class="memo">${escapeHtml(entry.memo)}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

function setCompanyViewMode(viewMode) {
  state.companyViewMode = companyViewModes.includes(viewMode) ? viewMode : "normal";
  localStorage.setItem(companyViewModeStorageKey, state.companyViewMode);
  updateCompanyViewButtons();
  renderCompanyList();
}

function updateCompanyViewButtons() {
  els.viewModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.viewMode === state.companyViewMode);
  });
}

function renderTemplateList() {
  if (state.templates.length === 0) {
    els.templateList.innerHTML = emptyState("まだ型がありません。ガクチカ、自己PR、志望動機などを保存しておくと使い回せます。");
    return;
  }

  els.templateList.innerHTML = [...state.templates].sort(sortTemplates)
    .map((template) => {
      return `
        <article class="template-card" data-template-card data-template-id="${escapeAttribute(template.id)}">
          <div class="template-card-heading">
            <button class="template-title-button" data-template-toggle type="button" aria-expanded="false">
              <span class="tag">${escapeHtml(template.kind)}</span>
              <strong>${escapeHtml(template.title)}</strong>
              <span class="template-title-meta">${formatCharCount(template.body)}</span>
            </button>
            <div class="template-card-actions">
              <button class="reorder-button" data-template-reorder-handle type="button">並べ替え</button>
              <button class="detail-button" data-template-copy-id="${template.id}" type="button">コピー</button>
              <button class="edit-button" data-template-edit-id="${template.id}" type="button">編集</button>
              <button class="delete-button" data-template-delete-id="${template.id}" type="button">削除</button>
            </div>
          </div>
          <div class="template-card-body" data-template-body hidden>
            <p>${escapeHtml(template.body)}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

function toggleTemplateCard(card) {
  if (!card) return;
  const body = card.querySelector("[data-template-body]");
  const toggle = card.querySelector("[data-template-toggle]");
  if (!body || !toggle) return;
  const expanded = body.hidden;
  body.hidden = !expanded;
  toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  card.classList.toggle("is-open", expanded);
}

function templateOptionsMarkup() {
  const templates = [...state.templates].sort(sortTemplates);
  if (templates.length === 0) return '<option value="">先に下の「ES・ガクチカの型」で保存</option>';
  return [
    '<option value="">型を選択</option>',
    ...templates.map((template) =>
      `<option value="${escapeAttribute(template.id)}">${escapeHtml(template.kind)}：${escapeHtml(template.title)}</option>`
    )
  ].join("");
}

function renderTemplateOptions() {
  const selected = els.detailTemplateSelect.value;
  els.detailTemplateSelect.innerHTML = templateOptionsMarkup();
  if (state.templates.some((template) => template.id === selected)) {
    els.detailTemplateSelect.value = selected;
  }
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
  setFormValue("esContent", entry ? entryEsText(values) : "");
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

function loadLocalTemplates() {
  const saved = localStorage.getItem(templateStorageKey);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(normalizeTemplate) : [];
  } catch {
    return [];
  }
}

function saveLocalTemplates(templates) {
  localStorage.setItem(templateStorageKey, JSON.stringify(templates));
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
    es_items: normalizeEsItems(entry.esItems, entry.esContent),
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
    esItems: row.es_items || [],
    interviewNotes: row.interview_notes || "",
    memo: row.memo || "",
    createdAt: row.created_at,
    sortOrder: Number(row.sort_order)
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
    esItems: normalizeEsItems(entry.esItems, entry.esContent || ""),
    interviewNotes: entry.interviewNotes || "",
    memo: entry.memo || "",
    createdAt: entry.createdAt || new Date().toISOString(),
    sortOrder: Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : Number.NaN
  };
}

function createEsItem(question = "", answer = "") {
  const variant = createEsVariant("", answer);
  return {
    id: createId(),
    question: String(question || ""),
    answer: String(answer || ""),
    variants: [variant],
    activeVariantId: variant.id
  };
}

function createEsVariant(label = "", answer = "") {
  return {
    id: createId(),
    label: String(label || ""),
    answer: String(answer || "")
  };
}

function normalizeEsItems(items, legacyContent = "") {
  const normalized = Array.isArray(items)
    ? items
        .map(normalizeEsItem)
        .filter((item) => item.question.trim() || item.variants.some((variant) => variant.label.trim() || variant.answer.trim()))
    : [];

  if (normalized.length > 0) return normalized;

  const legacyAnswer = String(legacyContent || "").trim();
  return legacyAnswer ? [createEsItem("", legacyAnswer)] : [];
}

function normalizeEsItem(item = {}) {
  const variants = normalizeEsVariants(item.variants, item.answer);
  const activeVariantId = variants.some((variant) => variant.id === item.activeVariantId)
    ? item.activeVariantId
    : variants[0]?.id || "";
  const activeVariant = variants.find((variant) => variant.id === activeVariantId) || variants[0];

  return {
    id: item.id || createId(),
    question: String(item.question || ""),
    answer: activeVariant?.answer || "",
    variants,
    activeVariantId
  };
}

function normalizeEsVariants(variants, legacyAnswer = "") {
  const normalized = Array.isArray(variants)
    ? variants
        .map((variant) => ({
          id: variant.id || createId(),
          label: String(variant.label || ""),
          answer: String(variant.answer || "")
        }))
        .filter((variant) => variant.label.trim() || variant.answer.trim())
    : [];

  if (normalized.length > 0) return normalized;
  return [createEsVariant("", legacyAnswer || "")];
}

function getActiveEsVariant(item) {
  return item.variants.find((variant) => variant.id === item.activeVariantId) || item.variants[0] || createEsVariant();
}

function esItemTitle(item) {
  const question = String(item.question || "").trim();
  if (question) return question;
  const answer = getActiveEsVariant(item).answer.trim();
  if (answer) return `${answer.slice(0, 32)}${answer.length > 32 ? "..." : ""}`;
  return "未入力のES質問";
}

function esItemMeta(item) {
  const active = getActiveEsVariant(item);
  return `${item.variants.length}パターン / ${formatCharCount(active.answer)}`;
}

function esVariantTitle(variant) {
  const label = String(variant.label || "").trim();
  if (label) return label;
  const characters = countCharacters(variant.answer);
  return characters > 0 ? `${characters}字` : "未入力";
}

function normalizeTemplate(template) {
  return {
    id: template.id || createId(),
    kind: template.kind || "ガクチカ",
    title: template.title || "",
    body: template.body || "",
    createdAt: template.createdAt || new Date().toISOString(),
    updatedAt: template.updatedAt || template.createdAt || new Date().toISOString(),
    sortOrder: Number.isFinite(Number(template.sortOrder)) ? Number(template.sortOrder) : Number.NaN
  };
}

function toDbTemplate(template) {
  return {
    id: template.id,
    user_id: state.session.user.id,
    kind: template.kind,
    title: template.title,
    body: template.body,
    created_at: template.createdAt || new Date().toISOString(),
    updated_at: template.updatedAt || new Date().toISOString()
  };
}

function fromDbTemplate(row) {
  return normalizeTemplate({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sortOrder: Number(row.sort_order)
  });
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

  window.addEventListener("resize", handleMascotResize);
  updateMascotWander();
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

function handleMascotResize() {
  clampMascotPosition();
  updateMascotWander();
}

function updateMascotWander() {
  window.clearInterval(mascotState.wanderTimer);
  mascotState.wanderTimer = null;

  if (mascotState.reducedMotion || isSmallScreen()) return;

  mascotState.wanderTimer = window.setInterval(wanderMascotNearHome, 12000);
}

function isSmallScreen() {
  return window.matchMedia ? window.matchMedia("(max-width: 760px)").matches : window.innerWidth <= 760;
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
      eyebrow: "Not the End",
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
  els.celebrationEyebrow.textContent = celebration.eyebrow || "Congratulations";
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

function openMascotHelp() {
  els.mascotHelpPanel.hidden = false;
  showMascotBubble("相談のるよ");
  window.setTimeout(() => els.mascotHelpInput.focus(), 80);
}

function closeMascotHelp() {
  els.mascotHelpPanel.hidden = true;
}

function handleMascotHelpSubmit(event) {
  event.preventDefault();
  const question = els.mascotHelpInput.value.trim();
  if (!question) return;

  appendHelpMessage(question, "user");
  appendHelpMessage(getMascotHelpAnswer(question), "assistant");
  els.mascotHelpInput.value = "";
  els.mascotHelpLog.scrollTop = els.mascotHelpLog.scrollHeight;
}

function appendHelpMessage(message, role) {
  const paragraph = document.createElement("p");
  paragraph.className = `help-message ${role}`;
  paragraph.textContent = message;
  els.mascotHelpLog.append(paragraph);
}

function getMascotHelpAnswer(question) {
  const text = question.toLowerCase();

  if (text.includes("es") || text.includes("ガクチカ") || text.includes("自己pr") || text.includes("文字") || text.includes("質問")) {
    return "企業カードの「詳細」を押すと、ESを質問ごとに管理できます。同じ質問に400字版・600字版など複数回答を保存でき、検索欄で質問や文字数から探せます。";
  }

  if (text.includes("型") || text.includes("テンプレ") || text.includes("使い回") || text.includes("使いまわ")) {
    return "画面の「ES・ガクチカの型」によく使う文章を保存できます。企業詳細でES質問カードを開くと、回答欄の上に型の選択欄が出ます。「この回答に入れる」でその回答だけに追加できます。";
  }

  if (text.includes("締切") || text.includes("予定") || text.includes("カレンダー") || text.includes("面接")) {
    return "締切日と次の予定日を入れると、上の近日リストとカレンダーに出ます。カレンダーは前月・翌月ボタンで別の月も見られます。";
  }

  if (text.includes("同期") || text.includes("スマホ") || text.includes("iphone") || text.includes("ログイン") || text.includes("supabase")) {
    return "同じメールアドレスとパスワードでログインすると、PCとiPhoneで同じデータを見られます。新規登録後は確認メールを押してからログインしてください。";
  }

  if (text.includes("バックアップ") || text.includes("復元") || text.includes("引き継") || text.includes("移行")) {
    return "画面上部の「バックアップ」でJSONファイルを書き出せます。別のPCや同じアプリで「復元」を押してそのファイルを選ぶと、企業データとESの型を読み込めます。";
  }

  if (text.includes("アイコン") || text.includes("ロゴ")) {
    return "企業公式サイトURLやマイページURLからアイコン候補を自動で探します。違う画像になったら、企業アイコン画像URLに好きな画像URLを入れれば上書きできます。";
  }

  if (text.includes("落選") || text.includes("内定") || text.includes("通過")) {
    return "ステータスを内定・選考通過・インターン選考通過にすると派手に祝います。落選にしたときは怒り顔で励ます演出になります。";
  }

  return "まずは「＋追加」で企業を登録して、締切日・次の予定日・ステータスを入れるのがおすすめ。詳しく書きたい企業は「詳細」からESや面接メモを編集できます。";
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
    ...normalizeEsItems(entry.esItems, entry.esContent).flatMap((item) => [
      item.question,
      ...item.variants.flatMap((variant) => [variant.label, variant.answer, `${countCharacters(variant.answer)}字`])
    ]),
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
  const aOrder = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bOrder = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;

  if (state.deadlineFilter !== "all") {
    const aDeadline = a.deadline || "9999-12-31";
    const bDeadline = b.deadline || "9999-12-31";
    return aDeadline.localeCompare(bDeadline);
  }
  return sortByClosestDate(a, b);
}

function nextCompanySortOrder() {
  const orders = state.entries.map((entry) => entry.sortOrder).filter(Number.isFinite);
  return orders.length > 0 ? Math.max(...orders) + 1 : Number.NaN;
}

function sortTemplates(a, b) {
  const aOrder = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.MAX_SAFE_INTEGER;
  const bOrder = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;

  return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

function nextTemplateSortOrder() {
  const orders = state.templates.map((template) => template.sortOrder).filter(Number.isFinite);
  return orders.length > 0 ? Math.max(...orders) + 1 : Number.NaN;
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

function esPreviewBlock(entry) {
  const items = normalizeEsItems(entry.esItems, entry.esContent);
  if (items.length === 0) return "";

  const first = items[0];
  const previewSource = first.question || getActiveEsVariant(first).answer;
  const preview = previewSource.length > 150 ? `${previewSource.slice(0, 150)}...` : previewSource;
  const totalPatterns = items.reduce((sum, item) => sum + item.variants.length, 0);
  const totalCharacters = items.reduce(
    (sum, item) => sum + item.variants.reduce((variantSum, variant) => variantSum + countCharacters(variant.answer), 0),
    0
  );

  return `
    <div class="note-block es-preview">
      <strong>ES ${items.length}問 / 回答 ${totalPatterns}パターン / 合計 ${totalCharacters}字</strong>
      <p>${escapeHtml(preview)}</p>
    </div>
  `;
}

function entryEsText(entry) {
  const items = normalizeEsItems(entry.esItems, entry.esContent);
  return items.length > 0 ? esItemsToLegacyText(items) : entry.esContent || "";
}

function esItemsToLegacyText(items) {
  return normalizeEsItems(items)
    .map((item) => {
      const answers = item.variants
        .map((variant) => [`【${esVariantTitle(variant)}】`, variant.answer].filter(Boolean).join("\n"))
        .join("\n\n");
      return [item.question ? `Q. ${item.question}` : "", answers].filter(Boolean).join("\n");
    })
    .join("\n\n");
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

function countCharacters(value) {
  return Array.from(String(value || "")).length;
}

function formatCharCount(value) {
  return `${countCharacters(value)}字`;
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

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(String(value || ""));
  return String(value || "").replaceAll('"', '\\"').replaceAll("\\", "\\\\");
}

async function copyTextToClipboard(text) {
  const value = String(text || "");
  if (!value) {
    showToast("コピーする文章がありません。");
    return false;
  }

  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
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
