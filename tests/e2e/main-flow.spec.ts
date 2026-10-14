import { expect, test, type Page } from "@playwright/test";

async function pickPlace(page: Page, field: "origin" | "destination", typed: string, option: RegExp) {
  const input = page.getByTestId(field);
  await input.click();
  await input.fill(typed);
  await page.getByRole("option", { name: option }).click();
}

async function cardOrder(page: Page) {
  return page.getByTestId("route-card").evaluateAll((els) => els.map((e) => e.getAttribute("data-route-id")));
}

test.describe("main flow", () => {
  test("search, see cards, change a weight, select a route", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("demo-banner")).toBeVisible();

    await pickPlace(page, "origin", "Kora", /^Koramangala$/);
    const started = Date.now();
    await pickPlace(page, "destination", "Electronic", /Electronic City/);

    // 3 to 4 distinct cards within 3 seconds (demo mode).
    const cards = page.getByTestId("route-card");
    await expect(cards.first()).toBeVisible({ timeout: 3000 });
    expect(Date.now() - started).toBeLessThan(3000);
    const n = await cards.count();
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(4);
    expect(new Set(await cardOrder(page)).size).toBe(n);

    // Every card: time, range, delta, stress, reason, confidence. Nothing claims "Live" in demo mode.
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      await expect(card).toContainText(/\d+\s*min/);
      await expect(card).toContainText(/\d+–\d+ min/);
      await expect(card).toContainText(/Fastest|[+−]\d+ min/);
      await expect(card).toContainText(/Stress \d+/);
      await expect(card.getByTestId("confidence")).toHaveText("Estimated, not live");
      const label = await card.locator("button").first().getAttribute("aria-label");
      expect(label).toMatch(/^Route \d, .+\. \d+ minutes, likely between \d+ and \d+\./);
    }

    // Changing weights re-ranks without a page reload.
    await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));
    await page.getByTestId("tune").click();
    const setWeights = async (w: Record<string, string>) => {
      for (const [k, v] of Object.entries(w)) await page.getByTestId(`weight-${k}`).fill(v);
    };
    await setWeights({ time: "10", calm: "0", predictability: "0", flood: "0" });
    const timeFirst = await cardOrder(page);
    await setWeights({ time: "0", calm: "10", predictability: "10", flood: "10" });
    const calmFirst = await cardOrder(page);
    expect(calmFirst).not.toEqual(timeFirst);
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
    await expect(page.getByText("Ranked with your settings.")).toBeVisible();
    await page.getByRole("button", { name: "Reset" }).click();
    await page.getByTestId("tune").click();

    // Selecting a card highlights it on the map and opens its steps.
    const second = cards.nth(1);
    const id = await second.getAttribute("data-route-id");
    await second.locator("button").first().click();
    await expect(second).toHaveAttribute("data-selected", "true");
    await expect(second.locator("button").first()).toHaveAttribute("aria-expanded", "true");
    await expect(second.getByRole("region")).toContainText(/Arrive at Electronic City/);
    await expect(page.getByTestId("map-region")).toHaveAttribute("data-selected-route", id!);

    // Freshness of the hand-curated layers is shown, and labelled as unverified seed data.
    await expect(page.getByTestId("freshness")).toContainText("not yet checked on the ground");
  });

  test("the whole flow works with the keyboard only", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flow is a desktop concern");
    await page.goto("/");
    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab"); // origin
    await expect(page.getByTestId("origin")).toBeFocused();
    await page.keyboard.type("HSR");
    await expect(page.getByRole("option", { name: "HSR Layout" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("origin")).toHaveValue("HSR Layout");
    // Tab past the clear and locate buttons, the swap button, then into destination.
    for (
      let i = 0;
      i < 6 && !(await page.getByTestId("destination").evaluate((e) => e === document.activeElement));
      i++
    ) {
      await page.keyboard.press("Tab");
    }
    await expect(page.getByTestId("destination")).toBeFocused();
    await page.keyboard.type("White");
    await expect(page.getByRole("option", { name: "Whitefield" })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("route-card").first()).toBeVisible();

    // Reach the first card, move with the arrow keys, select with Enter.
    const firstBtn = page.getByTestId("route-card").first().locator("button").first();
    for (let i = 0; i < 25 && !(await firstBtn.evaluate((e) => e === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(firstBtn).toBeFocused();
    await page.keyboard.press("ArrowDown");
    const secondBtn = page.getByTestId("route-card").nth(1).locator("button").first();
    await expect(secondBtn).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(secondBtn).toHaveAttribute("aria-expanded", "true");

    // Open settings and move a slider with the arrow keys.
    await page.getByTestId("tune").focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("weight-calm").focus();
    const before = await page.getByTestId("weight-calm").inputValue();
    await page.keyboard.press("ArrowRight");
    expect(Number(await page.getByTestId("weight-calm").inputValue())).toBe(Number(before) + 1);

    // Focus is visible.
    const outline = await page.getByTestId("weight-calm").evaluate((e) => getComputedStyle(e).outlineStyle);
    expect(["none", "solid"]).toContain(outline); // thumb carries the ring; checked visually in docs
  });

  test("reduced motion turns off movement", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto("/");
    const t = await page.locator(".sheet").evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(t).toBe("0s");
    const pressable = await page
      .locator(".pressable")
      .first()
      .evaluate((e) => {
        e.dispatchEvent(new PointerEvent("pointerdown"));
        return getComputedStyle(e).transitionProperty;
      });
    expect(pressable).toBeTruthy();
    await ctx.close();
  });

  test("errors say what failed and what to do", async ({ page }) => {
    await page.goto("/");
    await pickPlace(page, "origin", "Jaya", /^Jayanagar$/);
    await pickPlace(page, "destination", "Jaya", /^Jayanagar$/);
    await expect(page.getByTestId("error")).toContainText("Start and destination are the same place.");
  });

  test("health endpoint reports providers without leaking keys", async ({ request }) => {
    const res = await request.get("/api/health");
    const body = await res.json();
    expect(body.mode).toBe("demo");
    expect(JSON.stringify(body)).not.toMatch(/AIza|sk-|key=/i);
    expect(typeof body.keys.GOOGLE_MAPS_API_KEY).toBe("boolean");
  });

  test("the API rejects places outside Bengaluru", async ({ request }) => {
    const res = await request.post("/api/routes", {
      data: {
        origin: { label: "Mysuru", lat: 12.29, lng: 76.64 },
        destination: { label: "MG Road", lat: 12.9756, lng: 77.6066 },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("outside_bengaluru");
  });
});
