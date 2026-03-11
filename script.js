async function loadProducts(){

const res = await fetch("/products")
const products = await res.json()

const top=document.getElementById("topselling")
const recent=document.getElementById("recently")

if(top){

products.slice(0,5).forEach(p=>{
top.appendChild(createCard(p))
})

}

if(recent){

products.slice(0,5).forEach(p=>{
recent.appendChild(createCard(p))
})

}

}


function createCard(p){

const card=document.createElement("div")
card.className="card"

const msg=encodeURIComponent(
`Hello,
I want to order:

Part: ${p.name}
Price: ₹${p.price}`
)

card.innerHTML=`
<img src="${p.image}">

<div class="price">₹${p.price}</div>

<h3>${p.name}</h3>

<div class="vehicle">${p.vehicle || ""}</div>

<div>Brand: ${p.brand || ""}</div>

<a class="button" href="https://wa.me/919344898473?text=${msg}" target="_blank">
Order
</a>
`

return card
}


/* search redirect */

const search=document.getElementById("search")

if(search){

search.addEventListener("keypress",(e)=>{

if(e.key==="Enter"){

const q=search.value
window.location.href=`products.html?q=${q}`

}

})

}


loadProducts()