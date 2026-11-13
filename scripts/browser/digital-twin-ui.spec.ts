import { test, expect } from '@playwright/test';

test('twin anatomy remains visible when mounted in light mode and after theme switches', async ({ page }) => {
  await page.goto(process.env.COCKPIT_URL ?? 'http://localhost:28080');
  await page.getByLabel('Username', { exact: true }).fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('avia-demo-operator');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  if (await page.locator('html').getAttribute('data-theme') !== 'light')
    await page.locator('#theme-toggle-btn').click();
  await page.locator('#side-nav-twin').click();
  const canvas = page.locator('canvas').last();
  await expect(canvas).toBeVisible();

  async function visibleBodyFraction() {
    return canvas.evaluate(async (source: HTMLCanvasElement) => {
      // Sample after the renderer's animation callback, before compositing clears
      // its drawing buffer. Ignore the pedestal and measure the anatomy itself.
      await new Promise(requestAnimationFrame);
      const copy = document.createElement('canvas');
      copy.width = source.width;
      copy.height = source.height;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(source, 0, 0);
      const { data } = ctx.getImageData(
        copy.width * .25, copy.height * .2,
        Math.floor(copy.width * .5), Math.floor(copy.height * .6),
      );
      let visible = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        const onWhite = (data[i] + data[i + 1] + data[i + 2]) / 3 * alpha + 255 * (1 - alpha);
        if (onWhite < 200) visible++;
      }
      return visible / (data.length / 4);
    });
  }
  for (const pass of ['initial', 'switched']) {
    for (const layer of ['dermal', 'skeletal', 'cardio']) {
      await page.locator(`#twin-layer-${layer}`).click();
      await expect.poll(visibleBodyFraction).toBeGreaterThan(.025);
      await page.screenshot({ path: `state/screenshots/twin-light-${pass}-${layer}.png` });
    }
    if (pass === 'initial') {
      await page.locator('#theme-toggle-btn').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.screenshot({ path: 'state/screenshots/twin-dark.png' });
      await page.locator('#theme-toggle-btn').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    }
  }
});
