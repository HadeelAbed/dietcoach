import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { MapPin, UserRound, Check } from "lucide-react";

export default function RegisterPage({ params }: { params: { token: string } }) {
  const [, navigate] = useLocation();
  const info = trpc.registration.info.useQuery({ token: params.token }, { retry: false });
  const submit = trpc.registration.submit.useMutation({ onSuccess: result => navigate(result.url) });
  const [form, setForm] = useState({ fullName: "", phone: "", email: "" });
  if (info.isLoading) return <PublicFrame><div className="screen-state">جارٍ تحميل رابط التسجيل…</div></PublicFrame>;
  if (!info.data) return <PublicFrame><div className="empty-state"><h2>رابط التسجيل غير صالح</h2><p>اطلب من الكاشير إنشاء رابط جديد.</p></div></PublicFrame>;
  return <PublicFrame><section className="public-card"><div className="eyebrow">عضوية Diet Coach</div><h1>بداية جديدة، بخطوة بسيطة</h1><p className="subtext">سجّل بياناتك وأنشئ بطاقتك الرقمية لمتابعة وجباتك.</p><div className="public-meta"><span><MapPin size={13} />{info.data.branchName}</span><span><UserRound size={13} />{info.data.cashierName}</span><span>{info.data.totalMeals} وجبة</span></div><form className="public-form" onSubmit={event => { event.preventDefault(); submit.mutate({ token: params.token, ...form }); }}><label>الاسم الكامل<input required minLength={2} maxLength={160} autoComplete="name" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} placeholder="اكتب اسمك كما تحب أن يظهر" /></label><label>رقم الهاتف<input required minLength={7} maxLength={40} autoComplete="tel" inputMode="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="07X XXX XXXX" /></label><label>البريد الإلكتروني <span className="optional">اختياري</span><input type="email" maxLength={320} autoComplete="email" dir="ltr" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" /></label>{submit.error && <p className="form-hint">{submit.error.message}</p>}<button className="button primary full" disabled={submit.isPending}>{submit.isPending ? "جارٍ إنشاء البطاقة…" : "إنشاء بطاقتي الرقمية"} <Check size={16} /></button></form><p className="public-terms">بياناتك تحفظ لمتابعة رصيد وجباتك فقط.</p></section></PublicFrame>;
}

export function PublicFrame({ children }: { children: React.ReactNode }) { return <main className="public-page" dir="rtl"><div className="public-container"><a href="/" className="public-logo"><span className="brand-mark"><img src="/diet-coach-mark.png" alt="شعار Diet Coach" /></span><span>Diet <b>Coach</b><small>دايت كوتش</small></span></a>{children}<div className="login-footer" style={{ marginTop: 22 }}>كل تغيير... له بداية.</div></div></main>; }
