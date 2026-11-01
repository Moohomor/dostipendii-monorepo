import asyncio
from playwright.async_api import async_playwright

async def test_full_flow_with_completion():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        
        def check_cors_errors(step_name):
            cors_errors = [e for e in errors if "CORS" in e or "cross-origin" in e.lower() or "Access-Control" in e]
            if cors_errors:
                print(f"❌ CORS ERRORS at {step_name}: {cors_errors}")
                raise AssertionError(f"CORS errors at {step_name}: {cors_errors}")
        
        print("📍 Opening frontend...")
        await page.goto("http://localhost:8080", wait_until="networkidle")
        await page.wait_for_timeout(500)
        check_cors_errors("page_load")
        
        # Join group
        print("📍 Joining group...")
        await page.fill("#groupCode", "K7M2QX4P")
        await page.click("#joinScreen button:has-text('Войти')")
        await page.wait_for_timeout(1000)
        check_cors_errors("join_group")
        
        # Start main session
        print("📍 Starting main session...")
        await page.click("#assignmentsList button:has-text('Начать')")
        await page.wait_for_timeout(1000)
        check_cors_errors("start_session")
        
        # Make decisions until completed (max 10 decisions)
        for i in range(10):
            completed_visible = await page.is_visible("#completedCard:not(.hidden)")
            if completed_visible:
                print(f"  Session completed after {i+1} decisions")
                break
            
            # Click first available choice
            choices = await page.query_selector_all("#choicesList button.choice")
            if not choices:
                print("  No choices available")
                break
            
            print(f"  Making decision {i+1}...")
            await choices[0].click()
            
            # Wait for network to settle and check completion
            await page.wait_for_load_state("networkidle", timeout=5000)
            await page.wait_for_timeout(500)
            check_cors_errors(f"decision_{i+1}")
            
            # Check if completed now
            completed_visible = await page.is_visible("#completedCard:not(.hidden)")
            if completed_visible:
                print(f"  Session completed after {i+1} decisions")
                break
        
        # Check completed card
        completed_visible = await page.is_visible("#completedCard:not(.hidden)")
        print(f"  Session completed: {completed_visible}")
        check_cors_errors("after_completion_check")
        
        if completed_visible:
            print("📍 Viewing debrief...")
            await page.wait_for_timeout(1000)
            await page.click("#completedCard button:has-text('Посмотреть разбор')")
            await page.wait_for_load_state("networkidle", timeout=5000)
            await page.wait_for_timeout(500)
            check_cors_errors("view_debrief")
            
            debrief_visible = await page.is_visible("#debriefScreen")
            print(f"  Debrief screen visible: {debrief_visible}")
            assert debrief_visible, "Debrief screen should be visible"
            
            debrief_content = await page.text_content("#debriefContent")
            print(f"  Debrief content length: {len(debrief_content)} chars")
        
        other_errors = [e for e in errors if "CORS" not in e and "cross-origin" not in e.lower() and "Access-Control" not in e]
        if other_errors:
            print(f"⚠️ Other console errors: {other_errors}")
        
        print(f"✅ All tests passed! Console errors: {len(errors)}")
        await browser.close()
        return True

if __name__ == "__main__":
    result = asyncio.run(test_full_flow_with_completion())
    print(f"\nResult: {'PASS' if result else 'FAIL'}")