import { chromium } from 'playwright';

const CHALLENGE_URL = 'https://serene-frangipane-7fd25b.netlify.app/';
const SESSION_KEY = 'wo_session';
const XOR_KEY = 'WO_2024_CHALLENGE';
const TOTAL_STEPS = 30;

const decodeSessionPayload = (payload) => {
  const decoded = Buffer.from(payload, 'base64');
  const chars = [];
  for (let i = 0; i < decoded.length; i += 1) {
    chars.push(String.fromCharCode(decoded[i] ^ XOR_KEY.charCodeAt(i % XOR_KEY.length)));
  }
  return JSON.parse(chars.join(''));
};

const getStepNumber = async (page) => {
  const header = page.locator('text=/Step \\d+ of 30/').first();
  if (!(await header.count())) return null;
  const text = await header.innerText();
  const match = text.match(/Step (\d+) of 30/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const getSubmitButton = (page) => page.getByRole('button', { name: /submit/i }).first();

const run = async () => {
  const headless = process.env.HEADLESS ? process.env.HEADLESS !== 'false' : true;
  const executablePath = process.env.CHROME_PATH || undefined;
  const browser = await chromium.launch({ headless, executablePath });
  const page = await browser.newPage();

  await page.goto(CHALLENGE_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'START' }).click();
  await page.waitForTimeout(500);

  const sessionPayload = await page.evaluate((key) => sessionStorage.getItem(key), SESSION_KEY);
  if (!sessionPayload) {
    throw new Error('Session payload not found.');
  }

  const { codes } = decodeSessionPayload(sessionPayload);
  if (!Array.isArray(codes) || codes.length < TOTAL_STEPS) {
    throw new Error('Codes array missing or incomplete.');
  }

  let step = await getStepNumber(page);
  while (step && step < TOTAL_STEPS) {
    const nextCode = codes[step];
    if (!nextCode) {
      throw new Error(`Missing code for step ${step + 1}.`);
    }

    const input = page.locator('input[type="text"]').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill(nextCode);
    await getSubmitButton(page).click();
    await page.waitForFunction(
      (previousStep) => {
        const text = document.body.innerText;
        const match = text.match(/Step (\d+) of 30/);
        if (!match) return false;
        return Number(match[1]) !== previousStep;
      },
      step,
      { timeout: 10000 }
    );

    step = await getStepNumber(page);
  }

  const finalStep = await getStepNumber(page);
  if (finalStep === TOTAL_STEPS) {
    console.log('Reached step 30. Challenge solved.');
  } else {
    console.log('Challenge flow ended early.');
  }

  await browser.close();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
