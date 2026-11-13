"""Freeze preprocessing from existing reference artifacts without training any weights."""
import json
from pathlib import Path
from src.engine.registry import Registry
from src.engine.fusion import FusionVariant
r=Registry(Path('/models'))
r.load(FusionVariant())
if not r.ready: raise RuntimeError(r.error)
out={}
for name in ('cardiac','stress','sleep','suit'):
    a=getattr(r,name)
    if a is None: continue
    out[name]={'medians':a.medians,'center':a.scaler.center_.tolist(),'scale':a.scaler.scale_.tolist()}
Path('/output/preprocessing.json').write_text(json.dumps(out,indent=2,allow_nan=False)+'\n')
