import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Howl } from 'howler';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, User, Heart, ShoppingCart, Moon, Sun, ChevronDown, ChevronRight,
  Menu, X, Gamepad2, Monitor, Keyboard, Mouse, Headphones, Armchair,
  Mic2, Speaker, Cpu, SlidersHorizontal, Plus, Minus, ArrowRight,
  Truck, ShieldCheck, RefreshCcw, BadgeCheck, Zap, Star, Sparkles,
  Clock3, Ticket, Grid2X2, Scale, PackageCheck, MapPin
  , BarChart3, Coins, LayoutDashboard, Package, Tags, Megaphone,
  Users, ReceiptText, Calculator, Link2, MessageCircle, Send,
  FileText, Lock, Settings, Upload, MoreHorizontal
} from 'lucide-react';
import { categories, products as localProducts } from './catalog.js';
import './styles.css';

const CatalogContext = React.createContext(localProducts);
const useCatalog = () => React.useContext(CatalogContext);
const formatPrice = n => `฿${n.toLocaleString('th-TH')}`;
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const apiFetch = (path, options = {}) => fetch(`${apiBaseUrl}${path}`, {
  credentials: 'include',
  ...options
});
const groupCart = cart => Array.from(
  cart.reduce((items, product) => {
    const line = items.get(product.id) || { ...product, quantity: 0 };
    line.quantity += 1;
    items.set(product.id, line);
    return items;
  }, new Map()).values()
);

function createToneDataUri(frequency, duration = 0.12) {
  const sampleRate = 22050;
  const length = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const envelope = Math.max(0, 1 - i / length);
    const value = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.35 * envelope;
    view.setInt16(44 + i * 2, value * 32767, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return `data:audio/wav;base64,${btoa(binary)}`;
}

let soundHowls = {};
function playTone(type, switchStyle = 'blue') {
  const frequencies = {
    keyboard: switchStyle === 'red' ? 220 : switchStyle === 'typewriter' ? 330 : 520,
    ora: 880,
    no: 110,
    yes: 660
  };
  const frequency = frequencies[type] || 440;
  const key = `${type}-${frequency}`;
  if (!soundHowls[key]) soundHowls[key] = new Howl({ src: [createToneDataUri(frequency, type === 'yes' ? 0.5 : 0.14)], volume: 0.45 });
  soundHowls[key].play();
}

function App() {
  const [theme, setTheme] = useState('dark');
  const [catalogProducts,setCatalogProducts]=useState(localProducts);
  const [catalogError,setCatalogError]=useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState(() => {
    try {
      const savedIds = JSON.parse(localStorage.getItem('nexora-cart') || '[]');
      return Array.isArray(savedIds)
        ? savedIds.map(id => localProducts.find(product => product.id === id)).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  });
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState('');
  const [currentOrder, setCurrentOrder] = useState(null);
  const [wishlist, setWishlist] = useState(new Set([2, 7]));
  const [activeCategory, setActiveCategory] = useState('ทั้งหมด');
  const [search, setSearch] = useState('');
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  const [mobileNav, setMobileNav] = useState(false);
  const [soundOn,setSoundOn]=useState(true);
  const [switchStyle,setSwitchStyle]=useState('blue');
  const [bursts,setBursts]=useState([]);
  const [continued,setContinued]=useState(false);
  const [cookieChoice,setCookieChoice]=useState(localStorage.getItem('nexora-cookie') || '');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    localStorage.setItem('nexora-cart', JSON.stringify(cart.map(product => product.id)));
  }, [cart]);
  useEffect(() => {
    let active=true;
    apiFetch('/api/products')
      .then(async response=>{
        const data=await response.json();
        if(!response.ok) throw new Error(data.error||'โหลดสินค้าไม่สำเร็จ');
        if(!Array.isArray(data.products)) throw new Error('ข้อมูลสินค้าจากเซิร์ฟเวอร์ไม่ถูกต้อง');
        if(!active) return;
        setCatalogProducts(data.products);
        setCart(previous=>previous.map(item=>data.products.find(product=>product.id===item.id)||item));
        setCatalogError('');
      })
      .catch(error=>{
        if(active) setCatalogError(error.message||'เชื่อมต่อรายการสินค้าไม่ได้');
      });
    return ()=>{active=false;};
  }, []);
  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(response => response.ok ? response.json() : null)
      .then(data => setUser(data?.user || null))
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    if (!user) {
      setOrders([]);
      setOrdersError('');
      return;
    }
    setOrdersError('');
    apiFetch('/api/orders')
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'โหลดประวัติคำสั่งซื้อไม่สำเร็จ');
        setOrders(data.orders);
      })
      .catch(error => setOrdersError(error.message || 'โหลดประวัติคำสั่งซื้อไม่สำเร็จ'));
  }, [user]);
  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!soundOn) return;
    const keyboardKeys = new Set(['Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
    const onKey = event => { if (keyboardKeys.has(event.key)) playTone('keyboard',switchStyle); };
    window.addEventListener('keydown',onKey);
    return () => window.removeEventListener('keydown',onKey);
  }, [soundOn,switchStyle]);

  useEffect(() => {
    const onClick = event => {
      if (event.target.closest('button,input,select,a')) return;
      const words=['POW!','BAM!','ZAP!','ゴゴゴゴ'];
      const burst={id:Date.now()+Math.random(),text:words[Math.floor(Math.random()*words.length)],x:event.clientX,y:event.clientY};
      setBursts(prev=>[...prev.slice(-4),burst]);
      window.setTimeout(()=>setBursts(prev=>prev.filter(b=>b.id!==burst.id)),850);
    };
    window.addEventListener('click',onClick);
    return () => window.removeEventListener('click',onClick);
  }, []);

  useEffect(() => {
    if (['/checkout','/login','/register','/account','/orders'].includes(route)) return;
    const onMouseLeave = event => {
      if (event.clientY <= 0) setContinued(true);
    };
    window.addEventListener('mouseout',onMouseLeave);
    return () => window.removeEventListener('mouseout',onMouseLeave);
  }, [route]);

  const navigate = path => {
    if (route === '/checkout' && path === '/tracking' && soundOn) playTone('yes');
    location.hash = path; setMobileNav(false); window.scrollTo({top:0,behavior:'smooth'});
  };
  const addToCart = product => { setCart(prev => [...prev, product]); if (soundOn) playTone('ora'); };
  const changeCartQuantity = (productId, change) => setCart(previous => {
    if (change > 0) {
      const product = products.find(item => item.id === productId);
      return product ? [...previous, product] : previous;
    }
    let remaining = Math.abs(change);
    return previous.filter(item => {
      if (item.id !== productId || remaining === 0) return true;
      remaining -= 1;
      return false;
    });
  });
  const placeOrder = order => {
    setCurrentOrder(order);
    setOrders(previous => [order, ...previous]);
    setCart([]);
    navigate('/tracking');
  };
  const handleAuth = authenticatedUser => {
    setUser(authenticatedUser);
    if (route !== '/checkout') navigate('/account');
  };
  const logout = async () => {
    const response = await apiFetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('ออกจากระบบไม่สำเร็จ');
    setUser(null);
    setOrders([]);
    navigate('/login');
  };
  const toggleWishlist = id => setWishlist(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const products=catalogProducts;
  const catalogCategories=useMemo(()=>Array.from(new Set(products.map(product=>product.category)))
    .map(name=>[name,categories.find(([category])=>category===name)?.[1]||name]),[products]);
  const filtered = useMemo(() => products.filter(p =>
    (activeCategory === 'ทั้งหมด' || p.category === activeCategory) &&
    (!search || `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(search.toLowerCase()))
  ), [activeCategory, search, products]);

  return (
    <CatalogContext.Provider value={products}>
    <div className="app">
      <TopBar theme={theme} setTheme={setTheme} cartCount={cart.length} onCart={() => setCartOpen(true)} navigate={navigate} mobileNav={mobileNav} setMobileNav={setMobileNav} user={user} />
      {catalogError&&<div className="catalog-error" role="alert">กำลังแสดงข้อมูลสินค้าสำรอง เนื่องจากโหลดรายการจากฐานข้อมูลไม่สำเร็จ: {catalogError}</div>}
      {mobileNav && <div className="mobile-nav"><NavLinks navigate={navigate} /></div>}
      {cartOpen && <CartDrawer cart={cart} changeCartQuantity={changeCartQuantity} close={() => setCartOpen(false)} navigate={navigate} />}
      {cartOpen && <div className="overlay" onClick={() => setCartOpen(false)} />}
      {route === '/' && <Home navigate={navigate} products={products} categories={catalogCategories} wishlist={wishlist} toggleWishlist={toggleWishlist} addToCart={addToCart} />}
      {route === '/products' && <ProductGrid filtered={filtered} categories={catalogCategories} activeCategory={activeCategory} setActiveCategory={setActiveCategory} search={search} setSearch={setSearch} wishlist={wishlist} toggleWishlist={toggleWishlist} addToCart={addToCart} navigate={navigate} />}
      {route.startsWith('/product/') && <ProductDetail id={Number(route.split('/')[2])} navigate={navigate} wishlist={wishlist} toggleWishlist={toggleWishlist} addToCart={addToCart} />}
      {route === '/cart' && <CartPage cart={cart} changeCartQuantity={changeCartQuantity} navigate={navigate} />}
      {route === '/promotions' && <Promotions navigate={navigate} user={user} />}
      {route === '/compare' && <Compare />}
      {route === '/wishlist' && <WishlistPage wishlist={wishlist} toggleWishlist={toggleWishlist} addToCart={addToCart} navigate={navigate} />}
      {route === '/checkout' && (user
        ? <Checkout cart={cart} user={user} placeOrder={placeOrder} navigate={navigate} />
        : <AuthPage navigate={navigate} onAuth={handleAuth} initialRegister={false} checkoutRequired />)}
      {(route === '/login' || route === '/register') && <AuthPage navigate={navigate} onAuth={handleAuth} initialRegister={route === '/register'} />}
      {route === '/account' && (user
        ? <CustomerPortal navigate={navigate} user={user} orders={orders} ordersError={ordersError} onLogout={logout} />
        : <AuthPage navigate={navigate} onAuth={handleAuth} initialRegister={false} />)}
      {route === '/orders' && (user
        ? <CustomerPortal navigate={navigate} user={user} orders={orders} ordersError={ordersError} onLogout={logout} initialTab="orders" />
        : <AuthPage navigate={navigate} onAuth={handleAuth} initialRegister={false} />)}
      {route === '/tracking' && <OrderConfirmation order={currentOrder || orders[0]} navigate={navigate} />}
      {route === '/admin' && (!user
        ? <AuthPage navigate={navigate} onAuth={handleAuth} initialRegister={false} />
        : ['super_admin','order_staff','marketing'].includes(user.role)
          ? <AdminDashboard navigate={navigate} user={user} />
          : <main className="page container"><section className="info-page"><div className="info-icon"><Lock/></div><h1>ไม่มีสิทธิ์เข้าถึง</h1><p>บัญชีนี้ไม่มีสิทธิ์ใช้งานระบบหลังบ้าน</p><div className="info-actions"><button onClick={()=>navigate('/account')}>กลับหน้าบัญชี</button></div></section></main>)}
      {route === '/desk-builder' && <DeskBuilder navigate={navigate} />}
      {route === '/edpi' && <EDPICalculator navigate={navigate} />}
      {route === '/referral' && <ReferralPage navigate={navigate} />}
      {route === '/arcade' && <NexoraArcade />}
      <StandAssistant />
      {!['/', '/products', '/cart', '/promotions', '/compare', '/wishlist', '/checkout', '/account', '/orders', '/login', '/register', '/tracking', '/admin', '/desk-builder', '/edpi', '/referral', '/arcade'].includes(route) && !route.startsWith('/product/') && <InfoPage route={route} navigate={navigate} />}
      <AnimatePresence>{bursts.map(b=><motion.div key={b.id} className="click-burst" initial={{scale:.2,rotate:-18,opacity:0}} animate={{scale:1.15,rotate:-8,opacity:1,y:-35}} exit={{opacity:0}} transition={{duration:.25}} style={{left:b.x,top:b.y}}>{b.text}</motion.div>)}</AnimatePresence>
      {continued&&<div className="continued-effect"><div className="sepia-flash"/><div className="continued-arrow"><span>To Be Continued</span><b>==&gt;</b></div><button onClick={()=>setContinued(false)}><X/></button></div>}
      {!cookieChoice&&<div className="cookie-consent"><b>คุกกี้เพื่อประสบการณ์ที่ดีขึ้น</b><p>เราใช้คุกกี้เพื่อวิเคราะห์การใช้งานและปรับการตลาดตาม PDPA</p><div><button onClick={()=>{localStorage.setItem('nexora-cookie','essential');setCookieChoice('essential')}}>จำเป็นเท่านั้น</button><button className="accept" onClick={()=>{localStorage.setItem('nexora-cookie','all');setCookieChoice('all')}}>ยอมรับทั้งหมด</button></div></div>}
      <VirtualSwitchWidget switchStyle={switchStyle} setSwitchStyle={setSwitchStyle} soundOn={soundOn}/>
      <button className="sound-toggle" onClick={()=>setSoundOn(v=>!v)}>{soundOn?'ปิดเสียง':'เปิดเสียง'} <span>{soundOn?'♪':'×'}</span></button>
      <MobileBottomBar navigate={navigate} route={route}/>
      <Footer navigate={navigate} />
    </div>
    </CatalogContext.Provider>
  );
}

function TopBar({theme,setTheme,cartCount,onCart,navigate,mobileNav,setMobileNav,user}) {
  const [query,setQuery] = useState('');
  return (
    <>
      <div className="utility-bar">
        <div className="container utility-inner">
          <span>สินค้าของแท้ 100% • รับประกันศูนย์ไทย</span>
          <div><button onClick={() => navigate('/tracking')}>ติดตามคำสั่งซื้อ</button><button onClick={() => navigate('/warranty')}>รับประกันสินค้า</button><button>TH</button></div>
        </div>
      </div>
      <header className="header">
        <div className="container header-inner">
          <button className="icon-button menu-button" onClick={() => setMobileNav(!mobileNav)}><Menu /></button>
          <button className="brand" onClick={() => navigate('/')}>
            <span className="brand-mark"><Zap fill="currentColor" /></span>
            <span><b>NEXORA</b><small>GAMING</small></span>
          </button>
          <div className="search-shell">
            <Search size={19}/>
            <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter' && navigate('/products')} placeholder="ค้นหาเมาส์, คีย์บอร์ด, จอภาพ..." />
            <button onClick={() => navigate('/products')}>ค้นหา</button>
          </div>
          <div className="header-actions">
            <button className="header-action" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun/>:<Moon/>}<span>{theme==='dark'?'สว่าง':'มืด'}</span></button>
            <button className="header-action" onClick={()=>navigate('/wishlist')}><Heart/><span>รายการที่ชอบ</span></button>
            <button className="header-action" onClick={()=>navigate(user?'/account':'/login')}><User/><span>{user?'บัญชี':'เข้าสู่ระบบ'}</span></button>
            <button className="cart-button" onClick={onCart}><ShoppingCart/><b>{cartCount}</b></button>
          </div>
        </div>
      </header>
      <nav className="nav">
        <div className="container nav-inner">
          <button className="category-trigger" onClick={() => navigate('/products')}><Menu/> หมวดหมู่สินค้า <ChevronDown/></button>
          <NavLinks navigate={navigate} />
        </div>
      </nav>
    </>
  );
}

function NavLinks({navigate}) {
  return <div className="nav-links">
    <button onClick={() => navigate('/')}>หน้าแรก</button>
    <button onClick={() => navigate('/products')}>สินค้าทั้งหมด</button>
    <button onClick={() => navigate('/promotions')} className="hot-link">โปรเด็ด <span>HOT</span></button>
    <button onClick={() => navigate('/desk-builder')}>Desk Builder</button>
    <button onClick={() => navigate('/edpi')}>eDPI</button>
    <button onClick={() => navigate('/arcade')}>Arcade</button>
    <button onClick={() => navigate('/featured')}>สินค้าแนะนำ</button>
    <button onClick={() => navigate('/compare')}>เทียบสินค้า</button>
  </div>;
}

function Home({navigate,products,categories,wishlist,toggleWishlist,addToCart}) {
  return (
    <main>
      <section className="hero-section">
        <div className="container hero-grid">
          <button className="hero-card" onClick={() => navigate('/products')}>
            <div className="halftone"></div>
            <div className="hero-copy">
              <div className="eyebrow"><span></span> NEW ARRIVAL</div>
              <h1>LEVEL UP<br/><em>YOUR GEAR</em></h1>
              <p>อุปกรณ์เกมมิ่งระดับโปร<br/>สำหรับผู้เล่นตัวจริง</p>
              <span className="cta">ช้อปเลย <ArrowRight/></span>
            </div>
            <div className="hero-visual">
              <div className="speed-lines"></div>
              <img src="https://images.unsplash.com/photo-1599669454699-248893623440?auto=format&fit=crop&w=950&q=90" alt="Gaming gear"/>
              <div className="hero-badge"><b>MAX</b><span>POWER</span></div>
            </div>
          </button>
          <div className="hero-side">
            <button className="side-promo purple" onClick={()=>navigate('/promotions')}>
              <div><small>GAMING DEAL</small><h3>MEGA<br/>SALE</h3><span>ลดสูงสุด 40%</span></div>
              <img src="https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2?auto=format&fit=crop&w=500&q=85" alt=""/>
            </button>
            <button className="side-promo cyan" onClick={()=>navigate('/arcade')}>
              <div><small>PLAY & WIN</small><h3>NEXORA<br/>ARCADE</h3><span>สะสมแต้มแลกคูปอง</span></div>
              <Gamepad2 className="promo-icon"/>
            </button>
          </div>
        </div>
      </section>

      <section className="container">
        <CategoryStrip categories={categories} navigate={navigate}/>
      </section>

      <section className="container section">
        <SectionTitle kicker="FRESH DROPS" title="สินค้าใหม่ล่าสุด" action="ดูทั้งหมด" onAction={()=>navigate('/products')}/>
        <ProductRow products={products.slice(0,5)} wishlist={wishlist} toggleWishlist={toggleWishlist} addToCart={addToCart} navigate={navigate}/>
      </section>

      <section className="container promo-banner">
        <div className="promo-copy"><small>LIMITED TIME</small><h2>GAMING<br/>GLOW UP</h2><p>ลดแรงรับไฟท้ายปี สูงสุด 35%</p></div>
        <div className="countdown"><div><b>02</b><span>วัน</span></div><i>:</i><div><b>14</b><span>ชั่วโมง</span></div><i>:</i><div><b>36</b><span>นาที</span></div></div>
        <button onClick={()=>navigate('/promotions')}>ดูโปรทั้งหมด <ArrowRight/></button>
      </section>

      <section className="container section">
        <SectionTitle kicker="TOP PICKS" title="ขายดีที่สุด" action="ดูทั้งหมด" onAction={()=>navigate('/featured')}/>
        <ProductRow products={[products[3],products[11],products[22],products[34],products[42]]} wishlist={wishlist} toggleWishlist={toggleWishlist} addToCart={addToCart} navigate={navigate}/>
      </section>
      <TrustStrip/>
    </main>
  );
}

function CategoryStrip({categories,navigate}) {
  const icons = [Mouse,Keyboard,Headphones,Monitor,Armchair,PackageCheck,Gamepad2,Mic2,Speaker,Grid2X2,Cpu];
  return <div className="category-strip">
    {categories.map(([name],i) => {
      const Icon=icons[i]||Package;
      return <button key={name} onClick={()=>navigate('/products')}>
        <span><Icon/></span><b>{name === 'PC Components' ? 'Components' : name}</b>
      </button>
    })}
  </div>;
}

function SectionTitle({kicker,title,action,onAction}) {
  return <div className="section-title"><div><small>{kicker}</small><h2>{title}</h2></div>{action&&<button onClick={onAction}>{action}<ChevronRight/></button>}</div>;
}

function ProductRow({products,wishlist,toggleWishlist,addToCart,navigate}) {
  return <div className="product-row">{products.map(p=><ProductCard key={p.id} product={p} wishlist={wishlist} toggleWishlist={toggleWishlist} addToCart={addToCart} navigate={navigate}/>)}</div>;
}

function ProductCard({product,wishlist,toggleWishlist,addToCart,navigate}) {
  return <article className="product-card">
    <div className="product-media" onClick={()=>navigate('/product/'+product.id)}>
      {product.oldPrice && <span className="sale-tag">SALE</span>}
      <span className={`rank rank-${product.rank}`}>{product.rank}</span>
      <img src={product.image} alt={product.name}/>
      <button className={`wish ${wishlist.has(product.id)?'active':''}`} onClick={(e)=>{e.stopPropagation();toggleWishlist(product.id)}}><Heart fill={wishlist.has(product.id)?'currentColor':'none'}/></button>
    </div>
    <div className="product-info">
      <small>{product.brand}</small>
      <h3 onClick={()=>navigate('/product/'+product.id)}>{product.name}</h3>
      <div className="rating"><Star fill="currentColor"/><b>4.{product.id % 8 + 1}</b><span>({(product.id*23)%180+12})</span></div>
      <div className="price"><b>{formatPrice(product.price)}</b>{product.oldPrice&&<del>{formatPrice(product.oldPrice)}</del>}</div>
      <button className="add-button" onClick={()=>addToCart(product)}><ShoppingCart/> เพิ่มตะกร้า</button>
    </div>
  </article>;
}

function TrustStrip(){
  return <section className="container trust-strip">
    <div><ShieldCheck/><span><b>ของแท้ 100%</b><small>รับประกันศูนย์ไทย</small></span></div>
    <div><Truck/><span><b>จัดส่งฟรี</b><small>เมื่อสั่งครบ 1,500.-</small></span></div>
    <div><RefreshCcw/><span><b>คืนสินค้าฟรี</b><small>ภายใน 7 วัน</small></span></div>
    <div><BadgeCheck/><span><b>ชำระปลอดภัย</b><small>หลายช่องทาง</small></span></div>
  </section>
}

function ProductGrid({filtered,categories,activeCategory,setActiveCategory,search,setSearch,wishlist,toggleWishlist,addToCart,navigate}) {
  const products=useCatalog();
  return <main className="page container">
    <div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>สินค้าทั้งหมด</b></div>
    <div className="shop-layout">
      <aside className="filters">
        <div className="filter-head"><b>ตัวกรองสินค้า</b><SlidersHorizontal/></div>
        <div className="filter-block"><h4>หมวดหมู่</h4>
          {['ทั้งหมด',...categories.map(c=>c[0])].map(cat=><button key={cat} className={activeCategory===cat?'active':''} onClick={()=>setActiveCategory(cat)}><span>{cat}</span><small>{cat==='ทั้งหมด'?products.length:products.filter(product=>product.category===cat).length}</small></button>)}
        </div>
        <div className="filter-block"><h4>ช่วงราคา</h4><div className="range-values"><span>฿0</span><span>฿50,000</span></div><input type="range" min="0" max="50000" defaultValue="50000"/></div>
        <div className="filter-block"><h4>ระดับพลัง</h4>{['S','A','B','C'].map(r=><label key={r}><input type="checkbox"/> <b className={`rank rank-${r}`}>{r}</b><span>{r==='S'?'ระดับตำนาน':r==='A'?'ระดับโปร':r==='B'?'ระดับดี':'ระดับเริ่มต้น'}</span></label>)}</div>
      </aside>
      <section className="shop-main">
        <div className="shop-toolbar"><div><h1>สินค้าทั้งหมด</h1><small>{filtered.length} รายการ</small></div><div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ค้นหาในหน้านี้"/><select><option>แนะนำ</option><option>ราคาต่ำไปสูง</option><option>ยอดนิยม</option></select></div></div>
        <div className="product-grid">{filtered.map(p=><ProductCard key={p.id} product={p} wishlist={wishlist} toggleWishlist={toggleWishlist} addToCart={addToCart} navigate={navigate}/>)}</div>
      </section>
    </div>
  </main>
}

function ProductDetail({id,navigate,wishlist,toggleWishlist,addToCart}) {
  const products=useCatalog();
  const product = products.find(p=>p.id===id) || products[0];
  const [qty,setQty]=useState(1);
  return <main className="page container">
    <div className="breadcrumbs">หน้าแรก <ChevronRight/> {product.category} <ChevronRight/> <b>{product.name}</b></div>
    <section className="detail-layout">
      <div className="detail-gallery">
        <div className="detail-main"><span className={`rank rank-${product.rank}`}>{product.rank}</span><img src={product.image} alt={product.name}/></div>
        <div className="detail-thumbs"><button className="active"><img src={product.image}/></button><button><img src={productImages[(product.id+1)%productImages.length]}/></button><button><img src={productImages[(product.id+2)%productImages.length]}/></button></div>
      </div>
      <div className="detail-copy">
        <small className="detail-brand">{product.brand}</small>
        <h1>{product.name}</h1>
        <div className="detail-rating"><span>★★★★★</span><b>4.8</b><small>32 รีวิว</small><small>SKU: {product.sku}</small></div>
        <div className="detail-price"><b>{formatPrice(product.price)}</b>{product.oldPrice&&<del>{formatPrice(product.oldPrice)}</del>}<span>ผ่อน 0% 3 เดือน</span></div>
        <div className="rank-panel"><div><small>POWER RANK</small><b className={`rank rank-${product.rank}`}>{product.rank}</b></div><div className="stats">{Object.entries(product.stats).map(([k,v])=>{const label={speed:'Speed',precision:'Precision',durability:'Durability',value:'Value'}[k];return <div key={k}><span>{label}</span><i><b style={{width:v+'%'}}/></i><em>{v}</em></div>})}</div></div>
        <div className="options"><h4>สีสินค้า</h4><div className="swatches"><button className="active black"></button><button className="purple"></button><button className="white"></button></div></div>
        <div className="detail-buy"><div className="qty"><button onClick={()=>setQty(q=>Math.max(1,q-1))}><Minus/></button><b>{qty}</b><button onClick={()=>setQty(q=>q+1)}><Plus/></button></div><button className="cart-main" onClick={()=>addToCart(product)}>เพิ่มลงตะกร้า</button><button className={`detail-wish ${wishlist.has(product.id)?'active':''}`} onClick={()=>toggleWishlist(product.id)}><Heart fill={wishlist.has(product.id)?'currentColor':'none'}/></button></div>
        <div className="detail-promises"><span><Truck/> ส่งฟรี EMS</span><span><ShieldCheck/> ประกัน 2 ปี</span><span><PackageCheck/> ส่งภายใน 24 ชม.</span></div>
      </div>
    </section>
    <section className="detail-tabs"><button className="active">รายละเอียดสินค้า</button><button>ข้อกำหนด</button><button>รีวิว (32)</button></section>
    <section className="detail-description"><div><h2>รายละเอียด</h2><p>อุปกรณ์เกมมิ่ง {product.name} จากแบรนด์ {product.brand} ออกแบบเพื่อประสิทธิภาพสูงสุดในการใช้งานจริง พร้อมดีไซน์ทันสมัยและวัสดุคุณภาพ รับประกันแท้ศูนย์ไทย</p></div><table><thead><tr><th>ข้อดี</th><th>ข้อควรพิจารณา</th></tr></thead><tbody>{product.pros.map((pro,i)=><tr key={pro}><td><span>✓</span> {pro}</td><td><span>–</span> {product.cons[i]||'อาจต้องใช้อุปกรณ์เสริม'}</td></tr>)}</tbody></table></section>
  </main>
}

function CartDrawer({cart,changeCartQuantity,close,navigate}) {
  const lines=groupCart(cart);
  const subtotal=lines.reduce((sum,p)=>sum+p.price*p.quantity,0);
  return <aside className="cart-drawer"><div className="cart-drawer-head"><h2>ตะกร้าสินค้า <b>{cart.length}</b></h2><button onClick={close}><X/></button></div><div className="cart-items">{lines.length?lines.map(p=><div className="cart-item" key={p.id}><img src={p.image} alt={p.name}/><div><b>{p.name}</b><small>{p.brand} · {p.quantity} ชิ้น</small><strong>{formatPrice(p.price*p.quantity)}</strong></div><button aria-label={`ลบ ${p.name}`} onClick={()=>changeCartQuantity(p.id,-p.quantity)}><X/></button></div>):<div className="empty-cart">ไม่มีสินค้าในตะกร้า</div>}</div><div className="cart-drawer-foot"><div><span>รวมทั้งหมด</span><b>{formatPrice(subtotal)}</b></div><button disabled={!cart.length} onClick={()=>{close();navigate('/cart')}}>ดูตะกร้าและสั่งซื้อทดลอง</button></div></aside>;
}

function CartPage({cart,changeCartQuantity,navigate}) {
  const lines=groupCart(cart);
  const subtotal=lines.reduce((sum,p)=>sum+p.price*p.quantity,0);
  return <main className="page container">
    <div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>ตะกร้าสินค้า</b></div><h1 className="page-title">ตะกร้าสินค้า <span>{cart.length} ชิ้น</span></h1>
    {lines.length ? <div className="cart-layout"><section className="cart-table"><div className="cart-table-head"><span>สินค้า</span><span>ราคา</span><span>จำนวน</span><span>รวม</span></div>{lines.map(p=><div className="cart-row" key={p.id}><div className="cart-product"><img src={p.image} alt={p.name}/><div><small>{p.brand}</small><b>{p.name}</b><button onClick={()=>changeCartQuantity(p.id,-p.quantity)}>ลบ</button></div></div><b>{formatPrice(p.price)}</b><div className="qty small"><button aria-label="ลดจำนวน" onClick={()=>changeCartQuantity(p.id,-1)}><Minus/></button><b>{p.quantity}</b><button aria-label="เพิ่มจำนวน" onClick={()=>changeCartQuantity(p.id,1)}><Plus/></button></div><strong>{formatPrice(p.price*p.quantity)}</strong></div>)}</section>
    <aside className="summary"><h3>สรุปคำสั่งซื้อทดลอง</h3><p>ไม่มีการชำระเงินจริงหรือจัดส่งสินค้า</p><div className="summary-lines"><p><span>รวมสินค้า</span><b>{formatPrice(subtotal)}</b></p><p className="total"><span>ยอดรวม</span><b>{formatPrice(subtotal)}</b></p></div><button className="checkout" onClick={()=>navigate('/checkout')}>ดำเนินการสั่งซื้อทดลอง</button></aside></div>
      : <div className="empty-page"><ShoppingCart/><h2>ตะกร้ายังว่างอยู่</h2><button onClick={()=>navigate('/products')}>เลือกสินค้า</button></div>}
  </main>
}

function CustomerPortal({navigate,user,orders,ordersError,onLogout,initialTab='overview'}) {
  const products=useCatalog();
  const [tab,setTab]=useState(initialTab);
  const [error,setError]=useState('');
  const handleLogout=async()=>{
    try { await onLogout(); }
    catch { setError('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  };
  const totalSpent=orders.reduce((sum,order)=>sum+order.total,0);
  const menu=[
    ['overview','ภาพรวมบัญชี',LayoutDashboard],['orders','ประวัติคำสั่งซื้อ',Package]
  ];
  return <main className="page customer-page"><div className="container">
    <div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>บัญชีลูกค้า</b></div>
    <div className="portal-layout">
      <aside className="portal-sidebar">
        <div className="member-card"><div className="avatar avatar-stand"><User/></div><div><small>สมาชิก</small><b>{user.display_name || user.email}</b><span>{user.email}</span></div></div>
        <nav>{menu.map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}><Icon/><span>{label}</span><ChevronRight/></button>)}</nav>
        <button className="secondary-auth" onClick={handleLogout}>ออกจากระบบ</button>
      </aside>
      <section className="portal-content">
        {error&&<p className="form-error" role="alert">{error}</p>}
        {ordersError&&<p className="form-error" role="alert">{ordersError}</p>}
        {tab==='overview'&&<><h1>สวัสดี, {user.display_name || user.email}!</h1><div className="portal-stats"><div><Package/><b>{orders.length}</b><span>คำสั่งซื้อทดลอง</span></div><div><Coins/><b>{formatPrice(totalSpent)}</b><span>ยอดรวมรายการทดลอง</span></div></div><h3>คำสั่งซื้อล่าสุด</h3>{orders.length ? <div className="portal-table"><b>{orders[0].orderNumber}</b><span>{formatPrice(orders[0].total)}</span><strong>ทดลอง · ไม่มีการจัดส่ง</strong><button onClick={()=>navigate('/tracking')}>ดูรายละเอียด</button></div> : <div className="order-empty">ยังไม่มีคำสั่งซื้อทดลอง</div>}</>}
        {tab==='profile'&&<><h1>แก้ไขโปรไฟล์</h1><div className="profile-grid"><div className="avatar-picker"><div className="avatar avatar-stand"><Zap/></div><small>กรอบอวาตาร์ JoJo</small><div className="avatar-options"><button className="active">สแตนด์</button><button>ออร่า</button><button>โกรธ</button></div></div><div className="profile-form"><label>ชื่อแสดงผล<input defaultValue="Jordan Wong"/></label><label>อีเมล<input defaultValue="jordan@nexora.com"/></label><label>เบอร์โทร<input defaultValue="081-234-5678"/></label><button className="primary-action">บันทึกข้อมูล</button></div></div></>}
        {tab==='addresses'&&<><h1>ที่อยู่จัดส่ง</h1><button className="primary-action"><Plus/> เพิ่มที่อยู่ใหม่</button><div className="address-grid"><article className="address-card"><span>ที่อยู่หลัก</span><b>Jordan Wong</b><p>88/42 ถนนสุขุมวิท แขวงคลองเตย เขตวัฒนา กรุงเทพมหานคร 10110<br/>081-234-5678</p><button>แก้ไข</button></article><article className="address-card"><b>บ้านพัก</b><p>15 หมู่ 6 ตำบลป่าแดด เชียงใหม่ 50100<br/>081-234-5678</p><button>แก้ไข</button></article></div></>}
        {tab==='orders'&&<><h1>ประวัติคำสั่งซื้อทดลอง</h1><p className="demo-notice">รายการด้านล่างเป็นข้อมูลสาธิต ไม่มีการชำระเงินจริงและไม่มีการจัดส่งสินค้า</p>{orders.length ? orders.map(order=><article className="order-card" key={order.orderNumber}><div><small>{new Date(order.createdAt).toLocaleString('th-TH')}</small><b>{order.orderNumber}</b><span>{formatPrice(order.total)}</span></div><strong className="status-yellow">ทดลอง</strong><button onClick={()=>navigate('/tracking')}>รายละเอียด</button></article>) : <div className="order-empty">ยังไม่มีคำสั่งซื้อทดลอง</div>}</>}
        {tab==='warranty'&&<><h1>ยื่นคำร้องเคลมสินค้า</h1><div className="claim-form"><label>เลขคำสั่งซื้อ / SKU<input placeholder="NX26082401"/></label><label>ประเภทปัญหา<select><option>สินค้าเสีย/ทำงานผิดปกติ</option><option>สินค้าชำรุดจากการขนส่ง</option></select></label><label className="full">รายละเอียด<textarea placeholder="อธิบายปัญหาและอาการที่พบ"/></label><label className="full upload-box"><Upload/><b>อัปโหลดรูปหรือวิดีโอ</b><small>สูงสุด 50 MB</small><input type="file"/></label><button className="primary-action">ส่งคำร้องเคลม</button></div></>}
        {tab==='reviews'&&<><h1>รีวิวสินค้า</h1><div className="review-card"><img src={products[0].image}/><div><b>{products[0].name}</b><div className="review-stars">★★★★★</div><textarea placeholder="บอกประสบการณ์ใช้งานของคุณ..."/></div><button className="primary-action">ส่งรีวิว +50 Coins</button></div></>}
        {tab==='coins'&&<><h1>Nexora Coins & Stand Rank</h1><div className="rank-list"><article><b>E</b><div><strong>Rank E</strong><span>สมาชิกเริ่มต้น</span></div></article><article><b>C</b><div><strong>Rank C</strong><span>ยอดซื้อ 3,000 บาท • ส่งฟรี 2 ครั้ง/เดือน</span></div></article><article className="rank-current"><b>A</b><div><strong>Rank A</strong><span>ยอดซื้อ 15,000 บาท • ส่วนลด 5%</span></div></article><article><b>S</b><div><strong>S Over Heaven</strong><span>ยอดซื้อ 50,000 บาท • ส่วนลด 10% + จองลิมิเต็ด</span></div></article></div></>}
      </section>
    </div>
  </div></main>
}

async function adminRequest(path,options={}) {
  const response=await apiFetch(path,{
    ...options,
    credentials:'include',
    headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}
  });
  let data={};
  try { data=await response.json(); }
  catch { if(!response.ok) throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'); }
  if(!response.ok) throw new Error(data.error||'ดำเนินการไม่สำเร็จ');
  return data;
}

function downloadCsv(filename,rows) {
  const csv=rows.map(row=>row.map(value=>`"${String(value??'').replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([`\uFEFF${csv}`],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;
  link.download=filename;
  link.click();
  URL.revokeObjectURL(url);
}

function AdminProductForm({initial,categories,onCancel,onSave,busy}) {
  const [form,setForm]=useState(()=>initial||{
    sku:'',name:'',brand:'',category:'',price:'',oldPrice:'',rank:'C',
    image:'',stock:0,active:true
  });
  const update=event=>{
    const {name,value,type,checked}=event.target;
    setForm(previous=>({...previous,[name]:type==='checkbox'?checked:value}));
  };
  return <form className="admin-editor" onSubmit={event=>{event.preventDefault();onSave(form);}}>
    <h2>{initial?'แก้ไขสินค้า':'เพิ่มสินค้า'}</h2>
    <div className="admin-form-grid">
      <label>SKU<input name="sku" value={form.sku} onChange={update} required maxLength={100}/></label>
      <label>ชื่อสินค้า<input name="name" value={form.name} onChange={update} required maxLength={200}/></label>
      <label>หมวดหมู่<input name="category" value={form.category} onChange={update} required maxLength={100} list="admin-category-list"/><datalist id="admin-category-list">{categories.map(value=><option key={value}>{value}</option>)}</datalist></label>
      <label>แบรนด์<input name="brand" value={form.brand} onChange={update} required maxLength={100}/></label>
      <label>ราคา<input name="price" type="number" min="0.01" step="0.01" value={form.price} onChange={update} required/></label>
      <label>ราคาเดิม<input name="oldPrice" type="number" min="0.01" step="0.01" value={form.oldPrice??''} onChange={update}/></label>
      <label>ระดับสินค้า<select name="rank" value={form.rank} onChange={update}><option value="S">S</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></label>
      <label>จำนวนสต็อก<input name="stock" type="number" min="0" max="1000000" step="1" value={form.stock} onChange={update} required/></label>
      <label className="admin-form-wide">รูปสินค้า (URL หรือ /products/...)<input name="image" value={form.image} onChange={update} required maxLength={500}/></label>
      <label className="admin-checkbox"><input name="active" type="checkbox" checked={Boolean(form.active)} onChange={update}/> แสดงสินค้าในหน้าร้าน</label>
    </div>
    <div className="admin-editor-actions"><button type="button" onClick={onCancel}>ยกเลิก</button><button className="add-primary" disabled={busy}>{busy?'กำลังบันทึก...':'บันทึกสินค้า'}</button></div>
  </form>;
}

function AdminVoucherForm({initial,onCancel,onSave,busy}) {
  const dateValue=value=>value?new Date(value).toISOString().slice(0,16):'';
  const [form,setForm]=useState(()=>initial?{
    ...initial,
    startsAt:dateValue(initial.startsAt),
    endsAt:dateValue(initial.endsAt),
    usageLimit:initial.usageLimit??''
  }:{
    code:'',discountType:'fixed',discountValue:'',minimumOrder:0,usageLimit:'',
    startsAt:'',endsAt:'',active:true
  });
  const update=event=>{
    const {name,value,type,checked}=event.target;
    setForm(previous=>({...previous,[name]:type==='checkbox'?checked:value}));
  };
  return <form className="admin-editor" onSubmit={event=>{event.preventDefault();onSave(form);}}>
    <h2>{initial?'แก้ไขโปรโมชัน':'สร้างโปรโมชัน'}</h2>
    <div className="admin-form-grid">
      <label>รหัสคูปอง<input name="code" value={form.code} onChange={update} required maxLength={50}/></label>
      <label>ประเภทส่วนลด<select name="discountType" value={form.discountType} onChange={update}><option value="fixed">ลดเป็นจำนวนเงิน</option><option value="percent">ลดเป็นเปอร์เซ็นต์</option><option value="free_shipping">ส่งฟรี</option></select></label>
      <label>มูลค่าส่วนลด<input name="discountValue" type="number" min="0" step="0.01" value={form.discountValue} onChange={update} required/></label>
      <label>ยอดสั่งซื้อขั้นต่ำ<input name="minimumOrder" type="number" min="0" step="0.01" value={form.minimumOrder} onChange={update} required/></label>
      <label>จำนวนสิทธิ์ (เว้นว่าง = ไม่จำกัด)<input name="usageLimit" type="number" min="1" step="1" value={form.usageLimit} onChange={update}/></label>
      <label>เริ่มใช้<input name="startsAt" type="datetime-local" value={form.startsAt} onChange={update}/></label>
      <label>หมดอายุ<input name="endsAt" type="datetime-local" value={form.endsAt} onChange={update}/></label>
      <label className="admin-checkbox"><input name="active" type="checkbox" checked={Boolean(form.active)} onChange={update}/> เปิดใช้งาน</label>
    </div>
    <div className="admin-editor-actions"><button type="button" onClick={onCancel}>ยกเลิก</button><button className="add-primary" disabled={busy}>{busy?'กำลังบันทึก...':'บันทึกโปรโมชัน'}</button></div>
  </form>;
}

function AdminDashboard({navigate,user}) {
  const [tab,setTab]=useState('dashboard');
  const [reload,setReload]=useState(0);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [summary,setSummary]=useState(null);
  const [orders,setOrders]=useState([]);
  const [products,setProducts]=useState([]);
  const [meta,setMeta]=useState({categories:[],brands:[]});
  const [promotions,setPromotions]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [reports,setReports]=useState([]);
  const [logs,setLogs]=useState([]);
  const [query,setQuery]=useState('');
  const [productEditor,setProductEditor]=useState(null);
  const [voucherEditor,setVoucherEditor]=useState(null);
  const [message,setMessage]=useState('');
  const roles={
    super_admin:['dashboard','orders','products','promotions','users','reports','logs'],
    order_staff:['dashboard','orders'],
    marketing:['dashboard','promotions','reports']
  };
  const allMenu=[
    ['dashboard','แดชบอร์ด',LayoutDashboard],['orders','คำสั่งซื้อทดลอง',Package],
    ['products','สินค้าและสต็อก',Grid2X2],['promotions','คูปองและโปรโมชัน',Megaphone],
    ['users','ลูกค้าและสิทธิ์',Users],['reports','รายงานทดลอง',BarChart3],
    ['logs','บันทึกการทำงาน',FileText]
  ];
  const allowedTabs=roles[user.role]||[];
  const menu=allMenu.filter(([key])=>allowedTabs.includes(key));

  useEffect(()=>{
    let active=true;
    const load=async()=>{
      setLoading(true);
      setError('');
      try {
        if(tab==='dashboard') {
          const data=await adminRequest('/api/admin/summary');
          if(active) setSummary(data);
        } else if(tab==='orders') {
          const data=await adminRequest('/api/admin/orders');
          if(active) setOrders(data.orders);
        } else if(tab==='products') {
          const [data,lookups]=await Promise.all([
            adminRequest('/api/admin/products'),adminRequest('/api/admin/meta')
          ]);
          if(active) { setProducts(data.products); setMeta(lookups); }
        } else if(tab==='promotions') {
          const data=await adminRequest('/api/admin/promotions');
          if(active) setPromotions(data.promotions);
        } else if(tab==='users') {
          const data=await adminRequest('/api/admin/customers');
          if(active) setCustomers(data.customers);
        } else if(tab==='reports') {
          const data=await adminRequest('/api/admin/reports');
          if(active) setReports(data.days);
        } else if(tab==='logs') {
          const data=await adminRequest('/api/admin/logs');
          if(active) setLogs(data.logs);
        }
      } catch(requestError) {
        if(active) setError(requestError.message||'โหลดข้อมูลหลังบ้านไม่สำเร็จ');
      } finally {
        if(active) setLoading(false);
      }
    };
    load();
    return ()=>{active=false;};
  },[tab,user.role,reload]);

  const refresh=()=>setReload(value=>value+1);
  const reportAction=async action=>{
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await action();
      refresh();
    } catch(requestError) {
      setError(requestError.message||'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };
  const saveProduct=payload=>reportAction(async()=>{
    const method=payload.id?'PUT':'POST';
    const url=payload.id?`/api/admin/products/${payload.id}`:'/api/admin/products';
    await adminRequest(url,{method,body:JSON.stringify(payload)});
    setProductEditor(null);
    setMessage('บันทึกสินค้าแล้ว');
  });
  const deactivateProduct=id=>{
    if(!window.confirm('ซ่อนสินค้านี้จากหน้าร้านหรือไม่?')) return;
    reportAction(async()=>{
      await adminRequest(`/api/admin/products/${id}`,{method:'DELETE'});
      setMessage('ซ่อนสินค้าแล้ว');
    });
  };
  const saveVoucher=payload=>reportAction(async()=>{
    const method=payload.id?'PUT':'POST';
    const url=payload.id?`/api/admin/promotions/${payload.id}`:'/api/admin/promotions';
    await adminRequest(url,{method,body:JSON.stringify(payload)});
    setVoucherEditor(null);
    setMessage('บันทึกโปรโมชันแล้ว');
  });
  const deactivateVoucher=id=>{
    if(!window.confirm('ปิดใช้งานคูปองนี้หรือไม่?')) return;
    reportAction(async()=>{
      await adminRequest(`/api/admin/promotions/${id}`,{method:'DELETE'});
      setMessage('ปิดใช้งานคูปองแล้ว');
    });
  };
  const changeRole=(id,role)=>reportAction(async()=>{
    await adminRequest(`/api/admin/customers/${id}/role`,{
      method:'PATCH',body:JSON.stringify({role})
    });
    setMessage('เปลี่ยนสิทธิ์บัญชีแล้ว');
  });
  const visibleProducts=products.filter(product=>`${product.name} ${product.sku}`.toLowerCase().includes(query.toLowerCase()));
  const visibleOrders=orders.filter(order=>`${order.orderNumber} ${order.email||''} ${order.customer}`.toLowerCase().includes(query.toLowerCase()));
  const displayDate=value=>value?new Date(value).toLocaleString('th-TH'):'—';

  return <main className="admin-page">
    <aside className="admin-sidebar">
      <button className="admin-brand" onClick={()=>setTab('dashboard')}><Zap/><b>NEXORA <small>ADMIN</small></b></button>
      <nav>{menu.map(([key,label,Icon])=><button key={key} className={tab===key?'active':''} onClick={()=>{setTab(key);setQuery('');setError('');setMessage('');}}><Icon/><span>{label}</span></button>)}</nav>
      <div className="admin-user"><div>{(user.display_name||user.email)[0].toUpperCase()}</div><span><b>{user.display_name||user.email}</b><small>{user.role}</small></span><Settings/></div>
    </aside>
    <section className="admin-main">
      <header><div><small>ADMIN CONTROL · DEMO ONLY</small><h1>{menu.find(item=>item[0]===tab)?.[1]}</h1></div><div className="admin-actions">
        {tab==='products'&&user.role==='super_admin'&&<button className="add-primary" onClick={()=>setProductEditor({})}><Plus/> เพิ่มสินค้า</button>}
        {tab==='promotions'&&<button className="add-primary" onClick={()=>setVoucherEditor({})}><Plus/> สร้างโปรโมชัน</button>}
        {tab!=='dashboard'&&<button onClick={refresh} disabled={loading}><RefreshCcw/> รีเฟรช</button>}
      </div></header>
      <p className="demo-notice admin-demo-notice">ระบบหลังบ้านสำหรับคำสั่งซื้อทดลองเท่านั้น ไม่รับชำระเงินจริงและไม่มีการจัดส่ง</p>
      {error&&<p className="form-error" role="alert">{error}</p>}
      {message&&<p className="admin-success" role="status">{message}</p>}
      {loading&&<p className="admin-loading">กำลังโหลดข้อมูล...</p>}

      {tab==='dashboard'&&summary&&<div className="metric-grid">
        <article><span>สินค้าเปิดขาย</span><b>{summary.activeProducts}</b><small>รายการ</small></article>
        <article><span>ลูกค้าสมัครแล้ว</span><b>{summary.customers}</b><small>บัญชี</small></article>
        <article><span>คำสั่งซื้อทดลอง</span><b>{summary.demoOrders}</b><small>ไม่มีการจัดส่ง</small></article>
        <article><span>ยอดรวมจำลอง</span><b>{formatPrice(summary.demoTotal)}</b><small>ไม่ใช่รายได้จริง</small></article>
        <article><span>คูปองที่เปิดใช้งาน</span><b>{summary.activeVouchers}</b><small>รายการ</small></article>
      </div>}

      {tab==='orders'&&<><div className="admin-toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="ค้นหาเลขอ้างอิงหรืออีเมล"/><button onClick={()=>downloadCsv('demo-orders.csv',[['เลขอ้างอิง','ลูกค้า','อีเมล','ยอดรวมจำลอง','วันที่'],...visibleOrders.map(order=>[order.orderNumber,order.customer,order.email,order.total,displayDate(order.createdAt)])])}>ส่งออก CSV</button></div>
        <div className="admin-table"><div className="table-head"><span>เลขอ้างอิง</span><span>ลูกค้า</span><span>สินค้า</span><span>ยอดรวม</span><span>สถานะ</span></div>
          {visibleOrders.map(order=><div className="table-row" key={order.orderNumber}><span>{order.orderNumber}</span><span>{order.customer}<small>{order.email}</small></span><span>{order.items.length} รายการ</span><span>{formatPrice(order.total)}</span><span className="order-status">ทดลอง · ไม่จัดส่ง</span></div>)}
          {!visibleOrders.length&&!loading&&<p className="admin-empty">ยังไม่มีคำสั่งซื้อทดลอง</p>}
        </div></>}

      {tab==='products'&&<><div className="admin-toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="ค้นหา SKU / ชื่อสินค้า"/><button onClick={()=>downloadCsv('products.csv',[['SKU','ชื่อสินค้า','หมวดหมู่','แบรนด์','ราคา','สต็อก','เปิดขาย'],...visibleProducts.map(product=>[product.sku,product.name,product.category,product.brand,product.price,product.stock,product.active?'ใช่':'ไม่'])])}>ส่งออก CSV</button></div>
        <div className="admin-table"><div className="table-head"><span>สินค้า</span><span>SKU</span><span>สต็อก</span><span>ราคา</span><span>จัดการ</span></div>
          {visibleProducts.map(product=><div className="table-row" key={product.id}><span><b>{product.name}</b><small>{product.category} · {product.brand}{!product.active?' · ซ่อน':''}</small></span><span>{product.sku}</span><span>{product.stock}</span><span>{formatPrice(product.price)}</span><span className="admin-row-actions"><button onClick={()=>setProductEditor(product)}>แก้ไข</button><button onClick={()=>deactivateProduct(product.id)} disabled={!product.active}>ซ่อน</button></span></div>)}
          {!visibleProducts.length&&!loading&&<p className="admin-empty">ไม่พบสินค้า</p>}
        </div></>}

      {tab==='promotions'&&<><div className="admin-toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="ค้นหารหัสคูปอง"/></div>
        <div className="admin-table"><div className="table-head"><span>รหัสคูปอง</span><span>ส่วนลด</span><span>ขั้นต่ำ / สิทธิ์</span><span>ช่วงเวลา</span><span>จัดการ</span></div>
          {promotions.filter(item=>item.code.toLowerCase().includes(query.toLowerCase())).map(voucher=><div className="table-row" key={voucher.id}><span><b>{voucher.code}</b><small>{voucher.active?'เปิดใช้งาน':'ปิดใช้งาน'}</small></span><span>{voucher.discountType==='free_shipping'?'ส่งฟรี':voucher.discountType==='percent'?`${voucher.discountValue}%`:formatPrice(voucher.discountValue)}</span><span>{formatPrice(voucher.minimumOrder)} · ใช้ {voucher.usedCount}/{voucher.usageLimit??'ไม่จำกัด'}</span><span>{displayDate(voucher.startsAt)}<small>ถึง {displayDate(voucher.endsAt)}</small></span><span className="admin-row-actions"><button onClick={()=>setVoucherEditor(voucher)}>แก้ไข</button><button onClick={()=>deactivateVoucher(voucher.id)} disabled={!voucher.active}>ปิด</button></span></div>)}
          {!promotions.length&&!loading&&<p className="admin-empty">ยังไม่มีโปรโมชัน</p>}
        </div></>}

      {tab==='users'&&<><div className="admin-toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="ค้นหาชื่อหรืออีเมล"/><button onClick={()=>downloadCsv('customers.csv',[['ชื่อ','อีเมล','เบอร์โทร','สิทธิ์','สมัครเมื่อ'],...customers.map(customer=>[customer.display_name,customer.email,customer.phone,customer.role,displayDate(customer.created_at)])])}>ส่งออก CSV</button></div>
        <div className="admin-table"><div className="table-head"><span>ลูกค้า</span><span>อีเมล</span><span>สมัครเมื่อ</span><span>สิทธิ์</span><span>จัดการ</span></div>
          {customers.filter(customer=>`${customer.display_name||''} ${customer.email}`.toLowerCase().includes(query.toLowerCase())).map(customer=><div className="table-row" key={customer.id}><span>{customer.display_name||'—'}</span><span>{customer.email}</span><span>{displayDate(customer.created_at)}</span><span>{customer.role}</span><span>{customer.role==='super_admin'?<small>แก้ไขไม่ได้</small>:<select value={customer.role} onChange={event=>changeRole(customer.id,event.target.value)}><option value="customer">ลูกค้า</option><option value="order_staff">ดูแลคำสั่งซื้อ</option><option value="marketing">การตลาด</option></select>}</span></div>)}
          {!customers.length&&!loading&&<p className="admin-empty">ยังไม่มีบัญชี</p>}
        </div></>}

      {tab==='reports'&&<><div className="report-actions"><button onClick={()=>downloadCsv('demo-report.csv',[['วันที่','จำนวนคำสั่งซื้อทดลอง','ยอดรวมจำลอง'],...reports.map(day=>[day.date,day.orderCount,day.total])])}><FileText/> ส่งออก CSV</button></div>
        <div className="admin-table"><div className="table-head"><span>วันที่</span><span>คำสั่งซื้อทดลอง</span><span>ยอดรวมจำลอง</span><span></span><span></span></div>
          {reports.map(day=><div className="table-row" key={String(day.date)}><span>{new Date(day.date).toLocaleDateString('th-TH')}</span><span>{day.orderCount}</span><span>{formatPrice(day.total)}</span><span></span><span></span></div>)}
          {!reports.length&&!loading&&<p className="admin-empty">ยังไม่มีข้อมูลในช่วง 30 วัน</p>}
        </div></>}

      {tab==='logs'&&<div className="admin-table"><div className="table-head"><span>เวลา</span><span>ผู้ดูแล</span><span>การกระทำ</span><span>ข้อมูล</span><span>รายการ</span></div>
        {logs.map(log=><div className="table-row" key={log.id}><span>{displayDate(log.createdAt)}</span><span>{log.adminEmail}</span><span>{log.action}</span><span>{log.entityType}</span><span>{log.entityId}<small>{JSON.stringify(log.details)}</small></span></div>)}
        {!logs.length&&!loading&&<p className="admin-empty">ยังไม่มีบันทึกการทำงาน</p>}
      </div>}

      {productEditor&&<div className="admin-modal"><AdminProductForm key={productEditor.id||'new'} initial={productEditor.id?productEditor:null} categories={meta.categories} busy={saving} onCancel={()=>setProductEditor(null)} onSave={saveProduct}/></div>}
      {voucherEditor&&<div className="admin-modal"><AdminVoucherForm key={voucherEditor.id||'new'} initial={voucherEditor.id?voucherEditor:null} busy={saving} onCancel={()=>setVoucherEditor(null)} onSave={saveVoucher}/></div>}
    </section>
  </main>;
}

function DeskBuilder({navigate}) {
  const products=useCatalog();
  const [selected,setSelected]=useState([products[0],products[10],products[30]]);
  const subtotal=selected.reduce((sum,p)=>sum+p.price,0);
  return <main className="page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>Bizarre Desk Builder</b></div><div className="builder-title"><div><small>BUILD YOUR STAND</small><h1>BIZARRE<br/>DESK BUILDER</h1></div><div className="set-bonus">SET BONUS <b>8%</b></div></div><div className="builder-layout"><section className="builder-slots">{selected.map((p,i)=><article key={i}><img src={p.image}/><div><small>{p.category}</small><b>{p.name}</b><span>{formatPrice(p.price)}</span></div><button onClick={()=>setSelected(prev=>prev.filter((_,j)=>j!==i))}><X/></button></article>)}</section><aside className="summary builder-summary"><h3>สรุปชุดโต๊ะของคุณ</h3><p><span>ราคารวม</span><b>{formatPrice(subtotal)}</b></p><p><span>Set Bonus 8%</span><b>-{formatPrice(Math.round(subtotal*.08))}</b></p><p className="total"><span>ราคาสุดท้าย</span><b>{formatPrice(Math.round(subtotal*.92))}</b></p><button className="checkout" onClick={()=>navigate('/cart')}>เพิ่มชุดนี้ลงตะกร้า</button></aside></div></main>
}

function EDPICalculator({navigate}) {
  const products=useCatalog();
  const [dpi,setDpi]=useState(800);
  const [sens,setSens]=useState(0.35);
  const [game,setGame]=useState('Valorant');
  const edpi=Math.round(dpi*sens);
  const zone=edpi<400?'Low':edpi<800?'Balanced':edpi<1200?'High':'Extreme';
  return <main className="page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>eDPI Calculator</b></div><div className="edpi-layout"><section className="edpi-panel"><small>PRO AIM UTILITY</small><h1>eDPI<br/>CALCULATOR</h1><label>เกมที่เล่น<select value={game} onChange={e=>setGame(e.target.value)}><option>Valorant</option><option>CS2</option><option>Apex Legends</option></select></label><label>DPI ของเมาส์<input type="range" min="400" max="3200" step="100" value={dpi} onChange={e=>setDpi(Number(e.target.value))}/><b>{dpi}</b></label><label>ความไวในเกม<input type="range" min="0.1" max="2" step="0.05" value={sens} onChange={e=>setSens(Number(e.target.value))}/><b>{sens}</b></label></section><aside className="edpi-result"><small>YOUR eDPI</small><b>{edpi}</b><span>{zone} SENSITIVITY</span><div className="aim-meter"><i style={{left:`${Math.min(95,edpi/12)}%`}}/></div><h3>เมาส์แนะนำ</h3>{products.slice(0,3).map(p=><article key={p.id} onClick={()=>navigate('/product/'+p.id)}><img src={p.image}/><div><b>{p.name}</b><span>{formatPrice(p.price)}</span></div></article>)}</aside></div></main>
}

function ReferralPage({navigate}) {
  const [copied,setCopied]=useState(false);
  const link='https://nexoragaming.com/ref/NEXORA-JORDAN';
  return <main className="page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>Referral & Affiliate</b></div><section className="referral-hero"><div><small>SHARE THE POWER</small><h1>INVITE YOUR SQUAD</h1><p>ชวนเพื่อนสมัคร รับ 200 Nexora Coins<br/>แต่ละคนยังรับส่วนลดพิเศษอีกด้วย</p></div><Coins/></section><div className="referral-layout"><section className="referral-card"><h3>ลิงก์ชวนเพื่อนของคุณ</h3><div className="ref-link"><input readOnly value={link}/><button onClick={()=>setCopied(true)}>{copied?'คัดลอกแล้ว':'คัดลอก'}</button></div><div className="ref-stats"><article><b>12</b><span>เพื่อนที่สมัคร</span></article><article><b>2,400</b><span>Coins ที่ได้</span></article><article><b>฿8,540</b><span>ยอดอ้างอิง</span></article></div></section><aside className="summary"><h3>ส่วนของ Streamer</h3><p>คอมมิชชัน 3–5% ทุกคำสั่งซื้อที่มาจากโค้ดส่วนตัว</p><label>โค้ดสตรีมเมอร์</label><div className="ref-code">NEXORA-STREAM</div><button className="checkout" onClick={()=>navigate('/account')}>เข้าสู่ Affiliate Dashboard</button></aside></div></main>
}

function StandAssistant() {
  const [open,setOpen]=useState(false);
  const [messages,setMessages]=useState([{from:'bot',text:'โอ้โห! ต้องการพลังอะไรเพิ่ม? ถามได้เลยนะ, ช่วยได้ทุกเรื่องนอกจากเรียนขับรถมอไซค์!'}]);
  const [text,setText]=useState('');
  const send=()=>{if(!text.trim())return;setMessages(prev=>[...prev,{from:'user',text},{from:'bot',text:'คำถามเจ๋งมาก! แอดมินกำลังตรวจเช็คมาให้ ถ้าต้องการคนจริงกด “เรียกแอดมิน” ได้เลยน้า'}]);setText('');};
  return <div className="stand-chat">{open&&<section className="chat-window"><header><div className="chat-avatar"><Zap/></div><div><b>Stand Assistant</b><small>ออนไลน์เสมอ ไม่คาดฝันเสมอจริง</small></div><button onClick={()=>setOpen(false)}><X/></button></header><div className="chat-messages">{messages.map((m,i)=><div key={i} className={m.from}>{m.text}</div>)}</div><button className="real-admin">เรียกแอดมินจริง</button><footer><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="พิมพ์ถามสแตนด์แอสซิส..." /><button onClick={send}><Send/></button></footer></section>}<button className="chat-fab" onClick={()=>setOpen(!open)}><MessageCircle/><b>?</b></button></div>
}

function Promotions({navigate,user}) {
  const [vouchers,setVouchers]=useState([]);
  const [error,setError]=useState('');
  const [claimed,setClaimed]=useState(new Set());
  const [claiming,setClaiming]=useState(null);
  useEffect(()=>{
    let active=true;
    Promise.all([
      apiFetch('/api/vouchers'),
      user?apiFetch('/api/vouchers/mine'):Promise.resolve(null)
    ]).then(async([publicResponse,mineResponse])=>{
      const data=await publicResponse.json();
      if(!publicResponse.ok) throw new Error(data.error||'โหลดคูปองไม่สำเร็จ');
      let claimedIds=[];
      if(mineResponse) {
        const mine=await mineResponse.json();
        if(!mineResponse.ok) throw new Error(mine.error||'โหลดคูปองของคุณไม่สำเร็จ');
        claimedIds=mine.vouchers.map(voucher=>voucher.id);
      }
      if(active) {
        setVouchers(data.vouchers);
        setClaimed(new Set(claimedIds));
        setError('');
      }
    })
      .catch(requestError=>{if(active)setError(requestError.message||'โหลดคูปองไม่สำเร็จ');});
    return ()=>{active=false;};
  },[user]);
  const claimVoucher=async voucher=>{
    if(!user) {
      navigate('/login');
      return;
    }
    setClaiming(voucher.id);
    setError('');
    try {
      const response=await apiFetch(`/api/vouchers/${voucher.id}/claim`,{
        method:'POST'
      });
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'เก็บคูปองไม่สำเร็จ');
      setClaimed(previous=>new Set(previous).add(voucher.id));
    } catch(requestError) {
      setError(requestError.message||'เก็บคูปองไม่สำเร็จ');
    } finally {
      setClaiming(null);
    }
  };
  const discountLabel=voucher=>voucher.discountType==='free_shipping'
    ? 'ส่งฟรี'
    : `ส่วนลด ${voucher.discountType==='percent'?`${voucher.discountValue}%`:formatPrice(voucher.discountValue)}`;
  return <main className="page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>โปรโมชัน</b></div><div className="promo-hero"><div><small>HOT DEALS</small><h1>MEGA<br/>GAMING SALE</h1><p>โปรโมชันและคูปองที่เปิดใช้งาน</p><button onClick={()=>navigate('/products')}>เลือกสินค้า <ArrowRight/></button></div><Gamepad2/></div><SectionTitle kicker="VOUCHER" title="คูปองสำหรับคุณ"/>{error&&<p className="form-error" role="alert">{error}</p>}<div className="voucher-grid">{vouchers.map(voucher=><article className="voucher" key={voucher.id}><div><Ticket/><b>{voucher.code}</b><small>{discountLabel(voucher)} · ขั้นต่ำ {formatPrice(voucher.minimumOrder)}</small><small>นำรหัสไปใช้ตอนบันทึกคำสั่งซื้อทดลอง</small></div><button disabled={claimed.has(voucher.id)||claiming===voucher.id} onClick={()=>claimVoucher(voucher)}>{claimed.has(voucher.id)?'เก็บแล้ว':claiming===voucher.id?'กำลังเก็บ...':user?'เก็บ':'เข้าสู่ระบบ'}</button></article>)}</div>{!vouchers.length&&!error&&<p className="order-empty">ขณะนี้ยังไม่มีคูปองที่เปิดใช้งาน</p>}</main>
}

function Compare() {
  const products=useCatalog();
  const [a,b]=[products[0],products[11]];
  return <main className="page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>เทียบสินค้า</b></div><h1 className="page-title">VS Mode <span>เปรียบเทียบสเปก</span></h1><div className="compare-grid"><div></div>{[a,b].map(p=><article key={p.id}><img src={p.image}/><small>{p.brand}</small><h3>{p.name}</h3><strong>{formatPrice(p.price)}</strong></article>)}</div><table className="compare-table"><tbody>{[['ระดับพลัง',a.rank,b.rank],['ความเร็ว',a.stats.speed,b.stats.speed],['ความแม่นยำ',a.stats.precision,b.stats.precision],['ความทนทาน',a.stats.durability,b.stats.durability],['คุ้มค่า',a.stats.value,b.stats.value],['รหัส SKU',a.sku,b.sku]].map(row=><tr key={row[0]}><th>{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table></main>
}

function WishlistPage({wishlist,toggleWishlist,addToCart,navigate}) {
  const products=useCatalog();
  const wished=products.filter(p=>wishlist.has(p.id));
  return <main className="page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>รายการที่ชอบ</b></div><SectionTitle kicker="SAVED ITEMS" title="สินค้ารายการโปรด"/>{wished.length?<div className="product-grid">{wished.map(p=><ProductCard key={p.id} product={p} wishlist={wishlist} toggleWishlist={toggleWishlist} addToCart={addToCart} navigate={navigate}/>)}</div>:<div className="empty-page"><Heart/><h2>ยังไม่มีรายการที่ชอบ</h2><button onClick={()=>navigate('/products')}>เลือกสินค้า</button></div>}</main>
}

function AuthPage({navigate,onAuth,initialRegister,checkoutRequired=false}) {
  const [register,setRegister]=useState(initialRegister);
  const [displayName,setDisplayName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>setRegister(initialRegister),[initialRegister]);

  const submit=async event=>{
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response=await apiFetch(`/api/auth/${register?'register':'login'}`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'include',
        body:JSON.stringify({displayName,email,password})
      });
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'ไม่สามารถดำเนินการได้');
      onAuth(data.user);
    } catch (requestError) {
      setError(requestError.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
    } finally {
      setBusy(false);
    }
  };

  const changeMode=nextRegister=>{
    setRegister(nextRegister);
    setError('');
    navigate(nextRegister?'/register':'/login');
  };

  return <main className="page auth-page"><form className="auth-card" onSubmit={submit}>
    <div className="auth-logo"><Zap/><b>NEXORA</b></div>
    <h1>{register?'สมัครสมาชิก':'ยินดีต้อนรับกลับ'}</h1>
    {checkoutRequired&&<p className="demo-notice">เข้าสู่ระบบหรือสมัครสมาชิกก่อนบันทึกคำสั่งซื้อทดลอง</p>}
    {register&&<><label htmlFor="signup-name">ชื่อที่ใช้แสดง</label><input id="signup-name" value={displayName} onChange={event=>setDisplayName(event.target.value)} autoComplete="name" required maxLength={100}/></>}
    <label htmlFor="auth-email">อีเมล</label><input id="auth-email" type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required maxLength={190}/>
    <label htmlFor="auth-password">รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)</label><input id="auth-password" type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete={register?'new-password':'current-password'} minLength={8} required/>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <p className="demo-notice">บัญชีใช้สำหรับระบบตัวอย่างของเว็บไซต์นี้เท่านั้น</p>
    <button type="submit" disabled={busy}>{busy?'กำลังดำเนินการ...':register?'สมัครสมาชิก':'เข้าสู่ระบบ'}</button>
    <div className="auth-divider">{register?'มีบัญชีอยู่แล้ว?':'ยังไม่มีบัญชี?'}</div>
    <button className="secondary-auth" type="button" onClick={()=>changeMode(!register)}>{register?'เข้าสู่ระบบ':'สมัครสมาชิก'}</button>
  </form></main>
}

function Checkout({cart,user,placeOrder,navigate}) {
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [voucherCode,setVoucherCode]=useState('');
  const lines=groupCart(cart);
  const subtotal=lines.reduce((sum,p)=>sum+p.price*p.quantity,0);
  const submit=async()=>{
    if(!lines.length||busy) return;
    setError('');
    setBusy(true);
    try {
      const response=await apiFetch('/api/orders',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'include',
        body:JSON.stringify({
          items:lines.map(({sku,quantity})=>({sku,quantity})),
          voucherCode:voucherCode.trim()
        })
      });
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'บันทึกคำสั่งซื้อไม่สำเร็จ');
      placeOrder(data.order);
    } catch (requestError) {
      setError(requestError.message||'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
    } finally {
      setBusy(false);
    }
  };

  if(!lines.length) return <main className="page container"><div className="empty-page"><ShoppingCart/><h2>ไม่มีสินค้าให้สั่งซื้อ</h2><button onClick={()=>navigate('/products')}>เลือกสินค้า</button></div></main>;
  return <main className="page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> ตะกร้าสินค้า <ChevronRight/> <b>ยืนยันรายการทดลอง</b></div><h1 className="page-title">ยืนยันรายการทดลอง</h1><div className="checkout-layout"><section className="checkout-form"><div className="checkout-block"><h3><b>!</b> คำสั่งซื้อจำลองเท่านั้น</h3><p className="demo-notice">เมื่อยืนยัน ระบบจะบันทึกรายการไว้ในประวัติบัญชี ไม่มีการตัดเงิน ไม่มีการส่งสินค้า และไม่มีการติดตามพัสดุ</p><p>บัญชี: <b>{user.display_name || user.email}</b> · {user.email}</p><label className="voucher-entry">รหัสคูปองทดลอง<input value={voucherCode} onChange={event=>setVoucherCode(event.target.value.toUpperCase())} maxLength={50} placeholder="เก็บคูปองจากหน้าโปรโมชันก่อน"/></label><small>ระบบตรวจสอบสิทธิ์และคำนวณส่วนลดจากฐานข้อมูลเมื่อบันทึก</small></div>{error&&<p className="form-error" role="alert">{error}</p>}</section><aside className="summary checkout-summary"><h3>รายการในตะกร้า</h3>{lines.map(p=><div className="mini-cart" key={p.id}><img src={p.image} alt={p.name}/><span><b>{p.name}</b><small>จำนวน {p.quantity}</small></span><strong>{formatPrice(p.price*p.quantity)}</strong></div>)}<div className="summary-lines"><p><span>ยอดรวมก่อนคูปอง (จำลอง)</span><b>{formatPrice(subtotal)}</b></p></div><button className="checkout" onClick={submit} disabled={busy}>{busy?'กำลังบันทึก...':'บันทึกคำสั่งซื้อทดลอง'}</button></aside></div></main>
}

function OrderConfirmation({order,navigate}) {
  return <main className="page container">
    <div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>คำสั่งซื้อทดลอง</b></div>
    <section className="info-page order-confirmation">
      <div className="info-icon"><PackageCheck/></div>
      <h1>{order?'บันทึกคำสั่งซื้อทดลองแล้ว':'ยังไม่มีคำสั่งซื้อทดลอง'}</h1>
      <p className="demo-notice">ไม่มีการเรียกเก็บเงินและไม่มีการจัดส่งสินค้า รายการนี้เป็นเพียงการทดสอบการทำงานของตะกร้าและระบบบัญชี</p>
      {order&&<div className="order-reference"><b>เลขอ้างอิง: {order.orderNumber}</b>{order.subtotal!=null&&<span>ยอดก่อนส่วนลด {formatPrice(order.subtotal)}</span>}{order.voucherCode&&<span>ใช้คูปอง {order.voucherCode} · ลด {formatPrice(order.discount||0)}</span>}<strong>ยอดรวมจำลอง {formatPrice(order.total)}</strong></div>}
      <div className="info-actions"><button onClick={()=>navigate('/orders')}>ประวัติคำสั่งซื้อ</button><button onClick={()=>navigate('/products')}>เลือกสินค้าต่อ</button></div>
    </section>
  </main>
}

function InfoPage({route,navigate}) {
  const names={
    '/checkout':'ชำระเงิน','/account':'บัญชีของฉัน','/tracking':'ติดตามคำสั่งซื้อ','/orders':'ประวัติการสั่งซื้อ',
    '/featured':'สินค้าที่แนะนำ','/best-sellers':'สินค้าขายดี','/about':'เกี่ยวกับเรา','/faq':'คำถามที่พบบ่อย',
    '/contact':'ติดต่อเรา','/warranty':'เคลมประกัน','/arcade':'Nexora Arcade','/login':'เข้าสู่ระบบ'
  };
  const title=names[route]||'NEXORA GAMING';
  if(route==='404'||route==='/404'){
    return <main className="page container error-page"><div className="error-manga"><b>404</b><span>ゴゴゴゴ</span></div><h1>ไม่พบเส้นทางนี้ในโลกที่เป็นไปได้</h1><button onClick={()=>navigate('/')}>กลับหน้าแรก</button></main>
  }
  if(route==='500'||route==='/500'){
    return <main className="page container error-page"><div className="error-manga red"><b>500</b><span>OH NO!</span></div><h1>Stand Server เกิดอุบัติเหตุ</h1><button onClick={()=>navigate('/')}>ลุกขึ้นใหม่</button></main>
  }
  if(route==='/' || route==='') return null;
  if(route==='/' ) return null;
  if(route==='checkout') return null;
  if(route==='/login'||route==='/account'||route==='/orders') {
    return <main className="page auth-page"><section className="auth-card"><div className="auth-logo"><Zap/><b>NEXORA</b></div><h1>{route==='orders'?'ประวัติการสั่งซื้อ':route==='/login'?'ยินดีต้อนรับกลับ':'เข้าสู่ระบบสมาชิก'}</h1>{route==='orders'?<div className="order-empty">ไม่มีประวัติคำสั่งซื้อในตอนนี้</div>:<><label>อีเมลหรือเบอร์โทร</label><input placeholder="name@example.com"/><label>รหัสผ่าน</label><input type="password" placeholder="••••••••"/><button>เข้าสู่ระบบ</button><div className="auth-divider">หรือ</div><button className="secondary-auth">สมัครสมาชิก</button></>}</section></main>
  }
  if(route==='checkout') return null;
  if(route==='/tracking') {
    return <main className="page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>ติดตามคำสั่งซื้อ</b></div><h1 className="page-title">ติดตามสถานะสินค้า</h1><section className="tracking-card"><div className="tracking-top"><div><small>เลขคำสั่งซื้อ</small><b>#NX26082401</b></div><div><small>คาดว่าจะถึง</small><b>28 พ.ย. 2026</b></div></div><div className="timeline"><div className="done"><i><PackageCheck/></i><b>ยืนยันคำสั่งซื้อ</b><small>26 พ.ย. 14:20</small></div><div className="done"><i><PackageCheck/></i><b>จัดเตรียมสินค้า</b><small>26 พ.ย. 16:05</small></div><div className="active"><i><Truck/></i><b>กำลังจัดส่ง</b><small>27 พ.ย. 09:30</small></div><div><i><MapPin/></i><b>จัดส่งสำเร็จ</b><small>รออัปเดต</small></div></div></section></main>
  }
  return <main className="page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>{title}</b></div><section className="info-page"><div className="info-icon"><Sparkles/></div><h1>{title}</h1><p>หน้านี้พร้อมให้บริการในระบบ Nexora Gaming ครบวงจร เพิ่มเติมเนื้อหาของธุรกิจและข้อมูลสั่งซื้อได้ตามความต้องการ</p><div className="info-actions"><button onClick={()=>navigate('/products')}>เลือกซื้อสินค้า</button><button onClick={()=>navigate('/')}>กลับหน้าแรก</button></div></section></main>
}

function NexoraArcade() {
  const [section,setSection]=useState('smasher');
  const [smashTime,setSmashTime]=useState(10);
  const [hits,setHits]=useState(0);
  const [running,setRunning]=useState(false);
  const [gachaUsed,setGachaUsed]=useState(false);
  const [gachaResult,setGachaResult]=useState('');
  const [reactionReady,setReactionReady]=useState(false);
  const [reactionMs,setReactionMs]=useState(null);
  const [poseDone,setPoseDone]=useState(false);
  const [timeSale,setTimeSale]=useState(false);
  const [saleTime,setSaleTime]=useState(9);
  const reactionStart=React.useRef(0);
  const hitsWindow=React.useRef([]);

  useEffect(()=>{
    if(!running)return;
    if(smashTime<=0){setRunning(false);return;}
    const timer=setTimeout(()=>setSmashTime(t=>t-1),1000);
    return()=>clearTimeout(timer);
  },[running,smashTime]);

  useEffect(()=>{
    if(!timeSale)return;
    if(saleTime<=0){setTimeSale(false);setSaleTime(9);return;}
    const timer=setTimeout(()=>setSaleTime(t=>t-1),1000);
    return()=>clearTimeout(timer);
  },[timeSale,saleTime]);

  const startSmash=()=>{setHits(0);setSmashTime(10);setRunning(true);hitsWindow.current=[]};
  const smash=()=>{
    if(!running)return;
    const now=Date.now();
    hitsWindow.current=[...hitsWindow.current.filter(t=>now-t<1000),now];
    if(hitsWindow.current.length>12)return;
    setHits(h=>h+1);
  };
  const spinGacha=()=>{
    if(gachaUsed)return;
    setGachaUsed(true);
    const rewards=['ส่วนลด 50 บาท','ส่วนลด 10%','100 Nexora Coins','Mystery Stand Box'];
    setGachaResult(rewards[Math.floor(Math.random()*rewards.length)]);
  };
  const prepareReaction=()=>{
    setReactionMs(null);setReactionReady(false);
    setTimeout(()=>{reactionStart.current=performance.now();setReactionReady(true)},1200+Math.random()*2200);
  };
  const clickReaction=()=>{if(reactionReady){setReactionMs(Math.round(performance.now()-reactionStart.current));setReactionReady(false)}};

  return <main className="page arcade-page container"><div className="breadcrumbs">หน้าแรก <ChevronRight/> <b>Nexora Arcade</b></div>
    {timeSale&&<div className="time-stop"><span>THE WORLD • TIME STOP SALE</span><b>{saleTime}</b><em>ลด 90%</em></div>}
    <div className="arcade-hero"><div><small>BIZARRE GAMES</small><h1>NEXORA<br/>ARCADE</h1><p>โซนรับ Coins และโชคส่วนลดพิเศษ</p></div><Gamepad2/></div>
    <nav className="arcade-tabs">{[['smasher','ORA! Smasher'],['gacha','Gachapon'],['reaction','Reaction Arena'],['pose','Pose Challenge'],['mystery','Mystery Box']].map(([key,label])=><button key={key} className={section===key?'active':''} onClick={()=>setSection(key)}>{label}</button>)}</nav>
    {section==='smasher'&&<section className="smasher"><div className="wall" style={{transform:`scale(${1-Math.min(hits,100)*.004})`}}><span>ORA!</span><div className="wall-cracks"/></div><div className="game-info"><b>{smashTime}</b><span>วินาที</span><strong>{hits} HITS</strong><button onClick={running?smash:startSmash}>{running?'ORA ORA ORA!':'เริ่มทุบกำแพง'}</button><small>รัว Spacebar หรือกดปุ่ม • จำกัดความเร็วกัน Auto-Clicker</small></div></section>}
    {section==='gacha'&&<section className="gacha"><div className="gachapon"><div className="gacha-dome"/><div className="gacha-dial"/></div><div className="game-info"><h2>50 Coins / ฟรี 1 ครั้งต่อวัน</h2><b>{gachaResult||'???'}</b><button onClick={spinGacha} disabled={gachaUsed}>{gachaUsed?'ใช้สิทธิ์แล้ว':'หมุนกาชา'}</button></div></section>}
    {section==='reaction'&&<section className="reaction-arena"><button className={reactionReady?'ready':''} onPointerDown={reactionReady?clickReaction:prepareReaction}><span>{reactionReady?'คลิกตอนนี้!':'เตรียมพร้อม'}</span><b>{reactionMs!==null?`${reactionMs} ms`:''}</b></button><h3>Leaderboard</h3><ol><li>JOTARO — 184 ms</li><li>WONG.EXE — 212 ms</li><li>KIRA FAN — 238 ms</li></ol></section>}
    {section==='pose'&&<section className="pose-challenge"><div><Sparkles/><h2>JoJo Pose Challenge</h2><p>อัปโหลดรูปโพสท่าคู่กล่องพัสดุ สำหรับ 500 Coins หลังแอดมินอนุมัติ</p></div><label className="upload-box"><Upload/><b>อัปโหลดรูปโจโจ้โพส</b><input type="file" accept="image/*" onChange={()=>setPoseDone(true)}/></label>{poseDone&&<button className="primary-action">ส่งอนุมัติรับ 500 Coins</button>}</section>}
    {section==='mystery'&&<section className="mystery-box"><div className="mystery-card"><small>ความลับภายในกล่อง</small><b>คำใบ้พลังพิเศษ</b><p>"พลังคลื่นไฟฟ้า แฝงอยู่ใน Rank S"</p><span className="rank rank-S">S</span></div><button onClick={()=>setTimeSale(true)}>เปิดเผยและเริ่ม Time Stop Sale</button></section>}
  </main>
}

function VirtualSwitchWidget({switchStyle,setSwitchStyle,soundOn}) {
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState('');
  useEffect(()=>{
    if(!open)return;
    const onKey=e=>{setActive(e.key.length===1?e.key.toUpperCase():e.key);if(soundOn)playTone('keyboard',switchStyle)};
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[open,switchStyle,soundOn]);
  return <div className="switch-widget">{open&&<section><h3>Virtual Switch Tester</h3><div className="switch-options">{['blue','red','typewriter'].map(s=><button key={s} className={switchStyle===s?'active':''} onClick={()=>setSwitchStyle(s)}>{s==='blue'?'Blue Switch':s==='red'?'Red Switch':'Typewriter'}</button>)}</div><div className={`rgb-key ${active?'lit':''}`}>{active||'PRESS ANY KEY'}<i/></div></section>}<button onClick={()=>setOpen(v=>!v)}>⌨ Switch</button></div>
}

function MobileBottomBar({navigate,route}) {
  return <nav className="mobile-bottom"><button className={route==='/'?'active':''} onClick={()=>navigate('/')}><Grid2X2/><span>หน้าแรก</span></button><button className={route==='/'?'':''} onClick={()=>navigate('/products')}><Search/><span>ค้นหา</span></button><button onClick={()=>navigate('/arcade')}><Gamepad2/><span>Arcade</span></button><button onClick={()=>navigate('/account')}><User/><span>บัญชี</span></button></nav>
}

function Footer({navigate}) {
  return <footer className="footer"><div className="container footer-grid"><div><button className="brand footer-brand" onClick={()=>navigate('/')}><span className="brand-mark"><Zap fill="currentColor"/></span><span><b>NEXORA</b><small>GAMING</small></span></button><p>อุปกรณ์เกมมิ่งและฮาร์ดแวร์คอมพิวเตอร์แท้ ของแท้ 100% รับประกันศูนย์ไทย</p></div><div><h4>ช้อปสินค้า</h4><button onClick={()=>navigate('/products')}>สินค้าทั้งหมด</button><button onClick={()=>navigate('/promotions')}>โปรโมชั่น</button><button onClick={()=>navigate('/desk-builder')}>Desk Builder</button><button onClick={()=>navigate('/compare')}>เทียบสินค้า</button></div><div><h4>บริการลูกค้า</h4><button onClick={()=>navigate('/account')}>บัญชีลูกค้า</button><button onClick={()=>navigate('/tracking')}>ติดตามคำสั่งซื้อ</button><button onClick={()=>navigate('/referral')}>Referral</button><button onClick={()=>navigate('/admin')}>Admin Dashboard</button></div><div><h4>ติดต่อเรา</h4><p>LINE: @nexoragaming<br/>โทร: 02-123-4567<br/>อีเมล: support@nexoragaming.com</p></div></div><div className="container footer-bottom"><span>© 2026 Nexora Gaming. All rights reserved.</span><span>PromptPay • Visa • Mastercard • TrueMoney</span></div></footer>
}

createRoot(document.getElementById('root')).render(<App />);
