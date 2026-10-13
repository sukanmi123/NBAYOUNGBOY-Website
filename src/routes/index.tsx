import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  Bookmark,
  Check,
  ChevronRight,
  Copy,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { articles, artists, images, type Product } from "@/lib/shop-data";
import logo from "@/assets/complex-logo.svg.asset.json";
import aboutYoungBoyImage from "@/assets/about-youngboy.jpg";
import { ShopNavigation } from "@/components/shop-navigation";
import { getCatalogProducts, getSignedInUser } from "@/lib/auth.server";
import {
  createChimePaymentOrder,
  createGiftCardPaymentOrder,
  getCustomerOrderStatus,
  getPaymentSetup,
  submitChimePaymentReport,
  submitGiftCardPaymentReport,
  submitCheckoutOrder,
} from "@/lib/checkout.server";
import {
  CHIME_PAYMENT_TAG,
  GIFT_CARD_RECIPIENT_EMAIL,
  VENMO_USERNAME,
  paymentMethods,
  type PaymentMethod,
  type PaymentSetup,
  type ShippingDetails,
} from "@/lib/checkout.shared";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (!(await getSignedInUser())) throw redirect({ to: "/login" });
  },
  loader: async () => ({ customProducts: await getCatalogProducts() }),
  head: () => ({
    meta: [
      { title: "YoungBoy Never Broke Again | Complex Shop" },
      {
        name: "description",
        content:
          "Shop the YoungBoy Never Broke Again collection, including Ed Hardy apparel, footwear, accessories, vinyl, and CDs.",
      },
      { property: "og:title", content: "YoungBoy Never Broke Again | Complex Shop" },
      {
        property: "og:description",
        content:
          "Shop the latest YoungBoy Never Broke Again clothing, music, and accessories.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Shop,
});
const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
type CartItem = { product: Product; size: string; quantity: number };
const latestProductIds = [11, 12, 13, 14, 1, 5, 3, 4, 2, 7, 6];
const artistDescription = `Hailing from Baton Rouge, Louisiana, YoungBoy Never Broke Again built his career through an unusually prolific run of mixtapes and albums. Born Kentrell DeSean Gaulden, he developed a sound that brings Southern rap together with melodic vocals and direct, personal storytelling. Early projects such as 38 Baby and AI YoungBoy introduced the urgency and openness that would become central to his music, while Until Death Call My Name brought that style to an even wider audience.\n\nHis songs shift between reflection and confrontation, drawing on family, relationships, ambition, loss, and the realities of life in Baton Rouge. Rather than settling into one sound, he moves between spare, intimate performances and forceful records built around memorable hooks. Projects including Top, Sincerely, Kentrell, The Last Slimeto, and I Rest My Case trace that development and show the breadth of his catalog.\n\nKnown for his distinctive melodic delivery and unfiltered point of view, YoungBoy has earned a devoted audience across generations of rap listeners. His emotionally candid approach has helped shape the sound of contemporary hip-hop, influencing artists who bring vulnerability and melody into their own work. With a body of music defined by consistency, intensity, and a distinctly Southern perspective, he remains a singular voice in modern rap.`;

function Shop() {
  const { customProducts } = Route.useLoaderData();
  const catalogProducts: Product[] = customProducts;
  const [query, setQuery] = useState("");
  const [newsletterMessage, setNewsletterMessage] = useState("");
  const [sort, setSort] = useState("Trending");
  const [filterOpen, setFilterOpen] = useState(false);
  const [colors, setColors] = useState<string[]>([]);
  const [followed, setFollowed] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [size, setSize] = useState("");
  const [error, setError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [shipping, setShipping] = useState<ShippingDetails>({
    name: "",
    email: "",
    phone: "",
    address: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
  });
  const [paymentSetup, setPaymentSetup] = useState<PaymentSetup | null>(null);
  const [paymentSetupError, setPaymentSetupError] = useState("");
  const [copiedPaymentTag, setCopiedPaymentTag] = useState<
    "venmo" | "chime" | "gift_card" | null
  >(null);
  const [copyPaymentError, setCopyPaymentError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [chimeOrderIntent, setChimeOrderIntent] = useState<{
    orderNumber: string;
    confirmationToken: string;
    totalCents: number;
  } | null>(null);
  const [giftCardOrderIntent, setGiftCardOrderIntent] = useState<{
    orderNumber: string;
    confirmationToken: string;
    totalCents: number;
  } | null>(null);
  const [orderConfirmation, setOrderConfirmation] = useState<{
    orderNumber: string;
    confirmationToken: string;
    totalCents: number;
    paymentMethod: PaymentMethod;
    status: "paid" | "processing" | "cancelled" | "pending_verification" | "pending_payment" | "awaiting_payment";
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const orderConfirmed = orderConfirmation !== null && ["paid", "processing"].includes(orderConfirmation.status);
  const orderCancelled = orderConfirmation?.status === "cancelled";
  useEffect(() => {
    if (!orderConfirmation || ["paid", "processing", "cancelled"].includes(orderConfirmation.status)) return;
    let active = true;
    const refreshStatus = async () => {
      try {
        const latest = await getCustomerOrderStatus({
          data: { orderNumber: orderConfirmation.orderNumber, confirmationToken: orderConfirmation.confirmationToken },
        });
        if (active) setOrderConfirmation((current) => {
          if (!current || current.orderNumber !== latest.orderNumber) return current;
          return { ...current, status: latest.status as typeof current.status };
        });
      } catch {
        // A temporary status lookup failure should not hide the customer's existing order details.
      }
    };
    const timer = window.setInterval(() => void refreshStatus(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orderConfirmation?.orderNumber, orderConfirmation?.confirmationToken, orderConfirmation?.status]);
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  const copyPaymentTag = async (
    method: "venmo" | "chime" | "gift_card",
    tag: string,
  ) => {
    setCopyPaymentError("");
    try {
      await navigator.clipboard.writeText(tag);
      setCopiedPaymentTag(method);
      window.setTimeout(() => {
        setCopiedPaymentTag((current) => (current === method ? null : current));
      }, 2000);
    } catch {
      setCopyPaymentError("Copy failed. Select the payment tag and copy it manually.");
    }
  };
  const visible = catalogProducts
    .filter(
      (product) =>
        (!query ||
          `${product.name} ${product.brand} YoungBoy Never Broke Again`
            .toLowerCase()
            .includes(query.toLowerCase())) &&
        (!colors.length || colors.includes(product.color)) &&
        (!savedOnly || saved.includes(product.id)),
    )
    .sort((a, b) =>
      sort === "Price: Low to High"
        ? a.price - b.price
        : sort === "Price: High to Low"
          ? b.price - a.price
          : sort === "Name: A–Z"
            ? a.name.localeCompare(b.name)
            : a.id - b.id,
    );
  const openProduct = (product: Product) => {
    setSelected(product);
    setSize(["Music", "Accessories"].includes(product.category) ? "ONE SIZE" : "");
    setError("");
  };
  const addToBag = () => {
    if (!selected) return;
    if (!size) {
      setError("Please select a size.");
      return;
    }
    const match = cart.find((item) => item.product.id === selected.id && item.size === size);
    setCart(
      match
        ? cart.map((item) => (item === match ? { ...item, quantity: item.quantity + 1 } : item))
        : [...cart, { product: selected, size, quantity: 1 }],
    );
    setSelected(null);
    setCartOpen(true);
  };
  const changeQuantity = (index: number, delta: number) =>
    setCart(
      cart
        .map((item, i) => (i === index ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0),
    );
  const totalCount = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotalCents = cart.reduce(
    (total, item) => total + Math.round(item.product.price * 100) * item.quantity,
    0,
  );
  const selectPaymentMethod = async (method: PaymentMethod) => {
    setPaymentMethod(method);
    setCheckoutError("");
    setPaymentSetupError("");
    if (paymentSetup) return;
    try {
      setPaymentSetup(await getPaymentSetup());
    } catch {
      // Public handles are known locally, but payment submission still needs the Worker.
      setPaymentSetup({
        databaseConfigured: false,
        venmoUsername: VENMO_USERNAME,
        chimeDestination: CHIME_PAYMENT_TAG,
      });
      setPaymentSetupError("Payment instructions could not be loaded. Please try again later.");
    }
  };
  const submitOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentMethod) {
      setCheckoutError("Choose a payment method to continue.");
      return;
    }
    setCheckoutPending(true);
    setCheckoutError("");
    try {
      const setup = paymentSetup ?? (await getPaymentSetup());
      setPaymentSetup(setup);
      if (!setup.databaseConfigured) {
        setCheckoutError(
          "Checkout is not configured yet: this Cloudflare Worker has no D1 database binding named PAYMENTS_DB. The shop owner must add that binding in Cloudflare and apply the checkout migrations. No order was placed.",
        );
        return;
      }
      if (paymentMethod === "venmo" && !setup.venmoUsername) {
        setCheckoutError(
          "Venmo is not configured yet. The shop owner must set a public Venmo username.",
        );
        return;
      }
      if (paymentMethod === "chime" && !setup.chimeDestination) {
        setCheckoutError(
          "Chime is not configured yet. The shop owner must set a public payment destination.",
        );
        return;
      }
      if (paymentMethod === "chime") {
        const intent = await createChimePaymentOrder({
          data: {
            items: cart.map((item) => ({
              productId: item.product.id,
              size: item.size,
              quantity: item.quantity,
            })),
            shipping,
          },
        });
        setChimeOrderIntent(intent);
        return;
      }
      if (paymentMethod === "gift_card") {
        const intent = await createGiftCardPaymentOrder({
          data: {
            items: cart.map((item) => ({
              productId: item.product.id,
              size: item.size,
              quantity: item.quantity,
            })),
            shipping,
          },
        });
        setGiftCardOrderIntent(intent);
        return;
      }
      const result = await submitCheckoutOrder({
        data: {
          paymentMethod,
          items: cart.map((item) => ({
            productId: item.product.id,
            size: item.size,
            quantity: item.quantity,
          })),
          shipping,
        },
      });
      setOrderConfirmation(result);
      setCart([]);
    } catch (caught) {
      setCheckoutError(
        caught instanceof Error ? caught.message : "Checkout failed. Please try again.",
      );
    } finally {
      setCheckoutPending(false);
    }
  };
  const reportChimePaymentSent = async () => {
    if (!chimeOrderIntent) return;
    setCheckoutPending(true);
    setCheckoutError("");
    try {
      const result = await submitChimePaymentReport({
        data: {
          orderNumber: chimeOrderIntent.orderNumber,
          confirmationToken: chimeOrderIntent.confirmationToken,
        },
      });
      setOrderConfirmation({
        ...result,
        confirmationToken: chimeOrderIntent.confirmationToken,
        totalCents: chimeOrderIntent.totalCents,
      });
      setCart([]);
      setChimeOrderIntent(null);
    } catch (caught) {
      setCheckoutError(
        caught instanceof Error
          ? caught.message
          : "Unable to submit the payment for verification. Please try again.",
      );
    } finally {
      setCheckoutPending(false);
    }
  };
  const reportGiftCardPaymentSent = async () => {
    if (!giftCardOrderIntent) return;
    setCheckoutPending(true);
    setCheckoutError("");
    try {
      const result = await submitGiftCardPaymentReport({
        data: {
          orderNumber: giftCardOrderIntent.orderNumber,
          confirmationToken: giftCardOrderIntent.confirmationToken,
        },
      });
      setOrderConfirmation({
        ...result,
        confirmationToken: giftCardOrderIntent.confirmationToken,
        totalCents: giftCardOrderIntent.totalCents,
      });
      setCart([]);
      setGiftCardOrderIntent(null);
    } catch (caught) {
      setCheckoutError(
        caught instanceof Error
          ? caught.message
          : "Unable to submit the gift card for verification. Please try again.",
      );
    } finally {
      setCheckoutPending(false);
    }
  };
  const searchField = (mobile = false) => (
    <label className={`search-box${mobile ? " mobile-search" : ""}`}>
      <Search size={21} strokeWidth={1.5} />
      <input
        aria-label="Search products"
        placeholder="Search sneakers, brands, or styles..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
  );

  return (
    <div className="shop-shell">
      <header className="shop-header">
        <div className="promo-strip">
          <a href="https://www.complex.com/shop/artists/destroy%20lonely">
            Destroy Lonely x Von Dutch Hollywood
          </a>
        </div>
        <div className="header-line">
          <div className="header-inner">
            <Button
              variant="shopIcon"
              aria-label="Open menu"
              title="Menu"
              onClick={() => setMenuOpen(true)}
            >
              <Menu />
            </Button>
            <a href="https://www.complex.com/shop" aria-label="Complex Shop">
              <img className="shop-logo" src={logo.url} alt="Complex Shop" />
            </a>
            <div className="header-tools">
              {searchField()}
              <Button
                variant="shopIcon"
                className="desktop-account"
                aria-label={savedOnly ? "Show all products" : "Show saved products"}
                title="Saved products"
                onClick={() => setSavedOnly(!savedOnly)}
              >
                <Bookmark fill={savedOnly ? "currentColor" : "none"} />
              </Button>
              <Button
                variant="shopIcon"
                className="desktop-account"
                aria-label="My account"
                title="My account"
                asChild
              >
                <a href="/admin-login">
                  <UserRound />
                </a>
              </Button>
              <Button
                variant="shopIcon"
                className="cart-icon"
                aria-label={`Cart, ${totalCount} items`}
                title="Shopping cart"
                onClick={() => setCartOpen(true)}
              >
                <ShoppingCart />
                {totalCount > 0 && <span className="cart-count">{totalCount}</span>}
              </Button>
            </div>
          </div>
        </div>
        <ShopNavigation
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onSearch={() => setMobileSearchOpen(true)}
          onSaved={() => setSavedOnly(!savedOnly)}
          onBag={() => setCartOpen(true)}
          savedOnly={savedOnly}
          count={totalCount}
        />
      </header>

      <main className="shop-main">
        <section className="artist-banner" aria-label="YoungBoy Never Broke Again">
          <div className="artist-intro">
            <div className="artist-eyebrow">
              <a href="https://www.complex.com/shop/collections/music-all">MUSIC</a> ›{" "}
              <Link to="/">YOUNGBOY NEVER BROKE AGAIN</Link>
            </div>
            <div className="artist-title">
              <h1>YoungBoy Never Broke Again</h1>
              <Button
                variant="shopOutline"
                aria-pressed={followed}
                onClick={() => setFollowed(!followed)}
              >
                {followed && <Check />}
                {followed ? "Following" : "Follow"}
              </Button>
            </div>
            <p className={`artist-bio${bioExpanded ? " artist-bio-expanded" : ""}`}>
              {artistDescription}
            </p>
            <button
              className="artist-bio-toggle"
              type="button"
              aria-expanded={bioExpanded}
              onClick={() => setBioExpanded(!bioExpanded)}
            >
              {bioExpanded ? "Read Less" : "Read More"}{" "}
              <ChevronRight
                className={bioExpanded ? "bio-chevron bio-chevron-open" : "bio-chevron"}
              />
            </button>
          </div>
          <img className="artist-image" src={images[0]} alt="YoungBoy Never Broke Again" />
        </section>
        <section className="latest-artist" aria-labelledby="latest-artist-title">
          <div className="latest-artist-heading">
            <p>LATEST FROM ARTIST</p>
            <h2 id="latest-artist-title">YOUNGBOY NEVER BROKE AGAIN X ED HARDY</h2>
            <p className="latest-artist-description">
              YoungBoy Never Broke Again meets Ed Hardy’s iconic tattoo-inspired aesthetic in a
              limited collaboration.
            </p>
          </div>
          <div className="latest-product-grid">
            {latestProductIds
              .map((id) => catalogProducts.find((product) => product.id === id))
              .filter((product): product is Product => Boolean(product))
              .map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-visual">
                    <a
                      href={`https://www.complex.com/shop/products/${product.slug}`}
                      onClick={(event) => {
                        event.preventDefault();
                        openProduct(product);
                      }}
                      aria-label={`View ${product.name}`}
                    >
                      <img
                        className="product-front"
                        src={images[product.image]}
                        alt={product.name}
                        loading="lazy"
                      />
                      <img
                        className="product-back"
                        src={images[product.secondImage]}
                        alt={`${product.name}, alternate view`}
                        loading="lazy"
                      />
                    </a>
                    <Button
                      variant="shopIcon"
                      className={`product-save ${saved.includes(product.id) ? "saved" : ""}`}
                      aria-label={`${saved.includes(product.id) ? "Unsave" : "Save"} ${product.name}`}
                      aria-pressed={saved.includes(product.id)}
                      onClick={() =>
                        setSaved(
                          saved.includes(product.id)
                            ? saved.filter((id) => id !== product.id)
                            : [...saved, product.id],
                        )
                      }
                    >
                      <Bookmark />
                    </Button>
                    <Button
                      variant="shopIcon"
                      className="product-add"
                      aria-label={`Quick add ${product.name}`}
                      onClick={() => openProduct(product)}
                    >
                      <Plus />
                    </Button>
                  </div>
                  <a
                    className="product-info"
                    href={`https://www.complex.com/shop/products/${product.slug}`}
                    onClick={(event) => {
                      event.preventDefault();
                      openProduct(product);
                    }}
                  >
                    <div className="product-artist">YoungBoy Never Broke Again</div>
                    {product.brand && <div className="product-brand">{product.brand}</div>}
                    <div className="product-name">{product.name}</div>
                    <div className="product-price">{money(product.price)}</div>
                  </a>
                </article>
              ))}
          </div>
        </section>
        <section className="catalog" aria-label="YoungBoy product collection">
          <div className="catalog-bar">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <a href="https://www.complex.com/shop">Home</a>
              <ChevronRight />
              <a href="https://www.complex.com/shop/artists">Artists</a>
              <ChevronRight />
              <span>YoungBoy Never Broke Again</span>
            </nav>
            <span className="item-count">{visible.length} items</span>
            <div className="catalog-actions">
              <Button
                variant="shopIcon"
                className="filter-toggle"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen(!filterOpen)}
              >
                FILTER <SlidersHorizontal />
              </Button>
              <label className="sort-control">
                <span className="sr-only">Sort products</span>
                <select
                  aria-label="Sort products"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  {["Trending", "Price: Low to High", "Price: High to Low", "Name: A–Z"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </div>
          {filterOpen && (
            <div className="filter-panel">
              <div className="filter-group">
                <h3>Color</h3>
                <div className="filter-options">
                  {[...new Set(catalogProducts.map((product) => product.color.toUpperCase()))].sort().map((color) => (
                    <label key={color}>
                      <input
                        type="checkbox"
                        checked={colors.includes(color)}
                        onChange={() => setColors(toggle(colors, color))}
                      />
                      {color.toLowerCase()}
                    </label>
                  ))}
                </div>
              </div>
              <Button
                variant="shopOutline"
                onClick={() => {
                  setColors([]);
                  setQuery("");
                  setSavedOnly(false);
                }}
              >
                Clear all
              </Button>
            </div>
          )}
          <div className="product-grid">
            {visible.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-visual">
                  <a
                    href={`https://www.complex.com/shop/products/${product.slug}?Color=${product.color}`}
                    onClick={(event) => {
                      event.preventDefault();
                      openProduct(product);
                    }}
                    aria-label={`View ${product.name}`}
                  >
                    <img
                      className="product-front"
                      src={images[product.image]}
                      alt={product.name}
                      loading={product.id <= 4 ? "eager" : "lazy"}
                    />
                    <img
                      className="product-back"
                      src={images[product.secondImage]}
                      alt={`${product.name}, alternate view`}
                      loading="lazy"
                    />
                  </a>
                  <Button
                    variant="shopIcon"
                    className={`product-save ${saved.includes(product.id) ? "saved" : ""}`}
                    aria-label={`${saved.includes(product.id) ? "Unsave" : "Save"} ${product.name}`}
                    title="Save product"
                    aria-pressed={saved.includes(product.id)}
                    onClick={() =>
                      setSaved(
                        saved.includes(product.id)
                          ? saved.filter((id) => id !== product.id)
                          : [...saved, product.id],
                      )
                    }
                  >
                    <Bookmark />
                  </Button>
                  <Button
                    variant="shopIcon"
                    className="product-add"
                    aria-label={`Quick add ${product.name}`}
                    title="Quick add"
                    onClick={() => openProduct(product)}
                  >
                    <Plus />
                  </Button>
                </div>
                <a
                  className="product-info"
                  href={`https://www.complex.com/shop/products/${product.slug}`}
                  onClick={(event) => {
                    event.preventDefault();
                    openProduct(product);
                  }}
                >
                  <div className="product-artist">YoungBoy Never Broke Again</div>
                  {product.brand && <div className="product-brand">{product.brand}</div>}
                  <div className="product-name">{product.name}</div>
                  <div className="product-price">{money(product.price)}</div>
                </a>
              </article>
            ))}
          </div>
          {visible.length === 0 && (
            <div className="empty-state">
              <p>{savedOnly ? "No saved products yet." : "No products found."}</p>
              <Button
                variant="shopOutline"
                onClick={() => {
                  setQuery("");
                  setColors([]);
                  setSavedOnly(false);
                }}
              >
                View all products
              </Button>
            </div>
          )}
        </section>
        <section className="editorial">
          <h2 className="section-title">Related Articles</h2>
          <div className="article-grid">
            {articles.map((article, index) => (
              <a className="article-card" key={article.url} href={article.url}>
                <img src={images[article.image]} alt={article.title} loading="lazy" />
                <p>
                  {
                    [
                      "Features | BY Jordan Rose",
                      "News | BY Trace William Cowen",
                      "Features | BY Complex Staff",
                      "News | BY Trey Alston",
                    ][index]
                  }
                </p>
                <h3>
                  {article.title.replace(
                    /^(Features|News)\s*\|\s*BY\s*(Jordan Rose|Trace William Cowen|Complex Staff|Trey Alston)\s*/,
                    "",
                  )}
                </h3>
              </a>
            ))}
          </div>
        </section>
        <section className="editorial">
          <h2 className="section-title">Related Artists</h2>
          <div className="artist-list">
            {artists.map((artist) => (
              <a className="related-artist" key={artist.url} href={artist.url}>
                <img src={images[artist.image]} alt={artist.name} loading="lazy" />
                <div>{artist.name}</div>
              </a>
            ))}
          </div>
        </section>
        <section className="about-artist" aria-labelledby="about-artist-title">
          <div className="about-artist-content">
            <div className="about-artist-copy">
              <p className="about-artist-eyebrow">ABOUT</p>
              <h2 id="about-artist-title">YOUNGBOY NEVER BROKE AGAIN</h2>
              <div className="about-artist-body">
                {artistDescription.split("\n\n").map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </div>
            <img
              className="about-artist-image"
              src={aboutYoungBoyImage}
              alt="YoungBoy Never Broke Again"
              loading="lazy"
            />
          </div>
        </section>
      </main>
      <footer className="shop-footer">
        <section className="footer-app-promo" aria-label="Complex app">
          <div>
            <p>STAY AHEAD ON EXCLUSIVES</p>
            <h2>Download the Complex App</h2>
            <p>Discover the latest stories, drops, and culture from Complex.</p>
          </div>
          <a href="https://www.complex.com/" target="_blank" rel="noreferrer">
            Explore Complex <ChevronRight />
          </a>
        </section>
        <div className="footer-main">
          <div className="footer-follow">
            <a className="footer-logo" href="https://www.complex.com/" aria-label="Complex home">
              <img src={logo.url} alt="Complex" />
            </a>
            <h2>FOLLOW ON</h2>
            <a href="https://www.instagram.com/complex/" target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a href="https://www.youtube.com/complex" target="_blank" rel="noreferrer">
              YouTube
            </a>
            <a href="https://www.tiktok.com/@complex" target="_blank" rel="noreferrer">
              TikTok
            </a>
          </div>
          <nav className="footer-columns" aria-label="Footer">
            <div>
              <h2>EXPLORE</h2>
              {[
                ["Style", "/style"],
                ["Sneakers", "/sneakers"],
                ["Music", "/music"],
                ["Sports", "/sports"],
                ["Pop culture", "/pop-culture"],
                ["Watch", "/video"],
              ].map(([label, path]) => (
                <a key={label} href={`https://www.complex.com${path}`}>
                  {label}
                </a>
              ))}
            </div>
            <div>
              <h2>SHOP</h2>
              {[
                ["New Arrivals", "/shop/collections/new"],
                ["Support", "https://complexshop.zendesk.com/hc/en-us"],
                ["Shipping Policy", "/shop/policies/shipping-policy"],
                ["Refund Policy", "/shop/policies/refund-policy"],
              ].map(([label, path]) => (
                <a
                  key={label}
                  href={path.startsWith("http") ? path : `https://www.complex.com${path}`}
                >
                  {label}
                </a>
              ))}
            </div>
            <div>
              <h2>EVENTS</h2>
              {[
                ["ComplexCon", "https://www.complexcon.com/"],
                ["Family Style", "https://www.familystylefest.com/"],
                ["Verzuz", "https://www.complex.com/verzuz"],
                ["Pop-Ups", "https://www.complex.com/events"],
              ].map(([label, href]) => (
                <a key={label} href={href}>
                  {label}
                </a>
              ))}
            </div>
            <div>
              <h2>WORK WITH US</h2>
              {[
                ["Careers", "https://jobs.lever.co/Complex/"],
                ["Contact us", "https://www.complex.com/contact"],
              ].map(([label, href]) => (
                <a key={label} href={href}>
                  {label}
                </a>
              ))}
            </div>
          </nav>
          <form
            className="footer-newsletter"
            onSubmit={(event) => {
              event.preventDefault();
              setNewsletterMessage("Newsletter sign-up is not connected on this demo.");
            }}
          >
            <label htmlFor="footer-email">SIGN UP TO BE FIRST TO KNOW</label>
            <div>
              <input id="footer-email" type="email" placeholder="Email address" required />
              <button type="submit">
                NOTIFY ME <ChevronRight />
              </button>
            </div>
            <p>
              {newsletterMessage || (
                <>
                  By subscribing, you agree to Complex&apos;s{" "}
                  <a href="https://www.complex.com/privacy">Privacy Policy</a>.
                </>
              )}
            </p>
          </form>
          <nav className="footer-legal" aria-label="Legal and site information">
            {[
              ["TERMS & CONDITIONS", "https://www.complex.com/terms"],
              ["PRIVACY POLICY", "https://www.complex.com/privacy"],
              [
                "WITHDRAW FROM CONTRACT (EU)",
                "https://support.complex.com/hc/en-us/requests/new?ticket_form_id=50367738709268",
              ],
              ["PUBLIC NOTICE", "https://www.complex.com/public-notice"],
              ["ACCESSIBILITY", "https://www.complex.com/accessibility-statement"],
              ["SITEMAP", "https://www.complex.com/sitemap"],
              ["COOKIES", "https://www.complex.com/cookies"],
            ].map(([label, href]) => (
              <a key={label} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <a className="footer-region" href="https://www.complex.com/">
            UNITED STATES
          </a>
          <p className="footer-disclaimer">
            Complex may earn commissions from purchases made through some links. Editorial coverage
            is independent of those commissions. © {new Date().getFullYear()} Commerce Media
            Holdings, LLC. All rights reserved.
          </p>
        </div>
      </footer>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="shop-dialog" aria-describedby={undefined}>
          {selected && (
            <div className="product-detail">
              <img className="detail-image" src={images[selected.image]} alt={selected.name} />
              <div className="detail-copy">
                <p className="detail-brand">
                  YoungBoy Never Broke Again{selected.brand && ` / ${selected.brand}`}
                </p>
                <DialogTitle className="detail-title">{selected.name}</DialogTitle>
                <p className="detail-price">{money(selected.price)}</p>
                <p className="detail-color">Color: {selected.color}</p>
                <div className="detail-brand">Size</div>
                <div className="size-options">
                  {(["Music", "Accessories"].includes(selected.category)
                    ? ["ONE SIZE"]
                    : selected.category === "Footwear"
                      ? ["7", "8", "9", "10", "11", "12"]
                      : ["S", "M", "L", "XL", "XXL"]
                  ).map((value) => (
                    <Button
                      key={value}
                      variant="shopOutline"
                      className={`size-button ${size === value ? "selected" : ""}`}
                      aria-pressed={size === value}
                      onClick={() => {
                        setSize(value);
                        setError("");
                      }}
                    >
                      {value}
                    </Button>
                  ))}
                </div>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <Button variant="shop" className="add-to-bag" onClick={addToBag}>
                  ADD TO BAG <Plus />
                </Button>
                <p className="detail-note">YoungBoy Never Broke Again Collection</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={cartOpen}
        onOpenChange={(open) => {
          setCartOpen(open);
          if (!open) setOrderConfirmation(null);
        }}
      >
        <DialogContent className="shop-dialog cart-dialog">
          <DialogTitle>
            {orderConfirmation
              ? `ORDER ${orderConfirmation.orderNumber}`
              : `YOUR BAG (${totalCount})`}
          </DialogTitle>
          <DialogDescription>
            {orderConfirmation
              ? orderConfirmed ? "Payment confirmed" : orderCancelled ? "Order cancelled" : "Order received - payment verification pending"
              : cart.length
                ? "Your selected products"
                : "Your bag is empty."}
          </DialogDescription>
          {orderConfirmation ? (
            <section className="checkout-confirmation" aria-live="polite">
              <h3>{orderConfirmed ? "Payment confirmed" : orderCancelled ? "Order cancelled" : orderConfirmation.status === "pending_payment" ? "Payment reported - awaiting verification" : "Payment verification pending"}</h3>
              <p>{orderConfirmed ? "The shop confirmed your payment. Your order is now being processed." : orderCancelled ? "This order was cancelled by the shop. Contact the shop owner if you believe this is a mistake." : orderConfirmation.status === "pending_payment" ? `We recorded your ${orderConfirmation.paymentMethod} payment report. This page will update after the shop verifies it.` : "Your order has been received. This page will update after the shop verifies your payment."}</p>
              {!orderConfirmed && !orderCancelled && orderConfirmation.paymentMethod === "venmo" && paymentSetup?.venmoUsername && (
                <section className="venmo-checkout" aria-label="Venmo payment instructions">
                  <header className="venmo-checkout-header">
                    <span className="venmo-mark" aria-hidden="true">
                      V
                    </span>
                    <div>
                      <strong>Pay with Venmo</strong>
                      <span>Manual payment · verification required</span>
                    </div>
                  </header>
                  <p className="venmo-destination-label">Send payment to this Venmo account</p>
                  <div className="payment-destination-row">
                    <a
                      className="venmo-destination"
                      href={`https://venmo.com/${encodeURIComponent(paymentSetup.venmoUsername.replace(/^@/, ""))}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {paymentSetup.venmoUsername}
                    </a>
                    <Button
                      variant="shopOutline"
                      size="sm"
                      type="button"
                      aria-label="Copy Venmo username"
                      onClick={() => copyPaymentTag("venmo", paymentSetup.venmoUsername!)}
                    >
                      {copiedPaymentTag === "venmo" ? <Check /> : <Copy />}
                      {copiedPaymentTag === "venmo" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  {copyPaymentError && <p className="checkout-privacy" role="status">{copyPaymentError}</p>}
                  <p className="venmo-intro">
                    Open the profile, confirm the username matches, then enter the exact total and
                    include this order number in the payment note.
                  </p>
                  <div className="venmo-amount">
                    <span>Exact order total</span>
                    <strong>{money(orderConfirmation.totalCents / 100)}</strong>
                  </div>
                  <p className="venmo-order-reference">
                    Payment note: Order #{orderConfirmation.orderNumber}
                  </p>
                </section>
              )}
              {!orderConfirmed && !orderCancelled && orderConfirmation.paymentMethod === "chime" && (
                <div className="payment-instructions">
                  <strong className="chime-brand">
                    <span className="chime-mark" aria-hidden="true">
                      c
                    </span>{" "}
                    Chime
                  </strong>
                  <p>Chime destination:</p>
                  <div className="payment-destination-row">
                    <span className="chime-destination">
                      {paymentSetup?.chimeDestination ?? CHIME_PAYMENT_TAG}
                    </span>
                    <Button
                      variant="shopOutline"
                      size="sm"
                      type="button"
                      aria-label="Copy Chime tag"
                      onClick={() =>
                        copyPaymentTag("chime", paymentSetup?.chimeDestination ?? CHIME_PAYMENT_TAG)
                      }
                    >
                      {copiedPaymentTag === "chime" ? <Check /> : <Copy />}
                      {copiedPaymentTag === "chime" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  {copyPaymentError && <p className="checkout-privacy" role="status">{copyPaymentError}</p>}
                  <p>
                    Amount: <strong>{money(orderConfirmation.totalCents / 100)}</strong>
                  </p>
                  <p>Payment reference: Order #{orderConfirmation.orderNumber}</p>
                  <p>In the Chime app, tap Pay, search this $ChimeSign, and enter the amount and order number.</p>
                </div>
              )}
              {!orderConfirmed && !orderCancelled && orderConfirmation.paymentMethod === "gift_card" && (
                <section className="payment-instructions" aria-label="Gift card payment details">
                  <strong>Gift card recipient</strong>
                  <div className="payment-destination-row">
                    <a href={`mailto:${GIFT_CARD_RECIPIENT_EMAIL}`}>
                      {GIFT_CARD_RECIPIENT_EMAIL}
                    </a>
                    <Button
                      variant="shopOutline"
                      size="sm"
                      type="button"
                      aria-label="Copy gift card recipient email"
                      onClick={() => copyPaymentTag("gift_card", GIFT_CARD_RECIPIENT_EMAIL)}
                    >
                      {copiedPaymentTag === "gift_card" ? <Check /> : <Copy />}
                      {copiedPaymentTag === "gift_card" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p>
                    Send an e-gift card for <strong>{money(orderConfirmation.totalCents / 100)}</strong>
                    to this address. Include order #{orderConfirmation.orderNumber} in the message
                    if the gift card provider allows it.
                  </p>
                </section>
              )}
              {!orderConfirmed && !orderCancelled && (
                <p className="cart-note">
                  Keep your order number. Do not send another order while this payment is being
                  verified.
                </p>
              )}
              <Button
                variant="shopOutline"
                onClick={() => {
                  setCartOpen(false);
                  setOrderConfirmation(null);
                }}
              >
                Continue shopping
              </Button>
            </section>
          ) : (
            <>
              {cart.map((item, index) => (
                <div className="cart-row" key={`${item.product.id}-${item.size}`}>
                  <img src={images[item.product.image]} alt={item.product.name} />
                  <div>
                    <h3>{item.product.name}</h3>
                    <p>
                      {item.product.color} / {item.size}
                    </p>
                    <p>{money(item.product.price)}</p>
                    <div className="quantity">
                      <Button
                        variant="shopIcon"
                        aria-label={`Decrease quantity of ${item.product.name}`}
                        disabled={Boolean(chimeOrderIntent || giftCardOrderIntent)}
                        onClick={() => changeQuantity(index, -1)}
                      >
                        <Minus />
                      </Button>
                      <span>{item.quantity}</span>
                      <Button
                        variant="shopIcon"
                        aria-label={`Increase quantity of ${item.product.name}`}
                        disabled={Boolean(chimeOrderIntent || giftCardOrderIntent)}
                        onClick={() => changeQuantity(index, 1)}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                  <Button
                    variant="shopIcon"
                    aria-label={`Remove ${item.product.name}`}
                    disabled={Boolean(chimeOrderIntent || giftCardOrderIntent)}
                    onClick={() => setCart(cart.filter((_, i) => i !== index))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {cart.length > 0 && (
                <>
                  <div className="cart-total">
                    <span>Order total</span>
                    <span>{money(subtotalCents / 100)}</span>
                  </div>
                  <p className="cart-note">
                    Free shipping and no tax for this checkout. Gift cards must cover the full order
                    total; partial redemption is not supported.
                  </p>
                  <form className="checkout-form" onSubmit={submitOrder}>
                    <fieldset className="checkout-fields">
                      <legend>Shipping details</legend>
                      <label>
                        Full name
                        <input
                          autoComplete="name"
                          required
                          maxLength={100}
                          value={shipping.name}
                          onChange={(event) =>
                            setShipping({ ...shipping, name: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Email address
                        <input
                          type="email"
                          autoComplete="email"
                          required
                          maxLength={254}
                          value={shipping.email}
                          onChange={(event) =>
                            setShipping({ ...shipping, email: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Phone (optional)
                        <input
                          type="tel"
                          autoComplete="tel"
                          maxLength={32}
                          value={shipping.phone}
                          onChange={(event) =>
                            setShipping({ ...shipping, phone: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Address
                        <input
                          autoComplete="address-line1"
                          required
                          maxLength={200}
                          value={shipping.address}
                          onChange={(event) =>
                            setShipping({ ...shipping, address: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Apartment, suite, etc. (optional)
                        <input
                          autoComplete="address-line2"
                          maxLength={200}
                          value={shipping.addressLine2}
                          onChange={(event) =>
                            setShipping({ ...shipping, addressLine2: event.target.value })
                          }
                        />
                      </label>
                      <div className="checkout-address-row">
                        <label>
                          City
                          <input
                            autoComplete="address-level2"
                            required
                            maxLength={100}
                            value={shipping.city}
                            onChange={(event) =>
                              setShipping({ ...shipping, city: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          State / region
                          <input
                            autoComplete="address-level1"
                            required
                            maxLength={100}
                            value={shipping.region}
                            onChange={(event) =>
                              setShipping({ ...shipping, region: event.target.value })
                            }
                          />
                        </label>
                      </div>
                      <div className="checkout-address-row">
                        <label>
                          ZIP / postal code
                          <input
                            autoComplete="postal-code"
                            required
                            maxLength={20}
                            value={shipping.postalCode}
                            onChange={(event) =>
                              setShipping({ ...shipping, postalCode: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Country
                          <input
                            autoComplete="country-name"
                            required
                            maxLength={100}
                            value={shipping.country}
                            onChange={(event) =>
                              setShipping({ ...shipping, country: event.target.value })
                            }
                          />
                        </label>
                      </div>
                    </fieldset>
                    <fieldset className="payment-options">
                      <legend>Payment method</legend>
                      {paymentMethods.map((method) => (
                        <label
                          className={`payment-option${paymentMethod === method.id ? " payment-option-selected" : ""}`}
                          key={method.id}
                        >
                          <input
                            type="radio"
                            name="payment-method"
                            value={method.id}
                            checked={paymentMethod === method.id}
                            disabled={Boolean(chimeOrderIntent || giftCardOrderIntent)}
                            onChange={() => void selectPaymentMethod(method.id)}
                          />
                          <span className={`payment-wordmark payment-${method.id}`}>
                            {method.id === "chime" && (
                              <span className="chime-mark" aria-hidden="true">
                                c
                              </span>
                            )}
                            {method.label}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    {!paymentSetup && paymentSetupError && (
                      <p className="form-error" role="alert">
                        {paymentSetupError}
                      </p>
                    )}
                    {paymentSetup?.databaseConfigured === false && !checkoutError && (
                      <p className="form-error" role="alert">
                        {paymentSetupError
                          ? "The payment service could not be reached. Payment details shown here are the saved public destinations, but orders cannot be submitted until the shop server is available."
                          : "Checkout is not configured yet: this Cloudflare Worker has no D1 database binding named PAYMENTS_DB. The shop owner must add that binding in Cloudflare and apply the checkout migrations. No order can be placed yet."}
                      </p>
                    )}
                    {paymentMethod === "venmo" && (
                      <section
                        className="venmo-checkout"
                        aria-label="Venmo manual payment instructions"
                      >
                        <header className="venmo-checkout-header">
                          <span className="venmo-mark" aria-hidden="true">
                            V
                          </span>
                          <div>
                            <strong>Pay with Venmo</strong>
                            <span>Manual payment · verification required</span>
                          </div>
                        </header>
                        {paymentSetup?.venmoUsername ? (
                          <>
                            <p className="venmo-destination-label">
                              Send payment to this Venmo account
                            </p>
                            <div className="payment-destination-row">
                              <a
                                className="venmo-destination"
                                href={`https://venmo.com/${encodeURIComponent(paymentSetup.venmoUsername.replace(/^@/, ""))}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {paymentSetup.venmoUsername}
                              </a>
                              <Button
                                variant="shopOutline"
                                size="sm"
                                type="button"
                                aria-label="Copy Venmo username"
                                onClick={() => copyPaymentTag("venmo", paymentSetup.venmoUsername!)}
                              >
                                {copiedPaymentTag === "venmo" ? <Check /> : <Copy />}
                                {copiedPaymentTag === "venmo" ? "Copied" : "Copy"}
                              </Button>
                            </div>
                            {copyPaymentError && <p className="checkout-privacy" role="status">{copyPaymentError}</p>}
                            <div className="venmo-amount">
                              <span>Exact order total</span>
                              <strong>{money(subtotalCents / 100)}</strong>
                            </div>
                            <p className="venmo-intro">
                              Select <strong>Place order</strong> to generate your order number.
                              Then open Venmo, search for the username above, and confirm it
                              matches before sending. Include the order number in your payment
                              note. Your order remains pending until payment is verified.
                            </p>
                          </>
                        ) : (
                          <p className="venmo-intro">
                            Venmo is not configured yet. The shop owner must set a public Venmo
                            username before this method can be used.
                          </p>
                        )}
                      </section>
                    )}
                    {paymentMethod === "chime" && (
                      <section
                        className="chime-checkout"
                        aria-label="Chime manual payment instructions"
                      >
                        <header className="chime-checkout-header">
                          <span className="chime-mark" aria-hidden="true">
                            c
                          </span>
                          <div>
                            <strong>Pay with Chime</strong>
                            <span>Manual payment · verification required</span>
                          </div>
                        </header>
                        <p className="chime-destination-label">Send payment to this Chime $tag</p>
                        <div className="payment-destination-row">
                          <span className="chime-destination">
                            {paymentSetup?.chimeDestination ?? CHIME_PAYMENT_TAG}
                          </span>
                          <Button
                            variant="shopOutline"
                            size="sm"
                            type="button"
                            aria-label="Copy Chime tag"
                            onClick={() =>
                              copyPaymentTag("chime", paymentSetup?.chimeDestination ?? CHIME_PAYMENT_TAG)
                            }
                          >
                            {copiedPaymentTag === "chime" ? <Check /> : <Copy />}
                            {copiedPaymentTag === "chime" ? "Copied" : "Copy"}
                          </Button>
                        </div>
                        {copyPaymentError && <p className="checkout-privacy" role="status">{copyPaymentError}</p>}
                        <div className="chime-amount">
                          <span>Exact order total</span>
                          <strong>
                            {money(
                              chimeOrderIntent
                                ? chimeOrderIntent.totalCents / 100
                                : subtotalCents / 100,
                            )}
                          </strong>
                        </div>
                        {chimeOrderIntent ? (
                          <>
                            <p className="chime-order-reference">
                              Order number / payment reference:{" "}
                              <strong>{chimeOrderIntent.orderNumber}</strong>
                            </p>
                            <ol className="chime-steps">
                              <li>Open the Chime app.</li>
                              <li>
                                Send exactly{" "}
                                <strong>{money(chimeOrderIntent.totalCents / 100)}</strong> to{" "}
                                <strong>
                                  {paymentSetup?.chimeDestination ?? CHIME_PAYMENT_TAG}
                                </strong>
                                .
                              </li>
                              <li>
                                Include <strong>{chimeOrderIntent.orderNumber}</strong> in the
                                payment note/reference if Chime supports it.
                              </li>
                              <li>Return here after sending the payment.</li>
                            </ol>
                            <Button
                              variant="shop"
                              type="button"
                              disabled={checkoutPending}
                              onClick={reportChimePaymentSent}
                            >
                              {checkoutPending ? "SUBMITTING…" : "I’VE SENT THE PAYMENT"}
                            </Button>
                            <p className="checkout-privacy">
                              This only reports that you sent payment. Your order remains Pending
                              Payment until the store verifies the transfer.
                            </p>
                          </>
                        ) : (
                          <p className="chime-intro">
                            Select <strong>Continue to Chime payment</strong> to save your order and
                            generate its payment reference. You can then send the payment in Chime.
                          </p>
                        )}
                      </section>
                    )}
                    {paymentMethod === "gift_card" && (
                      <section className="gift-card-checkout" aria-label="Gift card payment instructions">
                        <header>
                          <strong>Pay with an e-gift card</strong>
                          <span>Manual payment · verification required</span>
                        </header>
                        <div className="gift-card-amount">
                          <span>Exact order total</span>
                          <strong>
                            {money(
                              (giftCardOrderIntent?.totalCents ?? subtotalCents) / 100,
                            )}
                          </strong>
                        </div>
                        <p className="gift-card-recipient-label">
                          Send the e-gift card to this recipient email:
                        </p>
                        <div className="payment-destination-row">
                          <a href={`mailto:${GIFT_CARD_RECIPIENT_EMAIL}`}>
                            {GIFT_CARD_RECIPIENT_EMAIL}
                          </a>
                          <Button
                            variant="shopOutline"
                            size="sm"
                            type="button"
                            aria-label="Copy gift card recipient email"
                            onClick={() => copyPaymentTag("gift_card", GIFT_CARD_RECIPIENT_EMAIL)}
                          >
                            {copiedPaymentTag === "gift_card" ? <Check /> : <Copy />}
                            {copiedPaymentTag === "gift_card" ? "Copied" : "Copy"}
                          </Button>
                        </div>
                        {copyPaymentError && <p className="checkout-privacy" role="status">{copyPaymentError}</p>}
                        {giftCardOrderIntent ? (
                          <>
                            <p className="gift-card-order-reference">
                              Order number: <strong>{giftCardOrderIntent.orderNumber}</strong>
                            </p>
                            <ol className="gift-card-steps">
                              <li>On the gift card provider's website, email an e-gift card for the exact order total to the address above.</li>
                              <li>Include order number <strong>{giftCardOrderIntent.orderNumber}</strong> in the message if possible.</li>
                              <li>Return here and report that you sent it. The order stays unpaid until the shop verifies it.</li>
                            </ol>
                            <Button
                              variant="shop"
                              type="button"
                              disabled={checkoutPending}
                              onClick={reportGiftCardPaymentSent}
                            >
                              {checkoutPending ? "SUBMITTING…" : "I’VE SENT THE GIFT CARD"}
                            </Button>
                            <p className="checkout-privacy">
                              Reporting this does not mark the order paid. The shop must verify the gift card first.
                            </p>
                          </>
                        ) : (
                          <p className="checkout-privacy">
                            Continue to create your order and get an order number to include with the gift card.
                          </p>
                        )}
                      </section>
                    )}
                    {paymentSetupError && (
                      <p className="form-error" role="alert">
                        {paymentSetupError}
                      </p>
                    )}
                    {checkoutError && (
                      <p className="form-error" role="alert">
                        {checkoutError}
                      </p>
                    )}
                    {paymentMethod !== "chime" && paymentMethod !== "gift_card" && (
                      <Button variant="shop" type="submit" disabled={checkoutPending}>
                        {checkoutPending ? "PLACING ORDER…" : "PLACE ORDER"}
                      </Button>
                    )}
                    {paymentMethod === "gift_card" && !giftCardOrderIntent && (
                      <Button variant="shop" type="submit" disabled={checkoutPending}>
                        {checkoutPending ? "PREPARING PAYMENT…" : "CONTINUE TO GIFT CARD PAYMENT"}
                      </Button>
                    )}
                    {paymentMethod === "chime" && !chimeOrderIntent && (
                      <Button variant="shop" type="submit" disabled={checkoutPending}>
                        {checkoutPending ? "PREPARING PAYMENT…" : "CONTINUE TO CHIME PAYMENT"}
                      </Button>
                    )}
                    <p className="checkout-privacy">
                      Your shipping details are stored with the order to arrange delivery. Venmo,
                      Chime, and emailed gift card payments remain pending until verified.
                    </p>
                  </form>
                </>
              )}
              <Button variant="shopOutline" onClick={() => setCartOpen(false)}>
                Continue shopping
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
        <DialogContent className="shop-dialog cart-dialog">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription className="sr-only">Search the collection</DialogDescription>
          {searchField(true)}
          <Button variant="shop" onClick={() => setMobileSearchOpen(false)}>
            SHOW RESULTS ({visible.length})
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
