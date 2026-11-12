# DRAFT: İade ve Cayma Koşulları (not approved, not loaded)

Draft for the lawyer or Owner. It follows the rules approved in [returns-review.md](returns-review.md) and my reading of the Mesafeli Sözleşmeler Yönetmeliği (14-day withdrawal, hygiene exception in art. 15). Items in **[AVUKAT]** need the lawyer to confirm or correct. Nothing here is legal advice. Once approved, copy the text between the lines into `store-frontend/src/features/legal/content/returns-withdrawal.md` and bump `version` in `features/legal/pages.ts`.

Placeholders in `{{ }}` come from Store settings (seller name, address, email, phone, return carrier).

---

# İade ve Cayma Koşulları

## 1. Cayma hakkı

Siparişinizin size teslim edildiği tarihten itibaren **14 gün** içinde, herhangi bir gerekçe göstermeden ve cezai şart ödemeden cayma hakkınızı kullanabilirsiniz. Birden fazla ürün içeren siparişlerde süre, son ürünün teslim tarihinden başlar. **[AVUKAT: parçalı teslimat ifadesi]**

## 2. İade talebi nasıl yapılır?

1. Sipariş takip sayfanızdan veya hesabınızdaki sipariş ayrıntısından "İade talep et" seçeneğini kullanın. Üye olmadan verdiğiniz siparişlerde size e-posta ile gönderilen takip bağlantısı yeterlidir.
2. İade etmek istediğiniz ürünleri ve adetlerini, bir de iade nedenini seçin: beden uymadı, vazgeçtim, ürün kusurlu, yanlış ürün gönderildi veya diğer.
3. Talebinizi aldığımızda size e-posta göndeririz. Ekibimiz talebi inceler ve onay ya da ret bilgisini e-posta ile iletir. Reddedilen taleplerde gerekçe belirtilir.
4. Talebiniz onaylanırsa ürünleri aşağıdaki iade kargo bilgisine göre bize gönderin.

Cayma bildirimini ayrıca {{seller_email}} adresine e-posta ile veya {{seller_address}} adresine yazılı olarak da yapabilirsiniz. **[AVUKAT: yazılı bildirim kanalı]**

## 3. İade edilemeyen ürünler

Aşağıdaki ürünlerde cayma hakkı kullanılamaz:

- Ambalajı, bandı, mührü veya koruyucu unsuru açılmış iç giyim, külot, mayo/bikini altı gibi **sağlık ve hijyen açısından iadesi uygun olmayan** ürünler.
- Tüketicinin istekleri veya kişisel ihtiyaçları doğrultusunda hazırlanan ürünler (sipariş üzerine hazırlananlar). **[AVUKAT: bu mağaza için geçerli mi, yoksa çıkarılmalı mı?]**

Bu ürünler, sipariş sayfasında ve ürün sayfasında hijyen ürünü olarak belirtilir ve iade talebinde seçilemez. Ambalajı açılmamış ürünler iade edilebilir. **[AVUKAT: "ambalajı açılmamış" koşulunun sınırı]**

## 4. Ürünün durumu

İade edeceğiniz ürünleri kullanılmamış, yıkanmamış, etiketleri üzerinde ve mümkünse orijinal ambalajında gönderin. Ürünün özelliğini kuralına uygun kullanım dışında bozacak şekilde kullanılması hâlinde değer kaybından sorumlu olabilirsiniz. **[AVUKAT]**

## 5. İade kargo ücreti

- Ürün **kusurlu** ise veya size **yanlış ürün** gönderildiyse iade kargo ücretini **mağazamız öder**.
- Diğer nedenlerde (beden uymadı, vazgeçtim, diğer) iade kargo ücretini **siz ödersiniz**.

Onay e-postasında iade kargo ücretini kimin ödeyeceği ayrıca belirtilir. **[AVUKAT: cayma hâlinde iade masrafının alıcıya yüklenmesi için ön bilgilendirmede açık bilgi şartı]**

İade kargo bilgisi: Anlaşmalı taşıyıcımız **{{return_carrier}}**. Gönderim yöntemi onay e-postasında bildirilir. Anlaşmalı taşıyıcı dışında bir firmayla gönderirseniz kargo sürecinden doğan risk size aittir. **[AVUKAT]**

## 6. Ödeme iadesi

Ürünler bize ulaşıp kontrol edildikten sonra, ödemenizin iadesini en geç **14 gün** içinde yaparız. Cayma bildiriminizin bize ulaştığı tarihten itibaren 14 günlük iade süresi işler. **[AVUKAT: sürenin başlangıcı]**

- Kapıda ödemeli ve havale/EFT ile yapılan siparişlerde iade, **banka havalesi (IBAN)** veya **nakit** olarak yapılır. İade için sizinle iletişime geçeriz ve IBAN bilgisi isteriz.
- İade tutarı ürün bedelini ve ödediğiniz standart gönderim bedelini kapsar. Kapıda ödeme hizmet bedeli iade kapsamına girer mi? **[AVUKAT]**
- Bankanıza bağlı olarak tutarın hesabınıza yansıması birkaç gün sürebilir.

## 7. Sipariş iptali

Siparişiniz kargoya verilmeden önce takip sayfanızdan veya hesabınızdan iptal edebilirsiniz. Ödeme yaptıysanız iade için sizinle iletişime geçeriz. Kargoya verilmiş siparişler için bu bölümdeki iade koşulları geçerlidir.

## 8. Kusurlu veya hatalı ürün

Kusurlu ya da yanlış gönderilen ürünlerde 6502 sayılı Tüketicinin Korunması Hakkında Kanun kapsamındaki ayıplı mal haklarınız saklıdır. **[AVUKAT: süreler ve seçimlik haklar atfı]**

## 9. İletişim ve şikâyet

{{seller_name}} · {{seller_address}} · {{seller_email}} · {{seller_phone}}

Şikâyet ve itirazlarınız için: {{complaint_contact}}. Tüketici hakem heyetlerine ve tüketici mahkemelerine başvuru hakkınız saklıdır. **[AVUKAT: güncel parasal sınırlar]**

---

## Open points for the lawyer

1. Every **[AVUKAT]** marker above.
2. The pre-information form must name the return carrier and the shipping-payer rule, or the shop may not be able to charge the Shopper for return shipping.
3. Whether the 14-day refund clock starts at the withdrawal notice or at receipt of the goods.
4. Whether an approval step (Staff approve or reject) is compatible with an unconditional withdrawal right, apart from the hygiene exclusion. A rejection should state a reason.
