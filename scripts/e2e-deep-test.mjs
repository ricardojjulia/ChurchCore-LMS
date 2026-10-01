import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = '/Users/rjulia/.gemini/antigravity-ide/brain/924b240f-20ec-4219-af51-bdba70fcb525';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'walkthrough_screenshots');

async function testInteractiveFeatures() {
  console.log('🎯 Running deep interactive feature walkthrough...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();
  const courseId = '8e11b10a-8573-4193-b739-44fae4d2f234';

  const saveScreenshot = async (name) => {
    const filename = `${name}.png`;
    const filePath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: false });
    console.log(`📸 Screenshot captured: ${filename}`);
  };

  try {
    // 1. TEACHER: AI Outline Modal & Attendance Roll Call
    console.log('\n--- TEACHER DEEP TEST ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').fill('teacher.bible@demo.churchcore.local');
    await page.locator('input[type="password"]').fill('DemoPass123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });

    // Open Course Builder
    await page.goto(`${BASE_URL}/courses/${courseId}/build`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Click AI Outline button
    const aiBtn = page.locator('button[title="Generate outline with AI"], button:has-text("✨ AI")').first();
    if (await aiBtn.isVisible()) {
      console.log('Clicking AI Outline Generator button...');
      await aiBtn.click();
      await page.waitForTimeout(1000);
      await saveScreenshot('08_teacher_ai_generator_modal');
      console.log('✅ AI Generator modal captured.');

      // Click Close
      const closeBtn = page.locator('button:has-text("Cancel"), button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Open Attendance Manager
    console.log('Navigating to Attendance Manager...');
    await page.goto(`${BASE_URL}/courses/${courseId}/attendance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Click + Quick Attendance Session
    const quickSessionBtn = page.locator('button:has-text("Quick Attendance Session")').first();
    if (await quickSessionBtn.isVisible()) {
      console.log('Opening Quick Attendance Session modal...');
      await quickSessionBtn.click();
      await page.waitForTimeout(1000);
      await saveScreenshot('09a_quick_session_modal');

      // Fill in session title & submit
      const titleInput = page.locator('input[name="title"], input[placeholder*="Session"], input[type="text"]').first();
      if (await titleInput.isVisible()) {
        await titleInput.fill('Week 1 - Hermeneutics & Exegesis Lecture');
        const createBtn = page.locator('button:has-text("Create"), button:has-text("Save"), button[type="submit"]').first();
        if (await createBtn.isVisible()) {
          await createBtn.click();
          await page.waitForTimeout(2000);
          console.log('✅ Created attendance session.');
          await saveScreenshot('09b_teacher_attendance_active_session');
        }
      }
    }

    // Sign out Teacher
    await context.clearCookies();

    // 2. MANAGER: Blueprint linked courses & Sections detail
    console.log('\n--- MANAGER DEEP TEST ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').fill('manager.academic@demo.churchcore.local');
    await page.locator('input[type="password"]').fill('DemoPass123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });

    // Open Blueprints
    await page.goto(`${BASE_URL}/admin/blueprints`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const firstBlueprintEdit = page.locator('a:has-text("Edit"), button:has-text("Edit")').first();
    if (await firstBlueprintEdit.isVisible()) {
      console.log('Opening Blueprint edit view...');
      await firstBlueprintEdit.click();
      await page.waitForTimeout(1500);
      await saveScreenshot('02a_manager_blueprint_detail');
    }

    // Open Sections
    await page.goto(`${BASE_URL}/admin/sections`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await saveScreenshot('03a_manager_sections_table');

    // Sign out Manager
    await context.clearCookies();

    console.log('\n✨ Deep interactive test finished successfully!');

  } catch (err) {
    console.error('❌ Interactive Test Error:', err);
  } finally {
    await browser.close();
  }
}

testInteractiveFeatures();
