import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { createAdminProduct, deleteAdminProduct, getAdminDashboard, getAdminProducts, getSignedInUser, restoreAdminProduct, updateAdminCredentials, updateAdminOrder } from "@/lib/auth.server";
import { images } from "@/lib/shop-data";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const user = await getSignedInUser();
    if (!user) throw redirect({ to: "/admin-login" });
    if (user.role !== "admin") throw redirect({ to: "/" });
  },
  loader: async () => {
    const [dashboard, adminUser, products] = await Promise.all([getAdminDashboard(), getSignedInUser(), getAdminProducts()]);
    if (!adminUser || adminUser.role !== "admin") throw redirect({ to: "/admin-login" });
    return { ...dashboard, adminUser, products };
  },
  component: AdminPage,
});

type Section = "overview" | "orders" | "products" | "customers" | "account";
type Order = Awaited<ReturnType<typeof getAdminDashboard>>["orders"][number];
const currency = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string) => new Date(value).toLocaleString();
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

function AdminPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const visibleOrders = useMemo(() => data.orders.filter((order) => {
    const matchesSearch = `${order.orderNumber} ${order.customerName ?? ""} ${order.customerEmail ?? ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "review" ? ["awaiting_payment", "pending_payment", "pending_verification"].includes(order.status) : filter === "processing" ? ["paid", "processing"].includes(order.status) : ["cancelled", "refunded"].includes(order.status));
    return matchesSearch && matchesFilter;
  }), [data.orders, filter, search]);

  async function orderAction(order: Order, action: "confirm_payment" | "cancel") {
    setBusy(order.id); setMessage("");
    try {
      await updateAdminOrder({ data: { orderId: order.id, action } });
      setMessage(`Order ${order.orderNumber} updated.`);
      await router.invalidate();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update the order."); }
    finally { setBusy(""); }
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/admin-login");
  }

  return <main className="admin-page admin-dashboard">
    <header className="admin-header">
      <div><p className="account-eyebrow">YB SHOP · ADMINISTRATION</p><h1>Shop dashboard</h1><p className="admin-subtitle">Orders, customer accounts, and payment review.</p></div>
      <div className="admin-actions"><Link to="/">Back to shop</Link><button onClick={() => void signOut()}>Sign out</button></div>
    </header>
    <nav className="admin-tabs" aria-label="Admin sections">{(["overview", "orders", "products", "customers", "account"] as Section[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>{title(item)}{item === "orders" && data.stats.reviewCount > 0 && <span>{data.stats.reviewCount}</span>}</button>)}</nav>
    {message && <p className="admin-message" role="status">{message}</p>}

    {section === "overview" && <>
      <section className="admin-stat-grid" aria-label="Shop totals">
        <Stat label="Confirmed sales" value={currency(data.stats.confirmedRevenueCents)} note="Paid and processing orders" />
        <Stat label="Orders" value={String(data.stats.orderCount)} note="All orders received" />
        <Stat label="Needs payment review" value={String(data.stats.reviewCount)} note="Verify payment externally before confirming" />
        <Stat label="Customer accounts" value={String(data.stats.totalCustomers)} note="Registered accounts" />
      </section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="account-eyebrow">LATEST ACTIVITY</p><h2>Recent orders</h2></div><button className="admin-link-button" onClick={() => setSection("orders")}>View all orders →</button></div>
        {data.orders.length ? <div className="admin-order-list">{data.orders.slice(0, 6).map((order) => <OrderRow key={order.id} order={order} onAction={orderAction} busy={busy === order.id} />)}</div> : <Empty text="No orders have been placed yet." />}
      </section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><p className="account-eyebrow">AUDIT LOG</p><h2>Admin actions</h2></div></div>
        {data.events.length ? <div className="admin-event-list">{data.events.map((event, index) => <div className="admin-event" key={`${event.orderNumber}-${event.createdAt}-${index}`}><span className="admin-event-dot"/><p><strong>{event.adminName}</strong> {event.action === "confirm_payment" ? "confirmed payment for" : "cancelled"} <strong>{event.orderNumber}</strong><small>{date(event.createdAt)} · {title(event.fromStatus)} → {title(event.toStatus)}</small></p></div>)}</div> : <Empty text="Admin actions will appear here." />}
      </section>
    </>}

    {section === "orders" && <section className="admin-panel"><div className="admin-panel-heading"><div><p className="account-eyebrow">ORDER MANAGEMENT</p><h2>Orders</h2></div><button className="admin-refresh" onClick={() => void router.invalidate()}>Refresh</button></div>
      <p className="admin-review-note">Check Venmo, Chime, or gift card receipt independently before confirming. A customer’s report alone does not verify payment.</p>
      <div className="admin-order-tools"><input aria-label="Search orders" placeholder="Search order or customer" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter orders" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All orders</option><option value="review">Needs review</option><option value="processing">Paid / processing</option><option value="closed">Cancelled / refunded</option></select></div>
      {visibleOrders.length ? <div className="admin-order-list">{visibleOrders.map((order) => <OrderRow key={order.id} order={order} onAction={orderAction} busy={busy === order.id} />)}</div> : <Empty text="No orders match this filter." />}
    </section>}

    {section === "products" && <ProductManager products={data.products} />}

    {section === "customers" && <section className="admin-panel"><div className="admin-panel-heading"><div><p className="account-eyebrow">CUSTOMER ACCOUNTS</p><h2>{data.stats.totalCustomers} registered</h2></div><span className="admin-muted">Showing latest {data.customers.length}</span></div>
      {data.customers.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Email</th><th>Joined</th></tr></thead><tbody>{data.customers.map((customer) => <tr key={customer.id}><td>{customer.name || "—"}</td><td>{customer.email}</td><td>{date(customer.createdAt)}</td></tr>)}</tbody></table></div> : <Empty text="No customer accounts yet." />}
    </section>}
    {section === "account" && <AdminAccountSettings currentUsername={data.adminUser.username} />}
    <footer className="admin-footer">Dashboard data refreshes from the shop database. Order history displays the latest 100 orders.</footer>
  </main>;
}

type ManagedProduct = Awaited<ReturnType<typeof getAdminProducts>>[number];
const clothingImages = [31, 32, 33, 34, 35, 36, 37, 38];

function ProductManager({ products }: { products: ManagedProduct[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [color, setColor] = useState("");
  const [brand, setBrand] = useState("");
  const [imageIndex, setImageIndex] = useState(31);
  const [secondImageIndex, setSecondImageIndex] = useState(32);
  const [pending, setPending] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); setMessage("");
    try {
      await createAdminProduct({ data: { name, price: Number(price), color, brand, imageIndex, secondImageIndex } });
      setName(""); setPrice(""); setColor(""); setBrand("");
      setMessage("Clothing item added to the shop.");
      await router.invalidate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add this clothing item."); }
    finally { setPending(false); }
  }

  async function removeProduct(product: ManagedProduct) {
    if (product.isHidden || !window.confirm(`Remove “${product.name}” from the shop?`)) return;
    setRemoving(product.id); setError(""); setMessage("");
    try {
      await deleteAdminProduct({ data: { productId: product.id } });
      setMessage(`${product.name} removed from the shop.`);
      await router.invalidate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove this item."); }
    finally { setRemoving(null); }
  }

  async function restoreProduct(product: ManagedProduct) {
    setRemoving(product.id); setError(""); setMessage("");
    try {
      await restoreAdminProduct({ data: { productId: product.id } });
      setMessage(`${product.name} restored to the shop.`);
      await router.invalidate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore this clothing item."); }
    finally { setRemoving(null); }
  }

  const imagePicker = (label: string, selected: number, onSelect: (value: number) => void) => <fieldset className="product-image-picker"><legend>{label}</legend><div className="product-image-options">{clothingImages.map((index) => <button type="button" key={index} className={selected === index ? "selected" : ""} aria-label={`${label}: clothing image ${index - 30}`} aria-pressed={selected === index} onClick={() => onSelect(index)}><img src={images[index]} alt={`Clothing option ${index - 30}`} /></button>)}</div></fieldset>;

  return <>
    <section className="admin-panel"><div className="admin-panel-heading"><div><p className="account-eyebrow">SHOP CATALOG</p><h2>Add clothing</h2></div></div>
      <p className="admin-copy">New items appear in the shop catalog after saving. Choose front and alternate photos from the clothing image gallery.</p>
      <form className="admin-product-form" onSubmit={addProduct}>
        <label>Product name<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Price (USD)<input required type="number" min="0.01" max="20000" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <label>Color<input required maxLength={40} placeholder="e.g. Black" value={color} onChange={(event) => setColor(event.target.value)} /></label>
        <label>Brand (optional)<input maxLength={60} value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
        {imagePicker("Front image", imageIndex, setImageIndex)}
        {imagePicker("Alternate image", secondImageIndex, setSecondImageIndex)}
        {error && <p className="account-error" role="alert">{error}</p>}
        {message && <p className="admin-message" role="status">{message}</p>}
        <button className="admin-product-submit" type="submit" disabled={pending}>{pending ? "ADDING…" : "ADD CLOTHING TO SHOP"}</button>
      </form>
    </section>
    <section className="admin-panel"><div className="admin-panel-heading"><div><p className="account-eyebrow">SHOP CLOTHING</p><h2>{products.length} clothing {products.length === 1 ? "item" : "items"}</h2></div><button className="admin-refresh" onClick={() => void router.invalidate()}>Refresh</button></div>
      {products.length ? <div className="managed-product-list">{products.map((product) => <article className={`managed-product${product.isHidden ? " hidden" : ""}`} key={product.id}><img src={images[product.image]} alt="" /><div><strong>{product.name}</strong><span>{product.isCustom ? "Added by you" : "Store catalog"}{product.isHidden ? " · Hidden from shop" : ""}</span><span>{product.color}{product.brand ? ` · ${product.brand}` : ""} · {currency(Math.round(product.price * 100))}</span></div>{product.isHidden ? <button type="button" className="admin-refresh" disabled={removing === product.id} onClick={() => void restoreProduct(product)}>{removing === product.id ? "Restoring…" : "Restore"}</button> : <button type="button" className="admin-cancel-button" disabled={removing === product.id} onClick={() => void removeProduct(product)}>{removing === product.id ? "Removing…" : "Remove"}</button>}</article>)}</div> : <Empty text="No clothing items are available." />}
    </section>
  </>;
}

function AdminAccountSettings({ currentUsername }: { currentUsername: string }) {
  const [username, setUsername] = useState(currentUsername);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setPending(true);
    try {
      await updateAdminCredentials({ data: { username: username.trim(), password: password || undefined } });
      setPassword("");
      setMessage(password ? "Username and password updated." : "Username updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update admin credentials."); }
    finally { setPending(false); }
  }

  return <section className="admin-panel"><div className="admin-panel-heading"><div><p className="account-eyebrow">ADMIN ACCOUNT</p><h2>Sign-in credentials</h2></div></div>
    <p className="admin-copy">Change the username used on the admin sign-in page. Passwords are securely hashed by the authentication service and never displayed again.</p>
    <form className="account-form admin-credential-form" onSubmit={save}>
      <label>Admin username<input required minLength={3} maxLength={30} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>New password<input type="password" minLength={10} autoComplete="new-password" placeholder="Leave blank to keep current password" value={password} onChange={(event) => setPassword(event.target.value)} /><small>At least 10 characters. Leave blank if you only want to change the username.</small></label>
      {error && <p className="account-error" role="alert">{error}</p>}{message && <p className="admin-message" role="status">{message}</p>}
      <button type="submit" disabled={pending}>{pending ? "SAVING..." : "SAVE CREDENTIALS"}</button>
    </form>
  </section>;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="admin-stat-card"><p className="account-eyebrow">{label}</p><strong>{value}</strong><p>{note}</p></article>;
}

function Empty({ text }: { text: string }) { return <p className="admin-empty">{text}</p>; }

function OrderRow({ order, onAction, busy }: { order: Order; onAction: (order: Order, action: "confirm_payment" | "cancel") => void; busy: boolean }) {
  const review = ["awaiting_payment", "pending_payment", "pending_verification"].includes(order.status);
  return <details className="admin-order"><summary><span className="admin-order-main"><strong>{order.orderNumber}</strong><small>{order.customerName || order.customerEmail || "Customer details unavailable"} · {date(order.createdAt)}</small></span><span className={`admin-status status-${order.status}`}>{title(order.status)}</span><strong className="admin-order-total">{currency(order.totalCents)}</strong></summary>
    <div className="admin-order-detail"><div className="admin-detail-grid"><div><h3>Payment</h3><p>{title(order.paymentMethod)}{order.paymentReference ? ` · ${order.paymentReference}` : ""}</p><p>{order.paymentSubmittedAt ? `Reported ${date(order.paymentSubmittedAt)}` : "No payment report timestamp"}</p></div><div><h3>Ship to</h3><p>{order.customerName || "—"}{order.phone ? ` · ${order.phone}` : ""}</p><p>{[order.address, order.addressLine2, order.city, order.region, order.postalCode, order.country].filter(Boolean).join(", ") || "No shipping address saved"}</p></div></div>
      <h3>Items</h3><ul className="admin-item-list">{order.items.map((item, index) => <li key={`${item.name}-${item.size}-${index}`}><span>{item.name} · {item.size} × {item.quantity}</span><strong>{currency(item.unitPriceCents * item.quantity)}</strong></li>)}</ul>
      {review && <div className="admin-order-actions"><button disabled={busy} onClick={() => onAction(order, "confirm_payment")}>{busy ? "Updating…" : "Confirm payment & process"}</button><button className="admin-cancel-button" disabled={busy} onClick={() => onAction(order, "cancel")}>Cancel unpaid order</button></div>}
    </div>
  </details>;
}
