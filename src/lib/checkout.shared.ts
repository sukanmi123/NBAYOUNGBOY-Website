export const paymentMethods = [
  { id: "venmo", label: "Venmo" },
  { id: "chime", label: "Chime" },
  { id: "gift_card", label: "Gift Card" },
] as const;

export const CHIME_PAYMENT_TAG = "$Leshonda-Jenkins-2";
export const VENMO_USERNAME = "@Leshonda-Jenkins-2";
export const GIFT_CARD_RECIPIENT_EMAIL = "dajourw89@gmail.com";

export type PaymentMethod = (typeof paymentMethods)[number]["id"];
export type CheckoutCartItem = { productId: number; size: string; quantity: number };
export type ShippingDetails = {
  name: string;
  email: string;
  phone: string;
  address: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};
export type PaymentSetup = {
  databaseConfigured: boolean;
  venmoUsername: string | null;
  chimeDestination: string | null;
};
