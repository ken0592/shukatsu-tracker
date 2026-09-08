const storageKey = "shukatsu-tracker-entries";
const templateStorageKey = "shukatsu-tracker-templates";
const storageBackupKey = `${storageKey}-last-good`;
const storagePendingKey = `${storageKey}-pending`;
const templateStorageBackupKey = `${templateStorageKey}-last-good`;
const templateStoragePendingKey = `${templateStorageKey}-pending`;
const mascotPositionKey = "shukatsu-tracker-mascot-position";
const companyViewModeStorageKey = "shukatsu-tracker-company-view-mode";
const actionScopeStorageKey = "shukatsu-tracker-action-scope";
const companyViewModes = ["normal", "medium", "compact"];
const actionScopes = ["today", "week"];
const detailTabs = ["basic", "es"];
const detailEsModes = ["read", "edit"];
const trashFilterValue = "trash";
const companyNameCollator = new Intl.Collator("ja", {
  usage: "sort",
  sensitivity: "base",
  numeric: true
});
const simpleStatuses = ["気になる", "応募済み", "選考中", "採用", "不採用"];
// Accept older records and backups without rewriting their original status.
const activeStatuses = ["気になる", "応募予定", "応募済み", "ES提出済み", "Webテスト", "一次面接", "二次面接", "最終面接", "結果待ち", "選考通過", "インターン選考通過", "インターン参加決定", "選考中"];
const finishedStatuses = ["内定", "落選", "辞退", "参加済み", "採用", "不採用"];
const celebrationStatuses = ["内定", "選考通過", "インターン選考通過", "インターン参加決定", "採用"];
const rejectionStatuses = ["落選", "不採用"];
const sampleCompanyNames = ["株式会社サンプル商事", "ミライテック株式会社", "東都キャリア株式会社"];
const initialCalendarDate = new Date();
const trackTypeHints = {
  インターン: "時期が未設定、または夏・冬以外のインターンです。夏・冬が決まっていれば種類を変更できます。",
  夏インターン: "この企業の夏インターンの応募・ES・面接をまとめます。冬インターンは企業内に別の選考として追加できます。",
  冬インターン: "冬インターンの応募・ES・面接をまとめます。夏インターンの記録と分けて管理できます。",
  早期選考: "インターン後など、通常より早く進む本選考です。迷ったら本選考寄りとして扱えば大丈夫です。",
  本選考: "内定に向けた通常選考です。ES締切、Webテスト、面接予定を中心に追います。",
  説明会: "説明会や企業理解イベントを置いておく枠です。応募するならあとで本選考に変えられます。",
  面談: "カジュアル面談や社員面談を置いておく枠です。",
  "OB/OG訪問": "OB/OG訪問の予定やメモを残す枠です。"
};
const trackTypeClassNames = {
  インターン: "intern",
  夏インターン: "intern",
  冬インターン: "intern",
  早期選考: "early",
  本選考: "main",
  説明会: "event",
  面談: "event",
  "OB/OG訪問": "event"
};
const entryMergeFields = [
  { key: "companyName", label: "企業名" },
  { key: "industry", label: "業種" },
  { key: "mypageId", label: "マイページID" },
  { key: "officialUrl", label: "企業公式サイト" },
  { key: "logoUrl", label: "企業アイコン" },
  { key: "trackType", label: "選考の種類" },
  { key: "status", label: "ステータス" },
  { key: "deadline", label: "締切日" },
  { key: "eventDate", label: "次の予定日" },
  { key: "eventType", label: "予定の種類" },
  { key: "priority", label: "志望度" },
  { key: "mypageUrl", label: "企業マイページ" },
  { key: "esItems", label: "ESの質問・回答", type: "es" },
  { key: "interviewNotes", label: "面接対策メモ", type: "long" },
  { key: "memo", label: "その他メモ", type: "long" },
  { key: "deletedAt", label: "ゴミ箱の状態", type: "trash" }
];
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
const localAi = window.SHUKATSU_AI || null;
const localCsv = window.SHUKATSU_CSV || null;
const hasCloudConfig = Boolean(appConfig.supabaseUrl && appConfig.supabaseAnonKey && window.supabase);
const supabaseClient = hasCloudConfig
  ? window.supabase.createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey)
  : null;

const state = {
  entries: [],
  bulkIcons: null,
  summerMigration: null,
  pendingStatusChanges: new Set(),
  templates: [],
  filter: "all",
  searchQuery: "",
  industryFilter: "all",
  deadlineFilter: "all",
  priorityFilter: "all",
  companyViewMode: companyViewModes.includes(localStorage.getItem(companyViewModeStorageKey))
    ? localStorage.getItem(companyViewModeStorageKey)
    : "normal",
  actionScope: actionScopes.includes(localStorage.getItem(actionScopeStorageKey))
    ? localStorage.getItem(actionScopeStorageKey)
    : "today",
  mode: hasCloudConfig ? "cloud" : "local",
  session: null,
  userScopeVersion: 0,
  loading: true,
  cloudSortOrderAvailable: true,
  cloudTemplateSortOrderAvailable: true,
  cloudDeletedAtAvailable: false,
  cloudDeletedAtWarningShown: false,
  editingId: null,
  editingBaseEntry: null,
  entryDraft: null,
  entryDraftKind: null,
  entryImportConflictDetails: [],
  entryImportReviewKey: "",
  entryImportValueApplied: false,
  entrySavePending: false,
  detailEditingId: null,
  detailBaseEntry: null,
  detailSavePending: false,
  esReviewDraft: null,
  detailTab: "basic",
  detailEsMode: "read",
  pendingEntryConflict: null,
  trashDeletePending: false,
  editingTemplateId: null,
  aiCards: [],
  aiCsvCards: [],
  aiCsvFileCount: 0,
  aiLoadedText: "",
  aiImportFileNames: [],
  aiImportWarnings: [],
  aiReviewedConflictKeys: new Set(),
  aiFileReadPending: false,
  aiFileReadRequestId: 0,
  aiGeneratePending: false,
  aiGenerateRequestId: 0,
  aiReturnAfterCelebration: false,
  faqPending: false,
  faqHistory: [],
  faqRequestId: 0,
  calendarYear: initialCalendarDate.getFullYear(),
  calendarMonth: initialCalendarDate.getMonth()
};

const els = {
  openFormButton: document.querySelector("#openFormButton"),
  openAiImportButton: document.querySelector("#openAiImportButton"),
  aiImportDialog: document.querySelector("#aiImportDialog"),
  aiImportForm: document.querySelector("#aiImportForm"),
  closeAiImportButton: document.querySelector("#closeAiImportButton"),
  clearAiImportButton: document.querySelector("#clearAiImportButton"),
  aiMemoInput: document.querySelector("#aiMemoInput"),
  selectAiMemoFileButton: document.querySelector("#selectAiMemoFileButton"),
  aiMemoFileInput: document.querySelector("#aiMemoFileInput"),
  aiMemoFileName: document.querySelector("#aiMemoFileName"),
  aiImportNotice: document.querySelector("#aiImportNotice"),
  aiPrivacySummary: document.querySelector("#aiPrivacySummary"),
  aiRedactedPreview: document.querySelector("#aiRedactedPreview"),
  aiConnectionStatus: document.querySelector("#aiConnectionStatus"),
  aiImportError: document.querySelector("#aiImportError"),
  aiResultStatus: document.querySelector("#aiResultStatus"),
  aiResultList: document.querySelector("#aiResultList"),
  generateAiCardsButton: document.querySelector("#generateAiCardsButton"),
  closeFormButton: document.querySelector("#closeFormButton"),
  deleteEntryButton: document.querySelector("#deleteEntryButton"),
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
  entryImportConflictNotice: document.querySelector("#entryImportConflictNotice"),
  saveEntryButton: document.querySelector("#saveEntryButton"),
  companyDetailDialog: document.querySelector("#companyDetailDialog"),
  companyDetailForm: document.querySelector("#companyDetailForm"),
  closeDetailButton: document.querySelector("#closeDetailButton"),
  detailCompanyTitle: document.querySelector("#detailCompanyTitle"),
  detailCompanyMeta: document.querySelector("#detailCompanyMeta"),
  detailTabs: document.querySelectorAll("[data-detail-tab]"),
  detailEsModeButtons: document.querySelectorAll("[data-es-mode]"),
  detailPanels: document.querySelectorAll("[data-detail-panel]"),
  detailTabPanels: document.querySelector("#detailTabPanels"),
  detailInfoSummary: document.querySelector("#detailInfoSummary"),
  detailEsList: document.querySelector("#detailEsList"),
  addEsItemButton: document.querySelector("#addEsItemButton"),
  detailTemplateSelect: document.querySelector("#detailTemplateSelect"),
  insertTemplateButton: document.querySelector("#insertTemplateButton"),
  copyTemplateButton: document.querySelector("#copyTemplateButton"),
  detailEsSearchInput: document.querySelector("#detailEsSearchInput"),
  detailMemoInput: document.querySelector("#detailMemoInput"),
  openBasicEditButton: document.querySelector("#openBasicEditButton"),
  saveDetailButton: document.querySelector("#saveDetailButton"),
  saveConflictDialog: document.querySelector("#saveConflictDialog"),
  saveConflictForm: document.querySelector("#saveConflictForm"),
  saveConflictList: document.querySelector("#saveConflictList"),
  closeConflictButton: document.querySelector("#closeConflictButton"),
  cancelConflictButton: document.querySelector("#cancelConflictButton"),
  resolveConflictButton: document.querySelector("#resolveConflictButton"),
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
  trashCount: document.querySelector("#trashCount"),
  emptyTrashButton: document.querySelector("#emptyTrashButton"),
  bulkIconControls: document.querySelector("#bulkIconControls"),
  bulkIconButton: document.querySelector("#bulkIconButton"),
  cancelBulkIconButton: document.querySelector("#cancelBulkIconButton"),
  bulkIconStatus: document.querySelector("#bulkIconStatus"),
  todayActionTitle: document.querySelector("#todayActionTitle"),
  todayActionCount: document.querySelector("#todayActionCount"),
  todayActionList: document.querySelector("#todayActionList"),
  deadlineList: document.querySelector("#deadlineList"),
  eventList: document.querySelector("#eventList"),
  companyList: document.querySelector("#companyList"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarMonthLabel: document.querySelector("#calendarMonthLabel"),
  prevCalendarButton: document.querySelector("#prevCalendarButton"),
  nextCalendarButton: document.querySelector("#nextCalendarButton"),
  todayCalendarButton: document.querySelector("#todayCalendarButton"),
  companySearchInput: document.querySelector("#companySearchInput"),
  deadlineFilterInput: document.querySelector("#deadlineFilterInput"),
  priorityFilterInput: document.querySelector("#priorityFilterInput"),
  trackTypeInput: document.querySelector("#trackTypeInput"),
  trackTypeHint: document.querySelector("#trackTypeHint"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  filterButtons: document.querySelectorAll(".filter-button"),
  viewModeButtons: document.querySelectorAll(".view-button"),
  actionScopeButtons: document.querySelectorAll(".today-scope-button"),
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
  mascotHelpSubmitButton: document.querySelector("#mascotHelpSubmitButton"),
  clearMascotChatButton: document.querySelector("#clearMascotChatButton"),
  mascotHelpLog: document.querySelector("#mascotHelpLog"),
  addBranchDialog: document.querySelector("#addBranchDialog"),
  addBranchTitle: document.querySelector("#addBranchTitle"),
  addBranchChoices: document.querySelector("#addBranchChoices"),
  detailBranchNavigation: document.querySelector("#detailBranchNavigation"),
  legacySummerControls: document.querySelector("#legacySummerControls"),
  moveLegacySummerButton: document.querySelector("#moveLegacySummerButton"),
  legacySummerStatus: document.querySelector("#legacySummerStatus"),
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

const detailSwipeState = {
  pointerId: null,
  startX: 0,
  startY: 0
};

bindEvents();
init();

function bindEvents() {
  document.querySelector("#closeAddBranchButton").addEventListener("click", () => els.addBranchDialog.close());
  els.moveLegacySummerButton.addEventListener("click", handleSummerMigration);
  els.bulkIconButton.addEventListener("click", handleBulkIcons);
  els.cancelBulkIconButton.addEventListener("click", () => {
    state.bulkIcons?.controller.abort();
    renderBulkIcons();
  });
  state.iconPicker = window.SHUKATSU_ICONS?.createPicker({
    form: els.entryForm,
    panel: document.querySelector("#companyIconCandidates"),
    button: document.querySelector("#findCompanyIconButton")
  });
  els.openAiImportButton.addEventListener("click", openAiImportDialog);
  els.closeAiImportButton.addEventListener("click", () => closeAiImportDialog(false));
  els.clearAiImportButton.addEventListener("click", clearAiImportData);
  els.aiImportDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeAiImportDialog(false);
  });
  els.aiImportForm.addEventListener("submit", handleAiGenerate);
  els.aiMemoInput.addEventListener("input", () => {
    if (state.aiGeneratePending) {
      state.aiGenerateRequestId += 1;
      state.aiGeneratePending = false;
    }
    if (state.aiCards.length) {
      state.aiCards = [];
      renderAiCards();
    }
    state.aiReviewedConflictKeys.clear();
    updateAiPrivacyPreview();
    updateAiGenerateButton();
  });
  els.selectAiMemoFileButton.addEventListener("click", () => {
    els.aiMemoFileInput.value = "";
    els.aiMemoFileInput.click();
  });
  els.aiMemoFileInput.addEventListener("change", handleAiMemoFile);
  els.aiResultList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-card-index]");
    if (button) openAiCardDraft(Number(button.dataset.aiCardIndex));
  });

  els.openFormButton.addEventListener("click", () => {
    if (state.mode === "cloud" && !state.session) {
      showToast("ログインすると追加できます。");
      return;
    }

    openEntryDialog();
  });

  els.closeFormButton.addEventListener("click", closeEntryFormDialog);
  els.entryDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEntryFormDialog();
  });

  els.deleteEntryButton.addEventListener("click", () => {
    if (state.editingId) handleDeleteEntry(state.editingId);
  });
  els.entryForm.addEventListener("submit", handleEntrySubmit);
  els.entryImportConflictNotice.addEventListener("click", handleImportConflictValueChoice);
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
  els.clearMascotChatButton.addEventListener("click", () => {
    resetMascotChat();
    els.mascotHelpInput.focus();
  });
  els.mascotHelpInput.addEventListener("input", () => els.mascotHelpInput.setCustomValidity(""));
  els.closeCelebrationButton.addEventListener("click", closeCelebration);
  els.celebrationOverlay.addEventListener("click", (event) => {
    if (event.target === els.celebrationOverlay) closeCelebration();
  });
  els.closeDetailButton.addEventListener("click", closeCompanyDetail);
  document.querySelector("#closeEsReviewButton").addEventListener("click", closeEsReview);
  document.querySelector("#generateEsReviewButton").addEventListener("click", generateEsReview);
  document.querySelector("#applyEsReviewButton").addEventListener("click", applyEsReview);
  document.querySelector("#esReviewDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEsReview();
  });
  els.companyDetailForm.addEventListener("submit", handleDetailSubmit);
  els.detailTabs.forEach((tab) => {
    tab.addEventListener("click", () => setDetailTab(tab.dataset.detailTab));
  });
  els.detailEsModeButtons.forEach((button) => {
    button.addEventListener("click", () => setDetailEsMode(button.dataset.esMode));
  });
  els.detailTabPanels.addEventListener("pointerdown", handleDetailSwipePointerDown);
  els.detailTabPanels.addEventListener("pointerup", handleDetailSwipePointerUp);
  els.detailTabPanels.addEventListener("pointercancel", resetDetailSwipe);
  els.addEsItemButton.addEventListener("click", () => addDetailEsItem());
  els.insertTemplateButton.addEventListener("click", insertSelectedTemplateIntoDetail);
  els.copyTemplateButton.addEventListener("click", copySelectedTemplate);
  els.openBasicEditButton.addEventListener("click", handleOpenBasicEditFromDetail);
  els.saveConflictForm.addEventListener("submit", handleConflictSubmit);
  els.closeConflictButton.addEventListener("click", cancelEntryConflict);
  els.cancelConflictButton.addEventListener("click", cancelEntryConflict);
  els.saveConflictDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancelEntryConflict();
  });
  els.detailEsList.addEventListener("input", handleDetailEsInput);
  els.detailEsList.addEventListener("click", (event) => {
    const reviewButton = event.target.closest("[data-es-review]");
    if (reviewButton) {
      openEsReview(reviewButton.closest("[data-es-variant-id]"));
      return;
    }
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

    const copyAnswerButton = event.target.closest("[data-es-copy-answer]");
    if (copyAnswerButton) {
      copyEsAnswer(copyAnswerButton.closest("[data-es-read-answer]"));
      return;
    }

    const editCardButton = event.target.closest("[data-es-edit-card]");
    if (editCardButton) {
      const card = editCardButton.closest(".es-editor-card");
      setDetailEsMode("edit");
      setEsCardExpanded(card, true);
      card?.querySelector("[data-es-question], [data-es-answer]")?.focus();
      return;
    }

    const toggleButton = event.target.closest("[data-es-toggle]");
    if (toggleButton) {
      if (state.detailEsMode === "read") return;
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
  els.companyList.addEventListener("change", (event) => {
    if (event.target.matches("[data-company-status]")) void handleCompanyStatusChange(event.target);
  });
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
  els.deadlineFilterInput.addEventListener("change", () => {
    state.deadlineFilter = els.deadlineFilterInput.value;
    renderCompanyList();
  });
  els.priorityFilterInput.addEventListener("change", () => {
    state.priorityFilter = els.priorityFilterInput.value;
    renderCompanyList();
  });
  els.trackTypeInput.addEventListener("change", updateTrackTypeHint);
  els.clearFiltersButton.addEventListener("click", clearCompanyFilters);
  els.emptyTrashButton.addEventListener("click", handleEmptyTrash);

  els.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCompanyFilter(button.dataset.filter);
      renderCompanyList();
    });
  });

  els.viewModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCompanyViewMode(button.dataset.viewMode);
    });
  });

  els.actionScopeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActionScope(button.dataset.actionScope);
    });
  });

  document.addEventListener("click", (event) => {
    if (companyDragState.suppressClick) {
      companyDragState.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const switchBranch = event.target.closest("[data-switch-branch]");
    if (switchBranch) { void switchCompanyBranch(switchBranch.dataset.switchBranch); return; }
    const addBranch = event.target.closest("[data-add-company-track]");
    if (addBranch) { void openBranchChooser(addBranch.dataset.addCompanyTrack); return; }
    const newBranch = event.target.closest("[data-new-company-track]");
    if (newBranch) { createCompanyBranch(newBranch.dataset.sourceId, newBranch.dataset.newCompanyTrack); return; }
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

    const restoreButton = event.target.closest("[data-restore-id]");
    if (restoreButton) {
      handleRestoreEntry(restoreButton.dataset.restoreId);
      return;
    }

    const permanentDeleteButton = event.target.closest("[data-permanent-delete-id]");
    if (permanentDeleteButton) {
      handlePermanentDeleteEntry(permanentDeleteButton.dataset.permanentDeleteId);
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
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    const previousUserId = state.session?.user?.id || "";
    const nextUserId = session?.user?.id || "";
    state.session = session;
    if (previousUserId !== nextUserId) {
      clearUserScopedUiState({ loading: Boolean(session) });
      render();
    }
    if (session) {
      const scope = captureUserScope();
      window.setTimeout(() => {
        if (isCurrentUserScope(scope)) void loadCloudData();
      }, 0);
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

function clearUserScopedUiState(options = {}) {
  state.bulkIcons?.controller.abort();
  state.bulkIcons = null;
  state.summerMigration = null;
  state.pendingStatusChanges = new Set();
  if (els.addBranchDialog.open) els.addBranchDialog.close();
  state.userScopeVersion += 1;
  state.entries = [];
  state.templates = [];
  state.loading = Boolean(options.loading);
  state.entrySavePending = false;
  state.detailSavePending = false;
  state.trashDeletePending = false;
  state.filter = "all";
  state.searchQuery = "";
  state.industryFilter = "all";
  state.deadlineFilter = "all";
  state.priorityFilter = "all";
  els.authForm.reset();
  els.companySearchInput.value = "";
  els.deadlineFilterInput.value = "all";
  els.priorityFilterInput.value = "all";
  clearAiImportData();
  closeAiImportDialog(false);
  clearFaqUserScopedUiState();
  resetEntryForm();
  resetTemplateForm();
  if (els.entryDialog.open) els.entryDialog.close();
  if (els.companyDetailDialog.open) closeCompanyDetail();
  if (state.pendingEntryConflict) finishEntryConflict(null);
  if (!els.celebrationOverlay.hidden) closeCelebration();
}

function captureUserScope() {
  return {
    version: state.userScopeVersion,
    userId: state.session?.user?.id || ""
  };
}

function isCurrentUserScope(scope) {
  return Boolean(scope)
    && scope.version === state.userScopeVersion
    && scope.userId === (state.session?.user?.id || "");
}

function clearFaqUserScopedUiState() {
  resetMascotChat();
  els.mascotHelpPanel.hidden = true;
  els.mascot.setAttribute("aria-expanded", "false");
}

function resetMascotChat() {
  state.faqRequestId += 1;
  state.faqHistory = [];
  setFaqPending(false);
  els.mascotHelpInput.value = "";
  els.mascotHelpInput.setCustomValidity("");
  els.mascotHelpLog.textContent = "";
  appendHelpMessage(
    "使い方や就活の悩みを聞かせてね。AIが一緒に考えるよ。続けて質問もできるよ。",
    "assistant"
  );
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

  els.authPasswordInput.value = "";
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

  els.authPasswordInput.value = "";
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
  els.authForm.reset();
  highlightSignInButton(false);
  showToast("ログアウトしました。");
}

function openAiImportDialog(options = {}) {
  updateAiPrivacyPreview();
  renderAiCards();
  setAiImportError("");

  if (typeof els.aiImportDialog.showModal === "function") {
    els.aiImportDialog.showModal();
  } else {
    els.aiImportDialog.setAttribute("open", "");
  }
  const nextResultButton = options.focusResults
    ? els.aiResultList.querySelector("[data-ai-card-index]:not(:disabled)")
    : null;
  (nextResultButton || els.aiMemoInput).focus();
}

function closeAiImportDialog(clearAll = false) {
  if (clearAll) clearAiImportData();
  if (els.aiImportDialog.open) els.aiImportDialog.close();
}

function clearAiImportData() {
  state.aiGenerateRequestId += 1;
  state.aiFileReadRequestId += 1;
  state.aiGeneratePending = false;
  state.aiFileReadPending = false;
  state.aiReturnAfterCelebration = false;
  els.aiMemoInput.value = "";
  els.aiMemoFileInput.value = "";
  els.aiMemoFileName.textContent = "ファイル未選択";
  state.aiCards = [];
  state.aiCsvCards = [];
  state.aiCsvFileCount = 0;
  state.aiLoadedText = "";
  state.aiImportFileNames = [];
  state.aiImportWarnings = [];
  state.aiReviewedConflictKeys.clear();
  setAiImportError("");
  setAiImportNotice("");
  setAiConnectionStatus("オンライン", "connected");
  updateAiGenerateButton();
  updateAiPrivacyPreview();
  renderAiCards();
}

function csvImportCardsWithConflicts(imported) {
  const conflictsByIdentity = new Map();
  imported.mergeConflicts.forEach((conflict) => {
    if (conflict.field === "logoUrl") return;
    const key = aiImportIdentityKey(conflict);
    if (!conflictsByIdentity.has(key)) conflictsByIdentity.set(key, []);
    conflictsByIdentity.get(key).push({
      field: conflict.field,
      existingValue: conflict.existingValue,
      incomingValue: conflict.incomingValue,
      rowNumber: conflict.rowNumber
    });
  });
  return imported.cards.map((card) => {
    const conflictDetails = mergeImportConflictDetails(
      conflictsByIdentity.get(aiImportIdentityKey(card)) || []
    );
    return {
      ...card,
      // CSV is untrusted input. Never turn an imported image URL into an
      // automatic request; users can add a logo URL themselves later.
      logoUrl: "",
      _importConflicts: Array.from(new Set(conflictDetails.map((detail) => detail.field))),
      _importConflictDetails: conflictDetails
    };
  });
}

function csvImportWarningMessages(imported) {
  const warnings = [];
  const ignoredLogoUrlCount = imported.cards.filter((card) => (
    typeof card?.logoUrl === "string" && card.logoUrl.trim()
  )).length + imported.mergeConflicts.filter((conflict) => conflict.field === "logoUrl").length;
  if (ignoredLogoUrlCount) {
    warnings.push(`CSVの企業アイコン画像URL${ignoredLogoUrlCount}件は、自動アクセス防止のため取り込みませんでした。`);
  }
  if (imported.duplicateRows.length) {
    warnings.push(`CSV内の同じ企業・種類${imported.duplicateRows.length}行を1枚にまとめました。`);
  }
  const reviewableMergeConflictCount = imported.mergeConflicts.filter((conflict) => conflict.field !== "logoUrl").length;
  if (reviewableMergeConflictCount) {
    warnings.push(`CSV内で値が異なる項目${reviewableMergeConflictCount}件は、先の行を保持して要確認にしました。`);
  }
  if (imported.ignoredSensitiveColumns.length) {
    warnings.push(`安全のためパスワード関連の列${imported.ignoredSensitiveColumns.length}個を取り込みませんでした。`);
  }
  const maskedSecretFieldCount = (imported.maskedSecretValues || []).reduce((sum, item) => sum + item.fields.length, 0);
  if (maskedSecretFieldCount) {
    warnings.push(`メモなどに含まれていたパスワード・認証情報${maskedSecretFieldCount}項目を伏せ字にしました。`);
  }
  if (imported.ignoredColumns.length) {
    warnings.push(`カード項目に対応しない列${imported.ignoredColumns.length}個を読み飛ばしました。`);
  }
  const missingCompanyRows = imported.skippedRows.filter((row) => row.reason === "missing-company-name").length;
  const unknownTrackRows = imported.skippedRows.filter((row) => row.reason === "unrecognized-track").length;
  if (missingCompanyRows) warnings.push(`企業名がないCSV行${missingCompanyRows}件を読み飛ばしました。`);
  if (unknownTrackRows) warnings.push(`選考区分を判定できないCSV行${unknownTrackRows}件を読み飛ばしました。`);
  const unsafeUrlCount = imported.ignoredUnsafeUrls.reduce((sum, item) => sum + item.fields.length, 0);
  if (unsafeUrlCount) warnings.push(`安全なWeb URLとして確認できない値${unsafeUrlCount}件を取り込みませんでした。`);
  const invalidStatusCount = imported.invalidValues.reduce((sum, item) => (
    sum + item.fields.filter((field) => field === "status").length
  ), 0);
  const invalidScheduleCount = imported.invalidValues.reduce((sum, item) => (
    sum + item.fields.filter((field) => field !== "status").length
  ), 0);
  if (invalidScheduleCount) warnings.push(`日付・日数として読めない値${invalidScheduleCount}件を空欄にして要確認にしました。`);
  if (invalidStatusCount) warnings.push(`状態として判定できない値${invalidStatusCount}件を「気になる」にして要確認にしました。`);
  return warnings;
}

function preserveManualMemoText(currentText, loadedFileText) {
  const current = String(currentText || "");
  const loaded = String(loadedFileText || "");
  if (!loaded) return current;
  if (current === loaded) return "";
  const loadedIndex = current.indexOf(loaded);
  if (loadedIndex < 0) return current;
  const before = current.slice(0, loadedIndex);
  const after = current.slice(loadedIndex + loaded.length);
  const beforeIsBoundary = !before
    || /(?:[ \t]*\r?\n)+$/u.test(before)
    || /(?:^|\r?\n)[ \t]*---[ \t]*\r?\n[ \t]*$/u.test(before);
  const afterIsBoundary = !after
    || /^(?:[ \t]*\r?\n)+/u.test(after)
    || /^[ \t]*\r?\n?[ \t]*---[ \t]*(?:\r?\n|$)/u.test(after);
  if (!beforeIsBoundary || !afterIsBoundary) return current;
  return `${before}\n${after}`
    .replace(/^(?:\s*---\s*)+/u, "")
    .replace(/(?:\s*---\s*)+$/u, "")
    .trim();
}

function mergeLocalMemoIdsIntoCards(cards, extracted = {}) {
  const merged = (Array.isArray(cards) ? cards : []).map((card) => ({
    ...card,
    _importConflicts: Array.isArray(card?._importConflicts) ? [...card._importConflicts] : [],
    _importConflictDetails: Array.isArray(card?._importConflictDetails) ? [...card._importConflictDetails] : []
  }));
  const records = Array.isArray(extracted.records) ? extracted.records : [];
  const companyKey = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s　]+/gu, "").trim();
  let resolvedCount = 0;
  let addedCount = 0;
  let conflictCount = 0;
  let unresolvedCount = Number.isSafeInteger(extracted.unresolvedCount) ? extracted.unresolvedCount : 0;

  records.forEach((record) => {
    const key = companyKey(record?.companyName);
    const mypageId = String(record?.mypageId || "").trim();
    if (!key || !mypageId) {
      unresolvedCount += 1;
      return;
    }
    const companyMatches = merged
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => companyKey(card.companyName) === key);
    const matches = record.trackType
      ? companyMatches.filter(({ card }) => card.trackType === record.trackType)
      : companyMatches;
    if (matches.length !== 1) {
      unresolvedCount += 1;
      return;
    }

    const target = matches[0].card;
    const currentId = String(target.mypageId || "").trim();
    resolvedCount += 1;
    if (!currentId) {
      target.mypageId = mypageId;
      addedCount += 1;
      return;
    }
    if (currentId.normalize("NFKC") === mypageId.normalize("NFKC")) return;
    target._importConflicts = Array.from(new Set([...target._importConflicts, "mypageId"]));
    target._importConflictDetails = mergeImportConflictDetails(target._importConflictDetails, [{
      field: "mypageId",
      existingValue: currentId,
      incomingValue: mypageId
    }]);
    conflictCount += 1;
  });

  return { cards: merged, resolvedCount, addedCount, conflictCount, unresolvedCount };
}

async function handleAiMemoFile(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  const fileReadRequestId = ++state.aiFileReadRequestId;
  state.aiFileReadPending = true;
  updateAiGenerateButton();
  const previousMemo = els.aiMemoInput.value;
  const previousFileName = els.aiMemoFileName.textContent;
  const previousCsvCards = state.aiCsvCards;
  const previousCsvFileCount = state.aiCsvFileCount;
  const previousAiCards = state.aiCards;
  const previousLoadedText = state.aiLoadedText;
  const previousImportFileNames = state.aiImportFileNames;
  const previousWarnings = state.aiImportWarnings;
  state.aiCards = [];
  els.aiMemoFileName.textContent = `選択した${files.length}件を安全に読み込み中...`;
  renderAiCards();
  const allowedExtensions = new Set([".txt", ".md", ".csv"]);
  const allowedMimeTypes = new Set([
    "", "text/plain", "text/markdown", "text/x-markdown", "text/csv", "application/csv",
    "application/vnd.ms-excel", "application/octet-stream"
  ]);

  try {
    if (!localAi?.decodeMemoBytes || !localCsv?.importCsv) {
      throw new Error("安全なファイル読込処理を読み込めませんでした。画面を再読み込みしてください。");
    }
    if (files.length > 20) throw new Error("一度に選べるファイルは20個までです。");
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > 2 * 1024 * 1024) throw new Error("選んだファイルの合計を2MB以下にしてください。");

    const textParts = [];
    const csvCards = [];
    const warnings = [];
    const encodingWarnings = [];
    let csvFileCount = 0;
    let textFileCount = 0;
    let csvDataRows = 0;

    for (const file of files) {
      const extension = file.name.toLowerCase().match(/\.[^.]+$/u)?.[0] || "";
      const mimeType = String(file.type || "").toLowerCase();
      if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(mimeType)) {
        throw new Error("TXT・Markdown・CSVだけを選んでください。ファイル名だけを変更した形式は読み込めません。");
      }
      if (file.size > 512 * 1024) {
        throw new Error(`${file.name} が大きすぎます。1ファイル512KB以下にしてください。`);
      }

      const decoded = localAi.decodeMemoBytes(await file.arrayBuffer());
      if (fileReadRequestId !== state.aiFileReadRequestId) return;
      if (decoded.encoding !== "utf-8") encodingWarnings.push(decoded.warning.replace(/。$/u, ""));
      const csvMimeType = new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]);
      const shouldUseCsvParser = extension === ".csv"
        || csvMimeType.has(mimeType)
        || localCsv.looksLikeCsv(decoded.text);
      if (shouldUseCsvParser) {
        const imported = localCsv.importCsv(decoded.text, {
          maxInputChars: 600000,
          maxRows: 501,
          maxColumns: 80,
          maxFieldChars: 12000
        });
        csvFileCount += 1;
        csvDataRows += imported.dataRowCount;
        csvCards.push(...csvImportCardsWithConflicts(imported));
        warnings.push(...csvImportWarningMessages(imported));
      } else {
        textFileCount += 1;
        if (decoded.text.trim()) textParts.push(decoded.text.trim());
      }
    }

    if (fileReadRequestId !== state.aiFileReadRequestId) return;
    const selectedText = textParts.join("\n\n---\n\n");
    const manualText = preserveManualMemoText(previousMemo, previousLoadedText);
    const removedPreviousFileText = !textParts.length
      && Boolean(previousLoadedText)
      && previousMemo.includes(previousLoadedText)
      && !manualText.includes(previousLoadedText);
    const retainedEditedFileText = !textParts.length && Boolean(previousLoadedText) && !removedPreviousFileText;
    const text = textParts.length
      ? [selectedText, manualText].filter(Boolean).join("\n\n---\n\n")
      : manualText;
    if (removedPreviousFileText) warnings.push("前回ファイルから読み込んだTXTは今回の取込対象から外しました。");
    if (retainedEditedFileText) warnings.push("編集された前回TXTは、手入力メモとして残しました。");
    const maxLength = localAi.maxMemoChars || 12000;
    if (countAiCharacters(text) > maxLength) {
      throw new Error(`TXTの合計は${maxLength.toLocaleString("ja-JP")}文字以内にしてください。内容を分けてお試しください。`);
    }
    const analysis = localAi.deriveMemoBlocks(text);
    const candidateCount = countAiCandidateSections(analysis);
    if (candidateCount > (localAi.maxCards || 12)) {
      throw new Error(`TXT内の会社・選考候補が${candidateCount}件あります。AIで一度に整理できるのは${localAi.maxCards || 12}件までです。`);
    }
    const mergedCsvCards = consolidateAiImportCards(csvCards);
    if (mergedCsvCards.length > 200) throw new Error("CSVから作れるカードは一度に200件までです。CSVを分けてください。");

    els.aiMemoInput.value = text;
    state.aiGenerateRequestId += 1;
    state.aiGeneratePending = false;
    state.aiCards = [];
    state.aiCsvCards = mergedCsvCards;
    state.aiCsvFileCount = csvFileCount;
    state.aiLoadedText = textParts.length ? selectedText : "";
    state.aiImportFileNames = files.map((file) => file.name);
    state.aiImportWarnings = Array.from(new Set(warnings));
    state.aiReviewedConflictKeys.clear();
    const details = [
      textFileCount ? `TXT ${textFileCount}件` : "",
      csvFileCount ? `CSV ${csvFileCount}件・${csvDataRows}行から${mergedCsvCards.length}カード` : "",
      !textFileCount && text ? "貼り付けメモあり" : "",
      encodingWarnings.length ? "文字コードを自動判定" : ""
    ].filter(Boolean);
    const visibleNames = state.aiImportFileNames.slice(0, 4).join("、");
    const hiddenNameCount = Math.max(0, state.aiImportFileNames.length - 4);
    els.aiMemoFileName.textContent = `${visibleNames}${hiddenNameCount ? `、ほか${hiddenNameCount}件` : ""}${details.length ? `（${details.join("・")}）` : ""}`;
    setAiImportError("");
    const noticeParts = [];
    if (csvFileCount) noticeParts.push("CSVは端末内だけで解析し、AIへ送信しません。");
    noticeParts.push(...state.aiImportWarnings);
    setAiImportNotice(noticeParts.join(" "));
    setAiConnectionStatus(text ? "TXTは送信前です" : "CSVは端末内で準備完了", "connected");
    updateAiPrivacyPreview();
    updateAiGenerateButton();
    renderAiCards();
  } catch (error) {
    if (fileReadRequestId !== state.aiFileReadRequestId) return;
    els.aiMemoInput.value = previousMemo;
    els.aiMemoFileName.textContent = previousFileName;
    state.aiCsvCards = previousCsvCards;
    state.aiCsvFileCount = previousCsvFileCount;
    state.aiCards = previousAiCards;
    state.aiLoadedText = previousLoadedText;
    state.aiImportFileNames = previousImportFileNames;
    state.aiImportWarnings = previousWarnings;
    event.target.value = "";
    setAiImportError(error?.message || "ファイルを読み込めませんでした。CSVまたはTXTとして保存し直してください。");
    updateAiPrivacyPreview();
  } finally {
    if (fileReadRequestId === state.aiFileReadRequestId) {
      state.aiFileReadPending = false;
      updateAiGenerateButton();
    }
  }
}

function countAiCharacters(value) {
  return typeof localAi?.countCharacters === "function"
    ? localAi.countCharacters(value)
    : Array.from(String(value || "")).length;
}

function countAiCandidateSections(analysis) {
  if (typeof localAi?.countMemoCardCandidates === "function") {
    return localAi.countMemoCardCandidates(analysis);
  }
  const blocks = Array.isArray(analysis?.blocks) ? analysis.blocks : [];
  const identities = new Set();
  let unidentifiedCount = 0;

  blocks.forEach((block) => {
    const company = extractAiBlockCompany(block);
    if (!company) {
      unidentifiedCount += 1;
      return;
    }
    identities.add(`${normalizeAiCompanyKey(company)}\u0000${detectAiBlockTrack(block?.text)}`);
  });

  return identities.size + unidentifiedCount;
}

function extractAiBlockCompany(block) {
  const lines = String(block?.text || "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";

  if (block?.reason === "table-row") {
    const tableLines = lines.filter((line) => line.includes("\t"));
    const header = tableLines[0]?.split("\t").map((cell) => cell.trim()) || [];
    const companyIndex = header.findIndex((cell) => /^(?:会社名|企業名|社名)$/u.test(cell.normalize("NFKC")));
    const row = tableLines[1]?.split("\t").map((cell) => cell.trim()) || [];
    if (companyIndex >= 0 && row[companyIndex]) return stripAiTrackSuffix(row[companyIndex]);
  }

  const explicit = lines.find((line) => /^\s*(?:会社名|企業名|社名|company)\s*[：:]/iu.test(line));
  if (explicit) {
    return stripAiTrackSuffix(explicit.replace(/^\s*(?:会社名|企業名|社名|company)\s*[：:]\s*/iu, ""));
  }

  const headingPatterns = {
    "markdown-heading": /^#{1,6}\s+/u,
    "decorated-heading": /^(?:\d+(?:[.)、])?\s*)?(?:[■◆●]|[【\[])/u,
    "company-name-line": /(?:株式会社|有限会社|合同会社|合資会社|\((?:株|有)\)|ホールディングス|銀行|証券|生命|損保|商事|Inc\.?|Ltd\.?|Corp\.?)/iu
  };
  const headingPattern = headingPatterns[block?.reason];
  if (!headingPattern) return "";
  const headingLine = lines.find((line) => headingPattern.test(line.normalize("NFKC")));
  if (!headingLine) return "";

  const heading = headingLine
    .normalize("NFKC")
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^(?:\d+(?:[.)、])?\s*)?[■◆●]\s*/u, "")
    .replace(/^(?:\d+(?:[.)、])?\s*)?[【\[](.+)[】\]]$/u, "$1")
    .trim();
  return stripAiTrackSuffix(heading);
}

function stripAiTrackSuffix(value) {
  return String(value || "")
    .trim()
    .replace(/\s*[（(【\[]\s*(?:(?:夏(?:季)?|冬(?:季)?|サマー|ウィンター)?\s*インターン|早期選考|本選考|説明会|面談|OB\s*\/\s*OG訪問)\s*[）)】\]]\s*$/iu, "")
    .replace(/\s*[-‐–—|｜/：:]\s*(?:(?:夏(?:季)?|冬(?:季)?|サマー|ウィンター)?\s*インターン|早期選考|本選考|説明会|面談|OB\s*\/\s*OG訪問)\s*$/iu, "")
    .trim();
}

function normalizeAiCompanyKey(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s　]+/gu, "").trim();
}

function detectAiBlockTrack(value) {
  const text = String(value || "").normalize("NFKC");
  if (/OB\s*\/\s*OG訪問/iu.test(text)) return "OB/OG訪問";
  if (/早期選考/u.test(text)) return "早期選考";
  if (/(?:夏(?:季)?|サマー|summer)\s*(?:の)?\s*(?:インターン|intern)/iu.test(text)) return "夏インターン";
  if (/(?:冬(?:季)?|ウィンター|winter)\s*(?:の)?\s*(?:インターン|intern)/iu.test(text)) return "冬インターン";
  if (/インターン/u.test(text)) return "インターン";
  if (/説明会/u.test(text)) return "説明会";
  if (/面談/u.test(text)) return "面談";
  return "本選考";
}

function updateAiPrivacyPreview() {
  if (!localAi) {
    els.aiPrivacySummary.textContent = "安全処理を読み込めませんでした。画面を再読み込みしてください。";
    els.aiRedactedPreview.textContent = "安全処理を読み込めませんでした。";
    return;
  }

  const source = els.aiMemoInput.value;
  if (source.trim() && localCsv?.looksLikeCsv(source)) {
    els.aiPrivacySummary.textContent = "CSV形式を検出しました。内容はAIへ送らず、端末内だけで解析します。";
    els.aiRedactedPreview.textContent = "CSVのセル内容は安全のためここには表示しません。";
    return;
  }

  const result = localAi.redactSensitiveMemo(source);
  const csvSummary = state.aiCsvCards.length
    ? ` CSVの${state.aiCsvCards.length}カード分はAIへ送らず、端末内で統合します。`
    : "";
  const textSummary = source.trim()
    ? localAi.privacySummary(result)
    : "TXTを入れると、AIに送る前に隠す情報を確認できます。";
  els.aiPrivacySummary.textContent = `${textSummary}${csvSummary}`;
  els.aiRedactedPreview.textContent = result.text.trim() || (state.aiCsvCards.length
    ? "TXTはありません。CSVはAIへ送信しません。"
    : "まだ文章がありません。");
}

async function handleAiGenerate(event) {
  event.preventDefault();
  if (state.aiGeneratePending || state.aiFileReadPending) return;
  if (!localAi || !localCsv) {
    setAiImportError("安全処理を読み込めませんでした。画面を再読み込みしてください。");
    return;
  }

  let source = els.aiMemoInput.value.trim();
  if (source && localCsv.looksLikeCsv(source)) {
    try {
      const imported = localCsv.importCsv(source, {
        maxInputChars: 600000,
        maxRows: 501,
        maxColumns: 80,
        maxFieldChars: 12000
      });
      const importedCards = csvImportCardsWithConflicts(imported);
      const importWarnings = csvImportWarningMessages(imported);
      if (!importedCards.length) {
        throw new Error(["企業名と選考区分を確認できる行がありません。", ...importWarnings].join(" "));
      }
      state.aiCsvCards = consolidateAiImportCards([
        ...state.aiCsvCards,
        ...importedCards
      ]);
      state.aiCsvFileCount += 1;
      state.aiImportWarnings = Array.from(new Set([
        ...state.aiImportWarnings,
        ...importWarnings
      ]));
      els.aiMemoInput.value = "";
      state.aiLoadedText = "";
      source = "";
      setAiImportNotice([
        "貼り付けたCSVは端末内だけで解析し、AIへ送信しません。",
        ...state.aiImportWarnings
      ].join(" "));
      updateAiPrivacyPreview();
      updateAiGenerateButton();
    } catch (error) {
      setAiImportError(`貼り付けた内容はCSVとして検出しましたが、安全に読み込めませんでした。${error.message}`);
      return;
    }
  }

  const hasCsvCards = state.aiCsvCards.length > 0;
  if (!source && !hasCsvCards) {
    setAiImportError("TXT・CSVを選ぶか、メモを貼り付けてください。");
    els.aiMemoInput.focus();
    return;
  }

  let redactedText = "";
  let localMemoCredentials = { records: [], unresolvedCount: 0, detectedCount: 0 };
  if (source) {
    const accessToken = state.session?.access_token;
    if (!accessToken) {
      setAiImportError("TXTをAIで整理するにはログインしてください。CSVだけならログイン前でも端末内でカード案を確認できます。");
      return;
    }
    if (countAiCharacters(source) > localAi.maxMemoChars) {
      setAiImportError(`TXTは${localAi.maxMemoChars.toLocaleString("ja-JP")}文字以内にしてください。内容を分けてお試しください。`);
      return;
    }

    let normalizedSource;
    try {
      normalizedSource = localAi.normalizeMemoText(source);
    } catch (error) {
      setAiImportError(error.message);
      return;
    }

    const analysis = localAi.deriveMemoBlocks(normalizedSource);
    const candidateCount = countAiCandidateSections(analysis);
    if (candidateCount > localAi.maxCards) {
      setAiImportError(`TXT内の会社・選考候補が${candidateCount}件あります。一度にAIで整理できるのは${localAi.maxCards}件までです。`);
      return;
    }

    if (typeof localAi.extractLocalCredentialRecords === "function") {
      localMemoCredentials = localAi.extractLocalCredentialRecords(analysis);
    }

    const redacted = localAi.redactSensitiveMemo(normalizedSource);
    if (!redacted.text.trim()) {
      setAiImportError("個人情報を隠すと整理できる文章が残りませんでした。企業名や締切などだけにしてお試しください。");
      return;
    }
    redactedText = redacted.text;
  }

  const requestId = ++state.aiGenerateRequestId;
  state.aiGeneratePending = true;
  state.aiCards = [];
  updateAiGenerateButton();
  renderAiCards();
  setAiImportError("");
  setAiConnectionStatus(source ? "TXTをオンラインで整理中..." : "CSVを端末内で整理中...", "checking");

  try {
    const aiCards = source
      ? await localAi.generateCards(redactedText, { accessToken: state.session.access_token })
      : [];
    if (requestId !== state.aiGenerateRequestId) return;
    const consolidatedCards = consolidateAiImportCards([...state.aiCsvCards, ...aiCards]);
    const localIdMerge = mergeLocalMemoIdsIntoCards(consolidatedCards, localMemoCredentials);
    state.aiCards = localIdMerge.cards;
    if (source && localMemoCredentials.detectedCount) {
      const credentialNotices = [
        localIdMerge.addedCount ? `TXT内のマイページID ${localIdMerge.addedCount}件を端末内だけでカード案へ追加しました。` : "",
        localIdMerge.conflictCount ? `IDが異なる${localIdMerge.conflictCount}件は自動上書きせず要確認にしました。` : "",
        localIdMerge.unresolvedCount ? `会社を安全に特定できないID ${localIdMerge.unresolvedCount}件は自動追加しませんでした。` : ""
      ].filter(Boolean);
      setAiImportNotice([...state.aiImportWarnings, ...credentialNotices].join(" "));
    }
    if (state.aiCards.length) {
      setAiConnectionStatus(source ? "接続OK" : "端末内で解析済み", "connected");
      showToast(`${state.aiCards.length}件のカード案を作りました。`);
    } else {
      setAiImportError("企業名を含むカード案を作れませんでした。CSVの企業名列やTXTの会社名を確認してください。");
    }
  } catch (error) {
    if (requestId !== state.aiGenerateRequestId) return;
    setAiConnectionStatus("接続できません", "error");
    setAiImportError(error.message);
  } finally {
    if (requestId === state.aiGenerateRequestId) {
      state.aiGeneratePending = false;
      updateAiGenerateButton();
      renderAiCards();
    }
  }
}

function updateAiGenerateButton() {
  const busy = state.aiGeneratePending || state.aiFileReadPending;
  const pastedCsv = Boolean(els.aiMemoInput.value.trim() && localCsv?.looksLikeCsv(els.aiMemoInput.value));
  els.generateAiCardsButton.disabled = busy;
  els.selectAiMemoFileButton.disabled = busy;
  els.aiMemoInput.readOnly = busy;
  els.aiImportForm.setAttribute("aria-busy", String(busy));
  if (state.aiFileReadPending) {
    els.generateAiCardsButton.textContent = "ファイルを安全に読込中...";
  } else if (state.aiGeneratePending) {
    els.generateAiCardsButton.textContent = "情報を統合中...";
  } else if (pastedCsv && state.aiCsvCards.length) {
    els.generateAiCardsButton.textContent = "貼り付けCSVと選択済みCSVを統合する";
  } else if (pastedCsv) {
    els.generateAiCardsButton.textContent = "貼り付けCSVからカード案を作る";
  } else if (state.aiCsvCards.length && els.aiMemoInput.value.trim()) {
    els.generateAiCardsButton.textContent = "CSVとTXTを統合する";
  } else if (state.aiCsvCards.length) {
    els.generateAiCardsButton.textContent = "CSVからカード案を作る";
  } else {
    els.generateAiCardsButton.textContent = "個人情報を隠してカード案を作る";
  }
}

function setAiConnectionStatus(message, tone) {
  els.aiConnectionStatus.textContent = message;
  els.aiConnectionStatus.classList.toggle("connected", tone === "connected");
  els.aiConnectionStatus.classList.toggle("error", tone === "error");
  els.aiConnectionStatus.classList.toggle("checking", tone === "checking");
}

function setAiImportError(message) {
  els.aiImportError.textContent = message;
  els.aiImportError.hidden = !message;
}

function setAiImportNotice(message) {
  if (!els.aiImportNotice) return;
  els.aiImportNotice.textContent = message;
  els.aiImportNotice.hidden = !message;
}

const importFieldLabels = {
  industry: "業種",
  mypageId: "マイページID",
  officialUrl: "企業公式サイト",
  logoUrl: "企業アイコン",
  status: "現在の状況",
  deadline: "締切日",
  eventDate: "次の予定日",
  eventType: "予定の内容",
  priority: "志望度",
  mypageUrl: "企業マイページ",
  esItems: "ES",
  interviewNotes: "面接対策メモ",
  memo: "その他メモ"
};

function aiImportIdentityKey(entry) {
  if (typeof localCsv?.cardIdentityKey === "function") return localCsv.cardIdentityKey(entry);
  const company = String(entry?.companyName || "").normalize("NFKC").toLowerCase().replace(/[\s　]+/gu, "").trim();
  return company ? `${company}\u0000${entry?.trackType || "本選考"}` : "";
}

function consolidateAiImportCards(cards) {
  const mergedCards = [];
  const indexes = new Map();

  (Array.isArray(cards) ? cards : []).forEach((rawCard) => {
    if (!rawCard || typeof rawCard !== "object") return;
    const safeRawCard = {
      ...rawCard,
      logoUrl: "",
      _importConflicts: Array.isArray(rawCard._importConflicts)
        ? rawCard._importConflicts.filter((field) => field !== "logoUrl")
        : [],
      _importConflictDetails: Array.isArray(rawCard._importConflictDetails)
        ? rawCard._importConflictDetails.filter((detail) => detail?.field !== "logoUrl")
        : []
    };
    const key = aiImportIdentityKey(safeRawCard);
    if (!key) return;
    if (!indexes.has(key)) {
      const normalized = normalizeEntry(safeRawCard);
      normalized.esItems = normalizeEsItems(safeRawCard.esItems, safeRawCard.esContent);
      normalized.esContent = esItemsToLegacyText(normalized.esItems);
      normalized._importConflicts = [...safeRawCard._importConflicts];
      normalized._importConflictDetails = mergeImportConflictDetails(safeRawCard._importConflictDetails);
      indexes.set(key, mergedCards.length);
      mergedCards.push(normalized);
      return;
    }

    const index = indexes.get(key);
    const result = mergeImportedEntry(mergedCards[index], safeRawCard);
    result.entry._importConflicts = Array.from(new Set([
      ...(mergedCards[index]._importConflicts || []),
      ...safeRawCard._importConflicts,
      ...result.conflicts
    ]));
    result.entry._importConflictDetails = mergeImportConflictDetails(
      mergedCards[index]._importConflictDetails,
      safeRawCard._importConflictDetails,
      result.conflictDetails
    );
    mergedCards[index] = result.entry;
  });

  return mergedCards;
}

function mergeImportedEntry(existingEntry, incomingEntry, options = {}) {
  const merged = normalizeEntry(existingEntry);
  const addedFields = [];
  const conflicts = [];
  const conflictDetails = [];
  const hadExistingEventDate = Boolean(String(existingEntry?.eventDate || "").trim());
  const hasIncomingEventDate = Boolean(String(incomingEntry?.eventDate || "").trim());
  const scalarFields = [
    "industry", "mypageId", "officialUrl", "logoUrl", "deadline", "eventDate", "mypageUrl"
  ];

  scalarFields.forEach((field) => {
    mergeImportedScalar(merged, incomingEntry, field, addedFields, conflicts, conflictDetails);
  });
  mergeImportedScalar(merged, incomingEntry, "eventType", addedFields, conflicts, conflictDetails, {
    incomingMissing: (value) => !value || !hasIncomingEventDate,
    existingMissing: (value) => !value || !hadExistingEventDate
  });

  mergeImportedScalar(merged, incomingEntry, "status", addedFields, conflicts, conflictDetails, {
    incomingMissing: (value) => !value || value === "気になる",
    existingMissing: (value) => !value || value === "気になる"
  });
  mergeImportedScalar(merged, incomingEntry, "priority", addedFields, conflicts, conflictDetails, {
    incomingMissing: (value) => !value || value === "未定",
    existingMissing: (value) => !value || value === "未定"
  });

  const esMerge = mergeImportedEsItems(merged, incomingEntry);
  if (esMerge.addedCount) {
    merged.esItems = esMerge.items;
    merged.esContent = esItemsToLegacyText(esMerge.items);
    addedFields.push("esItems");
  }

  const textLimit = Number.isFinite(options.textLimit) ? options.textLimit : 6000;
  for (const field of ["interviewNotes", "memo"]) {
    const textMerge = mergeImportedText(merged[field], incomingEntry?.[field], textLimit);
    if (textMerge.addedCount) {
      merged[field] = textMerge.value;
      addedFields.push(field);
    }
    if (textMerge.truncated) {
      conflicts.push(field);
      conflictDetails.push({
        field,
        existingValue: merged[field],
        incomingValue: String(incomingEntry?.[field] || "").trim()
      });
    }
  }

  return {
    entry: normalizeEntry(merged),
    addedFields: Array.from(new Set(addedFields)),
    conflicts: Array.from(new Set(conflicts)),
    conflictDetails,
    hasChanges: addedFields.length > 0
  };
}

function mergeImportedScalar(target, source, field, addedFields, conflicts, conflictDetails, options = {}) {
  const incoming = String(source?.[field] ?? "").trim();
  const existing = String(target?.[field] ?? "").trim();
  const incomingMissing = options.incomingMissing || ((value) => !value);
  const existingMissing = options.existingMissing || ((value) => !value);
  if (incomingMissing(incoming)) return;
  if (existingMissing(existing)) {
    target[field] = incoming;
    addedFields.push(field);
    return;
  }
  if (normalizeAiImportText(existing) !== normalizeAiImportText(incoming)) {
    conflicts.push(field);
    conflictDetails.push({ field, existingValue: existing, incomingValue: incoming });
  }
}

function mergeImportedText(existingValue, incomingValue, maxCharacters) {
  const existing = String(existingValue || "").trim();
  const incomingLines = String(incomingValue || "")
    .replace(/\r\n?/gu, "\n")
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set(existing.split(/\n+/u).map(normalizeAiImportText).filter(Boolean));
  const additions = [];
  let value = existing;
  let truncated = false;

  incomingLines.forEach((line) => {
    const key = normalizeAiImportText(line);
    if (!key || seen.has(key)) return;
    const candidate = [value, line].filter(Boolean).join("\n");
    if (Array.from(candidate).length > maxCharacters) {
      truncated = true;
      return;
    }
    seen.add(key);
    additions.push(line);
    value = candidate;
  });

  return { value, addedCount: additions.length, truncated };
}

function mergeImportedEsItems(existingEntry, incomingEntry) {
  const merged = normalizeEsItems(existingEntry?.esItems, existingEntry?.esContent)
    .map((item) => cloneEntryFieldValue(item));
  const incoming = normalizeEsItems(incomingEntry?.esItems, incomingEntry?.esContent);
  const indexes = new Map();
  merged.forEach((item, index) => indexes.set(normalizeAiImportText(item.question) || "__questionless__", index));
  let addedCount = 0;

  incoming.forEach((item) => {
    const key = normalizeAiImportText(item.question) || "__questionless__";
    if (!indexes.has(key)) {
      indexes.set(key, merged.length);
      merged.push(cloneEntryFieldValue(item));
      addedCount += 1;
      return;
    }

    const target = merged[indexes.get(key)];
    const variantKeys = new Set(target.variants.map((variant) => (
      `${normalizeAiImportText(variant.label)}\u0000${normalizeAiImportText(variant.answer)}`
    )));
    item.variants.forEach((variant) => {
      const variantKey = `${normalizeAiImportText(variant.label)}\u0000${normalizeAiImportText(variant.answer)}`;
      if (variantKeys.has(variantKey)) return;
      variantKeys.add(variantKey);
      target.variants.push(cloneEntryFieldValue(variant));
      addedCount += 1;
    });
  });

  return { items: merged, addedCount };
}

function normalizeAiImportText(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s　]+/gu, "").trim();
}

function importConflictValueKey(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value).normalize("NFKC").trim();
}

function mergeImportConflictDetails(...groups) {
  const details = [];
  const seen = new Set();
  groups.flatMap((group) => (Array.isArray(group) ? group : [])).forEach((detail) => {
    const field = String(detail?.field || "").trim();
    if (!field) return;
    const normalized = {
      field,
      existingValue: detail.existingValue ?? "",
      incomingValue: detail.incomingValue ?? "",
      ...(Number.isFinite(detail.rowNumber) ? { rowNumber: detail.rowNumber } : {})
    };
    const signature = [
      field,
      importConflictValueKey(normalized.existingValue),
      importConflictValueKey(normalized.incomingValue)
    ].join("\u0000");
    if (seen.has(signature)) return;
    seen.add(signature);
    details.push(normalized);
  });
  return details;
}

function aiConflictReviewKey(card, conflicts = [], conflictDetails = [], existingEntry = null) {
  const identity = aiImportIdentityKey(card);
  const fields = Array.from(new Set([
    ...(Array.isArray(conflicts) ? conflicts : []),
    ...mergeImportConflictDetails(conflictDetails).map((detail) => detail.field)
  ].filter(Boolean))).sort();
  if (!identity || !fields.length) return "";
  const details = mergeImportConflictDetails(conflictDetails);
  const importedValues = fields.map((field) => ({
    field,
    cardValue: importConflictValueKey(card?.[field]),
    existingValue: importConflictValueKey(existingEntry?.[field]),
    alternatives: details
      .filter((detail) => detail.field === field)
      .map((detail) => importConflictValueKey(detail.incomingValue))
      .sort()
  }));
  return `${identity}\u0001${JSON.stringify(importedValues)}`;
}

function buildAiImportPlan(card) {
  const key = aiImportIdentityKey(card);
  const matches = key ? state.entries.filter((entry) => aiImportIdentityKey(entry) === key) : [];
  const internalConflicts = Array.isArray(card?._importConflicts) ? card._importConflicts : [];
  const internalConflictDetails = mergeImportConflictDetails(card?._importConflictDetails);
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      card,
      conflicts: internalConflicts,
      conflictDetails: internalConflictDetails
    };
  }
  if (matches.length === 1 && isTrashed(matches[0])) {
    return {
      kind: "trashed",
      card,
      existing: matches[0],
      conflicts: internalConflicts,
      conflictDetails: internalConflictDetails
    };
  }
  if (matches.length === 1) {
    const merge = mergeImportedEntry(matches[0], card);
    const conflicts = Array.from(new Set([...internalConflicts, ...merge.conflicts]));
    const conflictDetails = mergeImportConflictDetails(internalConflictDetails, merge.conflictDetails);
    const reviewKey = aiConflictReviewKey(card, conflicts, internalConflictDetails, matches[0]);
    const conflictsReviewed = Boolean(reviewKey && state.aiReviewedConflictKeys?.has?.(reviewKey));
    return {
      kind: merge.hasChanges ? "existing" : conflicts.length && !conflictsReviewed ? "conflict" : "unchanged",
      card,
      existing: matches[0],
      merged: merge.entry,
      addedFields: merge.addedFields,
      conflicts: conflictsReviewed ? [] : conflicts,
      conflictDetails: conflictsReviewed ? [] : conflictDetails,
      reviewKey,
      conflictsReviewed
    };
  }
  return {
    kind: "new",
    card,
    conflicts: internalConflicts,
    conflictDetails: internalConflictDetails,
    reviewKey: aiConflictReviewKey(card, internalConflicts, internalConflictDetails),
    addedFields: []
  };
}

function renderAiCards() {
  if (state.aiGeneratePending) {
    els.aiResultStatus.textContent = "情報を整理しています。";
    els.aiResultList.innerHTML = '<div class="ai-loading-card"><span aria-hidden="true"></span><strong>メモを企業ごとに整理しています</strong><p>通常は数秒から数十秒ほどかかります。</p></div>';
    return;
  }
  if (!state.aiCards.length) {
    els.aiResultStatus.textContent = "";
    els.aiResultList.textContent = "";
    return;
  }

  const plans = state.aiCards.map(buildAiImportPlan);
  const newCount = plans.filter((plan) => plan.kind === "new").length;
  const updateCount = plans.filter((plan) => plan.kind === "existing").length;
  const unchangedCount = plans.filter((plan) => plan.kind === "unchanged").length;
  const conflictCount = plans.filter((plan) => plan.kind === "conflict").length;
  const trashCount = plans.filter((plan) => plan.kind === "trashed").length;
  const ambiguousCount = plans.filter((plan) => plan.kind === "ambiguous").length;
  const summary = [
    newCount ? `新規 ${newCount}件` : "",
    updateCount ? `既存へ追加 ${updateCount}件` : "",
    conflictCount ? `値の違いを確認 ${conflictCount}件` : "",
    unchangedCount ? `追加なし ${unchangedCount}件` : "",
    trashCount ? `ゴミ箱に一致 ${trashCount}件` : "",
    ambiguousCount ? `重複あり ${ambiguousCount}件` : ""
  ].filter(Boolean).join("・");
  els.aiResultStatus.textContent = `${state.aiCards.length}件のカード案。${summary || "内容を確認してください。"}`;

  els.aiResultList.innerHTML = `
    <div class="ai-result-heading">
      <div><strong>${state.aiCards.length}件のカード案</strong><span>${escapeHtml(summary || "入力画面で内容を確認できます。")}</span></div>
      <span class="ai-review-badge">確認待ち</span>
    </div>
    ${state.aiCards.map((card, index) => aiCardMarkup(card, index, plans[index])).join("")}
  `;
}

function aiCardMarkup(card, index, plan = buildAiImportPlan(card)) {
  const meta = [
    card.trackType,
    simpleStatus(card.status),
    card.deadline ? `締切 ${formatDate(card.deadline)}` : "",
    card.priority && card.priority !== "未定" ? `志望度 ${card.priority}` : ""
  ].filter(Boolean);
  const esItems = Array.isArray(card.esItems) ? card.esItems : [];
  const notes = [esItems.length ? "" : card.esContent, card.interviewNotes, card.memo].filter(Boolean).join("\n");
  const esPreview = esItems.length
    ? `<div class="ai-es-preview"><strong>ES ${esItems.length}問に分割</strong><ul>${esItems.map((item, itemIndex) => {
        const question = String(item.question || "").trim() || `質問 ${itemIndex + 1}`;
        return `<li>${escapeHtml(question)}</li>`;
      }).join("")}</ul></div>`
    : "";
  const planLabels = {
    new: plan.conflicts?.length ? "要確認・新規" : "新規カード",
    existing: "既存カードに追加",
    conflict: "既存値と相違あり",
    unchanged: "登録済み・追加なし",
    trashed: "ゴミ箱に登録済み",
    ambiguous: "重複カードあり"
  };
  const buttonLabels = {
    new: "入力画面で確認",
    existing: "追加内容を確認",
    conflict: "違いを見ながら編集",
    unchanged: "追加情報なし",
    trashed: "先にゴミ箱から復元",
    ambiguous: "先に重複を整理"
  };
  const addedLabels = (plan.addedFields || []).map((field) => importFieldLabels[field]).filter(Boolean);
  const conflictLabels = Array.from(new Set((plan.conflicts || []).map((field) => importFieldLabels[field] || "CSV内の異なる値")));
  const conflictDetailMarkup = importConflictDetailsMarkup(plan.conflictDetails);
  const disabled = ["unchanged", "trashed", "ambiguous"].includes(plan.kind);

  return `
    <article class="ai-result-card ai-result-${escapeAttribute(plan.kind)}">
      <div class="ai-result-card-main">
        <div class="ai-result-card-title">
          <strong>${escapeHtml(card.companyName)}</strong>
          <span class="ai-import-plan-badge ${escapeAttribute(plan.kind)}">${escapeHtml(planLabels[plan.kind] || "要確認")}</span>
        </div>
        <div class="ai-result-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
        ${addedLabels.length ? `<p class="ai-import-diff">追加する項目: ${escapeHtml(addedLabels.join("・"))}</p>` : ""}
        ${conflictLabels.length ? `<p class="ai-import-conflict">先に見つかった値を保持・要確認: ${escapeHtml(conflictLabels.join("・"))}</p>` : ""}
        ${conflictDetailMarkup}
        ${esPreview}
        ${notes ? `<p>${escapeHtml(notes.slice(0, 260))}${notes.length > 260 ? "…" : ""}</p>` : esItems.length ? "" : '<p class="ai-empty-note">メモ欄は空です。</p>'}
      </div>
      <button class="primary-button" data-ai-card-index="${index}" type="button" aria-label="${escapeAttribute(`${card.companyName}の${buttonLabels[plan.kind] || "入力画面で確認"}`)}" ${disabled ? "disabled" : ""}>${escapeHtml(buttonLabels[plan.kind] || "入力画面で確認")}</button>
    </article>
  `;
}

function importConflictDetailsMarkup(details, options = {}) {
  if (!Array.isArray(details) || !details.length) return "";
  const sensitiveFields = new Set(["mypageId", "officialUrl", "logoUrl", "mypageUrl"]);
  const editableFields = new Set([
    "mypageId", "officialUrl", "logoUrl", "status", "deadline",
    "priority", "mypageUrl", "memo"
  ]);
  const items = details.map((detail, index) => {
    const label = importFieldLabels[detail.field] || detail.field;
    if (!options.embedded && sensitiveFields.has(detail.field)) {
      return `<li><strong>${escapeHtml(label)}</strong>: 値は確認画面の中だけで表示します。</li>`;
    }
    const existingValue = String(detail.existingValue || "未入力");
    const incomingValue = String(detail.incomingValue || "未入力");
    const action = options.embedded && editableFields.has(detail.field)
      ? `<button class="secondary-button import-conflict-use-button" type="button" data-import-conflict-index="${index}">取込値を使用</button>`
      : "";
    return `<li><span><strong>${escapeHtml(label)}</strong>: 現在「${escapeHtml(existingValue.slice(0, 180))}${existingValue.length > 180 ? "…" : ""}」／取込「${escapeHtml(incomingValue.slice(0, 180))}${incomingValue.length > 180 ? "…" : ""}」</span>${action}</li>`;
  }).join("");
  const guidance = options.embedded
    ? "現在の入力欄の値を維持する項目はそのままにし、変更したい項目だけ「取込値を使用」を押してから保存してください。"
    : "値は自動上書きしていません。確認画面で項目ごとに選べます。";
  const content = `<strong>${escapeHtml(guidance)}</strong><ul>${items}</ul>`;
  return options.embedded ? content : `<div class="ai-import-conflict-list">${content}</div>`;
}

function handleImportConflictValueChoice(event) {
  const button = event.target.closest("[data-import-conflict-index]");
  if (!button) return;
  const index = Number(button.dataset.importConflictIndex);
  const detail = state.entryImportConflictDetails[index];
  const field = detail?.field;
  const input = field ? els.entryForm.elements.namedItem(field) : null;
  if (!input || typeof input.value === "undefined") return;
  input.value = String(detail.incomingValue ?? "");
  state.entryImportValueApplied = true;
  if (field === "trackType") updateTrackTypeHint();
  updateEntrySaveButton();
  input.focus();
  showToast(`${importFieldLabels[field] || "項目"}に取込値を反映しました。保存するまで確定しません。`);
}

function openAiCardDraft(index) {
  if (state.aiFileReadPending || state.aiGeneratePending) return;
  const card = state.aiCards[index];
  if (!card) return;
  const plan = buildAiImportPlan(card);
  if (plan.kind === "unchanged") {
    showToast("このカードに追加できる新情報はありません。");
    return;
  }
  if (plan.kind === "trashed") {
    showToast("同じカードがゴミ箱にあります。先に復元してください。");
    return;
  }
  if (plan.kind === "ambiguous") {
    showToast("同じ企業・種類のカードが複数あります。先に重複を整理してください。");
    return;
  }

  if (plan.kind === "conflict") {
    closeAiImportDialog(false);
    openEntryDialog(plan.existing, {
      isAiConflict: true,
      conflictDetails: plan.conflictDetails,
      importReviewKey: plan.reviewKey
    });
    return;
  }

  if (plan.kind === "existing") {
    closeAiImportDialog(false);
    openEntryDialog(plan.existing, {
      draft: plan.merged,
      isAiMerge: true,
      conflictDetails: plan.conflictDetails,
      importReviewKey: plan.reviewKey
    });
    return;
  }

  const now = new Date().toISOString();
  const draft = normalizeEntry({
    ...card,
    id: createId(),
    esItems: normalizeEsItems(card.esItems, card.esContent),
    createdAt: now,
    updatedAt: now,
    sortOrder: nextCompanySortOrder()
  });

  closeAiImportDialog(false);
  openEntryDialog(null, {
    draft,
    isAiDraft: true,
    conflictDetails: plan.conflictDetails,
    importReviewKey: plan.reviewKey
  });
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  if (state.entrySavePending) return;

  const formData = new FormData(els.entryForm);
  const existingEntry = state.editingId
    ? state.entries.find((entry) => entry.id === state.editingId)
    : null;
  const baseEntry = existingEntry ? state.editingBaseEntry || existingEntry : null;
  const draftEntry = state.entryDraft;
  const sourceEntry = draftEntry || baseEntry;
  const esContent = String(formData.get("esContent")).trim();
  const sourceEsText = sourceEntry ? entryEsText(sourceEntry) : "";
  const requestedLogoUrl = String(formData.get("logoUrl") || "").trim();
  const previousLogoUrl = String(sourceEntry?.logoUrl || "").trim();
  if (requestedLogoUrl && requestedLogoUrl !== previousLogoUrl && !normalizeExternalImageUrl(requestedLogoUrl)) {
    showToast("企業アイコンは、公開HTTPSの画像URL（クエリ・#・ログイン情報なし）を入力してください。");
    return;
  }
  const entry = normalizeEntry({
    id: baseEntry?.id || draftEntry?.id || createId(),
    companyName: String(formData.get("companyName")).trim(),
    industry: sourceEntry?.industry || "",
    trackType: String(formData.get("trackType")),
    status: String(formData.get("status")),
    deadline: String(formData.get("deadline")),
    eventDate: sourceEntry?.eventDate || "",
    eventType: sourceEntry?.eventType || "",
    priority: String(formData.get("priority")),
    mypageId: String(formData.get("mypageId")).trim(),
    officialUrl: String(formData.get("officialUrl")).trim(),
    logoUrl: requestedLogoUrl,
    mypageUrl: String(formData.get("mypageUrl")).trim(),
    esContent,
    esItems: sourceEntry?.esItems?.length && esContent === sourceEsText
      ? sourceEntry.esItems
      : normalizeEsItems([], esContent),
    interviewNotes: sourceEntry?.interviewNotes || "",
    memo: String(formData.get("memo")).trim(),
    createdAt: sourceEntry?.createdAt || new Date().toISOString(),
    updatedAt: baseEntry?.updatedAt || new Date().toISOString(),
    sortOrder: Number.isFinite(sourceEntry?.sortOrder) ? sourceEntry.sortOrder : nextCompanySortOrder(),
    deletedAt: baseEntry?.deletedAt || ""
  });

  if (!entry.companyName) {
    showToast("企業名を入力してください。");
    return;
  }

  const entryKey = aiImportIdentityKey(entry);
  const baseKey = existingEntry ? aiImportIdentityKey(existingEntry) : "";
  if (!existingEntry || entryKey !== baseKey) {
    const duplicate = state.entries.find((candidate) => (
      candidate.id !== existingEntry?.id && aiImportIdentityKey(candidate) === entryKey
    ));
    if (duplicate) {
      showToast(isTrashed(duplicate)
        ? "同じ企業・種類のカードがゴミ箱にあります。先に復元してください。"
        : "同じ企業・種類のカードは登録済みです。既存カードを編集してください。");
      return;
    }
  }

  const celebration = getEntryCelebration(entry, baseEntry);
  const draftKind = state.entryDraftKind;
  const importReviewKey = state.entryImportReviewKey;
  const handoffTrack = draftKind === "handoff" ? draftEntry?.trackType || "" : "";
  const saveScope = state.mode === "cloud" ? captureUserScope() : null;
  state.entrySavePending = true;
  updateEntrySaveButton();

  try {
    let savedEntry = entry;

    if (state.mode === "cloud") {
      if (!state.session) {
        showToast("ログインすると保存できます。");
        return;
      }

      const saved = existingEntry ? await updateCloudEntry(entry, baseEntry) : await createCloudEntry(entry);
      if (!saved) return;
      savedEntry = saved;
      if (existingEntry) {
        state.entries = state.entries.map((item) => (item.id === saved.id ? saved : item));
      } else {
        state.entries.unshift(saved);
      }
    } else {
      savedEntry = normalizeEntry({ ...entry, updatedAt: new Date().toISOString() });
      const nextEntries = existingEntry
        ? state.entries.map((item) => (item.id === savedEntry.id ? savedEntry : item))
        : [savedEntry, ...state.entries];
      if (!saveLocalEntries(nextEntries)) return;
      state.entries = nextEntries;
    }

    if (importReviewKey && ["ai", "ai-merge", "ai-conflict"].includes(draftKind)) {
      state.aiReviewedConflictKeys.add(importReviewKey);
      const importedCard = state.aiCards.find((card) => aiImportIdentityKey(card) === aiImportIdentityKey(savedEntry));
      const postSaveReviewKey = importedCard ? buildAiImportPlan(importedCard).reviewKey : "";
      if (postSaveReviewKey) state.aiReviewedConflictKeys.add(postSaveReviewKey);
    }
    resetEntryForm();
    els.entryDialog.close();
    render();
    const returnToImport = ["ai", "ai-merge", "ai-conflict"].includes(draftKind) && state.aiCards.length;
    if (returnToImport && celebration) {
      state.aiReturnAfterCelebration = true;
    } else if (returnToImport) {
      openAiImportDialog({ focusResults: true });
    }
    if (draftKind === "branch") openCompanyDetail(savedEntry.id);
    if (celebration) {
      showCelebration(savedEntry, celebration);
    } else if (handoffTrack) {
      showToast(`${handoffTrack}として新しく引き継ぎました。`);
    } else if (draftKind === "ai-merge") {
      showToast("新情報を既存カードに追加しました。");
    } else if (draftKind === "ai-conflict") {
      showToast("違いを確認して既存カードを更新しました。");
    } else if (draftKind === "ai") {
      showToast("取込カード案を保存しました。");
    } else {
      showToast(existingEntry ? "更新しました。" : "保存しました。");
    }
  } finally {
    if (!saveScope || isCurrentUserScope(saveScope)) {
      state.entrySavePending = false;
      updateEntrySaveButton();
    }
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
  const entryToDelete = state.entries.find((entry) => entry.id === id);
  if (!entryToDelete) {
    showToast("削除する企業が見つかりません。");
    return;
  }

  if (isTrashed(entryToDelete)) {
    showToast("この企業はすでにゴミ箱にあります。");
    return;
  }

  const shouldDelete = window.confirm(
    `「${entryToDelete.companyName}」をゴミ箱に移動しますか？\n企業情報・ES・メモは残り、あとで復元できます。`
  );
  if (!shouldDelete) return;

  if (!canUseCloudTrash()) return;

  const trashedEntry = normalizeEntry({
    ...entryToDelete,
    deletedAt: new Date().toISOString(),
    updatedAt: entryToDelete.updatedAt
  });

  if (state.mode === "cloud") {
    const saved = await updateCloudEntry(trashedEntry, entryToDelete);
    if (!saved) return;
    state.entries = state.entries.map((entry) => (entry.id === id ? saved : entry));
  } else {
    const localEntry = normalizeEntry({ ...trashedEntry, updatedAt: new Date().toISOString() });
    const nextEntries = state.entries.map((entry) => (entry.id === id ? localEntry : entry));
    if (!saveLocalEntries(nextEntries)) return;
    state.entries = nextEntries;
  }

  if (state.editingId === id) {
    resetEntryForm();
    els.entryDialog.close();
  }
  render();
  showToast(`「${entryToDelete.companyName}」をゴミ箱に移動しました。`);
}

async function handleRestoreEntry(id) {
  const entryToRestore = state.entries.find((entry) => entry.id === id);
  if (!entryToRestore) {
    showToast("復元する企業が見つかりません。");
    return;
  }

  if (!isTrashed(entryToRestore)) {
    showToast("この企業はゴミ箱にありません。");
    return;
  }

  if (!canUseCloudTrash()) return;

  const restoredEntry = normalizeEntry({
    ...entryToRestore,
    deletedAt: "",
    updatedAt: entryToRestore.updatedAt
  });

  if (state.mode === "cloud") {
    const saved = await updateCloudEntry(restoredEntry, entryToRestore);
    if (!saved) return;
    state.entries = state.entries.map((entry) => (entry.id === id ? saved : entry));
  } else {
    const localEntry = normalizeEntry({ ...restoredEntry, updatedAt: new Date().toISOString() });
    const nextEntries = state.entries.map((entry) => (entry.id === id ? localEntry : entry));
    if (!saveLocalEntries(nextEntries)) return;
    state.entries = nextEntries;
  }

  render();
  showToast(`「${entryToRestore.companyName}」を復元しました。`);
}

async function handlePermanentDeleteEntry(id) {
  if (state.trashDeletePending) return;

  const entryToDelete = state.entries.find((entry) => entry.id === id);
  if (!entryToDelete) {
    showToast("完全削除する企業が見つかりません。");
    return;
  }

  if (!isTrashed(entryToDelete)) {
    showToast("ゴミ箱にない企業は完全削除できません。");
    return;
  }

  const confirmation = window.prompt(
    `「${entryToDelete.companyName}」を完全に削除します。\n企業情報・ES・メモは復元できなくなります。\n続けるには「完全削除」と入力してください。`
  );
  if (confirmation === null) return;
  if (confirmation.trim() !== "完全削除") {
    showToast("確認文字が一致しないため、削除しませんでした。");
    return;
  }

  if (!canUseCloudTrash()) return;

  const deleteScope = state.mode === "cloud" ? captureUserScope() : null;
  state.trashDeletePending = true;
  renderCompanyList();
  try {
    if (state.mode === "cloud") {
      const { data, error } = await supabaseClient
        .from("entries")
        .delete()
        .eq("id", id)
        .not("deleted_at", "is", null)
        .select("id");
      if (!isCurrentUserScope(deleteScope)) return;
      if (error) {
        showToast(error.message);
        return;
      }
      if (!Array.isArray(data) || data.length !== 1) {
        await loadCloudEntries();
        showToast("別の端末で状態が変わったため、最新のゴミ箱を読み込みました。");
        return;
      }
    } else {
      const nextEntries = state.entries.filter((entry) => entry.id !== id);
      if (!saveLocalEntries(nextEntries)) return;
    }

    state.entries = state.entries.filter((entry) => entry.id !== id);
    render();
    showToast(`「${entryToDelete.companyName}」を完全に削除しました。`);
  } finally {
    if (!deleteScope || isCurrentUserScope(deleteScope)) {
      state.trashDeletePending = false;
      renderCompanyList();
    }
  }
}

async function handleEmptyTrash() {
  if (state.trashDeletePending) return;

  const entriesToDelete = trashedEntries();
  if (entriesToDelete.length === 0) {
    showToast("ゴミ箱は空です。");
    return;
  }

  const expectedText = `${entriesToDelete.length}件を完全削除`;
  const confirmation = window.prompt(
    `ゴミ箱にある企業 ${entriesToDelete.length}件をすべて完全に削除します。\n企業情報・ES・メモは復元できなくなります。\n続けるには「${expectedText}」と入力してください。`
  );
  if (confirmation === null) return;
  if (confirmation.trim() !== expectedText) {
    showToast("確認文字が一致しないため、削除しませんでした。");
    return;
  }

  if (!canUseCloudTrash()) return;

  const idsToDelete = entriesToDelete.map((entry) => entry.id);
  const deleteScope = state.mode === "cloud" ? captureUserScope() : null;
  state.trashDeletePending = true;
  renderCompanyList();
  try {
    if (state.mode === "cloud") {
      const { data, error } = await supabaseClient
        .from("entries")
        .delete()
        .in("id", idsToDelete)
        .not("deleted_at", "is", null)
        .select("id");
      if (!isCurrentUserScope(deleteScope)) return;
      if (error) {
        showToast(error.message);
        return;
      }
      if (!Array.isArray(data) || data.length !== idsToDelete.length) {
        await loadCloudEntries();
        showToast("別の端末で状態が変わったため、最新のゴミ箱を読み込みました。");
        return;
      }
    } else {
      const deletedIds = new Set(idsToDelete);
      const nextEntries = state.entries.filter((entry) => !deletedIds.has(entry.id));
      if (!saveLocalEntries(nextEntries)) return;
    }

    const deletedIds = new Set(idsToDelete);
    state.entries = state.entries.filter((entry) => !deletedIds.has(entry.id));
    render();
    showToast(`ゴミ箱の企業 ${idsToDelete.length}件を完全に削除しました。`);
  } finally {
    if (!deleteScope || isCurrentUserScope(deleteScope)) {
      state.trashDeletePending = false;
      renderCompanyList();
    }
  }
}

function openCompanyDetail(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) {
    showToast("詳細を開くデータが見つかりません。");
    return;
  }

  const values = normalizeEntry(entry);
  state.detailEditingId = values.id;
  state.detailBaseEntry = values;
  els.detailCompanyTitle.textContent = values.companyName || "企業詳細";
  els.detailCompanyMeta.textContent = [
    values.trackType,
    simpleStatus(values.status),
    values.priority && values.priority !== "未定" ? `志望度 ${values.priority}` : ""
  ].filter(Boolean).join(" ・ ");
  els.detailMemoInput.value = values.memo;
  els.detailEsSearchInput.value = "";
  state.detailEsMode = values.esItems.length > 0 ? "read" : "edit";
  renderDetailInfoSummary(values);
  renderDetailBranches(values);
  renderDetailEsItems(values.esItems.length > 0 ? values.esItems : [createEsItem()]);
  renderTemplateOptions();
  setDetailTab(state.detailTab);

  if (typeof els.companyDetailDialog.showModal === "function") {
    els.companyDetailDialog.showModal();
  } else {
    els.companyDetailDialog.setAttribute("open", "");
  }
}

function closeCompanyDetail() {
  closeEsReview();
  state.detailEditingId = null;
  state.detailBaseEntry = null;
  els.companyDetailForm.reset();
  els.detailEsSearchInput.value = "";
  els.detailEsList.textContent = "";
  els.detailInfoSummary.textContent = "";
  els.companyDetailDialog.close();
}

function setDetailTab(tabName) {
  const nextTab = detailTabs.includes(tabName) ? tabName : "basic";
  state.detailTab = nextTab;

  els.detailTabs.forEach((tab) => {
    const active = tab.dataset.detailTab === nextTab;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  els.detailPanels.forEach((panel) => {
    const active = panel.dataset.detailPanel === nextTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function setDetailEsMode(mode) {
  const nextMode = detailEsModes.includes(mode) ? mode : "read";
  state.detailEsMode = nextMode;

  els.detailEsModeButtons.forEach((button) => {
    const active = button.dataset.esMode === nextMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  els.detailEsList.classList.toggle("read-mode", nextMode === "read");
  els.detailEsList.classList.toggle("edit-mode", nextMode === "edit");
}

function renderDetailInfoSummary(entry) {
  const officialUrl = normalizeExternalUrl(entry.officialUrl);
  const mypageUrl = normalizeExternalUrl(entry.mypageUrl);
  const items = [
    ["ステータス", simpleStatus(entry.status)],
    ["種類", entry.trackType],
    ["志望度", entry.priority === "未定" ? "未設定" : entry.priority],
    ["締切", entry.deadline ? formatDate(entry.deadline) : "未設定"],
    ["マイページID", entry.mypageId || "未登録"]
  ];

  els.detailInfoSummary.innerHTML = [
    ...items.map(([label, value]) => detailInfoItem(label, value)),
    officialUrl ? detailInfoLink("企業公式サイト", officialUrl, "公式サイトを開く") : detailInfoItem("企業公式サイト", "未登録"),
    mypageUrl ? detailInfoLink("企業マイページ", mypageUrl, "マイページを開く") : detailInfoItem("企業マイページ", "未登録")
  ].join("");
}

function detailInfoItem(label, value) {
  return `
    <div class="detail-info-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function detailInfoLink(label, url, text) {
  return `
    <div class="detail-info-item">
      <span>${escapeHtml(label)}</span>
      <a class="detail-info-link" href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>
    </div>
  `;
}

function normalizeCompanyName(value) {
  return String(value || "").replace(/[\s　]+/g, "").toLowerCase();
}

function handleDetailSwipePointerDown(event) {
  if (event.pointerType === "mouse") return;
  if (event.target.closest("input, textarea, select, button, a")) return;

  detailSwipeState.pointerId = event.pointerId;
  detailSwipeState.startX = event.clientX;
  detailSwipeState.startY = event.clientY;
  capturePointer(els.detailTabPanels, event.pointerId);
}

function handleDetailSwipePointerUp(event) {
  if (detailSwipeState.pointerId !== event.pointerId) return;

  const deltaX = event.clientX - detailSwipeState.startX;
  const deltaY = event.clientY - detailSwipeState.startY;
  const isHorizontalSwipe = Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4;

  if (isHorizontalSwipe) {
    setDetailTab(deltaX < 0 ? "es" : "basic");
  }

  resetDetailSwipe(event);
}

function resetDetailSwipe(event) {
  releasePointer(els.detailTabPanels, detailSwipeState.pointerId);
  detailSwipeState.pointerId = null;
  detailSwipeState.startX = 0;
  detailSwipeState.startY = 0;
  event?.preventDefault?.();
}

function renderDetailEsItems(items) {
  els.detailEsList.innerHTML = items.map(esEditorCard).join("");
  updateDetailEsCharCounts();
  filterDetailEsCards();
  setDetailEsMode(state.detailEsMode);
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
            <span class="char-count" data-es-count>${escapeHtml(esDraftCountText(value.question, variant))}</span>
          </label>
          <button class="secondary-button small-button" data-es-review type="button">ESチェック・AI添削</button>
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
      ${esReadBlock(value)}
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

function esReadBlock(item) {
  const question = item.question.trim() || "未入力のES質問";
  const answers = item.variants
    .map((variant) => {
      const answer = variant.answer.trim();
      const empty = !answer;
      return `
        <section class="es-read-answer" data-es-read-answer>
          <div class="es-read-answer-heading">
            <span class="tag">${escapeHtml(esVariantTitle(variant))}</span>
            <span class="char-count">${escapeHtml(esDraftCountText(item.question, variant))}</span>
          </div>
          <p class="${empty ? "empty-answer" : ""}" data-es-read-answer-text>${escapeHtml(answer || "回答未入力")}</p>
          <button class="secondary-button small-button" data-es-copy-answer type="button" ${empty ? "disabled" : ""}>回答をコピー</button>
        </section>
      `;
    })
    .join("");

  return `
    <div class="es-read-card" data-es-read>
      <div class="es-read-question">
        <span>質問</span>
        <strong>${escapeHtml(question)}</strong>
      </div>
      <div class="es-read-answers">${answers}</div>
      <button class="edit-button es-read-edit-button" data-es-edit-card type="button">この質問を編集</button>
    </div>
  `;
}

function addDetailEsItem(item = createEsItem()) {
  setDetailEsMode("edit");
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
  if (item.variants.length >= 20) {
    showToast("回答は1つの質問につき20件までです。不要な回答を整理してから追加してください。");
    return;
  }
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
  setDetailEsMode(state.detailEsMode);
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
  const readBlock = card.querySelector("[data-es-read]");
  if (readBlock) readBlock.outerHTML = esReadBlock(item);
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

  const nextEntries = state.entries.map((entry) => ({
    ...entry,
    sortOrder: rank.has(entry.id) ? rank.get(entry.id) : entry.sortOrder
  }));

  if (state.mode === "local") {
    if (!saveLocalEntries(nextEntries)) return;
    state.entries = nextEntries;
    return;
  }

  state.entries = nextEntries;

  if (state.mode === "cloud" && state.session && state.cloudSortOrderAvailable) {
    await saveCloudCompanyOrder();
  }
}

async function saveCloudCompanyOrder() {
  const scope = captureUserScope();
  const results = await Promise.all(
    state.entries.map((entry) => supabaseClient.from("entries").update({ sort_order: entry.sortOrder }).eq("id", entry.id))
  );
  if (!isCurrentUserScope(scope)) return;
  const error = results.find((result) => result.error)?.error;
  if (!error) return;

  state.cloudSortOrderAvailable = false;
  showToast("SupabaseのSQLを更新すると、企業の並び順も端末間で保存できます。");
}

async function persistTemplateOrderFromDom() {
  const visibleIds = Array.from(els.templateList.querySelectorAll("[data-template-card]")).map((card) => card.dataset.templateId);
  if (visibleIds.length === 0) return;

  const rank = new Map(visibleIds.map((id, index) => [id, index]));
  const nextTemplates = state.templates.map((template) => ({
    ...template,
    sortOrder: rank.has(template.id) ? rank.get(template.id) : template.sortOrder
  }));

  if (state.mode === "local") {
    if (!saveLocalTemplates(nextTemplates)) return;
    state.templates = nextTemplates;
    return;
  }

  state.templates = nextTemplates;

  if (state.mode === "cloud" && state.session && state.cloudTemplateSortOrderAvailable) {
    await saveCloudTemplateOrder();
  }
}

async function saveCloudTemplateOrder() {
  const scope = captureUserScope();
  const results = await Promise.all(
    state.templates.map((template) => supabaseClient.from("es_templates").update({ sort_order: template.sortOrder }).eq("id", template.id))
  );
  if (!isCurrentUserScope(scope)) return;
  const error = results.find((result) => result.error)?.error;
  if (!error) return;

  state.cloudTemplateSortOrderAvailable = false;
  showToast("SupabaseのSQLを更新すると、型の並び順も端末間で保存できます。");
}

async function handleDetailSubmit(event) {
  event.preventDefault();
  if (state.detailSavePending) return;
  const existingEntry = state.entries.find((entry) => entry.id === state.detailEditingId);
  const baseEntry = state.detailBaseEntry || existingEntry;
  if (!existingEntry || !baseEntry) {
    showToast("保存する企業が見つかりません。");
    return;
  }

  const esItems = collectDetailEsItems();
  const entry = normalizeEntry({
    ...baseEntry,
    esItems,
    esContent: esItemsToLegacyText(esItems),
    memo: els.detailMemoInput.value.trim()
  });

  const saveScope = state.mode === "cloud" ? captureUserScope() : null;
  state.detailSavePending = true;
  updateDetailSaveButton();
  try {
    if (state.mode === "cloud") {
      if (!state.session) {
        showToast("ログインすると保存できます。");
        return;
      }

      const saved = await updateCloudEntry(entry, baseEntry);
      if (!saved) return;
      state.entries = state.entries.map((item) => (item.id === saved.id ? saved : item));
    } else {
      const localEntry = normalizeEntry({ ...entry, updatedAt: new Date().toISOString() });
      const nextEntries = state.entries.map((item) => (item.id === localEntry.id ? localEntry : item));
      if (!saveLocalEntries(nextEntries)) return;
      state.entries = nextEntries;
    }

    closeCompanyDetail();
    render();
    showToast("詳細を保存しました。");
    return true;
  } finally {
    if (!saveScope || isCurrentUserScope(saveScope)) {
      state.detailSavePending = false;
      updateDetailSaveButton();
    }
  }
}

function updateDetailSaveButton() {
  els.saveDetailButton.disabled = state.detailSavePending;
  els.saveDetailButton.textContent = state.detailSavePending ? "安全に保存中..." : "詳細を保存";
}

async function handleOpenBasicEditFromDetail() {
  const id = state.detailEditingId;
  if (!await prepareBranchNavigation()) return;
  const entry = state.entries.find((item) => item.id === id);
  if (entry) openEntryDialog(entry);
}

function esDraftCountText(question, variant) {
  const result = localAi?.checkEsDraft?.({ question, ...variant });
  if (!result?.limit) return formatCharCount(variant.answer);
  const remaining = result.limit - result.count;
  return `${result.count.toLocaleString("ja-JP")} / ${result.limit.toLocaleString("ja-JP")}文字（目安・${remaining < 0 ? `${-remaining}文字超過` : `あと${remaining}文字`}）`;
}

function esReviewElement(name) {
  return document.querySelector(`#esReview${name}`);
}

function closeEsReview() {
  state.esReviewDraft?.controller?.abort();
  state.esReviewDraft = null;
  const dialog = esReviewElement("Dialog");
  if (dialog?.open) dialog.close();
  for (const name of ["Preview", "Summary", "Strengths", "Improvements", "Revised", "Status"]) {
    const element = esReviewElement(name);
    if (element) element.textContent = "";
  }
}

function openEsReview(pane) {
  if (!pane || !localAi?.prepareEsReview) return;
  const card = pane.closest(".es-editor-card");
  const question = card.querySelector("[data-es-question]").value;
  const answer = pane.querySelector("[data-es-answer]").value;
  const label = pane.querySelector("[data-es-variant-label]").value;
  const check = localAi.checkEsDraft({ question, answer, label });
  closeEsReview();
  const draft = { card, entryId: state.detailEditingId, variantId: pane.dataset.esVariantId, question, answer, label,
    userId: state.session?.user?.id, targetCharacters: check.limit, pending: false, review: null };
  state.esReviewDraft = draft;
  esReviewElement("Count").textContent = esDraftCountText(question, { answer, label });
  esReviewElement("Checks").innerHTML = (check.issues.length ? check.issues : ["字数・未入力・仮の文言のチェックでは問題は見つかりませんでした。"])
    .map((issue) => `<li>${escapeHtml(issue)}</li>`).join("");
  esReviewElement("Result").hidden = true;
  const button = document.querySelector("#generateEsReviewButton");
  button.textContent = "この内容でAI添削する（1回）";
  button.disabled = true;
  document.querySelector("#applyEsReviewButton").disabled = false;
  try {
    const prepared = localAi.prepareEsReview(draft);
    draft.input = prepared.value;
    esReviewElement("Preview").textContent = `質問：${prepared.value.question}\n\n回答：${prepared.value.answer}`;
    const canUseAi = state.mode === "cloud" && Boolean(state.session?.access_token);
    esReviewElement("Status").textContent = canUseAi
      ? `質問は1000文字、回答は2000文字まで。${prepared.total ? `${prepared.total}件を伏せ字にしました。` : "個人情報らしい箇所は見つかりませんでした。"}`
      : "字数チェックはこのまま使えます。AI添削はクラウド版にログインすると利用できます。";
    button.disabled = !canUseAi;
  } catch (error) {
    esReviewElement("Status").textContent = error.message;
  }
  esReviewElement("Dialog").showModal();
}

function isCurrentEsReview(draft) {
  return state.esReviewDraft === draft && state.detailEditingId === draft.entryId
    && state.session?.user?.id === draft.userId && draft.card.isConnected;
}

async function generateEsReview() {
  const draft = state.esReviewDraft;
  if (!draft?.input || draft.pending || !isCurrentEsReview(draft) || !state.session?.access_token) return;
  draft.pending = true;
  draft.controller = new AbortController();
  const button = document.querySelector("#generateEsReviewButton");
  button.disabled = true;
  button.textContent = "添削しています…";
  esReviewElement("Status").textContent = "通常は数秒から数十秒かかります。";
  try {
    const result = await localAi.reviewEs(draft.input, { accessToken: state.session.access_token, signal: draft.controller.signal });
    if (!isCurrentEsReview(draft)) return;
    draft.review = result.review;
    esReviewElement("Summary").textContent = result.review.summary;
    for (const name of ["Strengths", "Improvements"]) {
      const items = result.review[name.toLowerCase()];
      esReviewElement(name).innerHTML = (items.length ? items : ["特になし"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    }
    esReviewElement("Revised").textContent = result.review.revisedAnswer;
    esReviewElement("RevisedCount").textContent = esDraftCountText(draft.question, { label: draft.label, answer: result.review.revisedAnswer });
    esReviewElement("Result").hidden = false;
    esReviewElement("Status").textContent = `添削できました。${Number.isFinite(result.remainingToday) ? `本日のAI残り${result.remainingToday}回。` : ""}内容を確認して取り込んでください。`;
    esReviewElement("Result").scrollIntoView({ block: "start", behavior: "smooth" });
  } catch (error) {
    if (isCurrentEsReview(draft)) esReviewElement("Status").textContent = error.message;
  } finally {
    if (isCurrentEsReview(draft)) {
      draft.pending = false;
      button.disabled = Boolean(draft.review);
      button.textContent = draft.review ? "添削済み" : "もう一度AI添削する（1回）";
    }
  }
}

function applyEsReview() {
  const draft = state.esReviewDraft;
  if (!draft?.review || !isCurrentEsReview(draft)) return;
  const item = collectEsItemFromCard(draft.card);
  const original = item.variants.find((variant) => variant.id === draft.variantId);
  if (!original || original.answer !== draft.answer.trim() || item.question !== draft.question.trim() || original.label !== draft.label.trim()) {
    esReviewElement("Status").textContent = "元の回答が変更されています。閉じてからもう一度チェックしてください。";
    return;
  }
  if (item.variants.length >= 20) {
    esReviewElement("Status").textContent = "回答は1つの質問につき20件までです。不要な回答を整理してから追加してください。";
    return;
  }
  const variant = createEsVariant(`${original.label || "回答"}・AI添削`, draft.review.revisedAnswer);
  item.variants.push(variant);
  item.activeVariantId = variant.id;
  replaceEsCard(draft.card, item, true);
  closeEsReview();
  els.detailEsList.querySelector(`[data-es-variant-id="${cssEscape(variant.id)}"] [data-es-answer]`)?.focus();
  showToast("元の回答を残して添削案を追加しました。確認後に「詳細を保存」を押してください。");
}

function updateDetailEsCharCounts() {
  els.detailEsList.querySelectorAll(".es-editor-card").forEach((card) => {
    card.querySelectorAll("[data-es-variant-id]").forEach((pane) => {
      const answer = pane.querySelector("[data-es-answer]");
      const count = pane.querySelector("[data-es-count]");
      const question = card.querySelector("[data-es-question]")?.value || "";
      const label = pane.querySelector("[data-es-variant-label]")?.value || "";
      if (count) {
        count.textContent = esDraftCountText(question, { label, answer: answer?.value || "" });
        const check = localAi?.checkEsDraft?.({ question, label, answer: answer?.value || "" });
        count.classList.toggle("es-over-limit", Boolean(check?.limit && check.count > check.limit));
      }
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

async function copyEsAnswer(answerBlock) {
  const text = answerBlock?.querySelector("[data-es-read-answer-text]")?.textContent.trim() || "";
  if (!text || text === "回答未入力") {
    showToast("コピーする回答がありません。");
    return;
  }

  const copied = await copyTextToClipboard(text);
  showToast(copied ? "ES回答をコピーしました。" : "コピーできませんでした。本文を選択してコピーしてください。");
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
    const nextTemplates = existingTemplate
      ? state.templates.map((item) => (item.id === template.id ? template : item))
      : [template, ...state.templates];
    if (!saveLocalTemplates(nextTemplates)) return;
    state.templates = nextTemplates;
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
    const scope = captureUserScope();
    const { error } = await supabaseClient.from("es_templates").delete().eq("id", id);
    if (!isCurrentUserScope(scope)) return;
    if (error) {
      showToast(error.message);
      return;
    }
  }

  const nextTemplates = state.templates.filter((template) => template.id !== id);
  if (state.mode === "local" && !saveLocalTemplates(nextTemplates)) return;
  state.templates = nextTemplates;
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
    version: 3,
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
  if (file.size > 10 * 1024 * 1024) {
    showToast("バックアップファイルは10MB以下にしてください。");
    return;
  }
  const importScope = state.mode === "cloud" ? captureUserScope() : null;

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    showToast("バックアップファイルを読めませんでした。");
    return;
  }
  if (importScope && !isCurrentUserScope(importScope)) return;

  if (!isValidBackup(backup)) {
    showToast("就活管理のバックアップファイルではありません。");
    return;
  }

  const ignoredLogoUrlCount = backup.entries.filter((entry) => (
    typeof entry.logoUrl === "string" && entry.logoUrl.trim()
  )).length;
  let entries;
  let templates;
  try {
    entries = backup.entries.map((entry) => normalizeEntry({
      ...entry,
      id: normalizeImportedRecordId(entry.id),
      // A backup can come from another person or an older import. Requiring
      // the user to add the image again prevents an automatic tracking GET.
      logoUrl: ""
    }));
    templates = backup.templates.map((template) => normalizeTemplate({
      ...template,
      id: normalizeImportedRecordId(template.id)
    }));
  } catch {
    showToast("バックアップ内のデータ形式が壊れているため、復元しませんでした。");
    return;
  }
  if (entries.some((entry) => !entry.companyName)) {
    showToast("企業名を確認できないカードがあるため、復元しませんでした。");
    return;
  }
  const entryRestorePlan = prepareBackupEntryRestore(state.entries, entries);
  if (entryRestorePlan.blockingIssues.length) {
    showToast(`既存カードへ安全に統合できない長いメモが${entryRestorePlan.blockingIssues.length}件あるため、復元を中止しました。先にバックアップ内のメモを分けてください。`);
    return;
  }
  const templateRestorePlan = prepareBackupTemplateRestore(state.templates, templates);
  const activeEntryCount = entries.filter((entry) => !isTrashed(entry)).length;
  const trashedEntryCount = entries.filter(isTrashed).length;
  const logoNotice = ignoredLogoUrlCount
    ? `\n企業アイコン画像URL ${ignoredLogoUrlCount}件は、安全のため除外します。`
    : "";
  const shouldImport = window.confirm(
    `バックアップを復元しますか？\n企業 ${activeEntryCount}件、ゴミ箱 ${trashedEntryCount}件、ESの型 ${templates.length}件を読み込みます。\n同じ企業・種類のカードは既存内容を残し、空欄と新しいメモだけを追加します。${logoNotice}`
  );
  if (!shouldImport) return;

  if (state.mode === "cloud") {
    if (!state.session) {
      showToast("ログインすると復元できます。");
      return;
    }
    const scope = importScope || captureUserScope();

    if (!state.cloudDeletedAtAvailable && entries.some(isTrashed)) {
      showToast("ゴミ箱入りデータを復元するにはSupabaseのSQL更新が必要です。");
      return;
    }

    const [entryProbe, templateProbe, entrySortProbe, templateSortProbe] = await Promise.all([
      supabaseClient.from("entries").select("id").limit(1),
      supabaseClient.from("es_templates").select("id").limit(1),
      supabaseClient.from("entries").select("sort_order").limit(1),
      supabaseClient.from("es_templates").select("sort_order").limit(1)
    ]);
    if (!isCurrentUserScope(scope)) return;
    if (entryProbe.error || templateProbe.error) {
      showToast("復元先を確認できませんでした。SupabaseのSQLを更新してから再実行してください。");
      return;
    }
    state.cloudSortOrderAvailable = !entrySortProbe.error;
    state.cloudTemplateSortOrderAvailable = !templateSortProbe.error;
    const entryPayload = entryRestorePlan.upserts.map((entry) => toDbEntry(entry, {
      includeSortOrder: !entrySortProbe.error
    }));
    const templatePayload = templateRestorePlan.upserts.map((template) => toDbTemplate(template, {
      includeSortOrder: !templateSortProbe.error
    }));
    if (entryPayload.length > 0) {
      const { error } = await supabaseClient.from("entries").upsert(entryPayload, { onConflict: "id" });
      if (!isCurrentUserScope(scope)) return;
      if (error) {
        showToast(cloudEntryErrorMessage(error));
        return;
      }
    }
    if (templatePayload.length > 0) {
      const { error } = await supabaseClient.from("es_templates").upsert(templatePayload, { onConflict: "id" });
      if (!isCurrentUserScope(scope)) return;
      if (error) {
        await loadCloudData();
        if (!isCurrentUserScope(scope)) return;
        showToast(`企業カードは復元しましたが、ESの型は復元できませんでした: ${error.message}`);
        return;
      }
    }
    await loadCloudData();
    if (!isCurrentUserScope(scope)) return;
  } else {
    const previousEntries = state.entries;
    const previousTemplates = state.templates;
    const previousEntriesRaw = localStorage.getItem(storageKey);
    const previousTemplatesRaw = localStorage.getItem(templateStorageKey);
    const nextEntries = entryRestorePlan.entries;
    const nextTemplates = templateRestorePlan.templates;
    if (!saveLocalEntries(nextEntries)) return;
    if (!saveLocalTemplates(nextTemplates)) {
      const entriesRolledBack = restoreLocalCollectionSnapshot(
        storageKey,
        storagePendingKey,
        storageBackupKey,
        previousEntriesRaw
      );
      const templatesRolledBack = restoreLocalCollectionSnapshot(
        templateStorageKey,
        templateStoragePendingKey,
        templateStorageBackupKey,
        previousTemplatesRaw
      );
      state.entries = previousEntries;
      state.templates = previousTemplates;
      render();
      showToast(entriesRolledBack && templatesRolledBack
        ? "復元を完了できなかったため、直前のデータへ戻しました。"
        : "復元に失敗しました。画面上の直前データをバックアップとして書き出してください。");
      return;
    }
    state.entries = nextEntries;
    state.templates = nextTemplates;
    render();
  }

  showToast(
    state.mode === "cloud" && (!state.cloudSortOrderAvailable || !state.cloudTemplateSortOrderAvailable)
      ? "バックアップを復元しました。並び順も戻すにはSupabaseのSQLを更新してください。"
      : "バックアップを復元しました。"
  );
}

function isValidBackup(value) {
  return Boolean(
    isPlainRecord(value) &&
    value.app === "shukatsu-tracker" &&
    Number.isInteger(value.version) &&
    value.version >= 1 &&
    value.version <= 3 &&
    Array.isArray(value.entries) &&
    value.entries.length <= 5_000 &&
    value.entries.every(isValidBackupEntryRecord) &&
    Array.isArray(value.templates) &&
    value.templates.length <= 1_000 &&
    value.templates.every(isValidBackupTemplateRecord)
  );
}

function isValidBackupEntryRecord(value) {
  if (!isPlainRecord(value) || typeof value.companyName !== "string" || !value.companyName.trim()) return false;
  const textFields = [
    "id", "companyName", "industry", "mypageId", "officialUrl", "logoUrl", "trackType", "status",
    "deadline", "eventDate", "eventType", "priority", "mypageUrl", "esContent", "interviewNotes", "memo",
    "createdAt", "updatedAt", "deletedAt"
  ];
  if (!textFields.every((field) => !Object.hasOwn(value, field) || typeof value[field] === "string")) return false;
  if (!isValidBackupSortOrder(value)) return false;
  if (Object.hasOwn(value, "esItems") && (
    !Array.isArray(value.esItems) ||
    value.esItems.length > 200 ||
    !value.esItems.every(isValidBackupEsItemRecord)
  )) return false;
  return true;
}

function isValidBackupEsItemRecord(value) {
  if (!isPlainRecord(value)) return false;
  for (const field of ["id", "question", "answer", "activeVariantId"]) {
    if (Object.hasOwn(value, field) && typeof value[field] !== "string") return false;
  }
  if (Object.hasOwn(value, "variants") && (
    !Array.isArray(value.variants) ||
    value.variants.length > 20 ||
    !value.variants.every((variant) => (
      isPlainRecord(variant) &&
      ["id", "label", "answer"].every((field) => (
        !Object.hasOwn(variant, field) || typeof variant[field] === "string"
      ))
    ))
  )) return false;
  return true;
}

function isValidBackupTemplateRecord(value) {
  if (!isPlainRecord(value)) return false;
  for (const field of ["id", "kind", "title", "body", "createdAt", "updatedAt"]) {
    if (Object.hasOwn(value, field) && typeof value[field] !== "string") return false;
  }
  return isValidBackupSortOrder(value);
}

function isValidBackupSortOrder(value) {
  return !Object.hasOwn(value, "sortOrder") || value.sortOrder === null || (
    typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder)
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

  if (!state.cloudDeletedAtAvailable && localEntries.some(isTrashed)) {
    showToast("ゴミ箱入りデータを移すにはSupabaseのSQL更新が必要です。");
    return;
  }

  const shouldImport = window.confirm("この端末に残っているデータをクラウドへ移しますか？");
  if (!shouldImport) return;

  const scope = captureUserScope();
  const restorePlan = prepareBackupEntryRestore(state.entries, localEntries);
  const payload = restorePlan.upserts.map((entry) => toDbEntry(entry));
  if (payload.length > 0) {
    const { error } = await supabaseClient.from("entries").upsert(payload, { onConflict: "id" });
    if (!isCurrentUserScope(scope)) return;
    if (error) {
      showToast(cloudEntryErrorMessage(error));
      return;
    }
  }

  localStorage.removeItem(storageKey);
  localStorage.removeItem(storagePendingKey);
  localStorage.removeItem(storageBackupKey);
  await loadCloudData();
  if (!isCurrentUserScope(scope)) return;
  showToast("端末データをクラウドへ移しました。");
}

async function loadCloudData() {
  if (!state.session) return;
  const scope = captureUserScope();

  state.loading = true;
  renderMode();
  await refreshCloudEntryColumnSupport(scope);
  if (!isCurrentUserScope(scope)) return;
  const [entriesResult, templatesResult] = await Promise.all([
    supabaseClient.from("entries").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("es_templates").select("*").order("updated_at", { ascending: false })
  ]);
  if (!isCurrentUserScope(scope)) return;
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
  const scope = captureUserScope();

  state.loading = true;
  renderMode();
  await refreshCloudEntryColumnSupport(scope);
  if (!isCurrentUserScope(scope)) return;
  const { data, error } = await supabaseClient.from("entries").select("*").order("created_at", { ascending: false });
  if (!isCurrentUserScope(scope)) return;
  state.loading = false;

  if (error) {
    showToast(error.message);
    render();
    return;
  }

  state.entries = data.map(fromDbEntry);
  render();
}

async function refreshCloudEntryColumnSupport(scope = captureUserScope()) {
  if (!state.session) return;

  const { error } = await supabaseClient.from("entries").select("id, deleted_at").limit(1);
  if (!isCurrentUserScope(scope)) return;
  state.cloudDeletedAtAvailable = !error;

  if (error && !state.cloudDeletedAtWarningShown) {
    state.cloudDeletedAtWarningShown = true;
    showToast("SupabaseのSQLを更新すると、ゴミ箱と復元が使えます。");
  }
}

function canUseCloudTrash() {
  if (state.mode !== "cloud") return true;
  if (state.cloudDeletedAtAvailable) return true;

  showToast("SupabaseのSQLを更新するとゴミ箱が使えます。データ保護のため削除しません。");
  return false;
}

function mergeBackupEntries(currentItems, importedItems, blockingIssues = []) {
  const merged = (Array.isArray(currentItems) ? currentItems : []).map(normalizeEntry);
  const indexesById = new Map();
  const indexesByIdentity = new Map();

  const remember = (entry, index) => {
    indexesById.set(entry.id, index);
    const identity = aiImportIdentityKey(entry);
    if (identity && !indexesByIdentity.has(identity)) indexesByIdentity.set(identity, index);
  };
  merged.forEach(remember);

  (Array.isArray(importedItems) ? importedItems : []).forEach((rawEntry) => {
    const incoming = normalizeEntry({ ...rawEntry, logoUrl: "" });
    if (!incoming.companyName) return;
    const identity = aiImportIdentityKey(incoming);
    const identityIndex = identity ? indexesByIdentity.get(identity) : undefined;
    const idIndex = indexesById.get(incoming.id);
    const targetIndex = identityIndex ?? idIndex;

    if (targetIndex !== undefined) {
      const result = mergeImportedEntry(merged[targetIndex], incoming, { textLimit: 100_000 });
      for (const field of ["interviewNotes", "memo"]) {
        if (result.conflicts.includes(field)) {
          blockingIssues.push({ entryId: merged[targetIndex].id, field });
        }
      }
      const nextEntry = result.entry;
      if (!Number.isFinite(nextEntry.sortOrder) && Number.isFinite(incoming.sortOrder)) {
        nextEntry.sortOrder = incoming.sortOrder;
      }
      merged[targetIndex] = normalizeEntry(nextEntry);
      remember(merged[targetIndex], targetIndex);
      return;
    }

    const index = merged.length;
    merged.push(incoming);
    remember(incoming, index);
  });

  return merged;
}

function prepareBackupEntryRestore(currentItems, importedItems) {
  const current = (Array.isArray(currentItems) ? currentItems : []).map(normalizeEntry);
  const blockingIssues = [];
  const entries = mergeBackupEntries(current, importedItems, blockingIssues);
  const currentById = new Map(current.map((entry) => [entry.id, entry]));
  const upserts = entries.filter((entry) => {
    const previous = currentById.get(entry.id);
    return !previous || JSON.stringify(previous) !== JSON.stringify(entry);
  });
  return { entries, upserts, blockingIssues };
}

function prepareBackupTemplateRestore(currentItems, importedItems) {
  const templates = (Array.isArray(currentItems) ? currentItems : []).map(normalizeTemplate);
  const indexesById = new Map(templates.map((template, index) => [template.id, index]));

  (Array.isArray(importedItems) ? importedItems : []).forEach((rawTemplate) => {
    const incoming = normalizeTemplate(rawTemplate);
    if (!incoming.title && !incoming.body) return;
    const index = indexesById.get(incoming.id);
    if (index === undefined) {
      indexesById.set(incoming.id, templates.length);
      templates.push(incoming);
      return;
    }

    const existing = templates[index];
    templates[index] = normalizeTemplate({
      ...existing,
      kind: existing.kind || incoming.kind,
      title: existing.title || incoming.title,
      body: existing.body || incoming.body,
      sortOrder: Number.isFinite(existing.sortOrder) ? existing.sortOrder : incoming.sortOrder
    });
  });

  const currentById = new Map(
    (Array.isArray(currentItems) ? currentItems : []).map(normalizeTemplate).map((template) => [template.id, template])
  );
  const upserts = templates.filter((template) => {
    const previous = currentById.get(template.id);
    return !previous || JSON.stringify(previous) !== JSON.stringify(template);
  });
  return { templates, upserts };
}

function normalizeImportedRecordId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
    ? id
    : createId();
}

function cloudEntryErrorMessage(error) {
  const errorContext = [error?.constraint, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(" ");
  const isDuplicate = error?.code === "23505"
    && /entries_user_company_track_unique_idx/iu.test(errorContext);
  return isDuplicate
    ? "同じ企業・種類のカードは別の端末ですでに登録されました。同期更新して既存カードへ追記してください。"
    : error?.message || "クラウドへ保存できませんでした。";
}

async function createCloudEntry(entry, scope = captureUserScope()) {
  const { data, error } = await supabaseClient.from("entries").insert(toDbEntry(entry)).select("*").single();
  if (!isCurrentUserScope(scope)) return null;
  if (error) {
    showToast(cloudEntryErrorMessage(error));
    return null;
  }
  return fromDbEntry(data);
}

async function updateCloudEntry(entry, baseEntry = entry, retryCount = 0, scope = captureUserScope()) {
  const draft = normalizeEntry(entry);
  const base = normalizeEntry(baseEntry || entry);
  const { id, user_id, created_at, ...changes } = toDbEntry(draft);
  let request = supabaseClient.from("entries").update(changes).eq("id", id);
  if (base.updatedAt) request = request.eq("updated_at", base.updatedAt);
  const { data, error } = await request.select("*");
  if (!isCurrentUserScope(scope)) return null;
  if (error) {
    showToast(cloudEntryErrorMessage(error));
    return null;
  }

  if (Array.isArray(data) && data.length === 1) return fromDbEntry(data[0]);
  if (retryCount >= 2) {
    showToast("別の端末で更新が続いています。最新状態を確認してから、もう一度保存してください。");
    return null;
  }

  const latest = await fetchCloudEntry(id, scope);
  if (!isCurrentUserScope(scope)) return null;
  if (!latest) {
    showToast("クラウド上の企業データを確認できませんでした。同期更新してからやり直してください。");
    return null;
  }

  const merge = mergeEntryVersions(base, draft, latest);
  if (merge.conflicts.length === 0) {
    return updateCloudEntry(merge.entry, latest, retryCount + 1, scope);
  }

  return requestEntryConflictResolution({ ...merge, draft, latest, scope });
}

async function fetchCloudEntry(id, scope = captureUserScope()) {
  const { data, error } = await supabaseClient.from("entries").select("*").eq("id", id).limit(1);
  if (!isCurrentUserScope(scope)) return null;
  if (error || !Array.isArray(data) || data.length !== 1) return null;
  return fromDbEntry(data[0]);
}

function mergeEntryVersions(baseEntry, draftEntry, latestEntry) {
  const base = normalizeEntry(baseEntry);
  const draft = normalizeEntry(draftEntry);
  const latest = normalizeEntry(latestEntry);
  const merged = normalizeEntry({ ...latest });
  const conflicts = [];

  entryMergeFields.forEach((field) => {
    const baseValue = base[field.key];
    const draftValue = draft[field.key];
    const latestValue = latest[field.key];
    const draftChanged = !entryFieldEquals(field, draftValue, baseValue);
    const latestChanged = !entryFieldEquals(field, latestValue, baseValue);

    if (draftChanged && latestChanged && !entryFieldEquals(field, draftValue, latestValue)) {
      conflicts.push(field);
      return;
    }

    if (draftChanged) merged[field.key] = cloneEntryFieldValue(draftValue);
  });

  merged.esItems = normalizeEsItems(merged.esItems, merged.esContent);
  merged.esContent = esItemsToLegacyText(merged.esItems);
  merged.updatedAt = latest.updatedAt;
  merged.createdAt = latest.createdAt;
  merged.sortOrder = latest.sortOrder;
  return { entry: normalizeEntry(merged), conflicts };
}

function entryFieldEquals(field, left, right) {
  if (field.type === "es") {
    return JSON.stringify(normalizeEsItems(left)) === JSON.stringify(normalizeEsItems(right));
  }
  return String(left || "") === String(right || "");
}

function cloneEntryFieldValue(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function requestEntryConflictResolution(conflict) {
  if (state.pendingEntryConflict) {
    showToast("先に表示中の保存確認を完了してください。");
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    state.pendingEntryConflict = { ...conflict, resolve, saving: false };
    renderEntryConflictDialog();
    if (typeof els.saveConflictDialog.showModal === "function") {
      els.saveConflictDialog.showModal();
    } else {
      els.saveConflictDialog.setAttribute("open", "");
    }
  });
}

function renderEntryConflictDialog() {
  const pending = state.pendingEntryConflict;
  if (!pending) return;

  els.saveConflictList.innerHTML = pending.conflicts.map((field, index) => `
    <article class="conflict-item">
      <h3>${escapeHtml(field.label)}</h3>
      ${conflictChoiceMarkup(field, index, "draft", "この端末の編集", pending.draft[field.key], true)}
      ${conflictChoiceMarkup(field, index, "latest", "クラウドの最新", pending.latest[field.key], false)}
    </article>
  `).join("");
}

function conflictChoiceMarkup(field, index, value, title, content, checked) {
  return `
    <label class="conflict-choice">
      <input type="radio" name="entry-conflict-${index}" value="${value}" ${checked ? "checked" : ""}>
      <span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(conflictValuePreview(field, content))}</small>
      </span>
    </label>
  `;
}

function conflictValuePreview(field, value) {
  if (field.type === "trash") return value ? "ゴミ箱に入っている" : "通常の一覧に表示";
  if (field.type === "es") {
    const items = normalizeEsItems(value);
    const answers = items.reduce((sum, item) => sum + item.variants.length, 0);
    const characters = items.reduce(
      (sum, item) => sum + item.variants.reduce((total, variant) => total + countCharacters(variant.answer), 0),
      0
    );
    return items.length > 0 ? `${items.length}問・回答${answers}件・合計${characters}字` : "未入力";
  }

  const text = String(value || "").trim();
  if (!text) return "未入力";
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

async function handleConflictSubmit(event) {
  event.preventDefault();
  const pending = state.pendingEntryConflict;
  if (!pending || pending.saving) return;

  pending.saving = true;
  els.resolveConflictButton.disabled = true;
  els.closeConflictButton.disabled = true;
  els.cancelConflictButton.disabled = true;
  els.resolveConflictButton.textContent = "安全に保存中...";

  const resolved = normalizeEntry({ ...pending.entry });
  pending.conflicts.forEach((field, index) => {
    const control = els.saveConflictForm.elements.namedItem(`entry-conflict-${index}`);
    const source = control?.value === "latest" ? pending.latest : pending.draft;
    resolved[field.key] = cloneEntryFieldValue(source[field.key]);
  });
  resolved.esItems = normalizeEsItems(resolved.esItems, resolved.esContent);
  resolved.esContent = esItemsToLegacyText(resolved.esItems);

  const { id, user_id, created_at, ...changes } = toDbEntry(resolved);
  const { data, error } = await supabaseClient
    .from("entries")
    .update(changes)
    .eq("id", id)
    .eq("updated_at", pending.latest.updatedAt)
    .select("*");

  if (!isCurrentUserScope(pending.scope) || state.pendingEntryConflict !== pending) return;

  if (error) {
    pending.saving = false;
    els.resolveConflictButton.disabled = false;
    els.closeConflictButton.disabled = false;
    els.cancelConflictButton.disabled = false;
    els.resolveConflictButton.textContent = "選んだ内容で安全に保存";
    showToast(cloudEntryErrorMessage(error));
    return;
  }

  if (!Array.isArray(data) || data.length !== 1) {
    showToast("確認中に別の更新が入りました。編集内容は残っているので、もう一度保存してください。");
    finishEntryConflict(null);
    return;
  }

  finishEntryConflict(fromDbEntry(data[0]));
}

function cancelEntryConflict() {
  if (state.pendingEntryConflict?.saving) return;
  finishEntryConflict(null);
}

function finishEntryConflict(result) {
  const pending = state.pendingEntryConflict;
  if (!pending) return;
  state.pendingEntryConflict = null;
  els.resolveConflictButton.disabled = false;
  els.closeConflictButton.disabled = false;
  els.cancelConflictButton.disabled = false;
  els.resolveConflictButton.textContent = "選んだ内容で安全に保存";
  els.saveConflictForm.reset();
  els.saveConflictList.textContent = "";
  if (els.saveConflictDialog.open) els.saveConflictDialog.close();
  pending.resolve(result);
}

async function createCloudTemplate(template, scope = captureUserScope()) {
  const { data, error } = await supabaseClient.from("es_templates").insert(toDbTemplate(template)).select("*").single();
  if (!isCurrentUserScope(scope)) return null;
  if (error) {
    showToast(error.message);
    return null;
  }
  return fromDbTemplate(data);
}

async function updateCloudTemplate(template, scope = captureUserScope()) {
  const { id, user_id, created_at, ...changes } = toDbTemplate(template);
  const { data, error } = await supabaseClient.from("es_templates").update(changes).eq("id", id).select("*").single();
  if (!isCurrentUserScope(scope)) return null;
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
  renderTodayActions();
  renderDeadlineList();
  renderEventList();
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
  els.activeCount.textContent = activeEntries().filter(isActive).length;
  els.trashCount.textContent = trashedEntries().length;
}

function renderTodayActions() {
  const isWeek = state.actionScope === "week";
  const actions = getTodayActions(isWeek ? 8 : 5);
  els.todayActionTitle.textContent = isWeek ? "1週間以内にやること" : "今日やること";
  els.todayActionCount.textContent = `${actions.length}件`;
  updateActionScopeButtons();

  if (actions.length === 0) {
    els.todayActionList.innerHTML = emptyState(
      isWeek
        ? "1週間以内の急ぎタスクはありません。余裕があるうちに気になる企業を整理しておくと強いです。"
        : "今日は急ぎのタスクはありません。気になる企業を1社だけ確認できたら十分です。"
    );
    return;
  }

  els.todayActionList.innerHTML = actions
    .map(({ entry, action }) => {
      return `
        <button class="today-action-item ${action.tone}" data-detail-id="${escapeAttribute(entry.id)}" type="button">
          <span class="today-action-company">${escapeHtml(entry.companyName)}</span>
          <strong>${escapeHtml(action.label)}</strong>
          <span>${escapeHtml(action.meta)}</span>
        </button>
      `;
    })
    .join("");
}

function setActionScope(scope) {
  state.actionScope = actionScopes.includes(scope) ? scope : "today";
  localStorage.setItem(actionScopeStorageKey, state.actionScope);
  renderTodayActions();
}

function updateActionScopeButtons() {
  els.actionScopeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.actionScope === state.actionScope);
  });
}

function setCompanyFilter(filter) {
  state.filter = filter || "all";
  updateCompanyFilterButtons();
}

function updateCompanyFilterButtons() {
  els.filterButtons.forEach((button) => {
    const filter = button.dataset.filter;
    button.classList.toggle("active", filter === state.filter);
    const count = button.querySelector("[data-filter-count]");
    if (count) count.textContent = countEntriesForListFilter(filter);
  });
}

function countEntriesForListFilter(filter) {
  const entries = state.entries
    .filter((entry) => matchesStandaloneListFilter(entry, filter))
    .filter(matchesSearchQuery)
    .filter(matchesIndustryFilter)
    .filter(matchesDeadlineFilter)
    .filter(matchesPriorityFilter);
  return filter === trashFilterValue ? entries.length : window.SHUKATSU_GROUPS.group(entries).length;
}

function matchesStandaloneListFilter(entry, filter) {
  if (filter === trashFilterValue) return isTrashed(entry);
  if (isTrashed(entry)) return false;
  if (filter === "all") return true;
  if (filter === "active") return isActive(entry);
  if (filter === "finished") return isFinished(entry);
  return entry.trackType === filter;
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
            ${trackTag(entry.trackType)}
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
            <span class="tag green">${escapeHtml(entry.eventType || "予定")}</span>
          </div>
          <div class="meta-row">
            <span>${formatDate(entry.eventDate)}</span>
            ${trackTag(entry.trackType)}
            <span>${escapeHtml(simpleStatus(entry.status))}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderBulkIcons() {
  const job = state.bulkIcons;
  const count = state.entries.filter(window.SHUKATSU_ICONS.needsIcon).length;
  const running = Boolean(job?.running);
  els.bulkIconControls.hidden = (!count && !job) || (state.mode === "cloud" && !state.session);
  els.bulkIconButton.disabled = running || !count || state.loading;
  els.bulkIconButton.textContent = running ? "アイコンを一括設定中…" : `未設定アイコンを一括設定（${count}件）`;
  els.cancelBulkIconButton.hidden = !running;
  els.cancelBulkIconButton.disabled = Boolean(job?.controller.signal.aborted);
  els.cancelBulkIconButton.textContent = job?.controller.signal.aborted ? "停止中…" : "途中で止める";
  const p = job?.progress;
  els.bulkIconStatus.textContent = p
    ? `${running ? `${p.completed} / ${p.total}件${p.currentName ? `・${p.currentName}を確認中` : ""}` : p.stopped ? "停止しました" : "一括設定が完了しました"}。設定 ${p.saved}件・候補なし／要確認 ${p.missing}件・変更済み ${p.skipped}件・失敗 ${p.failed}件。${p.reason || (!running && p.missing ? "見つからない企業は、企業の編集で公式サイトURLを追加できます。" : "")}`
    : "結果済みを含む全企業が対象です。見つかった分から自動保存します。";
}

async function saveBulkIcon(entry, url, scope) {
  if (!isCurrentUserScope(scope) || !window.SHUKATSU_ICONS.needsIcon(entry)
    || state.entries.find((item) => item.id === entry.id) !== entry) return "skipped";
  let saved;
  if (state.mode === "cloud") {
    if (!state.session || !entry.updatedAt) return "skipped";
    const { data, error } = await supabaseClient.from("entries")
      .update({ logo_url: url }).eq("id", entry.id).eq("user_id", scope.userId)
      .eq("updated_at", entry.updatedAt).select("*");
    if (!isCurrentUserScope(scope)) return "skipped";
    if (error) throw Object.assign(new Error("保存できなかったため停止しました。接続を確認して再度お試しください。"), { stopBatch: true });
    if (data?.length !== 1) return "skipped";
    saved = fromDbEntry(data[0]);
  } else {
    saved = { ...entry, logoUrl: url, updatedAt: new Date().toISOString() };
    const next = state.entries.map((item) => item === entry ? saved : item);
    if (!saveLocalEntries(next)) throw Object.assign(new Error("端末に保存できなかったため停止しました。"), { stopBatch: true });
  }
  // A newer local edit must not be replaced by a response already in flight.
  state.entries = state.entries.map((item) => item === entry ? saved : item);
  renderCompanyList();
  return "saved";
}

async function handleBulkIcons() {
  if (state.bulkIcons?.running || state.loading || (state.mode === "cloud" && !state.session)) return;
  const scope = captureUserScope();
  const job = { controller: new AbortController(), running: true, progress: null };
  state.bulkIcons = job;
  renderBulkIcons();
  try {
    await window.SHUKATSU_ICONS.fillMissingIcons({
      entries: state.entries, signal: job.controller.signal,
      getEntry: (id) => isCurrentUserScope(scope) ? state.entries.find((item) => item.id === id) : null,
      save: (entry, url) => saveBulkIcon(entry, url, scope),
      onProgress: (progress) => {
        if (state.bulkIcons !== job || !isCurrentUserScope(scope)) return;
        job.progress = progress;
        renderBulkIcons();
      }
    });
  } catch (error) {
    if (isCurrentUserScope(scope)) showToast("一括設定を停止しました。保存済みのアイコンは残っています。");
  } finally {
    job.running = false;
    if (state.bulkIcons === job && isCurrentUserScope(scope)) renderBulkIcons();
  }
}

function renderCompanyList() {
  renderBulkIcons();
  renderSummerMigration();
  const isTrashView = state.filter === trashFilterValue;
  const trashEntries = trashedEntries();
  const isCompact = !isTrashView && state.companyViewMode === "compact";
  const isMedium = !isTrashView && state.companyViewMode === "medium";
  const entries = state.entries
    .filter(matchesListFilter)
    .filter(matchesSearchQuery)
    .filter(matchesIndustryFilter)
    .filter(matchesDeadlineFilter)
    .filter(matchesPriorityFilter)
    .sort(isTrashView ? sortTrashedEntries : sortCompanyEntries);

  updateCompanyViewButtons();
  updateCompanyFilterButtons();
  els.companyList.classList.toggle("compact-view", isCompact);
  els.companyList.classList.toggle("medium-view", isMedium);
  els.companyList.classList.toggle("trash-view", isTrashView);
  els.emptyTrashButton.hidden = !isTrashView || trashEntries.length === 0;
  els.emptyTrashButton.disabled = state.trashDeletePending;
  els.emptyTrashButton.textContent = state.trashDeletePending
    ? "完全削除中..."
    : `ゴミ箱を空にする (${trashEntries.length})`;

  if (entries.length === 0) {
    els.companyList.innerHTML = emptyState(
      isTrashView
        ? "ゴミ箱は空です。ここに移動した企業は、必要になったら復元できます。"
        : "条件に合う企業がありません。採用・不採用の企業も「すべて」または「結果済み」に残ります。"
    );
    return;
  }

  if (isTrashView) {
    els.companyList.innerHTML = entries
      .map((entry) => {
        const officialUrl = normalizeExternalUrl(entry.officialUrl);
        const mypageUrl = normalizeExternalUrl(entry.mypageUrl);
        return `
          <article class="company-card trash-card" data-company-card data-company-id="${escapeAttribute(entry.id)}">
            <div class="company-title-row">
              <div class="company-identity">
                ${companyIconMarkup(entry)}
                <div>
                  <strong>${escapeHtml(entry.companyName)}</strong>
                  <div class="meta-row">
                    ${trackTag(entry.trackType)}
                    ${statusTag(entry.status)}
                  </div>
                </div>
              </div>
              <div class="card-actions">
                <button class="restore-button" data-restore-id="${escapeAttribute(entry.id)}" type="button" ${state.trashDeletePending ? "disabled" : ""}>復元</button>
                <button class="delete-button" data-permanent-delete-id="${escapeAttribute(entry.id)}" type="button" ${state.trashDeletePending ? "disabled" : ""}>完全削除</button>
              </div>
            </div>
            <div class="meta-row">
              <span>ゴミ箱へ移動 ${formatDateTime(entry.deletedAt)}</span>
              ${entry.deadline ? `<span>${formatDate(entry.deadline)} 締切</span>` : ""}
              ${entry.eventDate ? `<span>${formatDate(entry.eventDate)} 予定</span>` : ""}
            </div>
            ${entry.mypageId ? `<div class="credential-line"><strong>マイページID</strong><span>${escapeHtml(entry.mypageId)}</span></div>` : ""}
            ${officialUrl ? `<a class="mypage-link" href="${escapeAttribute(officialUrl)}" target="_blank" rel="noopener noreferrer">企業公式サイトを開く</a>` : ""}
            ${mypageUrl ? `<a class="mypage-link" href="${escapeAttribute(mypageUrl)}" target="_blank" rel="noopener noreferrer">企業マイページを開く</a>` : ""}
          </article>
        `;
      })
      .join("");
    return;
  }

  renderCompanyGroups(entries);
}

function renderCompanyGroups(visibleEntries) {
  const model = window.SHUKATSU_GROUPS;
  const groups = model.group(visibleEntries);
  const visibleIds = new Set(visibleEntries.map((entry) => entry.id));
  els.companyList.innerHTML = groups.map((group) => {
    const source = group.entries[0];
    const branches = model.branches(state.entries, source);
    const icon = branches.find((entry) => entry.logoUrl) || source;
    const available = model.availableTracks(state.entries, source);
    return `<article class="company-card company-group-card" data-company-card data-company-id="${escapeAttribute(source.id)}">
      <div class="company-group-heading">
        <button class="company-group-open" data-detail-id="${escapeAttribute(source.id)}" type="button" title="${escapeAttribute(source.companyName)}の詳細">
          ${companyIconMarkup(icon)}<span><strong>${escapeHtml(source.companyName)}</strong></span>
        </button>
        <button class="company-add-branch" data-add-company-track="${escapeAttribute(source.id)}" type="button" aria-label="${escapeAttribute(source.companyName)}に選考を追加" title="${available.length ? "選考を追加" : "すべての選考を追加済み"}" ${available.length ? "" : "disabled"}>＋</button>
      </div>
      <div class="company-branches" role="group" aria-label="${escapeAttribute(source.companyName)}の選考">
        ${branches.map((entry) => `<div class="company-branch ${state.filter !== "all" && visibleIds.has(entry.id) ? "is-filter-match" : ""}">
          <button class="company-branch-detail" data-detail-id="${escapeAttribute(entry.id)}" type="button" aria-label="${escapeAttribute(entry.companyName)}・${escapeAttribute(entry.trackType)}の詳細">${trackTag(entry.trackType)}</button>
          ${companyStatusPicker(entry)}
        </div>`).join("")}
      </div>
    </article>`;
  }).join("");
}

function companyStatusPicker(entry) {
  const pending = state.pendingStatusChanges.has(entry.id);
  return `<label class="company-status-control" aria-busy="${pending}">
    <span aria-hidden="true">${statusTag(entry.status)}</span>
    <select data-company-status="${escapeAttribute(entry.id)}" aria-label="${escapeAttribute(entry.companyName)}・${escapeAttribute(entry.trackType)}の進捗" title="進捗を変更" ${pending ? "disabled" : ""}>
      ${simpleStatuses.map((status) => `<option value="${escapeAttribute(status)}" ${status === simpleStatus(entry.status) ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
    </select>
  </label>`;
}

async function handleCompanyStatusChange(control) {
  const id = control.dataset.companyStatus;
  const status = control.value;
  const entry = state.entries.find((item) => item.id === id && !isTrashed(item));
  if (!entry || state.pendingStatusChanges.has(id)) return;
  if (!simpleStatuses.includes(status) || status === simpleStatus(entry.status)) {
    control.value = simpleStatus(entry.status);
    return;
  }

  const scope = captureUserScope();
  const pending = state.pendingStatusChanges;
  const wasFocused = document.activeElement === control;
  pending.add(id);
  control.disabled = true;
  control.closest(".company-status-control")?.setAttribute("aria-busy", "true");
  try {
    let saved;
    if (state.mode === "cloud") {
      if (!scope.userId || !entry.updatedAt) {
        showToast("同期更新してから、もう一度変更してください。");
        return;
      }
      const { data, error } = await supabaseClient.from("entries")
        .update({ status }).eq("id", id).eq("user_id", scope.userId)
        .eq("updated_at", entry.updatedAt).select("*");
      if (!isCurrentUserScope(scope)) return;
      if (error) throw error;
      if (data?.length !== 1) {
        const latest = await fetchCloudEntry(id, scope);
        if (!isCurrentUserScope(scope)) return;
        if (latest) state.entries = state.entries.map((item) => item === entry ? latest : item);
        showToast("別の更新があったため保存していません。最新の進捗を確認して、もう一度選んでください。");
        return;
      }
      saved = fromDbEntry(data[0]);
    } else {
      saved = { ...entry, status, updatedAt: new Date().toISOString() };
      const next = state.entries.map((item) => item === entry ? saved : item);
      if (!saveLocalEntries(next)) return;
    }
    // Do not replace an edit or refresh that completed while this request was in flight.
    state.entries = state.entries.map((item) => item === entry ? saved : item);
    showToast(`${entry.companyName}（${entry.trackType}）を「${status}」に変更しました。`);
  } catch {
    if (isCurrentUserScope(scope)) showToast("進捗を保存できませんでした。接続を確認して、もう一度お試しください。");
  } finally {
    pending.delete(id);
    if (isCurrentUserScope(scope)) {
      const restoreFocus = document.activeElement === control || (wasFocused && document.activeElement === document.body);
      render();
      if (restoreFocus) Array.from(els.companyList.querySelectorAll("[data-company-status]"))
        .find((item) => item.dataset.companyStatus === id)?.focus({ preventScroll: true });
    }
  }
}

function renderDetailBranches(entry) {
  const model = window.SHUKATSU_GROUPS;
  els.detailBranchNavigation.innerHTML = model.branches(state.entries, entry).map((branch) =>
    `<button class="secondary-button small-button" data-switch-branch="${escapeAttribute(branch.id)}" aria-pressed="${branch.id === entry.id}" type="button">${escapeHtml(branch.trackType === "インターン" ? "未分類インターン" : branch.trackType)}</button>`
  ).join("") + `<button class="secondary-button small-button" data-add-company-track="${escapeAttribute(entry.id)}" type="button" ${model.availableTracks(state.entries, entry).length ? "" : "disabled"}>＋選考を追加</button>`;
}

async function prepareBranchNavigation() {
  if (state.detailSavePending) return false;
  if (!els.companyDetailDialog.open) return true;
  const scope = captureUserScope();
  const base = state.detailBaseEntry;
  const esItems = collectDetailEsItems();
  const changed = base && (JSON.stringify(esItems) !== JSON.stringify(base.esItems)
    || els.detailMemoInput.value.trim() !== base.memo);
  if (changed) return Boolean(await handleDetailSubmit({ preventDefault() {} })) && isCurrentUserScope(scope);
  closeCompanyDetail();
  return isCurrentUserScope(scope);
}

async function switchCompanyBranch(id) {
  if (id === state.detailEditingId) return;
  if (!await prepareBranchNavigation()) return;
  if (state.entries.some((entry) => entry.id === id && !isTrashed(entry))) openCompanyDetail(id);
}

async function openBranchChooser(id) {
  if (!await prepareBranchNavigation()) return;
  const entry = state.entries.find((item) => item.id === id && !isTrashed(item));
  if (!entry) return;
  const available = window.SHUKATSU_GROUPS.availableTracks(state.entries, entry);
  els.addBranchTitle.textContent = `${entry.companyName}に選考を追加`;
  els.addBranchChoices.innerHTML = window.SHUKATSU_GROUPS.tracks.map((track) =>
    `<button class="secondary-button" data-new-company-track="${escapeAttribute(track)}" data-source-id="${escapeAttribute(id)}" type="button" ${available.includes(track) ? "" : "disabled"}>${escapeHtml(track)}${available.includes(track) ? "" : "（登録済み）"}</button>`
  ).join("");
  els.addBranchDialog.showModal();
}

function createCompanyBranch(id, track) {
  const source = state.entries.find((entry) => entry.id === id && !isTrashed(entry));
  if (!source || !window.SHUKATSU_GROUPS.availableTracks(state.entries, source).includes(track)) return;
  const draft = window.SHUKATSU_GROUPS.branchDraft(source, track, createId(), new Date().toISOString());
  els.addBranchDialog.close();
  openEntryDialog(null, { draft, isBranch: true });
}

function renderSummerMigration() {
  const count = activeEntries().filter((entry) => entry.trackType === "インターン").length;
  const job = state.summerMigration;
  els.legacySummerControls.hidden = (!count && !job) || (state.mode === "cloud" && !state.session);
  els.moveLegacySummerButton.hidden = !count && !job?.running;
  els.moveLegacySummerButton.disabled = Boolean(job?.running || state.loading || !count);
  els.moveLegacySummerButton.textContent = job?.running ? "夏インターンへ移動中…" : `未分類${count}件を夏インターンへまとめる`;
  els.legacySummerStatus.textContent = job
    ? `${job.running ? "移動中" : "移動結果"}：${job.saved}件を夏インターンに変更。${job.skipped}件は変更済み・重複のためスキップ。${job.error || ""}`
    : "ES・メモ・進捗をそのまま残し、企業内の夏インターンへ一括で移します。";
}

async function handleSummerMigration() {
  if (state.summerMigration?.running || state.loading || (state.mode === "cloud" && !state.session)) return;
  const scope = captureUserScope();
  const job = { running: true, saved: 0, skipped: 0, error: "" };
  state.summerMigration = job;
  const ids = activeEntries().filter((entry) => entry.trackType === "インターン").map((entry) => entry.id);
  renderSummerMigration();
  try {
    for (const id of ids) {
      if (!isCurrentUserScope(scope)) return;
      const entry = state.entries.find((item) => item.id === id);
      if (!window.SHUKATSU_GROUPS.canMoveToSummer(state.entries, entry)) { job.skipped++; continue; }
      let saved = { ...entry, trackType: "夏インターン", updatedAt: new Date().toISOString() };
      if (state.mode === "cloud") {
        if (!entry.updatedAt) { job.skipped++; continue; }
        const { data, error } = await supabaseClient.from("entries").update({ track_type: "夏インターン" })
          .eq("id", id).eq("user_id", scope.userId).eq("track_type", "インターン").eq("updated_at", entry.updatedAt).select("*");
        if (!isCurrentUserScope(scope)) return;
        if (error?.code === "23505") { job.skipped++; continue; }
        if (error) throw new Error("保存できなかったため停止しました。同期更新して再実行できます。");
        if (data?.length !== 1) { job.skipped++; continue; }
        saved = fromDbEntry(data[0]);
      }
      const next = state.entries.map((item) => item === entry ? saved : item);
      if (state.mode === "local" && !saveLocalEntries(next)) throw new Error("端末に保存できなかったため停止しました。");
      state.entries = next;
      job.saved++;
      renderCompanyList();
    }
  } catch (error) {
    job.error = error.message;
  } finally {
    job.running = false;
    if (state.summerMigration === job && isCurrentUserScope(scope)) render();
  }
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
              <button class="detail-button" data-template-copy-id="${escapeAttribute(template.id)}" type="button">コピー</button>
              <button class="edit-button" data-template-edit-id="${escapeAttribute(template.id)}" type="button">編集</button>
              <button class="delete-button" data-template-delete-id="${escapeAttribute(template.id)}" type="button">削除</button>
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

function openEntryDialog(entry = null, options = {}) {
  const draft = options.draft ? normalizeEntry(options.draft) : null;
  const conflictDetails = mergeImportConflictDetails(options.conflictDetails);
  state.editingId = entry?.id || null;
  state.editingBaseEntry = entry ? normalizeEntry(entry) : null;
  state.entryDraft = draft;
  state.entryImportConflictDetails = conflictDetails;
  state.entryImportReviewKey = String(options.importReviewKey || "");
  state.entryImportValueApplied = false;
  state.entryDraftKind = options.isAiMerge
    ? "ai-merge"
    : options.isAiConflict
      ? "ai-conflict"
    : options.isHandoff
      ? "handoff"
      : options.isAiDraft
        ? "ai"
        : draft
          ? "draft"
          : null;
  els.entryFormTitle.textContent = options.isAiMerge
    ? "新情報を既存カードに追加"
    : options.isAiConflict
      ? "取込内容との違いを確認"
    : entry
      ? "企業・選考を編集"
    : options.isHandoff
      ? "次の選考へ引き継ぐ"
      : options.isAiDraft
        ? "取込カード案を確認"
      : "企業・選考を追加";
  els.deleteEntryButton.hidden = !entry || options.isAiMerge || options.isAiConflict;
  fillEntryForm(options.isAiMerge ? draft : entry || draft);
  els.entryForm.elements.companyName.readOnly = Boolean(options.isBranch);
  if (options.isBranch) {
    state.entryDraftKind = "branch";
    els.entryFormTitle.textContent = `${draft.companyName} / ${draft.trackType}を追加`;
  }
  const conflictMarkup = importConflictDetailsMarkup(conflictDetails, { embedded: true });
  els.entryImportConflictNotice.innerHTML = conflictMarkup;
  els.entryImportConflictNotice.hidden = !conflictMarkup;
  updateTrackTypeHint();
  updateEntrySaveButton();

  if (typeof els.entryDialog.showModal === "function") {
    els.entryDialog.showModal();
  } else {
    els.entryDialog.setAttribute("open", "");
  }
}

function fillEntryForm(entry) {
  state.iconPicker?.reset();
  const values = normalizeEntry(entry || {});
  setFormValue("companyName", entry ? values.companyName : "");
  setFormValue("mypageId", entry ? values.mypageId : "");
  setFormValue("officialUrl", entry ? values.officialUrl : "");
  setFormValue("logoUrl", entry ? values.logoUrl : "");
  setFormValue("mypageUrl", entry ? values.mypageUrl : "");
  setFormValue("trackType", values.trackType);
  setFormValue("status", simpleStatus(values.status));
  setFormValue("deadline", entry ? values.deadline : "");
  setFormValue("priority", values.priority === "未定" ? "" : values.priority);
  setFormValue("esContent", entry ? entryEsText(values) : "");
  setFormValue("memo", entry ? values.memo : "");
  state.iconPicker?.schedule();
}

function setFormValue(name, value) {
  const field = els.entryForm.elements.namedItem(name);
  if (field) field.value = value;
}

function resetEntryForm() {
  state.iconPicker?.reset();
  state.editingId = null;
  state.editingBaseEntry = null;
  state.entryDraft = null;
  state.entryDraftKind = null;
  state.entryImportConflictDetails = [];
  state.entryImportReviewKey = "";
  state.entryImportValueApplied = false;
  els.entryImportConflictNotice.textContent = "";
  els.entryImportConflictNotice.hidden = true;
  els.entryForm.reset();
  els.entryForm.elements.companyName.readOnly = false;
  els.entryFormTitle.textContent = "企業・選考を追加";
  els.deleteEntryButton.hidden = true;
  updateEntrySaveButton();
  updateTrackTypeHint();
}

function closeEntryFormDialog() {
  const returnToImport = ["ai", "ai-merge", "ai-conflict"].includes(state.entryDraftKind) && state.aiCards.length;
  resetEntryForm();
  if (els.entryDialog.open) els.entryDialog.close();
  if (returnToImport) openAiImportDialog({ focusResults: true });
}

function updateEntrySaveButton() {
  els.saveEntryButton.disabled = state.entrySavePending;
  if (state.entrySavePending) {
    els.saveEntryButton.textContent = "安全に保存中...";
  } else if (state.entryDraftKind === "ai-merge") {
    els.saveEntryButton.textContent = state.entryImportValueApplied
      ? "選んだ内容で新情報を追加"
      : "新情報を追加（現在値は維持）";
  } else if (state.entryDraftKind === "ai-conflict") {
    els.saveEntryButton.textContent = state.entryImportValueApplied
      ? "選んだ内容で更新"
      : "現在値を維持して確認完了";
  } else if (state.editingId) {
    els.saveEntryButton.textContent = "更新";
  } else if (state.entryDraft) {
    els.saveEntryButton.textContent = state.entryDraftKind === "handoff" ? "引き継いで追加" : "確認して保存";
  } else {
    els.saveEntryButton.textContent = "保存";
  }
}

function updateTrackTypeHint() {
  const trackType = els.trackTypeInput.value;
  els.trackTypeHint.textContent = trackTypeHints[trackType] || "予定や接点の種類に合わせて選びます。";
}

function clearCompanyFilters() {
  state.searchQuery = "";
  state.industryFilter = "all";
  state.deadlineFilter = "all";
  state.priorityFilter = "all";
  els.companySearchInput.value = "";
  els.deadlineFilterInput.value = "all";
  els.priorityFilterInput.value = "all";
  renderCompanyList();
}

function loadLocalEntries() {
  const savedEntries = readSavedLocalEntries();
  return savedEntries;
}

function readSavedLocalEntries() {
  return readLocalCollection(
    storageKey,
    storagePendingKey,
    storageBackupKey,
    normalizeEntry,
    "企業データ"
  ).filter((entry) => !sampleCompanyNames.includes(entry.companyName));
}

function saveLocalEntries(entries) {
  return saveLocalCollection(
    storageKey,
    storagePendingKey,
    storageBackupKey,
    entries,
    normalizeEntry,
    "企業データ"
  );
}

function loadLocalTemplates() {
  return readLocalCollection(
    templateStorageKey,
    templateStoragePendingKey,
    templateStorageBackupKey,
    normalizeTemplate,
    "ESの型"
  );
}

function saveLocalTemplates(templates) {
  return saveLocalCollection(
    templateStorageKey,
    templateStoragePendingKey,
    templateStorageBackupKey,
    templates,
    normalizeTemplate,
    "ESの型"
  );
}

function readLocalCollection(primaryKey, pendingKey, backupKey, normalize, label) {
  const candidates = [primaryKey, pendingKey, backupKey];

  for (const key of candidates) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      if (key !== primaryKey) {
        try {
          localStorage.setItem(primaryKey, raw);
          localStorage.removeItem(pendingKey);
        } catch {
          // The recovered data is still usable in memory even when storage is full.
        }
        window.setTimeout(() => showToast(`${label}を直前の正常な状態から復元しました。`), 0);
      }

      return parsed.map(normalize);
    } catch {
      // Try the pending write, then the last known good copy.
    }
  }

  return [];
}

function saveLocalCollection(primaryKey, pendingKey, backupKey, items, normalize, label) {
  const normalized = items.map(normalize);
  const serialized = JSON.stringify(normalized);

  try {
    const verified = JSON.parse(serialized);
    if (!Array.isArray(verified) || verified.length !== normalized.length) {
      throw new Error("保存内容の検証に失敗しました。");
    }

    const previous = localStorage.getItem(primaryKey);
    localStorage.setItem(pendingKey, serialized);
    if (isValidLocalCollection(previous)) localStorage.setItem(backupKey, previous);
    localStorage.setItem(primaryKey, serialized);

    const written = localStorage.getItem(primaryKey);
    if (!isValidLocalCollection(written) || JSON.parse(written).length !== normalized.length) {
      throw new Error("保存後の検証に失敗しました。");
    }

    localStorage.removeItem(pendingKey);
    return true;
  } catch {
    showToast(`${label}を保存できませんでした。直前のデータは保護されています。`);
    return false;
  }
}

function isValidLocalCollection(raw) {
  if (!raw) return false;
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

function toDbEntry(entry, options = {}) {
  const values = normalizeEntry(entry);
  const payload = {
    id: values.id,
    user_id: state.session.user.id,
    company_name: values.companyName,
    industry: values.industry,
    mypage_id: values.mypageId,
    official_url: values.officialUrl,
    logo_url: values.logoUrl,
    track_type: values.trackType,
    status: values.status,
    deadline: values.deadline || null,
    event_date: values.eventDate || null,
    event_type: values.eventType,
    priority: values.priority,
    mypage_url: values.mypageUrl,
    es_content: values.esContent,
    es_items: normalizeEsItems(values.esItems, values.esContent),
    interview_notes: values.interviewNotes,
    memo: values.memo,
    created_at: values.createdAt || new Date().toISOString()
  };

  if (options.includeSortOrder && Number.isFinite(values.sortOrder)) {
    payload.sort_order = values.sortOrder;
  }

  if (state.cloudDeletedAtAvailable) {
    payload.deleted_at = values.deletedAt || null;
  }

  return payload;
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
    updatedAt: row.updated_at || row.created_at,
    sortOrder: Number(row.sort_order),
    deletedAt: row.deleted_at || ""
  });
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function restoreLocalCollectionSnapshot(primaryKey, pendingKey, backupKey, rawSnapshot) {
  try {
    localStorage.removeItem(primaryKey);
    localStorage.removeItem(pendingKey);
    if (isValidLocalCollection(rawSnapshot)) {
      localStorage.setItem(primaryKey, rawSnapshot);
      localStorage.setItem(backupKey, rawSnapshot);
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeStoredText(value, maxCharacters, options = {}) {
  if (typeof value !== "string") return "";
  let text = value
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
    .replace(/[\u200B-\u200D\u2060\u202A-\u202E\u2066-\u2069]/gu, "")
    .normalize("NFC");
  if (options.singleLine) text = text.replace(/\s*\n\s*/gu, " ");
  return Array.from(text).slice(0, maxCharacters).join("").trim();
}

function normalizeStoredDate(value) {
  const text = normalizeStoredText(value, 10, { singleLine: true });
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? text
    : "";
}

function normalizeStoredTimestamp(value, fallback = "") {
  const text = normalizeStoredText(value, 64, { singleLine: true });
  return text && Number.isFinite(Date.parse(text)) ? text : fallback;
}

function normalizeEntry(entry = {}) {
  const source = isPlainRecord(entry) ? entry : {};
  const now = new Date().toISOString();
  const createdAt = normalizeStoredTimestamp(source.createdAt, now);
  const trackType = normalizeStoredText(source.trackType, 40, { singleLine: true });
  const status = normalizeStoredText(source.status, 40, { singleLine: true });
  const priority = normalizeStoredText(source.priority, 10, { singleLine: true });
  const eventType = normalizeStoredText(source.eventType, 40, { singleLine: true });
  const allowedEventTypes = new Set(["", "ES締切", "Webテスト", "面接", "説明会", "面談", "インターン", "その他"]);
  return {
    id: normalizeStoredText(source.id, 120, { singleLine: true }) || createId(),
    companyName: normalizeStoredText(source.companyName, 200, { singleLine: true }),
    industry: normalizeStoredText(source.industry, 200, { singleLine: true }),
    mypageId: normalizeStoredText(source.mypageId, 500, { singleLine: true }),
    officialUrl: normalizeExternalUrl(source.officialUrl),
    // Keep a valid web URL without loading it. Loading has a stricter policy
    // in companyLogoSources, so older/unsupported URLs are not destroyed when
    // an unrelated card is saved.
    logoUrl: normalizeExternalUrl(source.logoUrl),
    trackType: Object.hasOwn(trackTypeHints, trackType) ? trackType : "本選考",
    status: [...activeStatuses, ...finishedStatuses].includes(status) ? status : "気になる",
    deadline: normalizeStoredDate(source.deadline),
    eventDate: normalizeStoredDate(source.eventDate),
    eventType: allowedEventTypes.has(eventType) ? eventType : "",
    priority: ["最優先", "高", "中", "低", "未定"].includes(priority) ? priority : "未定",
    mypageUrl: normalizeExternalUrl(source.mypageUrl),
    esContent: normalizeStoredText(source.esContent, 200_000),
    esItems: normalizeEsItems(source.esItems, source.esContent),
    interviewNotes: normalizeStoredText(source.interviewNotes, 100_000),
    memo: normalizeStoredText(source.memo, 100_000),
    createdAt,
    updatedAt: normalizeStoredTimestamp(source.updatedAt, createdAt),
    sortOrder: typeof source.sortOrder === "number" && Number.isFinite(source.sortOrder) ? source.sortOrder : Number.NaN,
    deletedAt: normalizeStoredTimestamp(source.deletedAt)
  };
}

function createEsItem(question = "", answer = "") {
  const safeQuestion = normalizeStoredText(question, 2_000);
  const safeAnswer = normalizeStoredText(answer, 200_000);
  const variant = createEsVariant("", safeAnswer);
  return {
    id: createId(),
    question: safeQuestion,
    answer: safeAnswer,
    variants: [variant],
    activeVariantId: variant.id
  };
}

function createEsVariant(label = "", answer = "") {
  return {
    id: createId(),
    label: normalizeStoredText(label, 200, { singleLine: true }),
    answer: normalizeStoredText(answer, 200_000)
  };
}

function normalizeEsItems(items, legacyContent = "") {
  const normalized = Array.isArray(items)
    ? items.slice(0, 200)
        .filter(isPlainRecord)
        .map(normalizeEsItem)
        .filter((item) => item.question.trim() || item.variants.some((variant) => variant.label.trim() || variant.answer.trim()))
    : [];

  if (normalized.length > 0) return normalized;

  const legacyAnswer = normalizeStoredText(legacyContent, 200_000);
  return legacyAnswer ? [createEsItem("", legacyAnswer)] : [];
}

function normalizeEsItem(item = {}) {
  const source = isPlainRecord(item) ? item : {};
  const variants = normalizeEsVariants(source.variants, source.answer);
  const requestedActiveId = normalizeStoredText(source.activeVariantId, 120, { singleLine: true });
  const activeVariantId = variants.some((variant) => variant.id === requestedActiveId)
    ? requestedActiveId
    : variants[0]?.id || "";
  const activeVariant = variants.find((variant) => variant.id === activeVariantId) || variants[0];

  return {
    id: normalizeStoredText(source.id, 120, { singleLine: true }) || createId(),
    question: normalizeStoredText(source.question, 2_000),
    answer: activeVariant?.answer || "",
    variants,
    activeVariantId
  };
}

function normalizeEsVariants(variants, legacyAnswer = "") {
  const candidates = Array.isArray(variants)
    ? variants.slice(0, 20)
        .filter(isPlainRecord)
        .map((variant) => ({
          id: normalizeStoredText(variant.id, 120, { singleLine: true }) || createId(),
          label: normalizeStoredText(variant.label, 200, { singleLine: true }),
          answer: normalizeStoredText(variant.answer, 200_000)
        }))
    : [];
  const normalized = candidates.filter((variant) => variant.label.trim() || variant.answer.trim());

  if (normalized.length > 0) return normalized;
  const safeLegacyAnswer = normalizeStoredText(legacyAnswer, 200_000);
  if (candidates.length > 0) {
    return [{ ...candidates[0], label: "", answer: safeLegacyAnswer }];
  }
  return [createEsVariant("", safeLegacyAnswer)];
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

function normalizeTemplate(template = {}) {
  const source = isPlainRecord(template) ? template : {};
  const now = new Date().toISOString();
  const createdAt = normalizeStoredTimestamp(source.createdAt, now);
  return {
    id: normalizeStoredText(source.id, 120, { singleLine: true }) || createId(),
    kind: normalizeStoredText(source.kind, 120, { singleLine: true }) || "ガクチカ",
    title: normalizeStoredText(source.title, 500, { singleLine: true }),
    body: normalizeStoredText(source.body, 200_000),
    createdAt,
    updatedAt: normalizeStoredTimestamp(source.updatedAt, createdAt),
    sortOrder: typeof source.sortOrder === "number" && Number.isFinite(source.sortOrder) ? source.sortOrder : Number.NaN
  };
}

function toDbTemplate(template, options = {}) {
  const values = normalizeTemplate(template);
  const payload = {
    id: values.id,
    user_id: state.session.user.id,
    kind: values.kind,
    title: values.title,
    body: values.body,
    created_at: values.createdAt || new Date().toISOString(),
    updated_at: values.updatedAt || new Date().toISOString()
  };
  if (options.includeSortOrder && Number.isFinite(values.sortOrder)) {
    payload.sort_order = values.sortOrder;
  }
  return payload;
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
  if (existingEntry && simpleStatus(existingEntry.status) === simpleStatus(entry.status)) return null;

  if (["落選", "不採用"].includes(entry.status)) {
    return {
      eyebrow: "Not the End",
      title: "なんて見る目のない企業なの！！",
      message: `${entry.companyName}はここで切り替え。もっと合う企業に、こっちから会いにいこう。`,
      bubble: "見る目ない！",
      mood: "angry",
      toast: `${entry.companyName}、見る目ない！`
    };
  }

  if (["内定", "採用"].includes(entry.status)) {
    return {
      title: "採用おめでとう！",
      message: `${entry.companyName}、本当におめでとう。ここまで積み上げた準備と粘り、ちゃんと届いた。`,
      bubble: "採用だー！",
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

  if (["インターン", "夏インターン", "冬インターン"].includes(entry.trackType)) {
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
  if (state.aiReturnAfterCelebration && state.aiCards.length) {
    state.aiReturnAfterCelebration = false;
    openAiImportDialog({ focusResults: true });
  }
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
  els.mascot.setAttribute("aria-expanded", "true");
  showMascotBubble("相談のるよ");
  window.setTimeout(() => els.mascotHelpInput.focus(), 80);
}

function closeMascotHelp() {
  els.mascotHelpPanel.hidden = true;
  els.mascot.setAttribute("aria-expanded", "false");
  els.mascot.focus({ preventScroll: true });
}

async function handleMascotHelpSubmit(event) {
  event.preventDefault();
  if (state.faqPending) return;
  const question = els.mascotHelpInput.value.trim();
  if (!question) return;
  const maxFaqChars = localAi?.maxFaqChars || 500;
  if (countAiCharacters(question) > maxFaqChars) {
    els.mascotHelpInput.setCustomValidity(`質問は${maxFaqChars.toLocaleString("ja-JP")}文字以内にしてください。`);
    els.mascotHelpInput.reportValidity();
    els.mascotHelpInput.focus();
    return;
  }
  els.mascotHelpInput.setCustomValidity("");

  appendHelpMessage(question, "user");
  els.mascotHelpInput.value = "";
  if (state.mode === "local") {
    appendHelpMessage("AIに相談するには、公開版を開いてログインしてください。", "assistant error");
    els.mascotHelpInput.value = question;
    els.mascotHelpLog.scrollTop = els.mascotHelpLog.scrollHeight;
    els.mascotHelpInput.focus();
    return;
  }

  if (!state.session?.access_token) {
    appendHelpMessage("AIに相談するにはログインしてください。", "assistant error");
    els.mascotHelpInput.value = question;
    els.mascotHelpLog.scrollTop = els.mascotHelpLog.scrollHeight;
    els.mascotHelpInput.focus();
    return;
  }

  if (!localAi?.askFaq) {
    appendHelpMessage("現在AIを利用できません。画面を再読み込みしてお試しください。", "assistant error");
    els.mascotHelpInput.value = question;
    els.mascotHelpLog.scrollTop = els.mascotHelpLog.scrollHeight;
    els.mascotHelpInput.focus();
    return;
  }

  const requestId = ++state.faqRequestId;
  const pendingMessage = appendHelpMessage("AIが考えています…", "assistant pending");
  setFaqPending(true);
  els.mascotHelpLog.scrollTop = els.mascotHelpLog.scrollHeight;

  try {
    const normalized = localAi.normalizeMemoText(question);
    const protectedQuestion = localAi.redactSensitiveMemo(normalized, localAi.maxFaqChars);
    if (!protectedQuestion.text.trim()) throw new Error("個人情報を除くと質問が残りませんでした。相談したい内容を書いてください。");
    const result = await localAi.askFaq(protectedQuestion.text, { accessToken: state.session.access_token, history: state.faqHistory });
    if (requestId !== state.faqRequestId) return;
    state.faqHistory = localAi.sanitizeChatHistory([...state.faqHistory,
      { role: "user", content: protectedQuestion.text }, { role: "assistant", content: result.answer }]);
    const remaining = Number.isFinite(result.remainingToday) ? `（本日のAI残り${result.remainingToday}回）` : "";
    pendingMessage.textContent = `${result.answer}${remaining}`;
    pendingMessage.classList.remove("pending");
  } catch (error) {
    if (requestId !== state.faqRequestId) return;
    pendingMessage.textContent = `AIの回答を受け取れませんでした。${error.message}`;
    els.mascotHelpInput.value = question;
    pendingMessage.classList.remove("pending");
    pendingMessage.classList.add("error");
  } finally {
    if (requestId === state.faqRequestId) {
      setFaqPending(false);
      els.mascotHelpLog.scrollTop = els.mascotHelpLog.scrollHeight;
      if (!els.mascotHelpPanel.hidden) els.mascotHelpInput.focus();
    }
  }
}

function appendHelpMessage(message, role) {
  const paragraph = document.createElement("p");
  paragraph.className = `help-message ${role}`;
  paragraph.textContent = message;
  els.mascotHelpLog.append(paragraph);
  while (els.mascotHelpLog.querySelectorAll(".help-message").length > 20) {
    els.mascotHelpLog.querySelector(".help-message")?.remove();
  }
  return paragraph;
}

function setFaqPending(pending) {
  state.faqPending = pending;
  els.mascotHelpInput.disabled = pending;
  els.mascotHelpSubmitButton.disabled = pending;
  els.clearMascotChatButton.disabled = pending;
  els.mascotHelpSubmitButton.textContent = pending ? "考え中…" : "送信";
  els.mascotHelpForm.setAttribute("aria-busy", String(pending));
}

function getTodayActions(limit = 5) {
  return activeEntries()
    .filter(isActive)
    .map((entry) => ({ entry, action: getNextAction(entry) }))
    .filter(({ action }) => action)
    .filter(({ action }) => matchesActionScope(action))
    .sort((a, b) => {
      if (a.action.rank !== b.action.rank) return a.action.rank - b.action.rank;
      if (a.action.dateKey !== b.action.dateKey) return a.action.dateKey.localeCompare(b.action.dateKey);
      const priorityDiff = priorityScore(a.entry.priority) - priorityScore(b.entry.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.entry.companyName.localeCompare(b.entry.companyName, "ja");
    })
    .slice(0, limit);
}

function getNextAction(entry) {
  if (isFinished(entry)) return null;
  if (entry.status === "結果待ち") {
    return createNextAction("結果待ち。連絡が来たら予定を追加", "info", "待機中", 10, "", Number.POSITIVE_INFINITY, true);
  }

  const candidates = [];
  const deadlineDays = daysUntil(entry.deadline);
  const eventDays = daysUntil(entry.eventDate);

  if (Number.isFinite(deadlineDays)) {
    if (deadlineDays < 0) {
      candidates.push(createNextAction("締切超過。提出状況を確認", "danger", `${Math.abs(deadlineDays)}日超過`, 0, entry.deadline, deadlineDays));
    } else if (deadlineDays === 0) {
      candidates.push(createNextAction("今日締切。最優先で提出", "danger", "今日締切", 1, entry.deadline, deadlineDays));
    } else if (deadlineDays <= 3) {
      candidates.push(createNextAction("締切が近い。ES・応募を仕上げる", "danger", `${deadlineDays}日後に締切`, 2, entry.deadline, deadlineDays));
    } else if (deadlineDays <= 7) {
      candidates.push(createNextAction("締切前に内容を確認", "warning", `${deadlineDays}日後に締切`, 4, entry.deadline, deadlineDays));
    }
  }

  if (Number.isFinite(eventDays)) {
    if (eventDays < 0) {
      candidates.push(createNextAction("予定日を更新", "warning", `${Math.abs(eventDays)}日経過`, 5, entry.eventDate, eventDays));
    } else if (eventDays === 0) {
      candidates.push(createNextAction(`${entry.eventType || "予定"}は今日。開始時間を確認`, "danger", "今日の予定", 1, entry.eventDate, eventDays));
    } else if (eventDays <= 3) {
      candidates.push(createNextAction(`${entry.eventType || "予定"}の準備`, "warning", `${eventDays}日後の予定`, 3, entry.eventDate, eventDays));
    } else if (eventDays <= 7) {
      candidates.push(createNextAction("面接・説明会のメモを準備", "info", `${eventDays}日後の予定`, 6, entry.eventDate, eventDays));
    }
  }

  if (candidates.length > 0) {
    return candidates.sort((a, b) => a.rank - b.rank || a.dateKey.localeCompare(b.dateKey))[0];
  }

  if (!entryHasEsContent(entry) && ["気になる", "応募予定", "応募済み", "ES提出済み"].includes(entry.status)) {
    return createNextAction("ES質問・回答をメモ", "info", "詳細ページで作成", 8, "", Number.POSITIVE_INFINITY, true);
  }

  if (!entry.deadline && !entry.eventDate) {
    return createNextAction("次の締切か予定日を入れる", "info", "日付未設定", 9, "", Number.POSITIVE_INFINITY, true);
  }


  if (entry.status === "気になる") {
    return createNextAction("応募するか判断", "info", "気になる企業", 11, "", Number.POSITIVE_INFINITY, true);
  }

  return createNextAction("マイページを確認", "info", "次の動きを確認", 12, "", Number.POSITIVE_INFINITY, true);
}

function createNextAction(label, tone, meta, rank, dateKey = "9999-12-31", days = Number.POSITIVE_INFINITY, isGeneral = false) {
  return {
    label,
    tone,
    meta,
    rank,
    dateKey: dateKey || "9999-12-31",
    days,
    isGeneral
  };
}

function matchesActionScope(action) {
  if (state.actionScope === "week") {
    return action.days <= 7 || action.isGeneral;
  }

  return action.days <= 0;
}

function nextActionMarkup(entry, variant = "normal") {
  const action = getNextAction(entry);
  if (!action) return "";

  return `
    <div class="next-action ${action.tone} ${variant === "compact" ? "small" : ""}">
      <span>次</span>
      <strong>${escapeHtml(action.label)}</strong>
      <small>${escapeHtml(action.meta)}</small>
    </div>
  `;
}

function companyCardTitle(entry) {
  const action = getNextAction(entry);
  return action ? `${entry.companyName} / 次: ${action.label}` : `${entry.companyName}の詳細を開く`;
}

function entryHasEsContent(entry) {
  return normalizeEsItems(entry.esItems, entry.esContent).some((item) => {
    return item.question.trim() || item.variants.some((variant) => variant.label.trim() || variant.answer.trim());
  });
}

function priorityScore(priority) {
  const scores = { 最優先: 0, 高: 1, 中: 2, 低: 3, 未定: 4 };
  return scores[priority] ?? 4;
}

function getUpcomingDeadlines() {
  return activeEntries()
    .filter((entry) => entry.deadline && isWithinDays(entry.deadline, 14))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}

function getUpcomingEvents() {
  return activeEntries()
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
    simpleStatus(entry.status),
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
  if (state.filter === trashFilterValue) return isTrashed(entry);
  if (isTrashed(entry)) return false;
  if (state.filter === "all") return true;
  if (state.filter === "active") return isActive(entry);
  if (state.filter === "finished") return isFinished(entry);
  return entry.trackType === state.filter;
}

function calendarItemsFor(dateKey) {
  const items = [];
  activeEntries().forEach((entry) => {
    if (entry.deadline === dateKey) {
      items.push({ kind: "deadline", label: `${entry.companyName} 締切` });
    }
    if (entry.eventDate === dateKey) {
      items.push({ kind: "event", label: `${entry.companyName} ${entry.eventType || "予定"}` });
    }
  });
  return items;
}

function isActive(entry) {
  if (isTrashed(entry)) return false;
  return !["採用", "不採用"].includes(simpleStatus(entry.status));
}

function isFinished(entry) {
  if (isTrashed(entry)) return false;
  return ["採用", "不採用"].includes(simpleStatus(entry.status));
}

function activeEntries() {
  return state.entries.filter((entry) => !isTrashed(entry));
}

function trashedEntries() {
  return state.entries.filter(isTrashed);
}

function isTrashed(entry) {
  return Boolean(entry?.deletedAt);
}

function isWithinDays(dateValue, days) {
  const diff = daysUntil(dateValue);
  return diff >= 0 && diff <= days;
}

function daysUntil(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(`${dateValue}T00:00:00`));
  const diff = Math.round((target - today) / 86400000);
  return Number.isFinite(diff) ? diff : Number.POSITIVE_INFINITY;
}

function sortByClosestDate(a, b) {
  const aDate = a.eventDate || a.deadline || "9999-12-31";
  const bDate = b.eventDate || b.deadline || "9999-12-31";
  return aDate.localeCompare(bDate);
}

function sortCompanyEntries(a, b) {
  const aName = String(a.companyName || "").normalize("NFKC").trim();
  const bName = String(b.companyName || "").normalize("NFKC").trim();
  const nameOrder = companyNameCollator.compare(aName, bName);
  if (nameOrder !== 0) return nameOrder;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function sortTrashedEntries(a, b) {
  return new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0);
}

function nextCompanySortOrder() {
  const orders = activeEntries().map((entry) => entry.sortOrder).filter(Number.isFinite);
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
  const manualLogo = normalizeExternalImageUrl(entry.logoUrl);
  return manualLogo ? [manualLogo] : [];
}

function normalizeExternalUrl(value) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) return "";

  try {
    const url = new URL(rawValue);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeExternalImageUrl(value) {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  if (url.protocol !== "https:" || url.search || url.hash || !isPublicWebHostname(url.hostname)) return "";
  return url.href;
}

function isPublicWebHostname(hostname) {
  const domain = String(hostname || "").trim().toLowerCase().replace(/\.$/u, "");
  if (!domain || domain.includes(":") || !domain.includes(".")) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(domain)) return false;
  if (/(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/u.test(domain)) return false;
  return /^[a-z0-9.-]+$/u.test(domain) && !domain.includes("..") && !domain.startsWith(".");
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

function trackTag(trackType) {
  const label = trackType || "本選考";
  const className = trackTypeClassNames[label] || "event";
  return `<span class="track-badge ${className}">${escapeHtml(label === "インターン" ? "未分類インターン" : label)}</span>`;
}

function simpleStatus(status) {
  if (simpleStatuses.includes(status)) return status;
  if (["内定", "インターン選考通過", "インターン参加決定", "参加済み"].includes(status)) return "採用";
  if (["落選", "辞退"].includes(status)) return "不採用";
  if (status === "ES提出済み") return "応募済み";
  if (["Webテスト", "一次面接", "二次面接", "最終面接", "結果待ち", "選考通過"].includes(status)) return "選考中";
  return "気になる";
}

function statusTag(status) {
  status = simpleStatus(status);
  const className = status === "不採用"
    ? "red"
    : status === "採用"
      ? "green"
      : status === "選考中"
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
  return Object.hasOwn(partsByStatus, status) ? partsByStatus[status] : [String(status || "")];
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

function formatDateTime(value) {
  if (!value) return "日時不明";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "日時不明";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
