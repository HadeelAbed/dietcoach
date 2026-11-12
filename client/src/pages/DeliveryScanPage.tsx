import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Check, LoaderCircle, MapPin, ScanLine, ShieldCheck, Smartphone } from "lucide-react";
import { PublicFrame } from "./RegisterPage";

function memberToken(value: string) {
  const text = value.trim();
  return text.match(/\/member\/([A-Za-z0-9_-]+)/)?.[1] ?? text;
}

export default function DeliveryScanPage({ params }: { params: { token: string } }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [customerToken, setCustomerToken] = useState("");
  const [receipt, setReceipt] = useState<{ fullName: string; mealsRemaining: number; totalMeals: number; walletSync: "ready" | "error" } | null>(null);
  const info = trpc.deliveryStation.info.useQuery({ token: params.token }, { retry: false });
  const preview = trpc.deliveryStation.preview.useQuery({ stationToken: params.token, customerToken }, { enabled: !!customerToken, retry: false });
  const utils = trpc.useUtils();
  const redeem = trpc.deliveryStation.redeem.useMutation({
    onSuccess: async result => {
      setReceipt(result);
      if (result.walletSync === "ready") toast.success("تم تأكيد التسليم وتحديث بطاقة Google Wallet");
      else toast.error("تم تأكيد التسليم والخصم، لكن تعذّر تحديث بطاقة Google Wallet");
      await utils.dashboard.data.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!info.data || !cameraActive || !videoRef.current) return;
    let controls: { stop: () => void } | undefined;
    let active = true;
    setCameraError("");
    void import("@zxing/browser").then(({ BrowserMultiFormatReader }) => {
      if (!active || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      return reader.decodeFromVideoDevice(undefined, videoRef.current, result => {
        if (!result) return;
        const token = memberToken(result.getText());
        if (token.length >= 20) {
          controls?.stop();
          setCameraActive(false);
          setManualValue("");
          setCustomerToken(token);
          setReceipt(null);
        }
      });
    }).then(found => { if (active && found) controls = found; else found?.stop(); }).catch(() => setCameraError("تعذّر تشغيل الكاميرا. اسمحي بالوصول إليها أو أدخلي رمز البطاقة يدوياً."));
    return () => { active = false; controls?.stop(); };
  }, [info.data, cameraActive]);

  const scanManual = (event: React.FormEvent) => {
    event.preventDefault();
    const token = memberToken(manualValue);
    if (token.length < 20) { setCameraError("رمز البطاقة غير مكتمل؛ امسحي QR البطاقة أو أدخلي الرابط الكامل."); return; }
    setCameraError("");
    setCustomerToken(token);
    setReceipt(null);
    setCameraActive(false);
  };
  const scanNext = () => { setCustomerToken(""); setReceipt(null); setManualValue(""); setCameraError(""); setCameraActive(true); };

  if (info.isLoading) return <PublicFrame><div className="screen-state">جارٍ التحقق من رابط الماسح…</div></PublicFrame>;
  if (info.error || !info.data) return <PublicFrame><section className="public-card"><div className="empty-state"><span className="empty-icon"><ShieldCheck size={21} /></span><h2>رابط ماسح التوصيل غير صالح</h2><p>قد يكون الرابط قد أُبطل أو تغيّر. اطلب من الفرع رابطاً جديداً.</p></div></section></PublicFrame>;

  return <PublicFrame><section className="public-card delivery-station-card">
    <div className="eyebrow">Diet Coach · تسليم عبر التوصيل</div>
    <h1 style={{ marginTop: 5 }}>ماسح التوصيل</h1>
    <div className="delivery-station-badge"><MapPin size={15} /><span>{info.data.branchName}</span><span>·</span><span>{info.data.cashierName}</span></div>
    <p className="subtext">امسحي بطاقة أي عميل، تحققي من بياناته ورصيده، ثم أكدي التسليم لخصم وجبة واحدة.</p>

    {receipt ? <div className="delivery-done station-receipt"><span className="success-icon"><Check size={25} /></span><h2>تم تأكيد التسليم</h2><p>سُجّل الخصم كعملية توصيل باسم {receipt.fullName}.</p><div className="meal-remaining"><b>{receipt.mealsRemaining}</b><span>وجبة متبقية من {receipt.totalMeals}</span></div>{receipt.walletSync === "error" && <div className="wallet-status">تم تسجيل الخصم، لكن تعذّر تحديث بطاقة Google Wallet حالياً.</div>}<button className="button primary full" onClick={scanNext}><ScanLine size={16} /> مسح العميل التالي</button></div> : customerToken ? <div className="station-customer-result">
      {preview.isLoading ? <div className="screen-state"><LoaderCircle className="wallet-spinner" size={20} /> جارٍ قراءة البطاقة…</div> : preview.error ? <div className="wallet-status" role="alert">{preview.error.message}<button className="button secondary full" onClick={scanNext}>مسح بطاقة أخرى</button></div> : preview.data && <>
        <div className="member-card"><div className="member-top"><span className="brand-mark"><img src="/diet-coach-mark.png" alt="" /></span><span>بطاقة عميل · توصيل</span><ShieldCheck className="verify" size={18} /></div><div className="member-name">{preview.data.fullName}</div><div className="member-branch">الفرع المسجل: {preview.data.sourceBranchName}</div><div className="member-balance"><b>{preview.data.mealsRemaining}</b><span>وجبة متبقية</span></div><div className="member-footer"><span>إجمالي الاشتراك</span><span>{preview.data.totalMeals} وجبة</span></div></div>
        <p className="delivery-confirm-note">تأكدي من تسليم الوجبة لهذا العميل قبل الضغط على التأكيد.</p>
        <button className="button primary full" disabled={redeem.isPending || preview.data.mealsRemaining < 1} onClick={() => redeem.mutate({ stationToken: params.token, customerToken })}>{redeem.isPending ? "جارٍ تسجيل التسليم…" : preview.data.mealsRemaining < 1 ? "لا يوجد رصيد متبقٍ" : "تأكيد التسليم وخصم وجبة"}<Check size={16} /></button>
        {redeem.error && <p className="form-hint" role="alert">{redeem.error.message}</p>}
        <button className="button secondary full" onClick={scanNext}>إلغاء ومسح بطاقة أخرى</button>
      </>}
    </div> : <>
      <div className="scanner-frame station-scanner"><video ref={videoRef} muted playsInline /><div className="scanner-overlay"><span /></div><div className="scanner-label"><ScanLine size={16} /> وجّهي الكاميرا نحو QR بطاقة العميل</div></div>
      {cameraError && <p className="form-hint" role="status">{cameraError}</p>}
      {!cameraActive && <button className="button secondary full" onClick={() => setCameraActive(true)}><ScanLine size={16} /> تشغيل الكاميرا</button>}
      <form className="manual-code station-manual" onSubmit={scanManual}><label>أو أدخلي رمز البطاقة / رابطها يدوياً</label><div><input dir="ltr" value={manualValue} onChange={event => setManualValue(event.target.value)} placeholder="رمز البطاقة أو رابط /member/..." /><button className="button secondary" type="submit" disabled={manualValue.trim().length < 20}>بحث</button></div></form>
      <div className="delivery-station-security"><Smartphone size={15} /><span>هذا الرابط خاص بمندوب موثوق؛ كل تأكيد يسجل خصماً باسم هذا الكاشير وفرعه.</span></div>
    </>}
  </section></PublicFrame>;
}
