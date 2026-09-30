const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const products = [
  {id:"p1", name:"Premium Gömlek", category:"Üst Giyim", price:2499, oldPrice:2899, image:"/images/premium-gomlek.png", badge:"Çok Satan", desc:"Keskin kesim, yumuşak dokulu premium gömlek."},
  {id:"p2", name:"Premium Blazer Ceket", category:"Üst Giyim", price:4499, oldPrice:4999, image:"/images/premium-ceket.png", badge:"Yeni", desc:"Şehir stiline uyarlanmış modern blazer."},
  {id:"p3", name:"Premium Triko", category:"Üst Giyim", price:2699, oldPrice:2999, image:"/images/premium-triko.png", badge:"Yeni", desc:"Minimal dokulu, zamansız siyah triko."},
  {id:"p4", name:"Basic Slim Fit Gömlek", category:"Üst Giyim", price:2299, oldPrice:2599, image:"/images/basic-slim-fit-gomlek.png", badge:"Favori", desc:"Günlük ve smart-casual kombinler için slim fit gömlek."},
  {id:"p5", name:"Premium Kumaş Pantolon", category:"Alt Giyim", price:2999, oldPrice:3399, image:"/images/premium-kumas-pantolon.png", badge:"Yeni", desc:"Düz kesim, şehir hayatına uygun premium kumaş pantolon."},
  {id:"p6", name:"Klasik Gömlek", category:"Üst Giyim", price:2199, oldPrice:2499, image:"/images/klasik-gomlek.png", badge:"Klasik", desc:"Her gün kullanılabilecek temiz ve zamansız gömlek."}
];

let orders = [];

app.get("/api/products", (req,res)=>res.json(products));

app.post("/api/orders", (req,res)=>{
  const {customer, items, total, payment} = req.body || {};
  if(!customer?.name || !customer?.phone || !customer?.address || !Array.isArray(items) || !items.length){
    return res.status(400).json({error:"Eksik sipariş bilgisi."});
  }
  const order = {
    id: "LV" + Date.now().toString().slice(-8),
    customer, items, total: Number(total) || 0,
    payment: payment || "Kapıda Ödeme",
    status: "Hazırlanıyor",
    createdAt: new Date().toISOString()
  };
  orders.unshift(order);
  res.status(201).json(order);
});

app.get("/api/orders/:id", (req,res)=>{
  const order = orders.find(o=>o.id === req.params.id);
  if(!order) return res.status(404).json({error:"Sipariş bulunamadı."});
  res.json(order);
});

app.post("/api/orders/:id/cancel", (req,res)=>{
  const order = orders.find(o=>o.id === req.params.id);
  if(!order) return res.status(404).json({error:"Sipariş bulunamadı."});
  if(["Kargoda","Teslim Edildi","İptal Edildi"].includes(order.status)){
    return res.status(400).json({error:"Bu sipariş artık iptal edilemez."});
  }
  order.status = "İptal Edildi";
  res.json(order);
});

app.get("*", (req,res)=>{
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", ()=>console.log(`LÉVAREN running on port ${PORT}`));
