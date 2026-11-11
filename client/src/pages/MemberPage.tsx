import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { trpc } from "@/lib/trpc";
import { PublicFrame } from "./RegisterPage";
import { Apple, BadgeCheck, Download, Leaf, WalletCards } from "lucide-react";

export default function MemberPage({ params }: { params: { token: string } }) {
  const member = trpc.customers.member.useQuery({ token: params.token }, { retry: false, refetchInterval: 30000 });
  const [qr, setQr] = useState("");
  useEffect(() => { void QRCode.toDataURL(`${window.location.origin}/member/${params.token}`, { width: 240, margin: 1, color: { dark: "#234737", light: "#ffffff" }, errorCorrectionLevel: "M" }).then(setQr); }, [params.token]);
  if (member.isLoading) return <PublicFrame><div className="screen-state">جارٍ تحميل البطاقة…</div></PublicFrame>;
  if (!member.data) return <PublicFrame><div className="empty-state"><h2>البطاقة غير موجودة</h2><p>تحقق من الرابط أو تواصل مع الفرع.</p></div></PublicFrame>;
  const value = member.data;
  return <PublicFrame><section className="public-card"><div className="eyebrow">بطاقتك الرقمية</div><h1 style={{ marginTop: 5 }}>أهلاً {value.fullName.split(" ")[0]}</h1><p className="subtext">احتفظ بهذه البطاقة وامسح الرمز عند استلام وجبتك.</p><div className="member-card"><div className="member-top"><span className="brand-mark"><Leaf size={15} /></span><span>رصيد الوجبات</span><BadgeCheck className="verify" size={18} /></div><div className="member-name">{value.fullName}</div><div className="member-branch">اشتراك فعّال · {value.branchName}</div><div className="member-balance"><b>{value.mealsRemaining}</b><span>/ {value.totalMeals}</span></div><div className="member-progress"><span style={{ width: `${value.totalMeals ? (value.mealsRemaining / value.totalMeals) * 100 : 0}%` }} /></div><div className="member-footer"><span>وجبة متبقية</span><span>رصيد محدث</span></div></div><div className="qr-panel">{qr && <img src={qr} alt="باركود بطاقة العميل" />}</div><div style={{ textAlign: "center", color: "#9aa49d", fontSize: 9 }}>الباركود خاص بحسابك — لا تشاركه مع الآخرين</div><div className="wallet-actions"><button className="wallet-button" disabled title="يتطلب ربط حساب Google Wallet"><WalletCards size={16} /> Google Wallet</button><button className="wallet-button" disabled title="يتطلب شهادة Apple Wallet"><Apple size={16} /> Apple Wallet</button></div><div className="wallet-status"><Download size={15} /><span>إضافة البطاقات للمحافظ تحتاج تفعيل حسابات Google وApple الخاصة بـ Diet Coach. بطاقتك ورصيدك محفوظان هنا ويتحدثان تلقائياً بعد المسح.</span></div></section></PublicFrame>;
}
