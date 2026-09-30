const express=require("express");
const path=require("path");
const fs=require("fs");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const app=express();
const PORT=process.env.PORT||3000;
const SECRET=process.env.JWT_SECRET||"levaren-change-this-secret";
const DB=path.join(__dirname,"data");
const USERS=path.join(DB,"users.json");
const ORDERS=path.join(DB,"orders.json");
fs.mkdirSync(DB,{recursive:true});
for(const f of [USERS,ORDERS]) if(!fs.existsSync(f)) fs.writeFileSync(f,"[]");
app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));
const read=f=>JSON.parse(fs.readFileSync(f,"utf8"));
const write=(f,d)=>fs.writeFileSync(f,JSON.stringify(d,null,2));
function auth(req,res,next){
  const h=req.headers.authorization||"";
  try{req.user=jwt.verify(h.replace(/^Bearer\s+/,""),SECRET);next()}
  catch(e){res.status(401).json({error:"Oturum gerekli."})}
}
app.post("/api/register",async(req,res)=>{
  const {name,email,password}=req.body||{};
  if(!name||!email||!password||password.length<6)return res.status(400).json({error:"Ad, e-posta ve en az 6 karakterli şifre gerekli."});
  const users=read(USERS), mail=email.trim().toLowerCase();
  if(users.some(u=>u.email===mail))return res.status(409).json({error:"Bu e-posta zaten kayıtlı."});
  const user={id:crypto.randomUUID?.()||Date.now().toString(),name:name.trim(),email:mail,password:await bcrypt.hash(password,10),phone:"",addresses:[],settings:{theme:"system",notifications:true}};
  users.push(user);write(USERS,users);
  const token=jwt.sign({id:user.id},SECRET,{expiresIn:"30d"});
  res.json({token,user:{id:user.id,name:user.name,email:user.email,phone:user.phone,addresses:user.addresses,settings:user.settings}});
});
app.post("/api/login",async(req,res)=>{
  const {email,password}=req.body||{}, users=read(USERS), user=users.find(u=>u.email===String(email||"").trim().toLowerCase());
  if(!user||!(await bcrypt.compare(password||"",user.password)))return res.status(401).json({error:"E-posta veya şifre hatalı."});
  const token=jwt.sign({id:user.id},SECRET,{expiresIn:"30d"});
  res.json({token,user:{id:user.id,name:user.name,email:user.email,phone:user.phone,addresses:user.addresses,settings:user.settings}});
});
app.get("/api/me",auth,(req,res)=>{
  const u=read(USERS).find(x=>x.id===req.user.id); if(!u)return res.status(404).json({error:"Kullanıcı bulunamadı."});
  res.json({id:u.id,name:u.name,email:u.email,phone:u.phone,addresses:u.addresses,settings:u.settings});
});
app.put("/api/me",auth,(req,res)=>{
  const users=read(USERS), i=users.findIndex(x=>x.id===req.user.id); if(i<0)return res.status(404).json({error:"Kullanıcı bulunamadı."});
  const {name,phone,settings,addresses}=req.body||{};
  if(name!==undefined)users[i].name=String(name).trim();
  if(phone!==undefined)users[i].phone=String(phone).trim();
  if(settings)users[i].settings={...users[i].settings,...settings};
  if(Array.isArray(addresses))users[i].addresses=addresses;
  write(USERS,users);
  const u=users[i];res.json({id:u.id,name:u.name,email:u.email,phone:u.phone,addresses:u.addresses,settings:u.settings});
});
app.post("/api/change-password",auth,async(req,res)=>{
  const {currentPassword,newPassword}=req.body||{}, users=read(USERS), i=users.findIndex(x=>x.id===req.user.id);
  if(i<0||!(await bcrypt.compare(currentPassword||"",users[i].password)))return res.status(400).json({error:"Mevcut şifre hatalı."});
  if(!newPassword||newPassword.length<6)return res.status(400).json({error:"Yeni şifre en az 6 karakter olmalı."});
  users[i].password=await bcrypt.hash(newPassword,10);write(USERS,users);res.json({ok:true});
});
app.delete("/api/me",auth,(req,res)=>{
  const users=read(USERS).filter(x=>x.id!==req.user.id);write(USERS,users);
  const orders=read(ORDERS).filter(x=>x.userId!==req.user.id);write(ORDERS,orders);res.json({ok:true});
});
app.get("/api/orders",auth,(req,res)=>res.json(read(ORDERS).filter(o=>o.userId===req.user.id).sort((a,b)=>b.createdAt-a.createdAt)));
app.post("/api/orders",auth,(req,res)=>{
  const orders=read(ORDERS), o={id:"LV-"+Date.now().toString(36).toUpperCase(),userId:req.user.id,items:req.body.items||[],total:req.body.total||0,address:req.body.address||"",status:"Hazırlanıyor",createdAt:Date.now()};
  orders.push(o);write(ORDERS,orders);res.json(o);
});
app.post("/api/orders/:id/cancel",auth,(req,res)=>{
  const orders=read(ORDERS),i=orders.findIndex(o=>o.id===req.params.id&&o.userId===req.user.id);
  if(i<0)return res.status(404).json({error:"Sipariş bulunamadı."});
  if(orders[i].status!=="Hazırlanıyor")return res.status(400).json({error:"Bu sipariş artık iptal edilemez."});
  orders[i].status="İptal edildi";write(ORDERS,orders);res.json(orders[i]);
});
app.post("/api/orders/:id/return",auth,(req,res)=>{
  const orders=read(ORDERS),i=orders.findIndex(o=>o.id===req.params.id&&o.userId===req.user.id);
  if(i<0)return res.status(404).json({error:"Sipariş bulunamadı."});
  orders[i].status="İade talebi";write(ORDERS,orders);res.json(orders[i]);
});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log("LÉVAREN V3 running on "+PORT));
