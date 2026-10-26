import sys
import zipfile
from io import BytesIO

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def run(text, rpr=""):
    rpr_xml = f"<w:rPr>{rpr}</w:rPr>" if rpr else ""
    return f'<w:r>{rpr_xml}<w:t xml:space="preserve">{text}</w:t></w:r>'


def para(runs, ppr=""):
    ppr_xml = f"<w:pPr>{ppr}</w:pPr>" if ppr else ""
    return f"<w:p>{ppr_xml}{''.join(runs)}</w:p>"


CENTER = '<w:jc w:val="center"/>'
NOSPACE = '<w:spacing w:before="0" w:after="0"/>'

paras = [
    para([run("[T1] Chapter Title Centered Bold", "<w:b/>")], CENTER),
    para([run("[T2] Heading1 style title")], '<w:pStyle w:val="Heading1"/>'),
    para([run("[T3] plain then "), run("italic", "<w:i/>"), run(" then plain.")]),
    para([run("[T4] explicit off val=0: "), run("should be plain", '<w:b w:val="0"/><w:i w:val="0"/>'), run(" end.")]),
    para([run("[T5] explicit off val=false: "), run("should be plain", '<w:b w:val="false"/><w:i w:val="false"/>'), run(" end.")]),
    para([run("[T6] explicit off val=off: "), run("should be plain", '<w:b w:val="off"/><w:i w:val="off"/>'), run(" end.")]),
    para([run("[T7] bCs/iCs only (complex script): "), run("should be plain", "<w:bCs/><w:iCs/>"), run(" end.")]),
    para([run("[T8] explicit on val=1: "), run("bold", '<w:b w:val="1"/>'), run(" end.")]),
    para([run("[T9] italic paragraph style off-toggle "), run("upright", '<w:i w:val="0"/>'), run(" back")], '<w:pStyle w:val="ItalicPara"/>'),
    para([run("* * *")], CENTER),
    para([run("[T10] no-gap para A.")], NOSPACE),
    para([run("[T11] no-gap para B.")], NOSPACE),
    para([run("[T12] underline "), run("under", '<w:u w:val="single"/>'), run(" and none "), run("noUnder", '<w:u w:val="none"/>'), run(" end.")]),
    para([run("[T13] last para.")]),
]

document = (
    f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W}><w:body>'
    + "".join(paras)
    + "<w:sectPr/></w:body></w:document>"
)

styles = (
    f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {W}>'
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>'
    '<w:pPr><w:spacing w:after="160"/></w:pPr></w:style>'
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>'
    '<w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>'
    '<w:style w:type="paragraph" w:styleId="ItalicPara"><w:name w:val="Italic Para"/><w:basedOn w:val="Normal"/>'
    "<w:rPr><w:i/></w:rPr></w:style>"
    "</w:styles>"
)

content_types = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    "</Types>"
)

rels = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    "</Relationships>"
)

doc_rels = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    "</Relationships>"
)

buf = BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document)
    z.writestr("word/styles.xml", styles)
    z.writestr("word/_rels/document.xml.rels", doc_rels)

out = sys.argv[1]
with open(out, "wb") as f:
    f.write(buf.getvalue())
print(len(buf.getvalue()), "bytes")
