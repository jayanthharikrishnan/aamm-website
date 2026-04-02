<<<<<<< HEAD
const menuBtn=document.querySelector(".menu-btn")
const menu=document.getElementById("menu")

menuBtn.onclick=()=>{
menu.style.display=menu.style.display==="block"?"none":"block"
}


async function loadProducts(){

const res=await fetch("/products")
const products=await res.json()

const top=document.getElementById("topselling")
const recent=document.getElementById("recently")
const all=document.getElementById("allproducts")

products.forEach(p=>{

const card=createCard(p)

if(top && top.children.length<5) top.appendChild(card.cloneNode(true))
if(recent && recent.children.length<5) recent.appendChild(card.cloneNode(true))
if(all) all.appendChild(card)

=======
async function loadProducts(){

const res = await fetch("/products")
const products = await res.json()

const top=document.getElementById("topselling")
const recent=document.getElementById("recently")

if(top){

products.slice(0,5).forEach(p=>{
top.appendChild(createCard(p))
>>>>>>> e6ee3c28bbdeaf1bfe826ea47d91c4d83d2ca185
})

}

<<<<<<< HEAD
=======
if(recent){

products.slice(0,5).forEach(p=>{
recent.appendChild(createCard(p))
})

}

}

>>>>>>> e6ee3c28bbdeaf1bfe826ea47d91c4d83d2ca185

function createCard(p){

const card=document.createElement("div")
card.className="card"

<<<<<<< HEAD
card.onclick=()=>{
window.location.href=`product.html?id=${p.id}`
}

card.innerHTML=`

=======
const msg=encodeURIComponent(
`Hello,
I want to order:

Part: ${p.name}
Price: ₹${p.price}`
)

card.innerHTML=`
>>>>>>> e6ee3c28bbdeaf1bfe826ea47d91c4d83d2ca185
<img src="${p.image}">

<div class="price">₹${p.price}</div>

<h3>${p.name}</h3>

<<<<<<< HEAD
<div class="vehicle">${p.vehicle||""}</div>

<div>Brand: ${p.brand||""}</div>

<a class="button">Order</a>

=======
<div class="vehicle">${p.vehicle || ""}</div>

<div>Brand: ${p.brand || ""}</div>

<a class="button" href="https://wa.me/919344898473?text=${msg}" target="_blank">
Order
</a>
>>>>>>> e6ee3c28bbdeaf1bfe826ea47d91c4d83d2ca185
`

return card
}


<<<<<<< HEAD
/* search */
=======
/* search redirect */
>>>>>>> e6ee3c28bbdeaf1bfe826ea47d91c4d83d2ca185

const search=document.getElementById("search")

if(search){

search.addEventListener("keypress",(e)=>{

if(e.key==="Enter"){

<<<<<<< HEAD
const q=search.value.toLowerCase()

=======
const q=search.value
>>>>>>> e6ee3c28bbdeaf1bfe826ea47d91c4d83d2ca185
window.location.href=`products.html?q=${q}`

}

})

}


loadProducts()