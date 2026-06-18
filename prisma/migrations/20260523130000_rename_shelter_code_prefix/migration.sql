-- Barınak kod ön ekini BAR- -> KAP- olarak değiştir.
-- Yeni kodlar generateShelterCode() ile KAP- ile üretiliyor; mevcut kayıtlar
-- da tutarlı olsun diye burada toplu güncelleme yapılır.

UPDATE "Shelter"
SET "code" = 'KAP-' || SUBSTRING("code" FROM 5)
WHERE "code" LIKE 'BAR-%';
