import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';
const ARTIFACT_DIR = '/Users/rjulia/.gemini/antigravity-ide/brain/924b240f-20ec-4219-af51-bdba70fcb525';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'walkthrough_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log('🚀 Starting Full LMS Walkthrough (Manager, Teacher, Student)...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const report = {
    manager: {},
    teacher: {},
    student: {},
    errors: [],
    screenshots: []
  };

  const saveScreenshot = async (name) => {
    const filename = `${name}.png`;
    const filePath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filePath, fullPage: false });
    report.screenshots.push({ name, path: filePath });
    console.log(`📸 Screenshot captured: ${filename}`);
  };

  try {
    // ==========================================
    // 1. MANAGER / ADMIN WALKTHROUGH
    // ==========================================
    console.log('\n--- [1/3] MANAGER WALKTHROUGH ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').fill('manager.academic@demo.churchcore.local');
    await page.locator('input[type="password"]').fill('DemoPass123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
    console.log('✅ Manager successfully logged in. Current URL:', page.url());

    await page.waitForTimeout(2000);
    await saveScreenshot('01_manager_dashboard');
    report.manager.dashboardUrl = page.url();
    report.manager.title = await page.title();

    // Check Blueprints
    console.log('Navigating to Blueprints...');
    await page.goto(`${BASE_URL}/admin/blueprints`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await saveScreenshot('02_manager_blueprints');
    const blueprintCards = await page.locator('h3, .font-semibold, tr').allTextContents();
    report.manager.blueprintsCount = blueprintCards.length;
    console.log('✅ Blueprints loaded.');

    // Check Sections
    console.log('Navigating to Sections...');
    await page.goto(`${BASE_URL}/admin/sections`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await saveScreenshot('03_manager_sections');
    report.manager.sectionsUrl = page.url();
    console.log('✅ Sections loaded.');

    // Check Learning Paths
    console.log('Navigating to Learning Paths...');
    await page.goto(`${BASE_URL}/admin/paths`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await saveScreenshot('04_manager_learning_paths');
    report.manager.pathsUrl = page.url();
    console.log('✅ Learning Paths loaded.');

    // Sign out
    console.log('Signing out Manager...');
    await page.goto(`${BASE_URL}/api/auth/signout`).catch(() => {});
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    console.log('✅ Manager signed out.');

    // ==========================================
    // 2. TEACHER WALKTHROUGH
    // ==========================================
    console.log('\n--- [2/3] TEACHER WALKTHROUGH ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').fill('teacher.bible@demo.churchcore.local');
    await page.locator('input[type="password"]').fill('DemoPass123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
    console.log('✅ Teacher successfully logged in. Current URL:', page.url());

    await page.waitForTimeout(2000);
    await saveScreenshot('05_teacher_dashboard');
    report.teacher.dashboardUrl = page.url();

    // Navigate to courses
    await page.goto(`${BASE_URL}/courses`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await saveScreenshot('06_teacher_courses');

    // Pick Old Testament Survey or first course
    const courseId = '8e11b10a-8573-4193-b739-44fae4d2f234';
    console.log(`Navigating to Course Builder: /courses/${courseId}/build`);
    await page.goto(`${BASE_URL}/courses/${courseId}/build`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await saveScreenshot('07_teacher_course_builder');

    // Check AI Generator Modal
    const aiBtn = page.locator('button:has-text("AI Outline"), button:has-text("AI Generator"), button:has-text("Generate")').first();
    if (await aiBtn.isVisible().catch(() => false)) {
      console.log('Opening AI Outline Generator Modal...');
      await aiBtn.click();
      await page.waitForTimeout(1000);
      await saveScreenshot('08_teacher_ai_generator_modal');
      const modalText = await page.locator('[role="dialog"], .modal, div:has-text("Append")').allTextContents().catch(() => []);
      report.teacher.aiModalFound = true;
      // Close modal
      const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("Close"), button[aria-label="Close"]').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
      }
    } else {
      console.log('AI button not found on this view, checking builder components.');
    }

    // Check Attendance Manager
    console.log(`Navigating to Course Attendance: /courses/${courseId}/attendance`);
    await page.goto(`${BASE_URL}/courses/${courseId}/attendance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await saveScreenshot('09_teacher_attendance');
    report.teacher.attendanceUrl = page.url();
    console.log('✅ Attendance manager loaded.');

    // Sign out
    console.log('Signing out Teacher...');
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    console.log('✅ Teacher signed out.');

    // ==========================================
    // 3. STUDENT WALKTHROUGH
    // ==========================================
    console.log('\n--- [3/3] STUDENT WALKTHROUGH ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').fill('student.bible01@demo.churchcore.local');
    await page.locator('input[type="password"]').fill('DemoPass123!');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
    console.log('✅ Student successfully logged in. Current URL:', page.url());

    await page.waitForTimeout(2000);
    await saveScreenshot('10_student_dashboard');
    report.student.dashboardUrl = page.url();

    // Check Course Overview with Meeting Card
    console.log(`Navigating to Student Course Overview: /courses/${courseId}`);
    await page.goto(`${BASE_URL}/courses/${courseId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await saveScreenshot('11_student_course_overview');

    // Check Lesson Player
    console.log(`Navigating to Lesson Player: /courses/${courseId}/learn`);
    await page.goto(`${BASE_URL}/courses/${courseId}/learn`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await saveScreenshot('12_student_lesson_player');
    report.student.learnUrl = page.url();

    // Sign out
    console.log('Signing out Student...');
    await context.clearCookies();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    console.log('✅ Student signed out.');

    console.log('\n🎉 ALL THREE ROLES COMPLETED SUCCESSFULLY!');
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'walkthrough_report.json'), JSON.stringify(report, null, 2));

  } catch (err) {
    console.error('❌ Walkthrough Error:', err);
    await saveScreenshot('99_error_state').catch(() => {});
    report.errors.push(err.message);
  } finally {
    await browser.close();
  }
}

run();
