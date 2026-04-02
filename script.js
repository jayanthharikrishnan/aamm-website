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

})

}


function createCard(p){

const card=document.createElement("div")
card.className="card"

card.onclick=()=>{
window.location.href=`product.html?id=${p.id}`
}

card.innerHTML=`

<img src="${p.image}">

<div class="price">₹${p.price}</div>

<h3>${p.name}</h3>

<div class="vehicle">${p.vehicle||""}</div>

<div>Brand: ${p.brand||""}</div>

<a class="button">Order</a>

`

return card
}


/* search */

const search=document.getElementById("search")

if(search){

search.addEventListener("keypress",(e)=>{

if(e.key==="Enter"){

const q=search.value.toLowerCase()

window.location.href=`products.html?q=${q}`

}

})

}


loadProducts()