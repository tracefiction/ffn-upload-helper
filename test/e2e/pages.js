const TOKEN = 'a1b2c3d4' + 'ab'.repeat(32);

function shell(body) {
  return `<!DOCTYPE html><html><head><title>FanFiction</title>
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script></head>
<body>${body}<div class=footer>ray id: php-master</div></body></html>`;
}

function docsPage(docs, notice) {
  const rows = docs.map((d, i) => `<tr><td>${i + 1}</td><td>${d.label}</td><td>Story</td><td>${d.words}</td>` +
    `<td><a href='/docs/edit.php?docid=${d.id}'>Edit</a></td><td>365</td><td>x</td></tr>`).join('');
  return shell(`${notice ? `<div class='alert'>${notice}</div>` : ''}
<table class='table' id=gui_table1><tr><th>#</th><th>Label</th><th>Format</th><th>Words</th><th>Edit/View</th><th>Life</th><th>Remove</th></tr>${rows}</table>
<form method=post enctype='multipart/form-data' id=upload name=upload novalidate>
<div class='table-bordered'><div class=tcat><b>Create New Document</b></div>
<table class='table table-striped' id=gui_table2>
<tr><td>Label:</td><td><input type=text name=title maxlength=125 required value=''></td></tr>
<tr><td>Method:</td><td><span id=method_file_span><input type=radio name=method value=file checked onclick='activate_file();'> File Upload</span>
<input type=radio name=method id=input_method_web value=web onclick='activate_tinymce();'> Copy-N-Paste
<div id=method_file><input type=file name=doc id=doc_file required></div>
<div id=method_web style='display:none;'><textarea name=webcontent id=webcontent class=tinymce rows=10></textarea>
<script src="https://cdn.jsdelivr.net/npm/tinymce@4.9.11/tinymce.min.js"></script>
<script>
var xtmce_ready = false;
function activate_file() { $("#method_file").show(); $("#method_web").hide(); }
function activate_tinymce() { $("#method_file").hide(); $("#method_web").show();
  if (!xtmce_ready) { tinymce.init({ mode: "textareas", menubar: false, height: 200, forced_root_block: "p", entity_encoding: "raw" }); }
  xtmce_ready = true; }
</script></div></td></tr>
<tr><td>Format:</td><td><input type=radio name=format value=0 checked> Story <input type=radio name=format value=1> DocX</td></tr>
<tr><td></td><td><button type=submit class=btn>Submit Document</button> <input type=hidden name=action value=upload></td></tr>
</table></div>
<input type=hidden name='cty' value='${TOKEN}'>
</form>
<script>$('#upload').on('submit', function () { window.__nativeSubmit = (window.__nativeSubmit || 0) + 1; });</script>`);
}

function editPage(doc, saved) {
  return shell(`${saved ? '<div class=alert>Document Saved</div>' : ''}
<form method="post" name="docform"><b>Edit Document: ${doc.label}</b>
<textarea name="bio" id="bio" class="tinymce">${doc.html.replace(/</g, '&lt;')}</textarea>
<input type="hidden" name="selectdocid" value="${doc.id}"><input type="hidden" name="action" value="save">
<input type="hidden" name="docid" value="${doc.id}"><button type="submit" class="btn">Save</button></form>
<script src="https://cdn.jsdelivr.net/npm/tinymce@4.9.11/tinymce.min.js"></script>
<script>tinymce.init({ mode: "textareas", menubar: false, height: 200, forced_root_block: "p", entity_encoding: "raw" });</script>`);
}

module.exports = { TOKEN, docsPage, editPage };
