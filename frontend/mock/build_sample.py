import json
from playwright.sync_api import sync_playwright
ids={"invoice_number":"inv","issue_date":"date","issue_time":"time","seller.legal_name":"seller_name","seller.vat_registration_number":"svat",
"buyer.legal_name":"buyer","buyer.vat_registration_number":"bvat","subtotal":"sub","vat_total":"vat","grand_total":"grand"}
for i in range(3):
    for k,s in (("description","d"),("quantity","q"),("unit_price","u"),("line_total","t")): ids[f"line_items[{i}].{k}"]=f"l{i}{s}"
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":794,"height":1123},device_scale_factor=2)
    pg.goto("file:///home/claude/work/frontend/mock/sample-invoice.html")
    ev={}
    for path,i in ids.items():
        r=pg.evaluate(f"(()=>{{const r=document.getElementById('{i}').getBoundingClientRect();return [r.top,r.left,r.bottom,r.right,document.getElementById('{i}').textContent]}})()")
        ev[path]=[{"page":1,"bbox":[round((r[0]-3)/1123,4),round((r[1]-4)/794,4),round((r[2]+3)/1123,4),round((r[3]+4)/794,4)],"raw_text":r[4],"engine":"pdfium-text","confidence":0.97}]
    q=pg.evaluate("(()=>{const r=document.querySelector('.qr').getBoundingClientRect();return [r.top,r.left,r.bottom,r.right]})()")
    ev["qr"]=[{"page":1,"bbox":[q[0]/1123,q[1]/794,q[2]/1123,q[3]/794],"raw_text":"","engine":"zxingcpp","confidence":0.99}]
    pg.screenshot(path="sample-invoice.png"); pg.pdf(path="sample-invoice.pdf",width="794px",height="1123px",print_background=True)
    json.dump(ev,open("evidence.json","w"),indent=1); b.close()
print(len(ev),"evidence boxes")
