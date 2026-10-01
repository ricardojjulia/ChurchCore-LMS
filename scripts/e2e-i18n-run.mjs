import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'http://localhost:3000'
const ARTIFACT_DIR = '/Users/rjulia/.gemini/antigravity-ide/brain/924b240f-20ec-4219-af51-bdba70fcb525'
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'i18n_screenshots')

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

const LOCALES = ['en', 'es', 'pt']

async function run() {
  console.log('🌐 Starting Comprehensive i18n Walkthrough (EN, ES, PT)...')
  const browser = await chromium.launch({ headless: true })

  const report = {
    en: {},
    es: {},
    pt: {},
    errors: [],
  }

  try {
    for (const locale of LOCALES) {
      console.log(`\n========================================`)
      console.log(`🌍 TESTING LOCALE: ${locale.toUpperCase()}`)
      console.log(`========================================`)

      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      })

      // Set locale cookie
      await context.addCookies([
        { name: 'NEXT_LOCALE', value: locale, domain: 'localhost', path: '/' },
      ])

      const page = await context.newPage()

      // 1. MANAGER
      console.log(`\n--- [${locale.toUpperCase()}] 1. MANAGER WALKTHROUGH ---`)
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill('manager.academic@demo.churchcore.local')
      await page.locator('input[type="password"]').fill('DemoPass123!')
      await page.locator('button[type="submit"]').click()
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
      await page.waitForTimeout(1500)

      const mgrDash = path.join(SCREENSHOT_DIR, `${locale}_01_manager_dashboard.png`)
      await page.screenshot({ path: mgrDash, fullPage: false })
      console.log(`📸 [${locale}] Manager Dashboard: ${path.basename(mgrDash)}`)

      // Blueprints
      await page.goto(`${BASE_URL}/admin/blueprints`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)
      const mgrBlueprints = path.join(SCREENSHOT_DIR, `${locale}_02_manager_blueprints.png`)
      await page.screenshot({ path: mgrBlueprints, fullPage: false })
      console.log(`📸 [${locale}] Manager Blueprints: ${path.basename(mgrBlueprints)}`)

      // Sections
      await page.goto(`${BASE_URL}/admin/sections`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)
      const mgrSections = path.join(SCREENSHOT_DIR, `${locale}_03_manager_sections.png`)
      await page.screenshot({ path: mgrSections, fullPage: false })
      console.log(`📸 [${locale}] Manager Sections: ${path.basename(mgrSections)}`)

      // Sign out
      await context.clearCookies()
      await context.addCookies([
        { name: 'NEXT_LOCALE', value: locale, domain: 'localhost', path: '/' },
      ])

      // 2. TEACHER
      console.log(`\n--- [${locale.toUpperCase()}] 2. TEACHER WALKTHROUGH ---`)
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill('teacher.bible@demo.churchcore.local')
      await page.locator('input[type="password"]').fill('DemoPass123!')
      await page.locator('button[type="submit"]').click()
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
      await page.waitForTimeout(1500)

      const tchDash = path.join(SCREENSHOT_DIR, `${locale}_04_teacher_dashboard.png`)
      await page.screenshot({ path: tchDash, fullPage: false })
      console.log(`📸 [${locale}] Teacher Dashboard: ${path.basename(tchDash)}`)

      // Courses
      await page.goto(`${BASE_URL}/courses`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)
      const tchCourses = path.join(SCREENSHOT_DIR, `${locale}_05_teacher_courses.png`)
      await page.screenshot({ path: tchCourses, fullPage: false })
      console.log(`📸 [${locale}] Teacher Courses: ${path.basename(tchCourses)}`)

      // Course Builder
      const courseId = '8e11b10a-8573-4193-b739-44fae4d2f234'
      await page.goto(`${BASE_URL}/courses/${courseId}/build`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)
      const tchBuilder = path.join(SCREENSHOT_DIR, `${locale}_06_teacher_course_builder.png`)
      await page.screenshot({ path: tchBuilder, fullPage: false })
      console.log(`📸 [${locale}] Course Builder: ${path.basename(tchBuilder)}`)

      // Sign out
      await context.clearCookies()
      await context.addCookies([
        { name: 'NEXT_LOCALE', value: locale, domain: 'localhost', path: '/' },
      ])

      // 3. STUDENT
      console.log(`\n--- [${locale.toUpperCase()}] 3. STUDENT WALKTHROUGH ---`)
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
      await page.locator('input[type="email"]').fill('student.bible01@demo.churchcore.local')
      await page.locator('input[type="password"]').fill('DemoPass123!')
      await page.locator('button[type="submit"]').click()
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 })
      await page.waitForTimeout(1500)

      const stuDash = path.join(SCREENSHOT_DIR, `${locale}_07_student_dashboard.png`)
      await page.screenshot({ path: stuDash, fullPage: false })
      console.log(`📸 [${locale}] Student Dashboard: ${path.basename(stuDash)}`)

      // Course Overview
      await page.goto(`${BASE_URL}/courses/${courseId}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)
      const stuOverview = path.join(SCREENSHOT_DIR, `${locale}_08_student_course_overview.png`)
      await page.screenshot({ path: stuOverview, fullPage: false })
      console.log(`📸 [${locale}] Student Course Overview: ${path.basename(stuOverview)}`)

      // Lesson Player
      await page.goto(`${BASE_URL}/courses/${courseId}/learn`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)
      const stuLearn = path.join(SCREENSHOT_DIR, `${locale}_09_student_lesson_player.png`)
      await page.screenshot({ path: stuLearn, fullPage: false })
      console.log(`📸 [${locale}] Student Lesson Player: ${path.basename(stuLearn)}`)

      await context.close()
    }

    console.log('\n🎉 ALL LOCALES (EN, ES, PT) TESTED & CAPTURED SUCCESSFULLY!')
  } catch (err) {
    console.error('❌ i18n Walkthrough Error:', err)
    report.errors.push(err.message)
  } finally {
    await browser.close()
  }
}

run()
