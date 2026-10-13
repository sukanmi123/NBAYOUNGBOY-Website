import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Bookmark, ChevronDown, ChevronRight, Search, ShoppingCart, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { images, shopMenus, type ShopMenuLink } from '@/lib/shop-data';
import { authClient } from '@/lib/auth-client';
import aliceHollywoodImage from '@/assets/explore-alice-hollywood.jpg';
import airJordanImage from '@/assets/explore-air-jordan-2026.jpg';
import hottestRappersImage from '@/assets/explore-100-hottest-rappers.jpg';
import sneakerShoppingImage from '@/assets/explore-sneaker-shopping.jpg';
import playboiCartiFeaturedImage from '@/assets/featured-playboi-carti.jpg';
import nikeFeaturedImage from '@/assets/featured-nike.jpg';
import crocsFeaturedImage from '@/assets/featured-crocs.jpg';
import vansFeaturedImage from '@/assets/featured-vans.jpg';

const featureCards = [
  { title: 'Alice Hollywood', subtitle: 'ComplexCon 2026', href: 'https://www.complex.com/style/a/mike-destefano/shane-gonzales-alice-hollywood-complexcon-2026', image: aliceHollywoodImage },
  { title: 'Air Jordan 2026', subtitle: 'Release Dates', href: 'https://www.complex.com/sneakers/a/victor-deng/air-jordan-2026-release-dates', image: airJordanImage },
  { title: '100 Hottest Rappers', subtitle: 'September 2026', href: 'https://www.complex.com/music/a/dimassanfiorenzo/best-rappers-right-now', image: hottestRappersImage },
  { title: 'Sneaker Shopping', subtitle: 'Ryan Reynolds', href: 'https://www.complex.com/v/sneaker-shopping', image: sneakerShoppingImage },
];

const featuredCards = [
  { title: 'Playboi Carti', subtitle: 'Mitchell & Ness + NBA', href: 'https://www.complex.com/shop/artists/playboi%20carti', image: playboiCartiFeaturedImage },
  { title: 'Nike', subtitle: 'Air Max Metro', href: 'https://www.complex.com/shop/brands/nike', image: nikeFeaturedImage },
  { title: 'Crocs', subtitle: 'Roy', href: 'https://www.complex.com/shop/brands/Crocs', image: crocsFeaturedImage },
  { title: 'Vans', subtitle: 'Harris Tweed®', href: 'https://www.complex.com/shop/brands/vans', image: vansFeaturedImage },
];

function Destination({ item, onSelect }: { item: ShopMenuLink; onSelect?: () => void }) {
  return item.label === 'YoungBoy Never Broke Again'
    ? <Link to="/" onClick={onSelect}>{item.label}</Link>
    : <a href={item.href} onClick={onSelect}>{item.label}</a>;
}

export function ShopNavigation({ open, onOpenChange, onSearch, onSaved, onBag, savedOnly, count }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSearch: () => void;
  onSaved: () => void; onBag: () => void; savedOnly: boolean; count: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigation.current?.contains(event.target)) setActive(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActive(null); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [active]);
  const close = () => { setExpanded(null); onOpenChange(false); };
  const menu = shopMenus.find(item => item.label === active);

  return <>
    <nav ref={navigation} className="shop-nav shop-navigation" aria-label="Shop categories" onMouseLeave={() => setActive(null)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(null); }}>
      <div className="nav-items">{shopMenus.map(item => <div className={`nav-item ${active === item.label ? 'nav-item-active' : ''}`} key={item.label} onMouseEnter={() => setActive(item.label)}>
        <a href={item.href} onFocus={() => setActive(item.label)}>{item.label}</a>
      </div>)}</div>
      {menu && <div id="shop-mega-menu" className="shop-mega-menu" aria-label={`${menu.label} menu`}>
        <div className={`mega-inner${menu.label === 'EXPLORE' ? ' mega-inner-explore' : ''}${menu.label === 'FEATURED' ? ' mega-inner-featured' : ''}`}>
          <div className="mega-feature-header"><a href={menu.href}>View all {menu.label}{!['EXPLORE', 'FEATURED'].includes(menu.label) && <ChevronRight size={18} />}</a></div>
          {['EXPLORE', 'FEATURED'].includes(menu.label) ? <div className="mega-feature-shell">
            <div className="mega-feature-grid">{(menu.label === 'FEATURED' ? featuredCards : featureCards).map(card => <a className="mega-feature-card" key={card.title} href={card.href} onClick={() => setActive(null)}>
              <img src={card.image} alt={card.title} />
              <div className="mega-feature-copy"><span>{card.title}</span><small>{card.subtitle}</small></div>
            </a>)}</div>
          </div> : <>
            <div className={`mega-link-grid${menu.label === 'FEATURED' ? ' mega-brand-grid' : ''}`}>
              {menu.groups.map(group => <div className="mega-group" key={group.title}><h2>{group.title}</h2>{group.links.map(item => <Destination key={`${group.title}-${item.label}`} item={item} onSelect={() => setActive(null)} />)}</div>)}
            </div>
          </>}
        </div>
      </div>}
    </nav>
    <Dialog open={open} onOpenChange={value => { if (!value) setExpanded(null); onOpenChange(value); }}><DialogContent className="shop-dialog navigation-drawer">
      <DialogTitle>COMPLEX SHOP</DialogTitle><DialogDescription className="sr-only">Shop navigation</DialogDescription>
      <div className="drawer-scroll"><nav className="drawer-categories" aria-label="Main menu">{shopMenus.map(item => <div className="drawer-category" key={item.label}>
        <div className="drawer-category-row"><a href={item.href}>{item.label}</a><Button variant="shopIcon" aria-label={`Expand ${item.label}`} aria-expanded={expanded === item.label} aria-controls={`drawer-${item.label}`} onClick={() => setExpanded(expanded === item.label ? null : item.label)}><ChevronDown className={expanded === item.label ? 'chevron-open' : ''} /></Button></div>
        {expanded === item.label && <div className="drawer-submenu" id={`drawer-${item.label}`}>{item.groups.map(group => <div key={group.title}><h3>{group.title}</h3>{group.links.map(link => <Destination key={link.href} item={link} onSelect={close} />)}</div>)}</div>}
      </div>)}</nav>
      <div className="drawer-tools"><Button variant="ghost" onClick={() => { close(); onSearch(); }}><Search />Search</Button><Button variant="ghost" onClick={() => { close(); onSaved(); }}><Bookmark />{savedOnly ? 'All products' : 'Saved products'}</Button><Button variant="ghost" asChild><a href="/admin-login"><UserRound />Admin dashboard</a></Button><Button variant="ghost" onClick={() => { close(); onBag(); }}><ShoppingCart />Your bag ({count})</Button><Button variant="ghost" onClick={async () => { close(); await authClient.signOut(); window.location.assign('/login'); }}>Sign out</Button></div></div>
    </DialogContent></Dialog>
  </>;
}
