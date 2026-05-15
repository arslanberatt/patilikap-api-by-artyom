import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@better-auth/utils/password.node";

const prisma = new PrismaClient();

async function main() {
  console.log("Seed başlatılıyor...");

  const testPassword = "Test1234!";
  const passwordHash = await hashPassword(testPassword);

  // Test donor kullanıcısı
  const donorUser = await prisma.user.upsert({
    where: { email: "testkullanici@patilikap.com" },
    update: {},
    create: {
      email: "testkullanici@patilikap.com",
      name: "Test Kullanıcı",
      role: "DONOR",
      emailVerified: true,
      onboardingCompleted: true,
      accounts: {
        create: {
          accountId: "testkullanici@patilikap.com",
          providerId: "credential",
          password: passwordHash,
        },
      },
    },
  });
  console.log("✓ Donor kullanıcısı:", donorUser.email);

  // Test barınak kullanıcısı
  const shelterUser = await prisma.user.upsert({
    where: { email: "testbarinak@patilikap.com" },
    update: {},
    create: {
      email: "testbarinak@patilikap.com",
      name: "Test Barınak Yöneticisi",
      role: "SHELTER",
      emailVerified: true,
      onboardingCompleted: true,
      accounts: {
        create: {
          accountId: "testbarinak@patilikap.com",
          providerId: "credential",
          password: passwordHash,
        },
      },
    },
  });
  console.log("✓ Shelter kullanıcısı:", shelterUser.email);

  // Test barınağı (APPROVED durumunda)
  const existingShelter = await prisma.shelter.findFirst({
    where: { userId: shelterUser.id },
  });

  if (!existingShelter) {
    const shelter = await prisma.shelter.create({
      data: {
        userId: shelterUser.id,
        name: "Test Barınağı",
        city: "İstanbul",
        district: "Kadıköy",
        address: "Test Sokak No:1 Kadıköy/İstanbul",
        phone: "05321234567",
        description: "Bu bir test barınağıdır. Patilikap geliştirme ortamında kullanılmaktadır.",
        authorizedPerson: "Test Kullanıcı",
        status: "APPROVED",
      },
    });
    console.log("✓ Barınak oluşturuldu:", shelter.name);
  } else {
    console.log("✓ Barınak zaten mevcut:", existingShelter.name);
  }

  console.log("\nSeed tamamlandı!");
  console.log("─────────────────────────────────────");
  console.log("Donor:   testkullanici@patilikap.com  /  Test1234!");
  console.log("Barınak: testbarinak@patilikap.com    /  Test1234!");
  console.log("─────────────────────────────────────");
}

main()
  .catch(e => {
    console.error("Seed hatası:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
