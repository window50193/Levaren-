const express=require('express');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');

const app=express();
const PORT=Number(process.env.PORT)||3000;
const SECRET=process.env.JWT_SECRET||'levaren-change-this-secret';
const ADMIN_EMAIL=(process.env.ADMIN_EMAIL||'admin@levaren.local').trim().toLowerCase();
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'change-me-now';
const DB=path.join(__dirname,'data');
const USERS=path.join(DB,'users.json');
const ORDERS=path.join(DB,'orders.json');
const PRODUCTS=path.join(DB,'products.json');
const COUPONS=path.join(DB,'coupons.json');
const SITE=path.join(DB,'site.json');
fs.mkdirSync(DB,{recursive:true});
for(const f of [USERS,ORDERS,PRODUCTS,COUPONS,SITE]) if(!fs.existsSync(f)) fs.writeFileSync(f,'[]');
app.use(express.json({limit:'2mb'}));
app.use(express.static(path.join(__dirname,'public')));
const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return[]}};
const write=(f,d)=>fs.writeFileSync(f,JSON.stringify(d,null,2));
const now=()=>Date.now();
const pub=u=>({id:u.id,name:u.name,email:u.email,phone:u.phone||'',addresses:u.addresses||[],settings:u.settings||{theme:'system',notifications:true},active:u.active!==false,createdAt:u.createdAt});
const orderStatuses=['Yeni','Hazırlanıyor','Kargoya verildi','Teslim edildi','İptal edildi','İade talebi','İade tamamlandı'];
const paymentStatuses=['Ödeme bekliyor','Ödendi','İade edildi'];

function sign(payload,expiresIn='30d'){return jwt.sign(payload,SECRET,{expiresIn});}
function auth(req,res,next){const t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');try{const p=jwt.verify(t,SECRET);if(p.role==='admin') return res.status(403).json({error:'Müşteri hesabı gerekli.'});req.user=p;next()}catch{res.status(401).json({error:'Oturum gerekli.'})}}
function adminAuth(req,res,next){const t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');try{const p=jwt.verify(t,SECRET);if(p.role!=='admin')throw new Error('role');req.admin=p;next()}catch{res.status(401).json({error:'Yönetici oturumu gerekli.'})}}
function publicProduct(p){return p}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'levaren'}));
app.get('/api/catalog',(_req,res)=>res.json({products:read(PRODUCTS),coupons:read(COUPONS).filter(c=>c.active!==false),site:read(SITE)}));

app.post('/api/register',async(req,res)=>{
  const{name,email,password}=req.body||{};
  if(!name?.trim()||!email?.trim()||!password||password.length<6)return res.status(400).json({error:'Ad, e-posta ve en az 6 karakterli şifre gerekli.'});
  const users=read(USERS),mail=email.trim().toLowerCase();
  if(users.some(u=>u.email===mail))return res.status(409).json({error:'Bu e-posta zaten kayıtlı.'});
  const u={id:crypto.randomUUID(),name:name.trim(),email:mail,password:await bcrypt.hash(password,10),phone:'',addresses:[],settings:{theme:'system',notifications:true},active:true,createdAt:now()};
  users.push(u);write(USERS,users);res.json({token:sign({id:u.id}),user:pub(u)});
});
app.post('/api/login',async(req,res)=>{
  const users=read(USERS),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||''),u=users.find(x=>x.email===email);
  if(!u||!(await bcrypt.compare(password,u.password)))return res.status(401).json({error:'E-posta veya şifre hatalı.'});
  if(u.active===false)return res.status(403).json({error:'Hesabın yönetici tarafından pasifleştirildi.'});
  res.json({token:sign({id:u.id}),user:pub(u)});
});
app.post('/api/admin/login',async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(email!==ADMIN_EMAIL||password!==ADMIN_PASSWORD)return res.status(401).json({error:'Yönetici e-postası veya şifresi hatalı.'});
  res.json({token:sign({role:'admin',email},'12h'),admin:{email,role:'admin'}});
});
app.get('/api/me',auth,(req,res)=>{const u=read(USERS).find(x=>x.id===req.user.id);u?res.json(pub(u)):res.status(404).json({error:'Kullanıcı bulunamadı.'})});
app.put('/api/me',auth,(req,res)=>{const users=read(USERS),i=users.findIndex(x=>x.id===req.user.id);if(i<0)return res.status(404).json({error:'Kullanıcı bulunamadı.'});const{name,phone,settings,addresses}=req.body||{};if(name!==undefined)users[i].name=String(name).trim();if(phone!==undefined)users[i].phone=String(phone).trim();if(settings)users[i].settings={...users[i].settings,...settings};if(Array.isArray(addresses))users[i].addresses=addresses.map(String);write(USERS,users);res.json(pub(users[i]))});
app.post('/api/change-password',auth,async(req,res)=>{const{currentPassword,newPassword}=req.body||{};if(!newPassword||newPassword.length<6)return res.status(400).json({error:'Yeni şifre en az 6 karakter olmalı.'});const users=read(USERS),i=users.findIndex(x=>x.id===req.user.id);if(i<0||!(await bcrypt.compare(currentPassword||'',users[i].password)))return res.status(400).json({error:'Mevcut şifre hatalı.'});users[i].password=await bcrypt.hash(newPassword,10);write(USERS,users);res.json({ok:true})});

app.get('/api/orders',auth,(req,res)=>res.json(read(ORDERS).filter(o=>o.userId===req.user.id).sort((a,b)=>b.createdAt-a.createdAt)));
app.post('/api/orders',auth,(req,res)=>{
  const{items,total,address,coupon}=req.body||{};
  if(!Array.isArray(items)||!items.length||!address?.trim())return res.status(400).json({error:'Ürünler ve teslimat adresi gerekli.'});
  const users=read(USERS),u=users.find(x=>x.id===req.user.id); if(!u)return res.status(401).json({error:'Kullanıcı bulunamadı.'});
  const products=read(PRODUCTS),orders=read(ORDERS),coupons=read(COUPONS);
  const safeItems=items.map(x=>{const p=products.find(y=>y.id===Number(x.id));return p?{id:p.id,name:p.name,price:p.price,qty:Math.max(1,Number(x.qty)||1),size:x.size||'',image:p.image}:null}).filter(Boolean);
  if(!safeItems.length)return res.status(400).json({error:'Geçerli ürün bulunamadı.'});
  const subtotal=safeItems.reduce((s,x)=>s+x.price*x.qty,0);let discount=0;let couponCode='';
  if(coupon){const c=coupons.find(x=>x.code===String(coupon).toUpperCase()&&x.active!==false);if(c&&subtotal>=Number(c.min||0)&&(Number(c.usageLimit||0)===0||Number(c.usedCount||0)<Number(c.usageLimit))) {discount=c.type==='percent'?subtotal*Number(c.value)/100:Number(c.value);couponCode=c.code;c.usedCount=Number(c.usedCount||0)+1;write(COUPONS,coupons);}}
  const shipping=Math.max(0,subtotal-discount)>=Number(read(SITE).freeShippingThreshold||1500)?0:Number(read(SITE).shippingFee||59.9);
  const calculatedTotal=Math.max(0,subtotal-discount+shipping);
  const o={id:'LV-'+Date.now().toString(36).toUpperCase(),userId:u.id,customer:{name:u.name,email:u.email,phone:u.phone||''},items:safeItems,subtotal,discount,shipping,total:calculatedTotal,address:address.trim(),coupon:couponCode,status:'Yeni',paymentStatus:'Ödeme bekliyor',trackingNumber:'',shippingCompany:'',customerNote:'',adminNote:'',createdAt:now(),updatedAt:now()};
  orders.push(o);write(ORDERS,orders);res.status(201).json(o);
});
app.post('/api/orders/:id/cancel',auth,(req,res)=>{const a=read(ORDERS),i=a.findIndex(o=>o.id===req.params.id&&o.userId===req.user.id);if(i<0)return res.status(404).json({error:'Sipariş bulunamadı.'});if(!['Yeni','Hazırlanıyor'].includes(a[i].status))return res.status(400).json({error:'Bu sipariş artık iptal edilemez.'});a[i].status='İptal edildi';a[i].updatedAt=now();write(ORDERS,a);res.json(a[i])});
app.post('/api/orders/:id/return',auth,(req,res)=>{const a=read(ORDERS),i=a.findIndex(o=>o.id===req.params.id&&o.userId===req.user.id);if(i<0)return res.status(404).json({error:'Sipariş bulunamadı.'});if(a[i].status!=='Teslim edildi')return res.status(400).json({error:'İade talebi yalnızca teslim edilen siparişler için açılabilir.'});a[i].status='İade talebi';a[i].updatedAt=now();write(ORDERS,a);res.json(a[i])});
app.delete('/api/me',auth,(req,res)=>{write(USERS,read(USERS).filter(u=>u.id!==req.user.id));write(ORDERS,read(ORDERS).filter(o=>o.userId!==req.user.id));res.json({ok:true})});

// ADMIN: dashboard
app.get('/api/admin/stats',adminAuth,(req,res)=>{
  const orders=read(ORDERS),users=read(USERS),products=read(PRODUCTS),today=new Date();
  const dayStart=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime();
  const monthStart=new Date(today.getFullYear(),today.getMonth(),1).getTime();
  const valid=o=>!['İptal edildi','İade tamamlandı'].includes(o.status);
  const revenue=orders.filter(valid).reduce((s,o)=>s+Number(o.total||0),0),todayRevenue=orders.filter(o=>o.createdAt>=dayStart&&valid(o)).reduce((s,o)=>s+Number(o.total||0),0),monthRevenue=orders.filter(o=>o.createdAt>=monthStart&&valid(o)).reduce((s,o)=>s+Number(o.total||0),0);
  const counts=Object.fromEntries(orderStatuses.map(s=>[s,orders.filter(o=>o.status===s).length]));
  const top={};orders.filter(valid).forEach(o=>(o.items||[]).forEach(i=>{top[i.name]=(top[i.name]||0)+Number(i.qty||0)}));
  const topProducts=Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,qty])=>({name,qty}));
  const last30=Array.from({length:30},(_,i)=>{const d=new Date(dayStart-(29-i)*86400000);const key=d.toISOString().slice(0,10);const value=orders.filter(o=>new Date(o.createdAt).toISOString().slice(0,10)===key&&valid(o)).reduce((s,o)=>s+Number(o.total||0),0);return{date:key,revenue:value}});
  res.json({kpis:{revenue,todayRevenue,monthRevenue,orders:orders.length,customers:users.length,products:products.length,averageOrder:orders.filter(valid).length?revenue/orders.filter(valid).length:0},statusCounts:counts,topProducts,last30});
});
app.get('/api/admin/orders',adminAuth,(req,res)=>{
  let a=read(ORDERS).sort((x,y)=>y.createdAt-x.createdAt);const q=String(req.query.q||'').trim().toLowerCase(),status=String(req.query.status||'');
  if(q)a=a.filter(o=>[o.id,o.customer?.name,o.customer?.email,o.trackingNumber].some(v=>String(v||'').toLowerCase().includes(q)));
  if(status)a=a.filter(o=>o.status===status);
  res.json(a);
});
app.get('/api/admin/orders/:id',adminAuth,(req,res)=>{const o=read(ORDERS).find(x=>x.id===req.params.id);o?res.json(o):res.status(404).json({error:'Sipariş bulunamadı.'})});
app.put('/api/admin/orders/:id',adminAuth,(req,res)=>{
  const a=read(ORDERS),i=a.findIndex(o=>o.id===req.params.id);if(i<0)return res.status(404).json({error:'Sipariş bulunamadı.'});
  const b=req.body||{};
  if(b.status!==undefined&&!orderStatuses.includes(b.status))return res.status(400).json({error:'Geçersiz sipariş durumu.'});
  if(b.paymentStatus!==undefined&&!paymentStatuses.includes(b.paymentStatus))return res.status(400).json({error:'Geçersiz ödeme durumu.'});
  for(const k of ['status','paymentStatus','trackingNumber','shippingCompany','customerNote','adminNote'])if(b[k]!==undefined)a[i][k]=String(b[k]);
  a[i].updatedAt=now();write(ORDERS,a);res.json(a[i]);
});
app.get('/api/admin/users',adminAuth,(req,res)=>{const q=String(req.query.q||'').trim().toLowerCase();let u=read(USERS).map(pub);if(q)u=u.filter(x=>(x.name+' '+x.email+' '+x.phone).toLowerCase().includes(q));res.json(u.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))) });
app.get('/api/admin/users/:id',adminAuth,(req,res)=>{const u=read(USERS).find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Müşteri bulunamadı.'});const orders=read(ORDERS).filter(o=>o.userId===u.id).sort((a,b)=>b.createdAt-a.createdAt);res.json({user:pub(u),orders})});
app.put('/api/admin/users/:id',adminAuth,(req,res)=>{const a=read(USERS),i=a.findIndex(u=>u.id===req.params.id);if(i<0)return res.status(404).json({error:'Müşteri bulunamadı.'});if(req.body.active!==undefined)a[i].active=Boolean(req.body.active);if(req.body.name!==undefined)a[i].name=String(req.body.name).trim();if(req.body.phone!==undefined)a[i].phone=String(req.body.phone).trim();write(USERS,a);res.json(pub(a[i]))});

app.get('/api/admin/products',adminAuth,(_req,res)=>res.json(read(PRODUCTS)));
app.post('/api/admin/products',adminAuth,(req,res)=>{const a=read(PRODUCTS),b=req.body||{};if(!b.name||!b.cat||!Number.isFinite(Number(b.price)))return res.status(400).json({error:'Ürün adı, kategori ve fiyat gerekli.'});const p={id:Math.max(0,...a.map(x=>Number(x.id)||0))+1,name:String(b.name),cat:String(b.cat),price:Number(b.price),old:Number(b.old||b.price),image:String(b.image||''),new:Boolean(b.new),sizes:Array.isArray(b.sizes)?b.sizes.map(String):['S','M','L','XL'],desc:String(b.desc||''),stock:Math.max(0,Number(b.stock||0))};a.push(p);write(PRODUCTS,a);res.status(201).json(p)});
app.put('/api/admin/products/:id',adminAuth,(req,res)=>{const a=read(PRODUCTS),i=a.findIndex(p=>p.id===Number(req.params.id));if(i<0)return res.status(404).json({error:'Ürün bulunamadı.'});const b=req.body||{};for(const k of ['name','cat','image','desc'])if(b[k]!==undefined)a[i][k]=String(b[k]);for(const k of ['price','old','stock'])if(b[k]!==undefined)a[i][k]=Number(b[k]);if(b.new!==undefined)a[i].new=Boolean(b.new);if(Array.isArray(b.sizes))a[i].sizes=b.sizes.map(String);write(PRODUCTS,a);res.json(a[i])});
app.delete('/api/admin/products/:id',adminAuth,(req,res)=>{const a=read(PRODUCTS),n=a.filter(p=>p.id!==Number(req.params.id));if(n.length===a.length)return res.status(404).json({error:'Ürün bulunamadı.'});write(PRODUCTS,n);res.json({ok:true})});

app.get('/api/admin/coupons',adminAuth,(_req,res)=>res.json(read(COUPONS)));
app.post('/api/admin/coupons',adminAuth,(req,res)=>{const a=read(COUPONS),b=req.body||{},code=String(b.code||'').trim().toUpperCase();if(!code||!Number(b.value))return res.status(400).json({error:'Kod ve indirim değeri gerekli.'});if(a.some(c=>c.code===code))return res.status(409).json({error:'Bu kod zaten var.'});const c={code,type:b.type==='fixed'?'fixed':'percent',value:Number(b.value),min:Number(b.min||0),active:b.active!==false,usageLimit:Number(b.usageLimit||0),usedCount:0};a.push(c);write(COUPONS,a);res.status(201).json(c)});
app.put('/api/admin/coupons/:code',adminAuth,(req,res)=>{const a=read(COUPONS),i=a.findIndex(c=>c.code===String(req.params.code).toUpperCase());if(i<0)return res.status(404).json({error:'Kupon bulunamadı.'});const b=req.body||{};for(const k of ['value','min','usageLimit'])if(b[k]!==undefined)a[i][k]=Number(b[k]);if(b.type!==undefined)a[i].type=b.type==='fixed'?'fixed':'percent';if(b.active!==undefined)a[i].active=Boolean(b.active);write(COUPONS,a);res.json(a[i])});
app.delete('/api/admin/coupons/:code',adminAuth,(req,res)=>{const a=read(COUPONS),n=a.filter(c=>c.code!==String(req.params.code).toUpperCase());if(n.length===a.length)return res.status(404).json({error:'Kupon bulunamadı.'});write(COUPONS,n);res.json({ok:true})});

app.get('/api/admin/site',adminAuth,(_req,res)=>res.json(read(SITE)));
app.put('/api/admin/site',adminAuth,(req,res)=>{const b=req.body||{};const s={...read(SITE),...b,shippingFee:Number(b.shippingFee??read(SITE).shippingFee),freeShippingThreshold:Number(b.freeShippingThreshold??read(SITE).freeShippingThreshold)};write(SITE,s);res.json(s)});
app.get('/api/admin/export/orders',adminAuth,(req,res)=>{const rows=read(ORDERS);const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const head=['Sipariş','Tarih','Müşteri','E-posta','Durum','Ödeme','Ara Toplam','İndirim','Kargo','Toplam','Kupon','Kargo Firması','Takip No','Adres'];const lines=[head.map(esc).join(',')];for(const o of rows)lines.push([o.id,new Date(o.createdAt).toLocaleString('tr-TR'),o.customer?.name,o.customer?.email,o.status,o.paymentStatus,o.subtotal,o.discount,o.shipping,o.total,o.coupon,o.shippingCompany,o.trackingNumber,o.address].map(esc).join(','));res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="levaren-siparisler.csv"');res.send('\ufeff'+lines.join('\n'))});

app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log('LÉVAREN running on '+PORT));
