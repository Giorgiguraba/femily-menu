/* მაგიდა ორზე: today's pick, the order ticket, the week, the menu and our history. */

/* ---------- small helpers ---------- */
const $ = id => document.getElementById(id);
function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n[k] = v;
    else if (k in n && k !== "list") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
// replaceChildren that skips null/false, like h() does.
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
const money = n => `${Math.round(n)} ₾`;
const BY_NAME = Object.fromEntries(CATALOG.map(d => [d.name, d]));
const BY_ID = Object.fromEntries(CATALOG.map(d => [d.id, d]));
const findDish = name => (name ? BY_NAME[name.trim()] : null) || null;
const dishPhoto = d => (d && !NO_PHOTO.has(d.id) ? `img/${d.id}.jpg` : "");
const videoUrl = d => "https://www.youtube.com/results?search_query=" + encodeURIComponent(d.video);
function photo(src, alt, eager) {
  if (!src) return h("div", { class: "ph" }, "🍽");
  const img = h("img", { src, alt: alt || "", loading: eager ? "eager" : "lazy", decoding: "async" });
  img.onerror = () => img.replaceWith(h("div", { class: "ph" }, "🍽"));
  return img;
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const DAYS = ["ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი", "კვირა"];
const MONTHS = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"];
const now = new Date();
const todayIdx = (now.getDay() + 6) % 7;
const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const prettyDate = key => { const [, m, d] = key.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };

/* ---------- storage: browser first, shared db when the page runs on claude.ai ---------- */
const mem = {};
const shared = { db: null };
function load(key, fallback) {
  if (key in mem) return mem[key];
  try { const v = JSON.parse(localStorage.getItem("tfm-" + key)); if (v != null) return (mem[key] = v); } catch (e) {}
  return (mem[key] = fallback);
}
function persist(key, value) {
  mem[key] = value;
  let ok = true;
  try { localStorage.setItem("tfm-" + key, JSON.stringify(value)); } catch (e) { ok = false; }
  if (shared.db) shared.db.doc("state/" + key).set({ v: value }).catch(() => {});
  return ok || !!shared.db;
}

const SAMPLE = [
  { breakfast: "შვრიის ფაფა ხილით", lunch: "ისპანახის ფხალი", dinner: "ხაჭაპური აჭარული", note: "კვირა ტკბილად დავიწყოთ" },
  { breakfast: "ბლინები თაფლით", lunch: "კაპრეზე", dinner: "ლობიო მჭადით", note: "" },
  { breakfast: "სირნიკები არაჟნით", lunch: "ბერძნული სალათი", dinner: "ჩახოხბილი", note: "თბილი და სუნელოვანი" },
  { breakfast: "ავოკადოს ტოსტი", lunch: "კესადილია", dinner: "ფეტუჩინი ალფრედო", note: "" },
  { breakfast: "შაქშუქა", lunch: "ჰუმუსი პიტით", dinner: "მწვადი", note: "პარასკევია, ვიქეიფოთ!" },
  { breakfast: "ვაფლები", lunch: "ოჯახური", dinner: "ჩაქაფული", note: "" },
  { breakfast: "კვერცხი ბენედიქტი", lunch: "პოკე ბოული", dinner: "შქმერული", note: "კვირა შენია ♥" }
].map(d => ({ ...d, photo: "" }));

let week = load("week", null);
if (!Array.isArray(week) || week.length !== 7) week = structuredClone(SAMPLE);
const dayPhoto = d => d.photo || dishPhoto(findDish(d.dinner));

const getBudget = () => Number(load("budget", 0)) || 0;
const fits = (d, b = getBudget()) => !b || !d || d.cost <= b;
let mood = "all";
const MOOD_CHIPS = [["all", "ყველაფერი"], ...Object.entries(MOODS).map(([k, m]) => [k, m.label]), ["quick", "სწრაფი ⏱"]];
function moodOk(d) {
  if (mood === "all") return d.cat === "ge" || d.cat === "world";
  if (mood === "quick") return d.time <= 30 && d.cat !== "dessert";
  return MOODS[mood].ids.has(d.id);
}
const getChoice = () => { const c = load("choice", null); return c && c.date === dateKey() ? c : null; };
const getHistory = () => load("history", []);
const getFavs = () => new Set(load("favs", []));

function saveChoice(c) {
  persist("choice", c);
  if (!c) return;
  const hist = getHistory().filter(x => x.date !== c.date);
  const dish = findDish(c.name);
  hist.unshift({ date: c.date, name: c.name, cost: dish ? dish.cost : 0, rating: 0 });
  persist("history", hist.slice(0, 120));
}

/* ---------- today: intro, filters, deck ---------- */
let deck = [], pos = 0;
let justPrinted = false; // play the print animation only right after choosing

function renderIntro() {
  const day = week[todayIdx];
  const choice = getChoice();
  fill($("intro"), 
    h("span", { class: "eyebrow" }, `${DAYS[todayIdx]} · ${now.getDate()} ${MONTHS[now.getMonth()]}`),
    choice
      ? h("h1", { class: "display" }, "შეკვეთა ", h("em", null, "მიღებულია"), "!")
      : h("h1", { class: "display" }, "რას ", h("em", null, "მიირთმევ"), " დღეს?"),
    h("p", { class: "lede" }, choice
      ? `დღეს ვახშმად ${choice.name} გელოდება. თუ რამე გინდა, მზარეულს ბარათზე მიწერე.`
      : "მზარეულმა უკვე აარჩია. ♥-ით დაეთანხმე, ✕-ით სხვას შემოგთავაზებს, ბარათის გადაფურცვლაც შეგიძლია."),
    day.note ? h("div", { class: "note-chef" }, h("b", null, "მზარეულისგან:"), h("span", null, day.note)) : null
  );
}

function renderFilters() {
  const b = getBudget();
  const range = h("input", { type: "range", min: 10, max: 60, step: 1, value: b || 60, "aria-label": "ბიუჯეტი ლარში" });
  const out = h("output", null, b ? money(b) : "∞");
  const count = () => CATALOG.filter(d => moodOk(d) && fits(d, Number(range.value) >= 60 ? 0 : Number(range.value))).length;
  const hint = h("small", null);
  const sync = () => {
    const v = Number(range.value);
    out.textContent = v >= 60 ? "∞" : money(v);
    hint.textContent = v >= 60 ? `ფასი არ მაინტერესებს · ${count()} კერძი` : `ამ ფასში ${count()} კერძი ჯდება`;
  };
  range.oninput = sync;
  range.onchange = () => { const v = Number(range.value); persist("budget", v >= 60 ? 0 : v); refreshAll(); };
  sync();
  fill($("filters"), 
    h("div", null, h("h3", null, "რა გუნებაზე ხარ?"),
      h("div", { class: "chips" }, MOOD_CHIPS.map(([k, label]) =>
        h("button", { type: "button", class: "chip" + (mood === k ? " on" : ""), onclick: () => { mood = k; buildDeck(); renderFilters(); renderDeck(); } }, label)))),
    h("div", null, h("h3", null, "რამდენის დახარჯვა გინდა?"),
      h("div", { class: "budget" }, range, out, hint))
  );
}

function buildDeck() {
  const day = week[todayIdx];
  const pickDish = findDish(day.dinner);
  const items = [];
  if (day.dinner && (!pickDish || (fits(pickDish) && (mood === "all" || moodOk(pickDish)))))
    items.push({ name: day.dinner, photo: dayPhoto(day), dish: pickDish, mine: true });
  shuffle(CATALOG.filter(d => d.name !== day.dinner && moodOk(d) && fits(d)))
    .forEach(d => items.push({ name: d.name, photo: dishPhoto(d), dish: d }));
  deck = items; pos = 0;
}

function cardEl(item, back) {
  const d = item.dish;
  const card = h("article", { class: "card" + (back ? " back" : ""), "aria-label": item.name },
    photo(item.photo, item.name, !back),
    h("div", { class: "shade" }),
    item.mine ? h("div", { class: "sticker" }, "მზარეულის არჩევანი ♥") : null,
    d ? h("button", { type: "button", class: "peek", "aria-label": "რეცეპტი და ფასები", onpointerdown: e => e.stopPropagation(), onclick: () => openRecipe(d) }, "i") : null,
    h("div", { class: "stamp yes" }, "მინდა!"),
    h("div", { class: "stamp no" }, "სხვა"),
    h("div", { class: "info" },
      h("h3", { class: "display" }, item.name),
      d ? h("div", { class: "tags" },
        h("span", { class: "tag" + (fits(d) ? "" : " over") }, "≈ " + money(d.cost)),
        h("span", { class: "tag" }, d.time + " წთ"),
        h("span", { class: "tag" }, CATS[d.cat])) : null)
  );
  return card;
}

function renderDeck() {
  renderIntro();
  const col = $("deckCol");
  const choice = getChoice();
  if (choice) { fill(col, ticketEl(choice)); justPrinted = false; return; }

  const deckEl = h("div", { class: "deck" });
  if (pos >= deck.length) {
    deckEl.append(h("div", { class: "empty" },
      h("b", null, deck.length ? "ყველა ნახე!" : "ვერაფერი ვიპოვე"),
      h("span", { class: "muted" }, deck.length ? "თავიდან დავიწყოთ?" : "გუნება შეცვალე ან ბიუჯეტი ცოტა გაზარდე."),
      deck.length ? h("button", { type: "button", class: "btn", onclick: () => { buildDeck(); renderDeck(); } }, "თავიდან") : null));
    fill(col, deckEl);
    return;
  }
  if (deck[pos + 1]) deckEl.append(cardEl(deck[pos + 1], true));
  const top = cardEl(deck[pos]);
  deckEl.append(top);
  enableDrag(top);
  fill(col, deckEl,
    h("div", { class: "actions" },
      h("button", { type: "button", class: "round no", "aria-label": "სხვა მინდა", onclick: () => decide(false) }, "✕"),
      h("button", { type: "button", class: "round yes", "aria-label": "ეს მინდა", onclick: () => decide(true) }, "♥"),
      h("button", { type: "button", class: "round dice", "aria-label": "ბედს მივენდობი", title: "ბედს მივენდობი", onclick: rollDice }, "🎲")),
    h("p", { class: "deck-hint" }, `${pos + 1} / ${deck.length} · 🎲 თუ ვერ წყვეტ`));
}

let busy = false;
function decide(yes) {
  const top = document.querySelector(".deck .card:not(.back)");
  if (!top || busy) return;
  busy = true;
  top.style.transform = `translateX(${yes ? 140 : -140}%) rotate(${yes ? 24 : -24}deg)`;
  top.style.opacity = "0";
  top.querySelector(yes ? ".stamp.yes" : ".stamp.no").style.opacity = "1";
  setTimeout(() => {
    busy = false;
    if (yes) {
      const it = deck[pos];
      justPrinted = true;
      saveChoice({ date: dateKey(), name: it.name, extras: [], time: "20:00", wish: "" });
      renderDeck(); renderUs(); renderMenu();
    } else { pos++; renderDeck(); }
  }, 320);
}

function enableDrag(card) {
  let x0 = 0, y0 = 0, dx = 0, dragging = false;
  const yes = card.querySelector(".stamp.yes"), no = card.querySelector(".stamp.no");
  card.addEventListener("pointerdown", e => {
    if (busy) return;
    dragging = true; x0 = e.clientX; y0 = e.clientY; dx = 0;
    card.setPointerCapture(e.pointerId); card.classList.add("dragging");
  });
  card.addEventListener("pointermove", e => {
    if (!dragging) return;
    dx = e.clientX - x0;
    const dy = (e.clientY - y0) * .2;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    yes.style.opacity = Math.max(0, Math.min(1, dx / 100));
    no.style.opacity = Math.max(0, Math.min(1, -dx / 100));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false; card.classList.remove("dragging");
    if (Math.abs(dx) > 100) decide(dx > 0);
    else { card.style.transform = ""; yes.style.opacity = no.style.opacity = 0; }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

// "Leave it to fate": flick through photos, then land on a random dish.
function rollDice() {
  if (busy) return;
  const pool = deck.slice(pos).filter(x => x.photo);
  if (pool.length < 2) return;
  busy = true;
  const deckEl = document.querySelector(".deck");
  const reel = h("div", { class: "shuffle" }, h("img", { alt: "" }));
  deckEl.append(reel);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let n = 0;
  const steps = reduce ? 1 : 12;
  const tick = () => {
    reel.firstChild.src = pool[Math.floor(Math.random() * pool.length)].photo;
    if (++n < steps) setTimeout(tick, 60 + n * 12);
    else {
      const pick = deck.splice(pos + 1 + Math.floor(Math.random() * (deck.length - pos - 1)), 1)[0];
      deck.splice(pos, 0, pick);
      busy = false;
      renderDeck();
    }
  };
  tick();
}

/* ---------- the order ticket ---------- */
const EXTRAS = [["dessert", "+ დესერტი 🍰"], ["wine", "+ ღვინო 🍷"], ["candles", "+ სანთლები 🕯"], ["mild", "ნაკლებად ცხარე"], ["extra", "დიდი პორცია"]];
const EXTRA_COST = { dessert: 12, wine: 15 };

function ticketEl(c) {
  const dish = findDish(c.name);
  const start = new Date(now.getFullYear(), 0, 0);
  const no = String(Math.floor((now - start) / 864e5)).padStart(3, "0");
  const update = patch => { saveChoice({ ...c, ...patch }); renderDeck(); };
  const extras = new Set(c.extras || []);
  const total = (dish ? dish.cost : 0) + [...extras].reduce((s, k) => s + (EXTRA_COST[k] || 0), 0);
  const line = (name, price) => h("div", { class: "line" }, h("span", null, name), h("span", { class: "dots" }), h("span", null, price));

  const wish = h("textarea", { rows: 2, placeholder: "მაგ.: ბევრი ყველი, თუ შეიძლება ♥", value: c.wish || "" });
  let t;
  wish.oninput = () => { clearTimeout(t); t = setTimeout(() => saveChoice({ ...c, extras: [...extras], wish: wish.value }), 500); };
  const time = h("select", { "aria-label": "რა დროს" },
    ["19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00"].map(v => h("option", { value: v, selected: v === (c.time || "20:00") }, v)));
  time.onchange = () => update({ extras: [...extras], wish: wish.value, time: time.value });

  return h("div", { class: "printer" }, h("div", { class: "slot" }, h("div", { class: "ticket" + (justPrinted ? " fresh" : ""), role: "region", "aria-label": "დღევანდელი შეკვეთა" },
    h("div", { class: "t-head" }, h("span", null, "შეკვეთა №" + no), h("span", null, prettyDate(c.date))),
    h("div", { class: "t-head", style: "margin-top:4px" }, h("span", null, "მაგიდა 1 · სტუმარი 1"), h("span", null, "♥")),
    h("div", { class: "stampmark" }, "მიღებულია"),
    h("h4", null, c.name),
    h("hr"),
    dish ? line("კერძი, 2 პორცია", money(dish.cost)) : null,
    [...extras].filter(k => EXTRA_COST[k]).map(k => line(EXTRAS.find(e => e[0] === k)[1].replace("+ ", ""), "≈ " + money(EXTRA_COST[k]))),
    h("hr"),
    h("div", { class: "line total" }, h("span", null, "სულ"), h("span", { class: "dots" }), h("span", null, "≈ " + money(total))),
    h("label", null, "დამატებით"),
    h("div", { class: "extras" }, EXTRAS.map(([k, label]) => h("button", {
      type: "button", class: extras.has(k) ? "on" : "", "aria-pressed": String(extras.has(k)),
      onclick: () => { extras.has(k) ? extras.delete(k) : extras.add(k); update({ extras: [...extras], wish: wish.value, time: time.value }); }
    }, label))),
    h("label", null, "როდის მოგართვა?"), time,
    h("label", null, "სურვილი მზარეულს"), wish,
    h("div", { class: "t-actions" },
      dish ? h("button", { type: "button", class: "btn", onclick: () => openRecipe(dish) }, "რეცეპტი") : null,
      h("button", { type: "button", class: "btn ghost", onclick: () => { persist("choice", null); buildDeck(); renderDeck(); } }, "სხვა ავირჩიო"))
  )));
}

/* ---------- week ---------- */
function renderWeek() {
  const monday = new Date(now); monday.setDate(now.getDate() - todayIdx);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  $("weekRange").textContent = `${monday.getDate()} ${MONTHS[monday.getMonth()]} — ${sunday.getDate()} ${MONTHS[sunday.getMonth()]}`;
  const total = week.reduce((s, d) => s + (findDish(d.dinner)?.cost || 0), 0);
  fill($("weekTotal"), h("b", null, "≈ " + money(total)), "კვირის ვახშმები");
  fill($("strip"), ...week.map((d, i) => {
    const dish = findDish(d.dinner);
    return h("button", { type: "button", class: "day" + (i === todayIdx ? " is-today" : ""), onclick: () => openDay(i) },
      h("div", { class: "pic" }, photo(dayPhoto(d), d.dinner), h("span", { class: "dname" + (i === todayIdx ? " now" : "") }, i === todayIdx ? "დღეს" : DAYS[i])),
      h("div", { class: "body" },
        h("b", null, d.dinner || "სიურპრიზი"),
        h("small", null, [d.breakfast, d.lunch].filter(Boolean).join(" · ") || " "),
        dish ? h("span", { class: "price" }, "≈ " + money(dish.cost)) : null));
  }));
}
// Start the strip at today on phones.
function scrollStripToToday() {
  const el = $("strip").children[todayIdx];
  if (el) $("strip").scrollLeft = el.offsetLeft - $("strip").firstElementChild.offsetLeft;
}

/* ---------- menu ---------- */
let menuCat = "all";
function renderCats() {
  fill($("cats"), ...[["all", "ყველა"], ["fav", "♥ საყვარელი"], ...Object.entries(CATS)].map(([k, label]) =>
    h("button", { type: "button", class: "chip" + (menuCat === k ? " on" : ""), onclick: () => { menuCat = k; renderCats(); renderMenu(); } }, label)));
}
function renderMenu() {
  const q = $("search").value.trim().toLowerCase();
  const sort = $("sort").value;
  const favs = getFavs();
  let list = CATALOG.filter(d =>
    (menuCat === "all" || (menuCat === "fav" ? favs.has(d.id) : d.cat === menuCat)) &&
    (!q || d.name.toLowerCase().includes(q) || d.ings.some(i => i[0].toLowerCase().includes(q))));
  if (sort === "cheap") list.sort((a, b) => a.cost - b.cost);
  if (sort === "pricey") list.sort((a, b) => b.cost - a.cost);
  if (sort === "fast") list.sort((a, b) => a.time - b.time);
  $("menuCount").textContent = `${CATALOG.length} კერძი · ფასები 2 პორციაზე`;
  const row = d => h("button", { type: "button", class: "row" + (fits(d) ? "" : " over"), onclick: () => openRecipe(d) },
    h("div", { class: "thumb" }, photo(dishPhoto(d), "")),
    h("div", null, h("b", null, d.name, favs.has(d.id) ? h("span", { class: "fav" }, "♥") : null),
      h("small", null, `${d.time} წთ · ${d.ings.slice(0, 3).map(i => i[0]).join(", ")}`)),
    h("div", { class: "p" }, money(d.cost), h("small", null, fits(d) ? "" : "ბიუჯეტს აჭარბებს")));
  const out = [];
  if (!list.length) out.push(h("p", { class: "no-results" }, menuCat === "fav" ? "საყვარელი კერძები ჯერ არ გაქვს. კერძის გვერდზე ♥-ს დააჭირე." : "ასეთი კერძი ვერ ვიპოვე. სხვა სიტყვა სცადე."));
  else if (sort === "cat" && menuCat === "all" && !q) {
    Object.entries(CATS).forEach(([k, label]) => {
      const part = list.filter(d => d.cat === k);
      out.push(h("h3", { class: "cat-title display" }, label, h("small", null, part.length + " კერძი")), ...part.map(row));
    });
  } else out.push(...list.map(row));
  fill($("menuList"), ...out);
}

/* ---------- us: history and ratings ---------- */
function renderUs() {
  const hist = getHistory();
  const spent = hist.reduce((s, x) => s + (x.cost || 0), 0);
  const rated = hist.filter(x => x.rating);
  const best = rated.slice().sort((a, b) => b.rating - a.rating)[0];
  fill($("stats"), 
    h("div", { class: "stat" }, h("b", { class: "display" }, String(hist.length)), h("span", null, "ერთად ნავახშმები")),
    h("div", { class: "stat" }, h("b", { class: "display" }, "≈ " + money(spent)), h("span", null, "პროდუქტებში")),
    h("div", { class: "stat" }, h("b", { class: "display" }, best ? "♥".repeat(best.rating) : "—"), h("span", null, best ? "საუკეთესო: " + best.name : "ჯერ შეფასება არ არის")));
  if (!hist.length) {
    fill($("history"), h("div", { class: "empty-us" }, "აქ ჩვენი ვახშმები შეგროვდება. როცა დღის კერძს აირჩევ, აქაც გამოჩნდება და შეაფასებ."));
    return;
  }
  fill($("history"), ...hist.slice(0, 30).map(x => {
    const d = findDish(x.name);
    const hearts = h("div", { class: "hearts", role: "group", "aria-label": "შეფასება" },
      [1, 2, 3, 4, 5].map(n => h("button", { type: "button", class: n <= x.rating ? "on" : "", "aria-label": n + " გული", onclick: () => {
        persist("history", getHistory().map(y => y.date === x.date ? { ...y, rating: n } : y)); renderUs();
      } }, "♥")));
    return h("div", { class: "h-row" },
      h("div", { class: "thumb" }, photo(dishPhoto(d), "")),
      h("div", null, h("b", null, x.name), h("div", { class: "muted", style: "font-size:13px" }, prettyDate(x.date) + (x.cost ? " · ≈ " + money(x.cost) : ""))),
      hearts);
  }));
}

/* ---------- sheets ---------- */
const sheet = $("sheet");
sheet.addEventListener("click", e => { if (e.target === sheet) sheet.close(); });
function show(...kids) { fill(sheet, ...kids); if (!sheet.open) sheet.showModal(); sheet.scrollTop = 0; }
const closeBtn = () => h("button", { type: "button", class: "x", "aria-label": "დახურვა", onclick: () => sheet.close() }, "✕");

function openRecipe(d) {
  const favs = getFavs();
  const got = new Set();
  const total = h("span", null, money(d.cost));
  const need = h("span", null, "ჯამი");
  const ings = h("ul", { class: "ings" }, d.ings.map(([n, amt, p], i) => {
    const li = h("li", { onclick: () => {
      got.has(i) ? got.delete(i) : got.add(i); li.classList.toggle("got");
      const left = d.ings.reduce((s, x, j) => s + (got.has(j) ? 0 : x[2]), 0);
      need.textContent = got.size ? "კიდევ საყიდელი" : "ჯამი"; total.textContent = money(left);
    } }, h("span", { class: "box" }, "✓"), h("span", { class: "n" }, n), h("span", { class: "amt" }, amt), h("span", { class: "pr" }, money(p)));
    return li;
  }));
  const fav = h("button", { type: "button", class: "btn ghost", onclick: () => {
    const f = getFavs(); f.has(d.id) ? f.delete(d.id) : f.add(d.id);
    persist("favs", [...f]); fav.textContent = f.has(d.id) ? "♥ საყვარელია" : "♡ საყვარელში"; renderMenu();
  } }, favs.has(d.id) ? "♥ საყვარელია" : "♡ საყვარელში");
  const canPick = !getChoice();
  show(
    h("div", { class: "sheet-hero" }, photo(dishPhoto(d), d.name, true), closeBtn()),
    h("div", { class: "sheet-body" },
      h("span", { class: "eyebrow" }, CATS[d.cat]),
      h("h2", { class: "display" }, d.name),
      h("div", { class: "pills" },
        h("span", { class: "pill c" }, "≈ " + money(d.cost)), h("span", { class: "pill" }, d.time + " წთ"), h("span", { class: "pill" }, "2 პორცია"),
        fits(d) ? null : h("span", { class: "pill" }, "ბიუჯეტზე ძვირია")),
      h("h3", null, "ინგრედიენტები · მონიშნე, რაც უკვე გაქვს"),
      ings,
      h("div", { class: "ings-total" }, need, total),
      h("h3", null, "მომზადება"),
      h("ol", { class: "steps" }, d.steps.map(s => h("li", null, h("span", null, s)))),
      h("div", { class: "sheet-actions" },
        canPick ? h("button", { type: "button", class: "btn cherry", onclick: () => {
          justPrinted = true;
          saveChoice({ date: dateKey(), name: d.name, extras: [], time: "20:00", wish: "" });
          sheet.close(); renderDeck(); renderUs(); location.hash = "#today";
        } }, "♥ დღეს ეს მინდა") : null,
        h("div", { class: "two" },
          h("a", { class: "btn", href: videoUrl(d), target: "_blank", rel: "noopener" }, "▶ ვიდეო"),
          fav)))
  );
}

function openDay(i) {
  const d = week[i];
  const dish = findDish(d.dinner);
  const meal = (label, v) => v ? h("div", { class: "line", style: "display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)" },
    h("span", { class: "muted", style: "width:90px" }, label), h("b", null, v)) : null;
  show(
    h("div", { class: "sheet-hero" }, photo(dayPhoto(d), d.dinner, true), closeBtn()),
    h("div", { class: "sheet-body" },
      h("span", { class: "eyebrow" }, i === todayIdx ? "დღეს · " + DAYS[i] : DAYS[i]),
      h("h2", { class: "display" }, d.dinner || "სიურპრიზი"),
      d.note ? h("div", { class: "note-chef", style: "margin:0 0 12px" }, h("b", null, "მზარეულისგან:"), h("span", null, d.note)) : null,
      meal("საუზმე", d.breakfast), meal("სადილი", d.lunch), meal("ვახშამი", d.dinner),
      h("div", { class: "sheet-actions" },
        dish ? h("button", { type: "button", class: "btn cherry", onclick: () => openRecipe(dish) }, "რეცეპტი და ფასები") : null,
        h("button", { type: "button", class: "btn ghost", onclick: () => editDay(i) }, "მენიუს შეცვლა")))
  );
}

function editDay(i) {
  const draft = { ...week[i] };
  const hero = h("div", { class: "sheet-hero" });
  const file = h("input", { type: "file", accept: "image/*", hidden: true });
  const drawHero = () => fill(hero, photo(dayPhoto(draft), draft.dinner, true), closeBtn(),
    h("div", { class: "upload" },
      h("label", null, "📷 ჩემი ფოტო", file),
      draft.photo ? h("button", { type: "button", onclick: () => { draft.photo = ""; drawHero(); } }, "წაშლა") : null));
  file.onchange = async () => { if (file.files[0]) { draft.photo = await shrink(file.files[0]); drawHero(); } };
  drawHero();

  const field = (key, label, multi) => {
    const inp = multi ? h("textarea", { rows: 2, value: draft[key] || "" }) : h("input", { type: "text", list: "dish-list", value: draft[key] || "" });
    if (!multi) inp.setAttribute("list", "dish-list");
    inp.oninput = () => { draft[key] = inp.value; if (key === "dinner") drawHero(); };
    return h("label", null, label, inp);
  };
  const err = h("p", { class: "err" });
  const save = h("button", { type: "submit", class: "btn cherry" }, "შენახვა");
  const form = h("form", { class: "edit", onsubmit: e => {
    e.preventDefault();
    for (const k of ["breakfast", "lunch", "dinner", "note"]) draft[k] = (draft[k] || "").trim();
    const before = week[i];
    week[i] = draft;
    if (!persist("week", week)) { week[i] = before; err.textContent = "ვერ შეინახა: ფოტო ძალიან დიდია, სხვა სცადე."; return; }
    refreshAll(); openDay(i);
  } },
    h("datalist", { id: "dish-list" }, CATALOG.map(d => h("option", { value: d.name }))),
    field("dinner", "ვახშამი (აირჩიე სიიდან ან ჩაწერე)"),
    field("breakfast", "საუზმე"), field("lunch", "სადილი"),
    field("note", "პატარა წერილი მისთვის", true),
    err,
    h("div", { class: "sheet-actions" }, h("div", { class: "two" }, save,
      h("button", { type: "button", class: "btn ghost", onclick: () => openDay(i) }, "გაუქმება"))));
  show(hero, h("div", { class: "sheet-body" }, h("span", { class: "eyebrow" }, DAYS[i]), h("h2", { class: "display" }, "მენიუს შეცვლა"), form));
}

// Shrink uploads so a week of photos fits in browser storage.
function shrink(f, max = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = h("canvas", { width: Math.round(img.width * s), height: Math.round(img.height * s) });
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", .78));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(f);
  });
}

/* ---------- wiring ---------- */
function refreshAll() { buildDeck(); renderFilters(); renderDeck(); renderWeek(); renderMenu(); renderUs(); }
$("search").oninput = renderMenu;
$("sort").onchange = renderMenu;
document.addEventListener("keydown", e => {
  if (sheet.open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowRight") decide(true);
  if (e.key === "ArrowLeft") decide(false);
});
const navLinks = document.querySelectorAll("[data-sec]");
const spy = new IntersectionObserver(es => es.forEach(en => {
  if (en.isIntersecting) navLinks.forEach(a => a.classList.toggle("on", a.dataset.sec === en.target.id));
}), { rootMargin: "-45% 0px -50% 0px" });
["today", "week", "menu", "us"].forEach(id => spy.observe($(id)));

renderCats();
refreshAll();
scrollStripToToday();

// When opened on claude.ai, keep everything in one shared place for both of you.
(async () => {
  if (!window.claude || !claude.use) return;
  const db = await claude.use("db");
  if (!db) return;
  shared.db = db;
  ["choice", "budget", "history", "favs", "week"].forEach(key => db.doc("state/" + key).onSnapshot(snap => {
    if (!snap.exists) return;
    const v = snap.data().v;
    if (JSON.stringify(v) === JSON.stringify(mem[key])) return;
    mem[key] = v;
    try { localStorage.setItem("tfm-" + key, JSON.stringify(v)); } catch (e) {}
    if (key === "week" && Array.isArray(v) && v.length === 7) week = v;
    refreshAll();
  }, () => {}));
})();
