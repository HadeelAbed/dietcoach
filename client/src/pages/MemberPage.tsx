import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { trpc } from "@/lib/trpc";
import { PublicFrame } from "./RegisterPage";
import { Apple, BadgeCheck, Info, Leaf, WalletCards } from "lucide-react";

type WalletProvider = "google" | "apple";

export default function MemberPage({ params }: { params: { token: string } }) {
  const member = trpc.customers.member.useQuery({ token: params.token }, { retry: false, refetchInterval: 30000 });
  const [qr, setQr] = useState("");
  const [walletChoice, setWalletChoice] = useState<WalletProvider | null>(null);
  useEffect(() => { void QRCode.toDataURL(`${window.location.origin}/member/${params.token}`, { width: 240, margin: 1, color: { dark: "#234737", light: "#ffffff" }, errorCorrectionLevel: "M" }).then(setQr); }, [params.token]);
  if (member.isLoading) return <PublicFrame><div className="screen-state">جارٍ تحميل البطاقة…</div></PublicFrame>;
  if (!member.data) return <PublicFrame><div className="empty-state"><h2>البطاقة غير موجودة</h2><p>تحقق من الرابط أو تواصل مع الفرع.</p></div></PublicFrame>;
  const value = member.data;
  return <PublicFrame><section className="public-card"><div className="eyebrow">بطاقتك الرقمية</div><h1 style={{ marginTop: 5 }}>أهلاً {value.fullName.split(" ")[0]}</h1><p className="subtext">احتفظ بهذه البطاقة وامسح الرمز عند استلام وجبتك.</p><div className="member-card"><div className="member-top"><span className="brand-mark"><Leaf size={15} /></span><span>رصيد الوجبات</span><BadgeCheck className="verify" size={18} /></div><div className="member-name">{value.fullName}</div><div className="member-branch">اشتراك فعّال · {value.branchName}</div><div className="member-balance"><b>{value.mealsRemaining}</b><span>/ {value.totalMeals}</span></div><div className="member-progress"><span style={{ width: `${value.totalMeals ? (value.mealsRemaining / value.totalMeals) * 100 : 0}%` }} /></div><div className="member-footer"><span>وجبة متبقية</span><span>رصيد محدث</span></div></div><div className="qr-panel">{qr && <img src={qr} alt="باركود بطاقة العميل" />}</div><div style={{ textAlign: "center", color: "#9aa49d", fontSize: 9 }}>الباركود خاص بحسابك — لا تشاركه مع الآخرين</div><div className="wallet-picker"><div className="wallet-picker-heading"><b>اختاري محفظتك</b><span>اختيارك يحدد المنصة التي تفضلينها</span></div><div className="wallet-actions"><button type="button" className={`wallet-button${walletChoice === "google" ? " selected" : ""}`} aria-pressed={walletChoice === "google"} onClick={() => setWalletChoice("google")}><WalletCards size={17} /> Google Wallet</button><button type="button" className={`wallet-button${walletChoice === "apple" ? " selected" : ""}`} aria-pressed={walletChoice === "apple"} onClick={() => setWalletChoice("apple")}><Apple size={17} /> Apple Wallet</button></div>{walletChoice ? <div className="wallet-status" role="status"><Info size={16} /><span>{walletChoice === "google" ? "اخترتِ Google Wallet." : "اخترتِ Apple Wallet."} إصدار البطاقة لهذه المحفظة غير مفعّل بعد. بطاقتك الرقمية أعلاه تعمل الآن، ويُحدّث رصيدها من الموقع بعد الخصم؛ اختيار المحفظة هنا لا يضيف بطاقة فعلية.</span></div> : <div className="wallet-status"><Info size={16} /><span>اختاري المحفظة التي تستخدمينها. الإضافة الفعلية وتحديث الرصيد داخل المحفظة يحتاجان تفعيل حسابات وشهادات Diet Coach.</span></div>}</div></section></PublicFrame>;
}
