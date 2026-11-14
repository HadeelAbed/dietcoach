import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { CalendarDays, Check, MapPin, UserRound, Utensils } from "lucide-react";

const dateLabel = (date: Date) => new Intl.DateTimeFormat("ar", { year: "numeric", month: "long", day: "numeric" }).format(date);

type PackageChoice = { id: number; name: string; durationDays: number; totalMeals: number };

export default function RegisterPage({ params }: { params: { token: string } }) {
  const [, navigate] = useLocation();
  const info = trpc.registration.info.useQuery({ token: params.token }, { retry: false });
  const submit = trpc.registration.submit.useMutation({ onSuccess: result => navigate(result.url) });
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", gender: "" as "female" | "male" | "unspecified" | "", packageId: "" });
  const [selectedPlanName, setSelectedPlanName] = useState("");
  const packages = info.data?.packages ?? [];
  const selectedPackage = useMemo(() => packages.find(item => String(item.id) === form.packageId), [packages, form.packageId]);
  const packageGroups = useMemo(() => {
    const groups = new Map<string, PackageChoice[]>();
    for (const item of packages) groups.set(item.name, [...(groups.get(item.name) ?? []), item]);
    return [...groups.entries()].map(([name, choices]) => ({ name, choices: choices.sort((a, b) => a.durationDays - b.durationDays) }));
  }, [packages]);
  const projectedExpiry = selectedPackage ? new Date(Date.now() + selectedPackage.durationDays * 24 * 60 * 60 * 1000) : null;

  if (info.isLoading) return <PublicFrame><div className="screen-state">جارٍ تحميل رابط التسجيل…</div></PublicFrame>;
  if (!info.data) return <PublicFrame><div className="empty-state"><h2>رابط التسجيل غير صالح</h2><p>اطلب من الكاشير إنشاء رابط جديد.</p></div></PublicFrame>;
  const linkInfo = info.data;
  const needsPackage = linkInfo.packageSelectionEnabled;

  return <PublicFrame>
    <section className="public-card register-card">
      <div className="eyebrow">عضوية Diet Coach</div>
      <h1>بداية جديدة، بخطوة بسيطة</h1>
      <p className="subtext">سجّل بياناتك، واختر باقتك لتظهر وجباتك وتاريخ انتهاء عضويتك على بطاقتك.</p>
      <div className="public-meta"><span><MapPin size={13} />{linkInfo.branchName}</span><span><UserRound size={13} />{linkInfo.cashierName}</span>{!needsPackage && <span>{linkInfo.totalMeals} وجبة</span>}</div>

      {needsPackage && <section className="package-picker" aria-labelledby="package-heading">
        <div className="package-picker-heading"><div><div className="eyebrow">اختيار الاشتراك</div><h2 id="package-heading">اختاري باقتك</h2></div><span className="package-badge"><Utensils size={15} />{packages.length} باقات</span></div>
        {packages.length ? <div className="package-select-grid"><label className="package-select-label">نوع الباقة<select required value={selectedPlanName} onChange={event => { setSelectedPlanName(event.target.value); setForm({ ...form, packageId: "" }); }}><option value="">اختاري عدد الوجبات اليومية</option>{packageGroups.map(group => <option value={group.name} key={group.name}>{group.name}</option>)}</select></label><label className="package-select-label">مدة الباقة<select required value={form.packageId} disabled={!selectedPlanName} onChange={event => setForm({ ...form, packageId: event.target.value })}><option value="">اختاري عدد الأيام</option>{packageGroups.find(group => group.name === selectedPlanName)?.choices.map(item => <option value={item.id} key={item.id}>{item.durationDays} يوم · {item.totalMeals} وجبة إجمالاً</option>)}</select></label></div> : <div className="form-hint">يجري تجهيز خيارات الباقات من الإدارة. حدّثي الصفحة بعد قليل أو تواصلي مع الفرع.</div>}
        {selectedPackage && projectedExpiry && <div className="package-selection-summary"><span><CalendarDays size={15} /> مدة الباقة: {selectedPackage.durationDays} يوم</span><span><Utensils size={15} /> إجمالي الوجبات: {selectedPackage.totalMeals}</span><span><CalendarDays size={15} /> تنتهي تقريباً: {dateLabel(projectedExpiry)}</span></div>}
      </section>}

      <form className="public-form" onSubmit={event => { event.preventDefault(); submit.mutate({ token: params.token, fullName: form.fullName, phone: form.phone, email: form.email, gender: form.gender as "female" | "male" | "unspecified", packageId: form.packageId ? Number(form.packageId) : undefined }); }}>
        <label>الاسم الكامل<input required minLength={2} maxLength={160} autoComplete="name" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} placeholder="اكتب اسمك كما تحب أن يظهر" /></label>
        <label>رقم الهاتف<input required minLength={7} maxLength={40} autoComplete="tel" inputMode="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="07X XXX XXXX" /></label>
        <fieldset className="gender-field"><legend>الجنس</legend><div className="gender-options">
          {[{ value: "male", label: "ذكر", symbol: "👨" }, { value: "female", label: "أنثى", symbol: "👩" }, { value: "unspecified", label: "أفضل عدم الإفصاح", symbol: "🤍" }].map(option => <label className={`gender-option${form.gender === option.value ? " selected" : ""}`} key={option.value}><input type="radio" name="gender" required checked={form.gender === option.value} onChange={() => setForm({ ...form, gender: option.value as typeof form.gender })} /><span>{option.symbol}</span><b>{option.label}</b></label>)}
        </div></fieldset>
        <label>البريد الإلكتروني <span className="optional">اختياري</span><input type="email" maxLength={320} autoComplete="email" dir="ltr" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" /></label>
        {submit.error && <p className="form-hint">{submit.error.message}</p>}
        <button className="button primary full" disabled={submit.isPending || (needsPackage && (!selectedPackage || packages.length === 0))}>{submit.isPending ? "جارٍ إنشاء البطاقة…" : "إنشاء بطاقتي الرقمية"} <Check size={16} /></button>
      </form>
      <p className="public-terms">بياناتك تحفظ لمتابعة رصيد وجباتك واشتراكك فقط.</p>
    </section>
  </PublicFrame>;
}

export function PublicFrame({ children }: { children: React.ReactNode }) { return <main className="public-page" dir="rtl"><div className="public-container"><a href="/" className="public-logo"><span className="brand-mark"><img src="/diet-coach-mark.png" alt="شعار Diet Coach" /></span><span>Diet <b>Coach</b><small>دايت كوتش</small></span></a>{children}<div className="login-footer" style={{ marginTop: 22 }}>كل تغيير... له بداية.</div></div></main>; }
