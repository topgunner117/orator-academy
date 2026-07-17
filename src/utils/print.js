// Print helper that names the saved PDF automatically.
//
// When you "Save as PDF" from the browser's print dialog, the default filename comes from
// document.title. So we swap the title to a clean, descriptive name for the duration of the
// print and restore it afterwards — the same trick professional web apps use so the file lands
// as "Class Notes - Summer Intensive - Jul 17 2026.pdf" instead of the page title, no manual
// renaming needed.

// Drop characters that Windows/macOS forbid in filenames and normalize dashes/spaces.
const sanitizeFilename = (s) =>
  (s || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

export function printDocument(filename) {
  const name = sanitizeFilename(filename) || 'Document'
  const previousTitle = document.title
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    document.title = previousTitle
    window.removeEventListener('afterprint', restore)
  }

  document.title = name
  window.addEventListener('afterprint', restore)
  window.print()
  // Fallback for browsers that don't fire `afterprint` (restore is guarded so this is a no-op
  // once afterprint has already run).
  setTimeout(restore, 1000)
}
