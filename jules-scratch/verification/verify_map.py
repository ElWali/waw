import asyncio
from playwright.sync_api import sync_playwright, expect
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Get the absolute path to the HTML file
        html_file_path = os.path.abspath('jules-scratch/verification/index.html')

        # Navigate to the local HTML file
        page.goto(f'file://{html_file_path}')

        # 1. Verify the map container is visible
        map_container = page.locator("#map")
        expect(map_container).to_be_visible()

        # 2. Verify the marker icon is loaded and visible
        # This is a key indicator that the JS library is working.
        marker_icon = page.locator("img.atlas-marker-icon")
        expect(marker_icon).to_be_visible(timeout=10000) # Increased timeout

        # 3. Verify the popup is open and contains the correct text
        popup = page.locator(".atlas-popup-content")
        expect(popup).to_be_visible()
        expect(popup).to_contain_text("A pretty CSS3 popup.")

        # 4. (Optional) Wait for at least one tile to load, but don't fail the test
        # This makes the screenshot look better but acknowledges potential network issues.
        try:
            tile = page.locator("img.atlas-tile-loaded")
            expect(tile.first).to_be_visible(timeout=15000) # Generous timeout
        except Exception as e:
            print(f"Warning: Tiles did not load within the timeout, but proceeding as core functionality is verified. Error: {e}")

        # 5. Take a screenshot for final visual confirmation
        page.screenshot(path="jules-scratch/verification/verification.png")

        print("Verification script completed successfully. Screenshot captured.")
        browser.close()

if __name__ == "__main__":
    run()