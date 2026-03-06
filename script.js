let allProducts = [];

async function loadProducts() {

const response = await fetch("/products");
const products = await response.json();

allProducts = products;

displayProducts(products);

}

function displayProducts(products) {

const container = document.getElementById("products");

if (!container) return;

container.innerHTML = "";

products.forEach(p => {

const message = encodeURIComponent(
`Hello, I want to order:

${p.name}
Price: ₹${p.price}`
);

const whatsappLink = `https://wa.me/919344898473?text=${message}`;

const card = document.createElement("div");
card.className = "card";

card.innerHTML = `
<img src="${p.image}" style="width:100%;height:180px;object-fit:cover;border-radius:8px;margin-bottom:15px;">
<h3>${p.name}</h3>
<p>${p.description}</p>
<p>₹${p.price}</p>

<a href="${whatsappLink}" target="_blank" class="button" style="margin-top:10px;display:inline-block;">
Order on WhatsApp
</a>
`;

container.appendChild(card);

});

}

function searchProducts() {

const query = document.getElementById("search").value.toLowerCase();

const filtered = allProducts.filter(p =>
p.name.toLowerCase().includes(query) ||
p.description.toLowerCase().includes(query)
);

displayProducts(filtered);

}

document.addEventListener("DOMContentLoaded", () => {

loadProducts();

const searchInput = document.getElementById("search");

if(searchInput){
searchInput.addEventListener("input", searchProducts);
}

});

async function addProduct() {

const name = document.getElementById("name").value;
const description = document.getElementById("description").value;
const price = document.getElementById("price").value;
const image = document.getElementById("image").value;

await fetch("/add-product", {

method: "POST",

headers: {
"Content-Type": "application/json"
},

body: JSON.stringify({
name,
description,
price,
image
})

});

alert("Product added");

}