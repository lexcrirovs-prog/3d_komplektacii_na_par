"""Compose original browser captures for visual review, without altering model imagery."""
from pathlib import Path
import json
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/performance'
OUT.mkdir(parents=True,exist_ok=True)
before=ROOT/'artifacts/qa/baseline'
after=ROOT/'artifacts/qa/chunked'
names={'overview':'Общий вид','cabinet':'Шкаф','instruments':'Приборы','cables':'Кабели','burner':'Горелка','feed-economizer':'Питание через экономайзер','feed-direct':'Прямое питание','economizer':'Экономайзер','all-modules':'Все модули','deaerator':'Деаэратор'}
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',24)
small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',17)
atlas=Image.new('RGB',(1380,5*310),'#f3f5f7')
stats=[]
for i,(name,label) in enumerate(names.items()):
    a=Image.open(before/(name+'.png')).convert('RGB')
    b=Image.open(after/(name+'.png')).convert('RGB')
    assert a.size==b.size
    pair=Image.new('RGB',(a.width*2,a.height+48),'white')
    pair.paste(a,(0,48));pair.paste(b,(a.width,48))
    d=ImageDraw.Draw(pair)
    d.text((18,10),label+' · ДО · 2026.09.08.4',font=font,fill='#344557')
    d.text((a.width+18,10),label+' · ПОСЛЕ · 2026.09.09.1',font=font,fill='#344557')
    pair.save(OUT/(name+'.png'))
    thumb=pair.copy();thumb.thumbnail((680,286),Image.Resampling.LANCZOS)
    atlas.paste(thumb,((i%2)*690,(i//2)*310+24))
    ImageDraw.Draw(atlas).text(((i%2)*690+8,(i//2)*310+3),label,font=small,fill='#344557')
    # Exclude the changed version caption. Numerical difference is descriptive only.
    diff=ImageChops.difference(a.crop((0,0,a.width,610)),b.crop((0,0,b.width,610)))
    stats.append({'view':name,'meanAbsoluteChannelDifference0to255':sum(ImageStat.Stat(diff).mean)/3})
atlas.save(OUT/'all-views.png')
(OUT/'visual-differences.json').write_text(json.dumps({'meaning':'Descriptive pixel differences; not a geometric tolerance or an automatic visual approval','views':stats},indent=2)+'\n',encoding='utf-8')
print(json.dumps(stats))
