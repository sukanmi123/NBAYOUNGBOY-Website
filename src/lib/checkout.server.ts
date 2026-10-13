import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { products } from "@/lib/shop-data";
import { CHIME_PAYMENT_TAG, VENMO_USERNAME, type PaymentSetup } from "@/lib/checkout.shared";
import { requireSignedInUser } from "@/lib/auth.server";

interface D1Result {
  success: boolean;
  meta?: { changes?: number };
}

interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}

interface CheckoutEnvironment {
  PAYMENTS_DB?: D1Database;
  VENMO_USERNAME?: string;
  CHIME_DESTINATION?: string;
}

type RuntimeRequest = Request & {
  runtime?: { cloudflare?: { env?: CheckoutEnvironment } };
};

const orderInputSchema = z.object({
  paymentMethod: z.literal("venmo"),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        size: z.string().trim().min(1).max(12),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(20),
  shipping: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().max(32),
    address: z.string().trim().min(1).max(200),
    addressLine2: z.string().trim().max(200),
    city: z.string().trim().min(1).max(100),
    region: z.string().trim().min(1).max(100),
    postalCode: z.string().trim().min(1).max(20),
    country: z.string().trim().min(1).max(100),
  }),
});

const chimeOrderInputSchema = z.object({
  items: orderInputSchema.shape.items,
  shipping: orderInputSchema.shape.shipping,
});

const chimePaymentReportSchema = z.object({
  orderNumber: z.string().trim().min(1).max(64),
  confirmationToken: z.string().uuid(),
});

const giftCardPaymentReportSchema = chimePaymentReportSchema;
const orderStatusInputSchema = chimePaymentReportSchema;
const customProductIdOffset = 1_000_000;

function normalizePaymentHandle(value: string | undefined, prefix: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withoutPrefix = trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
  const clean = withoutPrefix.replace(/^[@$]+/, "");
  return clean ? `${prefix}${clean}` : null;
}

function getEnvironment(): CheckoutEnvironment {
  return (getRequest() as RuntimeRequest).runtime?.cloudflare?.env ?? {};
}

function getDatabase(): D1Database {
  const database = getEnvironment().PAYMENTS_DB;
  if (!database) {
    throw new Error(
      "Checkout is not configured yet: this Cloudflare Worker has no D1 database binding named PAYMENTS_DB. The shop owner must add that binding in Cloudflare and apply the checkout migrations. No order was placed.",
    );
  }
  return database;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function isValidSize(product: { category: string }, size: string): boolean {
  if (["Music", "Accessories"].includes(product.category)) return size === "ONE SIZE";
  if (product.category === "Footwear") return ["7", "8", "9", "10", "11", "12"].includes(size);
  return ["S", "M", "L", "XL", "XXL"].includes(size);
}

async function getValidatedItems(items: z.infer<typeof orderInputSchema>["items"], database: D1Database) {
  const prepared = await Promise.all(items.map(async (item) => {
    const staticProduct = products.find((candidate) => candidate.id === item.productId);
    if (staticProduct) {
      const hidden = await database.prepare("SELECT product_id FROM hidden_products WHERE product_id = ?")
        .bind(staticProduct.id)
        .first<{ product_id: number }>();
      if (hidden) throw new Error("One or more items in your bag are no longer available.");
    }
    const customProduct = staticProduct || item.productId <= customProductIdOffset
      ? null
      : await database.prepare(
          `SELECT id, name, price_cents AS priceCents, category
           FROM admin_products WHERE id = ?`,
        ).bind(item.productId - customProductIdOffset)
        .first<{ id: number; name: string; priceCents: number; category: string }>();
    const product = staticProduct ?? (customProduct ? {
      id: customProductIdOffset + customProduct.id,
      name: customProduct.name,
      price: customProduct.priceCents / 100,
      category: customProduct.category,
    } : null);
    if (!product || !isValidSize(product, item.size)) {
      throw new Error("One or more items in your bag are no longer available.");
    }
    return {
      productId: product.id,
      name: product.name,
      unitPriceCents: cents(product.price),
      size: item.size,
      quantity: item.quantity,
    };
  }));
  const totalCents = prepared.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error("The order total is invalid.");
  }
  return { items: prepared, totalCents };
}

function createOrderNumber(): string {
  return `YB-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}

async function hashGiftCardCode(code: string): Promise<string> {
  const normalized = code.replace(/\s+/g, "").toUpperCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const getPaymentSetup = createServerFn({ method: "GET" }).handler(async () => {
  await requireSignedInUser();
  const env = getEnvironment();
  const setup: PaymentSetup = {
    databaseConfigured: Boolean(env.PAYMENTS_DB),
    venmoUsername: normalizePaymentHandle(env.VENMO_USERNAME || VENMO_USERNAME, "@"),
    chimeDestination: normalizePaymentHandle(env.CHIME_DESTINATION || CHIME_PAYMENT_TAG, "$"),
  };
  return setup;
});

export const createChimePaymentOrder = createServerFn({ method: "POST" })
  .validator((input: unknown) => chimeOrderInputSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSignedInUser();
    const database = getDatabase();
    const { items, totalCents } = await getValidatedItems(data.items, database);
    const orderId = crypto.randomUUID();
    const orderNumber = createOrderNumber();
    const confirmationToken = crypto.randomUUID();
    const confirmationTokenHash = await hashGiftCardCode(confirmationToken);

    await database.batch([
      database
        .prepare(
          `INSERT INTO orders
            (id, order_number, total_cents, payment_method, status, confirmation_token_hash)
           VALUES (?, ?, ?, 'chime', 'awaiting_payment', ?)`,
        )
        .bind(orderId, orderNumber, totalCents, confirmationTokenHash),
      database
        .prepare(
          `INSERT INTO order_shipping_details
            (order_id, name, email, phone, address, address_line2, city, region, postal_code, country)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          orderId,
          data.shipping.name,
          data.shipping.email,
          data.shipping.phone,
          data.shipping.address,
          data.shipping.addressLine2,
          data.shipping.city,
          data.shipping.region,
          data.shipping.postalCode,
          data.shipping.country,
        ),
      ...items.map((item) =>
        database
          .prepare(
            `INSERT INTO order_items (order_id, product_id, name, size, quantity, unit_price_cents)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(orderId, item.productId, item.name, item.size, item.quantity, item.unitPriceCents),
      ),
    ]);

    return {
      orderNumber,
      confirmationToken,
      totalCents,
      paymentMethod: "chime" as const,
      status: "awaiting_payment" as const,
    };
  });

export const submitChimePaymentReport = createServerFn({ method: "POST" })
  .validator((input: unknown) => chimePaymentReportSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSignedInUser();
    const database = getDatabase();
    const confirmationTokenHash = await hashGiftCardCode(data.confirmationToken);
    const result = await database
      .prepare(
        `UPDATE orders
         SET status = 'pending_payment',
             payment_reference = order_number,
             payment_submitted_at = CURRENT_TIMESTAMP
         WHERE order_number = ?
           AND payment_method = 'chime'
           AND status = 'awaiting_payment'
           AND confirmation_token_hash = ?`,
      )
      .bind(data.orderNumber, confirmationTokenHash)
      .run();

    if (result.meta?.changes !== 1) {
      throw new Error(
        "This Chime order could not be submitted. Start checkout again or contact the shop.",
      );
    }
    return {
      orderNumber: data.orderNumber,
      paymentMethod: "chime" as const,
      status: "pending_payment" as const,
    };
  });

export const createGiftCardPaymentOrder = createServerFn({ method: "POST" })
  .validator((input: unknown) => chimeOrderInputSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSignedInUser();
    const database = getDatabase();
    const { items, totalCents } = await getValidatedItems(data.items, database);
    const orderId = crypto.randomUUID();
    const orderNumber = createOrderNumber();
    const confirmationToken = crypto.randomUUID();
    const confirmationTokenHash = await hashGiftCardCode(confirmationToken);

    await database.batch([
      database
        .prepare(
          `INSERT INTO orders
            (id, order_number, total_cents, payment_method, status, confirmation_token_hash)
           VALUES (?, ?, ?, 'gift_card', 'awaiting_payment', ?)`,
        )
        .bind(orderId, orderNumber, totalCents, confirmationTokenHash),
      database
        .prepare(
          `INSERT INTO order_shipping_details
            (order_id, name, email, phone, address, address_line2, city, region, postal_code, country)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          orderId,
          data.shipping.name,
          data.shipping.email,
          data.shipping.phone,
          data.shipping.address,
          data.shipping.addressLine2,
          data.shipping.city,
          data.shipping.region,
          data.shipping.postalCode,
          data.shipping.country,
        ),
      ...items.map((item) =>
        database
          .prepare(
            `INSERT INTO order_items (order_id, product_id, name, size, quantity, unit_price_cents)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(orderId, item.productId, item.name, item.size, item.quantity, item.unitPriceCents),
      ),
    ]);

    return {
      orderNumber,
      confirmationToken,
      totalCents,
      paymentMethod: "gift_card" as const,
      status: "awaiting_payment" as const,
    };
  });

export const submitGiftCardPaymentReport = createServerFn({ method: "POST" })
  .validator((input: unknown) => giftCardPaymentReportSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSignedInUser();
    const database = getDatabase();
    const confirmationTokenHash = await hashGiftCardCode(data.confirmationToken);
    const result = await database
      .prepare(
        `UPDATE orders
         SET status = 'pending_payment',
             payment_reference = order_number,
             payment_submitted_at = CURRENT_TIMESTAMP
         WHERE order_number = ?
           AND payment_method = 'gift_card'
           AND status = 'awaiting_payment'
           AND confirmation_token_hash = ?`,
      )
      .bind(data.orderNumber, confirmationTokenHash)
      .run();

    if (result.meta?.changes !== 1) {
      throw new Error(
        "This gift card order could not be submitted. Start checkout again or contact the shop.",
      );
    }
    return {
      orderNumber: data.orderNumber,
      paymentMethod: "gift_card" as const,
      status: "pending_payment" as const,
    };
  });

// The random confirmation token is the customer's private lookup key for this order.
// It prevents order numbers alone from exposing another customer's payment status.
export const getCustomerOrderStatus = createServerFn({ method: "GET" })
  .validator((input: unknown) => orderStatusInputSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSignedInUser();
    const database = getDatabase();
    const confirmationTokenHash = await hashGiftCardCode(data.confirmationToken);
    const order = await database
      .prepare(
        `SELECT order_number AS orderNumber, payment_method AS paymentMethod, status
         FROM orders WHERE order_number = ? AND confirmation_token_hash = ?`,
      )
      .bind(data.orderNumber, confirmationTokenHash)
      .first<{ orderNumber: string; paymentMethod: "venmo" | "chime" | "gift_card"; status: string }>();
    if (!order) throw new Error("Order status could not be found.");
    return order;
  });

export const submitCheckoutOrder = createServerFn({ method: "POST" })
  .validator((input: unknown) => orderInputSchema.parse(input))
  .handler(async ({ data }) => {
    await requireSignedInUser();
    const database = getDatabase();
    const { items, totalCents } = await getValidatedItems(data.items, database);
    const orderId = crypto.randomUUID();
    const orderNumber = createOrderNumber();
    const confirmationToken = crypto.randomUUID();
    const confirmationTokenHash = await hashGiftCardCode(confirmationToken);
    const env = getEnvironment();

    if (data.paymentMethod === "venmo") {
      if (!normalizePaymentHandle(env.VENMO_USERNAME || VENMO_USERNAME, "@")) {
        throw new Error(
          "Venmo checkout is unavailable until the shop owner configures a public Venmo username.",
        );
      }
      await database.batch([
        database
          .prepare(
            `INSERT INTO orders
              (id, order_number, total_cents, payment_method, status, confirmation_token_hash)
             VALUES (?, ?, ?, ?, 'pending_verification', ?)`,
          )
          .bind(orderId, orderNumber, totalCents, data.paymentMethod, confirmationTokenHash),
        database
          .prepare(
            `INSERT INTO order_shipping_details
              (order_id, name, email, phone, address, address_line2, city, region, postal_code, country)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            orderId,
            data.shipping.name,
            data.shipping.email,
            data.shipping.phone,
            data.shipping.address,
            data.shipping.addressLine2,
            data.shipping.city,
            data.shipping.region,
            data.shipping.postalCode,
            data.shipping.country,
          ),
        ...items.map((item) =>
          database
            .prepare(
              `INSERT INTO order_items (order_id, product_id, name, size, quantity, unit_price_cents)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              orderId,
              item.productId,
              item.name,
              item.size,
              item.quantity,
              item.unitPriceCents,
            ),
        ),
      ]);
      return {
        orderNumber,
        confirmationToken,
        totalCents,
        paymentMethod: data.paymentMethod,
        status: "pending_verification" as const,
      };
    }
    throw new Error("Unsupported payment method.");
  });
