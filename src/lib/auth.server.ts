import { betterAuth } from "better-auth";
import { admin, username } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequest, getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { products as builtInProducts } from "@/lib/shop-data";

interface AdminStatement {
  bind(...values: (string | number | null)[]): AdminStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number; last_row_id?: number } }>;
}

interface AdminDatabase {
  prepare(query: string): AdminStatement;
}

interface AuthEnvironment {
  PAYMENTS_DB?: AdminDatabase & Parameters<typeof betterAuth>[0]["database"];
  BETTER_AUTH_SECRET?: string;
}

type RuntimeRequest = Request & {
  runtime?: { cloudflare?: { env?: AuthEnvironment } };
};

const getEnvironment = createServerOnlyFn(() => {
  return (getRequest() as RuntimeRequest).runtime?.cloudflare?.env ?? {};
});

const getAuth = createServerOnlyFn(() => {
  const request = getRequest();
  const env = getEnvironment();
  if (!env.PAYMENTS_DB) throw new Error("Account storage is not configured: PAYMENTS_DB is missing.");
  if (!env.BETTER_AUTH_SECRET) throw new Error("Sign-in is not configured: BETTER_AUTH_SECRET is missing.");

  return betterAuth({
    database: env.PAYMENTS_DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: new URL(request.url).origin,
    trustedOrigins: [
      "https://youngboy-shop.fredrickowoeye8.workers.dev",
      "http://127.0.0.1:8787",
      "http://localhost:8787",
      "http://localhost:5173",
    ],
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    plugins: [admin(), username(), tanstackStartCookies()],
  });
});

const readSignedInUser = createServerOnlyFn(async () => {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() });
  if (!session) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: "role" in session.user ? String(session.user.role) : "user",
    username: "displayUsername" in session.user && session.user.displayUsername
      ? String(session.user.displayUsername)
      : "username" in session.user ? String(session.user.username ?? "") : "",
  };
});

export const getSignedInUser = createServerFn({ method: "GET" }).handler(async () => readSignedInUser());

export const requireSignedInUser = createServerOnlyFn(async () => {
  const user = await readSignedInUser();
  if (!user) throw new Error("Sign in to continue.");
  return user;
});

export const requireAdmin = createServerOnlyFn(async () => {
  const user = await requireSignedInUser();
  if (user.role !== "admin") throw new Error("Administrator access is required.");
  return user;
});

export const getAdminUserCount = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const database = getEnvironment().PAYMENTS_DB;
  if (!database) throw new Error("Account storage is not configured.");
  const result = await database
    .prepare("SELECT COUNT(*) AS total FROM user")
    .first<{ total: number }>();
  return { total: result?.total ?? 0 };
});

const updateOrderSchema = z.object({
  orderId: z.string().uuid(),
  action: z.enum(["confirm_payment", "cancel"]),
});

const updateAdminCredentialsSchema = z.object({
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/),
  password: z.string().max(128).optional(),
});

export const updateAdminCredentials = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateAdminCredentialsSchema.parse(input))
  .handler(async ({ data }) => {
    const user = await requireAdmin();
    const database = getEnvironment().PAYMENTS_DB;
    if (!database) throw new Error("Account storage is not configured.");
    const normalizedUsername = data.username.toLowerCase();
    const existing = await database
      .prepare("SELECT id FROM user WHERE username = ? AND id <> ?")
      .bind(normalizedUsername, user.id)
      .first<{ id: string }>();
    if (existing) throw new Error("That username is already in use.");

    if (data.password) {
      const result = await getAuth().api.setUserPassword({
        body: { userId: user.id, newPassword: data.password },
        headers: getRequestHeaders(),
      });
      if (!result.status) throw new Error("Could not update the admin password.");
    }

    await database
      .prepare("UPDATE user SET username = ?, displayUsername = ? WHERE id = ?")
      .bind(normalizedUsername, data.username, user.id)
      .run();
    return { success: true as const, username: data.username };
  });

export const getAdminDashboard = createServerFn({ method: "GET" }).handler(async () => {
    await requireAdmin();
    const database = getEnvironment().PAYMENTS_DB;
    if (!database) throw new Error("Account storage is not configured.");

    const [summary, customerCount, customers, orders, events] = await Promise.all([
      database
        .prepare(
          `SELECT COUNT(*) AS orderCount,
             SUM(CASE WHEN status IN ('awaiting_payment', 'pending_payment', 'pending_verification') THEN 1 ELSE 0 END) AS reviewCount,
             COALESCE(SUM(CASE WHEN status IN ('paid', 'processing') THEN total_cents ELSE 0 END), 0) AS confirmedRevenueCents
           FROM orders`,
        )
        .first<{ orderCount: number; reviewCount: number; confirmedRevenueCents: number }>(),
      database.prepare("SELECT COUNT(*) AS total FROM user").first<{ total: number }>(),
      database
        .prepare("SELECT id, name, email, createdAt FROM user ORDER BY createdAt DESC LIMIT 100")
        .all<{ id: string; name: string; email: string; createdAt: string }>(),
      database
        .prepare(
          `SELECT o.id, o.order_number AS orderNumber, o.total_cents AS totalCents,
             o.payment_method AS paymentMethod, o.status, o.payment_reference AS paymentReference,
             o.payment_submitted_at AS paymentSubmittedAt, o.created_at AS createdAt,
             s.name AS customerName, s.email AS customerEmail, s.phone,
             s.address, s.address_line2 AS addressLine2, s.city, s.region,
             s.postal_code AS postalCode, s.country
           FROM orders AS o
           LEFT JOIN order_shipping_details AS s ON s.order_id = o.id
           ORDER BY o.created_at DESC LIMIT 100`,
        )
        .all<AdminOrder>(),
      database
        .prepare(
          `SELECT e.action, e.from_status AS fromStatus, e.to_status AS toStatus,
             e.created_at AS createdAt, e.admin_user_id AS adminUserId,
             u.name AS adminName, o.order_number AS orderNumber
           FROM admin_order_events AS e
           JOIN user AS u ON u.id = e.admin_user_id
           JOIN orders AS o ON o.id = e.order_id
           ORDER BY e.created_at DESC LIMIT 12`,
        )
        .all<AdminOrderEvent>(),
    ]);
    const orderIds = orders.results.map((order) => order.id);
    const items = orderIds.length
      ? await database
          .prepare(
            `SELECT order_id AS orderId, name, size, quantity, unit_price_cents AS unitPriceCents
             FROM order_items WHERE order_id IN (${orderIds.map(() => "?").join(",")}) ORDER BY id`,
          )
          .bind(...orderIds)
          .all<AdminOrderItem>()
      : { results: [] as AdminOrderItem[] };

    const itemsByOrder = new Map<string, AdminOrderItem[]>();
    for (const item of items.results) {
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push(item);
      itemsByOrder.set(item.orderId, list);
    }

    return {
      stats: {
        totalCustomers: customerCount?.total ?? 0,
        orderCount: summary?.orderCount ?? 0,
        reviewCount: summary?.reviewCount ?? 0,
        confirmedRevenueCents: summary?.confirmedRevenueCents ?? 0,
      },
      customers: customers.results,
      orders: orders.results.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] })),
      events: events.results,
    };
});

const customProductIdOffset = 1_000_000;
const customProductInput = z.object({
  name: z.string().trim().min(2).max(100),
  price: z.number().finite().positive().max(20000),
  color: z.string().trim().min(2).max(40),
  brand: z.string().trim().max(60).default(""),
  imageIndex: z.number().int().min(0).max(100),
  secondImageIndex: z.number().int().min(0).max(100),
});

type CustomProductRow = {
  id: number;
  name: string;
  slug: string;
  priceCents: number;
  category: string;
  color: string;
  image: number;
  secondImage: number;
  brand: string;
};

async function readCustomProducts(database: AdminDatabase) {
  const result = await database.prepare(
    `SELECT id, name, slug, price_cents AS priceCents, category, color,
       image_index AS image, second_image_index AS secondImage, brand
     FROM admin_products ORDER BY created_at DESC, id DESC`,
  ).all<CustomProductRow>();
  return result.results.map((product) => ({
    ...product,
    id: customProductIdOffset + product.id,
    price: product.priceCents / 100,
  }));
}

export const getCatalogProducts = createServerFn({ method: "GET" }).handler(async () => {
  const database = getEnvironment().PAYMENTS_DB;
  if (!database) return [];
  const hiddenRows = await database.prepare("SELECT product_id FROM hidden_products").all<{ product_id: number }>();
  const hiddenIds = new Set(hiddenRows.results.map((row: { product_id: number }) => row.product_id));
  const customProducts = await readCustomProducts(database);
  return [
    ...builtInProducts.filter((product) => !hiddenIds.has(product.id)),
    ...customProducts,
  ];
});

export const getAdminProducts = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const database = getEnvironment().PAYMENTS_DB;
  if (!database) throw new Error("Product storage is not configured.");
  const hiddenRows = await database.prepare("SELECT product_id FROM hidden_products").all<{ product_id: number }>();
  const hiddenIds = new Set(hiddenRows.results.map((row: { product_id: number }) => row.product_id));
  const customProducts = await readCustomProducts(database);
  return [
    ...builtInProducts.filter((product) => product.category === "Clothing").map((product) => ({
      ...product,
      priceCents: Math.round(product.price * 100),
      isCustom: false,
      isHidden: hiddenIds.has(product.id),
    })),
    ...customProducts.map((product) => ({ ...product, isCustom: true, isHidden: false })),
  ];
});

export const createAdminProduct = createServerFn({ method: "POST" })
  .validator((input: unknown) => customProductInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = getEnvironment().PAYMENTS_DB;
    if (!database) throw new Error("Product storage is not configured.");
    const baseSlug = data.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
    const result = await database.prepare(
      `INSERT INTO admin_products
        (name, slug, price_cents, category, color, brand, image_index, second_image_index)
       VALUES (?, ?, ?, 'Clothing', ?, ?, ?, ?)`,
    ).bind(
      data.name,
      slug,
      Math.round(data.price * 100),
      data.color,
      data.brand,
      data.imageIndex,
      data.secondImageIndex,
    ).run();
    if (!result.meta?.last_row_id) throw new Error("Could not save the clothing item.");
    return { success: true as const, id: customProductIdOffset + result.meta.last_row_id };
  });

export const deleteAdminProduct = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ productId: z.number().int().positive() }).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = getEnvironment().PAYMENTS_DB;
    if (!database) throw new Error("Product storage is not configured.");
    if (data.productId >= customProductIdOffset) {
      const result = await database.prepare("DELETE FROM admin_products WHERE id = ?")
        .bind(data.productId - customProductIdOffset)
        .run();
      if (result.meta?.changes !== 1) throw new Error("That clothing item was not found. Refresh the list and try again.");
    } else {
      if (!builtInProducts.some((product) => product.id === data.productId && product.category === "Clothing")) {
        throw new Error("That clothing item was not found.");
      }
      await database.prepare("INSERT OR IGNORE INTO hidden_products (product_id) VALUES (?)")
        .bind(data.productId)
        .run();
    }
    return { success: true as const };
  });

export const restoreAdminProduct = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ productId: z.number().int().positive().max(customProductIdOffset - 1) }).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const database = getEnvironment().PAYMENTS_DB;
    if (!database) throw new Error("Product storage is not configured.");
    await database.prepare("DELETE FROM hidden_products WHERE product_id = ?").bind(data.productId).run();
    return { success: true as const };
  });

interface AdminOrder {
  id: string;
  orderNumber: string;
  totalCents: number;
  paymentMethod: "venmo" | "chime" | "gift_card";
  status: string;
  paymentReference: string | null;
  paymentSubmittedAt: string | null;
  createdAt: string;
  customerName: string | null;
  customerEmail: string | null;
  phone: string | null;
  address: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

interface AdminOrderItem {
  orderId: string;
  name: string;
  size: string;
  quantity: number;
  unitPriceCents: number;
}

interface AdminOrderEvent {
  action: "confirm_payment" | "cancel";
  fromStatus: string;
  toStatus: string;
  createdAt: string;
  adminUserId: string;
  adminName: string;
  orderNumber: string;
}

export const updateAdminOrder = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const adminUser = await requireAdmin();
    const database = getEnvironment().PAYMENTS_DB;
    if (!database) throw new Error("Account storage is not configured.");
    const allowedFrom = data.action === "confirm_payment"
      ? ["pending_payment", "pending_verification"]
      : ["awaiting_payment", "pending_payment", "pending_verification"];
    const to = data.action === "confirm_payment" ? "processing" : "cancelled";
    const current = await database
      .prepare("SELECT status FROM orders WHERE id = ?")
      .bind(data.orderId)
      .first<{ status: string }>();
    if (!current || !allowedFrom.includes(current.status)) {
      throw new Error("That order has already changed or cannot use this action. Refresh the order list.");
    }
    const updated = await database
      .prepare(
        `UPDATE orders SET status = ?
         WHERE id = ? AND status = ?
         RETURNING id`,
      )
      .bind(to, data.orderId, current.status)
      .first<{ id: string }>();
    if (!updated) throw new Error("That order has already changed or cannot use this action. Refresh the order list.");
    await database
      .prepare(
        `INSERT INTO admin_order_events (id, order_id, admin_user_id, action, from_status, to_status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), data.orderId, adminUser.id, data.action, current.status, to)
      .run();
    return { success: true as const };
  });
