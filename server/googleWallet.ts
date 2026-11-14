import { JWT } from "google-auth-library";
import { importPKCS8, SignJWT } from "jose";

const ISSUER_ID = "3388000000023241182";
const CLASS_ID = "3388000000023241182.dietcoach_membership";
const EXPECTED_PROJECT_ID = "dietcoach-wallet";
const EXPECTED_SERVICE_ACCOUNT = "diet-coach-wallet@dietcoach-wallet.iam.gserviceaccount.com";
const API_ROOT = "https://walletobjects.googleapis.com/walletobjects/v1";
const WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

export type WalletCustomer = {
  token: string;
  fullName: string;
  phone: string;
  email: string | null;
  gender?: "female" | "male" | "unspecified";
  packageName?: string;
  packageDays?: number;
  packageStartedAt?: Date | null;
  packageExpiresAt?: Date | null;
  totalMeals: number;
  mealsRemaining: number;
  branchName: string;
};

type ServiceAccountJson = {
  type?: string;
  project_id?: string;
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

export class GoogleWalletError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "GoogleWalletError";
  }
}

export function resolveGoogleWalletRequestOrigin(originHeader?: string, refererHeader?: string) {
  const source = originHeader || refererHeader;
  if (!source || source === "null") throw new GoogleWalletError("invalid_request_origin", "Browser request origin is missing");
  let origin: URL;
  try {
    origin = new URL(source);
  } catch {
    throw new GoogleWalletError("invalid_request_origin", "Browser request origin is invalid");
  }
  if (origin.username || origin.password || (origin.protocol !== "https:" && origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1")) {
    throw new GoogleWalletError("invalid_request_origin", "Browser request origin must be secure HTTPS");
  }
  if (originHeader && refererHeader) {
    try {
      if (new URL(refererHeader).origin !== origin.origin) {
        throw new GoogleWalletError("invalid_request_origin", "Browser Origin and Referer do not match");
      }
    } catch (error) {
      if (error instanceof GoogleWalletError) throw error;
      throw new GoogleWalletError("invalid_request_origin", "Browser Referer is invalid");
    }
  }
  return origin.origin;
}

function getServiceAccount(): ServiceAccountJson {
  const raw = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new GoogleWalletError("credentials_missing", "Google Wallet service-account secret is not configured");
  let account: ServiceAccountJson;
  try {
    account = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    throw new GoogleWalletError("credentials_invalid_json", "Google Wallet service-account secret is not valid JSON");
  }
  if (account.type !== "service_account" || !account.client_email || !account.private_key) {
    throw new GoogleWalletError("credentials_incomplete", "Google Wallet service-account JSON is missing required fields");
  }
  if (account.project_id !== EXPECTED_PROJECT_ID || account.client_email !== EXPECTED_SERVICE_ACCOUNT) {
    throw new GoogleWalletError("credentials_mismatch", "Configured service account does not match the approved Diet Coach Wallet project");
  }
  return account;
}

function googleAuthClient() {
  const account = getServiceAccount();
  return new JWT({ email: account.client_email, key: account.private_key, scopes: [WALLET_SCOPE] });
}

function httpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { response?: { status?: number }; code?: number };
  return candidate.response?.status ?? candidate.code;
}

async function walletRequest<T>(method: "GET" | "POST" | "PATCH", path: string, data?: unknown): Promise<T> {
  try {
    const client = googleAuthClient();
    const response = await client.request<T>({ url: `${API_ROOT}${path}`, method, data });
    return response.data;
  } catch (error) {
    const status = httpStatus(error);
    if (status === 401) throw new GoogleWalletError("authentication_failed", "Google Wallet could not authenticate the configured service account.");
    if (status === 403) throw new GoogleWalletError("permission_denied", "Google Wallet rejected the service account. Check Wallet Console access and API permissions.");
    if (status === 404) throw new GoogleWalletError("class_or_object_not_found", "The existing Google Wallet class or object was not found.");
    if (status === 409) throw new GoogleWalletError("object_conflict", "Google Wallet reports a conflicting object ID.");
    if (status === 400) throw new GoogleWalletError("invalid_pass_data", "Google Wallet rejected the pass data or class configuration.");
    if (error instanceof GoogleWalletError) throw error;
    throw new GoogleWalletError("google_api_unavailable", "Google Wallet API request failed.");
  }
}

function objectIdFor(customer: WalletCustomer) {
  return `${ISSUER_ID}.dietcoach_${customer.token}`;
}

function buildGenericObject(customer: WalletCustomer) {
  const dateLabel = (date: Date | null | undefined) => date ? new Intl.DateTimeFormat("ar", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date) : "غير محدد";
  return {
    id: objectIdFor(customer),
    classId: CLASS_ID,
    state: "ACTIVE",
    genericType: "GENERIC_GYM_MEMBERSHIP",
    hexBackgroundColor: "#315e49",
    cardTitle: { defaultValue: { language: "ar", value: "Diet Coach" } },
    subheader: { defaultValue: { language: "ar", value: "بطاقة عضوية الوجبات" } },
    header: { defaultValue: { language: "ar", value: customer.fullName } },
    barcode: { type: "QR_CODE", value: customer.token, alternateText: "امسح الرمز عند استلام الوجبة" },
    textModulesData: [
      { id: "customer_name", header: "اسم العميل", body: customer.fullName },
      { id: "meal_balance", header: "الوجبات المتبقية", body: `${customer.mealsRemaining} من ${customer.totalMeals}` },
      { id: "branch", header: "الفرع", body: customer.branchName },
      { id: "phone", header: "رقم الهاتف", body: customer.phone },
      ...(customer.gender ? [{ id: "gender", header: "الجنس", body: customer.gender === "female" ? "أنثى" : customer.gender === "male" ? "ذكر" : "غير محدد" }] : []),
      ...(customer.packageName ? [{ id: "package", header: "الباقة", body: customer.packageName }] : []),
      ...(customer.packageDays ? [{ id: "package_duration", header: "مدة الباقة", body: `${customer.packageDays} يوم` }] : []),
      ...(customer.packageExpiresAt ? [{ id: "package_expiry", header: "انتهاء الباقة", body: dateLabel(customer.packageExpiresAt) }] : []),
      ...(customer.email ? [{ id: "email", header: "البريد الإلكتروني", body: customer.email }] : []),
    ],
  };
}

export async function verifyGoogleWalletSetup() {
  const walletClass = await walletRequest<{ id?: string }>("GET", `/genericClass/${encodeURIComponent(CLASS_ID)}`);
  if (walletClass.id !== CLASS_ID) throw new GoogleWalletError("class_id_mismatch", "Google Wallet returned a different Generic Class ID");
  return { classId: walletClass.id };
}

export async function syncGoogleWalletClassLocations(locations: Array<{ latitude: number; longitude: number }>) {
  if (locations.length > 10) throw new GoogleWalletError("too_many_locations", "Google Wallet supports at most 10 merchant locations on a Generic Class");
  await walletRequest("PATCH", `/genericClass/${encodeURIComponent(CLASS_ID)}`, { merchantLocations: locations });
  return { classId: CLASS_ID, locationCount: locations.length };
}

export async function upsertGoogleWalletObject(customer: WalletCustomer) {
  getServiceAccount();
  try {
    await verifyGoogleWalletSetup();
  } catch (error) {
    if (error instanceof GoogleWalletError && error.code === "class_or_object_not_found") {
      throw new GoogleWalletError("class_not_found", "The configured Generic Class does not exist or is not accessible to the service account. The app will not create a replacement class.");
    }
    throw error;
  }

  const object = buildGenericObject(customer);
  const objectPath = `/genericObject/${encodeURIComponent(object.id)}`;
  let exists = false;
  try {
    const current = await walletRequest<{ id?: string; classId?: string }>("GET", objectPath);
    if (current.classId !== CLASS_ID) throw new GoogleWalletError("object_class_mismatch", "This customer object is not attached to the configured Generic Class");
    exists = true;
  } catch (error) {
    if (!(error instanceof GoogleWalletError) || error.code !== "class_or_object_not_found") throw error;
  }

  if (exists) {
    await walletRequest("PATCH", objectPath, object);
  } else {
    try {
      await walletRequest("POST", "/genericObject", object);
    } catch (error) {
      if (!(error instanceof GoogleWalletError) || error.code !== "object_conflict") throw error;
      await walletRequest("PATCH", objectPath, object);
    }
  }
  return { objectId: object.id };
}

export async function createGoogleWalletSaveUrl(customer: WalletCustomer, origin: string) {
  const account = getServiceAccount();
  const privateKey = await importPKCS8(account.private_key!, "RS256");
  const jwt = await new SignJWT({
    typ: "savetowallet",
    origins: [new URL(origin).origin],
    payload: { genericObjects: [buildGenericObject(customer)] },
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(account.client_email!)
    .setAudience("google")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(privateKey);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

export function googleWalletErrorCode(error: unknown) {
  return error instanceof GoogleWalletError ? error.code : "google_api_unavailable";
}
