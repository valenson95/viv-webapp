// Shared screenshot helper — lazy html2canvas, copy-to-clipboard or download PNG.
// Used by the calendar camera (Calendar.jsx) and the equity-curve camera (App.jsx).
// Returns "copied" | "downloaded" so callers can flash a status, or null on failure.
export async function captureElement(el, mode, filename = "VIV") {
  if (!el) return null;
  const hidden = el.querySelectorAll(".viv-hide-screenshot"); // e.g. the camera control itself
  hidden.forEach(e => { e.dataset.prevDisplay = e.style.display; e.style.display = "none"; });
  try {
    const { default: html2canvas } = await import("html2canvas"); // lazy — keeps html2canvas out of the initial bundle
    const canvas = await html2canvas(el, { backgroundColor: "#08080e", scale: 2, useCORS: true, logging: false });
    const fname = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
    if (mode === "copy" && navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (blob) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          return "copied";
        } catch { /* clipboard blocked — fall through to download */ }
      }
    }
    const link = document.createElement("a");
    link.download = fname;
    link.href = canvas.toDataURL("image/png");
    link.click();
    return "downloaded";
  } catch (e) {
    console.error("captureElement failed:", e);
    return null;
  } finally {
    hidden.forEach(e => { e.style.display = e.dataset.prevDisplay || ""; delete e.dataset.prevDisplay; });
  }
}
