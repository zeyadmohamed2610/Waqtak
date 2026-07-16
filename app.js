/* =============================================
   BYBIT TRACKER — JavaScript Core Logic
   =============================================
   - Parses UTC format: "2026-05-26 11:36:42 (UTC+0)"
   - Parses Gmail format: "May 26, 2026, 2:36 PM"  (treated as UTC+3, Egypt local)
   - Manual datetime picker (assumes UTC)
   - Converts all times to Egypt timezone (Africa/Cairo = UTC+2/UTC+3 DST)
   - Calculates elapsed / remaining time vs +4 days
   - Live countdown + progress ring
   - Saves history to localStorage
============================================= */

'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const EGYPT_TZ      = 'Africa/Cairo';
const STORAGE_KEY   = 'bybit_tracker_history';

// ─── State ───────────────────────────────────────────────────────────────────
let currentTab          = 'utc';
let countdownInterval   = null;
let depositUTC          = null;   // Date object (UTC epoch)
let target1UTC          = null;   // depositUTC + 4 days
let target2UTC          = null;   // depositUTC + 8 days
let currentLang         = 'ar';   // 'ar' or 'en'
let currentMode         = 'calculator'; // 'calculator' or 'manager'
let accounts            = [];           // Array of manager accounts
let accountsInterval    = null;         // Live update ticker for manager mode
let filterStatus        = 'all';        // 'all' | 'stage1' | 'stage2' | 'done'
let sortBy              = 'newest';     // 'newest' | 'oldest' | 'soonest'
let notifPermission     = false;        // Browser notification permission granted
let idb                 = null;         // IndexedDB instance
const IDB_NAME          = 'waqtak_db';
const IDB_STORE         = 'accounts';
const IDB_VERSION       = 1;

// ─── i18n Translations ───────────────────────────────────────────────────────
const TRANSLATIONS = {
  ar: {
    // Header
    logoMain:         'وقتك',
    logoSub:          'متابعة حسابات Bybit',
    clockLabel:       'التوقيت المصري الآن',
    langToggleText:   'English',
    // Hero
    heroBadge:        'متابعة الإيداعات والنشاط',
    heroTitle:        'تتبع مواعيد<br/>حساباتك خطوة بخطوة',
    heroDesc:         'أدخل تاريخ الإيداع من رسالة Gmail وستحسب الأداة تلقائياً مواعيد المراجعة بعد <strong>4 أيام</strong> والجاهزية بعد <strong>8 أيام</strong>',
    // Input Card
    inputCardTitle:   'إدخال تاريخ الإيداع',
    inputCardSubtitle:'الصق التاريخ من رسالة Gmail أو أدخله يدوياً',
    tabUTC:           'UTC Format',
    tabGmail:         'Gmail Format',
    tabManual:        'يدوي',
    labelUTC:         'تنسيق UTC — مثال: <code>2026-05-26 11:36:42 (UTC+0)</code>',
    labelGmail:       'تنسيق Gmail — مثال: <code>May 26, 2026, 2:36 PM</code>',
    labelManual:      'اختر تاريخ ووقت الإيداع (بالتوقيت المصري)',
    gmailNote:        'Gmail يعرض التوقيت المحلي لإعدادات حسابك — يُعالج تلقائياً حسب UTC',
    btnCalculate:     'احسب الآن',
    exampleLabel:     'أمثلة سريعة:',
    exampleUTC:       'مثال UTC',
    exampleGmail:     'مثال Gmail',
    // Progress
    progressLabel:    'مكتمل',
    depositLabel:     'تاريخ الإيداع (بالتوقيت المصري)',
    milestone1Label:  'المراجعة الأولى — بعد 4 أيام (بالتوقيت المصري)',
    milestone2Label:  'المراجعة الثانية والجاهزية — بعد 8 أيام (بالتوقيت المصري)',
    // Stats
    statElapsedLabel: 'مر على الإيداع',
    statActiveLabel:  'الهدف النشط حالياً',
    statStage1Label:  'المرحلة الأولى (4 أيام)',
    statStage2Label:  'المرحلة الثانية (8 أيام)',
    // Countdown
    countdownTitle:   'العد التنازلي الدقيق',
    cdDays:           'أيام',
    cdHours:          'ساعات',
    cdMins:           'دقائق',
    cdSecs:           'ثواني',
    // Buttons
    btnReset:         'إدخال تاريخ جديد',
    // History
    historySectionTitle: 'الحسابات المحفوظة',
    btnClearHistory:  'مسح الكل',
    historyEmpty:     'لا توجد حسابات محفوظة بعد',
    // Footer
    footerText:       'وقتك — أداة متابعة حسابات Bybit • جميع البيانات محلية على جهازك',
    // Dynamic strings
    dynReady:         'جاهز بالكامل ✓',
    dynStage2Rem:     'مرحلة 2: متبقي ',
    dynStage1Rem:     'مرحلة 1: متبقي ',
    dynDone:          'مكتملة ✓',
    dynRemaining:     'متبقي ',
    dynWaiting:       'في الانتظار..',
    dynBanner2Title:  'الحساب جاهز بالكامل!',
    dynBanner2Sub:    'اكتملت فترة الـ 8 أيام منذ ',
    dynBanner2Badge:  'جاهز',
    dynBanner1Title:  'المرحلة الثانية نشطة',
    dynBanner1Sub1:   'اكتملت المراجعة الأولى. متبقي ',
    dynBanner1Sub2:   ' على الجاهزية التامة',
    dynBanner1Badge:  'مرحلة 2',
    dynBanner0Title:  'المرحلة الأولى نشطة',
    dynBanner0Sub:    'المراجعة الأولى بعد ',
    dynBanner0Badge:  'مرحلة 1',
    // History tags
    histTagDone:      'جاهز بالكامل ✓',
    histTagStage2:    'مرحلة 2 ⚡',
    histTagStage1:    'مرحلة 1',
    histDepositPfx:   'إيداع: ',
    histRev1Pfx:      'مراجعة 1: ',
    histRev2Pfx:      'مراجعة 2: ',
    histRemReady:     '⏱ متبقي للجاهزية: ',
    histFullReady:    '✓ جاهز بالكامل',
    // Duration
    durDay:    'يوم',
    durHour:   'ساعة',
    durMin:    'دقيقة',
    durSec:    'ثانية',
    durAnd:    ' و ',
    // Toast
    toastEnterDate:  '⚠️ الرجاء إدخال التاريخ أولاً',
    toastBadUTC:     '❌ تنسيق غير صحيح — مثال: 2026-05-26 11:36:42 (UTC+0)',
    toastBadGmail:   '❌ تنسيق غير صحيح — مثال: May 26, 2026, 2:36 PM',
    toastPickDate:   '⚠️ الرجاء اختيار التاريخ والوقت',
    toastFuture:     '⚠️ التاريخ يبدو بعيداً جداً في المستقبل، تحقق من الإدخال',
    toastClearConfirm: 'هل تريد مسح جميع السجلات؟',
    // Mode Switcher
    modeCalc:         'الحاسبة السريعة',
    modeMgr:          'مدير الحسابات',
    // Account Manager Form & Cards
    btnAddAccount:    'إضافة حساب جديد',
    formTitleAdd:     'حساب جديد',
    formTitleEdit:    'تعديل الحساب',
    formSubtitle:     'أدخل تفاصيل حساب Bybit لحفظه وتتبعه',
    fieldUID:         'Bybit UID',
    fieldEmail:       'البريد الإلكتروني',
    fieldIP:          'عنوان IP',
    fieldAmount:      'كمية الإيداع ($)',
    fieldTime:        'وقت الإيداع',
    btnNow:           'الآن',
    fieldNotes:       'ملاحظات (اختياري)',
    btnSave:          'حفظ الحساب',
    btnCancel:        'إلغاء',
    toastFillRequired:'⚠️ يُرجى تحديد تاريخ ووقت الإيداع على الأقل!',
    toastClearAcctConfirm: 'هل تريد حذف هذا الحساب نهائياً؟',
    cardStage1:       'مرحلة 1: مراجعة (4 أيام)',
    cardStage1Done:   'مرحلة 1: جاهز للمهمات ✓',
    cardStage2:       'مرحلة 2: انتظار (4 أيام)',
    cardStage2Done:   'مكتمل وجاهز بالكامل ✓',
    cardEmail:        'البريد:',
    cardIP:           'الـ IP:',
    cardAmount:       'الإيداع:',
    cardNotes:        'ملاحظات:',
    cardBtnStage2:    'إتمام المهمة وبدء المرحلة 2 ⚡',
    cardTimeRemaining:'متبقي: ',
    cardTimeOverdue:  'تجاوز منذ: ',
    cardCreated:      'تاريخ البدء: ',
    cardStage2Started:'تحديث المرحلة 2: ',
    searchPlaceholder:'بحث بالـ UID أو البريد الإلكتروني...',
    // Export / Import
    btnExport:        'تصدير النسخة الاحتياطية',
    btnImport:        'استعادة النسخة الاحتياطية',
    toastExportOk:    '✅ تم تصدير البيانات بنجاح',
    toastImportOk:    '✅ تم استيراد البيانات بنجاح',
    toastImportErr:   '❌ خطأ في الملف — تأكد من صحة ملف JSON',
    toastImportEmpty: '⚠️ الملف لا يحتوي على بيانات صالحة',
    toastCopied:      '📋 تم النسخ',
    // Notifications
    btnNotif:         '🔔 تفعيل الإشعارات',
    btnNotifOn:       '🔔 الإشعارات مفعلة',
    btnNotifDenied:   '🔕 الإشعارات محجوبة',
    notifStage1Title: 'انتهت المرحلة 1 ✓',
    notifStage1Body:  'الحساب جاهز للمهمات — UID: ',
    notifStage2Title: 'الحساب مكتمل بالكامل 🎉',
    notifStage2Body:  'تمت المرحلة 2 بنجاح — UID: ',
    // Filter / Sort
    filterAll:        'الكل',
    filterStage1:     'المرحلة 1',
    filterStage2:     'المرحلة 2',
    filterDone:       'مكتمل',
    sortNewest:       'الأحدث أولاً',
    sortOldest:       'الأقدم أولاً',
    sortSoonest:      'الأقرب للانتهاء',
    // Dashboard Stats
    dashTotal:        'إجمالي الحسابات',
    dashStage1:       'في المرحلة 1',
    dashStage2:       'في المرحلة 2',
    dashDone:         'مكتملة',
    dashDeposits:     'إجمالي الإيداعات',
    dashExpiringSoon: 'تنتهي اليوم',
    // Audit Log
    auditLog:         'سجل التغييرات',
    auditCreated:     '🆕 تم إنشاء الحساب',
    auditEdited:      '✏️ تم تعديل الحساب',
    auditStage2:      '⚡ بدأت المرحلة 2',
    auditHide:        'إخفاء السجل',
    auditShow:        'عرض السجل',
    // IDB
    idbRestored:      '💾 تم استعادة البيانات من النسخة الاحتياطية',
    toastNoDataExport: '⚠️ لا توجد بيانات للتصدير',
    toastNotifSupport: '⚠️ المتصفح لا يدعم الإشعارات',
  },
  en: {
    // Header
    logoMain:         'Waqtak',
    logoSub:          'Bybit Account Tracker',
    clockLabel:       'Egypt Time (Now)',
    langToggleText:   'عربي',
    // Hero
    heroBadge:        'Deposit & Activity Tracking',
    heroTitle:        'Track Your Account<br/>Milestones Step by Step',
    heroDesc:         'Enter the deposit date from your Gmail message and the tool will automatically calculate the review after <strong>4 days</strong> and readiness after <strong>8 days</strong>',
    // Input Card
    inputCardTitle:   'Enter Deposit Date',
    inputCardSubtitle:'Paste the date from your Gmail message or enter it manually',
    tabUTC:           'UTC Format',
    tabGmail:         'Gmail Format',
    tabManual:        'Manual',
    labelUTC:         'UTC format — Example: <code>2026-05-26 11:36:42 (UTC+0)</code>',
    labelGmail:       'Gmail format — Example: <code>May 26, 2026, 2:36 PM</code>',
    labelManual:      'Choose deposit date & time (Egypt Time)',
    gmailNote:        'Gmail shows your account\'s local timezone — automatically adjusted to UTC',
    btnCalculate:     'Calculate Now',
    exampleLabel:     'Quick examples:',
    exampleUTC:       'UTC Example',
    exampleGmail:     'Gmail Example',
    // Progress
    progressLabel:    'Complete',
    depositLabel:     'Deposit Date (Egypt Time)',
    milestone1Label:  'First Review — After 4 Days (Egypt Time)',
    milestone2Label:  'Second Review & Readiness — After 8 Days (Egypt Time)',
    // Stats
    statElapsedLabel: 'Time Since Deposit',
    statActiveLabel:  'Active Target',
    statStage1Label:  'Stage 1 (4 Days)',
    statStage2Label:  'Stage 2 (8 Days)',
    // Countdown
    countdownTitle:   'Precise Countdown',
    cdDays:           'Days',
    cdHours:          'Hours',
    cdMins:           'Minutes',
    cdSecs:           'Seconds',
    // Buttons
    btnReset:         'Enter New Date',
    // History
    historySectionTitle: 'Saved Accounts',
    btnClearHistory:  'Clear All',
    historyEmpty:     'No saved accounts yet',
    // Footer
    footerText:       'Waqtak — Bybit Account Tracker • All data stored locally on your device',
    // Dynamic strings
    dynReady:         'Fully Ready ✓',
    dynStage2Rem:     'Stage 2: ',
    dynStage1Rem:     'Stage 1: ',
    dynDone:          'Done ✓',
    dynRemaining:     '',
    dynWaiting:       'Waiting...',
    dynBanner2Title:  'Account Fully Ready!',
    dynBanner2Sub:    'The 8-day period completed ',
    dynBanner2Badge:  'Ready',
    dynBanner1Title:  'Stage 2 Active',
    dynBanner1Sub1:   'First review done. ',
    dynBanner1Sub2:   ' remaining until full readiness',
    dynBanner1Badge:  'Stage 2',
    dynBanner0Title:  'Stage 1 Active',
    dynBanner0Sub:    'First review in ',
    dynBanner0Badge:  'Stage 1',
    // History tags
    histTagDone:      'Fully Ready ✓',
    histTagStage2:    'Stage 2 ⚡',
    histTagStage1:    'Stage 1',
    histDepositPfx:   'Deposit: ',
    histRev1Pfx:      'Review 1: ',
    histRev2Pfx:      'Review 2: ',
    histRemReady:     '⏱ Ready in: ',
    histFullReady:    '✓ Fully Ready',
    // Duration
    durDay:    'day',
    durHour:   'hr',
    durMin:    'min',
    durSec:    'sec',
    durAnd:    ' ',
    // Toast
    toastEnterDate:  '⚠️ Please enter a date first',
    toastBadUTC:     '❌ Invalid format — Example: 2026-05-26 11:36:42 (UTC+0)',
    toastBadGmail:   '❌ Invalid format — Example: May 26, 2026, 2:36 PM',
    toastPickDate:   '⚠️ Please pick a date and time',
    toastFuture:     '⚠️ Date seems too far in the future, please check your input',
    toastClearConfirm: 'Delete all saved records?',
    // Mode Switcher
    modeCalc:         'Quick Calculator',
    modeMgr:          'Account Manager',
    // Account Manager Form & Cards
    btnAddAccount:    'Add New Account',
    formTitleAdd:     'New Account',
    formTitleEdit:    'Edit Account',
    formSubtitle:     'Enter Bybit account details to save and track',
    fieldUID:         'Bybit UID',
    fieldEmail:       'Email Address',
    fieldIP:          'IP Address',
    fieldAmount:      'Deposit Amount ($)',
    fieldTime:        'Deposit Time',
    btnNow:           'Now',
    fieldNotes:       'Notes (Optional)',
    btnSave:          'Save Account',
    btnCancel:        'Cancel',
    toastFillRequired:'⚠️ Please specify at least the deposit date and time!',
    toastClearAcctConfirm: 'Are you sure you want to delete this account permanently?',
    cardStage1:       'Stage 1: Review (4 days)',
    cardStage1Done:   'Stage 1: Ready for tasks ✓',
    cardStage2:       'Stage 2: Pending (4 days)',
    cardStage2Done:   'Fully Completed & Ready ✓',
    cardEmail:        'Email:',
    cardIP:           'IP:',
    cardAmount:       'Deposit:',
    cardNotes:        'Notes:',
    cardBtnStage2:    'Complete tasks & start Stage 2 ⚡',
    cardTimeRemaining:'Remaining: ',
    cardTimeOverdue:  'Overdue by: ',
    cardCreated:      'Start Date: ',
    cardStage2Started:'Stage 2 Update: ',
    searchPlaceholder:'Search by UID or Email...',
    // Export / Import
    btnExport:        'Export Backup',
    btnImport:        'Restore Backup',
    toastExportOk:    '✅ Data exported successfully',
    toastImportOk:    '✅ Data imported successfully',
    toastImportErr:   '❌ File error — make sure it is a valid JSON file',
    toastImportEmpty: '⚠️ File contains no valid data',
    toastCopied:      '📋 Copied!',
    // Notifications
    btnNotif:         '🔔 Enable Notifications',
    btnNotifOn:       '🔔 Notifications On',
    btnNotifDenied:   '🔕 Notifications Blocked',
    notifStage1Title: 'Stage 1 Complete ✓',
    notifStage1Body:  'Account ready for tasks — UID: ',
    notifStage2Title: 'Account Fully Complete 🎉',
    notifStage2Body:  'Stage 2 finished successfully — UID: ',
    // Filter / Sort
    filterAll:        'All',
    filterStage1:     'Stage 1',
    filterStage2:     'Stage 2',
    filterDone:       'Completed',
    sortNewest:       'Newest First',
    sortOldest:       'Oldest First',
    sortSoonest:      'Expiring Soon',
    // Dashboard Stats
    dashTotal:        'Total Accounts',
    dashStage1:       'In Stage 1',
    dashStage2:       'In Stage 2',
    dashDone:         'Completed',
    dashDeposits:     'Total Deposits',
    dashExpiringSoon: 'Expiring Today',
    // Audit Log
    auditLog:         'Change Log',
    auditCreated:     '🆕 Account Created',
    auditEdited:      '✏️ Account Edited',
    auditStage2:      '⚡ Stage 2 Started',
    auditHide:        'Hide Log',
    auditShow:        'View Log',
    // IDB
    idbRestored:      '💾 Data restored from backup storage',
  }
};

// ─── i18n Helper ─────────────────────────────────────────────────────────────
function t(key) {
  return (TRANSLATIONS[currentLang] || TRANSLATIONS.ar)[key] || key;
}

// ─── Apply Translations to DOM ───────────────────────────────────────────────
function applyI18n() {
  const isRTL = currentLang === 'ar';
  document.documentElement.lang = currentLang;
  document.documentElement.dir  = isRTL ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val !== undefined) el.innerHTML = val;
  });

  // Dynamically update placeholder for search input
  const searchInput = $('mgr-search');
  if (searchInput) {
    searchInput.placeholder = t('searchPlaceholder');
  }

  // Update placeholder for UID input
  const uidInput = $('field-uid');
  if (uidInput) {
    uidInput.placeholder = isRTL ? 'مثال: 12345678' : 'e.g. 12345678';
  }

  // Update placeholder for Notes input
  const notesInput = $('field-notes');
  if (notesInput) {
    notesInput.placeholder = isRTL ? 'أضف أي ملاحظات هنا...' : 'Add any notes here...';
  }

  // Toggle button label
  const btn = $('lang-toggle-btn');
  if (btn) btn.classList.toggle('ltr-btn', !isRTL);
}

// ─── Toggle Language ──────────────────────────────────────────────────────────
function toggleLanguage() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  applyI18n();
  localStorage.setItem('bybit_tracker_lang', currentLang);
  // Re-render live stats if results are showing (to update dynamic strings)
  if (depositUTC) updateLiveStats();
  renderHistory();
}


// ─── DOM Helpers ─────────────────────────────────────────────────────────────
const $  = (id) => document.getElementById(id);
const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

// ─── Live Clock (Egypt Time) ──────────────────────────────────────────────────
function tickClock() {
  const now = new Date();
  const locale = currentLang === 'ar' ? 'ar-EG' : 'en-US';
  $('live-clock').textContent = now.toLocaleTimeString(locale, {
    timeZone: EGYPT_TZ,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}
setInterval(tickClock, 1000);
tickClock();

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  ['utc', 'gmail', 'manual'].forEach(t => {
    $(`tab-${t}`).classList.toggle('active', t === tab);
    $(`tab-${t}`).setAttribute('aria-selected', String(t === tab));
    $(`content-${t}`).classList.toggle('active', t === tab);
  });
}

// ─── Clipboard Paste ──────────────────────────────────────────────────────────
async function pasteFromClipboard(inputId) {
  try {
    const text = await navigator.clipboard.readText();
    $(inputId).value = text.trim();
    $(inputId).focus();
    showToast('تم اللصق من الحافظة ✓');
  } catch {
    showToast('يُرجى الإذن بالوصول للحافظة أو اللصق يدوياً');
  }
}

// ─── Fill Example ─────────────────────────────────────────────────────────────
function fillExample(tab, value) {
  switchTab(tab);
  $(`${tab}-input`).value = value;
  $(`${tab}-input`).focus();
}

// ─── Dynamic Timezone Conversion ─────────────────────────────────────────────

/**
 * Converts a local time (with year, month, day, hour, minute, second) 
 * in a specific target timezone (e.g. Africa/Cairo) to a standard UTC Date object.
 * This dynamically accounts for historical Daylight Saving Time (DST) rules.
 */
function localToUTC(year, monthIndex, day, hour, minute, second, timeZone) {
  // Start with a guess: assume the local numbers are in UTC
  let guess = new Date(Date.UTC(year, monthIndex, day, hour, minute, second));
  
  // Iterate 2 times to converge (usually 1 is enough, 2 is safe for DST edges)
  for (let i = 0; i < 2; i++) {
    // Format the current guess in the target timezone
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    }).formatToParts(guess);
    
    const map = {};
    parts.forEach(p => map[p.type] = Number(p.value));
    
    // Construct the actual local time represented by this guess in target timezone
    const actualLocal = Date.UTC(map.year, map.month - 1, map.day, map.hour % 24, map.minute, map.second);
    const desiredLocal = Date.UTC(year, monthIndex, day, hour, minute, second);
    
    // Adjust the guess by the error
    const error = actualLocal - desiredLocal;
    guess = new Date(guess.getTime() - error);
  }
  return guess;
}

// Helper to convert Arabic indic digits to English digits
function toEnglishDigits(str) {
  return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// ─── Parse Functions ──────────────────────────────────────────────────────────

/**
 * Parse UTC format: "2026-05-26 11:36:42 (UTC+0)"
 * Returns Date object in UTC, or null on failure.
 */
function parseUTCFormat(raw) {
  let clean = toEnglishDigits(raw.trim());
  // Strip timezone annotation
  clean = clean.replace(/\(UTC[+-]?\d*\)/i, '').trim();
  // Pattern: YYYY-MM-DD HH:MM:SS or YYYY-MM-DDTHH:MM:SS
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S] = m.map(Number);
  return new Date(Date.UTC(Y, Mo - 1, D, H, Mi, S));
}

/**
 * Parse Gmail format: "May 26, 2026, 2:36 PM" or "٢٦ مايو ٢٠٢٦، ٢:٣٦ م"
 * Gmail shows the time in the user's browser local timezone (Egypt).
 * We parse it as Egypt local time and convert it to UTC.
 */
function parseGmailFormat(raw) {
  let clean = toEnglishDigits(raw.trim());
  // Normalize punctuation/delimiters to spaces
  clean = clean.replace(/[,，、;；\(\)]/g, ' ');
  
  const tokens = clean.split(/\s+/).filter(t => t.length > 0);
  
  let month = null;
  let day = null;
  let year = null;
  let hour = null;
  let minute = null;
  let second = 0;
  let isPM = false;
  let isAM = false;

  const monthsMap = {
    january:1, february:2, march:3, april:4, may:5, june:6,
    july:7, august:8, september:9, october:10, november:11, december:12,
    jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
    'يناير':1, 'فبراير':2, 'مارس':3, 'أبريل':4, 'ابريل':4, 'مايو':5, 'يونيو':6, 'يونية':6,
    'يوليو':7, 'يولية':7, 'أغسطس':8, 'اغسطس':8, 'سبتمبر':9, 'أكتوبر':10, 'اكتوبر':10,
    'نوفمبر':11, 'ديسمبر':12
  };

  for (const token of tokens) {
    const lower = token.toLowerCase();
    
    // Check if month name
    if (monthsMap[lower]) {
      month = monthsMap[lower];
      continue;
    }
    
    // Check if AM/PM/م/ص
    if (lower === 'pm' || lower === 'م' || lower === 'مساءً') {
      isPM = true;
      continue;
    }
    if (lower === 'am' || lower === 'ص' || lower === 'صباحًا') {
      isAM = true;
      continue;
    }
    
    // Check if time format HH:MM or HH:MM:SS
    if (token.includes(':')) {
      const parts = token.split(':').map(Number);
      if (parts.length >= 2 && !parts.some(isNaN)) {
        hour = parts[0];
        minute = parts[1];
        if (parts.length >= 3) second = parts[2];
      }
      continue;
    }
    
    // Check if numbers
    if (/^\d+$/.test(token)) {
      const val = parseInt(token, 10);
      if (val >= 2000 && val < 2100) {
        year = val;
      } else if (val >= 1 && val <= 31) {
        day = val;
      }
    }
  }

  if (month === null || day === null || year === null || hour === null || minute === null) {
    return null;
  }

  if (isPM && hour !== 12) hour += 12;
  if (isAM && hour === 12) hour = 0;

  return localToUTC(year, month - 1, day, hour, minute, second, EGYPT_TZ);
}

/**
 * Parse Manual datetime-local input (treated as Egypt Local Time)
 */
function parseManualFormat() {
  const dateStr = $('manual-date').value;
  const timeStr = $('manual-time').value || '00:00:00';
  if (!dateStr) return null;
  
  const dateParts = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);
  
  const Y = dateParts[0];
  const Mo = dateParts[1];
  const D = dateParts[2];
  const H = timeParts[0];
  const Mi = timeParts[1];
  const S = timeParts.length >= 3 ? timeParts[2] : 0;
  
  return localToUTC(Y, Mo - 1, D, H, Mi, S, EGYPT_TZ);
}

// ─── Format Date for Display (Egypt TZ) ──────────────────────────────────────
function formatEgypt(date) {
  const locale = currentLang === 'ar' ? 'ar-EG' : 'en-US';
  return date.toLocaleString(locale, {
    timeZone: EGYPT_TZ,
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  });
}

function formatEgyptShort(date) {
  const locale = currentLang === 'ar' ? 'ar-EG' : 'en-US';
  return date.toLocaleString(locale, {
    timeZone: EGYPT_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: true
  });
}

// ─── Format Duration ──────────────────────────────────────────────────────────
function formatDuration(ms, absolute = true) {
  const totalSec = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (d > 0) parts.push(`${d} ${t('durDay')}`);
  if (h > 0) parts.push(`${h} ${t('durHour')}`);
  if (m > 0) parts.push(`${m} ${t('durMin')}`);
  if (s > 0 || parts.length === 0) parts.push(`${s} ${t('durSec')}`);
  return parts.join(t('durAnd'));
}

// ─── Main Calculate ───────────────────────────────────────────────────────────
function calculate() {
  let date = null;

  if (currentTab === 'utc') {
    const raw = $('utc-input').value.trim();
    if (!raw) { showToast(t('toastEnterDate')); return; }
    date = parseUTCFormat(raw);
    if (!date) { showToast(t('toastBadUTC')); return; }

  } else if (currentTab === 'gmail') {
    const raw = $('gmail-input').value.trim();
    if (!raw) { showToast(t('toastEnterDate')); return; }
    date = parseGmailFormat(raw);
    if (!date) { showToast(t('toastBadGmail')); return; }

  } else {
    date = parseManualFormat();
    if (!date) { showToast(t('toastPickDate')); return; }
  }

  // Validate not in the far future
  if (date > new Date(Date.now() + 365 * 24 * 3600 * 1000)) {
    showToast(t('toastFuture'));
    return;
  }

  depositUTC = date;
  target1UTC = new Date(date.getTime() + 4 * 24 * 3600 * 1000);
  target2UTC = new Date(date.getTime() + 8 * 24 * 3600 * 1000);

  // Save to history
  saveHistory(depositUTC);

  // Show results
  showResults();

  // Scroll to results
  setTimeout(() => {
    $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

// ─── Show Results ─────────────────────────────────────────────────────────────
function showResults() {
  $('results-section').style.display = 'flex';
  $('input-section').style.display = 'none';

  // Display dates
  $('deposit-display').textContent = formatEgypt(depositUTC);
  $('target1-display').textContent = formatEgypt(target1UTC);
  $('target2-display').textContent = formatEgypt(target2UTC);

  // Start live ticker
  clearInterval(countdownInterval);
  updateLiveStats();
  countdownInterval = setInterval(updateLiveStats, 1000);
}

// ─── Update Live Stats ────────────────────────────────────────────────────────
function updateLiveStats() {
  const now         = new Date();
  const elapsedMs   = now - depositUTC;
  const totalMs     = 8 * 24 * 3600 * 1000; // 8 days total
  const remaining1Ms = target1UTC - now;
  const remaining2Ms = target2UTC - now;

  const stage1Done = remaining1Ms <= 0;
  const stage2Done = remaining2Ms <= 0;
  const progress   = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));

  // Progress ring
  const circumference = 2 * Math.PI * 85; // ~534
  const offset = circumference - (progress / 100) * circumference;
  const ring = $('ring-fill');
  ring.style.strokeDashoffset = offset;

  // Colors for progress ring and percentage based on active stage
  if (stage2Done) {
    ring.style.stroke = '#22C55E'; // green when everything is done
    ring.style.filter = 'drop-shadow(0 0 8px rgba(34,197,94,0.5))';
    $('progress-percent').style.color = '#22C55E';
  } else if (stage1Done) {
    ring.style.stroke = '#F59E0B'; // orange for stage 2
    ring.style.filter = 'drop-shadow(0 0 8px rgba(245,158,11,0.5))';
    $('progress-percent').style.color = '#F59E0B';
  } else {
    ring.style.stroke = '';
    ring.style.filter = '';
    $('progress-percent').style.color = '';
  }

  $('progress-percent').textContent = `${Math.floor(progress)}%`;

  // Update timeline icons & text style in UI
  const item1 = $('item-milestone-1');
  const item2 = $('item-milestone-2');
  const line1 = $('line-1');
  const line2 = $('line-2');

  // Reset classes
  item1.classList.remove('completed', 'active');
  item2.classList.remove('completed', 'active');
  line1.style.background = '';
  line2.style.background = '';

  if (stage2Done) {
    item1.classList.add('completed');
    item2.classList.add('completed');
    line1.style.background = 'var(--success)';
    line2.style.background = 'var(--success)';
  } else if (stage1Done) {
    item1.classList.add('completed');
    item2.classList.add('active');
    line1.style.background = 'var(--success)';
    line2.style.background = 'linear-gradient(180deg, var(--success) 0%, var(--warning) 100%)';
  } else {
    item1.classList.add('active');
    line1.style.background = 'linear-gradient(180deg, var(--info) 0%, var(--gold) 100%)';
  }

  // Stats Grid Card 1: Elapsed time since deposit
  $('elapsed-display').textContent = formatDuration(elapsedMs);

  // Stats Grid Card 2: Active target remaining
  const remainingDisplay = $('remaining-display');
  if (stage2Done) {
    remainingDisplay.textContent = t('dynReady');
    remainingDisplay.style.color = 'var(--success)';
  } else if (stage1Done) {
    remainingDisplay.textContent = t('dynStage2Rem') + formatDuration(remaining2Ms);
    remainingDisplay.style.color = 'var(--warning)';
  } else {
    remainingDisplay.textContent = t('dynStage1Rem') + formatDuration(remaining1Ms);
    remainingDisplay.style.color = 'var(--gold)';
  }

  // Stats Grid Card 3: Milestone 1 status
  const daysElapsedCard = $('days-elapsed');
  if (stage1Done) {
    daysElapsedCard.textContent = t('dynDone');
    daysElapsedCard.style.color = 'var(--success)';
  } else {
    daysElapsedCard.textContent = t('dynRemaining') + formatDuration(remaining1Ms);
    daysElapsedCard.style.color = 'var(--gold)';
  }

  // Stats Grid Card 4: Milestone 2 status
  const daysRemainingCard = $('days-remaining');
  if (stage2Done) {
    daysRemainingCard.textContent = t('dynDone');
    daysRemainingCard.style.color = 'var(--success)';
  } else if (stage1Done) {
    daysRemainingCard.textContent = t('dynRemaining') + formatDuration(remaining2Ms);
    daysRemainingCard.style.color = 'var(--warning)';
  } else {
    daysRemainingCard.textContent = t('dynWaiting');
    daysRemainingCard.style.color = 'var(--text-muted)';
  }

  // Decide what to count down to (Stage 1, Stage 2 or time elapsed since completion)
  let countdownMs = 0;
  let countdownDone = false;

  if (!stage1Done) {
    countdownMs = remaining1Ms;
  } else if (!stage2Done) {
    countdownMs = remaining2Ms;
  } else {
    countdownMs = now - target2UTC; // elapsed since total completion
    countdownDone = true;
  }

  // Countdown
  updateCountdown(countdownMs, countdownDone);

  // Status Banner
  updateStatusBanner(stage1Done, stage2Done, remaining1Ms, remaining2Ms);
}

function updateCountdown(remainingMs, isDone) {
  const grid = document.querySelector('.countdown-section');
  if (isDone) {
    grid.classList.add('countdown-overdue');
  } else {
    grid.classList.remove('countdown-overdue');
  }

  const abs      = Math.abs(remainingMs);
  const totalSec = Math.floor(abs / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const setNum = (id, val) => {
    const el = $(id);
    const newVal = String(val).padStart(2, '0');
    if (el.textContent !== newVal) {
      el.textContent = newVal;
      el.classList.add('tick');
      setTimeout(() => el.classList.remove('tick'), 200);
    }
  };

  setNum('cd-days',  d);
  setNum('cd-hours', h);
  setNum('cd-mins',  m);
  setNum('cd-secs',  s);
}

function updateStatusBanner(stage1Done, stage2Done, remaining1Ms, remaining2Ms) {
  const banner = $('status-banner');
  const icon   = $('status-icon');
  const title  = $('status-title');
  const sub    = $('status-subtitle');
  const badge  = $('status-badge');

  banner.classList.remove('pending', 'ready', 'overdue');

  if (stage2Done) {
    const overMs = Math.abs(remaining2Ms);
    banner.classList.add('ready');
    icon.textContent  = '✅';
    title.textContent = t('dynBanner2Title');
    sub.textContent   = t('dynBanner2Sub') + formatDuration(overMs);
    badge.textContent = t('dynBanner2Badge');
    badge.style.color = '#22C55E';
  } else if (stage1Done) {
    banner.classList.add('pending');
    icon.textContent  = '⚡';
    title.textContent = t('dynBanner1Title');
    sub.textContent   = t('dynBanner1Sub1') + formatDuration(remaining2Ms) + t('dynBanner1Sub2');
    badge.textContent = t('dynBanner1Badge');
    badge.style.color = '#F59E0B';
  } else {
    banner.classList.add('overdue');
    icon.textContent  = '⏳';
    title.textContent = t('dynBanner0Title');
    sub.textContent   = t('dynBanner0Sub') + formatDuration(remaining1Ms);
    badge.textContent = t('dynBanner0Badge');
    badge.style.color = '#3B82F6';
  }
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetAll() {
  clearInterval(countdownInterval);
  depositUTC = null;
  target1UTC = null;
  target2UTC = null;
  $('results-section').style.display = 'none';
  $('input-section').style.display = 'block';
  // Clear inputs
  $('utc-input').value   = '';
  $('gmail-input').value = '';
  $('manual-date').value = '';
  $('manual-time').value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── History (localStorage) ───────────────────────────────────────────────────
function saveHistory(deposit) {
  const history = getHistory();
  const entry = {
    id:      Date.now(),
    deposit: deposit.toISOString(),
    tab:     currentTab
  };
  history.unshift(entry);
  // Keep last 20
  if (history.length > 20) history.pop();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  renderHistory();
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function clearHistory() {
  if (!confirm(t('toastClearConfirm'))) return;
  localStorage.removeItem(STORAGE_KEY);
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  const list    = $('history-list');
  const clearBtn = $('clear-history-btn');

  if (history.length === 0) {
    list.innerHTML = `
      <div class="empty-history">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        <p>${t('historyEmpty')}</p>
      </div>`;
    clearBtn.style.display = 'none';
    return;
  }

  clearBtn.style.display = 'inline-flex';
  list.innerHTML = '';

  history.forEach(entry => {
    const deposit = new Date(entry.deposit);
    const target1 = new Date(deposit.getTime() + 4 * 24 * 3600 * 1000);
    const target2 = new Date(deposit.getTime() + 8 * 24 * 3600 * 1000);
    const now     = new Date();
    const remaining2 = target2 - now;

    let cls, tag;
    if (remaining2 <= 0) {
      cls = 'done';
      tag = t('histTagDone');
    } else if (now >= target1) {
      cls = 'pending';
      tag = t('histTagStage2');
    } else {
      cls = 'pending';
      tag = t('histTagStage1');
    }

    const item = el('div', `history-item ${cls}`);
    item.innerHTML = `
      <div class="history-status-dot"></div>
      <div class="history-main">
        <div class="history-date">${t('histDepositPfx')}${formatEgyptShort(deposit)}</div>
        <div class="history-meta">${t('histRev1Pfx')}${formatEgyptShort(target1)}</div>
        <div class="history-meta">${t('histRev2Pfx')}${formatEgyptShort(target2)}</div>
        ${remaining2 > 0
          ? `<div class="history-meta" style="color:var(--gold);margin-top:2px;">${t('histRemReady')}${formatDuration(remaining2)}</div>`
          : `<div class="history-meta" style="color:var(--success);margin-top:2px;">${t('histFullReady')}</div>`
        }
      </div>
      <div class="history-tag">${tag}</div>
    `;

    // Click to reload
    item.addEventListener('click', () => {
      depositUTC = deposit;
      target1UTC = target1;
      target2UTC = target2;
      showResults();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    list.appendChild(item);
  });
}

// ─── Toast Notification ───────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = el('div', 'toast');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  clearTimeout(toastTimer);
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Particle Canvas ──────────────────────────────────────────────────────────
(function initParticles() {
  const canvas = $('particle-canvas');
  const ctx    = canvas.getContext('2d');
  let particles = [];
  let W, H;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function spawnParticle() {
    return {
      x:    Math.random() * W,
      y:    Math.random() * H,
      r:    Math.random() * 1.5 + 0.5,
      vx:   (Math.random() - 0.5) * 0.25,
      vy:   -Math.random() * 0.4 - 0.1,
      life: 1,
      decay: Math.random() * 0.003 + 0.001,
      col:  Math.random() > 0.6 ? '#F7A600' : '#FF6B35'
    };
  }

  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 60; i++) {
    const p = spawnParticle();
    p.life = Math.random();
    particles.push(p);
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0 || p.y < -10) {
        particles[i] = spawnParticle();
        particles[i].y = H + 10;
        return;
      }
      ctx.save();
      ctx.globalAlpha = p.life * 0.35;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.col;
      ctx.fill();
      ctx.restore();
    });
    requestAnimationFrame(tick);
  }
  tick();
})();

// ─── Set default manual date to today ────────────────────────────────────────
(function setManualDefaults() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  $('manual-date').value = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}`;
  $('manual-time').value = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:00`;
})();

// ─── Enter key support ────────────────────────────────────────────────────────
['utc-input', 'gmail-input'].forEach(id => {
  $(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') calculate();
  });
});

// ─── Init & Language Load ───────────────────────────────────────────────────
currentLang = localStorage.getItem('bybit_tracker_lang') || 'ar';
currentMode = localStorage.getItem('bybit_tracker_mode') || 'calculator';
applyI18n();
renderHistory();

// Load accounts (with IndexedDB fallback)
initIndexedDB().then(async () => {
  accounts = getAccounts();
  // If localStorage is empty, try IndexedDB fallback
  if (!accounts.length) {
    const idbData = await loadFromIDB();
    if (idbData && idbData.length) {
      accounts = idbData;
      saveAccounts(); // Restore to localStorage
      showToast(t('idbRestored'));
    }
  }
  // Switch to default mode after data is loaded
  switchMode(currentMode);
  renderDashboard();
  updateNotifBtn();
  checkPendingNotifications();
});

// Refresh history timestamps every 30s
setInterval(renderHistory, 30000);


// ─── Mode Switching ──────────────────────────────────────────────────────────
function switchMode(mode) {
  currentMode = mode;
  localStorage.setItem('bybit_tracker_mode', mode);

  const calcBtn = $('mode-calc-btn');
  const mgrBtn  = $('mode-mgr-btn');
  const calcContainer = $('mode-calculator-container');
  const mgrContainer  = $('mode-manager-container');

  if (mode === 'manager') {
    calcBtn.classList.remove('active');
    mgrBtn.classList.add('active');
    calcContainer.style.display = 'none';
    mgrContainer.style.display  = 'block';

    // Start account card live updating interval
    clearInterval(accountsInterval);
    renderAccounts();
    accountsInterval = setInterval(tickAccounts, 1000);

  } else {
    calcBtn.classList.add('active');
    mgrBtn.classList.remove('active');
    calcContainer.style.display = 'block';
    mgrContainer.style.display  = 'none';

    // Stop account card live updating interval
    clearInterval(accountsInterval);
  }
}

// ─── IndexedDB Dual Storage ──────────────────────────────────────────────────
function initIndexedDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) { resolve(false); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { idb = e.target.result; resolve(true); };
    req.onerror = () => { resolve(false); };
  });
}

function saveToIDB(data) {
  if (!idb) return;
  try {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ key: 'accounts', data: JSON.stringify(data) });
  } catch(e) { /* silent fail */ }
}

function loadFromIDB() {
  return new Promise((resolve) => {
    if (!idb) { resolve(null); return; }
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get('accounts');
      req.onsuccess = () => {
        if (req.result) {
          try { resolve(JSON.parse(req.result.data)); }
          catch { resolve(null); }
        } else { resolve(null); }
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

// ─── Account Manager Operations ──────────────────────────────────────────────
function getAccounts() {
  try {
    return JSON.parse(localStorage.getItem('bybit_tracker_accounts') || '[]');
  } catch {
    return [];
  }
}

function saveAccounts() {
  localStorage.setItem('bybit_tracker_accounts', JSON.stringify(accounts));
  saveToIDB(accounts);
}

function openAddForm() {
  // Clear inputs
  $('edit-account-id').value = '';
  $('field-uid').value    = '';
  $('field-email').value  = '';
  $('field-ip').value     = '';
  $('field-amount').value = '';
  $('field-notes').value  = '';

  $('form-card-title').textContent = t('formTitleAdd');
  setFormTimeToNow();

  $('account-form-card').style.display = 'block';
  $('account-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeForm() {
  $('account-form-card').style.display = 'none';
}

function setFormTimeToNow() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  $('field-date').value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  $('field-time').value = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function saveAccount() {
  const idVal  = $('edit-account-id').value;
  const uid    = $('field-uid').value.trim();
  const email  = $('field-email').value.trim();
  const ip     = $('field-ip').value.trim();
  const amount = $('field-amount').value.trim();
  const notes  = $('field-notes').value.trim();
  
  const dateStr = $('field-date').value;
  const timeStr = $('field-time').value || '00:00:00';

  if (!dateStr) {
    showToast(t('toastFillRequired'));
    return;
  }

  const dateParts = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);
  const depositTime = localToUTC(
    dateParts[0], dateParts[1] - 1, dateParts[2],
    timeParts[0], timeParts[1], timeParts.length >= 3 ? timeParts[2] : 0,
    EGYPT_TZ
  );

  if (idVal) {
    // Edit existing
    const id = Number(idVal);
    const idx = accounts.findIndex(a => a.id === id);
    if (idx !== -1) {
      accounts[idx].uid = uid;
      accounts[idx].email = email;
      accounts[idx].ip = ip;
      accounts[idx].amount = amount;
      accounts[idx].notes = notes;
      accounts[idx].depositTime = depositTime.toISOString();
      if (!accounts[idx].auditLog) accounts[idx].auditLog = [];
      accounts[idx].auditLog.push({ action: 'edited', time: new Date().toISOString() });
    }
  } else {
    // Create new
    const newAcct = {
      id: Date.now(),
      uid: uid,
      email: email,
      ip: ip,
      amount: amount,
      notes: notes,
      depositTime: depositTime.toISOString(),
      stage: 1,
      stage2StartTime: null,
      auditLog: [{ action: 'created', time: new Date().toISOString() }],
      notif1Sent: false,
      notif2Sent: false
    };
    accounts.unshift(newAcct);
    scheduleNotifications(newAcct);
  }

  saveAccounts();
  closeForm();
  renderAccounts();
  renderDashboard();
}

function editAccount(id) {
  const acct = accounts.find(a => a.id === id);
  if (!acct) return;

  $('edit-account-id').value = acct.id;
  $('field-uid').value    = acct.uid;
  $('field-email').value  = acct.email;
  $('field-ip').value     = acct.ip;
  $('field-amount').value = acct.amount;
  $('field-notes').value  = acct.notes;

  const depDate = new Date(acct.depositTime);
  const pad = n => String(n).padStart(2, '0');
  $('field-date').value = `${depDate.getFullYear()}-${pad(depDate.getMonth()+1)}-${pad(depDate.getDate())}`;
  $('field-time').value = `${pad(depDate.getHours())}:${pad(depDate.getMinutes())}:${pad(depDate.getSeconds())}`;

  $('form-card-title').textContent = t('formTitleEdit');
  $('account-form-card').style.display = 'block';
  $('account-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteAccount(id) {
  if (!confirm(t('toastClearAcctConfirm'))) return;
  accounts = accounts.filter(a => a.id !== id);
  saveAccounts();
  renderAccounts();
}

function transitionStage2(id) {
  const acct = accounts.find(a => a.id === id);
  if (!acct) return;

  acct.stage = 2;
  acct.stage2StartTime = new Date().toISOString();
  if (!acct.auditLog) acct.auditLog = [];
  acct.auditLog.push({ action: 'stage2', time: new Date().toISOString() });
  acct.notif2Sent = false;
  saveAccounts();
  scheduleNotifications(acct);
  renderAccounts();
  renderDashboard();
}

function filterAccounts(status) {
  if (status !== undefined) filterStatus = status;
  // Update filter pill active state
  document.querySelectorAll('.filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.filter === filterStatus);
  });
  renderAccounts();
}

function changeSortBy(val) {
  sortBy = val;
  renderAccounts();
}

// ─── Quick Copy ───────────────────────────────────────────────────────────────
function copyToClipboard(text, label) {
  if (!text || text === '—') return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(t('toastCopied') + (label ? ` (${label})` : ''));
  }).catch(() => {
    // fallback
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(t('toastCopied'));
  });
}

// ─── Audit Log Toggle ─────────────────────────────────────────────────────────
function toggleAuditLog(id) {
  const section = $(`audit-log-${id}`);
  const btn = $(`audit-btn-${id}`);
  if (!section) return;
  const isHidden = section.style.display === 'none' || !section.style.display;
  section.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.textContent = isHidden ? t('auditHide') : t('auditShow');
}

// ─── Browser Notifications ───────────────────────────────────────────────────
function requestNotifPermission() {
  if (!('Notification' in window)) {
    showToast(t('toastNotifSupport'));
    return;
  }
  Notification.requestPermission().then(perm => {
    notifPermission = perm === 'granted';
    updateNotifBtn();
    if (notifPermission) {
      accounts.forEach(scheduleNotifications);
    }
  });
}

function updateNotifBtn() {
  const btn = $('notif-toggle-btn');
  if (!btn) return;
  if (!('Notification' in window)) { btn.style.display = 'none'; return; }
  if (Notification.permission === 'denied') {
    btn.textContent = t('btnNotifDenied');
    btn.classList.add('notif-denied');
    btn.classList.remove('notif-on');
    btn.disabled = true;
  } else if (Notification.permission === 'granted') {
    btn.textContent = t('btnNotifOn');
    btn.classList.add('notif-on');
    btn.classList.remove('notif-denied');
    btn.disabled = false;
    notifPermission = true;
  } else {
    btn.textContent = t('btnNotif');
    btn.classList.remove('notif-on', 'notif-denied');
    btn.disabled = false;
  }
}

function scheduleNotifications(acct) {
  if (!notifPermission) return;
  const now = Date.now();

  if (acct.stage === 1 && !acct.notif1Sent) {
    const deposit = new Date(acct.depositTime).getTime();
    const target1 = deposit + 4 * 24 * 3600 * 1000;
    const delay = target1 - now;
    if (delay > 0) {
      setTimeout(() => {
        const a = accounts.find(x => x.id === acct.id);
        if (a && !a.notif1Sent) {
          new Notification(t('notifStage1Title'), {
            body: t('notifStage1Body') + (a.uid || '—'),
            icon: '/favicon.ico'
          });
          a.notif1Sent = true;
          saveAccounts();
        }
      }, delay);
    }
  }

  if (acct.stage === 2 && !acct.notif2Sent) {
    const s2Start = new Date(acct.stage2StartTime).getTime();
    const target2 = s2Start + 4 * 24 * 3600 * 1000;
    const delay = target2 - now;
    if (delay > 0) {
      setTimeout(() => {
        const a = accounts.find(x => x.id === acct.id);
        if (a && !a.notif2Sent) {
          new Notification(t('notifStage2Title'), {
            body: t('notifStage2Body') + (a.uid || '—'),
            icon: '/favicon.ico'
          });
          a.notif2Sent = true;
          saveAccounts();
        }
      }, delay);
    }
  }
}

function checkPendingNotifications() {
  if (Notification.permission !== 'granted') return;
  notifPermission = true;
  const now = Date.now();
  accounts.forEach(acct => {
    // Fire any missed notifications
    if (acct.stage === 1) {
      const target1 = new Date(acct.depositTime).getTime() + 4 * 24 * 3600 * 1000;
      if (now >= target1 && !acct.notif1Sent) {
        new Notification(t('notifStage1Title'), {
          body: t('notifStage1Body') + (acct.uid || '—'),
          icon: '/favicon.ico'
        });
        acct.notif1Sent = true;
      }
    } else if (acct.stage === 2) {
      const target2 = new Date(acct.stage2StartTime).getTime() + 4 * 24 * 3600 * 1000;
      if (now >= target2 && !acct.notif2Sent) {
        new Notification(t('notifStage2Title'), {
          body: t('notifStage2Body') + (acct.uid || '—'),
          icon: '/favicon.ico'
        });
        acct.notif2Sent = true;
      }
    }
    // Schedule future notifications
    scheduleNotifications(acct);
  });
  saveAccounts();
}

// ─── Export / Import ─────────────────────────────────────────────────────────
function exportAccounts() {
  if (!accounts.length) { showToast(t('toastNoDataExport')); return; }
  const data = JSON.stringify(accounts, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const fname = `waqtak_backup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
  a.href = url;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('toastExportOk'));
}

function triggerImport() {
  $('import-file-input').click();
}

function importAccounts(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data) || data.length === 0) {
        showToast(t('toastImportEmpty')); return;
      }
      // Validate basic structure
      const valid = data.filter(a => a.id && a.depositTime);
      if (!valid.length) { showToast(t('toastImportEmpty')); return; }
      accounts = valid;
      saveAccounts();
      renderAccounts();
      renderDashboard();
      checkPendingNotifications();
      showToast(t('toastImportOk'));
    } catch {
      showToast(t('toastImportErr'));
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
function renderDashboard() {
  const totalEl    = $('dash-total');
  const stage1El   = $('dash-stage1');
  const stage2El   = $('dash-stage2');
  const doneEl     = $('dash-done');
  const depositsEl = $('dash-deposits');
  const soonEl     = $('dash-soon');
  if (!totalEl) return;

  const now = Date.now();
  const oneDayMs = 24 * 3600 * 1000;

  let stage1Count = 0, stage2Count = 0, doneCount = 0, totalDeposit = 0, soonCount = 0;

  accounts.forEach(a => {
    const amt = parseFloat(a.amount) || 0;
    totalDeposit += amt;

    if (a.stage === 1) {
      const target1 = new Date(a.depositTime).getTime() + 4 * oneDayMs;
      if (now >= target1) doneCount++;
      else {
        stage1Count++;
        if ((target1 - now) <= oneDayMs) soonCount++;
      }
    } else if (a.stage === 2) {
      const target2 = new Date(a.stage2StartTime).getTime() + 4 * oneDayMs;
      if (now >= target2) doneCount++;
      else {
        stage2Count++;
        if ((target2 - now) <= oneDayMs) soonCount++;
      }
    }
  });

  totalEl.textContent    = accounts.length;
  stage1El.textContent   = stage1Count;
  stage2El.textContent   = stage2Count;
  doneEl.textContent     = doneCount;
  depositsEl.textContent = '$' + totalDeposit.toLocaleString(currentLang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  soonEl.textContent     = soonCount;
}

function renderAccounts() {
  const grid = $('accounts-grid');
  if (!grid) return;

  const query = ($('mgr-search')?.value || '').trim().toLowerCase();
  const now = Date.now();
  const oneDayMs = 24 * 3600 * 1000;

  // Filter accounts
  let filtered = accounts.filter(acct => {
    // Text search
    if (query) {
      const matchSearch = (acct.uid && acct.uid.toLowerCase().includes(query)) ||
                          (acct.email && acct.email.toLowerCase().includes(query));
      if (!matchSearch) return false;
    }
    // Status filter
    if (filterStatus === 'all') return true;
    if (filterStatus === 'stage1') {
      if (acct.stage !== 1) return false;
      const t1 = new Date(acct.depositTime).getTime() + 4 * oneDayMs;
      return now < t1;
    }
    if (filterStatus === 'stage2') {
      if (acct.stage !== 2) return false;
      const t2 = new Date(acct.stage2StartTime).getTime() + 4 * oneDayMs;
      return now < t2;
    }
    if (filterStatus === 'done') {
      if (acct.stage === 1) {
        return now >= new Date(acct.depositTime).getTime() + 4 * oneDayMs;
      }
      if (acct.stage === 2) {
        return now >= new Date(acct.stage2StartTime).getTime() + 4 * oneDayMs;
      }
      return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.depositTime) - new Date(b.depositTime);
    if (sortBy === 'soonest') {
      const getRemaining = acct => {
        if (acct.stage === 1) return new Date(acct.depositTime).getTime() + 4 * oneDayMs - now;
        if (acct.stage === 2) return new Date(acct.stage2StartTime).getTime() + 4 * oneDayMs - now;
        return Infinity;
      };
      return getRemaining(a) - getRemaining(b);
    }
    // newest (default)
    return new Date(b.depositTime) - new Date(a.depositTime);
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-history" style="grid-column: 1 / -1; width: 100%; padding: 40px 0;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        </svg>
        <p>${currentLang === 'ar' ? 'لا توجد حسابات مطابقة' : 'No matching accounts found'}</p>
      </div>`;
    return;
  }

  grid.innerHTML = '';

  filtered.forEach(acct => {
    const card = el('div', 'card account-card');
    card.id = `account-card-${acct.id}`;

    const deposit = new Date(acct.depositTime);
    const hasStage2 = acct.stage === 2;
    const stage2Start = hasStage2 ? new Date(acct.stage2StartTime) : null;
    const auditEntries = (acct.auditLog || []).map(entry => {
      const label = entry.action === 'created' ? t('auditCreated') :
                    entry.action === 'edited'  ? t('auditEdited') :
                    entry.action === 'stage2'  ? t('auditStage2') : entry.action;
      return `<div class="audit-entry"><span class="audit-action">${label}</span><span class="audit-time">${formatEgyptShort(new Date(entry.time))}</span></div>`;
    }).join('');

    card.innerHTML = `
      <div class="account-card-header">
        <div class="account-title-group">
          <span class="account-uid-title"># ${acct.uid || '—'}</span>
          <button class="copy-icon-btn" onclick="copyToClipboard('${acct.uid}', 'UID')" title="Copy UID">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <span class="account-status-badge">...</span>
        </div>
        <div class="account-actions">
          <button class="icon-action-btn edit-acct-btn" onclick="editAccount(${acct.id})" title="${t('formTitleEdit')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-action-btn delete-acct-btn" onclick="deleteAccount(${acct.id})" title="${currentLang === 'ar' ? 'حذف' : 'Delete'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="account-card-body">
        <div class="account-info-row">
          <span class="info-label-inline">${t('cardEmail')}</span>
          <span class="info-value-inline">${acct.email || '—'}</span>
          <button class="copy-icon-btn" onclick="copyToClipboard('${acct.email}', 'Email')" title="Copy Email">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
        <div class="account-info-row">
          <span class="info-label-inline">${t('cardIP')}</span>
          <span class="info-value-inline">${acct.ip || '—'}</span>
          <button class="copy-icon-btn" onclick="copyToClipboard('${acct.ip}', 'IP')" title="Copy IP">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
        <div class="account-info-row">
          <span class="info-label-inline">${t('cardAmount')}</span>
          <span class="info-value-inline" style="color:var(--gold);font-weight:600;">$${acct.amount || '—'}</span>
        </div>
        
        <div class="account-timer-section">
          <div class="account-timer-label">${t('statActiveLabel')}</div>
          <div class="account-timer-val">—</div>
        </div>
        
        ${acct.notes ? `
          <div class="account-notes-section">
            <div class="notes-title">${t('cardNotes')}</div>
            <div class="notes-text">${acct.notes}</div>
          </div>
        ` : ''}

        ${auditEntries ? `
          <div class="audit-log-section" id="audit-log-${acct.id}" style="display:none;">
            <div class="audit-log-title">${t('auditLog')}</div>
            ${auditEntries}
          </div>
        ` : ''}
      </div>
      
      <div class="account-card-footer">
        <div class="card-time-meta">
          <div>${t('cardCreated')} ${formatEgyptShort(deposit)}</div>
          ${hasStage2 ? `<div>${t('cardStage2Started')} ${formatEgyptShort(stage2Start)}</div>` : ''}
        </div>
        <div class="card-footer-right">
          ${auditEntries ? `<button id="audit-btn-${acct.id}" class="audit-toggle-btn" onclick="toggleAuditLog(${acct.id})">${t('auditShow')}</button>` : ''}
          <div class="card-actions-row"></div>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  // Immediate ticker call to set countdowns
  tickAccounts();
}

function tickAccounts() {
  const now = new Date();
  accounts.forEach(account => {
    const card = $(`account-card-${account.id}`);
    if (!card) return;

    const deposit = new Date(account.depositTime);
    const target1 = new Date(deposit.getTime() + 4 * 24 * 3600 * 1000);

    const badge = card.querySelector('.account-status-badge');
    const countdownEl = card.querySelector('.account-timer-val');
    const actionBtnRow = card.querySelector('.card-actions-row');

    if (account.stage === 1) {
      const remaining1 = target1 - now;
      if (remaining1 <= 0) {
        // Stage 1 Completed (Action required)
        if (badge && !badge.classList.contains('stage1-done')) {
          badge.className = 'account-status-badge stage1-done';
          badge.textContent = t('cardStage1Done');
        }
        if (countdownEl) {
          countdownEl.textContent = t('dynReady');
          countdownEl.style.color = '#3B82F6'; // Info blue
        }
        if (actionBtnRow && !actionBtnRow.querySelector('.stage2-btn')) {
          actionBtnRow.innerHTML = `
            <button class="calc-btn stage2-btn" onclick="transitionStage2(${account.id})">
              <span>${t('cardBtnStage2')}</span>
            </button>
          `;
        }
      } else {
        // Stage 1 Active (Counting down 4 days)
        if (badge && !badge.classList.contains('stage1-active')) {
          badge.className = 'account-status-badge stage1-active';
          badge.textContent = t('cardStage1');
        }
        if (countdownEl) {
          countdownEl.textContent = formatDuration(remaining1);
          countdownEl.style.color = 'var(--gold)';
        }
      }
    } else if (account.stage === 2) {
      const stage2Start = new Date(account.stage2StartTime);
      const target2 = new Date(stage2Start.getTime() + 4 * 24 * 3600 * 1000);
      const remaining2 = target2 - now;

      if (remaining2 <= 0) {
        // Stage 2 Completed (Full Done)
        if (badge && !badge.classList.contains('stage2-done')) {
          badge.className = 'account-status-badge stage2-done';
          badge.textContent = t('cardStage2Done');
        }
        if (countdownEl) {
          countdownEl.textContent = t('dynReady');
          countdownEl.style.color = 'var(--success)';
        }
        if (actionBtnRow) actionBtnRow.innerHTML = ''; // Hide action button
      } else {
        // Stage 2 Active (Counting down 4 days since tasks done)
        if (badge && !badge.classList.contains('stage2-active')) {
          badge.className = 'account-status-badge stage2-active';
          badge.textContent = t('cardStage2');
        }
        if (countdownEl) {
          countdownEl.textContent = formatDuration(remaining2);
          countdownEl.style.color = 'var(--warning)';
        }
      }
    }
  });
}
