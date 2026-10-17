#!/usr/bin/env python3
"""PawPi App Store + website screenshot builder.
Drop raw iPhone captures in raw/<key>.png (6.9" 1290x2796). Run: python3 build_shots.py
Outputs:
  out/appstore/<lang>/<size>/NN-key.png   -> store-ready framed + captioned
  out/website/clean/NN-key.png            -> rounded screenshot, no caption (web)
  out/website/device/NN-key.png           -> screenshot in a device bezel, transparent bg (web)
  out/website/framed/<lang>/NN-key.png     -> branded caption frame, web-friendly
  out/contact-<lang>.png                   -> contact sheet of the whole set
Missing captures fall back to a labelled placeholder so the set is always previewable.
"""
import os
from PIL import Image, ImageDraw, ImageFont
CREAM=(255,247,239); CARD=(255,252,248); INK=(59,36,27); CORAL=(255,111,97)
BORDER=(240,224,208); MUTED=(122,98,84); DEVICE=(28,22,18)
A=os.path.join(os.path.dirname(__file__),"assets")
EB=os.path.join(A,"Nunito-ExtraBold.ttf"); RG=os.path.join(A,"Nunito-Regular.ttf")
SIZES={"6.9":(1320,2868),"6.7":(1284,2778)}

SCREENS=[
 ("profile","El mundo de tu perro, en una sola app","Salud, momentos y comunidad — en un solo lugar",
           "Your dog's whole world, in one app","Health, moments & community — all in one place"),
 ("feed","Compartí cada momento","Patitas, ladridos y una racha que crece",
         "Share every wag","Paws, barks, and a streak that grows"),
 ("birthday","Cada cumpleaños, una celebración","Cintas, confeti y momentos para recordar",
             "Every birthday, a celebration","Ribbons, confetti & moments to remember"),
 ("share","Compartí sus mejores momentos","Tarjetas con estilo, listas para compartir",
          "Share their best moments","Beautiful cards, ready to share anywhere"),
 ("health","Comida, paseo y medicación, sin olvidos","Tu vista de Hoy muestra qué toca",
           "Never miss a meal, walk, or med","Your Today view shows what's due"),
 ("vet","Todo el historial veterinario, ordenado","Peso, vacunas, medicación y documentos",
        "Every vet record, organized","Weight, vaccines, meds & documents"),
 ("services","Reservá veterinarios, peluqueros y más","Proveedores de confianza, cerca tuyo",
             "Book trusted vets, groomers & more","Trusted providers, near you"),
 ("community","Encontrá tu comunidad canina","Foro, eventos y paseos con otros",
              "Find your local dog community","Forum, events & group walks"),
 ("adoption","Encontrá un nuevo mejor amigo","Perros para adoptar, cerca tuyo",
             "Find a new best friend","Dogs to adopt, near you"),
]

def wrap(draw,text,font,maxw):
    words=text.split(); lines=[]; cur=""
    for w in words:
        t=(cur+" "+w).strip()
        if draw.textlength(t,font=font)<=maxw: cur=t
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    return lines

def placeholder(idx,key,size=(1290,2796)):
    W,H=size; ph=Image.new("RGB",(W,H),CARD); d=ImageDraw.Draw(ph)
    paw=Image.open(os.path.join(A,"paw-coral.png")).convert("RGBA")
    paw=paw.resize((260,int(260*0.947)),Image.LANCZOS)
    ph.paste(paw,((W-paw.width)//2,int(H*0.34)),paw)
    f=ImageFont.truetype(EB,58); s=ImageFont.truetype(RG,42)
    t=f"{idx:02d} · {key}"; w=d.textlength(t,font=f); d.text(((W-w)//2,int(H*0.34)+300),t,font=f,fill=INK)
    t2="captura real va aquí"; w2=d.textlength(t2,font=s); d.text(((W-w2)//2,int(H*0.34)+380),t2,font=s,fill=MUTED)
    return ph

def rounded(img,rad):
    m=Image.new("L",img.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,img.size[0],img.size[1]],radius=rad,fill=255)
    out=Image.new("RGBA",img.size,(0,0,0,0)); out.paste(img.convert("RGB"),(0,0),m); return out

def caption_frame(shot,head,sub,size):
    W,H=size; c=Image.new("RGB",(W,H),CREAM); d=ImageDraw.Draw(c)
    paw=Image.open(os.path.join(A,"paw-coral.png")).convert("RGBA"); paw=paw.resize((130,int(130*0.947)),Image.LANCZOS)
    c.paste(paw,((W-paw.width)//2,int(H*0.052)),paw)
    f=ImageFont.truetype(EB,104); y=int(H*0.118)
    for ln in wrap(d,head,f,W-200):
        w=d.textlength(ln,font=f); d.text(((W-w)//2,y),ln,font=f,fill=INK); y+=118
    if sub:
        fs=ImageFont.truetype(RG,46)
        for ln in wrap(d,sub,fs,W-260):
            w=d.textlength(ln,font=fs); d.text(((W-w)//2,y+8),ln,font=fs,fill=MUTED); y+=58
    top=y+70; bottom=H-90; availh=bottom-top
    sc=min((W-260)/shot.width,availh/shot.height)
    sw,sh=int(shot.width*sc),int(shot.height*sc)
    sm=shot.resize((sw,sh),Image.LANCZOS); rad=int(sw*0.09)  # iOS-like corner radius (~9% of width), not squary
    px=(W-sw)//2; py=top
    m=Image.new("L",(sw,sh),0); ImageDraw.Draw(m).rounded_rectangle([0,0,sw,sh],radius=rad,fill=255)
    c.paste(sm,(px,py),m); d.rounded_rectangle([px,py,px+sw,py+sh],radius=rad,outline=BORDER,width=3)
    return c

def device_mock(shot):
    sw,sh=shot.size; bez=int(sw*0.035); rad=int(sw*0.09)
    W,H=sw+bez*2,sh+bez*2
    c=Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(c)
    d.rounded_rectangle([0,0,W,H],radius=rad+bez,fill=DEVICE)
    scr=rounded(shot,rad); c.paste(scr,(bez,bez),scr)
    return c

def load_or_placeholder(idx,key):
    R=os.path.join(os.path.dirname(__file__),"raw")
    p=os.path.join(R,f"{key}.png"); pn=os.path.join(R,f"{idx:02d}-{key}.png")
    for cand in (p,pn):
        if os.path.exists(cand): return Image.open(cand).convert("RGB"),True
    return placeholder(idx,key),False

def main():
    for sub in ["out/website/clean","out/website/device"]:
        os.makedirs(sub,exist_ok=True)
    for lang in ("es","en"):
        for s in SIZES: os.makedirs(f"out/appstore/{lang}/{s}",exist_ok=True)
        os.makedirs(f"out/website/framed/{lang}",exist_ok=True)
    real=0
    for i,(key,es_h,es_s,en_h,en_s) in enumerate(SCREENS,1):
        shot,isreal=load_or_placeholder(i,key); real+=isreal
        base=shot if shot.size[0]==1290 else shot.resize((1290,int(1290*shot.size[1]/shot.size[0])),Image.LANCZOS)
        # website: clean + device (from the 6.9 base)
        rounded(base,int(base.size[0]*0.09)).save(f"out/website/clean/{i:02d}-{key}.png")
        device_mock(base).save(f"out/website/device/{i:02d}-{key}.png")
        for lang,h,s in (("es",es_h,es_s),("en",en_h,en_s)):
            for szname,dim in SIZES.items():
                fit=base.resize((dim[0]-260, int((dim[0]-260)*base.size[1]/base.size[0])),Image.LANCZOS) if False else base
                caption_frame(base,h,s,dim).save(f"out/appstore/{lang}/{szname}/{i:02d}-{key}.png")
            caption_frame(base,h,s,(1290,2796)).save(f"out/website/framed/{lang}/{i:02d}-{key}.png")
    # contact sheets
    for lang in ("es","en"):
        thumbs=[Image.open(f"out/appstore/{lang}/6.9/{i:02d}-{k[0]}.png").resize((320,694),Image.LANCZOS) for i,k in enumerate(SCREENS,1)]
        cols=5; rows=2; pad=24
        cw=cols*320+pad*(cols+1); ch=rows*694+pad*(rows+1)
        sheet=Image.new("RGB",(cw,ch),CREAM)
        for idx,t in enumerate(thumbs):
            r,cx=divmod(idx,cols)
            sheet.paste(t,(pad+cx*(320+pad),pad+r*(694+pad)))
        sheet.save(f"out/contact-{lang}.png")
    print(f"done — {real}/9 real captures, rest placeholders. Outputs under out/")

if __name__=="__main__": main()
