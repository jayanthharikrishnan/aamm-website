/* ================================================================
   CART
================================================================ */
function getCart() {
  try { return JSON.parse(localStorage.getItem("aamm_cart")) || []; } catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem("aamm_cart", JSON.stringify(cart));
  updateCartCount();
}
function addToCart(product, brand) {
  const cart = getCart();
  const existing = cart.find(i => i.id === product.id && i.brand === brand);
  if (existing) existing.qty += 1;
  else cart.push({ ...product, brand, qty: 1 });
  saveCart(cart);
  showToast("Added to cart!");
}
function updateCartCount() {
  const total = getCart().reduce((s, i) => s + (i.qty||1), 0);
  document.querySelectorAll("#cartCount").forEach(el => el.textContent = total);
}

/* ================================================================
   USER / AUTH
================================================================ */
function getUser() {
  try { return JSON.parse(localStorage.getItem("aamm_user")) || null; } catch { return null; }
}
function saveUser(user) {
  localStorage.setItem("aamm_user", JSON.stringify(user));
}
function logoutUser() {
  localStorage.removeItem("aamm_user");
}

/* ================================================================
   TOAST
================================================================ */
function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = "0"; }, 2200);
}

/* ================================================================
   HAMBURGER
================================================================ */
function openMenu() {
  document.getElementById("hamburgerMenu")?.classList.add("open");
  document.getElementById("hamburgerOverlay")?.classList.add("active");
}
function closeMenu() {
  document.getElementById("hamburgerMenu")?.classList.remove("open");
  document.getElementById("hamburgerOverlay")?.classList.remove("active");
}

/* ================================================================
   IMAGE
================================================================ */
function getProductImage(product) {
  if (product.image) return product.image;
  return null;
}

/* ================================================================
   PLACEHOLDER
================================================================ */
function makePlaceholder(name, cls) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = name;
  return d;
}

/* ================================================================
   SMALL CARD
================================================================ */
function createCard(p) {
  const card = document.createElement("div");
  card.className = "card";

  const imgSrc = getProductImage(p);
  const imgEl = imgSrc
    ? (() => { const i = document.createElement("img"); i.src = imgSrc; i.alt = p.display_name||p.name; return i; })()
    : makePlaceholder(p.display_name||p.name, "card-img-placeholder");

  const price = document.createElement("div");
  price.className = "price";
  price.textContent = p.price ? "₹" + p.price : "Price on request";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = p.display_name || p.name;

  const btns = document.createElement("div");
  btns.className = "card-btns";

  const btnOrder = document.createElement("button");
  btnOrder.className = "btn-order";
  btnOrder.textContent = "Order";

  const btnCart = document.createElement("button");
  btnCart.className = "btn-cart";
  btnCart.textContent = "Add";

  btns.appendChild(btnOrder);
  btns.appendChild(btnCart);
  card.appendChild(imgEl);
  card.appendChild(price);
  card.appendChild(name);
  card.appendChild(btns);

  card.addEventListener("click", e => { if (!e.target.closest("button")) goToProduct(p); });
  btnOrder.addEventListener("click", e => { e.stopPropagation(); goToProduct(p); });
  btnCart.addEventListener("click",  e => { e.stopPropagation(); addToCart(p, "TVS"); });

  return card;
}

/* ================================================================
   BIG CARD
================================================================ */
function createBigCard(p) {
  const card = document.createElement("div");
  card.className = "big-card";

  const imgSrc = getProductImage(p);
  const imgEl = imgSrc
    ? (() => { const i = document.createElement("img"); i.src = imgSrc; i.alt = p.display_name||p.name; return i; })()
    : makePlaceholder(p.display_name||p.name, "big-img-placeholder");

  const details = document.createElement("div");
  details.className = "big-card-details";
  details.innerHTML = `
    <h2>${p.display_name||p.name}</h2>
    <p>${p.description||"Quality auto spare part."}</p>
    <div class="stars">★★★★★</div>
    <div class="big-price">${p.price ? "₹"+p.price : "Price on request"}</div>
    <div class="big-card-btns">
      <button class="btn-order">Order</button>
      <button class="btn-cart">Add to Cart</button>
    </div>
  `;

  card.appendChild(imgEl);
  card.appendChild(details);

  card.addEventListener("click", e => { if (!e.target.closest("button")) goToProduct(p); });
  details.querySelector(".btn-order").addEventListener("click", e => { e.stopPropagation(); goToProduct(p); });
  details.querySelector(".btn-cart").addEventListener("click",  e => { e.stopPropagation(); addToCart(p, "TVS"); });

  return card;
}

/* ================================================================
   NAVIGATE TO PRODUCT
================================================================ */
function goToProduct(p) {
  let recent = JSON.parse(localStorage.getItem("aamm_recent")||"[]");
  recent = recent.filter(r => r.id !== p.id);
  recent.unshift(p);
  localStorage.setItem("aamm_recent", JSON.stringify(recent.slice(0, 10)));
  sessionStorage.setItem("aamm_product", JSON.stringify(p));
  window.location.href = "product.html";
}

/* ================================================================
   DRAG SCROLL
================================================================ */
function enableDragScroll(el) {
  let isDown = false, startX, scrollLeft;
  el.addEventListener("mousedown",  e => { isDown = true; startX = e.pageX - el.offsetLeft; scrollLeft = el.scrollLeft; });
  el.addEventListener("mouseleave", () => isDown = false);
  el.addEventListener("mouseup",    () => isDown = false);
  el.addEventListener("mousemove",  e => {
    if (!isDown) return;
    e.preventDefault();
    el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX);
  });
}

/* ================================================================
   ORDER FLOW
================================================================ */
let _orderItems    = [];
let _orderFromCart = false;

function startOrder(items, fromCart = false) {
  _orderItems    = items;
  _orderFromCart = fromCart;

  const user = getUser();
  if (user && user.name && user.address && user.delivery_pref) {
    sendToWhatsapp(user.name, user.address, user.delivery_pref);
  } else {
    showOrderPopup();
  }
}

function showOrderPopup() {
  let overlay = document.getElementById("orderOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "popup-overlay";
    overlay.id = "orderOverlay";
    overlay.innerHTML = `
      <div class="popup">
        <h3>Your Details</h3>
        <input id="orderName"    placeholder="Your Name *">
        <input id="orderAddress" placeholder="Delivery Address *">
        <p style="color:#aaa;font-size:13px;margin-top:4px;">Choose delivery mode:</p>
        <div class="delivery-options">
          <button class="delivery-option-btn" onclick="selectDelivery('bus',this)">🚌 Bus Delivery</button>
          <button class="delivery-option-btn" onclick="selectDelivery('lorry',this)">🚛 Lorry Service</button>
          <button class="delivery-option-btn" onclick="selectDelivery('pickup',this)">🏪 Pick Up</button>
        </div>
        <p class="popup-error" id="orderError"></p>
        <div class="popup-btns">
          <button class="popup-btn-white" onclick="closeOrderPopup()">Cancel</button>
          <button class="popup-btn-black" onclick="submitOrder()">Send to WhatsApp</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  const user = getUser();
  if (user) {
    if (user.name)    document.getElementById("orderName").value    = user.name;
    if (user.address) document.getElementById("orderAddress").value = user.address;
    if (user.delivery_pref) selectDeliveryByVal(user.delivery_pref);
  }

  overlay.classList.add("active");
}

let _selectedDelivery = "";

function selectDelivery(val, btn) {
  _selectedDelivery = val;
  document.querySelectorAll(".delivery-option-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
}

function selectDeliveryByVal(val) {
  _selectedDelivery = val;
  document.querySelectorAll(".delivery-option-btn").forEach(b => {
    b.classList.toggle("selected", b.textContent.toLowerCase().includes(val));
  });
}

function closeOrderPopup() {
  document.getElementById("orderOverlay")?.classList.remove("active");
}

function submitOrder() {
  const name     = document.getElementById("orderName")?.value.trim();
  const address  = document.getElementById("orderAddress")?.value.trim();
  const errEl    = document.getElementById("orderError");
  if (!name)              { errEl.textContent = "Name is required.";     return; }
  if (!address)           { errEl.textContent = "Address is required.";  return; }
  if (!_selectedDelivery) { errEl.textContent = "Choose delivery mode."; return; }
  closeOrderPopup();
  sendToWhatsapp(name, address, _selectedDelivery);
}

function sendToWhatsapp(name, address, delivery) {
  const label = { bus:"Bus Delivery", lorry:"Lorry Service", pickup:"Pick Up" }[delivery] || delivery;
  let msg = `Hello! I want to order:%0A%0AName: ${encodeURIComponent(name)}%0AAddress: ${encodeURIComponent(address)}%0ADelivery: ${label}%0A%0AItems:%0A`;
  let total = 0;
  _orderItems.forEach((item, i) => {
    const sub = (item.price||0) * (item.qty||1);
    total += sub;
    msg += `${i+1}. ${encodeURIComponent(item.display_name||item.name)} (${item.brand||"—"}) × ${item.qty||1} = ₹${sub}%0A`;
  });
  msg += `%0ATotal: ₹${total}`;

  const user = getUser();
  fetch("/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: user?.phone||"", items: _orderItems, total, delivery, address })
  }).catch(() => {});

  window.open(`https://wa.me/919344898473?text=${msg}`, "_blank");
  setTimeout(showOrderConfirmPopup, 800);
}

/* ── Was order placed? ── */
function showOrderConfirmPopup() {
  let overlay = document.getElementById("confirmOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "popup-overlay";
    overlay.id = "confirmOverlay";
    overlay.innerHTML = `
      <div class="popup">
        <p class="confirm-popup-text">Is the order placed successfully?</p>
        <div class="popup-btns">
          <button class="popup-btn-white" onclick="orderConfirmNo()">No</button>
          <button class="popup-btn-black" onclick="orderConfirmYes()">Yes</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.add("active");
}

function orderConfirmNo() {
  document.getElementById("confirmOverlay").classList.remove("active");
  let overlay = document.getElementById("retryOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "popup-overlay";
    overlay.id = "retryOverlay";
    overlay.innerHTML = `
      <div class="popup">
        <p class="confirm-popup-text">Do you want to try again?</p>
        <div class="popup-btns">
          <button class="popup-btn-white" onclick="document.getElementById('retryOverlay').classList.remove('active')">No</button>
          <button class="popup-btn-black" onclick="retryOrder()">Yes</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.add("active");
}

function retryOrder() {
  document.getElementById("retryOverlay").classList.remove("active");
  const user = getUser();
  if (user && user.name && user.address && user.delivery_pref) sendToWhatsapp(user.name, user.address, user.delivery_pref);
  else showOrderPopup();
}

function orderConfirmYes() {
  document.getElementById("confirmOverlay").classList.remove("active");
  if (_orderFromCart) { saveCart([]); updateCartCount(); }
  showBillPopup();
}

/* ================================================================
   BILL
================================================================ */
function showBillPopup() {
  document.getElementById("billOverlay")?.remove();

  const now    = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
  const billNo  = "AAMM-" + Date.now().toString().slice(-6);

  let rows = "", total = 0;
  _orderItems.forEach(item => {
    const sub = (item.price||0) * (item.qty||1);
    total += sub;
    rows += `<tr>
      <td>${item.display_name||item.name}</td>
      <td>${item.brand||"—"}</td>
      <td>${item.qty||1}</td>
      <td>₹${item.price||0}</td>
      <td>₹${sub}</td>
    </tr>`;
  });

  const overlay = document.createElement("div");
  overlay.className = "bill-overlay active";
  overlay.id = "billOverlay";
  overlay.innerHTML = `
    <div class="bill-container" id="billContent">
      <div class="bill-topbar">
        <button class="bill-close-btn" onclick="closeBill()">✕</button>
        <div class="bill-action-btns">
          <button class="bill-action-btn" onclick="downloadBill()">Download</button>
          <button class="bill-action-btn" onclick="shareBill()">Share</button>
        </div>
      </div>
      <div class="bill-header">
        <h2>Alagar Automobiles</h2>
        <p>Bill No: ${billNo} &nbsp;|&nbsp; Date: ${dateStr}</p>
        <p>📞 9600715822</p>
      </div>
      <table class="bill-items">
        <thead>
          <tr><th>Item</th><th>Brand</th><th>Qty</th><th>Price</th><th>Total</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="bill-total">Grand Total: ₹${total}</div>
      <div class="bill-footer">Thank you for shopping with Alagar Automobiles!<br>Quality parts, trusted service.</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function closeBill() {
  document.getElementById("billOverlay")?.classList.remove("active");
}

function downloadBill() {
  const content = document.getElementById("billContent").innerHTML;
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>Bill – Alagar Automobiles</title>
    <style>
      body{font-family:Arial,sans-serif;padding:28px;color:#111;max-width:600px;margin:0 auto;}
      h2{margin:0;font-size:22px;} p{margin:4px 0;font-size:13px;color:#555;}
      table{width:100%;border-collapse:collapse;margin:16px 0;}
      th,td{padding:8px 6px;text-align:left;font-size:13px;border-bottom:1px solid #eee;}
      th{border-bottom:2px solid #111;font-weight:700;}
      .bill-total{text-align:right;font-weight:800;font-size:16px;margin-top:8px;}
      .bill-footer{text-align:center;margin-top:24px;font-size:11px;color:#aaa;}
      .bill-topbar,.bill-action-btns{display:none;}
      .bill-header{text-align:center;margin-bottom:20px;border-bottom:1px solid #eee;padding-bottom:16px;}
    </style></head><body>${content}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

function shareBill() {
  if (navigator.share) {
    navigator.share({ title: "Bill – Alagar Automobiles", text: "Here is my order bill from Alagar Automobiles." });
  } else {
    showToast("Sharing not supported on this browser.");
  }
}