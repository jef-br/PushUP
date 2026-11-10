import os,sys,numpy as np
sys.path.insert(0,''+os.path.dirname(os.path.abspath(__file__))+'')
from find_crops import reference
from rapidocr_onnxruntime import RapidOCR
o=RapidOCR();n=0;c=0
for f in sorted(os.listdir('bench/out/set')):
    r,_=o(np.array(reference('bench/out/set/'+f)))
    for b,t,s in (r or []):
        n+=1
        if float(s)>=.9 and len(t)>=4: c+=1
        if float(s)>=.7: print(f,round(float(s),2),repr(t))
print(n,c)
