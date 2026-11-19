import { expect, test } from "@playwright/test";
import { useStaffLogin } from "../support/auth";

// The Colour dialog's colour code field has a native colour picker beside the text input.
const run = Date.now().toString(36);
const name = `Renk Seçici ${run}`;

test.describe("Staff with manage_colours", () => {
  useStaffLogin(["manage_colours"]);

  test("picking and typing write the same #RRGGBB, and an invalid code is not saved", async ({
    page,
  }) => {
    await page.goto("/admin/colours");
    await page.getByRole("button", { name: "Yeni renk" }).click();
    const dialog = page.getByRole("dialog");
    const picker = dialog.getByLabel("Renk seç");
    const code = dialog.getByLabel("Renk kodu");

    // Picking fills the text field.
    await picker.fill("#336699");
    await expect(code).toHaveValue("#336699");

    // Typing a valid code moves the picker; an invalid one leaves it on the last valid colour.
    await code.fill("#AA5500");
    await expect(picker).toHaveValue("#aa5500");
    await code.fill("#AA55");
    await expect(picker).toHaveValue("#aa5500");

    // The invalid code cannot be saved.
    await dialog.getByLabel("Ad").fill(name);
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog.getByText("Renk kodu #RRGGBB biçiminde olmalı.")).toBeVisible();

    // Picking again repairs it and saves.
    await picker.fill("#6b2d5c");
    await expect(code).toHaveValue("#6b2d5c");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Kaydedildi.")).toBeVisible();

    const row = page.locator("tr", { hasText: name });
    await expect(row.locator("span[style*='background']")).toHaveAttribute(
      "style",
      /rgb\(107, 45, 92\)|#6B2D5C/i,
    );

    // Editing opens with the picker on the saved colour.
    await row.getByRole("button", { name: "Düzenle" }).click();
    await expect(page.getByRole("dialog").getByLabel("Renk seç")).toHaveValue("#6b2d5c");
  });
});
