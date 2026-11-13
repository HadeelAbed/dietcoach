# اختبار Google Wallet لبطاقة Diet Coach

## ما يحدث بعد التسجيل

يبقى نموذج التسجيل الحالي وحقوله وتصميمه كما هي. بعد الإرسال، يحفظ النظام بيانات العميل ثم يفتح صفحة تأكيد البطاقة، وفيها يظهر زر Google Wallet الرسمي باللغة العربية إذا أمكن للخادم توقيع رابط الإضافة.

الرابط ليس محاكاة: الخادم يوقّع JWT بمفتاح حساب الخدمة المحفوظ كسِر خادمي، ويضمّنه Generic Object مستقلاً بمعرّف العميل الفريد وربطه بالـGeneric Class الحالية `3388000000023241182.dietcoach_membership`. وفق تدفق Google الرسمي، عند فتح رابط الإضافة والموافقة، يُحفظ الـObject في Google Wallet؛ لا ينشئ التطبيق Class جديدة. الظهور على صفحة Diet Coach يعني أن رابط الإضافة الحقيقي جاهز، وليس أن العميل وافق أو أن Google حفظت البطاقة بالفعل.

حالة اتصال Google Wallet REST API منفصلة عن زر الإضافة. إذا رفض Google مزامنة الـObject أو تحديثه عبر REST، يبقى رابط الإضافة الموقّع ظاهراً ما دام الخادم قادراً على توقيعه؛ وتظهر ملاحظة بأن مزامنة التغييرات المستقبلية تحتاج صلاحية حساب الخدمة. عند تعديل الإدارة أو خصم وجبة، يزامن التطبيق الـObject نفسه عبر REST متى كانت صلاحية حساب الخدمة متاحة.

مفتاح حساب الخدمة يأتي من السر الخادمي `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON`، ولا يُرسل إلى المتصفح أو يُحفظ في الشيفرة أو Git. يستخرج الخادم أصل الصفحة من ترويسة `Origin` أو `Referer` الفعلية، ويرفض الأصل غير الآمن أو المتعارض؛ لا يأخذ النطاق من قيمة يرسلها العميل داخل استدعاء الـAPI.

## تجربة Demo

1. في Google Wallet Console، افتحي حساب المُصدر وتأكدي من وجود الـGeneric Class الحالية.
2. أضيفي حساب الخدمة `diet-coach-wallet@dietcoach-wallet.iam.gserviceaccount.com` كـDeveloper أو Admin للمُصدر. وأضيفي حساب Google الذي سيحفظ البطاقة كحساب اختبار أو استخدمي حساباً يملك دور Admin/Developer.
3. من Diet Coach، افتحي رابط تسجيل جديد وأكملي النموذج الحالي ببيانات اختبارية.
4. في صفحة التأكيد، اضغطي زر Google Wallet الأسود الرسمي بالعربية، ثم وافقي على حفظ البطاقة في Google Wallet.
5. تحققي من ظهور البطاقة في Google Wallet. ينبغي أن يكون لكل عميل Generic Object مستقل بالـClass نفسها، ويعرض الاسم والرصيد والفرع ورقم الهاتف والباركود.
6. اختبري خصم وجبة أو تعديل بيانات العميل. إذا لم يكن حساب الخدمة مخوّلاً في Wallet Console، قد تنجح عملية التسجيل داخل Diet Coach لكن Google لا يقبل التحديث التلقائي للبطاقة إلى أن تُمنح الصلاحية.

في Demo mode، لا يستطيع حفظ البطاقة إلا حساب Admin أو Developer أو حساب اختبار أُضيف للمُصدر. زر الصفحة يفتح مسار الإضافة الحقيقي، لكنه لا يتجاوز قيود حساب Demo. ظهور الزر وحده لا يعني أن Google قبل البطاقة أو أن العميل حفظها.

## إذا لم يظهر الزر أو لم تُحفظ البطاقة

- إذا ظهر زر لكن رفض Google الحفظ، جرّبي بحساب Google مصرح به للمُصدر في وضع Demo.
- إذا لم يظهر زر، فالصفحة لم تتمكن من توقيع JWT؛ تحققي من وجود السر الخادمي وصحة مفتاح حساب الخدمة.
- إذا كان رابط الإضافة يعمل لكن رصيد البطاقة لا يتحدث بعد الخصم أو التعديل، أضيفي حساب الخدمة كـDeveloper أو Admin في Google Wallet Console، وتأكدي من تفعيل Wallet API.
- إذا ظهر `class_not_found`، تأكدي من أن الـClass ID هو تماماً `3388000000023241182.dietcoach_membership` وأنها موجودة. لن ينشئ التطبيق Class ثانية.
- إذا ظهر `invalid_pass_data`، راجعي إعدادات Generic Class والحقول المسموح بها في Google Wallet Console.

## مصادر Google الرسمية

- [Generic Pass JWT، بما فيه Generic Objects داخل رابط الإضافة](https://developers.google.com/wallet/generic/use-cases/jwt)
- [إصدار Generic Pass عبر الويب وزر Add to Google Wallet](https://developers.google.com/wallet/generic/web)
- [تعريف بيانات JWT المطلوبة](https://developers.google.com/wallet/reference/rest/v1/Jwt)
- [قواعد زر Google Wallet الرسمي والأصول العربية](https://developers.google.com/wallet/generic/resources/brand-guidelines)
- [إعداد حساب Issuer ووضع Demo](https://developers.google.com/wallet/generic/getting-started/issuer-onboarding)
- [مصطلحات وضع Demo وحسابات الاختبار](https://developers.google.com/wallet/generic/resources/terminology)
- [Google Wallet Generic Object REST API](https://developers.google.com/wallet/reference/rest/v1/genericobject)
