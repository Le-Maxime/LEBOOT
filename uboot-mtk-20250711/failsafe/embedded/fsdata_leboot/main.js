/* SPDX-License-Identifier: GPL-2.0 */
/*
 * Copyright (C) 2026 Yuzhii0718
 *
 * All rights reserved.
 *
 * This file is part of the project bl-mt798x-dhcpd
 * You may not use, copy, modify or distribute this file except in compliance with the license agreement.
 */

// Project/author constants (centralized for reuse)
const AUTHOR_HANDLE = "Yuzhii0718";
const AUTHOR_DISPLAY = "💡Yuzhii";
const GITHUB_USER_URL = "https://github.com/Yuzhii0718/";
const PROJECT_REPO_URL = "https://github.com/Yuzhii0718/bl-mt798x-dhcpd";

// Single global state container (defined eagerly so early helpers can read it).
var APP_STATE = {
    lang: "en",
    theme: "auto",
    page: "",
};

function normalizeLang(input) {
    if (!input) return "en";
    const code = String(input).toLowerCase().split(/[-_]/)[0];
    if (code === "ru") return "ru";
    if (code === "uk") return "uk";
    if (code === "zh") return "zh";
    return "en";
}

function detectLang() {
    try {
        const storedLang = localStorage.getItem("lang");
        if (storedLang) return normalizeLang(storedLang);
    } catch { /* ignore */ }
    const candidates = navigator.languages?.length
        ? navigator.languages
        : (navigator.language ? [navigator.language] : []);
    return normalizeLang(candidates[0]);
}

function detectTheme() {
    try {
        return localStorage.getItem("theme") ?? "auto";
    } catch {
        return "auto";
    }
}

function normalizeThemeMode(input) {
    if (!input) return "auto";
    const normalizedMode = String(input).toLowerCase().trim();
    return normalizedMode === "light" || normalizedMode === "dark" || normalizedMode === "auto" ? normalizedMode : "auto";
}

function isI18nAvailable() {
    return typeof I18N !== "undefined" && I18N;
}

function isI18nEnabled() {
    return APP_STATE.i18nEnabled !== false;
}

function t(key, fallback) {
    const languageCode = APP_STATE.lang || "en";
    const defaultValue = fallback !== undefined ? fallback : key;
    if (!isI18nEnabled() || !isI18nAvailable()) return defaultValue;
    return I18N[languageCode]?.[key] ?? I18N.en?.[key] ?? defaultValue;
}

function applyI18n(rootNode) {
    const scope = rootNode || document;
    const enabled = isI18nEnabled() && isI18nAvailable();

    for (const node of scope.querySelectorAll("[data-i18n]")) {
        const key = node.getAttribute("data-i18n");
        if (!node.hasAttribute("data-i18n-fallback")) {
            node.setAttribute("data-i18n-fallback", node.textContent || "");
        }
        const fallback = node.getAttribute("data-i18n-fallback") || "";
        node.textContent = enabled ? t(key, fallback) : fallback;
    }

    for (const node of scope.querySelectorAll("[data-i18n-html]")) {
        const key = node.getAttribute("data-i18n-html");
        if (!node.hasAttribute("data-i18n-html-fallback")) {
            node.setAttribute("data-i18n-html-fallback", node.innerHTML || "");
        }
        const fallback = node.getAttribute("data-i18n-html-fallback") || "";
        node.innerHTML = enabled ? t(key, fallback) : fallback;
    }

    for (const node of scope.querySelectorAll("[data-i18n-attr]")) {
        const spec = node.getAttribute("data-i18n-attr");
        if (!spec) continue;
        const [attrName, ...keyParts] = spec.split(":");
        if (!attrName || keyParts.length === 0) continue;
        const key = keyParts.join(":");
        const fallbackKey = `data-i18n-attr-fallback-${attrName}`;
        if (!node.hasAttribute(fallbackKey)) {
            node.setAttribute(fallbackKey, node.getAttribute(attrName) || "");
        }
        const fallback = node.getAttribute(fallbackKey) || "";
        node.setAttribute(attrName, enabled ? t(key, fallback) : fallback);
    }
}

function setLang(language) {
    APP_STATE.lang = normalizeLang(language);
    try {
        localStorage.setItem("lang", APP_STATE.lang);
    } catch { /* ignore */ }
    applyI18n(document);
    if (APP_STATE.page === "backup" && typeof backupRefreshI18n === "function") backupRefreshI18n();
    if (APP_STATE.page === "flash"  && typeof flashRefreshI18n  === "function") flashRefreshI18n();
    if (typeof renderSysInfo === "function") renderSysInfo();
    updateDocumentTitle();
}

function updateThemeSelect() {
    const themeSelect = document.getElementById("theme_select");
    if (!themeSelect) return;
    themeSelect.value = APP_STATE.theme || "auto";
}

function setTheme(themeMode, options = {}) {
    const { persistLocal = true, persistEnv = false, silent = false } = options;
    APP_STATE.theme = normalizeThemeMode(themeMode || "auto");

    if (persistLocal) {
        try { localStorage.setItem("theme", APP_STATE.theme); }
        catch { /* ignore */ }
    }

    const rootElement = document.documentElement;
    if (typeof window.__failsafeThemeApplyMode === "function") {
        window.__failsafeThemeApplyMode(APP_STATE.theme, { silent });
    } else if (APP_STATE.theme === "auto") {
        rootElement.removeAttribute("data-theme");
    } else {
        rootElement.setAttribute("data-theme", APP_STATE.theme);
    }

    updateThemeSelect();
    if (persistEnv) saveThemeMode(APP_STATE.theme);
}

const THEME_COLOR_ENV_KEY = "failsafe_theme_color";
const THEME_COLOR_CACHE_KEY = "failsafe_theme_color_cache";
const ACCENT_PRESETS = ["#2563eb", "#0ea5e9", "#14b8a6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#a855f7"];
const THEME_MODE_ENV_KEY = "failsafe_theme_mode";
const THEME_DARK_VARIANT_ENV_KEY = "failsafe_theme_dark_variant";
const THEME_DARK_VARIANT_CACHE_KEY = "failsafe_theme_dark_variant_cache";

function normalizeDarkVariant(input) {
    if (input == null) return "";
    const value = String(input).trim().toLowerCase();
    return value === "amoled" ? "amoled" : "";
}

const HEX3_RE = /^[0-9a-fA-F]{3}$/;
const HEX6_RE = /^[0-9a-fA-F]{6}$/;

function normalizeHexColor(input) {
    if (input == null) return null;
    let value = String(input).trim();
    if (!value) return null;
    if (value[0] === "#") value = value.slice(1);
    if (!HEX3_RE.test(value) && !HEX6_RE.test(value)) return null;
    const hex = value.length === 3
        ? `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`
        : `#${value}`;
    return hex.toLowerCase();
}

function hexToRgb(hex) {
    const normalizedHex = normalizeHexColor(hex);
    if (!normalizedHex) return null;
    return {
        r: parseInt(normalizedHex.slice(1, 3), 16),
        g: parseInt(normalizedHex.slice(3, 5), 16),
        b: parseInt(normalizedHex.slice(5, 7), 16),
    };
}

function applyAccentVars(color) {
    const normalizedColor = normalizeHexColor(color);
    if (!normalizedColor) return false;
    const rgb = hexToRgb(normalizedColor);
    if (!rgb) return false;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--primary", normalizedColor);
    rootStyle.setProperty("--primary-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    rootStyle.setProperty("--primary-2", blendColor(normalizedColor, "#ffffff", 0.28));
    ensureThemeColorMeta(normalizedColor);
    return true;
}

function blendColor(sourceHex, targetHex, ratio) {
    const a = hexToRgb(sourceHex);
    const b = hexToRgb(targetHex);
    if (!a || !b) return sourceHex;
    const mix = (x, y) => Math.round(x + (y - x) * ratio).toString(16).padStart(2, "0");
    return `#${mix(a.r, b.r)}${mix(a.g, b.g)}${mix(a.b, b.b)}`;
}

function ensureThemeColorMeta(color) {
    if (!color) return;
    let meta = document.querySelector("meta[name='theme-color']");
    if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        document.head?.appendChild(meta);
    }
    meta.setAttribute("content", color);
}

function updateAccentControls(color) {
    const normalizedColor = normalizeHexColor(color);
    const colorPicker = document.getElementById("accent_color_picker");
    const colorInput  = document.getElementById("accent_color_input");
    if (colorPicker && normalizedColor) colorPicker.value = normalizedColor;
    if (colorInput  && normalizedColor) colorInput.value  = normalizedColor;

    for (const swatch of document.querySelectorAll(".color-swatch")) {
        const presetColor = String(swatch.dataset?.color ?? "").toLowerCase();
        swatch.classList.toggle("active", !!normalizedColor && presetColor === normalizedColor);
    }
}

function applyAccentColor(color) {
    const isApplied = applyAccentVars(color);
    if (!isApplied) return false;
    updateAccentControls(color);
    return true;
}

try {
    const cachedColor = localStorage.getItem(THEME_COLOR_CACHE_KEY);
    if (cachedColor) applyAccentVars(cachedColor);
} catch { /* ignore */ }

async function saveThemeColor(color) {
    const normalizedColor = normalizeHexColor(color);
    if (!normalizedColor) return;
    try { localStorage.setItem(THEME_COLOR_CACHE_KEY, normalizedColor); }
    catch { /* ignore */ }
    try {
        const formData = new FormData();
        formData.append("color", normalizedColor);
        await fetch("/theme/set", { method: "POST", body: formData });
    } catch { /* network errors silently dropped */ }
}

async function saveThemeMode(theme) {
    const normalizedMode = normalizeThemeMode(theme);
    try { localStorage.setItem("theme", normalizedMode); }
    catch { /* ignore */ }
    try {
        const formData = new FormData();
        formData.append("theme", normalizedMode);
        await fetch("/theme/set", { method: "POST", body: formData });
    } catch { /* network errors silently dropped */ }
}

async function loadThemeColor() {
    let currentColor = null;
    let loadedFromEnv = false;
    try {
        const response = await fetch("/theme/get", { method: "GET" });
        if (response?.ok) {
            const payload = await response.json();
            currentColor = normalizeHexColor(payload?.color);
            loadedFromEnv = !!currentColor;
        }
    } catch { /* ignore */ }

    if (!currentColor) {
        try {
            const cssValue = getComputedStyle(document.documentElement).getPropertyValue("--primary") ?? "";
            currentColor = normalizeHexColor(cssValue.trim());
        } catch { /* ignore */ }
    }

    if (!currentColor) return;

    if (loadedFromEnv) {
        applyAccentColor(currentColor);
        try { localStorage.setItem(THEME_COLOR_CACHE_KEY, currentColor); }
        catch { /* ignore */ }
    }
    updateAccentControls(currentColor);
}

async function loadThemeMode() {
    let mode = null;
    try {
        const response = await fetch("/theme/get", { method: "GET" });
        if (response?.ok) {
            const payload = await response.json();
            if (payload?.theme) mode = normalizeThemeMode(payload.theme);
        }
    } catch { /* ignore */ }

    if (mode) setTheme(mode, { persistEnv: false, persistLocal: true, silent: true });
}

function updateDarkVariantControl(variant) {
    const select = document.getElementById("settings_dark_variant");
    if (!select) return;
    select.value = normalizeDarkVariant(variant);
}

function applyDarkVariant(variant, options = {}) {
    const { persistLocal = true, silent = false } = options;
    const normalized = normalizeDarkVariant(variant);

    if (persistLocal) {
        try {
            if (normalized) localStorage.setItem(THEME_DARK_VARIANT_CACHE_KEY, normalized);
            else localStorage.removeItem(THEME_DARK_VARIANT_CACHE_KEY);
        } catch { /* ignore */ }
    }

    if (typeof window.__failsafeThemeApplyDarkVariant === "function") {
        window.__failsafeThemeApplyDarkVariant(normalized, { silent });
    } else {
        const root = document.documentElement;
        if (normalized) root.setAttribute("data-theme-dark", normalized);
        else root.removeAttribute("data-theme-dark");
    }

    updateDarkVariantControl(normalized);
}

async function saveDarkVariant(variant) {
    const normalized = normalizeDarkVariant(variant);
    /* server expects "standard" or empty to clear; we send "standard" so the
     * intent is explicit in transit, the backend turns it back into unset */
    const wire = normalized || "standard";
    try {
        const formData = new FormData();
        formData.append("dark_variant", wire);
        await fetch("/theme/set", { method: "POST", body: formData });
    } catch { /* network errors silently dropped */ }
}

async function loadDarkVariant() {
    let variant = null;
    try {
        const response = await fetch("/theme/get", { method: "GET" });
        if (response?.ok) {
            const payload = await response.json();
            variant = normalizeDarkVariant(payload?.dark_variant);
        }
    } catch { /* ignore */ }

    /* always update UI even when env-side is empty (need to clear stale select) */
    applyDarkVariant(variant ?? "", { persistLocal: true, silent: true });
}

function appendAccentControls(container) {
    if (!container) return;

    const row = document.createElement("div");
    row.className = "control-row control-row-color";

    const accentLabel = document.createElement("div");
    accentLabel.setAttribute("data-i18n", "control.accent");
    accentLabel.textContent = t("control.accent");
    row.appendChild(accentLabel);

    const picker = document.createElement("div");
    picker.className = "color-picker";

    const presets = document.createElement("div");
    presets.className = "color-presets";
    for (const presetColor of ACCENT_PRESETS) {
        const swatchButton = document.createElement("button");
        swatchButton.type = "button";
        swatchButton.className = "color-swatch";
        swatchButton.dataset.color = presetColor.toLowerCase();
        swatchButton.style.backgroundColor = presetColor;
        swatchButton.setAttribute("aria-label", `Accent ${presetColor}`);
        swatchButton.addEventListener("click", () => {
            applyAccentColor(presetColor);
            saveThemeColor(presetColor);
        });
        presets.appendChild(swatchButton);
    }

    const inputs = document.createElement("div");
    inputs.className = "color-inputs";

    const colorTextInput = document.createElement("input");
    colorTextInput.type = "text";
    colorTextInput.id = "accent_color_input";
    colorTextInput.setAttribute("data-i18n-attr", "placeholder:theme.color.placeholder");
    colorTextInput.placeholder = t("theme.color.placeholder");
    colorTextInput.addEventListener("change", () => {
        const normalizedColor = normalizeHexColor(colorTextInput.value);
        if (!normalizedColor) return;
        applyAccentColor(normalizedColor);
        saveThemeColor(normalizedColor);
    });

    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.id = "accent_color_picker";
    colorPicker.setAttribute("data-i18n-attr", "title:theme.color.custom");
    colorPicker.title = t("theme.color.custom");
    colorPicker.addEventListener("input", () => {
        applyAccentColor(colorPicker.value);
        saveThemeColor(colorPicker.value);
    });

    inputs.appendChild(colorTextInput);
    inputs.appendChild(colorPicker);

    picker.appendChild(presets);
    picker.appendChild(inputs);

    row.appendChild(picker);
    container.appendChild(row);
}

function ensureFavicon() {
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "icon");
        link.setAttribute("type", "image/svg+xml");
        document.head?.appendChild(link);
    }
    link.setAttribute("href", "/favicon.svg");
}

function updateDocumentTitle() {
    if (!isI18nEnabled() || !isI18nAvailable() || !APP_STATE.page) return;

    const titleKey = `${APP_STATE.page}.title`;
    if (I18N[APP_STATE.lang]?.[titleKey]) {
        document.title = t(titleKey);
        return;
    }

    if (APP_STATE.page === "flashing") {
        document.title = t("flashing.title.in_progress");
    } else if (APP_STATE.page === "booting") {
        document.title = t("booting.title.in_progress");
    }
}

function ensureBranding() {
    const versionNode = document.getElementById("version");
    if (!versionNode) return;

    // Use current content as base version string
    let baseVersion = versionNode.getAttribute("data-base-version");
    if (!baseVersion) {
        baseVersion = versionNode.innerHTML.trim() || "U-Boot Failsafe UI v2026.05.28 (a3b2a581f)";
        // Strip out any previously appended branding if re-run
        const projectIdx = baseVersion.indexOf("You can find");
        if (projectIdx !== -1) baseVersion = baseVersion.slice(0, projectIdx).trim();
        versionNode.setAttribute("data-base-version", baseVersion);
    }

    versionNode.style.lineHeight = "1.6";
    versionNode.style.marginTop = "16px";
    versionNode.style.opacity = "0.55";
    versionNode.style.fontSize = "0.82rem";

    versionNode.innerHTML = `
        <strong>LEBOOT v1.4.1</strong><br>
        дизайн: Le Maxime<br>
        <span style="font-size: 0.72rem; opacity: 0.85;">основано на ${baseVersion}</span>
    `;
}

function ensureSidebar() {
    const createNavLink = (path, i18nKey, navId, iconSvg) => {
        const link = document.createElement("a");
        link.className = "nav-link";
        link.href = path;
        link.setAttribute("data-nav-id", navId);

        const labelSpan = document.createElement("span");
        labelSpan.className = "nav-label";
        labelSpan.setAttribute("data-i18n", i18nKey);
        labelSpan.textContent = t(i18nKey);
        link.appendChild(labelSpan);

        const iconSpan = document.createElement("span");
        iconSpan.className = "nav-icon";
        iconSpan.innerHTML = iconSvg;
        link.appendChild(iconSpan);

        // Normalize and check active
        let normalizedPath = path;
        if (normalizedPath !== "/" && normalizedPath.charAt(0) !== "/") normalizedPath = "/" + normalizedPath;
        let currentPath = (location && location.pathname) ? location.pathname : "";
        if (currentPath === "") currentPath = "/";
        const isActive = normalizedPath === currentPath || (normalizedPath === "/" && (currentPath === "/" || currentPath === "/index.html"));
        if (isActive) link.classList.add("active");
        return link;
    };

    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    // Avoid re-rendering
    if (sidebar.getAttribute("data-rendered") === "1") return;
    sidebar.setAttribute("data-rendered", "1");

    // Clear existing content
    sidebar.innerHTML = "";

    // Branding
    const brandContainer = document.createElement("div");
    brandContainer.className = "brand-capsule";
    brandContainer.innerHTML = '<span class="brand-le">LE</span><span class="brand-boot">BOOT</span>';
    sidebar.appendChild(brandContainer);

    // SVG icons
    const svgs = {
        home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
        reload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
        box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
        rotate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>`,
        cpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="15" x2="23" y2="15"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="15" x2="4" y2="15"></line></svg>`,
        power: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>`,
        table: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>`,
        image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
        download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
        edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
        terminal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`,
        database: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"></path></svg>`
    };

    // Navigation Container
    const navContainer = document.createElement("div");
    navContainer.className = "nav";

    // 1. Basic Settings Section
    const basicSection = document.createElement("div");
    basicSection.className = "nav-section";
    
    const basicTitle = document.createElement("div");
    basicTitle.className = "nav-section-title";
    basicTitle.setAttribute("data-i18n", "nav.basic");
    basicTitle.textContent = t("nav.basic");
    basicSection.appendChild(basicTitle);

    basicSection.appendChild(createNavLink("/", "nav.firmware", "firmware", svgs.home));
    basicSection.appendChild(createNavLink("/upgrade.html", "nav.upgrade", "upgrade", svgs.download));
    basicSection.appendChild(createNavLink("/initramfs.html", "nav.initramfs", "initramfs", svgs.download));
    basicSection.appendChild(createNavLink("/reboot.html", "nav.reboot", "reboot", svgs.power));
    
    navContainer.appendChild(basicSection);

    // 2. Advanced Settings Section
    const advancedSection = document.createElement("div");
    advancedSection.className = "nav-section";
    
    const advancedTitle = document.createElement("div");
    advancedTitle.className = "nav-section-title";
    advancedTitle.setAttribute("data-i18n", "nav.advanced");
    advancedTitle.textContent = t("nav.advanced");
    advancedSection.appendChild(advancedTitle);

    advancedSection.appendChild(createNavLink("/settings.html", "nav.settings", "settings", svgs.cpu));
    advancedSection.appendChild(createNavLink("/uboot.html", "nav.uboot", "uboot", svgs.reload));
    advancedSection.appendChild(createNavLink("/bl2.html", "nav.bl2", "bl2", svgs.reload));
    
    const gptLink = createNavLink("/gpt.html", "nav.gpt", "gpt", svgs.table);
    gptLink.style.display = "none";
    advancedSection.appendChild(gptLink);

    const simgLink = createNavLink("/simg.html", "nav.simg", "simg", svgs.image);
    simgLink.style.display = "none";
    advancedSection.appendChild(simgLink);

    const ubiLink = createNavLink("/ubi.html", "nav.ubi", "ubi", svgs.database);
    ubiLink.style.display = "none";
    advancedSection.appendChild(ubiLink);

    advancedSection.appendChild(createNavLink("/factory.html", "nav.factory", "factory", svgs.rotate));
    advancedSection.appendChild(createNavLink("/backup.html", "nav.backup", "backup", svgs.download));
    advancedSection.appendChild(createNavLink("/flash.html", "nav.flash", "flash", svgs.edit));
    advancedSection.appendChild(createNavLink("/env.html", "nav.env", "env", svgs.box));
    advancedSection.appendChild(createNavLink("/console.html", "nav.console", "console", svgs.terminal));

    navContainer.appendChild(advancedSection);

    sidebar.appendChild(navContainer);

    applyI18n(sidebar);
    updateGptNavVisibility();
    updateSimgNavVisibility();
    updateUbiNavVisibility();
    updateSettingsNavVisibility();
    attachSidebarScrollPersistence(navContainer);
}

function ensureHelpModal() {
    let backdrop = document.getElementById("help_modal_backdrop");
    if (backdrop) return backdrop;

    backdrop = document.createElement("div");
    backdrop.id = "help_modal_backdrop";
    backdrop.className = "help-modal-backdrop";

    const modal = document.createElement("div");
    modal.className = "help-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "help_modal_title");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "help-modal-close";
    closeButton.setAttribute("data-i18n-attr", "aria-label:common.close");
    closeButton.setAttribute("aria-label", t("common.close", "Close"));
    closeButton.innerHTML = "&times;";
    closeButton.addEventListener("click", closeHelpModal);
    modal.appendChild(closeButton);

    const header = document.createElement("div");
    header.className = "help-modal-header";

    const logo = document.createElement("img");
    logo.className = "help-modal-logo";
    logo.src = "/favicon.svg";
    logo.alt = "";
    header.appendChild(logo);

    const titles = document.createElement("div");
    const title = document.createElement("h2");
    title.id = "help_modal_title";
    title.className = "help-modal-title";
    title.setAttribute("data-i18n", "help.title");
    title.textContent = t("help.title", "About & Help");
    titles.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "help-modal-subtitle";
    subtitle.setAttribute("data-i18n", "app.name");
    subtitle.textContent = t("app.name");
    titles.appendChild(subtitle);

    header.appendChild(titles);
    modal.appendChild(header);

    const body = document.createElement("div");
    body.className = "help-modal-body";

    const intro = document.createElement("p");
    intro.className = "help-modal-intro";
    intro.setAttribute("data-i18n", "help.intro");
    intro.textContent = t("help.intro");
    body.appendChild(intro);

    const info = document.createElement("dl");
    info.className = "help-modal-info";

    const authorDt = document.createElement("dt");
    authorDt.setAttribute("data-i18n", "help.author");
    authorDt.textContent = t("help.author", "Author");
    info.appendChild(authorDt);

    const authorDd = document.createElement("dd");
    const authorLink = document.createElement("a");
    authorLink.href = GITHUB_USER_URL;
    authorLink.target = "_blank";
    authorLink.rel = "noopener";
    authorLink.textContent = AUTHOR_DISPLAY;
    authorDd.appendChild(authorLink);
    info.appendChild(authorDd);

    const projectDt = document.createElement("dt");
    projectDt.setAttribute("data-i18n", "help.project");
    projectDt.textContent = t("help.project", "Project");
    info.appendChild(projectDt);

    const projectDd = document.createElement("dd");
    const projectLink = document.createElement("a");
    projectLink.href = PROJECT_REPO_URL;
    projectLink.target = "_blank";
    projectLink.rel = "noopener";
    projectLink.textContent = "Yuzhii0718/bl-mt798x-dhcpd";
    projectDd.appendChild(projectLink);
    info.appendChild(projectDd);

    body.appendChild(info);
    modal.appendChild(body);

    backdrop.appendChild(modal);

    backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) closeHelpModal();
    });

    document.body.appendChild(backdrop);
    return backdrop;
}

function handleHelpModalKey(event) {
    if (event.key === "Escape") closeHelpModal();
}

function openHelpModal() {
    const backdrop = ensureHelpModal();
    applyI18n(backdrop);
    backdrop.classList.add("is-open");
    document.addEventListener("keydown", handleHelpModalKey);
}

function closeHelpModal() {
    const backdrop = document.getElementById("help_modal_backdrop");
    if (backdrop) backdrop.classList.remove("is-open");
    document.removeEventListener("keydown", handleHelpModalKey);
}

const SIDEBAR_SCROLL_KEY = "failsafe_sidebar_scroll";

function readSidebarScroll() {
    try {
        const raw = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
        const n = raw === null ? NaN : parseInt(raw, 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch { return 0; }
}

function writeSidebarScroll(value) {
    const v = Math.max(0, value | 0);
    try { sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(v)); }
    catch { /* quota or disabled — ignore */ }
}

function attachSidebarScrollPersistence(navContainer) {
    const targetTop = readSidebarScroll();

    // The nav is the actual scroll container, but on a fresh page its layout
    // may not be ready immediately. Setting scrollTop before scrollHeight is
    // populated silently clamps to 0 — so retry across frames until either the
    // container becomes scrollable, or we give up.
    let attempts = 0;
    const tryRestore = () => {
        if (targetTop <= 0) return;
        const maxTop = navContainer.scrollHeight - navContainer.clientHeight;
        if (maxTop > 0) {
            navContainer.scrollTop = Math.min(targetTop, maxTop);
            return;
        }
        if (attempts++ < 30) requestAnimationFrame(tryRestore);
    };
    tryRestore();

    // Save scroll position, throttled via rAF.
    let rafId = 0;
    navContainer.addEventListener("scroll", () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            writeSidebarScroll(navContainer.scrollTop);
        });
    }, { passive: true });

    // Flush the current scroll position synchronously whenever the user is
    // about to leave the page — the throttled scroll write may not have fired
    // yet by the time navigation starts.
    const flush = () => writeSidebarScroll(navContainer.scrollTop);

    // Capture-phase click on links inside the sidebar: runs before the browser
    // begins navigation, while sessionStorage writes are still guaranteed.
    navContainer.addEventListener("click", (event) => {
        if (event.target.closest?.("a")) flush();
    }, true);

    window.addEventListener("pagehide", flush);
    // Some embedded browsers fire only beforeunload; cover both.
    window.addEventListener("beforeunload", flush);
}

function ajax(request) {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (event) => request.progress?.(event));
    xhr.addEventListener("readystatechange", () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
            request.done?.(xhr.responseText);
        }
    });
    if (request.timeout) xhr.timeout = request.timeout;
    const method = request.data ? "POST" : "GET";
    xhr.open(method, request.url);
    xhr.send(request.data);
}

/* consoleInit moved to console_js.js */

/* envInit moved to env_js.js */

function appInit(pageName) {
    try {
        APP_STATE.page = pageName || "";
        APP_STATE.i18nEnabled = isI18nAvailable();
        APP_STATE.lang = detectLang();
        APP_STATE.theme = detectTheme();
        setTheme(APP_STATE.theme, { persistEnv: false, persistLocal: true, silent: true });
        setLang(APP_STATE.lang);
        ensureSidebar();
        ensureBranding();
        ensureFavicon();
        applyI18n(document);
        updateDocumentTitle();
        loadThemeColor();
        loadThemeMode();
        loadDarkVariant();
    } catch (e) {
        console.error("Critical appInit error:", e);
    } finally {
        setTimeout(function () {
            document.body.classList.add("ready")
        }, 0);
    }

    try {
        getversion();
        // Fetch system info and storage/partition info for display
        getSysInfo();
        getStorageInfoForSysinfo();
        // getCurrentMtdLayout();
        (pageName === "index" || pageName === "upgrade" || pageName === "initramfs") && getmtdlayoutlist();
        pageName === "backup" && typeof backupInit === "function" && backupInit();
        pageName === "flash" && typeof flashInit === "function" && flashInit();
        pageName === "console" && typeof consoleInit === "function" && consoleInit();
        pageName === "env" && typeof envInit === "function" && envInit()
        pageName === "settings" && typeof settingsInit === "function" && settingsInit();
    } catch (e) {
        console.error("Non-critical appInit error:", e);
    }

    const Yuzhii_VERSION = 'UBOOT-MTK-20250711';
    const Yuzhii_LINK = 'https://github.com/Yuzhii0718/';
    console.log('\n%c Yuzhii0718 ' + Yuzhii_VERSION + ' %c ' + Yuzhii_LINK + ' ', 'color: #fadfa3; background: #030307; padding:5px 0;', 'background: #fadfa3; padding:5px 0;');
}

function updateGptNavVisibility() {
    // Hide GPT update entry when no MMC is present (runtime detection).
    // If backupinfo is unavailable, keep it hidden (fail-closed behavior).
    const gptNavLink = document.querySelector("#sidebar [data-nav-id='gpt']");
    if (!gptNavLink) return;
    const mmcPresent = APP_STATE.backupinfo?.mmc?.present;
    if (mmcPresent === undefined) {
        gptNavLink.style.display = "none";
        return;
    }
    gptNavLink.style.display = mmcPresent === false ? "none" : "";
    console.warn("GPT nav visibility updated based on MMC presence:", mmcPresent);
}

function ensureSidebarAccentFallback() {
    const controlsContainer = document.querySelector("#sidebar .sidebar-controls");
    if (!controlsContainer || controlsContainer.querySelector(".control-row-color")) return;
    appendAccentControls(controlsContainer);
    applyI18n(controlsContainer);
}

function updateSettingsNavVisibility() {
    const settingsNavLink = document.querySelector("#sidebar [data-nav-id='settings']");
    if (!settingsNavLink) return;

    if (APP_STATE._settings_probe_done) return;
    APP_STATE._settings_probe_done = true;

    fetch("/settings.html?_probe=1", { method: "GET", cache: "no-store" })
        .then((response) => {
            if (response?.ok) {
                settingsNavLink.style.display = "";
                return;
            }
            settingsNavLink.style.display = "none";
            ensureSidebarAccentFallback();
        })
        .catch(() => {
            settingsNavLink.style.display = "none";
            ensureSidebarAccentFallback();
        });
}

function updateSimgNavVisibility() {
    // Hide Single Image entry unless the page is actually served.
    const simgNavLink = document.querySelector("#sidebar [data-nav-id='simg']");
    if (!simgNavLink) return;
    simgNavLink.style.display = "none";

    // Avoid repeated probes.
    if (APP_STATE._simg_probe_done) return;
    APP_STATE._simg_probe_done = true;

    fetch("/simg.html?_probe=1", { method: "GET", cache: "no-store" })
        .then((response) => {
            if (response?.ok) {
                simgNavLink.style.display = "";
            }
        })
        .catch(() => {});
}

function updateUbiNavVisibility() {
    // Hide UBI entry unless the page is actually served.
    const ubiNavLink = document.querySelector("#sidebar [data-nav-id='ubi']");
    if (!ubiNavLink) return;
    ubiNavLink.style.display = "none";

    // Avoid repeated probes.
    if (APP_STATE._ubi_probe_done) return;
    APP_STATE._ubi_probe_done = true;

    fetch("/ubi.html?_probe=1", { method: "GET", cache: "no-store" })
        .then((response) => {
            if (response?.ok) {
                ubiNavLink.style.display = "";
            }
        })
        .catch(() => {});
}

function renderSysInfo() {
    const sysinfoContainer = document.getElementById("sysinfo");
    if (!sysinfoContainer) return;
    const sysinfoData = APP_STATE.sysinfo;
    if (!sysinfoData) {
        sysinfoContainer.textContent = t("sysinfo.loading");
        return;
    }

    const boardInfo = sysinfoData.board || {};
    const ramInfo = sysinfoData.ram || {};

    // Clear sysinfo container
    sysinfoContainer.innerHTML = "";
    sysinfoContainer.classList.remove("sysinfo-expanded");

    // Dynamic CPU detection from board compatible string
    let cpuModel = "MediaTek MT798x";
    const compat = (boardInfo.compatible || "").toLowerCase();
    if (compat.includes("mt7981")) {
        cpuModel = "MediaTek MT7981";
    } else if (compat.includes("mt7986")) {
        cpuModel = "MediaTek MT7986";
    } else if (compat.includes("mt7988")) {
        cpuModel = "MediaTek MT7988";
    }

    // Dynamic RAM calculation
    const ramSize = (ramInfo.size !== undefined && ramInfo.size !== null && ramInfo.size !== 0)
        ? bytesToHuman(ramInfo.size)
        : t("sysinfo.unknown");

    // Dynamic Flash calculation from backupinfo
    let flashInfo = "SPI Flash";
    if (APP_STATE.backupinfo && APP_STATE.backupinfo.mtd && APP_STATE.backupinfo.mtd.present) {
        const mtdInfo = APP_STATE.backupinfo.mtd;
        const model = mtdInfo.model || "";
        // Find master device size or sum of sizes of master devices
        let sizeBytes = 0;
        if (mtdInfo.parts) {
            mtdInfo.parts.forEach(p => {
                if (p.master) sizeBytes = Math.max(sizeBytes, p.size || 0);
            });
        }
        const sizeStr = sizeBytes > 0 ? " " + bytesToHuman(sizeBytes) : "";
        flashInfo = model + sizeStr;
    } else if (sysinfoData.storage && sysinfoData.storage.mtd_layout && sysinfoData.storage.mtd_layout.current_parts) {
        // Fallback: estimate from layouts or partition list
        flashInfo = "SPI NAND/NOR";
    }

    const macWan  = sysinfoData.mac_wan || sysinfoData.mac || t("sysinfo.unknown");
    const boardModel = boardInfo.model || t("sysinfo.unknown");
    const versionStr = sysinfoData.version || t("sysinfo.unknown");
    const buildDate = sysinfoData.build_date || t("sysinfo.unknown");

    // Create the LeBOOT-style table
    const table = document.createElement("table");
    table.className = "sysinfo-table";

    const rows = [
        { key: "Процессор", val: cpuModel },
        { key: "ОЗУ", val: ramSize },
        { key: "Флеш-память", val: flashInfo },
        { key: "MAC WAN", val: macWan },
        { key: "Модель", val: boardModel },
        { key: "Версия", val: versionStr },
        { key: "Дата сборки", val: buildDate }
    ];

    rows.forEach(r => {
        const tr = document.createElement("tr");
        
        const tdKey = document.createElement("td");
        tdKey.className = "key";
        tdKey.textContent = r.key;
        tr.appendChild(tdKey);

        const tdVal = document.createElement("td");
        tdVal.className = "val";
        tdVal.textContent = r.val;
        tr.appendChild(tdVal);

        table.appendChild(tr);
    });

    sysinfoContainer.appendChild(table);
}

function getSysInfo() {
    // Always fetch sysinfo into APP_STATE (used by features like backup filename),
    // but only render when the sysinfo element exists on current page.
    const sysinfoElement = document.getElementById("sysinfo");
    if (sysinfoElement) renderSysInfo();
    ajax({
        url: "/sysinfo",
        done: (responseText) => {
            try {
                APP_STATE.sysinfo = JSON.parse(responseText);
            } catch {
                return;
            }
            if (sysinfoElement) renderSysInfo();
        },
    });
}

async function ensureSysInfoLoaded() {
    // On pages without #sysinfo (e.g. backup.html), we still need board model.
    if (APP_STATE.sysinfo?.board?.model) return APP_STATE.sysinfo;
    if (APP_STATE._sysinfo_promise) return APP_STATE._sysinfo_promise;

    APP_STATE._sysinfo_promise = (async () => {
        try {
            const response = await fetch("/sysinfo", { method: "GET" });
            if (!response?.ok) return null;
            const payload = await response.json();
            if (payload) APP_STATE.sysinfo = payload;
            return payload;
        } catch {
            return null;
        } finally {
            // allow retry later
            APP_STATE._sysinfo_promise = null;
        }
    })();

    return APP_STATE._sysinfo_promise;
}

function getStorageInfoForSysinfo() {
    // Pull /backup/info to render current partition table in the sysinfo box
    if (APP_STATE.backupinfo) {
        updateGptNavVisibility();
        return;
    }
    ajax({
        url: "/backup/info",
        done: (responseText) => {
            try {
                APP_STATE.backupinfo = JSON.parse(responseText);
            } catch {
                return;
            }
            updateGptNavVisibility();
            renderSysInfo();
        },
    });
}

function getCurrentMtdLayout() {
    // Get current mtd layout label if multi-layout is enabled
    ajax({
        url: "/getmtdlayout",
        done: (resp) => {
            if (!resp || resp === "error") return;
            const [first] = resp.split(";");
            if (first) {
                APP_STATE.mtd_layout_current = first;
                renderSysInfo();
            }
        },
    });
}

function startup() {
    appInit("index")
}

function getmtdlayoutlist() {
    ajax({
        url: "/getmtdlayout",
        done: (responseText) => {
            if (responseText === "error") return;
            const layoutNames = responseText.split(";");

            const currentLayoutEl = document.getElementById("current_mtd_layout");
            if (currentLayoutEl) {
                const cur = layoutNames[0];
                currentLayoutEl.innerHTML = cur ? t("label.current_mtd") + cur : "";
            }

            const chooseLayoutEl = document.getElementById("choose_mtd_layout");
            if (chooseLayoutEl) chooseLayoutEl.textContent = t("label.choose_mtd");

            const layoutSelect = document.getElementById("mtd_layout_label");
            if (!layoutSelect) return;

            layoutSelect.options.length = 0;
            let hasOptions = false;
            for (let i = 1; i < layoutNames.length; i++) {
                const name = layoutNames[i];
                if (name?.length > 0) {
                    layoutSelect.options.add(new Option(name, name));
                    hasOptions = true;
                }
            }

            const layoutContainer = document.getElementById("mtd_layout");
            if (layoutContainer) layoutContainer.style.display = hasOptions ? "" : "none";
        },
    });
}

function getversion() {
    ajax({
        url: "/version",
        done: (versionText) => {
            const versionElement = document.getElementById("version");
            if (versionElement) versionElement.innerHTML = versionText;
            ensureBranding();
        },
    });
}

function upload(formFieldName) {
    const selectedFile = document.getElementById("file").files[0];
    if (!selectedFile) return;

    const selectedFileName = selectedFile.name || "";

    const formElement = document.getElementById("form");
    if (formElement) formElement.style.display = "none";

    const hintElement = document.getElementById("hint");
    if (hintElement) hintElement.style.display = "none";

    const progressBarElement = document.getElementById("bar");
    if (progressBarElement) progressBarElement.style.display = "block";

    const formData = new FormData();
    formData.append(formFieldName, selectedFile);

    const layoutSelect = document.getElementById("mtd_layout_label");
    if (layoutSelect?.options.length > 0) {
        formData.append("mtd_layout", layoutSelect.options[layoutSelect.selectedIndex].value);
    }

    ajax({
        url: "/upload",
        data: formData,
        done: (responseText) => {
            if (responseText === "fail") {
                location = "/fail.html";
                return;
            }
            const [sizeText, md5Text, mtdText] = responseText.split(" ");

            const filenameElement = document.getElementById("filename");
            if (filenameElement && selectedFileName) {
                filenameElement.style.display = "block";
                filenameElement.innerHTML =
                    `<span class="filename-label">${t("label.file")}</span>` +
                    `<span class="filename-value">${selectedFileName}</span>`;
            }

            const sizeElement = document.getElementById("size");
            if (sizeElement) {
                sizeElement.style.display = "block";
                sizeElement.innerHTML = `${t("label.size")}${sizeText}`;
            }

            const md5Element = document.getElementById("md5");
            if (md5Element) {
                const md5Match = selectedFileName
                    ? /(?:^|[._-])md5-([0-9a-fA-F]{32})(?:$|[._-])/.exec(selectedFileName)
                    : null;
                const md5InName = md5Match?.[1] ?? "";
                const md5Ok = !!(md5Text && md5InName &&
                    md5Text.toLowerCase() === md5InName.toLowerCase());
                const md5Hint  = md5InName ? (md5Ok ? t("md5.match") : t("md5.mismatch")) : "";
                const md5Class = md5InName ? (md5Ok ? "md5-ok" : "md5-bad") : "";
                md5Element.style.display = "block";
                md5Element.innerHTML = `${t("label.md5")}${md5Text}` + (
                    md5Hint ? ` <span class="md5-status ${md5Class}">${md5Hint}</span>` : ""
                );
            }

            const mtdElement = document.getElementById("mtd");
            if (mtdElement && mtdText) {
                mtdElement.style.display = "block";
                mtdElement.innerHTML = `${t("label.mtd")}${mtdText}`;
            }

            const upgradeElement = document.getElementById("upgrade");
            if (upgradeElement) upgradeElement.style.display = "block";

        },
        progress: (progressEvent) => {
            if (!progressEvent.total) return;
            const percent = Math.floor(progressEvent.loaded / progressEvent.total * 100);
            const progressElement = document.getElementById("bar");
            if (progressElement) {
                progressElement.style.display = "block";
                progressElement.style.setProperty("--percent", percent);
            }
            const uploadHero = document.getElementById("upload_hero");
            if (uploadHero) uploadHero.style.display = "";
            const barText = document.getElementById("bar_text");
            if (barText) {
                barText.style.display = "block";
                barText.textContent = percent + "%";
            }
        },
    });
}

const BYTE_UNITS = [
    { threshold: 1024 ** 3, suffix: " GiB" },
    { threshold: 1024 ** 2, suffix: " MiB" },
    { threshold: 1024,      suffix: " KiB" },
];

function bytesToHuman(bytes) {
    if (bytes == null) return "";
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return "";
    for (const { threshold, suffix } of BYTE_UNITS) {
        if (n >= threshold) return (n / threshold).toFixed(2) + suffix;
    }
    return `${Math.floor(n)} B`;
}

function parseFilenameFromDisposition(dispositionHeader) {
    if (!dispositionHeader) return "";
    const quoted = /filename\s*=\s*"([^"]+)"/i.exec(dispositionHeader);
    if (quoted?.[1]) return quoted[1];
    const unquoted = /filename\s*=\s*([^;\s]+)/i.exec(dispositionHeader);
    return unquoted?.[1]?.replace(/^"|"$/g, "") ?? "";
}

function sanitizeFilenameComponent(value) {
    return value
        ? String(value).replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48)
        : "";
}

function getNowYYYYMMDD() {
    const now = new Date();
    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day   = String(now.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
}

function makeBackupDownloadName(originalName) {
    const boardModel = APP_STATE.sysinfo?.board?.model ?? "";
    const boardComponent = sanitizeFilenameComponent(boardModel) || "board";
    const dateStamp = getNowYYYYMMDD();
    let downloadName = String(originalName || "backup.bin");

    // Ensure it starts with backup_
    if (!downloadName.startsWith("backup_")) {
        downloadName = "backup_" + downloadName.replace(/^_+/, "");
    }

    // Insert board right after backup_ if not already
    if (!downloadName.startsWith(`backup_${boardComponent}_`)) {
        downloadName = downloadName.replace(/^backup_/, `backup_${boardComponent}_`);
    }

    // Ensure .bin extension
    if (!/\.[A-Za-z0-9]+$/.test(downloadName)) {
        downloadName += ".bin";
    }

    // Append date before extension if not already present
    if (!/_\d{8}\.[A-Za-z0-9]+$/.test(downloadName)) {
        downloadName = downloadName.replace(/(\.[A-Za-z0-9]+)$/, `_${dateStamp}$1`);
    }

    return downloadName;
}

const SIZE_SUFFIX_MULTIPLIERS = {
    "":    1,
    k:     1024,        kb:  1024,        kib: 1024,
    m:     1024 ** 2,   mb:  1024 ** 2,   mib: 1024 ** 2,
    g:     1024 ** 3,   gb:  1024 ** 3,   gib: 1024 ** 3,
};

function parseUserLen(input) {
    if (!input) return null;
    const trimmed = String(input).trim();
    if (!trimmed) return null;
    const match = /^\s*(0x[0-9a-fA-F]+|\d+)\s*([a-zA-Z]*)\s*$/.exec(trimmed);
    if (!match) return null;

    const rawNumber = match[1];
    const suffix    = match[2].toLowerCase();
    const numericValue = rawNumber.toLowerCase().startsWith("0x")
        ? parseInt(rawNumber, 16)
        : parseInt(rawNumber, 10);
    if (!Number.isFinite(numericValue) || numericValue < 0) return null;

    const multiplier = SIZE_SUFFIX_MULTIPLIERS[suffix];
    return multiplier === undefined ? null : Math.floor(numericValue * multiplier);
}
