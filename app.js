// ─── Data ─────────────────────────────────────────────────────────────────────
let ALL_EVENTS = [];

async function loadEvents() {
    try {
        const res = await fetch('./all_events.json');
        ALL_EVENTS = await res.json();
        initializeApp();
    } catch (err) {
        console.error('Failed to load events:', err);
    }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAY_LABELS = {
    "2026-07-29": "Wed Jul 29",
    "2026-07-30": "Thu Jul 30",
    "2026-07-31": "Fri Jul 31",
    "2026-08-01": "Sat Aug 1",
    "2026-08-02": "Sun Aug 2"
};

const ALL_TYPES = [
    "BGM - Board Game", "CGM - Non-Collectible / Tradable Card Game",
    "EGM - Electronic Games", "ENT - Entertainment Events", "ESC - Escape Rooms",
    "FLM - Film Festival", "HMN - Historical Miniatures", "KID - Kids Activities",
    "LRP - LARP", "MHE - Miniature Hobby Events", "NMN - Non-Historical Miniatures",
    "RPG - Roleplaying Game", "SEM - Seminar", "SPA - Supplemental Activities",
    "TCG - Tradable Card Game", "TDA - True Dungeon Adventures!",
    "TRD - Trade Day Events",
    "WKS - Workshop", "ZED - Isle of Misfit Events"
];

const EXP_MAP = {
    "None (You've never played before - rules will be taught)": "Beginner friendly",
    "Some (You've played it a bit and understand the basics)": "Some experience",
    "Expert (You play it regularly and know all the rules)": "Expert"
};

const TAG_CODE_MAP = {
    rpg: 'tag-rpg', bgm: 'tag-bgm', wks: 'tag-wks',
    mhe: 'tag-mhe', nmn: 'tag-nmn', cgm: 'tag-cgm', egm: 'tag-egm'
};

// ─── URL index maps ───────────────────────────────────────────────────────────
// Each filter value maps to a short integer for compact URLs.
// The index position IS the number — never reorder these arrays.
const URL_DAYS = Object.keys(DAY_LABELS);          // 0=Wed,1=Thu,2=Fri,3=Sat,4=Sun
const URL_TYPES = ALL_TYPES;                         // 0=BGM,1=CGM,...
const URL_AGES = ["kids only (12 and under)", "Everyone (6+)", "Teen (13+)", "Mature (18+)", "21+"];
const URL_EXPS = [
    "None (You've never played before - rules will be taught)",
    "Some (You've played it a bit and understand the basics)",
    "Expert (You play it regularly and know all the rules)"
];

// Encode an array of unchecked values to a comma-separated string of indices.
function encodeUnchecked(unchecked, map) {
    return unchecked.map(v => map.indexOf(v)).filter(i => i !== -1).join(',');
}

// Decode a comma-separated index string back to a Set of values.
function decodeUnchecked(str, map) {
    return new Set(str.split(',').map(n => map[parseInt(n, 10)]).filter(Boolean));
}

// ─── DOM cache (populated in cacheDOM after DOMContentLoaded) ─────────────────
// [3] All filter-related DOM nodes are looked up once and reused.
const DOM = {};

// Fix 2: plain JS variable instead of DOM dataset for the filter badge count.
let activeFilterCount = 0;

function cacheDOM() {
    DOM.searchBox = document.getElementById('searchBox');
    DOM.costSlider = document.getElementById('costSlider');
    DOM.costLabel = document.getElementById('costLabel');
    DOM.ticketsSlider = document.getElementById('ticketsSlider');
    DOM.ticketsLabel = document.getElementById('ticketsLabel');
    DOM.dayFilters = document.getElementById('dayFilters');
    DOM.typeFilters = document.getElementById('typeFilters');
    DOM.expFilters = document.getElementById('expFilters');
    DOM.ageFilters = document.getElementById('ageFilters');
    DOM.sortBy = document.getElementById('sortBy');
    DOM.tableWrap = document.querySelector('.table-wrap');
    DOM.tableBody = document.getElementById('tableBody');
    DOM.noResults = document.getElementById('noResults');
    DOM.resultCount = document.getElementById('resultCount');
    DOM.pagination = document.getElementById('pagination');
    DOM.detailOverlay = document.getElementById('detailOverlay');
    DOM.detailContent = document.getElementById('detailContent');
    DOM.timeFromSlider = document.getElementById('timeFromSlider');
    DOM.timeFromLabel = document.getElementById('timeFromLabel');
    DOM.filterBadge = document.getElementById('filterBadge');
    DOM.suggestions = document.getElementById('suggestions');

    // Fix 3: replace deprecated onclick="closeDetail(event)" on overlay.
    DOM.detailOverlay.addEventListener('click', closeDetail);

    // Fix 4: replace deprecated onkeydown="onSearchKey(event)" on search box.
    DOM.searchBox.addEventListener('keydown', onSearchKey);

    // Delegated mousedown on the suggestions list — avoids inline onmousedown.
    // mousedown is used (not click) so the suggestion registers before the
    // input's blur fires and hides the list.
    DOM.suggestions.addEventListener('mousedown', e => {
        const item = e.target.closest('.suggestion-item');
        if (item) pickSuggestion(item);
    });
}

// Convert a 12-hour time string like "1:00 PM" or "10:30 AM" to minutes since
// midnight. Used to build a sortable numeric key so "8:00 AM" < "1:00 PM".
function timeToMinutes(timeStr) {
    const m = (timeStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 0;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + min;
}

// [1] Run once after JSON loads. Avoids recomputing strings/lookups on every
//     filter or render call.
function precomputeEvent(e, i) {
    // Store absolute index so showDetail() can reach ALL_EVENTS directly.
    e._idx = i;

    // Search haystack — built once, reused on every keypress.
    e._hay = (e.title + ' ' + (e.system || '') + ' ' + (e.gm || '') + ' ' + (e.desc || '')).toLowerCase();

    // Resolved day label.
    e._dayLabel = DAY_LABELS[e.date] || e.date;

    // Numeric sort key: "YYYY-MM-DD" + zero-padded minutes-since-midnight.
    // Avoids broken lexicographic comparison of 12-hour time strings.
    e._sortKey = e.date + String(timeToMinutes(e.start_time)).padStart(4, '0');

    // Tag class + short code.
    const code = e.type.split(' - ')[0].toLowerCase();
    const tagClass = 'tag ' + (TAG_CODE_MAP[code] || 'tag-default');
    const shortT = e.type.split(' - ')[0];

    // Cost badge.
    const costStr = e.cost === 0
        ? '<span class="cost-free">Free</span>'
        : `<span class="cost-paid">$${e.cost}</span>`;

    // Duration string.
    const durStr = e.duration_h ? e.duration_h + 'h' : '—';

    // Ticket badge.
    let tixStr;
    if (e.tickets === 0) tixStr = '<span class="tickets-none">Sold out</span>';
    else if (e.tickets <= 3) tixStr = `<span class="tickets-low">${e.tickets} left</span>`;
    else tixStr = `<span class="tickets-ok">${e.tickets}</span>`;

    // Pre-built table row cells (static HTML, no re-compute needed during renders).
    e._rowHtml =
        `<td class="td-title">${e.title}<small>${e.system || ''}</small></td>` +
        `<td class="time-cell">${e._dayLabel}<br/><span style="color:var(--text4);font-size:11px">${e.start_time}–${e.end_time}</span></td>` +
        `<td class="td-type"><span class="tag-wrap"><span class="${tagClass}">${shortT}</span><span class="tag-tip">${e.type}</span></span></td>` +
        `<td>${costStr}</td>` +
        `<td>${durStr}</td>` +
        `<td>${tixStr}</td>`;
}

// ─── State ────────────────────────────────────────────────────────────────────
let pageSize = 50;
let filtered = [];
let page = 1;
let sortCol = 'date';
let sortDir = 'asc';
let debounceTimer;

// MiniSearch instance — built once in initializeApp after events load.
let miniSearch = null;
// Map of _idx → relevance score, populated on each search.
let searchScores = null;

// ─── Virtual scroll ───────────────────────────────────────────────────────────
const VS_ROW_H = 52;   // px — must match the CSS `height` on tbody tr
const VS_OVERSCAN = 15;   // rows rendered above/below the visible window
const VS_THRESHOLD = 500; // engage virtual scroll above this many rendered rows

let vsActive = false;
let vsRAFPending = false;

// Default direction for each column on first click.
const SORT_DEFAULT_DIR = {
    relevance: 'desc', date: 'asc', title: 'asc', type: 'asc',
    cost: 'asc', duration: 'desc', tickets: 'desc'
};

// ─── Filter UI builders ───────────────────────────────────────────────────────
function buildDayFilters() {
    const dates = [...new Set(ALL_EVENTS.map(e => e.date))].sort();
    DOM.dayFilters.innerHTML = dates.map(d =>
        `<label class="type-item" id="daybtn-${d}">` +
        `<input type="checkbox" value="${d}" checked onchange="toggleDay()"/>` +
        `${DAY_LABELS[d] || d}</label>`
    ).join('');
}

// [7] Removed unused `checked` parameter — applyFilter() reads checkbox state itself.
function toggleDay() {
    applyFilter();
}

function buildTypeFilters() {
    DOM.typeFilters.innerHTML = ALL_TYPES.map(t =>
        `<label class="type-item"><input type="checkbox" value="${t}" checked onchange="applyFilter()"/>${t}</label>`
    ).join('');
}

function allTypes() {
    DOM.typeFilters.querySelectorAll('input').forEach(cb => cb.checked = true);
    applyFilter();
}

function clearTypes() {
    DOM.typeFilters.querySelectorAll('input').forEach(cb => cb.checked = false);
    applyFilter();
}

function buildExpFilters() {
    const exps = [
        "None (You've never played before - rules will be taught)",
        "Some (You've played it a bit and understand the basics)",
        "Expert (You play it regularly and know all the rules)"
    ];
    DOM.expFilters.innerHTML = exps.map(e =>
        `<label class="type-item"><input type="checkbox" value="${e}" checked onchange="applyFilter()"/>` +
        `<span>${EXP_MAP[e] || e}</span></label>`
    ).join('');
}

function buildAgeFilters() {
    const ages = ["kids only (12 and under)", "Everyone (6+)", "Teen (13+)", "Mature (18+)", "21+"];
    DOM.ageFilters.innerHTML = ages.map(a =>
        `<label class="type-item"><input type="checkbox" value="${a}" checked onchange="applyFilter()"/>${a}</label>`
    ).join('');
}

// ─── MiniSearch index ─────────────────────────────────────────────────────────
function buildSearchIndex() {
    miniSearch = new MiniSearch({
        idField: '_idx',
        fields: ['title', 'system', 'gm'],
        storeFields: [],
        searchOptions: {
            boost: {title: 10, system: 2, gm: 2},
            prefix: true,
            fuzzy: 0.1,
            combineWith: 'AND'
        }
    });
    miniSearch.addAll(ALL_EVENTS);
}

// ─── Slider handlers ──────────────────────────────────────────────────────────
function onTickets(val) {
    DOM.ticketsLabel.textContent = +val === 0 ? 'Any' : val + '+';
    debounceFilter();
}

function onCost(val) {
    DOM.costLabel.textContent = +val === 1000 ? 'Any' : '$' + val;
    debounceFilter();
}

// Convert minutes-since-midnight to a display string e.g. 570 → "9:30 AM".
function minutesToTime(mins) {
    mins = parseInt(mins, 10);
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const ampm = h24 < 12 ? 'AM' : 'PM';
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function onTimeFrom(val) {
    const mins = parseInt(val, 10);
    DOM.timeFromLabel.textContent = mins === 0 ? 'Any' : minutesToTime(mins);
    debounceFilter();
}

// ─── Debounce ─────────────────────────────────────────────────────────────────
function debounceSearch() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        updateSuggestions();
        applyFilter();
    }, 200);
}

function debounceFilter() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilter, 200);
}

// ─── Auto-suggest ─────────────────────────────────────────────────────────────
let activeSuggestion = -1;

function updateSuggestions() {
    const q = DOM.searchBox.value.trim();
    if (!q || !miniSearch) {
        hideSuggestions();
        return;
    }

    const top = miniSearch.autoSuggest(q, {
        prefix: true, fuzzy: 0.1, boost: {title: 10, system: 2, gm: 2}
    }).slice(0, 7);

    if (!top.length) {
        hideSuggestions();
        return;
    }

    DOM.suggestions.innerHTML = top.map((s, i) =>
        `<li class="suggestion-item" data-i="${i}">${s.suggestion}</li>`
    ).join('');
    DOM.suggestions.style.display = 'block';
    activeSuggestion = -1;
}

function hideSuggestions() {
    DOM.suggestions.style.display = 'none';
    activeSuggestion = -1;
}

function pickSuggestion(el) {
    DOM.searchBox.value = el.textContent;
    hideSuggestions();
    applyFilter();
}

function onSearchKey(e) {
    const items = DOM.suggestions.querySelectorAll('.suggestion-item');
    if (e.key === 'Escape') {
        hideSuggestions();
        return;
    }
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSuggestion = Math.min(activeSuggestion + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSuggestion = Math.max(activeSuggestion - 1, -1);
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
        e.preventDefault();
        pickSuggestion(items[activeSuggestion]);
        return;
    } else {
        return;
    }
    items.forEach((el, i) => el.classList.toggle('active', i === activeSuggestion));
    if (activeSuggestion >= 0) DOM.searchBox.value = items[activeSuggestion].textContent;
}

document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) hideSuggestions();
});

// ─── Sort helpers ─────────────────────────────────────────────────────────────
function setSort(col) {
    if (col === sortCol) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        sortCol = col;
        sortDir = SORT_DEFAULT_DIR[col] ?? 'asc';
    }
    DOM.sortBy.value = sortCol;
    updateSortHeaders();
    applyFilter();
}

function onDropdownSort() {
    sortCol = DOM.sortBy.value;
    sortDir = SORT_DEFAULT_DIR[sortCol] ?? 'asc';
    updateSortHeaders();
    applyFilter();
}

function updateSortHeaders() {
    document.querySelectorAll('thead th[data-col]').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (th.dataset.col === sortCol) {
            arrow.textContent = sortDir === 'asc' ? ' ▲' : ' ▼';
            th.classList.add('sort-active');
        } else {
            arrow.textContent = '';
            th.classList.remove('sort-active');
        }
    });
}

// Show/hide the Relevance sort option and auto-select it when search is active.
function syncRelevanceOption(hasQuery) {
    const opt = document.getElementById('relevanceOption');
    opt.style.display = hasQuery ? '' : 'none';
    if (hasQuery && sortCol !== 'relevance') {
        // Auto-switch to relevance when the user starts searching.
        sortCol = 'relevance';
        sortDir = 'desc';
        DOM.sortBy.value = 'relevance';
        updateSortHeaders();
    } else if (!hasQuery && sortCol === 'relevance') {
        // Revert to date when search is cleared.
        sortCol = 'date';
        sortDir = 'asc';
        DOM.sortBy.value = 'date';
        updateSortHeaders();
    }
}

// ─── Core filter ─────────────────────────────────────────────────────────────
function applyFilter() {
    const q = DOM.searchBox.value.trim();
    const maxCost = parseInt(DOM.costSlider.value);
    const minTickets = parseInt(DOM.ticketsSlider.value);
    const timeFrom = parseInt(DOM.timeFromSlider.value);

    const days = new Set([...DOM.dayFilters.querySelectorAll('input:checked')].map(cb => cb.value));
    const types = new Set([...DOM.typeFilters.querySelectorAll('input:checked')].map(cb => cb.value));
    const exps = new Set([...DOM.expFilters.querySelectorAll('input:checked')].map(cb => cb.value));
    const ages = new Set([...DOM.ageFilters.querySelectorAll('input:checked')].map(cb => cb.value));

    syncRelevanceOption(!!q);

    // When a query is present, run MiniSearch and build a score map keyed by _idx.
    if (q && miniSearch) {
        const results = miniSearch.search(q);
        const qLower = q.toLowerCase();
        searchScores = new Map(results.map(r => {
            const title = ALL_EVENTS[r.id].title.toLowerCase();
            let score = r.score;
            // Exact title match → huge boost so it always leads.
            if (title === qLower) score *= 200;
            // Title starts with query → very strong boost.
            else if (title.startsWith(qLower)) score *= 50;
            // Title contains query as a substring → solid boost.
            else if (title.includes(qLower)) score *= 20;
            return [r.id, score];
        }));
    } else {
        searchScores = null;
    }

    filtered = ALL_EVENTS.filter(e => {
        if (!days.has(e.date)) return false;
        if (!types.has(e.type)) return false;
        if (e.cost > maxCost) return false;
        if (minTickets > 0 && e.tickets < minTickets) return false;
        if (timeFrom > 0 && timeToMinutes(e.start_time) < timeFrom) return false;
        if (e.exp && !exps.has(e.exp)) return false;
        if (e.age && !ages.has(e.age)) return false;

        return !(searchScores && !searchScores.has(e._idx));
    });

    filtered.sort((a, b) => {
        let cmp = 0;
        if (sortCol === 'relevance') {
            // Higher score = better match → descending by default.
            cmp = (searchScores?.get(b._idx) ?? 0) - (searchScores?.get(a._idx) ?? 0);
        } else if (sortCol === 'date') cmp = a._sortKey.localeCompare(b._sortKey);
        else if (sortCol === 'title') cmp = a.title.localeCompare(b.title);
        else if (sortCol === 'type') cmp = a.type.localeCompare(b.type);
        else if (sortCol === 'cost') cmp = a.cost - b.cost;
        else if (sortCol === 'duration') cmp = a.duration_h - b.duration_h;
        else if (sortCol === 'tickets') cmp = a.tickets - b.tickets;
        return sortDir === 'asc' ? cmp : -cmp;
    });

    page = 1;
    updateFilterBadge();
    pushState();
    render();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
    const total = filtered.length;
    DOM.resultCount.textContent = total.toLocaleString() + ' events';

    if (!total) {
        DOM.tableBody.innerHTML = '';
        DOM.noResults.style.display = 'block';
        DOM.pagination.innerHTML = '';
        setVirtualScroll(false);
        return;
    }
    DOM.noResults.style.display = 'none';

    // Decide how many rows we'd actually paint in paged mode.
    const effectiveSize = isFinite(pageSize) ? pageSize : total;
    const pagedRowCount = isFinite(pageSize) ? Math.min(effectiveSize, total) : total;
    const useVS = pagedRowCount > VS_THRESHOLD;

    setVirtualScroll(useVS);

    if (useVS) {
        // Reset scroll when the result set changes (new filter / sort).
        DOM.tableWrap.scrollTop = 0;
        paintVirtualRows();
    } else {
        const start = (page - 1) * effectiveSize;
        const slice = filtered.slice(start, start + effectiveSize);
        let html = '';
        for (let i = 0; i < slice.length; i++) {
            html += `<tr data-idx="${slice[i]._idx}">${slice[i]._rowHtml}</tr>`;
        }
        DOM.tableBody.innerHTML = html;
        renderPagination(total);
    }
}

// Enable/disable virtual scroll mode on the table-wrap container.
function setVirtualScroll(on) {
    if (on === vsActive) return;
    vsActive = on;
    DOM.tableWrap.classList.toggle('vs-active', on);
    if (on) {
        DOM.tableWrap.addEventListener('scroll', onVirtualScroll, {passive: true});
        DOM.pagination.innerHTML = '';
    } else {
        DOM.tableWrap.removeEventListener('scroll', onVirtualScroll);
        DOM.tableWrap.scrollTop = 0;
    }
}

// RAF-throttled scroll handler — avoids painting more than once per frame.
function onVirtualScroll() {
    if (!vsRAFPending) {
        vsRAFPending = true;
        requestAnimationFrame(() => {
            paintVirtualRows();
            vsRAFPending = false;
        });
    }
}

// Core virtual paint: only renders rows visible in the viewport + overscan.
// Spacer <tr>s above and below hold the correct total scroll height.
function paintVirtualRows() {
    const total = filtered.length;
    const scrollTop = DOM.tableWrap.scrollTop;
    const viewH = DOM.tableWrap.clientHeight;

    const firstVis = Math.floor(scrollTop / VS_ROW_H);
    const lastVis = Math.ceil((scrollTop + viewH) / VS_ROW_H);
    const start = Math.max(0, firstVis - VS_OVERSCAN);
    const end = Math.min(total - 1, lastVis + VS_OVERSCAN);

    const topPx = start * VS_ROW_H;
    const bottomPx = Math.max(0, (total - end - 1) * VS_ROW_H);

    let html = `<tr class="v-spacer" style="height:${topPx}px"></tr>`;
    for (let i = start; i <= end; i++) {
        html += `<tr data-idx="${filtered[i]._idx}">${filtered[i]._rowHtml}</tr>`;
    }
    html += `<tr class="v-spacer" style="height:${bottomPx}px"></tr>`;

    DOM.tableBody.innerHTML = html;
}

// ─── Page size ────────────────────────────────────────────────────────────────
function setPageSize(n, btn) {
    pageSize = n;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    page = 1;
    render();
}

// ─── Pagination ───────────────────────────────────────────────────────────────
function renderPagination(total) {
    const effectiveSize = isFinite(pageSize) ? pageSize : total;
    const totalPages = Math.ceil(total / effectiveSize);
    if (totalPages <= 1) {
        DOM.pagination.innerHTML = '';
        return;
    }

    const pages = [];
    pages.push(`<button class="page-btn" ${page === 1 ? 'disabled' : ''} onclick="goPage(${page - 1})">← Prev</button>`);

    const range = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - page) <= 2) range.push(i);
        else if (range[range.length - 1] !== '…') range.push('…');
    }
    range.forEach(r => {
        if (r === '…') pages.push(`<span style="padding:5px 4px;color:var(--text4)">…</span>`);
        else pages.push(`<button class="page-btn ${r === page ? 'active' : ''}" onclick="goPage(${r})">${r}</button>`);
    });
    pages.push(`<button class="page-btn" ${page === totalPages ? 'disabled' : ''} onclick="goPage(${page + 1})">Next →</button>`);

    DOM.pagination.innerHTML = pages.join('');
}

function goPage(p) {
    page = p;
    render();
    window.scrollTo(0, 0);
}

// ─── Detail overlay ───────────────────────────────────────────────────────────
// [5] Click is handled by a single delegated listener on tbody (set up in
//     initTableDelegation). showDetail() receives the ALL_EVENTS index directly.
function showDetail(idx) {
    const e = ALL_EVENTS[idx];
    const dayLabel = e._dayLabel;

    DOM.detailContent.innerHTML =
        `<p style="font-size:11px;color:var(--text4);margin-bottom:4px">${e.id}</p>` +
        `<h2 class="detail-title">${e.title}</h2>` +
        `<p class="detail-meta">${e.type} · ${dayLabel}, ${e.start_time}–${e.end_time}</p>` +
        (e.url ? `<a href="${e.url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-bottom:14px;font-size:13px">View on Gen Con →</a>` : '') +
        `<p class="detail-desc">${e.desc || 'No description available.'}</p>` +
        `<div class="detail-grid">` +
        `<div class="detail-field"><label>Cost</label><p>${e.cost === 0 ? 'Free' : '$' + e.cost}</p></div>` +
        `<div class="detail-field"><label>Duration</label><p>${e.duration_h ? e.duration_h + 'h' : '—'}</p></div>` +
        `<div class="detail-field"><label>Location</label><p>${[e.location, e.room].filter(Boolean).join(', ') || '—'}</p></div>` +
        `<div class="detail-field"><label>Tickets Left</label><p>${e.tickets || '—'}</p></div>` +
        `<div class="detail-field"><label>Players</label><p>${e.min_p}–${e.max_p}</p></div>` +
        `<div class="detail-field"><label>Age</label><p>${e.age || '—'}</p></div>` +
        `<div class="detail-field"><label>Experience</label><p>${EXP_MAP[e.exp] || e.exp || '—'}</p></div>` +
        `<div class="detail-field"><label>Game Master</label><p>${e.gm || '—'}</p></div>` +
        (e.system ? `<div class="detail-field"><label>System</label><p>${e.system}</p></div>` : '') +
        `</div>`;

    DOM.detailOverlay.classList.add('open');
}

function initTableDelegation() {
    DOM.tableBody.addEventListener('click', ev => {
        const row = ev.target.closest('tr');
        if (row) showDetail(parseInt(row.dataset.idx, 10));
    });
}

function closeDetail(ev) {
    if (ev.target === DOM.detailOverlay) closeDetailBtn();
}

function closeDetailBtn() {
    DOM.detailOverlay.classList.remove('open');
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDetailBtn();
});

// ─── Mobile filters ───────────────────────────────────────────────────────────
// We physically relocate the <aside> node rather than cloning it,
// so all its event listeners stay intact automatically.
let asideOriginalParent = null;
let asideNextSibling = null;

function toggleMobileFilters() {
    const aside = document.querySelector('aside');
    const sortRow = document.querySelector('.sort-row');
    const btn = document.getElementById('filterToggleBtn');
    const isOpen = aside.classList.toggle('mobile-drawer');

    if (isOpen) {
        // Remember where aside lives so we can put it back.
        asideOriginalParent = aside.parentNode;
        asideNextSibling = aside.nextSibling;
        // Move it right after the sort row, inside <main>.
        sortRow.insertAdjacentElement('afterend', aside);
    } else {
        // Move it back to its original position in .layout.
        asideOriginalParent.insertBefore(aside, asideNextSibling);
    }

    const count = activeFilterCount;
    btn.innerHTML =
        (isOpen ? '✕ Close' : '⚙ Filters') +
        ` <span class="filter-badge" id="filterBadge">${count > 0 ? count : ''}</span>`;
    DOM.filterBadge = document.getElementById('filterBadge');
}

// Count how many filters deviate from their all-checked default.
function updateFilterBadge() {
    if (!DOM.filterBadge) return;
    let active = 0;

    // Unchecked days
    DOM.dayFilters.querySelectorAll('input').forEach(cb => {
        if (!cb.checked) active++;
    });
    // Unchecked types
    DOM.typeFilters.querySelectorAll('input').forEach(cb => {
        if (!cb.checked) active++;
    });
    // Unchecked ages
    DOM.ageFilters.querySelectorAll('input').forEach(cb => {
        if (!cb.checked) active++;
    });
    // Unchecked experience
    DOM.expFilters.querySelectorAll('input').forEach(cb => {
        if (!cb.checked) active++;
    });
    // Cost slider not at max
    if (parseInt(DOM.costSlider.value) < 1000) active++;
    // Tickets slider not at zero
    if (parseInt(DOM.ticketsSlider.value) > 0) active++;
    // Time sliders not at defaults
    if (parseInt(DOM.timeFromSlider.value) > 0) active++;

    activeFilterCount = active;
    DOM.filterBadge.textContent = active || '';
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark');
    document.getElementById('toggleIcon').textContent = isDark ? '☀️' : '🌙';
    document.getElementById('toggleLabel').textContent = isDark ? 'Light mode' : 'Dark mode';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

(function () {
    const saved = localStorage.getItem('theme');
    const isDark = saved ? saved === 'dark' : true;
    document.body.classList.toggle('dark', isDark);
    document.getElementById('toggleIcon').textContent = isDark ? '☀️' : '🌙';
    document.getElementById('toggleLabel').textContent = isDark ? 'Light mode' : 'Dark mode';
})();

// ─── URL state sync ───────────────────────────────────────────────────────────
// Encodes only non-default state so URLs stay short.
// Uses replaceState so filter changes don't spam the browser history.

function pushState() {
    const params = new URLSearchParams();

    const q = DOM.searchBox.value.trim();
    if (q) params.set('q', q);

    if (sortCol !== 'date' || sortDir !== 'asc')
        params.set('sort', `${sortCol}.${sortDir}`);

    const maxCost = parseInt(DOM.costSlider.value);
    if (maxCost < 1000) params.set('cost', String(maxCost));

    const minTix = parseInt(DOM.ticketsSlider.value);
    if (minTix > 0) params.set('tix', String(minTix));

    const timeFrom = parseInt(DOM.timeFromSlider.value);
    if (timeFrom > 0) params.set('tfrom', String(timeFrom));

    const uncheckedDays = [...DOM.dayFilters.querySelectorAll('input:not(:checked)')].map(cb => cb.value);
    if (uncheckedDays.length) params.set('days', encodeUnchecked(uncheckedDays, URL_DAYS));

    const uncheckedTypes = [...DOM.typeFilters.querySelectorAll('input:not(:checked)')].map(cb => cb.value);
    if (uncheckedTypes.length) params.set('types', encodeUnchecked(uncheckedTypes, URL_TYPES));

    const uncheckedAges = [...DOM.ageFilters.querySelectorAll('input:not(:checked)')].map(cb => cb.value);
    if (uncheckedAges.length) params.set('ages', encodeUnchecked(uncheckedAges, URL_AGES));

    const uncheckedExps = [...DOM.expFilters.querySelectorAll('input:not(:checked)')].map(cb => cb.value);
    if (uncheckedExps.length) params.set('exps', encodeUnchecked(uncheckedExps, URL_EXPS));

    if (pageSize !== 50)
        params.set('ps', pageSize === Infinity ? 'all' : String(pageSize));

    const str = params.toString();
    history.replaceState(null, '', str ? `?${str}` : location.pathname);
}

function restoreState() {
    const params = new URLSearchParams(location.search);
    if (!params.toString()) return;

    if (params.has('q'))
        DOM.searchBox.value = params.get('q');

    if (params.has('sort')) {
        const [col, dir] = params.get('sort').split('.');
        if (col && dir && !(col === 'relevance' && !params.has('q'))) {
            sortCol = col;
            sortDir = dir;
        }
    }

    if (params.has('cost')) {
        const v = params.get('cost');
        DOM.costSlider.value = v;
        DOM.costLabel.textContent = +v === 1000 ? 'Any' : `$${v}`;
    }

    if (params.has('tix')) {
        const v = params.get('tix');
        DOM.ticketsSlider.value = v;
        DOM.ticketsLabel.textContent = +v === 0 ? 'Any' : `${v}+`;
    }

    if (params.has('tfrom')) {
        const v = params.get('tfrom');
        DOM.timeFromSlider.value = v;
        DOM.timeFromLabel.textContent = +v === 0 ? 'Any' : minutesToTime(+v);
    }

    if (params.has('days')) {
        const unchecked = decodeUnchecked(params.get('days'), URL_DAYS);
        DOM.dayFilters.querySelectorAll('input').forEach(cb => {
            cb.checked = !unchecked.has(cb.value);
        });
    }

    if (params.has('types')) {
        const unchecked = decodeUnchecked(params.get('types'), URL_TYPES);
        DOM.typeFilters.querySelectorAll('input').forEach(cb => {
            cb.checked = !unchecked.has(cb.value);
        });
    }

    if (params.has('ages')) {
        const unchecked = decodeUnchecked(params.get('ages'), URL_AGES);
        DOM.ageFilters.querySelectorAll('input').forEach(cb => {
            cb.checked = !unchecked.has(cb.value);
        });
    }

    if (params.has('exps')) {
        const unchecked = decodeUnchecked(params.get('exps'), URL_EXPS);
        DOM.expFilters.querySelectorAll('input').forEach(cb => {
            cb.checked = !unchecked.has(cb.value);
        });
    }

    if (params.has('ps')) {
        const raw = params.get('ps');
        pageSize = raw === 'all' ? Infinity : parseInt(raw);
        document.querySelectorAll('.seg-btn').forEach(btn => {
            const n = btn.textContent.trim() === 'All' ? Infinity : parseInt(btn.textContent);
            btn.classList.toggle('active', n === pageSize);
        });
    }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
function initializeApp() {
    // [1] Precompute derived data for every event once, right after JSON loads.
    ALL_EVENTS.forEach(precomputeEvent);

    // [3] Cache all filter DOM references.
    cacheDOM();

    // Build MiniSearch index over all events.
    buildSearchIndex();

    // [5] Single delegated click listener on the table body.
    initTableDelegation();

    buildDayFilters();
    buildTypeFilters();
    buildAgeFilters();
    buildExpFilters();
    restoreState();
    updateSortHeaders();
    applyFilter();
}

loadEvents().catch(err => {
    console.error('Failed to load events:', err);
    const el = document.getElementById('resultCount');
    if (el) el.textContent = 'Failed to load events. Please refresh the page.';
});
