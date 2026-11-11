import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { trpc } from "@/lib/trpc";
import { PublicFrame } from "./RegisterPage";
import { Apple, BadgeCheck, Info, Leaf, LoaderCircle, WalletCards } from "lucide-react";

type WalletProvider = "google" | "apple";

export default function MemberPage({ params }: { params: { token: string } }) {
  const member = trpc.customers.member.useQuery({ token: params.token }, { retry: false, refetchInterval: 30000 });
  const utils = trpc.useUtils();
  const retryWallet = trpc.customers.retryGoogleWallet.useMutation({ onSuccess: async () => { await utils.customers.member.invalidate({ token: params.token }); } });
  const [qr, setQr] = useState("");
  const [walletChoice, setWalletChoice] = useState<WalletProvider | null>(null);
  useEffect(() => { void QRCode.toDataURL(`${window.location.origin}/member/${params.token}`, { width: 240, margin: 1, color: { dark: "#234737", light: "#ffffff" }, errorCorrectionLevel: "M" }).then(setQr); }, [params.token]);
  if (member.isLoading) return <PublicFrame><div className="screen-state">جارٍ تحميل البطاقة…</div></PublicFrame>;
  if (!member.data) return <PublicFrame><div className="empty-state"><h2>البطاقة غير موجودة</h2><p>تحقق من الرابط أو تواصل مع الفرع.</p></div></PublicFrame>;
  const value = member.data;
  const walletErrorText = value.googleWalletErrorCode === "permission_denied"
    ? "Google رفض صلاحية حساب الخدمة. تأكدي من إضافة بريد حساب الخدمة كـDeveloper أو Admin في Google Wallet Console."
    : value.googleWalletErrorCode === "authentication_failed"
      ? "تعذرت مصادقة حساب الخدمة مع Google. راجعي صلاحية المفتاح وتحققي من أن حساب الخدمة صحيح وغير معطّل."
    : value.googleWalletErrorCode === "class_not_found"
      ? "لم يتم العثور على Generic Class الحالية أو لا يستطيع حساب الخدمة الوصول إليها. لن ينشئ النظام Class بديلة."
      : value.googleWalletErrorCode === "invalid_pass_data"
        ? "رفض Google بيانات البطاقة أو إعدادات الـClass. راجعي إعدادات الـGeneric Class في Google Wallet Console."
        : "تعذّر إصدار بطاقة Google Wallet. بيانات التسجيل محفوظة؛ يمكنك إعادة المحاولة أو التواصل مع المدير.";
  return <PublicFrame><section className="public-card"><div className="eyebrow">بطاقتك الرقمية</div><h1 style={{ marginTop: 5 }}>أهلاً {value.fullName.split(" ")[0]}</h1><p className="subtext">احتفظ بهذه البطاقة وامسح الرمز عند استلام وجبتك.</p><div className="member-card"><div className="member-top"><span className="brand-mark"><Leaf size={15} /></span><span>رصيد الوجبات</span><BadgeCheck className="verify" size={18} /></div><div className="member-name">{value.fullName}</div><div className="member-branch">اشتراك فعّال · {value.branchName}</div><div className="member-balance"><b>{value.mealsRemaining}</b><span>/ {value.totalMeals}</span></div><div className="member-progress"><span style={{ width: `${value.totalMeals ? (value.mealsRemaining / value.totalMeals) * 100 : 0}%` }} /></div><div className="member-footer"><span>وجبة متبقية</span><span>رصيد محدث</span></div></div><div className="qr-panel">{qr && <img src={qr} alt="باركود بطاقة العميل" />}</div><div style={{ textAlign: "center", color: "#9aa49d", fontSize: 9 }}>الباركود خاص بحسابك — لا تشاركه مع الآخرين</div><div className="wallet-picker"><div className="wallet-picker-heading"><b>أضيفي البطاقة إلى محفظتك</b><span>اختاري Google Wallet لحفظ البطاقة الحقيقية</span></div><div className="wallet-actions">{value.googleWalletSaveUrl && value.googleWalletStatus === "ready" ? <a className="wallet-button google-wallet-ready" href={value.googleWalletSaveUrl} target="_blank" rel="noreferrer"><WalletCards size={17} /> إضافة إلى Google Wallet</a> : <button type="button" className={`wallet-button${walletChoice === "google" ? " selected" : ""}`} disabled={retryWallet.isPending || value.googleWalletStatus === "pending"} aria-pressed={walletChoice === "google"} onClick={() => { setWalletChoice("google"); retryWallet.mutate({ token: params.token }); }}>{retryWallet.isPending || value.googleWalletStatus === "pending" ? <LoaderCircle size={17} className="wallet-spinner" /> : <WalletCards size={17} />}{retryWallet.isPending || value.googleWalletStatus === "pending" ? "جارٍ تجهيز البطاقة…" : "إعادة تجهيز Google Wallet"}</button>}<button type="button" className={`wallet-button${walletChoice === "apple" ? " selected" : ""}`} aria-pressed={walletChoice === "apple"} onClick={() => setWalletChoice("apple")}><Apple size={17} /> Apple Wallet لاحقاً</button></div><div className={`wallet-status ${value.googleWalletStatus === "ready" ? "wallet-status-ready" : ""}`} role="status"><Info size={16} /><span>{value.googleWalletStatus === "ready" && value.googleWalletSaveUrl ? "بطاقة Google Wallet جاهزة. المُصدر في وضع Demo؛ الإضافة متاحة فقط لحسابات Admin/Developer أو حسابات الاختبار المضافة لدى المُصدر." : value.googleWalletStatus === "error" ? walletErrorText : "يجري تجهيز بطاقة Google Wallet الحقيقية. لا تظهر البطاقة كجاهزة إلا بعد نجاح اتصال الخادم بـGoogle."}{walletChoice === "apple" ? " Apple Wallet غير مفعّل بعد." : ""}</span></div></div></section></PublicFrame>;
}
