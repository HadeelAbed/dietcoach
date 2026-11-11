# اختبار Google Wallet لبطاقة Diet Coach

## ما يفعله النظام

عند إرسال نموذج التسجيل الموجود، يحفظ الخادم العميل أولاً، ثم يستخدم Google Wallet REST API لإنشاء Generic Object مستقل مرتبط بالـGeneric Class الحالية `3388000000023241182.dietcoach_membership`. لا ينشئ التطبيق Class بديلة. بعد نجاح الطلب، يوقّع الخادم رابط حفظ Google Wallet وتظهر أداة الإضافة بصفحة البطاقة. معرّف الـObject مبني على رمز عضوية عشوائي وليس على الاسم أو البريد. تحفظ قاعدة البيانات معرّف الـObject وحالة الإصدار وتاريخ آخر مزامنة.

مفتاح حساب الخدمة يأتي من سر الخادم `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON`، ويُستخدم على الخادم فقط. لا تضعيه في متغيرات تبدأ بـ`VITE_`، ولا تحفظيه في الشيفرة أو Git. لا يرسل النظام زر نجاح عندما يفشل إنشاء البطاقة.

## خطوات تجربة Demo

1. في Google Wallet Console، افتحي حساب المُصدر وتأكدي أن الـGeneric Class الموجودة مُهيّأة ومتاحة للإصدار.
2. من إعدادات المستخدمين/حسابات الاختبار في Google Wallet Console، أضيفي حساب الخدمة `diet-coach-wallet@dietcoach-wallet.iam.gserviceaccount.com` بدور `Developer` أو `Admin`، وأضيفي أيضاً حساب Google الذي ستستخدمينه فعلياً لحفظ البطاقة كحساب اختبار أو صاحب دور مسموح.
3. افتحي رابط تسجيل جديد في Diet Coach وكمّلي نموذج التسجيل الحالي ببيانات اختبارية.
4. في صفحة البطاقة، انتظري نتيجة الإصدار. عند النجاح يظهر زر «إضافة إلى Google Wallet»؛ افتحي الرابط باستخدام حساب Google المصرّح به أعلاه ووافقي على الحفظ.
5. للتحقق من المزامنة، نفّذي خصم وجبة اختبارية أو عدّلي بيانات العميل من لوحة المدير. يظهر الرصيد أو البيانات الجديدة في الـObject نفسه؛ إذا رفض Google التحديث، يعرض التطبيق أن عملية الخصم/الحفظ نجحت محلياً لكن Wallet لم يتحدث.

في Demo mode، يستطيع الإصدار فقط لحساب Admin أو Developer أو حساب اختبار مضاف للمُصدر. نجاح ظهور الرابط وحده ليس إثباتاً أن Google قبل البطاقة؛ يجب أن يتمكن حساب مصرح له من إتمام الحفظ داخل Google Wallet.

## رسائل التعذر الشائعة

- `permission_denied`: تحققي من صلاحية حساب الخدمة في Google Wallet Console ومن أن Google Wallet API مفعّلة بالمشروع.
- `class_not_found`: تأكدي أن الـClass ID هو تماماً `3388000000023241182.dietcoach_membership` وأنها موجودة ويمكن لحساب الخدمة الوصول إليها. لن ينشئ التطبيق Class ثانية.
- `invalid_pass_data`: راجعي إعدادات/نوع الـGeneric Class وحقولها في Google Wallet Console.
- إذا لم يظهر زر الحفظ، راجعي حالة البطاقة في صفحة العميل. لا يُعرض زر الحفظ الفعلي إلا بعد نجاح إنشاء/تحديث الـObject.

## مصادر Google الرسمية

- [إنشاء Generic Pass Class وObject](https://developers.google.com/wallet/generic/use-cases/create)
- [إنشاء رابط Add to Google Wallet موقّع](https://developers.google.com/wallet/generic/use-cases/jwt)
- [مرجع Google Wallet Generic Object REST](https://developers.google.com/wallet/reference/rest/v1/genericobject)
- [إعداد حساب Issuer ووضع Demo](https://developers.google.com/wallet/generic/getting-started/issuer-onboarding)
- [Google Wallet web codelab: service account وREST API وsave link](https://codelabs.developers.google.com/add-to-wallet-web)
