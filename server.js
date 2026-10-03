const express=require('express');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');

const app=express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const PORT=Number(process.env.PORT)||3000;
const SECRET=process.env.JWT_SECRET||'levaren-change-this-secret';
const ADMIN_EMAIL=(process.env.ADMIN_EMAIL||'admin@levaren.local').trim().toLowerCase();
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'change-me-now';
const ADMIN_PASSWORD_HASH=String(process.env.ADMIN_PASSWORD_HASH||'').trim();
const DB=path.join(__dirname,'data');
const USERS=path.join(DB,'users.json');
const ORDERS=path.join(DB,'orders.json');
const PRODUCTS=path.join(DB,'products.json');
const COUPONS=path.join(DB,'coupons.json');
const SITE=path.join(DB,'site.json');
const NOTIFICATIONS=path.join(DB,'notifications.json');
const RESEND_API_KEY=String(process.env.RESEND_API_KEY||'').trim();
const EMAIL_FROM=String(process.env.EMAIL_FROM||'LÉVAREN <onboarding@resend.dev>').trim();
const NETGSM_USERCODE=String(process.env.NETGSM_USERCODE||'').trim();
const NETGSM_PASSWORD=String(process.env.NETGSM_PASSWORD||'').trim();
const NETGSM_HEADER=String(process.env.NETGSM_HEADER||'LEVAREN').trim();
const PAYTR_MERCHANT_ID=String(process.env.PAYTR_MERCHANT_ID||'').trim();
const PAYTR_MERCHANT_KEY=String(process.env.PAYTR_MERCHANT_KEY||'').trim();
const PAYTR_MERCHANT_SALT=String(process.env.PAYTR_MERCHANT_SALT||'').trim();
const PAYTR_TEST_MODE=String(process.env.PAYTR_TEST_MODE??'1');
const PAYTR_DEBUG_ON=String(process.env.PAYTR_DEBUG_ON??'1');
const PAYTR_CONFIGURED=Boolean(PAYTR_MERCHANT_ID&&PAYTR_MERCHANT_KEY&&PAYTR_MERCHANT_SALT);
const BASE_URL=String(process.env.BASE_URL||'').trim().replace(/\/$/,'');
fs.mkdirSync(DB,{recursive:true});
for(const f of [USERS,ORDERS,PRODUCTS,COUPONS,SITE,NOTIFICATIONS]) if(!fs.existsSync(f)) fs.writeFileSync(f,'[]');
// Security hardening: keep the existing application behavior while adding defense-in-depth.
app.use(express.json({limit:'256kb'}));
app.use(express.urlencoded({extended:true,limit:'256kb',parameterLimit:100}));
const securityLimiter=new Map();
const authLimiter=new Map();
function clientIp(req){return String(req.ip||req.socket.remoteAddress||'unknown').replace(/^::ffff:/,'');}
function rateLimit({windowMs=60_000,max=120,keyPrefix='global',skipStatic=true}={}){return (req,res,next)=>{if(skipStatic&&!req.path.startsWith('/api/'))return next();const key=keyPrefix+':'+clientIp(req);const t=Date.now();const arr=(securityLimiter.get(key)||[]).filter(x=>t-x<windowMs);if(arr.length>=max){res.setHeader('Retry-After',String(Math.ceil(windowMs/1000)));return res.status(429).json({error:'Çok fazla istek. Lütfen daha sonra tekrar deneyin.'});}arr.push(t);securityLimiter.set(key,arr);next();};}
app.use(rateLimit({windowMs:60_000,max:180,keyPrefix:'api'}));
function scopedRateLimit(map,{windowMs=10*60*1000,max=8,keyPrefix='auth'}={}){return (req,res,next)=>{const email=String(req.body?.email||'').trim().toLowerCase();const key=`${keyPrefix}:${clientIp(req)}:${email}`;const t=Date.now();const arr=(map.get(key)||[]).filter(x=>t-x<windowMs);if(arr.length>=max){res.setHeader('Retry-After',String(Math.ceil(windowMs/1000)));return res.status(429).json({error:'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.'});}arr.push(t);map.set(key,arr);next();};}
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection','0');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(self)');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  if(req.secure)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://www.paytr.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' https://www.paytr.com; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://www.paytr.com");
  if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  if(req.path.startsWith('/admin'))res.setHeader('Cache-Control','no-store');
  next();
});
app.use(express.static(path.join(__dirname,'public'),{etag:true,maxAge:'1h'}));
const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return[]}};
const write=(f,d)=>fs.writeFileSync(f,JSON.stringify(d,null,2));
const now=()=>Date.now();
// Existing catalog migration: preserve all product data and add stock only when missing.
try{const ps=read(PRODUCTS);let changed=false;for(const p of ps){if(p.stock===undefined){p.stock=100;changed=true;}}if(changed)write(PRODUCTS,ps);}catch{}
const pub=u=>({id:u.id,name:u.name,email:u.email,phone:u.phone||'',addresses:u.addresses||[],settings:u.settings||{theme:'system',notifications:true},active:u.active!==false,createdAt:u.createdAt});
const orderStatuses=['Yeni','Hazırlanıyor','Kargoya verildi','Teslim edildi','İptal edildi','İade talebi','İade tamamlandı'];
const paymentStatuses=['Ödeme bekliyor','Ödendi','Ödeme başarısız','Ödeme başlatılamadı','İade edildi'];

function sign(payload,expiresIn='30d'){return jwt.sign(payload,SECRET,{expiresIn,issuer:'levaren',audience:'levaren-app'});}
function verifyToken(token){return jwt.verify(token,SECRET,{issuer:'levaren',audience:'levaren-app'});}
function auth(req,res,next){const t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');try{const p=verifyToken(t);if(p.role==='admin') return res.status(403).json({error:'Müşteri hesabı gerekli.'});req.user=p;next()}catch{res.status(401).json({error:'Oturum gerekli.'})}}
function adminAuth(req,res,next){const t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');try{const p=verifyToken(t);if(p.role!=='admin')throw new Error('role');req.admin=p;next()}catch{res.status(401).json({error:'Yönetici oturumu gerekli.'})}}
function publicProduct(p){return p}
const notificationRead=()=>read(NOTIFICATIONS);
const notificationWrite=(x)=>write(NOTIFICATIONS,x);
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
async function sendEmail(to,subject,html,text,idempotencyKey){
  if(!RESEND_API_KEY||!to) return {skipped:true,reason:'RESEND_API_KEY veya alıcı e-postası eksik'};
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey||crypto.randomUUID()},body:JSON.stringify({from:EMAIL_FROM,to:[to],subject,html,text})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.message||j.error||`E-posta gönderilemedi (${r.status})`);
  return {ok:true,id:j.id};
}
async function sendSms(to,msg,referenceID){
  if(!NETGSM_USERCODE||!NETGSM_PASSWORD||!to) return {skipped:true,reason:'Netgsm bilgileri veya telefon eksik'};
  const no=String(to).replace(/\D/g,'').replace(/^0/,'');
  const r=await fetch('https://api.netgsm.com.tr/sms/rest/v2/send',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(NETGSM_USERCODE+':'+NETGSM_PASSWORD).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({msgheader:NETGSM_HEADER,messages:[{msg,no}],encoding:'TR',iysfilter:'0',appname:'LÉVAREN',referansID:referenceID||crypto.randomUUID()})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.code&&j.code!=='00') throw new Error(j.description||j.code||`SMS gönderilemedi (${r.status})`);
  return {ok:true,jobid:j.jobid};
}
function notificationContent(order,event){
  const name=order.customer?.name||'Merhaba'; const id=order.id; const total=moneyTR(order.total);
  const map={
    order_created:['Siparişiniz alındı',`${name}, ${id} numaralı siparişiniz alındı. Toplam ${total}.`,`Siparişiniz alındı. Sipariş no: ${id}. Toplam: ${total}`],
    payment_success:['Ödemeniz başarıyla alındı',`${name}, ${id} numaralı siparişinizin ödemesi başarıyla alındı.`,`Ödemeniz alındı. Sipariş no: ${id}.`],
    payment_failed:['Ödeme başarısız',`${name}, ${id} numaralı siparişiniz için ödeme tamamlanamadı.`,`Ödeme başarısız. Sipariş no: ${id}.`],
    preparing:['Siparişiniz hazırlanıyor',`${name}, ${id} numaralı siparişiniz hazırlanmaya başladı.`,`Siparişiniz hazırlanıyor. Sipariş no: ${id}.`],
    shipped:['Siparişiniz kargoya verildi',`${name}, ${id} numaralı siparişiniz kargoya verildi.${order.shippingCompany?' '+order.shippingCompany+'':''}${order.trackingNumber?' Takip no: '+order.trackingNumber:''}`,`Siparişiniz kargoya verildi. ${order.trackingNumber?'Takip no: '+order.trackingNumber+'.':''}`],
    delivered:['Siparişiniz teslim edildi',`${name}, ${id} numaralı siparişiniz teslim edildi.`,`Siparişiniz teslim edildi. Sipariş no: ${id}.`],
    cancelled:['Siparişiniz iptal edildi',`${name}, ${id} numaralı siparişiniz iptal edildi.`,`Siparişiniz iptal edildi. Sipariş no: ${id}.`],
    returned:['İade durumunuz güncellendi',`${name}, ${id} numaralı siparişinizin iade durumu güncellendi.`,`İade durumunuz güncellendi. Sipariş no: ${id}.`]
  };
  const x=map[event]||map.order_created;
  const itemRows=(order.items||[]).map(i=>`<tr><td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(i.name)}${i.size?` (${escapeHtml(i.size)})`:''}${i.color?` / ${escapeHtml(i.color)}`:''}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${Number(i.qty||0)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(moneyTR(Number(i.price||0)*Number(i.qty||0)))}</td></tr>`).join('');
  const details=`<table style="width:100%;border-collapse:collapse;margin:20px 0"><thead><tr><th style="padding:8px;text-align:left;border-bottom:2px solid #222">Ürün</th><th style="padding:8px">Adet</th><th style="padding:8px;text-align:right">Tutar</th></tr></thead><tbody>${itemRows}</tbody></table>`;
  const totals=`<p><b>Ara toplam:</b> ${escapeHtml(moneyTR(order.subtotal))}<br><b>İndirim:</b> ${escapeHtml(moneyTR(order.discount))}<br><b>Kargo:</b> ${Number(order.shipping||0)===0?'Ücretsiz':escapeHtml(moneyTR(order.shipping))}<br><b>Genel toplam:</b> ${escapeHtml(total)}</p>`;
  const address=`<p><b>Teslimat adresi:</b><br>${escapeHtml(order.address||'')}</p>`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111"><h2>LÉVAREN</h2><p>${escapeHtml(x[1])}</p><p><b>Sipariş kodu:</b> ${escapeHtml(id)}</p>${details}${totals}${address}<p>Teşekkür ederiz.</p></div>`;
  const text=`${x[2]}\n\nSipariş kodu: ${id}\n${(order.items||[]).map(i=>`${i.name} x${i.qty}${i.size?` (${i.size})`:''}`).join('\n')}\n\nAra toplam: ${moneyTR(order.subtotal)}\nİndirim: ${moneyTR(order.discount)}\nKargo: ${Number(order.shipping||0)===0?'Ücretsiz':moneyTR(order.shipping)}\nGenel toplam: ${total}\nTeslimat adresi: ${order.address||''}`;
  return {subject:`LÉVAREN — ${x[0]} — ${id}`,html,text};
}
function moneyTR(n){return '₺'+Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});}
async function notifyOrder(order,event){
  const c=notificationContent(order,event); const baseKey=`${order.id}:${event}`; const out=[];
  // Transactional e-mail is the primary customer notification. SMS is intentionally not required.
  if(event!=='order_created' && order.customer?.email){
    try{const r=await sendEmail(order.customer.email,c.subject,c.html,c.text,`email:${baseKey}`);out.push({recipient:'customer',channel:'email',...r});}catch(e){out.push({recipient:'customer',channel:'email',error:e.message});}
  }
  // On successful payment, send a separate internal notification with the order code and payment details.
  if(event==='payment_success' && ADMIN_EMAIL){
    const adminSubject=`LÉVAREN — Yeni ödeme alındı — ${order.id}`;
    const adminText=[
      'Yeni bir ödeme alındı.',
      `Sipariş kodu: ${order.id}`,
      `Müşteri: ${order.customer?.name||''}`,
      `E-posta: ${order.customer?.email||''}`,
      `Telefon: ${order.customer?.phone||''}`,
      `Tutar: ${moneyTR(order.total)}`,
      `Ödeme: ${order.paymentStatus||'Ödendi'}`
    ].join('\n');
    const adminHtml=`<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>LÉVAREN — Yeni ödeme</h2><p><b>Sipariş kodu:</b> ${escapeHtml(order.id)}</p><p><b>Müşteri:</b> ${escapeHtml(order.customer?.name||'')}<br><b>E-posta:</b> ${escapeHtml(order.customer?.email||'')}<br><b>Telefon:</b> ${escapeHtml(order.customer?.phone||'')}<br><b>Tutar:</b> ${escapeHtml(moneyTR(order.total))}</p><p>Ödeme başarıyla doğrulandı.</p></div>`;
    try{const r=await sendEmail(ADMIN_EMAIL,adminSubject,adminHtml,adminText,`admin-email:${baseKey}`);out.push({recipient:'admin',channel:'email',...r});}catch(e){out.push({recipient:'admin',channel:'email',error:e.message});}
  }
  const logs=notificationRead();logs.push({id:crypto.randomUUID(),orderId:order.id,event,createdAt:now(),results:out});notificationWrite(logs.slice(-500));
  return out;
}
function commitStock(order){
  if(order.inventoryCommitted)return;
  const products=read(PRODUCTS);
  for(const item of order.items||[]){const p=products.find(x=>x.id===Number(item.id));if(p)p.stock=Math.max(0,Number(p.stock||0)-Number(item.qty||0));}
  write(PRODUCTS,products);order.inventoryCommitted=true;order.inventoryRestored=false;
}
function restoreStock(order){
  if(!order.inventoryCommitted||order.inventoryRestored)return;
  const products=read(PRODUCTS);
  for(const item of order.items||[]){const p=products.find(x=>x.id===Number(item.id));if(p)p.stock=Number(p.stock||0)+Number(item.qty||0);}
  write(PRODUCTS,products);order.inventoryRestored=true;
}
function useCouponOnce(order){
  if(!order.coupon||order.couponCommitted)return;
  const coupons=read(COUPONS),c=coupons.find(x=>x.code===order.coupon);if(c){c.usedCount=Number(c.usedCount||0)+1;write(COUPONS,coupons);}order.couponCommitted=true;
}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'levaren'}));
app.get('/api/catalog',(_req,res)=>res.json({products:read(PRODUCTS),coupons:read(COUPONS).filter(c=>c.active!==false),site:read(SITE)}));

app.post('/api/register',scopedRateLimit(authLimiter,{keyPrefix:'register',max:5}),async(req,res)=>{
  const{name,email,password}=req.body||{};
  if(!name?.trim()||!email?.trim()||!password||password.length<6)return res.status(400).json({error:'Ad, e-posta ve en az 6 karakterli şifre gerekli.'});
  const users=read(USERS),mail=email.trim().toLowerCase();
  if(users.some(u=>u.email===mail))return res.status(409).json({error:'Bu e-posta zaten kayıtlı.'});
  const u={id:crypto.randomUUID(),name:name.trim(),email:mail,password:await bcrypt.hash(password,10),phone:'',addresses:[],settings:{theme:'system',notifications:true},active:true,createdAt:now()};
  users.push(u);write(USERS,users);res.json({token:sign({id:u.id}),user:pub(u)});
});
app.post('/api/login',scopedRateLimit(authLimiter,{keyPrefix:'login',max:8}),async(req,res)=>{
  const users=read(USERS),email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||''),u=users.find(x=>x.email===email);
  if(!u||!(await bcrypt.compare(password,u.password)))return res.status(401).json({error:'E-posta veya şifre hatalı.'});
  if(u.active===false)return res.status(403).json({error:'Hesabın yönetici tarafından pasifleştirildi.'});
  res.json({token:sign({id:u.id}),user:pub(u)});
});
const loginAttempts=new Map();
app.post('/api/admin/login',scopedRateLimit(authLimiter,{keyPrefix:'admin-login',max:8}),async(req,res)=>{
  const ip=clientIp(req), nowMs=Date.now(), email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||''), key=ip+':'+email;
  const arr=(loginAttempts.get(key)||[]).filter(t=>nowMs-t<10*60*1000);
  if(arr.length>=8)return res.status(429).json({error:'Çok fazla giriş denemesi. 10 dakika sonra tekrar deneyin.'});
  arr.push(nowMs);loginAttempts.set(key,arr);
  let passwordOk=false;
  if(ADMIN_PASSWORD_HASH) passwordOk=await bcrypt.compare(password,ADMIN_PASSWORD_HASH);
  else passwordOk=password===ADMIN_PASSWORD;
  if(email!==ADMIN_EMAIL||!passwordOk)return res.status(401).json({error:'Yönetici e-postası veya şifresi hatalı.'});
  loginAttempts.delete(key);
  res.json({token:sign({role:'admin',email},'12h'),admin:{email,role:'admin'}});
});
app.get('/api/me',auth,(req,res)=>{const u=read(USERS).find(x=>x.id===req.user.id);u?res.json(pub(u)):res.status(404).json({error:'Kullanıcı bulunamadı.'})});
app.put('/api/me',auth,(req,res)=>{const users=read(USERS),i=users.findIndex(x=>x.id===req.user.id);if(i<0)return res.status(404).json({error:'Kullanıcı bulunamadı.'});const{name,phone,settings,addresses}=req.body||{};if(name!==undefined)users[i].name=String(name).trim();if(phone!==undefined)users[i].phone=String(phone).trim();if(settings)users[i].settings={...users[i].settings,...settings};if(Array.isArray(addresses))users[i].addresses=addresses.map(String);write(USERS,users);res.json(pub(users[i]))});
app.post('/api/change-password',auth,async(req,res)=>{const{currentPassword,newPassword}=req.body||{};if(!newPassword||newPassword.length<6)return res.status(400).json({error:'Yeni şifre en az 6 karakter olmalı.'});const users=read(USERS),i=users.findIndex(x=>x.id===req.user.id);if(i<0||!(await bcrypt.compare(currentPassword||'',users[i].password)))return res.status(400).json({error:'Mevcut şifre hatalı.'});users[i].password=await bcrypt.hash(newPassword,10);write(USERS,users);res.json({ok:true})});

app.get('/api/orders',auth,(req,res)=>res.json(read(ORDERS).filter(o=>o.userId===req.user.id).sort((a,b)=>b.createdAt-a.createdAt)));
app.get('/api/orders/:id/status',auth,(req,res)=>{const o=read(ORDERS).find(x=>x.id===req.params.id&&x.userId===req.user.id);o?res.json({id:o.id,status:o.status,paymentStatus:o.paymentStatus,total:o.total}):res.status(404).json({error:'Sipariş bulunamadı.'})});
app.post('/api/orders',auth,async(req,res)=>{
  const{items,total,address,coupon,phone}=req.body||{};
  if(!Array.isArray(items)||!items.length||!address?.trim())return res.status(400).json({error:'Ürünler ve teslimat adresi gerekli.'});
  const users=read(USERS),u=users.find(x=>x.id===req.user.id); if(!u)return res.status(401).json({error:'Kullanıcı bulunamadı.'});
  const products=read(PRODUCTS),orders=read(ORDERS),coupons=read(COUPONS);
  const safeItems=items.map(x=>{const p=products.find(y=>y.id===Number(x.id));return p?{id:p.id,name:p.name,price:p.price,qty:Math.max(1,Number(x.qty)||1),size:x.size||'',color:x.color||'',image:p.image}:null}).filter(Boolean);
  if(!safeItems.length)return res.status(400).json({error:'Geçerli ürün bulunamadı.'});
  for(const item of safeItems){const p=products.find(x=>x.id===item.id);if(Number(p.stock||0)<item.qty)return res.status(409).json({error:`${p.name} için yeterli stok yok. Mevcut stok: ${p.stock||0}.`});}
  const subtotal=safeItems.reduce((s,x)=>s+x.price*x.qty,0);let discount=0;let couponCode='';
  if(coupon){const c=coupons.find(x=>x.code===String(coupon).toUpperCase()&&x.active!==false);if(!c)return res.status(400).json({error:'İndirim kodu geçerli değil.'});if(subtotal<Number(c.min||0))return res.status(400).json({error:`Bu kod için minimum sepet tutarı ${Number(c.min||0)} TL.`});if(Number(c.usageLimit||0)>0&&Number(c.usedCount||0)>=Number(c.usageLimit))return res.status(400).json({error:'Bu indirim kodunun kullanım limiti doldu.'});discount=c.type==='percent'?subtotal*Number(c.value)/100:Number(c.value);couponCode=c.code;}
  const shipping=Math.max(0,subtotal-discount)>=Number(read(SITE).freeShippingThreshold||1500)?0:Number(read(SITE).shippingFee||59.9);
  const calculatedTotal=Math.max(0,subtotal-discount+shipping);
  const customerPhone=String(phone??u.phone??'').trim();
  if(!customerPhone)return res.status(400).json({error:'Teslimat telefon numarası gerekli.'});
  if(customerPhone.length>20)return res.status(400).json({error:'Telefon numarası çok uzun.'});
  if(String(u.name||'').trim().length>60)return res.status(400).json({error:'Ad soyad 60 karakterden uzun olamaz.'});
  if(String(address||'').trim().length>400)return res.status(400).json({error:'Teslimat adresi 400 karakterden uzun olamaz.'});
  if(customerPhone)u.phone=customerPhone;write(USERS,users);
  const o={id:'LV-'+Date.now().toString(36).toUpperCase(),userId:u.id,customer:{name:u.name,email:u.email,phone:customerPhone},items:safeItems,subtotal,discount,shipping,total:calculatedTotal,address:address.trim(),coupon:couponCode,status:'Yeni',paymentStatus:'Ödeme bekliyor',trackingNumber:'',trackingUrl:'',shippingCompany:'',customerNote:'',adminNote:'',inventoryCommitted:false,inventoryRestored:false,couponCommitted:false,createdAt:now(),updatedAt:now()};
  if(!BASE_URL)return res.status(503).json({error:'BASE_URL ayarı yapılmadan PayTR ödeme başlatılamaz.'});
  if(!PAYTR_CONFIGURED){
    orders.push(o);write(ORDERS,orders);
    return res.status(503).json({error:'PayTR ödeme altyapısı henüz yapılandırılmadı.'});
  }
  o.paymentProvider='paytr';
  o.paymentStatus='Ödeme bekliyor';
  o.paytrOid=o.id.replace(/[^A-Za-z0-9]/g,'');
  orders.push(o);write(ORDERS,orders);void notifyOrder(o,'order_created');

  const paymentAmount=Math.round(calculatedTotal*100);
  const userIp=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').toString().split(',')[0].trim().replace(/^::ffff:/,'')||'127.0.0.1';
  const basketJson=JSON.stringify(safeItems.map(x=>[x.name,Number(x.price).toFixed(2),Number(x.qty)]));
  const basket=Buffer.from(basketJson,'utf8').toString('base64');
  const hashStr=PAYTR_MERCHANT_ID+userIp+o.paytrOid+u.email+paymentAmount+basket+'0'+'0'+'TL'+PAYTR_TEST_MODE;
  const paytrToken=crypto.createHmac('sha256',PAYTR_MERCHANT_KEY).update(hashStr+PAYTR_MERCHANT_SALT).digest('base64');
  const body=new URLSearchParams({
    merchant_id:PAYTR_MERCHANT_ID,user_ip:userIp,merchant_oid:o.paytrOid,email:u.email,payment_amount:String(paymentAmount),paytr_token:paytrToken,
    user_basket:basket,no_installment:'0',max_installment:'0',user_name:u.name,user_address:o.address,user_phone:u.phone||'',merchant_ok_url:`${BASE_URL}/odeme-sonuc.html?status=success&order=${encodeURIComponent(o.id)}`,merchant_fail_url:`${BASE_URL}/odeme-sonuc.html?status=failure&order=${encodeURIComponent(o.id)}`,timeout_limit:'30',currency:'TL',test_mode:PAYTR_TEST_MODE,debug_on:PAYTR_DEBUG_ON,lang:'tr'
  });
  try{
    const response=await fetch('https://www.paytr.com/odeme/api/get-token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    const result=await response.json().catch(()=>null);
    if(!result||result.status!=='success'||!result.token){
      const orders2=read(ORDERS),idx=orders2.findIndex(x=>x.id===o.id);if(idx>=0){orders2[idx].paymentStatus='Ödeme başlatılamadı';orders2[idx].updatedAt=now();write(ORDERS,orders2);}
      return res.status(502).json({error:'PayTR ödeme ekranı başlatılamadı.',detail:result?.reason||result?.msg||'PayTR yanıtı geçersiz.'});
    }
    const orders2=read(ORDERS),idx=orders2.findIndex(x=>x.id===o.id);if(idx>=0){orders2[idx].paymentToken=result.token;orders2[idx].updatedAt=now();write(ORDERS,orders2);}
    return res.status(201).json({id:o.id,paymentProvider:'paytr',token:result.token});
  }catch(err){
    const orders2=read(ORDERS),idx=orders2.findIndex(x=>x.id===o.id);if(idx>=0){orders2[idx].paymentStatus='Ödeme başlatılamadı';orders2[idx].updatedAt=now();write(ORDERS,orders2);}
    return res.status(502).json({error:'PayTR ile bağlantı kurulamadı.'});
  }
});
app.post('/api/payment/paytr-callback',(req,res)=>{
  const merchantOid=String(req.body?.merchant_oid||'').trim();
  const status=String(req.body?.status||'').trim();
  const totalAmount=String(req.body?.total_amount||'').trim();
  const receivedHash=String(req.body?.hash||'').trim();
  if(!PAYTR_CONFIGURED)return res.status(503).send('PAYTR notification unavailable');
  if(!merchantOid||!receivedHash)return res.status(400).send('PAYTR notification failed');
  const expectedHash=crypto.createHmac('sha256',PAYTR_MERCHANT_KEY).update(merchantOid+PAYTR_MERCHANT_SALT+status+totalAmount).digest('base64');
  if(expectedHash.length!==receivedHash.length||!crypto.timingSafeEqual(Buffer.from(expectedHash),Buffer.from(receivedHash)))return res.status(400).send('PAYTR notification failed: bad hash');
  const orders=read(ORDERS),idx=orders.findIndex(o=>o.paytrOid===merchantOid);
  if(idx<0)return res.send('OK');
  if(status==='success'){
    if(Number(totalAmount)!==Math.round(Number(orders[idx].total||0)*100))return res.status(400).send('PAYTR notification failed: amount mismatch');
    const firstSuccess=orders[idx].paymentStatus!=='Ödendi';
    orders[idx].paymentStatus='Ödendi'; orders[idx].status=orders[idx].status==='İptal edildi'?'İptal edildi':'Yeni';
    if(firstSuccess){commitStock(orders[idx]);useCouponOnce(orders[idx]);orders[idx].paidAt=now();orders[idx].updatedAt=now();write(ORDERS,orders);void notifyOrder(orders[idx],'payment_success');}
    else {orders[idx].updatedAt=now();write(ORDERS,orders);}
  } else {
    const firstFailure=orders[idx].paymentStatus!=='Ödeme başarısız'; orders[idx].paymentStatus='Ödeme başarısız';orders[idx].updatedAt=now();write(ORDERS,orders);if(firstFailure)void notifyOrder(orders[idx],'payment_failed');
  }
  res.send('OK');
});

app.post('/api/orders/:id/cancel',auth,(req,res)=>{const a=read(ORDERS),i=a.findIndex(o=>o.id===req.params.id&&o.userId===req.user.id);if(i<0)return res.status(404).json({error:'Sipariş bulunamadı.'});if(!['Yeni','Hazırlanıyor'].includes(a[i].status))return res.status(400).json({error:'Bu sipariş artık iptal edilemez.'});a[i].status='İptal edildi';restoreStock(a[i]);a[i].updatedAt=now();write(ORDERS,a);void notifyOrder(a[i],'cancelled');res.json(a[i])});
app.post('/api/orders/:id/return',auth,(req,res)=>{const a=read(ORDERS),i=a.findIndex(o=>o.id===req.params.id&&o.userId===req.user.id);if(i<0)return res.status(404).json({error:'Sipariş bulunamadı.'});if(a[i].status!=='Teslim edildi')return res.status(400).json({error:'İade talebi yalnızca teslim edilen siparişler için açılabilir.'});a[i].status='İade talebi';a[i].updatedAt=now();write(ORDERS,a);res.json(a[i])});
app.delete('/api/me',auth,(req,res)=>{write(USERS,read(USERS).filter(u=>u.id!==req.user.id));write(ORDERS,read(ORDERS).filter(o=>o.userId!==req.user.id));res.json({ok:true})});

// ADMIN: dashboard
app.get('/api/admin/stats',adminAuth,(req,res)=>{
  const orders=read(ORDERS),users=read(USERS),products=read(PRODUCTS),today=new Date();
  const dayStart=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime();
  const monthStart=new Date(today.getFullYear(),today.getMonth(),1).getTime();
  const valid=o=>o.paymentStatus==='Ödendi'&&!['İptal edildi','İade tamamlandı'].includes(o.status);
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
app.post('/api/admin/orders/:id/reject',adminAuth,(req,res)=>{
  const a=read(ORDERS),i=a.findIndex(o=>o.id===req.params.id);
  if(i<0)return res.status(404).json({error:'Sipariş bulunamadı.'});
  const o=a[i];
  if(['İptal edildi','İade tamamlandı','Teslim edildi'].includes(o.status))return res.status(400).json({error:'Bu sipariş artık reddedilemez.'});
  if(o.paymentStatus==='Ödendi')return res.status(400).json({error:'Ödemesi alınmış sipariş doğrudan reddedilemez. Önce ödeme iadesi işlemi yapılmalıdır.'});
  o.status='İptal edildi';
  o.rejectedAt=now();
  o.rejectedBy=req.admin?.email||'admin';
  o.rejectionReason=String(req.body?.reason||'Yönetici tarafından reddedildi.');
  restoreStock(o);
  o.updatedAt=now();
  write(ORDERS,a);
  void notifyOrder(o,'cancelled');
  res.json({ok:true,message:'Sipariş reddedildi ve iptal edildi.',order:o});
});

app.put('/api/admin/orders/:id',adminAuth,(req,res)=>{
  const a=read(ORDERS),i=a.findIndex(o=>o.id===req.params.id);if(i<0)return res.status(404).json({error:'Sipariş bulunamadı.'});
  const b=req.body||{},oldStatus=a[i].status,oldPayment=a[i].paymentStatus;
  if(b.status!==undefined&&!orderStatuses.includes(b.status))return res.status(400).json({error:'Geçersiz sipariş durumu.'});
  if(b.paymentStatus!==undefined&&!paymentStatuses.includes(b.paymentStatus))return res.status(400).json({error:'Geçersiz ödeme durumu.'});
  for(const k of ['status','paymentStatus','trackingNumber','shippingCompany','trackingUrl','customerNote','adminNote'])if(b[k]!==undefined)a[i][k]=String(b[k]);
  if(b.trackingUrl!==undefined && b.trackingUrl){try{const u=new URL(String(b.trackingUrl));if(!['http:','https:'].includes(u.protocol))throw new Error();a[i].trackingUrl=u.toString()}catch{return res.status(400).json({error:'Kargo takip bağlantısı http/https olmalıdır.'})}}
  if(a[i].status==='İptal edildi' || a[i].status==='İade tamamlandı') restoreStock(a[i]);
  a[i].updatedAt=now();write(ORDERS,a);
  if(oldStatus!==a[i].status){const ev={'Hazırlanıyor':'preparing','Kargoya verildi':'shipped','Teslim edildi':'delivered','İptal edildi':'cancelled','İade tamamlandı':'returned'}[a[i].status];if(ev)void notifyOrder(a[i],ev);}
  if(oldPayment!==a[i].paymentStatus&&a[i].paymentStatus==='Ödendi'){commitStock(a[i]);useCouponOnce(a[i]);a[i].paidAt=now();write(ORDERS,a);void notifyOrder(a[i],'payment_success');}
  res.json(a[i]);
});
app.get('/api/admin/users',adminAuth,(req,res)=>{const q=String(req.query.q||'').trim().toLowerCase();let u=read(USERS).map(pub);if(q)u=u.filter(x=>(x.name+' '+x.email+' '+x.phone).toLowerCase().includes(q));res.json(u.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))) });
app.get('/api/admin/users/:id',adminAuth,(req,res)=>{const u=read(USERS).find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Müşteri bulunamadı.'});const orders=read(ORDERS).filter(o=>o.userId===u.id).sort((a,b)=>b.createdAt-a.createdAt);res.json({user:pub(u),orders})});
app.put('/api/admin/users/:id',adminAuth,(req,res)=>{const a=read(USERS),i=a.findIndex(u=>u.id===req.params.id);if(i<0)return res.status(404).json({error:'Müşteri bulunamadı.'});if(req.body.active!==undefined)a[i].active=Boolean(req.body.active);if(req.body.name!==undefined)a[i].name=String(req.body.name).trim();if(req.body.phone!==undefined)a[i].phone=String(req.body.phone).trim();write(USERS,a);res.json(pub(a[i]))});

app.get('/api/admin/notifications',adminAuth,(req,res)=>{const a=notificationRead().sort((x,y)=>y.createdAt-x.createdAt);res.json(a.slice(0,200));});
app.post('/api/admin/orders/:id/notify',adminAuth,async(req,res)=>{const o=read(ORDERS).find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Sipariş bulunamadı.'});const channel=String(req.body?.channel||'both');const event=String(req.body?.event||'order_created');const c=notificationContent(o,event);const out=[];if(channel==='email'||channel==='both'){try{out.push({channel:'email',...(await sendEmail(o.customer?.email,c.subject,c.html,c.text,`manual-email:${o.id}:${Date.now()}`))})}catch(e){out.push({channel:'email',error:e.message})}}if(channel==='sms'||channel==='both'){try{out.push({channel:'sms',...(await sendSms(o.customer?.phone,c.text,crypto.randomUUID()))})}catch(e){out.push({channel:'sms',error:e.message})}}const logs=notificationRead();logs.push({id:crypto.randomUUID(),orderId:o.id,event:'manual_'+event,createdAt:now(),results:out});notificationWrite(logs.slice(-500));res.json({ok:true,results:out});});
app.get('/api/admin/products',adminAuth,(_req,res)=>res.json(read(PRODUCTS)));
app.post('/api/admin/products',adminAuth,(req,res)=>{const a=read(PRODUCTS),b=req.body||{};if(!b.name||!b.cat||!Number.isFinite(Number(b.price)))return res.status(400).json({error:'Ürün adı, kategori ve fiyat gerekli.'});const p={id:Math.max(0,...a.map(x=>Number(x.id)||0))+1,name:String(b.name),cat:String(b.cat),gender:String(b.gender||'Erkek'),price:Number(b.price),old:Number(b.old||b.price),image:String(b.image||''),gallery:Array.isArray(b.gallery)?b.gallery.map(String):[String(b.image||'')],new:Boolean(b.new),sizes:Array.isArray(b.sizes)?b.sizes.map(String):['S','M','L','XL'],desc:String(b.desc||''),stock:Math.max(0,Number(b.stock||0))};a.push(p);write(PRODUCTS,a);res.status(201).json(p)});
app.put('/api/admin/products/:id',adminAuth,(req,res)=>{const a=read(PRODUCTS),i=a.findIndex(p=>p.id===Number(req.params.id));if(i<0)return res.status(404).json({error:'Ürün bulunamadı.'});const b=req.body||{};for(const k of ['name','cat','gender','image','desc'])if(b[k]!==undefined)a[i][k]=String(b[k]);if(Array.isArray(b.gallery))a[i].gallery=b.gallery.map(String);else if(b.image!==undefined&&!Array.isArray(a[i].gallery))a[i].gallery=[a[i].image];for(const k of ['price','old','stock'])if(b[k]!==undefined)a[i][k]=Number(b[k]);if(b.new!==undefined)a[i].new=Boolean(b.new);if(Array.isArray(b.sizes))a[i].sizes=b.sizes.map(String);write(PRODUCTS,a);res.json(a[i])});
app.delete('/api/admin/products/:id',adminAuth,(req,res)=>{const a=read(PRODUCTS),n=a.filter(p=>p.id!==Number(req.params.id));if(n.length===a.length)return res.status(404).json({error:'Ürün bulunamadı.'});write(PRODUCTS,n);res.json({ok:true})});

app.get('/api/admin/coupons',adminAuth,(_req,res)=>res.json(read(COUPONS)));
app.post('/api/admin/coupons',adminAuth,(req,res)=>{const a=read(COUPONS),b=req.body||{},code=String(b.code||'').trim().toUpperCase();if(!code||!Number(b.value))return res.status(400).json({error:'Kod ve indirim değeri gerekli.'});if(a.some(c=>c.code===code))return res.status(409).json({error:'Bu kod zaten var.'});const c={code,type:b.type==='fixed'?'fixed':'percent',value:Number(b.value),min:Number(b.min||0),active:b.active!==false,usageLimit:Number(b.usageLimit||0),usedCount:0};a.push(c);write(COUPONS,a);res.status(201).json(c)});
app.put('/api/admin/coupons/:code',adminAuth,(req,res)=>{const a=read(COUPONS),i=a.findIndex(c=>c.code===String(req.params.code).toUpperCase());if(i<0)return res.status(404).json({error:'Kupon bulunamadı.'});const b=req.body||{};for(const k of ['value','min','usageLimit'])if(b[k]!==undefined)a[i][k]=Number(b[k]);if(b.type!==undefined)a[i].type=b.type==='fixed'?'fixed':'percent';if(b.active!==undefined)a[i].active=Boolean(b.active);write(COUPONS,a);res.json(a[i])});
app.delete('/api/admin/coupons/:code',adminAuth,(req,res)=>{const a=read(COUPONS),n=a.filter(c=>c.code!==String(req.params.code).toUpperCase());if(n.length===a.length)return res.status(404).json({error:'Kupon bulunamadı.'});write(COUPONS,n);res.json({ok:true})});

app.get('/api/admin/site',adminAuth,(_req,res)=>res.json(read(SITE)));
app.put('/api/admin/site',adminAuth,(req,res)=>{const b=req.body||{};const s={...read(SITE),...b,shippingFee:Number(b.shippingFee??read(SITE).shippingFee),freeShippingThreshold:Number(b.freeShippingThreshold??read(SITE).freeShippingThreshold)};write(SITE,s);res.json(s)});
app.get('/api/admin/export/orders',adminAuth,(req,res)=>{const rows=read(ORDERS);const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const head=['Sipariş','Tarih','Müşteri','E-posta','Durum','Ödeme','Ara Toplam','İndirim','Kargo','Toplam','Kupon','Kargo Firması','Takip No','Takip Bağlantısı','Adres'];const lines=[head.map(esc).join(',')];for(const o of rows)lines.push([o.id,new Date(o.createdAt).toLocaleString('tr-TR'),o.customer?.name,o.customer?.email,o.status,o.paymentStatus,o.subtotal,o.discount,o.shipping,o.total,o.coupon,o.shippingCompany,o.trackingNumber,o.trackingUrl,o.address].map(esc).join(','));res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="levaren-siparisler.csv"');res.send('\ufeff'+lines.join('\n'))});

app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
if(SECRET==='levaren-change-this-secret') console.warn('SECURITY WARNING: JWT_SECRET must be replaced in production.');
if(ADMIN_PASSWORD==='change-me-now'&&!ADMIN_PASSWORD_HASH) console.warn('SECURITY WARNING: set ADMIN_PASSWORD_HASH or a strong ADMIN_PASSWORD.');
if(PAYTR_TEST_MODE==='1') console.warn('PAYTR: test mode is enabled. Set PAYTR_TEST_MODE=0 only after PayTR confirms live mode.');
app.listen(PORT,'0.0.0.0',()=>console.log('LÉVAREN running on '+PORT));
