import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { trpc } from "@/lib/trpc";
import { PublicFrame } from "./RegisterPage";
import { Apple, BadgeCheck, Info, LoaderCircle } from "lucide-react";

type WalletProvider = "apple";

export default function MemberPage({ params }: { params: { token: string } }) {
  const member = trpc.customers.member.useQuery(
    { token: params.token },
    { retry: false, refetchInterval: 30000 },
  );
  const [qr, setQr] = useState("");
  const [walletChoice, setWalletChoice] = useState<WalletProvider | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(`${window.location.origin}/member/${params.token}`, {
      width: 240,
      margin: 1,
      color: { dark: "#234737", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then(setQr);
  }, [params.token]);

  if (member.isLoading) {
    return <PublicFrame><div className="screen-state">جارٍ تجهيز بطاقتك…</div></PublicFrame>;
  }
  if (!member.data) {
    return <PublicFrame><div className="empty-state"><h2>البطاقة غير موجودة</h2><p>تحققي من الرابط أو تواصلي مع الفرع.</p></div></PublicFrame>;
  }

  const value = member.data;
  const saveLinkError = value.googleWalletLinkErrorCode
    ? "تعذّر تجهيز رابط Google Wallet الآن. بياناتك محفوظة؛ أعيدي تحميل الصفحة للمحاولة مرة أخرى."
    : null;

  return (
    <PublicFrame>
      <div className="wallet-success-view">
        <section className="wallet-success-hero">
          <div className="wallet-success-logo"><img src="/diet-coach-mark.png" alt="" /></div>
          <span className="wallet-success-english">Diet Coach</span>
          <h1>دايت كوتش</h1>
          <p>بطاقتك أصبحت جاهزة — أضيفيها إلى محفظتك واحتفظي بها في كل زيارة.</p>
        </section>

        <section className="public-card wallet-success-card">
          <div className="wallet-success-kicker"><BadgeCheck size={17} /> تم إنشاء بطاقتك</div>
          <h2>أضيفي البطاقة إلى محفظتك</h2>
          <p className="subtext">مرحباً {value.fullName.split(" ")[0]}، يمكنك حفظ بطاقتك الآن في Google Wallet.</p>

          <div className="member-card">
            <div className="member-top">
              <span className="brand-mark"><img src="/diet-coach-mark.png" alt="شعار Diet Coach" /></span>
              <span>رصيد الوجبات</span>
              <BadgeCheck className="verify" size={18} />
            </div>
            <div className="member-name">{value.fullName}</div>
            <div className="member-branch">اشتراك فعّال · {value.branchName}</div>
            <div className="member-balance"><b>{value.mealsRemaining}</b><span>/ {value.totalMeals}</span></div>
            <div className="member-progress"><span style={{ width: `${value.totalMeals ? (value.mealsRemaining / value.totalMeals) * 100 : 0}%` }} /></div>
            <div className="member-footer"><span>وجبة متبقية</span><span>رصيد محدث</span></div>
          </div>

          <div className="wallet-customer-details">
            <span>رقم الهاتف</span><b dir="ltr">{value.phone}</b>
            {value.email && <><span>البريد الإلكتروني</span><b dir="ltr">{value.email}</b></>}
            <span>الفرع</span><b>{value.branchName}</b>
          </div>

          <div className="wallet-confirmation-action">
            {value.googleWalletSaveUrl ? (
              <a className="google-wallet-official-link" href={value.googleWalletSaveUrl} aria-label="إضافة البطاقة إلى Google Wallet" rel="noopener noreferrer">
                <img src="/google-wallet-add-ar.svg" alt="إضافة إلى Google Wallet" />
              </a>
            ) : (
              <div className="wallet-link-unavailable" role="status">
                <p>{saveLinkError ?? "جارٍ تجهيز رابط الإضافة الآمن…"}</p>
                <button type="button" className="button secondary" onClick={() => void member.refetch()} disabled={member.isFetching}>
                  {member.isFetching ? <LoaderCircle className="wallet-spinner" size={16} /> : "إعادة المحاولة"}
                </button>
              </div>
            )}
            {value.googleWalletSaveUrl && (
              <div className="wallet-status wallet-status-ready" role="status">
                <Info size={16} />
                <span>رابط Google Wallet الحقيقي جاهز. تُحفظ البطاقة عند الضغط والموافقة؛ وبسبب وضع Demo يجب استخدام حساب مُصرّح أو مُضاف كحساب اختبار.</span>
              </div>
            )}
            {value.googleWalletSaveUrl && value.googleWalletStatus === "error" && (
              <p className="wallet-sync-note">قد تحتاج مزامنة الرصيد والتغييرات اللاحقة إلى تفعيل حساب الخدمة كـDeveloper أو Admin في Google Wallet Console.</p>
            )}
          </div>

          <div className="qr-panel">{qr && <img src={qr} alt="باركود بطاقة العميل" />}</div>
          <div className="member-qr-note">الباركود خاص بحسابك — لا تشاركيه مع الآخرين</div>

          <button type="button" className={`wallet-button apple-wallet-placeholder${walletChoice === "apple" ? " selected" : ""}`} aria-pressed={walletChoice === "apple"} onClick={() => setWalletChoice("apple")}>
            <Apple size={17} /> Apple Wallet لاحقاً
          </button>
          {walletChoice === "apple" && <p className="wallet-sync-note">إضافة Apple Wallet غير مفعّلة حالياً.</p>}
        </section>
      </div>
    </PublicFrame>
  );
}
