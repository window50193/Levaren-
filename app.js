const state={
  products:[],
  cart:JSON.parse(localStorage.getItem("levaren_cart")||"[]"),
  orders:JSON.parse(localStorage.getItem("levaren_orders")||"[]"),
  filter:"Tümü"
};
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY",maximumFractionDigits:0}).format(n);

function save(){localStorage.setItem("levaren_cart",JSON.stringify(state.cart));localStorage.setItem("levaren_orders",JSON.stringify(state.orders));}
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove("show"),2200)}
function openDrawer(id,overlay){$(id).classList.add("show");$(overlay).classList.add("show");document.body.style.overflow="hidden"}
function closeDrawer(id,overlay){$(id).classList.remove("show");$(overlay).classList.remove("show");document.body.style.overflow=""}

async function init(){
  const r=await fetch("/api/products"); state.products=await r.json();
  renderProducts(); renderCart(); observe();
}
function renderProducts(){
  const list=state.products.filter(p=>state.filter==="Tümü"||p.category===state.filter);
  $("#productGrid").innerHTML=list.map(p=>`
    <article class="product-card" data-id="${p.id}">
      <div class="product-image"><img loading="lazy" src="${p.image}" alt="${p.name}"><span class="badge">${p.badge}</span></div>
      <div class="product-info"><div><div class="product-name">${p.name}</div><div class="product-cat">${p.category} · 3 renk</div></div><div class="price">${money(p.price)}<br><span class="old-price">${money(p.oldPrice)}</span></div></div>
    </article>`).join("");
  $$(".product-card").forEach(c=>c.addEventListener("click",()=>showProduct(c.dataset.id)));
}
function showProduct(id){
  const p=state.products.find(x=>x.id===id); if(!p)return;
  $("#productDetail").innerHTML=`
    <img src="${p.image}" alt="${p.name}">
    <p class="eyebrow">${p.category}</p><h2 class="detail-title">${p.name}</h2>
    <p class="detail-desc">${p.desc}</p>
    <div class="detail-price">${money(p.price)}</div>
    <button class="btn dark full" id="detailAdd">Sepete ekle →</button>`;
  $("#detailAdd").onclick=()=>{addToCart(p.id);closeDrawer("#productDrawer","#productOverlay")};
  openDrawer("#productDrawer","#productOverlay");
}
function addToCart(id){
  const found=state.cart.find(x=>x.id===id);
  if(found)found.qty++; else state.cart.push({id,qty:1});
  save();renderCart();toast("Ürün sepete eklendi.");
}
function renderCart(){
  const total=state.cart.reduce((s,i)=>s+(state.products.find(p=>p.id===i.id)?.price||0)*i.qty,0);
  $("#cartCount").textContent=state.cart.reduce((s,i)=>s+i.qty,0);
  $("#cartTotal").textContent=money(total); $("#checkoutTotal").textContent=money(total);
  if(!state.cart.length){$("#cartItems").innerHTML='<div class="empty"><strong>Sepetin boş.</strong><span>Seçtiğin parçalar burada görünecek.</span></div>';return}
  $("#cartItems").innerHTML=state.cart.map(i=>{const p=state.products.find(p=>p.id===i.id);return `
    <div class="cart-item">
      <img src="${p.image}" alt="${p.name}">
      <div><h4>${p.name}</h4><p>${money(p.price)}</p>
      <div class="qty"><button data-act="minus" data-id="${p.id}">−</button><b>${i.qty}</b><button data-act="plus" data-id="${p.id}">+</button></div>
      <span class="remove" data-act="remove" data-id="${p.id}">Ürünü kaldır</span></div>
      <strong>${money(p.price*i.qty)}</strong>
    </div>`}).join("");
  $$("#cartItems [data-act]").forEach(b=>b.onclick=()=>{
    const id=b.dataset.id, act=b.dataset.act, item=state.cart.find(x=>x.id===id);
    if(act==="plus")item.qty++;
    if(act==="minus")item.qty--;
    if(act==="remove"||item.qty<=0)state.cart=state.cart.filter(x=>x.id!==id);
    save();renderCart();
  });
}
function showAccount(){
  const content=$("#accountContent");
  if(!state.orders.length){
    content.innerHTML='<p style="color:#777;line-height:1.7">Henüz siparişin yok. Ürünleri sepete ekleyip sipariş oluşturduğunda siparişlerin burada görünecek.</p>';
  }else{
    content.innerHTML=state.orders.map(o=>`
      <div class="order-card"><strong>${o.id} · ${o.status}</strong><small>${new Date(o.createdAt).toLocaleString("tr-TR")} · ${money(o.total)}</small>
      ${o.status!=="İptal Edildi"?`<button class="cancel-order" data-cancel="${o.id}">Siparişi iptal et</button>`:""}
      </div>`).join("");
    $$("[data-cancel]").forEach(b=>b.onclick=()=>cancelOrder(b.dataset.cancel));
  }
  $("#accountModal").classList.add("show");
}
async function cancelOrder(id){
  if(!confirm("Bu siparişi iptal etmek istediğine emin misin?"))return;
  try{
    const r=await fetch("/api/orders/"+id+"/cancel",{method:"POST"});
    const data=await r.json(); if(!r.ok)throw new Error(data.error);
    const local=state.orders.find(o=>o.id===id); if(local)local.status=data.status; save();showAccount();toast("Sipariş iptal edildi.");
  }catch(e){toast(e.message||"İptal sırasında hata oluştu.")}
}
$("#cartOpen").onclick=()=>openDrawer("#cartDrawer","#cartOverlay");
$("#cartOverlay").onclick=()=>closeDrawer("#cartDrawer","#cartOverlay");
$("#productOverlay").onclick=()=>closeDrawer("#productDrawer","#productOverlay");
$("#clearCart").onclick=()=>{if(state.cart.length&&confirm("Sepetteki tüm ürünler silinsin mi?")){state.cart=[];save();renderCart();toast("Sepet temizlendi.")}};
$("#checkoutBtn").onclick=()=>{if(!state.cart.length)return toast("Önce sepete ürün ekle.");$("#checkoutModal").classList.add("show");$("#cartDrawer").classList.remove("show");$("#cartOverlay").classList.remove("show")};
$("#checkoutForm").onsubmit=async e=>{
  e.preventDefault();
  const f=new FormData(e.target), total=state.cart.reduce((s,i)=>s+(state.products.find(p=>p.id===i.id)?.price||0)*i.qty,0);
  const payload={customer:{name:f.get("name"),phone:f.get("phone"),address:f.get("address")},items:state.cart.map(i=>{const p=state.products.find(p=>p.id===i.id);return {id:p.id,name:p.name,qty:i.qty,price:p.price}}),total,payment:f.get("payment")};
  const btn=e.target.querySelector("button[type=submit]");btn.disabled=true;btn.textContent="Sipariş oluşturuluyor…";
  try{
    const r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data=await r.json();if(!r.ok)throw new Error(data.error);
    state.orders.unshift(data);state.cart=[];save();renderCart();e.target.reset();$("#checkoutModal").classList.remove("show");
    toast("Siparişin oluşturuldu: "+data.id);showAccount();
  }catch(err){toast(err.message||"Sipariş oluşturulamadı.")}finally{btn.disabled=false;btn.textContent="Siparişi oluştur"}
};
$$("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).classList.remove("show"));
$$("[data-open]").forEach(b=>b.onclick=()=>{if(b.dataset.open==="account")showAccount()});
$$(".filter").forEach(b=>b.onclick=()=>{$$(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.filter=b.dataset.filter;renderProducts()});
$("#menuOpen").onclick=()=>$("#mobileMenu").classList.add("show");$("#menuClose").onclick=()=>$("#mobileMenu").classList.remove("show");
$$(".mobile-menu a").forEach(a=>a.onclick=()=>$("#mobileMenu").classList.remove("show"));
new MutationObserver(()=>{}); // keep app extensible

function observe(){
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add("visible")}),{threshold:.08});
  $$(".reveal").forEach(x=>io.observe(x));
}
init();
