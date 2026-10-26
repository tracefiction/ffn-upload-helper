document.addEventListener('ffnuh:save-editors', () => {
  try {
    if (window.tinymce) window.tinymce.triggerSave();
  } catch (err) {}
});
