(async function () {
  'use strict';
  const { settings, diagnostics } = globalThis.FFNUH;
  const form = document.body;
  const current = await settings.load();

  for (const input of form.querySelectorAll('input[name="separatorStyle"]')) {
    input.checked = input.value === current.separatorStyle;
  }
  form.querySelector('input[name="convertFiles"]').checked = current.convertFiles;
  form.querySelector('input[name="maxTries"]').value = current.maxTries;

  form.addEventListener('change', async () => {
    const tries = Math.round(Number(form.querySelector('input[name="maxTries"]').value));
    await settings.save({
      separatorStyle: form.querySelector('input[name="separatorStyle"]:checked').value,
      convertFiles: form.querySelector('input[name="convertFiles"]').checked,
      maxTries: Math.min(120, Math.max(5, Number.isFinite(tries) ? tries : settings.DEFAULTS.maxTries)),
    });
    document.getElementById('saved').textContent = 'Saved.';
  });

  const details = document.getElementById('reportDetails');
  const reportText = document.getElementById('reportText');
  const runs = await diagnostics.loadRuns();
  document.getElementById('runCount').textContent = 'Show report (' +
    (runs.length === 1 ? '1 upload' : runs.length + ' uploads') + ' recorded)';

  details.addEventListener('toggle', async () => {
    if (details.open) reportText.value = await diagnostics.currentReport();
  });

  document.getElementById('copyReport').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(await diagnostics.currentReport());
      document.getElementById('copied').textContent = 'Copied.';
    } catch (err) {
      details.open = true;
    }
  });
})();
