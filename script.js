"use strict";
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const paths = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    cart: '<path d="M3 3h2l3 12h10l3-9H6M9 20h.01M18 20h.01"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    phone:
      '<path d="m4 3 4 1 1 5-2 2a16 16 0 0 0 6 6l2-2 5 1 1 4c-9 4-22-9-17-17Z"/>',
    chat: '<path d="M21 11.5a8.5 8.5 0 0 1-9 8.5 10 10 0 0 1-4-.8L3 21l1.8-5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 11h8M8 14h5"/>',
    shield:
      '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
    truck:
      '<path d="M2 5h12v12H2zM14 9h4l4 4v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    car: '<path d="m5 7 2-4h10l2 4 2 3v8H3v-8l2-3ZM5 7h14M6 13h2m8 0h2M5 18v3m14-3v3"/>',
    part: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
    motor:
      '<path d="M5 7h13v11H5zM8 4v3m7-3v3M2 10h3m-3 5h3m13-3h4m-4 4h4M8 10v5m4-5v5m3-5v5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    exchange: '<path d="M3 7h17l-4-4m5 14H4l4 4M20 7l-4 4M4 17l4-4"/>',
    tool: '<path d="m14 6 4 4 3-3a6 6 0 0 1-8 8L6 22l-4-4 7-7A6 6 0 0 1 17 3l-3 3Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    box: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5ZM3 7l9 5 9-5M12 12v10M8 4l9 5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  };
  const icon = (name, cls = "") =>
    `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.part}</svg>`;
  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      toast("Browser storage is unavailable. Your changes may not persist.");
    }
  }
  const t = (en, ta) => (language === "ta" ? ta : en);
  let language = read("aamm_language", "en");
  let products = [],
    config = {},
    currentPage = 1;
  const page = document.body.dataset.page;
  const params = new URLSearchParams(location.search);
  const money = (value) =>
    value == null
      ? t("Price on request", "விலை கேட்கவும்")
      : new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 2,
        }).format(value);
  const displayRef = (value) => String(value || "").replace(/^AAMM-/i, "AA-");
  const name = (p) => p.display_name || p.name || "Spare part";
  const cart = () => {
    const value = read("aamm_cart", []);
    return Array.isArray(value)
      ? value.filter((x) => Number.isInteger(+x.id) && +x.qty > 0)
      : [];
  };
  const wishes = () => {
    const value = read("aamm_wishlist", []);
    return Array.isArray(value) ? value : [];
  };
  function toast(message) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      document.body.append(el);
    }
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("visible"), 3000);
  }
  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await response
      .json()
      .catch(() => ({ error: "Unable to read the server response." }));
    if (!response.ok)
      throw new Error(
        data.error || data.message || "The request could not be completed.",
      );
    return data;
  }
  function brand() {
    return `<a class="brand" href="index.html" aria-label="Alagar Automobiles home"><span class="brand-logo"><img src="images/logo.jpeg" alt="Alagar Automobiles symbol"></span><span class="brand-wordmark">Alagar<br>Automobiles</span></a>`;
  }
  function renderHeader() {
    const target = $("#siteHeader");
    if (!target) return;
    target.classList.add("site-header");
    const links = [
      ["products.html", t("Shop parts", "உதிரிபாகங்கள்")],
      ["vehicle-finder.html", t("Find by vehicle", "வாகனம் மூலம் தேடுங்கள்")],
      ["request-part.html", t("Request a part", "பாகம் கோருங்கள்")],
      ["exchange.html", t("Exchange an old part", "பழைய பாகம் மாற்றம்")],
      ["track-order.html", t("Track an enquiry", "விசாரணை நிலை")],
      ["wishlist.html", t("Saved parts", "சேமித்த பாகங்கள்")],
      ["dashboard.html", t("My account", "எனது கணக்கு")],
      ["contact.html", t("Contact us", "தொடர்பு")],
      ["about.html", t("About us", "எங்களைப் பற்றி")],
      ["admin.html", t("Owner sign in", "உரிமையாளர் உள்நுழைவு")],
    ];
    target.innerHTML = `<div class="container simple-header">${brand()}<nav class="primary-nav" aria-label="${t("Main navigation", "முதன்மை வழிசெலுத்தல்")}"><a class="${page === "shop" ? "active" : ""}" href="products.html">${t("Shop", "பொருட்கள்")}</a><a class="${page === "finder" ? "active" : ""}" href="vehicle-finder.html">${t("Vehicle finder", "வாகனத் தேடல்")}</a><a class="${page === "contact" ? "active" : ""}" href="contact.html">${t("Help", "உதவி")}</a></nav><div class="header-actions"><button id="languageToggle" class="language-switch" lang="${language === "en" ? "ta" : "en"}" aria-label="${language === "en" ? "தமிழுக்கு மாற்றவும் — Switch to Tamil" : "Switch to English — ஆங்கிலத்திற்கு மாற்றவும்"}" title="${language === "en" ? "Switch to Tamil" : "Switch to English"}">${language === "en" ? "தமிழ்" : "English"}</button><button id="themeToggle" class="icon-button theme-button" aria-pressed="false"></button><a class="icon-button cart-link" href="cart.html" aria-label="${t("Shopping cart", "பொருட்கூடை")}">${icon("cart")}<span class="cart-counter" id="cartCount">0</span></a><button id="menuToggle" class="icon-button simple-menu-button" aria-label="${t("Open menu", "பட்டியலைத் திறக்கவும்")}" aria-expanded="false" aria-controls="siteNav">${icon("menu")}</button></div></div><nav id="siteNav" class="simple-menu" aria-label="${t("All pages", "அனைத்து பக்கங்கள்")}" hidden><div class="container simple-menu-grid">${links.map(([url, label]) => `<a href="${url}">${label}${icon("chevron")}</a>`).join("")}</div></nav>`;
    $("#menuToggle").onclick = () => {
      const menu = $("#siteNav"),
        open = menu.hidden;
      menu.hidden = !open;
      $("#menuToggle").setAttribute("aria-expanded", String(open));
      $("#menuToggle").setAttribute(
        "aria-label",
        open
          ? t("Close menu", "பட்டியலை மூடு")
          : t("Open menu", "பட்டியலைத் திறக்கவும்"),
      );
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#siteNav").hidden) {
        $("#siteNav").hidden = true;
        $("#menuToggle").setAttribute("aria-expanded", "false");
        $("#menuToggle").focus();
      }
    });
    $("#languageToggle").onclick = () => {
      language = language === "en" ? "ta" : "en";
      write("aamm_language", language);
      location.reload();
    };
    $("#themeToggle").onclick = () => {
      const theme =
        document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem("aamm_theme_v2", theme);
      } catch {}
      updateTheme();
    };
    updateTheme();
    updateCount();
    document.documentElement.lang = language === "ta" ? "ta" : "en";
  }
  function updateTheme() {
    const el = $("#themeToggle");
    if (!el) return;
    const light = document.documentElement.dataset.theme === "light";
    el.innerHTML =
      icon(light ? "moon" : "sun") +
      `<span>${light ? t("Dark mode", "இருள் முறை") : t("Light mode", "ஒளி முறை")}</span>`;
    el.setAttribute(
      "aria-label",
      light ? "Switch to dark mode" : "Switch to light mode",
    );
    el.setAttribute("title", el.getAttribute("aria-label"));
    el.setAttribute("aria-pressed", String(light));
  }
  function updateCount() {
    document
      .querySelectorAll("#cartCount")
      .forEach(
        (el) =>
          (el.textContent = cart().reduce(
            (s, i) => s + Math.min(999, +i.qty || 1),
            0,
          )),
      );
  }
  function renderFooter() {
    const target = $("#siteFooter");
    if (!target) return;
    target.classList.add("site-footer");
    target.innerHTML = `<div class="container simple-footer"><span class="footer-business">© ${new Date().getFullYear()} Alagar Automobiles</span><nav aria-label="${t("Footer", "பக்க முடிவு")}"><a href="contact.html">${t("Contact", "தொடர்பு")}</a><a href="https://maps.app.goo.gl/2G5aei6qZseprHf38" target="_blank" rel="noopener">${t("Visit us", "கடைக்கு வாருங்கள்")}</a><a href="policies.html">${t("Privacy & ordering", "தனியுரிமை மற்றும் ஆர்டர்")}</a><a href="admin.html">${t("Owner sign in", "உரிமையாளர் உள்நுழைவு")}</a></nav></div>`;
  }
  function empty(
    title,
    description,
    link = "products.html",
    label = t("Explore products", "பொருட்களைப் பாருங்கள்"),
  ) {
    return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(description)}</p><a class="button secondary small" href="${link}">${esc(label)} ${icon("arrow")}</a></div>`;
  }
  function placeholder(extra = "") {
    return `<div class="placeholder-mark">${icon("part")}</div><span class="image-label">${t("Photo not added", "படம் சேர்க்கப்படவில்லை")}</span>${extra}`;
  }
  function productCard(p) {
    const saved = wishes().includes(p.id);
    return `<article class="product-card"><div class="product-visual"><a href="product.html?id=${p.id}" aria-label="${esc(name(p))}" style="position:absolute;inset:0;display:grid;place-items:center">${placeholder()}</a><span class="product-label">${esc(p.subcategory || t("Spare part", "உதிரிபாகம்"))}</span><button class="icon-button wish-button ${saved ? "saved" : ""}" data-wish="${p.id}" aria-label="${saved ? "Remove from" : "Add to"} wishlist: ${esc(name(p))}" aria-pressed="${saved}">${icon("heart")}</button></div><div class="product-info"><div class="product-category">${esc(p.category)}</div><h3><a href="product.html?id=${p.id}">${esc(name(p))}</a></h3><div class="product-vehicle">${icon("car")}${esc(p.vehicle || t("Ask about fitment", "பொருத்தம் பற்றி கேளுங்கள்"))}</div><div class="product-bottom"><div class="product-price">${money(p.price)}<small>${p.stock_quantity == null ? t("Availability on enquiry", "விசாரித்து கிடைப்பை அறியவும்") : p.stock_quantity === 0 ? t("Out of stock", "இருப்பில் இல்லை") : t("In stock", "இருப்பில் உள்ளது")}</small></div><button class="add-button" data-add="${p.id}" aria-label="Add ${esc(name(p))} to cart">${icon("plus")}</button></div></div></article>`;
  }
  function addToCart(id, qty = 1) {
    const p = products.find((x) => x.id === +id);
    if (!p) return;
    const value = cart(),
      existing = value.find((x) => +x.id === +id);
    const max = p.stock_quantity == null ? 99 : Math.min(99, p.stock_quantity);
    if (max === 0)
      return toast(
        t(
          "This part is out of stock. Please contact Alagar Automobiles.",
          "இந்த பாகம் இருப்பில் இல்லை. Alagar Automobiles ஐ தொடர்பு கொள்ளவும்.",
        ),
      );
    if (existing) existing.qty = Math.min(max, (+existing.qty || 1) + qty);
    else value.push({ id: p.id, qty: Math.min(qty, max) });
    write("aamm_cart", value);
    updateCount();
    toast(t("Added to your cart", "உங்கள் கூடையில் சேர்க்கப்பட்டது"));
  }
  function toggleWish(id) {
    const value = wishes();
    id = +id;
    const next = value.includes(id)
      ? value.filter((x) => x !== id)
      : [...value, id];
    write("aamm_wishlist", next);
    document.querySelectorAll(`[data-wish="${id}"]`).forEach((el) => {
      el.classList.toggle("saved", next.includes(id));
      el.setAttribute("aria-pressed", String(next.includes(id)));
      el.setAttribute(
        "aria-label",
        `${next.includes(id) ? "Remove from" : "Add to"} wishlist: ${name(products.find((p) => p.id === id) || {})}`,
      );
    });
    if (page === "wishlist") renderWishlist();
    toast(
      next.includes(id)
        ? t("Saved to your wishlist", "விருப்பப் பட்டியலில் சேமிக்கப்பட்டது")
        : t("Removed from wishlist", "விருப்பப் பட்டியலில் இருந்து நீக்கப்பட்டது"),
    );
  }
  function heading(title, intro) {
    return `<h1 class="page-heading">${title}</h1>${intro ? `<p class="page-intro">${intro}</p>` : ""}`;
  }
  function pageShell(content) {
    $("#app").className = "container page-main";
    $("#app").innerHTML = content;
  }
  function options(values, selected = "", first = "All") {
    return (
      `<option value="">${esc(first)}</option>` +
      values
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map(
          (v) =>
            `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(v)}</option>`,
        )
        .join("")
    );
  }
  const unique = (key) => [
    ...new Set(products.map((p) => p[key]).filter(Boolean)),
  ];
  function renderHome() {
    const categories = unique("category");
    const recent = read("aamm_recent", [])
      .map((x) =>
        products.find((p) => p.id === (typeof x === "object" ? x.id : x)),
      )
      .filter(Boolean)
      .slice(0, 3);
    $("#app").className = "";
    $("#app").innerHTML =
      `<section class="simple-hero container"><p class="simple-kicker">${t("Alagar Automobiles", "அழகர் ஆட்டோமொபைல்ஸ்")}</p><h1>${t("Find your part.<br><span>Keep moving.</span>", "உங்கள் பாகத்தைத் தேடுங்கள்.<br><span>பயணத்தைத் தொடருங்கள்.</span>")}</h1><p>${t("Starter motor and alternator parts. Search your vehicle or tell us what you need.", "ஸ்டார்டர் மோட்டார் மற்றும் ஆல்டர்னேட்டர் பாகங்கள். உங்கள் வாகனம் அல்லது பாகத்தைத் தேடுங்கள்.")}</p><form class="home-search" action="products.html" role="search"><label class="sr-only" for="homeSearch">${t("Search spare parts", "உதிரிபாகங்களைத் தேடுங்கள்")}</label>${icon("search")}<input id="homeSearch" name="search" placeholder="${t("Try “Bolero armature”", "“Bolero armature” எனத் தேடுங்கள்")}" autocomplete="off"><button class="button" type="submit">${t("Search", "தேடு")}${icon("arrow")}</button></form><a class="text-link home-browse" href="products.html">${t("Or browse all parts", "அல்லது அனைத்து பாகங்களையும் பாருங்கள்")}${icon("arrow")}</a></section><div class="container simple-home-content"><section id="categories" class="simple-categories" aria-label="${t("Parts categories", "பாக வகைகள்")}">${categories.map((category, i) => `<a href="products.html?category=${encodeURIComponent(category)}" class="simple-category">${icon(i === 0 ? "part" : "motor")}<span><strong>${esc(category)}</strong><small>${products.filter((p) => p.category === category).length} ${t("parts", "பாகங்கள்")}</small></span>${icon("arrow")}</a>`).join("")}</section>${recent.length ? `<section class="section"><div class="section-heading"><h2>${t("Recently viewed", "சமீபத்தில் பார்த்தவை")}</h2></div><div class="product-grid home-product-grid">${recent.map(productCard).join("")}</div></section>` : ""}<section class="simple-assistance"><div><h2>${t("Not sure which part?", "எந்த பாகம் என்று தெரியவில்லையா?")}</h2><p>${t("Our team can help you identify it.", "அதை அடையாளம் காண எங்கள் குழு உதவும்.")}</p></div><a class="button secondary" href="contact.html">${t("Talk to us", "எங்களுடன் பேசுங்கள்")}${icon("arrow")}</a></section><nav class="quiet-links" aria-label="${t("More services", "மேலும் சேவைகள்")}"><a href="request-part.html">${t("Request a part", "பாகம் கோருங்கள்")}${icon("arrow")}</a><a href="exchange.html">${t("Exchange an old part", "பழைய பாகம் மாற்றம்")}${icon("arrow")}</a><a href="track-order.html">${t("Track an enquiry", "விசாரணை நிலை")}${icon("arrow")}</a></nav></div>`;
  }
  function renderShop() {
    pageShell(
      heading(
        t("Shop parts", "உங்கள் அடுத்த பாகத்தைக் கண்டறியுங்கள்."),
        t(
          "Search by name, vehicle or part number.",
          "பெயர், வாகனம் அல்லது பாகத்தின் எண் மூலம் தேடுங்கள்.",
        ),
        "THE Alagar Automobiles CATALOGUE",
      ) +
        `<form id="catalogueSearch" class="search-input-wrap"><span style="color:var(--muted)">${icon("search")}</span><input id="shopSearch" list="searchSuggestions" placeholder="${t("Search by part name, vehicle or part number", "பாகத்தின் பெயர், வாகனம் அல்லது எண் மூலம் தேடுங்கள்")}" aria-label="Search catalogue" value="${esc(params.get("search") || "")}"><button aria-label="Search">${icon("arrow")}</button><datalist id="searchSuggestions">${[
          ...new Set([
            ...read("aamm_search_history", []),
            ...products.map(name),
          ]),
        ]
          .slice(0, 120)
          .map((v) => `<option value="${esc(v)}"></option>`)
          .join(
            "",
          )}</datalist></form><details class="quiet-details filter-drawer"><summary>${t("Filters", "வடிகட்டிகள்")}</summary><aside class="filter-panel" aria-label="Product filters"><h3>${t("Refine your search", "தேடலை வடிகட்டுங்கள்")}</h3><label class="field">${t("Category", "வகை")}<select id="filterCategory">${options(unique("category"), params.get("category"), "All categories")}</select></label><label class="field">${t("Part type", "பாகத்தின் வகை")}<select id="filterSubcategory"></select></label><label class="field">${t("Vehicle reference", "வாகனக் குறிப்பு")}<select id="filterVehicle">${options(unique("vehicle"), params.get("vehicle"), "All vehicles")}</select></label><label class="field">${t("Brand", "பிராண்ட்")}<select id="filterBrand">${options(unique("brand"), params.get("brand"), "All recorded brands")}</select></label><label class="field">${t("Availability", "கிடைக்கும் நிலை")}<select id="filterAvailability"><option value="">${t("Any availability", "அனைத்தும்")}</option><option value="in_stock">${t("In stock", "இருப்பில் உள்ளது")}</option><option value="out_of_stock">${t("Out of stock", "இருப்பில் இல்லை")}</option><option value="unknown">${t("Ask us", "எங்களிடம் கேளுங்கள்")}</option></select></label><label class="field">${t("Minimum price (₹)", "குறைந்தபட்ச விலை (₹)")}<input type="number" min="0" id="filterMinPrice" placeholder="No minimum"></label><label class="field">${t("Maximum price (₹)", "அதிகபட்ச விலை (₹)")}<input type="number" min="0" id="filterMaxPrice" placeholder="No limit"></label><button id="clearFilters" class="button secondary small">${t("Reset filters", "வடிகட்டிகளை மீட்டமை")}</button></aside></details><div class="catalogue-layout"><div><div class="catalogue-toolbar"><span id="resultCount" aria-live="polite"></span><label>${t("Sort:", "வரிசை:")} <select id="sortProducts" aria-label="Sort products"><option value="default">${t("Catalogue order", "பட்டியல் வரிசை")}</option><option value="asc">${t("Price: low to high", "விலை: குறைவிலிருந்து அதிகம்")}</option><option value="desc">${t("Price: high to low", "விலை: அதிகத்திலிருந்து குறைவு")}</option><option value="name">${t("Name: A–Z", "பெயர்: A–Z")}</option></select></label></div><div class="product-grid" id="shopGrid"></div><div id="pagination" class="pagination"></div></div></div>`,
    );
    const sub = $("#filterSubcategory");
    function refreshSub(selected = "") {
      const cat = $("#filterCategory").value;
      sub.innerHTML = options(
        [
          ...new Set(
            products
              .filter((p) => !cat || p.category === cat)
              .map((p) => p.subcategory),
          ),
        ],
        selected,
        "All part types",
      );
    }
    refreshSub(params.get("subcategory") || "");
    const refresh = () => {
      clearTimeout(renderShop.searchTimer);
      currentPage = 1;
      renderShopResults();
    };
    $("#catalogueSearch").onsubmit = (e) => {
      e.preventDefault();
      const q = $("#shopSearch").value.trim();
      if (q) {
        const h = read("aamm_search_history", []);
        write(
          "aamm_search_history",
          [q, ...h.filter((x) => x !== q)].slice(0, 8),
        );
      }
      refresh();
    };
    $("#shopSearch").oninput = () => {
      clearTimeout(renderShop.searchTimer);
      renderShop.searchTimer = setTimeout(refresh, 180);
    };
    $("#filterCategory").onchange = () => {
      refreshSub();
      refresh();
    };
    [
      sub,
      $("#filterVehicle"),
      $("#sortProducts"),
      $("#filterMaxPrice"),
      $("#filterMinPrice"),
      $("#filterBrand"),
      $("#filterAvailability"),
    ].forEach((el) => el.addEventListener("change", refresh));
    $("#clearFilters").onclick = (e) => {
      e.preventDefault();
      $("#filterCategory").value = "";
      $("#filterVehicle").value = "";
      $("#filterMaxPrice").value = "";
      $("#filterMinPrice").value = "";
      $("#filterBrand").value = "";
      $("#filterAvailability").value = "";
      $("#shopSearch").value = "";
      refreshSub();
      refresh();
    };
    renderShopResults();
  }
  let searchSequence = 0;
  async function renderShopResults() {
    const sequence = ++searchSequence;
    const q = $("#shopSearch").value.trim().toLowerCase();
    const cat = $("#filterCategory").value,
      sub = $("#filterSubcategory").value,
      vehicle = $("#filterVehicle").value,
      max = $("#filterMaxPrice").value;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({
      search: q,
      category: cat,
      subcategory: sub,
      vehicle,
      max_price: max,
      min_price: $("#filterMinPrice").value,
      brand: $("#filterBrand").value,
      availability: $("#filterAvailability").value,
    })) {
      if (value) query.set(key, value);
    }
    let found;
    try {
      found = await api("/products?" + query);
    } catch (error) {
      if (sequence === searchSequence)
        $("#shopGrid").innerHTML = empty(
          "Search unavailable",
          error.message,
          "request-part.html",
          "Request a part",
        );
      return;
    }
    if (sequence !== searchSequence) return;
    const sort = $("#sortProducts").value;
    if (sort === "asc" || sort === "desc")
      found.sort((a, b) =>
        a.price == null
          ? 1
          : b.price == null
            ? -1
            : sort === "asc"
              ? a.price - b.price
              : b.price - a.price,
      );
    if (sort === "name") found.sort((a, b) => name(a).localeCompare(name(b)));
    const totalPages = Math.max(1, Math.ceil(found.length / 12));
    currentPage = Math.min(currentPage, totalPages);
    $("#resultCount").textContent =
      `${found.length} ${t("parts found", "பாகங்கள் கிடைத்தன")}${q ? ` ${t("for", "தேடல்")} “${q}”` : ""}`;
    $("#shopGrid").innerHTML = found.length
      ? found
          .slice((currentPage - 1) * 12, currentPage * 12)
          .map(productCard)
          .join("")
      : empty(
          t("No matching parts yet.", "பொருந்தும் பாகங்கள் இல்லை."),
          t(
            "Try fewer filters or send us a spare-part request.",
            "வடிகட்டிகளைக் குறைக்கவும் அல்லது உதிரிபாகக் கோரிக்கையை அனுப்பவும்.",
          ),
          "request-part.html",
          t("Request a part", "பாகம் கோருங்கள்"),
        );
    $("#pagination").innerHTML =
      found.length > 12
        ? `<button class="button secondary small" id="prevPage" ${currentPage === 1 ? "disabled" : ""}>${t("Previous", "முந்தைய")}</button><span>${currentPage} / ${totalPages}</span><button class="button secondary small" id="nextPage" ${currentPage === totalPages ? "disabled" : ""}>${t("Next", "அடுத்த")}</button>`
        : "";
    if ($("#prevPage")) {
      $("#prevPage").onclick = () => {
        currentPage--;
        renderShopResults();
        $("#shopGrid").scrollIntoView({ block: "start" });
      };
      $("#nextPage").onclick = () => {
        currentPage++;
        renderShopResults();
        $("#shopGrid").scrollIntoView({ block: "start" });
      };
    }
  }
  function renderProduct() {
    let id = +params.get("id");
    if (!id) {
      try {
        id = JSON.parse(sessionStorage.getItem("aamm_product"))?.id;
      } catch {}
    }
    const p = products.find((p) => p.id === id);
    if (!p)
      return pageShell(
        empty(
          t("Part not found", "பாகம் கிடைக்கவில்லை"),
          t("Try the current catalogue.", "தற்போதைய பட்டியலில் தேடுங்கள்."),
        ),
      );
    write(
      "aamm_recent",
      [
        p.id,
        ...read("aamm_recent", [])
          .map((x) => (typeof x === "object" ? x.id : x))
          .filter((x) => x !== p.id),
      ].slice(0, 10),
    );
    document.title = `${name(p)} | Alagar Automobiles`;
    const priced = p.price != null,
      out = p.stock_quantity === 0;
    pageShell(
      `<a class="text-link back-to-shop" href="products.html">← ${t("All parts", "அனைத்து பாகங்கள்")}</a><div class="detail-layout quiet-product"><div class="detail-visual">${placeholder()}</div><section class="detail-summary"><div class="product-category">${esc(p.category)}</div><h1 class="page-heading">${esc(name(p))}</h1><p class="detail-vehicle">${icon("car")} ${esc(p.vehicle || t("Vehicle not listed", "வாகனம் குறிப்பிடப்படவில்லை"))} <span>${t("Confirm fitment with us", "பொருத்தத்தை உறுதி செய்யுங்கள்")}</span></p><div class="detail-price">${money(p.price)}</div><p class="availability-line">${p.stock_quantity == null ? t("Ask us about availability", "கிடைக்கும் நிலையை விசாரிக்கவும்") : out ? t("Currently out of stock", "தற்போது இருப்பில் இல்லை") : `${p.stock_quantity} ${t("in stock", "இருப்பில் உள்ளன")}`}</p><div class="button-row product-primary-actions">${priced ? `<div class="quantity"><button id="detailMinus" aria-label="${t("Decrease quantity", "எண்ணிக்கையைக் குறைக்கவும்")}" ${out ? "disabled" : ""}>−</button><span id="detailQuantity">1</span><button id="detailPlus" aria-label="${t("Increase quantity", "எண்ணிக்கையை அதிகரிக்கவும்")}" ${out ? "disabled" : ""}>+</button></div><button id="detailAdd" class="button" ${out ? "disabled" : ""}>${icon("cart")}${t("Add to cart", "கூடையில் சேர்")}</button>` : `<a class="button" href="request-part.html?part=${encodeURIComponent(name(p))}&vehicle=${encodeURIComponent(p.vehicle || "")}">${t("Request a price", "விலை கேளுங்கள்")}${icon("arrow")}</a>`}<button class="icon-button wish-button-static ${wishes().includes(p.id) ? "saved" : ""}" data-wish="${p.id}" aria-label="${t("Save part", "பாகத்தைச் சேமி")}" aria-pressed="${wishes().includes(p.id)}">${icon("heart")}</button></div><a class="text-link part-question" href="https://wa.me/919344898473?text=${encodeURIComponent(`Hello Alagar Automobiles, please help me with ${name(p)} (catalogue ${p.id}). Please confirm fitment and availability.`)}" target="_blank" rel="noopener">${t("Ask about this part", "இந்த பாகம் பற்றி கேளுங்கள்")}${icon("arrow")}</a><details class="quiet-details product-specs"><summary>${t("Part details", "பாகத்தின் விவரங்கள்")}</summary><dl class="spec-list"><dt>${t("Type", "வகை")}</dt><dd>${esc(p.subcategory || "—")}</dd><dt>${t("Part number", "பாகத்தின் எண்")}</dt><dd>${esc(p.sku || t("Ask our team", "எங்கள் குழுவிடம் கேளுங்கள்"))}</dd><dt>${t("Brand", "பிராண்ட்")}</dt><dd>${esc(p.brand || t("Confirm with us", "எங்களுடன் உறுதி செய்யுங்கள்"))}</dd></dl><p class="muted">${esc(p.description || "")}</p><p class="compatibility-note">${p.compatibility_verified ? t("The catalogue vehicle reference has been reviewed. Confirm your exact variant and year before ordering.", "பட்டியலின் வாகனக் குறிப்பு மதிப்பாய்வு செய்யப்பட்டது. ஆர்டர் முன் உங்கள் வகை மற்றும் ஆண்டை உறுதி செய்யுங்கள்.") : t("Compatibility not verified. Contact Alagar Automobiles before ordering.", "பொருத்தம் உறுதிப்படுத்தப்படவில்லை. ஆர்டர் முன் அழகர் ஆட்டோமொபைல்ஸைத் தொடர்பு கொள்ளுங்கள்.")}</p></details></section></div><section class="part-guide-section" aria-label="${t("Part location guide", "பாகத்தின் இருப்பிட வழிகாட்டி")}"><div id="partLocation"></div></section><section class="section related-parts"><div class="section-heading"><h2>${t("Related parts", "தொடர்புடைய பாகங்கள்")}</h2></div><div class="product-grid home-product-grid">${products
        .filter((x) => x.category === p.category && x.id !== p.id)
        .slice(0, 3)
        .map(productCard)
        .join("")}</div></section>`,
    );
    if (window.PartLocation)
      window.PartLocation.mount($("#partLocation"), p, { language });
    if (priced) {
      let qty = 1;
      $("#detailMinus").onclick = () => {
        $("#detailQuantity").textContent = qty = Math.max(1, qty - 1);
      };
      $("#detailPlus").onclick = () => {
        $("#detailQuantity").textContent = qty = Math.min(
          p.stock_quantity ?? 99,
          qty + 1,
        );
      };
      $("#detailAdd").onclick = () => addToCart(p.id, qty);
    }
  }
  function renderWishlist() {
    const saved = products.filter((p) => wishes().includes(p.id));
    pageShell(
      heading(
        t("Saved parts", "உங்கள் விருப்பப் பட்டியல்."),
        t(
          "Keep the parts you’re considering in one place. Saved in this browser.",
          "நீங்கள் விரும்பும் பாகங்களை ஒரே இடத்தில் வைத்திருங்கள். இந்த உலாவியில் சேமிக்கப்படும்.",
        ),
      ) +
        (saved.length
          ? `<div class="product-grid">${saved.map(productCard).join("")}</div>`
          : empty(
              t(
                "A little room for your next find.",
                "உங்கள் அடுத்த தேடலுக்கான இடம்.",
              ),
              t(
                "Tap the heart on a part to save it here.",
                "பாகத்தின் இதயக் குறியை அழுத்தி இங்கே சேமிக்கவும்.",
              ),
            )),
    );
  }
  function renderCart() {
    const items = cart()
      .map((i) => ({
        p: products.find((p) => p.id === +i.id),
        qty: Math.min(99, +i.qty || 1),
      }))
      .filter((i) => i.p);
    pageShell(
      heading(
        t("Your cart", "உங்கள் பாகங்கள், ஒன்றாக."),
        t(
          "Review your parts and send an enquiry.",
          "உங்கள் தேர்வைச் சரிபாருங்கள். கிடைக்கும் நிலை, டெலிவரி மற்றும் இறுதி தொகையை Alagar Automobiles உறுதி செய்யும்.",
        ),
      ) +
        (!items.length
          ? empty(
              t(
                "Your cart is ready for a fresh start.",
                "உங்கள் கூடை புதிய தொடக்கத்திற்கு தயார்.",
              ),
              t(
                "Explore the catalogue and add the parts you need.",
                "பட்டியலைப் பார்த்து உங்களுக்குத் தேவையான பாகங்களைச் சேர்க்கவும்.",
              ),
            )
          : `<div class="cart-layout"><div>${items.map(({ p, qty }) => `<article class="cart-item"><div class="cart-thumb">${icon("part")}</div><div><h3><a href="product.html?id=${p.id}">${esc(name(p))}</a></h3><p>${esc(p.subcategory)} · ${esc(p.vehicle)}</p><div class="quantity"><button data-qty="${p.id}" data-delta="-1" aria-label="Decrease ${esc(name(p))} quantity">−</button><span>${qty}</span><button data-qty="${p.id}" data-delta="1" aria-label="Increase ${esc(name(p))} quantity">+</button></div></div><div class="cart-item-price">${money(p.price == null ? null : p.price * qty)}<button data-remove="${p.id}">${t("Remove", "நீக்கு")}</button></div></article>`).join("")}<a class="text-link" style="margin-top:22px" href="products.html">${icon("arrow")}${t("Continue exploring", "தொடர்ந்து பாருங்கள்")}</a></div><aside class="panel"><h2>${t("Enquiry summary", "விசாரணைச் சுருக்கம்")}</h2><div class="summary-row"><span>${t("Parts subtotal", "பாகங்களின் துணைத்தொகை")}</span><span>${money(items.reduce((s, i) => s + (i.p.price || 0) * i.qty, 0))}</span></div><div class="summary-row"><span>${t("Delivery", "டெலிவரி")}</span><span>${t("To be confirmed", "உறுதி செய்யப்படும்")}</span></div><div class="summary-row total"><span>${t("Estimated total", "மதிப்பிடப்பட்ட தொகை")}</span><span>${money(items.reduce((s, i) => s + (i.p.price || 0) * i.qty, 0))}</span></div><small>${items.some((i) => i.p.price == null) ? t("Some parts need a quotation. The estimate excludes those parts.", "சில பாகங்களுக்கு விலைப்புள்ளி தேவை. மதிப்பீட்டில் அவை சேர்க்கப்படவில்லை.") : t("Excludes unconfirmed delivery charges.", "உறுதி செய்யப்படாத டெலிவரி கட்டணங்கள் சேர்க்கப்படவில்லை.")}</small><form id="checkoutForm"><label class="field">${t("Your name", "உங்கள் பெயர்")}<input name="name" required maxlength="120" autocomplete="name"></label><label class="field">${t("Mobile number", "கைபேசி எண்")}<input name="phone" type="tel" required pattern="[6-9][0-9]{9}" maxlength="10" placeholder="10-digit Indian mobile" autocomplete="tel-national"></label><label class="field">${t("Delivery address", "டெலிவரி முகவரி")}<textarea name="address" required maxlength="1000" autocomplete="street-address"></textarea></label><label class="field">${t("Delivery preference", "டெலிவரி விருப்பம்")}<select name="delivery" required><option value="pickup">Pick up at the store</option><option value="bus">Bus delivery enquiry</option><option value="lorry">Lorry service enquiry</option></select></label><button class="button full" type="submit">${icon("chat")}${t("Prepare WhatsApp enquiry", "வாட்ஸ்அப் விசாரணையைத் தயார் செய்")}</button><p class="error" id="checkoutError" role="alert"></p></form><div class="notice">${config.features?.payments ? t("Submitting creates an enquiry. No payment is taken here. After Alagar Automobiles confirms a pickup order and inventory, sign in to pay securely.", "இங்கு விசாரணை மட்டுமே உருவாகும். Alagar Automobiles ஆர்டரை உறுதி செய்த பிறகு உள்நுழைந்து கட்டணம் செலுத்தலாம்.") : t("Submitting creates an enquiry, not a confirmed order. No payment is taken. Online payment is not configured.", "சமர்ப்பித்தல் ஒரு விசாரணையை உருவாக்கும்; உறுதி செய்யப்பட்ட ஆர்டர் அல்ல. பணம் பெறப்படாது. இணையக் கட்டணம் கட்டமைக்கப்படவில்லை.")}</div><div id="checkoutResult"></div></aside></div>`),
    );
    if (!items.length) return;
    document.querySelectorAll("[data-qty]").forEach(
      (el) =>
        (el.onclick = () => {
          const value = cart();
          const item = value.find((i) => +i.id === +el.dataset.qty);
          const p = products.find((p) => p.id === +el.dataset.qty);
          item.qty = Math.max(
            1,
            Math.min(
              p.stock_quantity ?? 99,
              (+item.qty || 1) + +el.dataset.delta,
            ),
          );
          write("aamm_cart", value);
          renderCart();
          updateCount();
        }),
    );
    document.querySelectorAll("[data-remove]").forEach(
      (el) =>
        (el.onclick = () => {
          write(
            "aamm_cart",
            cart().filter((i) => +i.id !== +el.dataset.remove),
          );
          renderCart();
          updateCount();
        }),
    );
    $("#checkoutForm").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        button = form.querySelector("button[type=submit]");
      button.disabled = true;
      $("#checkoutError").textContent = "";
      const details = Object.fromEntries(new FormData(form));
      const signature = JSON.stringify({
        ...details,
        items: items.map((i) => ({ id: i.p.id, qty: i.qty })),
      });
      let pending = read("aamm_pending_enquiry", null);
      if (!pending || pending.signature !== signature)
        pending = { signature, key: crypto.randomUUID() };
      write("aamm_pending_enquiry", pending);
      try {
        const result = await api("/orders", {
          method: "POST",
          body: JSON.stringify({
            ...details,
            items: items.map((i) => ({ id: i.p.id, qty: i.qty })),
            idempotency_key: pending.key,
          }),
        });
        const stored = read("aamm_order_refs", []);
        write(
          "aamm_order_refs",
          [
            ...stored.filter((x) => x.reference !== result.reference),
            {
              reference: result.reference,
              id: result.id,
              tracking_token:
                result.tracking_token ||
                stored.find((x) => x.reference === result.reference)
                  ?.tracking_token,
              phone: details.phone,
            },
          ].slice(-20),
        );
        $("#checkoutResult").innerHTML =
          `<div class="success-box"><h3>${t("Your enquiry is prepared.", "உங்கள் விசாரணை தயாராக உள்ளது.")}</h3><p>${t("Reference", "குறிப்பு")}: <strong>${esc(displayRef(result.reference || result.id))}</strong><br>${t("Continue to WhatsApp to send it to Alagar Automobiles. This is not a confirmed order.", "Alagar Automobiles க்கு அனுப்ப வாட்ஸ்அப்பில் தொடருங்கள். இது உறுதி செய்யப்பட்ட ஆர்டர் அல்ல.")}</p><p><a class="text-link" href="track-order.html">${t("Track this enquiry from this browser", "இந்த உலாவியில் விசாரணையைக் கண்காணிக்கவும்")}${icon("arrow")}</a></p><a class="button full" href="${esc(result.whatsapp_url)}" target="_blank" rel="noopener">${t("Send on WhatsApp", "வாட்ஸ்அப்பில் அனுப்பு")}${icon("arrow")}</a></div>`;
        toast(
          t(
            "Enquiry prepared — open WhatsApp to send",
            "விசாரணை தயார் — அனுப்ப வாட்ஸ்அப்பைத் திறக்கவும்",
          ),
        );
      } catch (error) {
        $("#checkoutError").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  }
  function renderFinder() {
    pageShell(
      heading(
        t("Find by vehicle", "உங்கள் வாகனத்துடன் தொடங்குங்கள்."),
        t(
          "Narrow down the catalogue using its existing vehicle references. Our team will help confirm exact fitment.",
          "பட்டியலின் வாகனக் குறிப்புகளைப் பயன்படுத்தி தேடலைக் குறைக்கவும். சரியான பொருத்தத்தை எங்கள் குழு உறுதி செய்ய உதவும்.",
        ),
        "THE VEHICLE FINDER",
      ) +
        `<div class="two-column"><section class="panel"><h2>${t("Tell us what you drive", "உங்கள் வாகனத்தைச் சொல்லுங்கள்")}</h2><form id="finderForm"><label class="field">${t("Vehicle reference", "வாகனக் குறிப்பு")}<select name="vehicle" id="finderVehicle" required>${options(unique("vehicle"), read("aamm_saved_vehicle", ""), "Select a vehicle")}</select></label><label class="field">${t("Parts category", "பாகங்கள் வகை")}<select name="category">${options(unique("category"), "", "All categories")}</select></label><label class="field">${t("Model year (optional, for your enquiry)", "தயாரிப்பு ஆண்டு (விருப்பம்)")}<input name="year" type="number" min="1950" max="${new Date().getFullYear() + 1}" placeholder="e.g. 2018"></label><div class="button-row"><button class="button">${t("Find catalogue parts", "பட்டியலில் பாகங்களைத் தேடு")}${icon("arrow")}</button><button class="button secondary" type="button" id="saveVehicle">${t("Save vehicle", "வாகனத்தைச் சேமி")}</button></div></form></section><aside><div class="notice">${t("Compatibility not verified – Contact Alagar Automobiles. Manufacturer, variant and year fitment records are not yet available in the original catalogue. We won’t infer compatibility from a vehicle name.", "பொருத்தம் உறுதிப்படுத்தப்படவில்லை – Alagar Automobiles ஐ தொடர்பு கொள்ளவும். உற்பத்தியாளர், வகை மற்றும் ஆண்டு பொருத்தத் தகவல்கள் பட்டியலில் இன்னும் இல்லை.")}</div><p class="muted" style="font-size:12px">${t("Need help identifying your part? Have the vehicle model, year and any part numbers ready when you speak to our team.", "உதிரிபாகத்தை அடையாளம் காண உதவி வேண்டுமா? வாகன மாதிரி, ஆண்டு மற்றும் பாகத்தின் எண்ணை எங்கள் குழுவுடன் பகிருங்கள்.")}</p><a class="text-link" href="request-part.html">${t("Ask the Alagar Automobiles team", "Alagar Automobiles குழுவிடம் கேளுங்கள்")}${icon("arrow")}</a></aside></div>`,
    );
    $("#finderForm").onsubmit = (e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget),
        query = new URLSearchParams();
      query.set("vehicle", data.get("vehicle"));
      if (data.get("category")) query.set("category", data.get("category"));
      if (data.get("year")) write("aamm_vehicle_year", data.get("year"));
      location.href = "products.html?" + query;
    };
    $("#saveVehicle").onclick = () => {
      const value = $("#finderVehicle").value;
      if (!value)
        return toast(
          t("Choose your vehicle first", "முதலில் வாகனத்தைத் தேர்ந்தெடுக்கவும்"),
        );
      write("aamm_saved_vehicle", value);
      toast(
        t("Vehicle saved in this browser", "இந்த உலாவியில் வாகனம் சேமிக்கப்பட்டது"),
      );
    };
  }
  function renderEnquiry(exchange = false, contact = false) {
    const title = contact
      ? t("Let’s talk parts.", "பாகங்கள் பற்றி பேசலாம்.")
      : exchange
        ? t("An old part. A new possibility.", "பழைய பாகம். புதிய வாய்ப்பு.")
        : t("Let’s find your part.", "உங்கள் பாகத்தைக் கண்டறியலாம்.");
    const intro = exchange
      ? t(
          "Tell us about the component you’d like to exchange. Our team will review it and discuss the next step.",
          "நீங்கள் மாற்ற விரும்பும் பாகம் பற்றி சொல்லுங்கள். எங்கள் குழு மதிப்பாய்வு செய்து அடுத்த படியைத் தெரிவிக்கும்.",
        )
      : t(
          "Tell us what you need. Share a vehicle model or part number to help our team understand your enquiry.",
          "உங்களுக்குத் தேவையானதைச் சொல்லுங்கள். வாகன மாதிரி அல்லது பாகத்தின் எண்ணைப் பகிருங்கள்.",
        );
    pageShell(
      heading(
        title,
        intro,
        contact
          ? "CONTACT Alagar Automobiles"
          : exchange
            ? "OLD PARTS EXCHANGE"
            : "SPARE-PART REQUEST",
      ) +
        `<div class="two-column"><section class="panel" id="enquiryPanel"><h2>${exchange ? t("Your exchange enquiry", "உங்கள் மாற்று விசாரணை") : t("Your enquiry", "உங்கள் விசாரணை")}</h2><form id="enquiryForm"><div class="form-grid"><label class="field">${t("Your name", "உங்கள் பெயர்")} *<input name="name" required maxlength="120" autocomplete="name"></label><label class="field">${t("Mobile number", "கைபேசி எண்")} *<input name="phone" required type="tel" pattern="[6-9][0-9]{9}" maxlength="10" placeholder="10-digit Indian mobile" autocomplete="tel-national"></label><label class="field span-2">${t("Part name or part number", "பாகத்தின் பெயர் அல்லது எண்")} *<input name="part_name" required maxlength="200" value="${esc(params.get("part") || "")}" placeholder="e.g. Bolero starter motor"></label><label class="field span-2">${t("Vehicle details", "வாகன விவரங்கள்")}<input name="vehicle" maxlength="200" value="${esc(params.get("vehicle") || read("aamm_saved_vehicle", ""))}" placeholder="Model, variant and manufacturing year"></label>${exchange ? `<label class="field span-2">${t("Part condition", "பாகத்தின் நிலை")}<select name="condition"><option>Used — working</option><option>Used — not working</option><option>Damaged</option><option>Needs inspection</option></select></label>` : ""}<label class="field span-2">${t("Anything else we should know?", "நாங்கள் அறிய வேண்டிய வேறு விவரங்கள்?")}<textarea name="message" maxlength="2000" placeholder="${exchange ? "Describe the component, condition and what you need." : "Add a part number, quantity or any other details."}"></textarea></label></div>${exchange ? `<div class="notice">${t("Valuation and exchange approval follow an inspection by Alagar Automobiles. No exchange value is promised. Photos can be shared directly with our team on WhatsApp.", "Alagar Automobiles ஆய்வுக்குப் பிறகே மதிப்பீடு மற்றும் மாற்று அனுமதி வழங்கப்படும். மாற்று மதிப்பு உறுதி செய்யப்படவில்லை. படங்களை வாட்ஸ்அப்பில் பகிரலாம்.")}</div>` : ""}<button class="button" type="submit">${t("Submit enquiry", "விசாரணையைச் சமர்ப்பி")}${icon("arrow")}</button><p class="error" id="enquiryError" role="alert"></p><p class="muted" style="font-size:10px;margin:13px 0 0">${t("We’ll use these details to respond to your request.", "உங்கள் கோரிக்கைக்குப் பதிலளிக்க இந்த விவரங்களைப் பயன்படுத்துவோம்.")} <a href="policies.html#privacy">${t("Privacy information", "தனியுரிமைத் தகவல்")}</a></p></form></section><aside><div class="eyebrow">${t("A real conversation helps", "நேரடிப் பேச்சு உதவும்")}</div><h2 style="font-size:24px;font-weight:500;margin-top:14px">${t("We’re here to help.", "நாங்கள் உதவத் தயார்.")}</h2><div class="contact-detail">${icon("phone")}<div><small>${t("Call Alagar Automobiles", "Alagar Automobiles ஐ அழைக்கவும்")}</small><a href="tel:9600715822">96007 15822</a></div></div><div class="contact-detail">${icon("chat")}<div><small>${t("Message the team", "குழுவுக்கு செய்தி அனுப்புங்கள்")}</small><a href="https://wa.me/919344898473" target="_blank" rel="noopener">${t("Continue on WhatsApp", "வாட்ஸ்அப்பில் தொடருங்கள்")}${icon("arrow")}</a></div></div><div class="map-panel">${icon("pin")}<span style="font-size:13px">ALAGAR AUTOMOBILES</span><a class="button secondary small" href="https://maps.app.goo.gl/2G5aei6qZseprHf38" target="_blank" rel="noopener">${t("Open in Google Maps", "Google Maps இல் திறக்கவும்")}${icon("arrow")}</a></div><div class="notice">${t("Enquiries are reviewed by our team. Submitting a form doesn’t confirm an order, stock availability or a price.", "எங்கள் குழு விசாரணைகளை மதிப்பாய்வு செய்யும். படிவம் சமர்ப்பித்தல் ஆர்டர், இருப்பு அல்லது விலையை உறுதி செய்யாது.")}</div></aside></div>`,
    );
    $("#enquiryForm").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      $("#enquiryError").textContent = "";
      try {
        const result = await api(
          exchange ? "/exchange-requests" : "/enquiries",
          {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(new FormData(form))),
          },
        );
        $("#enquiryPanel").innerHTML =
          `<div class="success-box"><h3>${t("We’ve received your enquiry.", "உங்கள் விசாரணையைப் பெற்றோம்.")}</h3><p>${t("Your reference", "உங்கள் குறிப்பு")}: <strong>${esc(displayRef(result.reference))}</strong><br>${t("Keep this reference for your conversation with Alagar Automobiles.", "Alagar Automobiles உடனான உரையாடலுக்கு இந்தக் குறிப்பை வைத்திருங்கள்.")}</p><span class="badge">${esc(result.status)}</span><p style="margin-top:18px"><a class="text-link" href="https://wa.me/919344898473?text=${encodeURIComponent(`Hello Alagar Automobiles, I submitted enquiry ${result.reference}. Please help with the next step.`)}" target="_blank" rel="noopener">${t("Follow up on WhatsApp", "வாட்ஸ்அப்பில் தொடர்பு கொள்ளுங்கள்")}${icon("arrow")}</a></p></div>`;
      } catch (error) {
        $("#enquiryError").textContent = error.message;
        btn.disabled = false;
      }
    };
  }
  function renderAbout() {
    pageShell(
      heading(
        t(
          "Parts are our business.<br>People are our purpose.",
          "பாகங்கள் எங்கள் வணிகம்.<br>மக்கள் எங்கள் நோக்கம்.",
        ),
        t("Meet Alagar Automobiles.", "Alagar Automobiles — அழகர் ஆட்டோமொபைல்ஸ்."),
        "ABOUT ALAGAR AUTOMOBILES",
      ) +
        `<div class="two-column"><div class="panel"><h2>${t("Keeping the next journey possible.", "அடுத்த பயணத்திற்கு உதவுகிறோம்.")}</h2><p class="muted">${t("Alagar Automobiles is an automotive spare-parts business focused on helping customers find the components they need. Our existing catalogue includes starter motor and alternator parts for a range of vehicle references.", "வாடிக்கையாளர்களுக்குத் தேவையான வாகன உதிரிபாகங்களைக் கண்டறிய உதவும் வணிகம் Alagar Automobiles. எங்கள் பட்டியலில் ஸ்டார்டர் மோட்டார் மற்றும் ஆல்டர்னேட்டர் பாகங்கள் உள்ளன.")}</p><p class="muted">${t("When the details matter, a conversation makes the difference. Speak with our team about part identification, availability, compatibility or an old-part exchange enquiry.", "பாகத்தின் அடையாளம், கிடைக்கும் நிலை, பொருத்தம் அல்லது பழைய பாகங்கள் மாற்றம் பற்றி எங்கள் குழுவுடன் பேசுங்கள்.")}</p><a class="button" href="contact.html">${t("Talk to our team", "எங்கள் குழுவுடன் பேசுங்கள்")}${icon("arrow")}</a></div><div><div class="eyebrow">${t("OUR APPROACH", "எங்கள் அணுகுமுறை")}</div>${[
          [
            "search",
            t("Start with the details", "விவரங்களுடன் தொடங்குங்கள்"),
            t(
              "Vehicle model, part number and your requirements.",
              "வாகன மாதிரி, பாகத்தின் எண் மற்றும் உங்கள் தேவைகள்.",
            ),
          ],
          [
            "tool",
            t("Confirm before ordering", "ஆர்டர் முன் உறுதி செய்யுங்கள்"),
            t(
              "Fitment and availability are confirmed by our team.",
              "பொருத்தம் மற்றும் கிடைக்கும் நிலையை எங்கள் குழு உறுதி செய்யும்.",
            ),
          ],
          [
            "chat",
            t("Stay in conversation", "தொடர்பில் இருங்கள்"),
            t(
              "Get personal assistance by phone or WhatsApp.",
              "தொலைபேசி அல்லது வாட்ஸ்அப் மூலம் உதவி பெறுங்கள்.",
            ),
          ],
        ]
          .map(
            ([i, a, b]) =>
              `<div class="contact-detail">${icon(i)}<div><strong>${a}</strong><small>${b}</small></div></div>`,
          )
          .join("")}</div></div>`,
    );
  }
  function renderBrands() {
    const brands = unique("brand");
    pageShell(
      heading(
        t("Know what you’re choosing.", "உங்கள் தேர்வை அறிந்து கொள்ளுங்கள்."),
        t(
          "Brand information is shown only when recorded for the specific product.",
          "குறிப்பிட்ட பொருளின் பதிவில் இருந்தால் மட்டுமே பிராண்ட் தகவல் காட்டப்படும்.",
        ),
        "BRANDS & CATALOGUE",
      ) +
        (brands.length
          ? `<div class="brand-cloud">${brands.map((b) => `<a class="brand-chip" href="products.html?search=${encodeURIComponent(b)}">${esc(b)}</a>`).join("")}</div>`
          : `<div class="notice">${t("The original catalogue does not contain verified product-level brand records. Ask Alagar Automobiles to confirm the brand for any part you’re considering.", "அசல் பட்டியலில் பொருள் வாரியான உறுதி செய்யப்பட்ட பிராண்ட் பதிவுகள் இல்லை. நீங்கள் விரும்பும் பாகத்தின் பிராண்டை Alagar Automobiles உடன் உறுதி செய்யுங்கள்.")}</div><a class="button" href="products.html">${t("Explore the catalogue", "பட்டியலைப் பாருங்கள்")}${icon("arrow")}</a>`),
    );
  }
  async function renderAccount() {
    let session = null;
    try {
      session = await api("/auth/me");
    } catch {}
    if (session?.isAdmin) {
      pageShell(
        heading(t("Your business account.", "உங்கள் வணிகக் கணக்கு."), "") +
          `<section class="panel"><p class="muted">${t("You are signed in as an administrator.", "நீங்கள் நிர்வாகியாக உள்நுழைந்துள்ளீர்கள்.")}</p><a class="button" href="admin.html">${t("Open business dashboard", "வணிக நிர்வாகத்தைத் திறக்கவும்")}${icon("arrow")}</a></section>`,
      );
      return;
    }
    if (session?.user) return renderCustomerDashboard(session.user);
    const configured = !!config.features?.otp;
    pageShell(
      heading(
        t("Your account", "உங்கள் Alagar Automobiles கணக்கு."),
        t(
          "A place for your saved parts, vehicle and order enquiries.",
          "நீங்கள் சேமித்த பாகங்கள், வாகனம் மற்றும் ஆர்டர் விசாரணைகளுக்கான இடம்.",
        ),
      ) +
        `<div class="two-column"><section class="panel"><h2>${t("Sign in with your phone", "உங்கள் தொலைபேசியுடன் உள்நுழையுங்கள்")}</h2><form id="signInForm"><label class="field">${t("Mobile number", "கைபேசி எண்")}<input name="phone" type="tel" required pattern="[6-9][0-9]{9}" maxlength="10" placeholder="10-digit Indian mobile" autocomplete="tel-national"></label><button class="button" type="submit" ${configured ? "" : "disabled"}>${t("Request a sign-in code", "உள்நுழைவு குறியீடு கோருங்கள்")}${icon("arrow")}</button><p class="error" id="loginError" role="alert"></p></form><div id="verifyPanel"></div>${configured ? "" : `<div class="notice">${t("Secure phone sign-in is awaiting SMS provider configuration. You can browse, save parts and send enquiries without signing in.", "பாதுகாப்பான தொலைபேசி உள்நுழைவுக்கு SMS சேவை கட்டமைப்பு தேவை. உள்நுழையாமல் பொருட்களைப் பார்த்து, சேமித்து, விசாரணைகளை அனுப்பலாம்.")}</div>`}</section><aside class="panel"><h2>${t("Saved in this browser", "இந்த உலாவியில் சேமிக்கப்பட்டவை")}</h2><div class="footer-links"><a href="wishlist.html">${icon("heart")} &nbsp;${t("Wishlist", "விருப்பப் பட்டியல்")} (${wishes().length})</a><a href="vehicle-finder.html">${icon("car")} &nbsp;${esc(read("aamm_saved_vehicle", "") || t("Choose a vehicle", "வாகனத்தைத் தேர்ந்தெடுக்கவும்"))}</a><a href="track-order.html">${icon("box")} &nbsp;${t("Track your enquiry", "உங்கள் விசாரணை நிலை")}</a><a href="cart.html">${icon("cart")} &nbsp;${t("Your shopping cart", "உங்கள் ஷாப்பிங் கூடை")}</a></div></aside></div>`,
    );
    $("#signInForm").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget,
        button = form.querySelector("button"),
        phone = new FormData(form).get("phone");
      button.disabled = true;
      $("#loginError").textContent = "";
      try {
        const result = await api("/auth/otp/request", {
          method: "POST",
          body: JSON.stringify({ phone }),
        });
        $("#verifyPanel").innerHTML =
          `<form id="verifyForm"><label class="field">${t("Verification code", "சரிபார்ப்பு குறியீடு")}<input name="code" required pattern="[0-9]{4,8}" minlength="4" maxlength="8" inputmode="numeric" autocomplete="one-time-code"></label><button class="button">${t("Verify & sign in", "சரிபார்த்து உள்நுழைக")}${icon("arrow")}</button><p class="error" id="verifyError" role="alert"></p></form>`;
        let seconds = result.resend_after || 60;
        const label = t("Resend code", "குறியீட்டை மீண்டும் அனுப்பு");
        button.textContent = `${label} (${seconds}s)`;
        const timer = setInterval(() => {
          seconds--;
          if (!button.isConnected) {
            clearInterval(timer);
            return;
          }
          button.textContent = seconds ? `${label} (${seconds}s)` : label;
          if (!seconds) {
            clearInterval(timer);
            button.disabled = false;
          }
        }, 1000);
        $("#verifyForm input").focus();
        $("#verifyForm").onsubmit = async (event) => {
          event.preventDefault();
          const verify = event.currentTarget,
            submit = verify.querySelector("button");
          submit.disabled = true;
          try {
            const approved = await api("/auth/otp/verify", {
              method: "POST",
              body: JSON.stringify({
                phone,
                code: new FormData(verify).get("code"),
              }),
            });
            clearInterval(timer);
            toast(t("Signed in securely", "பாதுகாப்பாக உள்நுழைந்துள்ளீர்கள்"));
            await renderCustomerDashboard(approved.user);
          } catch (error) {
            $("#verifyError").textContent = error.message;
            submit.disabled = false;
          }
        };
      } catch (error) {
        $("#loginError").textContent = error.message;
        button.disabled = false;
      }
    };
  }
  async function renderCustomerDashboard(user) {
    try {
      const [orders, notifications, requests, bills] = await Promise.all([
        api(`/orders/${encodeURIComponent(user.phone)}`),
        api("/notifications"),
        api("/my/requests"),
        api("/my/bills"),
      ]);
      pageShell(
        heading(
          `${t("Welcome", "வரவேற்கிறோம்")}${user.name ? ", " + esc(user.name) : ""}.`,
          t(
            "Your details, enquiries and updates, together.",
            "உங்கள் விவரங்கள், விசாரணைகள் மற்றும் தகவல்கள், ஒன்றாக.",
          ),
        ) +
          `<div class="button-row" style="margin-bottom:25px"><a href="wishlist.html" class="button secondary small">${icon("heart")}${t("Wishlist", "விருப்பப் பட்டியல்")}</a><a href="vehicle-finder.html" class="button secondary small">${icon("car")}${t("Saved vehicle", "சேமித்த வாகனம்")}</a><button class="button secondary small" id="customerLogout">${t("Sign out", "வெளியேறு")}</button></div><div class="two-column"><section class="panel"><h2>${t("Your profile & delivery address", "உங்கள் விவரம் மற்றும் டெலிவரி முகவரி")}</h2><form id="profileForm"><div class="form-grid"><label class="field">${t("Name", "பெயர்")}<input name="name" maxlength="100" value="${esc(user.name)}" autocomplete="name"></label><label class="field">${t("Email (optional)", "மின்னஞ்சல் (விருப்பம்)")}<input type="email" name="email" maxlength="200" value="${esc(user.email)}" autocomplete="email"></label><label class="field span-2">${t("Address", "முகவரி")}<textarea name="address" maxlength="1000" autocomplete="street-address">${esc(user.address)}</textarea></label><label class="field">${t("Delivery preference", "டெலிவரி விருப்பம்")}<select name="delivery_pref">${["pickup", "bus", "lorry"].map((v) => `<option ${v === user.delivery_pref ? "selected" : ""}>${v}</option>`).join("")}</select></label></div><button class="button small">${t("Save details", "விவரங்களைச் சேமி")}</button><p class="error" id="profileError" role="alert"></p></form></section><aside class="panel"><h2>${t("Your notifications", "உங்கள் அறிவிப்புகள்")}</h2>${
            notifications.length
              ? notifications
                  .slice(0, 15)
                  .map(
                    (n) =>
                      `<div class="contact-detail"><div><strong style="font-size:12px">${esc(n.title)}</strong><small>${esc(n.message)} · ${esc(displayRef(n.reference || ""))}</small><small>${esc(n.created_at)} · ${esc(n.delivery_status)}</small>${n.is_read ? "" : `<button class="button secondary small" style="margin-top:8px" data-notice-read="${n.id}">${t("Mark as read", "படித்ததாகக் குறி")}</button>`}</div></div>`,
                  )
                  .join("")
              : `<p class="muted">${t("No updates yet.", "இன்னும் தகவல்கள் இல்லை.")}</p>`
          }</aside></div><section class="section"><div class="section-heading"><h2>${t("Your orders & enquiries", "உங்கள் ஆர்டர்கள் மற்றும் விசாரணைகள்")}</h2></div>${orders.length ? `<div class="table-wrap panel"><table class="data-table"><thead><tr><th>Reference</th><th>Date</th><th>Status</th><th>Total</th><th>Payment</th><th>Actions</th></tr></thead><tbody>${orders.map((o) => `<tr><td>${esc(displayRef(o.reference || `Legacy #${o.id}`))}</td><td>${esc(o.ordered_at)}</td><td>${esc(o.status)}</td><td>${money(o.total)}</td><td>${esc(o.payment_status)}</td><td>${o.reference ? `<button class="button secondary small" data-order-track="${esc(o.reference)}">${t("View timeline", "நிலையைக் காண்க")}</button>` : ""} ${config.features?.payments && o.status === "Order Confirmed" && !["captured", "refunded", "captured_review_required"].includes(o.payment_status) ? `<button class="button small" data-pay="${esc(o.reference)}">${t("Pay with Razorpay", "Razorpay மூலம் செலுத்துங்கள்")}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : empty(t("Your first enquiry starts here.", "உங்கள் முதல் விசாரணை இங்கே தொடங்குகிறது."), t("Browse our catalogue and get in touch.", "எங்கள் பட்டியலைப் பார்த்து தொடர்பு கொள்ளுங்கள்."))}<div id="accountOrderDetail"></div></section>${bills.length ? `<section class="section customer-bills"><div class="section-heading"><h2>${t("Your invoices & receipts", "உங்கள் விலைப்பட்டியல்கள் மற்றும் ரசீதுகள்")}</h2></div><div class="bill-list">${bills.map((b) => `<a class="bill-link" href="${esc(b.print_url)}" target="_blank" rel="noopener"><span><strong>${esc(b.number)}</strong><small>${b.kind === "receipt" ? t("Payment receipt", "கட்டண ரசீது") : t("Customer invoice", "வாடிக்கையாளர் விலைப்பட்டியல்")} · ${esc(displayRef(b.order_reference))}</small></span><span>${money(b.total)} ${icon("arrow")}</span></a>`).join("")}</div></section>` : ""}<section class="section"><div class="section-heading"><h2>${t("Parts & exchange requests", "பாகங்கள் மற்றும் மாற்றுக் கோரிக்கைகள்")}</h2></div><div class="table-wrap panel"><table class="data-table"><thead><tr><th>Reference</th><th>Part</th><th>Status</th><th>Quotation / offer</th><th>Updated</th></tr></thead><tbody>${[...(requests.enquiries || []).map((r) => ({ ...r, amount: r.quotation_amount })), ...(requests.exchanges || []).map((r) => ({ ...r, amount: r.valuation }))].map((r) => `<tr><td>${esc(displayRef(r.reference))}</td><td>${esc(r.part_name)}</td><td>${esc(r.status)}</td><td>${r.amount == null ? "—" : money(r.amount)}</td><td>${esc(r.updated_at || r.created_at)}</td></tr>`).join("") || '<tr><td colspan="5">No requests yet.</td></tr>'}</tbody></table></div></section>`,
      );
      $("#customerLogout").onclick = async () => {
        await api("/auth/logout", { method: "POST" });
        toast(t("Signed out", "வெளியேறியுள்ளீர்கள்"));
        await renderAccount();
      };
      $("#profileForm").onsubmit = async (e) => {
        e.preventDefault();
        const button = e.currentTarget.querySelector("button");
        button.disabled = true;
        try {
          await api(`/users/${encodeURIComponent(user.phone)}`, {
            method: "PUT",
            body: JSON.stringify(
              Object.fromEntries(new FormData(e.currentTarget)),
            ),
          });
          toast(t("Your details are saved", "உங்கள் விவரங்கள் சேமிக்கப்பட்டன"));
        } catch (error) {
          $("#profileError").textContent = error.message;
        } finally {
          button.disabled = false;
        }
      };
      document.querySelectorAll("[data-notice-read]").forEach(
        (el) =>
          (el.onclick = async () => {
            try {
              await api("/notifications/" + el.dataset.noticeRead, {
                method: "PATCH",
              });
              el.remove();
            } catch (error) {
              toast(error.message);
            }
          }),
      );
      document.querySelectorAll("[data-order-track]").forEach(
        (el) =>
          (el.onclick = async () => {
            try {
              const result = await api("/tracking", {
                method: "POST",
                body: JSON.stringify({ reference: el.dataset.orderTrack }),
              });
              $("#accountOrderDetail").innerHTML = trackingView(result);
              $("#accountOrderDetail").scrollIntoView({ block: "start" });
            } catch (error) {
              toast(error.message);
            }
          }),
      );
      document
        .querySelectorAll("[data-pay]")
        .forEach((el) => (el.onclick = () => startPayment(el.dataset.pay, el)));
    } catch (error) {
      pageShell(
        heading(t("Your account", "உங்கள் கணக்கு"), "") +
          `<div class="notice">${esc(error.message)}</div><a class="button secondary" href="dashboard.html">${t("Try again", "மீண்டும் முயற்சி செய்")}</a>`,
      );
    }
  }
  function trackingView(result, guest = false) {
    return `<section class="panel tracking-panel" style="margin-top:23px"><h2>${esc(displayRef(result.reference))}</h2><span class="badge">${esc(result.status)}</span><div class="summary-row"><span>${t("Payment", "கட்டணம்")}</span><span>${esc(result.payment_status || "Not requested")}</span></div>${result.tracking_number ? `<div class="summary-row"><span>${t("Courier tracking", "கூரியர் கண்காணிப்பு")}</span><span>${esc(result.courier || "")} ${esc(result.tracking_number)}</span></div>` : ""}${result.estimated_delivery ? `<div class="summary-row"><span>${t("Estimated delivery", "மதிப்பிடப்பட்ட டெலிவரி")}</span><span>${esc(result.estimated_delivery)}</span></div>` : ""}<ol class="timeline">${(result.history || []).map((h) => `<li>${esc(h.status || h.new_status)}<small>${esc(h.created_at || h.timestamp || "")}</small></li>`).join("") || `<li>${esc(result.status)}</li>`}</ol>${(result.bills || []).length ? `<div class="bill-list">${result.bills.map((b) => (guest ? `<button class="bill-link" data-guest-bill="${esc(b.kind)}"><span>${b.kind === "receipt" ? t("Payment receipt", "கட்டண ரசீது") : t("View invoice", "விலைப்பட்டியலைக் காண்க")}<small>${esc(b.number)}</small></span>${icon("arrow")}</button>` : `<a class="bill-link" href="${esc(b.print_url)}" target="_blank" rel="noopener">${esc(b.number)}${icon("arrow")}</a>`)).join("")}</div>` : ""}<small class="muted">${t("Status updates from Alagar Automobiles.", "அழகர் ஆட்டோமொபைல்ஸ் வழங்கும் நிலைத் தகவல்கள்.")}</small></section>`;
  }
  async function openGuestBill(details, type, button) {
    const viewer = window.open("about:blank", "_blank");
    if (!viewer) {
      toast(
        t(
          "Allow this browser to open the invoice.",
          "விலைப்பட்டியலைத் திறக்க இந்த உலாவியில் அனுமதிக்கவும்.",
        ),
      );
      return;
    }
    viewer.opener = null;
    viewer.document.title = t("Loading invoice", "விலைப்பட்டியல் ஏற்றப்படுகிறது");
    viewer.document.body.textContent = t(
      "Loading your document…",
      "உங்கள் ஆவணம் ஏற்றப்படுகிறது…",
    );
    button.disabled = true;
    try {
      const response = await fetch("/billing/guest", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...details, type }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "The invoice is unavailable.");
      }
      const html = await response.text();
      viewer.document.open();
      viewer.document.write(html);
      viewer.document.close();
    } catch (error) {
      viewer.document.body.textContent = error.message;
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  }
  async function startPayment(reference, button) {
    button.disabled = true;
    try {
      const order = await api("/payments/create", {
        method: "POST",
        body: JSON.stringify({ reference }),
      });
      if (!window.Razorpay)
        await new Promise((resolve, reject) => {
          const tag = document.createElement("script");
          tag.src = "https://checkout.razorpay.com/v1/checkout.js";
          tag.onload = resolve;
          tag.onerror = () =>
            reject(
              new Error("Payment checkout could not load. Please try again."),
            );
          document.head.append(tag);
        });
      const checkout = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "Alagar Automobiles",
        description: order.reference,
        theme: { color: "#bd3528" },
        modal: {
          ondismiss: () => {
            button.disabled = false;
            toast(
              t(
                "Checkout closed. No payment is marked as successful.",
                "கட்டணச் சாளரம் மூடப்பட்டது. கட்டணம் வெற்றியாகக் குறிக்கப்படவில்லை.",
              ),
            );
          },
        },
        handler: async (result) => {
          try {
            const verified = await api("/payments/verify", {
              method: "POST",
              body: JSON.stringify(result),
            });
            toast(
              verified.status === "captured"
                ? t(
                    "Payment verified by Razorpay",
                    "Razorpay மூலம் கட்டணம் உறுதி செய்யப்பட்டது",
                  )
                : verified.message ||
                    t(
                      "Payment needs Alagar Automobiles review.",
                      "கட்டணம் Alagar Automobiles ஆய்விற்கு உட்பட்டது.",
                    ),
            );
            await renderAccount();
          } catch (error) {
            toast(error.message);
            button.disabled = false;
          }
        },
      });
      checkout.on("payment.failed", () => {
        toast(
          t(
            "Payment was not completed. Check your account before retrying.",
            "கட்டணம் முடிவடையவில்லை. மீண்டும் முயலும் முன் உங்கள் கணக்கைச் சரிபார்க்கவும்.",
          ),
        );
        button.disabled = false;
      });
      checkout.open();
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  }
  function renderTrack() {
    pageShell(
      heading(
        t("Stay in the loop.", "நிலையை அறிந்து கொள்ளுங்கள்."),
        t(
          "Look up an enquiry using its reference and private tracking token. Shipment updates appear only when provided by Alagar Automobiles.",
          "குறிப்பு மற்றும் தனிப்பட்ட கண்காணிப்பு குறியீட்டைப் பயன்படுத்தி விசாரணையைத் தேடுங்கள். Alagar Automobiles வழங்கிய தகவல்கள் மட்டுமே காட்டப்படும்.",
        ),
        "ENQUIRY & ORDER TRACKING",
      ) +
        `<div class="narrow"><form class="panel" id="trackForm"><label class="field">${t("Order reference", "ஆர்டர் குறிப்பு")}<input name="reference" required placeholder="AA-…" value="${esc(params.get("reference") || "")}"></label><label class="field">${t("Private tracking token", "தனிப்பட்ட கண்காணிப்பு குறியீடு")}<input name="token" required autocomplete="off" value=""></label><button class="button">${t("View status", "நிலையைக் காண்க")}${icon("arrow")}</button><p class="error" id="trackError" role="alert"></p></form><div id="trackResult"></div><div class="notice">${t("Keep your tracking token private. For an older order or a spare-part/exchange request, contact Alagar Automobiles with your reference. Tracking is managed by Alagar Automobiles; it is not live GPS tracking.", "உங்கள் கண்காணிப்பு குறியீட்டைத் தனிப்பட்டதாக வைத்திருங்கள். பழைய ஆர்டர் அல்லது உதிரிபாகக் கோரிக்கைக்கு உங்கள் குறிப்புடன் Alagar Automobiles ஐ தொடர்பு கொள்ளவும். இது நேரடி GPS கண்காணிப்பு அல்ல.")}</div><div id="savedReferences"></div></div>`,
    );
    const saved = read("aamm_order_refs", []).filter((x) => x.tracking_token);
    if (saved.length)
      $("#savedReferences").innerHTML =
        `<h3 style="font-size:13px">${t("Enquiries from this browser", "இந்த உலாவியின் விசாரணைகள்")}</h3><div class="footer-links">${saved.map((x, i) => `<button class="button secondary small" data-ref-index="${i}">${esc(displayRef(x.reference))}</button>`).join("")}</div>`;
    document.querySelectorAll("[data-ref-index]").forEach(
      (el) =>
        (el.onclick = () => {
          const x = saved[+el.dataset.refIndex];
          $("#trackForm [name=reference]").value = x.reference;
          $("#trackForm [name=token]").value = x.tracking_token;
          $("#trackForm").requestSubmit();
        }),
    );
    $("#trackForm").onsubmit = async (e) => {
      e.preventDefault();
      const details = Object.fromEntries(new FormData(e.currentTarget));
      $("#trackError").textContent = "";
      $("#trackResult").innerHTML = "";
      try {
        const result = await api("/tracking-guest", {
          method: "POST",
          body: JSON.stringify(details),
        });
        $("#trackResult").innerHTML = trackingView(result, true);
        document
          .querySelectorAll("[data-guest-bill]")
          .forEach(
            (button) =>
              (button.onclick = () =>
                openGuestBill(details, button.dataset.guestBill, button)),
          );
      } catch (error) {
        $("#trackError").textContent = error.message;
      }
    };
  }
  function renderPolicies() {
    pageShell(
      heading(
        t("A clear next step.", "தெளிவான அடுத்த படி."),
        t(
          "How enquiries, ordering and your information work on Alagar Automobiles.",
          "Alagar Automobiles இல் விசாரணைகள், ஆர்டர்கள் மற்றும் உங்கள் தகவல் எவ்வாறு செயல்படுகிறது.",
        ),
      ) +
        `<article class="panel narrow legal-copy"><h2 id="ordering">${t("Enquiries & ordering", "விசாரணைகள் மற்றும் ஆர்டர்")}</h2><p>${t("Catalogue prices are references from the existing product records. Availability, exact compatibility, delivery costs and final pricing must be confirmed by Alagar Automobiles. Submitting a cart or sending a WhatsApp message is an enquiry and does not confirm a sale. Online payments are unavailable until a payment provider is configured.", "பட்டியல் விலைகள் தற்போதைய பதிவுகளின் குறிப்புகள். கிடைக்கும் நிலை, பொருத்தம், டெலிவரி கட்டணம் மற்றும் இறுதி விலையை Alagar Automobiles உறுதி செய்ய வேண்டும். விசாரணை அனுப்புதல் விற்பனையை உறுதி செய்யாது.")}</p><h2>${t("Returns, refunds & exchanges", "திரும்பப் பெறுதல், பணத்திருப்பம் மற்றும் மாற்றம்")}</h2><p>${t("Contact Alagar Automobiles before placing an order to confirm the applicable return, refund, warranty and exchange terms for your part. No blanket return period or exchange valuation is promised by this website. Old-part exchange enquiries require the team’s review and inspection.", "ஆர்டர் செய்யும் முன் பாகத்திற்கான திரும்பப் பெறுதல், பணத்திருப்பம், உத்தரவாதம் மற்றும் மாற்று விதிகளை Alagar Automobiles உடன் உறுதி செய்யுங்கள். மாற்று விசாரணைகள் குழுவின் ஆய்விற்கு உட்பட்டவை.")}</p><h2 id="privacy">${t("Your information", "உங்கள் தகவல்")}</h2><p>${t("Enquiry forms collect your name, phone number, vehicle/part details and message so Alagar Automobiles can respond. Cart enquiries also collect your delivery preference and address. Do not submit payment credentials or sensitive identity documents. Contact Alagar Automobiles by phone to request correction or deletion of enquiry information.", "விசாரணைக்கு பதிலளிக்க உங்கள் பெயர், கைபேசி எண், வாகனம்/பாகம் விவரங்கள் மற்றும் செய்தி சேகரிக்கப்படும். ஆர்டர் விசாரணைகளில் முகவரியும் பெறப்படும். கட்டண ரகசியங்கள் அல்லது முக்கிய அடையாள ஆவணங்களைச் சமர்ப்பிக்க வேண்டாம்.")}</p><h2>${t("Browser storage & external services", "உலாவி சேமிப்பு மற்றும் வெளிப்புற சேவைகள்")}</h2><p>${t("Your theme, language, wishlist, cart, recently viewed parts and saved vehicle are stored in this browser. Clearing browser data removes them. WhatsApp and Google Maps open external services, which apply their own privacy terms. Fonts are requested from Google Fonts. Administrator sign-in uses a session cookie.", "உங்கள் தீம், மொழி, விருப்பப் பட்டியல், கூடை மற்றும் சேமித்த வாகனம் இந்த உலாவியில் சேமிக்கப்படும். உலாவி தரவை அழித்தால் அவை நீக்கப்படும். வாட்ஸ்அப் மற்றும் Google Maps க்கு அவற்றின் தனியுரிமை விதிகள் பொருந்தும்.")}</p><a class="text-link" href="contact.html">${t("Contact Alagar Automobiles", "Alagar Automobiles ஐ தொடர்பு கொள்ளவும்")}${icon("arrow")}</a></article>`,
    );
  }
  function renderHelp() {
    if (page === "admin") return;
    const button = document.createElement("button");
    button.className = "button secondary support-open";
    button.id = "helpToggle";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "helpPanel");
    button.setAttribute("aria-label", "Open parts support");
    button.innerHTML = `${icon("chat")}<span>${t("Need a hand?", "உதவி வேண்டுமா?")}<small>${t("Talk parts with Alagar Automobiles", "Alagar Automobiles உடன் பேசுங்கள்")}</small></span>`;
    const panel = document.createElement("section");
    panel.id = "helpPanel";
    panel.className = "help-panel support-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Parts support");
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start"><h3>${t("Let’s find your part.", "உங்கள் பாகத்தைக் கண்டறியலாம்.")}</h3><button class="icon-button" id="closeHelp" aria-label="Close support" style="height:25px;width:25px;min-width:25px">${icon("close")}</button></div><p>${t("Search the real Alagar Automobiles catalogue or speak directly to our team.", "உண்மையான Alagar Automobiles பட்டியலில் தேடுங்கள் அல்லது எங்கள் குழுவுடன் நேரடியாகப் பேசுங்கள்.")}</p><form id="helpForm"><input id="helpQuery" class="control" placeholder="e.g. Bolero armature" aria-label="Search parts"><button class="button small full">${t("Search catalogue", "பட்டியலில் தேடு")}${icon("search")}</button></form><div class="help-results" id="helpResults" aria-live="polite"></div><p style="font-size:10px;margin-top:15px">${config.features?.ai ? t("AI can help explore catalogue information. Confirm fitment with Alagar Automobiles.", "AI பட்டியல் தகவல்களுக்கு உதவும். பொருத்தத்தை Alagar Automobiles உடன் உறுதி செய்யுங்கள்.") : t("Automated AI advice is not configured. Compatibility is confirmed by Alagar Automobiles.", "AI ஆலோசனை கட்டமைக்கப்படவில்லை. பொருத்தத்தை Alagar Automobiles உறுதி செய்யும்.")}</p><a class="text-link" href="https://wa.me/919344898473" target="_blank" rel="noopener">${icon("chat")}${t("Chat with our team", "எங்கள் குழுவுடன் பேசுங்கள்")}${icon("arrow")}</a>`;
    const wrap = document.createElement("section");
    wrap.className = "inline-support";
    wrap.append(button, panel);
    $("#app").append(wrap);
    function close() {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      button.focus();
    }
    button.onclick = () => {
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) $("#helpQuery").focus();
    };
    $("#closeHelp").onclick = close;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) close();
    });
    const history = [];
    $("#helpForm").onsubmit = async (e) => {
      e.preventDefault();
      const message = $("#helpQuery").value.trim();
      if (!message) return;
      const submit = e.currentTarget.querySelector("button");
      submit.disabled = true;
      $("#helpResults").innerHTML =
        `<p>${t("Looking through the catalogue…", "பட்டியலில் தேடுகிறோம்…")}</p>`;
      try {
        const result = await api("/assistant", {
          method: "POST",
          body: JSON.stringify({ message, history }),
        });
        history.push(
          { role: "user", content: message },
          { role: "assistant", content: result.message },
        );
        $("#helpResults").innerHTML =
          `<p style="margin-top:14px;white-space:pre-wrap">${esc(result.message)}</p><small class="muted">${result.mode === "ai" ? t("AI assistant · confirm fitment with Alagar Automobiles", "AI உதவியாளர் · பொருத்தத்தை Alagar Automobiles உடன் உறுதி செய்யுங்கள்") : t("Catalogue search results", "பட்டியல் தேடல் முடிவுகள்")}</small>` +
          (result.products || [])
            .map(
              (p) =>
                `<a href="product.html?id=${p.id}">${esc(name(p))}<small class="muted" style="display:block">${money(p.price)}</small></a>`,
            )
            .join("");
      } catch (error) {
        $("#helpResults").innerHTML =
          `<p class="error">${esc(error.message)}</p>`;
      } finally {
        submit.disabled = false;
      }
    };
  }
  window.AA = {
    t,
    language,
    api,
    escape: esc,
    toast,
    money,
    icon,
    renderHeader,
    renderFooter,
  };
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) addToCart(add.dataset.add);
    const wish = e.target.closest("[data-wish]");
    if (wish) toggleWish(wish.dataset.wish);
  });
  window.addEventListener("storage", (e) => {
    if (e.key === "aamm_cart") updateCount();
    if (e.key === "aamm_theme_v2") {
      document.documentElement.dataset.theme =
        e.newValue === "dark" ? "dark" : "light";
      updateTheme();
    }
  });
  async function init() {
    renderHeader();
    renderFooter();
    if (!$("#app")) return;
    try {
      [products, config] = await Promise.all([
        api("/products"),
        api("/api/config"),
      ]);
      if (!Array.isArray(products))
        throw new Error("The catalogue response was invalid.");
      const routes = {
        home: renderHome,
        shop: renderShop,
        product: renderProduct,
        cart: renderCart,
        wishlist: renderWishlist,
        finder: renderFinder,
        request: () => renderEnquiry(),
        exchange: () => renderEnquiry(true),
        contact: () => renderEnquiry(false, true),
        about: renderAbout,
        brands: renderBrands,
        account: renderAccount,
        track: renderTrack,
        policies: renderPolicies,
      };
      await (routes[page] || renderHome)();
      if (page === "contact") renderHelp();
    } catch (error) {
      pageShell(
        empty(
          t("We couldn’t load the catalogue.", "பட்டியலை ஏற்ற முடியவில்லை."),
          error.message,
          "https://wa.me/919344898473",
          t(
            "Contact Alagar Automobiles on WhatsApp",
            "வாட்ஸ்அப்பில் Alagar Automobiles ஐ தொடர்பு கொள்ளவும்",
          ),
        ),
      );
    }
  }
  init();
})();
