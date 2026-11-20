# Back-in-stock emails under Turkish law: transactional or commercial?

Research for issue #59 (part of #58). Researched 2026-11-20. Not legal advice; see "Open items for a lawyer".

## Question

A small Turkish online clothing shop wants an opt-in "notify me when this size is back" email, for guests (email only) and for accounts. Is that email a commercial electronic message (ticari elektronik ileti, ETK) under the E-Commerce Law, or a transactional one that needs no consent? What consent wording, unsubscribe and retention rules apply, and what does KVKK require for a guest's email?

## Short answer

- Treat it as a **commercial electronic message**. No primary source mentions back-in-stock alerts, so this is an inference, but the law has no "the recipient asked for it" exception. The only no-consent categories (Regulation Art. 6) are about transactions the person already has with the shop, and Art. 6(2) says such messages may not promote any product. A "your size is back, buy it" email promotes a product.
- So the shop needs ETK consent (onay) before sending, İYS registration, a reject (ret) mechanism in every email, and 3-year records. The request form itself can be the consent moment, provided the wording is specific and unticked.
- KVKK applies in parallel: a separate privacy notice (aydınlatma metni), data minimisation, and deletion once the purpose ends. For a guest, the consent record is the part that has to be kept.

## 1. Classification

Sources:

- Law 6563 Art. 2(c) defines a ticari elektronik ileti as a message sent by electronic means "ticari amaçlarla" (for commercial purposes). Art. 6(1): such messages "ancak önceden onayları alınmak kaydıyla gönderilebilir". Art. 6(1) lets onay be skipped only for messages on "değişiklik, kullanım ve bakım" of goods or services already supplied, when the person gave contact details for that purpose.
- Regulation (Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik) Art. 5(1): consent is required for messages sent "mal ve hizmetlerini tanıtmak, pazarlamak" to the recipient's electronic address.
- Regulation Art. 6(2) exempts messages about "devam eden abonelik, üyelik veya ortaklık durumu ile tahsilat, borç hatırlatma, bilgi güncelleme, satın alma ve teslimat veya benzeri durumlar", then adds: "Ancak bu tür bildirimlerde herhangi bir mal veya hizmet özendirilemez veya bunların tanıtımı yapılamaz."

Reasoning:

- A back-in-stock alert is not about a purchase, delivery, debt or subscription the person already has. The person has bought nothing. It exists to prompt a sale.
- Art. 6(1) (post-sale change, use and maintenance of supplied goods) does not fit either.
- Art. 6(2) is the nearest "transactional" hook ("benzeri durumlar"), but its own proviso, that no product may be encouraged, defeats it. The ministry's page states the regulation "yalnızca ticari nitelik gösteren iletilere uygulanmaktadır", so the real question is whether the message is commercial, and a sales prompt is.
- Neither the law nor the regulation has an exception for a message the recipient requested. The regulation instead says consent is taken in advance (Art. 5(1), Art. 7). A person asking to be notified is a good consent moment, not a consent substitute.

Confidence: high that the consent route is the safe reading; medium that a regulator would call it commercial (no ruling on back-in-stock found). The argument for "transactional" (the user asked for exactly this one message) is real but unsupported by any text read.

## 2. Consent (onay) rules

All from the Regulation unless noted.

- Art. 5(1): consent is obtained by the shop or via İYS and "reddetme hakkı kullanılıncaya kadar geçerlidir" (valid until the right to refuse is used). Art. 5(2)-(3): anyone sending ETK registers with İYS, and no ETK may go to recipients with no consent in İYS.
- Art. 7(1): consent may be taken in writing or by any electronic means or via İYS. It contains the person's positive declaration (olumlu irade beyanı), their name and surname, and their electronic address. For İYS-collected consent, only the declaration and the address.
- Art. 7(3): when consent is taken electronically (not via İYS), the shop sends a confirmation to the address within 24 hours, with a way to reject. This doubles as email-ownership verification.
- Art. 7(4): you may not send a commercial message to ask for consent. Collect it in the request flow, not by emailing people.
- Art. 7(5): if consent is bundled into a contract (for example account sign-up terms), it goes at the end, before the signature/affirmation, under a "ticari elektronik ileti" side heading, at least 12 pt, with the reject option shown.
- Art. 7(8): the positive declaration may not be pre-ticked. Art. 7(9): consent cannot be made a precondition for supplying the shop's goods or services.
- Art. 7(10)-(12): for consent not taken via İYS, the shop bears the burden of proof, must register it in İYS within 3 business days, and unregistered consent "geçersiz kabul edilir".
- Law 6563 Art. 7(1) and Regulation Art. 8(1): message content must match the consent given. So scope the consent narrowly (this product/size), and do not add cross-sells.
- Regulation Art. 12(2): personal data may not be shared with third parties or reused for other purposes without the person's prior consent.

Suggested wording (Turkish; have a lawyer review). Unticked checkbox, separate from terms and from the privacy notice:

> "Seçtiğim ürünün ve bedenin tekrar stoğa girdiğinde, [Unvan], MERSİS No: [..] tarafından e-posta adresime bu bilgiyi içeren ticari elektronik ileti gönderilmesini kabul ediyorum. Bu onayı istediğim zaman e-postadaki bağlantıdan veya İYS üzerinden geri alabilirim."

Guest form: if consent is shop-taken (not via İYS), collect name and surname because Art. 7(1) lists them, or use the İYS consent flow, where only declaration plus address are needed. Do not condition checkout or account creation on this box (Art. 7(9)).

## 3. Message content, unsubscribe, retention

- Content (Art. 8): trade name and MERSİS number for a trader (name and T.C./tax number for an esnaf) in the header or body; at least one accessible contact detail; if the nature is unclear, a label such as "tanıtım", "kampanya" or "bilgilendirme" in the email subject (Art. 8(6)).
- Unsubscribe (Art. 9): the reject option appears in every email (Art. 9(4)), free and via the same channel (a reject-only URL works) (Art. 9(3)), with no reasons asked (Art. 9(1)). A reject voids consent for that channel (Art. 9(1)). The shop reports rejects to İYS within 3 business days (Art. 9(6)). Stop sending within 3 business days of the request reaching you (Art. 10(1); Law 6563 Art. 8(3)). The recipient may also reject through İYS (Art. 9(7)).
- Retention (Art. 13): the shop bears the burden of proof in a complaint (Art. 13(1)). Consent records are kept for 3 years from the date the consent stops being valid; other ETK records for 3 years from the record date; both are produced to the Ministry on request (Art. 13(2)). Law 6563 Art. 11(3) separately requires records of e-commerce transactions for 10 years; whether it covers pure consent logs is for a lawyer.
- Complaints go to the e-Devlet, İYS or Ministry channels within 3 months of the message (Art. 14); the ministry's TİSS page says the same.
- Fines (Law 6563 Art. 12, 2026 amounts per the table at the end of the law, Ministry Tebliğ in RG 25/12/2025 no. 33118): sending without consent (Art. 6(1)) or content not matching consent (Art. 7(1)): 2,859 to 14,309 TL, and up to ten times that when sent to several people at once (Art. 12(2)). Missing identification content (Art. 7(2)-(3)): 2,859 to 28,620 TL. Reject-mechanism failures (Art. 8(2)-(3)): 5,723 to 42,930 TL.

## 4. KVKK (Law 6698) for a guest's email

- An email address is personal data (Art. 3(d)), so collecting it for this purpose is processing under Art. 5.
- Legal basis: ETK consent is required by the e-commerce law, and Art. 5(1) KVKK asks for açık rıza by default. Art. 3(a) defines açık rıza as "belirli bir konuya ilişkin, bilgilendirilmeye dayanan ve özgür iradeyle açıklanan rıza" (specific, informed, free). The contract basis (Art. 5(2)(c)) fits poorly because there is no contract yet, so use consent. The KVKK Board's published decisions on sending ETK without açık rıza (2019/162, 2022/31) point the same way; I saw only their titles, not the text.
- Privacy notice (Art. 10): give the aydınlatma at the point of collection: controller identity, purpose, recipients and transfers, collection method and legal basis, and the Art. 11 rights. Keep it separate from the consent text: Board decision 2018/90 and the Board's 18/02/2026 principle decision 2026/347 (announced on kvkk.gov.tr) are reported to say notice and açık rıza must be separate documents and that "I have read the notice" must not be a consent. I could not open those pages (certificate error), so this rests on search-result summaries of kvkk.gov.tr; verify before relying.
- The Board's principle decision 2025/1072 (10/06/2025) is reported to say marketing-message consent must not be a mandatory condition of supplying a product, and that distinct processing purposes must not be merged into one action. Same caveat as above.
- Principles (Art. 4(2)): collect only what is needed (the email, the product/size, and the name if you take consent yourself); keep it only as long as needed. Practical reading: delete the waiting-list entry once the alert is sent or the person unsubscribes or the product is discontinued, but keep the consent record for the 3-year ETK period.
- Verify guest email ownership (the Art. 7(3) confirmation does it); otherwise anyone can enter another person's address, which would put a third party's data in your system.
- Security (Art. 12) and rights requests (Art. 11, answered within 30 days under Art. 13(2)). Administrative fines under Art. 18 include 5,000 to 100,000 TL base amounts for failing the notice duty; these base amounts are revalued each year, so check the current figure.
- Accounts: same consent rule. Do not infer it from the account's existence or the general marketing opt-in unless the wording covers stock alerts.

## Open items for a lawyer

1. Confirm that no Ministry or İYS publication treats user-requested stock alerts as non-commercial. I found none, and the İYS FAQ and ministry İYS pages could not be read for this (the FAQ page did not render; the ministry page had no exemptions text).
2. Confirm the Regulation text is current: I read the mevzuat.gov.tr PDF, which shows amendments up to RG 4/1/2020 (30998). Later amendments, if any, were not checked.
3. Whether a very small seller (esnaf, below any thresholds) must still register with İYS and use it for email consent. The Regulation's Art. 5(2) says all natural and legal persons sending ETK register.
4. Whether VERBİS registration applies to this shop (exemption thresholds not verified).
5. Cross-border transfer if the email provider is abroad (KVKK Art. 9, as amended by Law 7499) and the processor agreement.
6. Final Turkish consent and notice wording, and the retention period for the guest waiting-list rows.
7. The three KVKK Board decisions above (2018/90, 2025/1072, 2026/347) read in full.

## Sources

Read in full or in the relevant parts:

- Law 6563, Elektronik Ticaretin Düzenlenmesi Hakkında Kanun, with the 2026 fine table: https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6563.pdf
- Regulation on Commercial Communication and Commercial Electronic Messages (mevzuat.gov.tr PDF, consolidated to the 4/1/2020 amendment): https://www.mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=20914&mevzuatTur=KurumVeKurulusYonetmeligi&mevzuatTertip=5
- Law 6698, Kişisel Verilerin Korunması Kanunu: https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf
- Ticaret Bakanlığı, Ticari Elektronik İletiler, general information: https://ticaret.gov.tr/ic-ticaret/ticari-elektronik-iletiler/genel-bilgiler
- Ticaret Bakanlığı, İYS page (legal basis and operator only): https://ticaret.gov.tr/ic-ticaret/ticari-elektronik-iletiler/ileti-yonetim-sistemi-iys

Seen only as search-result summaries (not opened):

- KVKK Board principle decision 2026/347 announcement: https://www.kvkk.gov.tr/Icerik/8710/
- KVKK Board principle decision 2025/1072: https://www.kvkk.gov.tr/Icerik/8338/2025-1072
- KVKK Board decisions 2018/90, 2019/162, 2022/31: https://www.kvkk.gov.tr/Icerik/5420/2018-90, https://www.kvkk.gov.tr/Icerik/5495/2019-162, https://www.kvkk.gov.tr/Icerik/7292/2022-31
